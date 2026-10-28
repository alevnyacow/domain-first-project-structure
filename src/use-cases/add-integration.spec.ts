import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { checkbox, confirm, Separator } from '@inquirer/prompts';
import { afterAll, expect, rstest, test } from '@rstest/core';
import { ConfigFile } from '../config-file';
import { File, writePendingChanges } from '../file-system';
import { addPrisma, addStorybook, inMemoryDbApplied } from '../integrations';
import { addIntegration } from './add-integration';

rstest.mock('@inquirer/prompts', () => ({
    Separator: class {
        constructor(readonly separator: string) {}
    },
    checkbox: rstest.fn(),
    confirm: rstest.fn()
}));
rstest.mock('../integrations', () => ({
    addStorybook: rstest.fn(),
    addPrisma: rstest.fn(),
    addRestEndpointGenerator: rstest.fn(),
    addInMemoryDb: rstest.fn(),
    restEndpointGeneratorApplied: rstest.fn(() => false),
    inMemoryDbApplied: rstest.fn(() => false),
    openapiScriptPath: 'scripts/generate-openapi.ts'
}));
rstest.mock('../config-file', () => ({
    ConfigFile: {
        Instance: {
            data: {
                rootFolder: 'src',
                domainFirstPackages: [],
                useReact: false
            }
        }
    }
}));

const pick = (...names: string[]) =>
    rstest
        .mocked(checkbox)
        .mockImplementationOnce(async ({ choices }: any) =>
            names.map(
                (name) =>
                    choices.find((choice: any) => choice.name === name).value
            )
        );
const pickFirst = () => pick('Storybook (React + Vite) · frontend');
const choiceNames = async () => {
    let names: string[] = [];
    rstest.mocked(checkbox).mockImplementationOnce(async ({ choices }: any) => {
        names = choices.map((choice: any) =>
            choice instanceof Separator ? `-- ${choice.separator}` : choice.name
        );
        return [];
    });
    await addIntegration();
    return names;
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-integration-'));
fs.writeFileSync(path.join(root, 'package.json'), '{}');
rstest.spyOn(process, 'cwd').mockReturnValue(root);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('standalone use case writes files before reporting next steps', async () => {
    const filePath = path.join(root, 'created.ts');
    pickFirst();
    rstest.mocked(addStorybook).mockImplementationOnce(async () => {
        new File(filePath).data = 'created';
        return [
            'npm install vitest',
            'Add !shared-kernel/prisma in your linter.'
        ];
    });
    const log = rstest.spyOn(console, 'log').mockImplementation(() => {
        expect(fs.readFileSync(filePath, 'utf8')).toBe('created');
    });
    try {
        await addIntegration();
        expect(log).toHaveBeenCalledTimes(1);
        expect(stripVTControlCharacters(log.mock.calls[0][0])).toBe(
            [
                'Run this command to install the required dependencies:',
                'npm install vitest',
                '',
                'Additional information:',
                'Add !shared-kernel/prisma in your linter.'
            ].join('\n')
        );
    } finally {
        log.mockRestore();
    }
});

test('cancelled overwrite discards changes and suppresses next steps', async () => {
    const filePath = path.join(root, 'existing.ts');
    fs.writeFileSync(filePath, 'original');
    pickFirst();
    rstest.mocked(confirm).mockResolvedValueOnce(false);
    rstest.mocked(addStorybook).mockImplementationOnce(async () => {
        new File(filePath).data = 'replacement';
        return ['Run npm install'];
    });
    const log = rstest.spyOn(console, 'log').mockImplementation(() => {});
    try {
        await addIntegration();
        writePendingChanges();
        expect(fs.readFileSync(filePath, 'utf8')).toBe('original');
        expect(log).toHaveBeenLastCalledWith('Cancelled: nothing was written.');
    } finally {
        log.mockRestore();
    }
});

test('offers OpenAPI and Orval with @domain-first/handlers-rest', async () => {
    const log = rstest.spyOn(console, 'log').mockImplementation(() => {});
    const orval = 'Orval (API client) · frontend';
    const config = ConfigFile.Instance.data as {
        domainFirstPackages: string[];
        useReact: boolean;
    };
    try {
        config.useReact = true;
        expect(await choiceNames()).not.toContain('OpenAPI · backend');
        expect(await choiceNames()).not.toContain(orval);
        config.domainFirstPackages.push('@domain-first/handlers-rest');
        config.useReact = false;
        expect(await choiceNames()).toContain('OpenAPI · backend');
        expect(await choiceNames()).toContain(orval);
    } finally {
        log.mockRestore();
    }
});

test('runs selected integrations in list order and merges install commands', async () => {
    const calls: string[] = [];
    pick(
        'Prisma 8 (PostgreSQL, RC) · backend',
        'Storybook (React + Vite) · frontend'
    );
    rstest.mocked(addStorybook).mockImplementationOnce(async () => {
        calls.push('storybook');
        return [
            'npm install --save-dev storybook vite dotenv',
            'npm install react'
        ];
    });
    rstest.mocked(addPrisma).mockImplementationOnce(async () => {
        calls.push('prisma');
        return [
            'npm install dotenv',
            'npm install --save-dev prisma vite',
            'Add !src/shared-kernel/infrastructure/prisma in your linter.'
        ];
    });
    const log = rstest.spyOn(console, 'log').mockImplementation(() => {});
    try {
        await addIntegration();
        expect(calls).toEqual(['storybook', 'prisma']);
        expect(stripVTControlCharacters(log.mock.calls[0][0])).toBe(
            [
                'Run this command to install the required dependencies:',
                'npm install react dotenv && npm install --save-dev storybook vite prisma',
                '',
                'Additional information:',
                'Add !src/shared-kernel/infrastructure/prisma in your linter.'
            ].join('\n')
        );
    } finally {
        log.mockRestore();
    }
});

test('lists new and applied integrations apart, each labeled with its group', async () => {
    const log = rstest.spyOn(console, 'log').mockImplementation(() => {});
    const config = ConfigFile.Instance.data as {
        domainFirstPackages: string[];
    };
    config.domainFirstPackages.splice(
        0,
        config.domainFirstPackages.length,
        '@domain-first/handlers-rest'
    );
    try {
        expect(await choiceNames()).toEqual([
            '-- New integrations',
            'REST endpoint generator · backend',
            'In-memory DB · backend',
            'Prisma 8 (PostgreSQL, RC) · backend',
            'Vitest · backend',
            'Integration tests (Testcontainers, PostgreSQL) · backend',
            'OpenAPI · backend',
            'Storybook (React + Vite) · frontend',
            'Playwright · frontend',
            'Orval (API client) · frontend'
        ]);
        fs.writeFileSync(path.join(root, 'vitest.config.ts'), '');
        fs.writeFileSync(path.join(root, 'playwright.config.ts'), '');
        rstest.mocked(inMemoryDbApplied).mockReturnValueOnce(true);
        const names = await choiceNames();
        expect(
            names.slice(
                names.indexOf('-- Already applied (select to reapply)') + 1
            )
        ).toEqual([
            'In-memory DB · backend',
            'Vitest · backend',
            'Playwright · frontend'
        ]);
        expect(
            names.indexOf('Prisma 8 (PostgreSQL, RC) · backend')
        ).toBeLessThan(names.indexOf('-- Already applied (select to reapply)'));
    } finally {
        fs.rmSync(path.join(root, 'vitest.config.ts'), { force: true });
        fs.rmSync(path.join(root, 'playwright.config.ts'), { force: true });
        log.mockRestore();
    }
});
