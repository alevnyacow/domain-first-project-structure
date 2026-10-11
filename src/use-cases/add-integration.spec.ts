import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { confirm, select } from '@inquirer/prompts';
import { afterAll, expect, rstest, test } from '@rstest/core';
import { ConfigFile } from '../config-file';
import { File, writePendingChanges } from '../file-system';
import { addStorybook } from '../integrations';
import { addIntegration } from './add-integration';

rstest.mock('@inquirer/prompts', () => ({
    select: rstest.fn(),
    confirm: rstest.fn()
}));
rstest.mock('../integrations', () => ({
    addStorybook: rstest.fn(),
    addPrisma: rstest.fn(),
    missingDomainFirstPackages: rstest.fn()
}));
rstest.mock('../config-file', () => ({
    ConfigFile: {
        Instance: { data: { domainFirstPackages: [], useReact: false } }
    }
}));

const pickFirst = () =>
    rstest
        .mocked(select)
        .mockImplementationOnce(async ({ choices }: any) => choices[0].value);
const choiceNames = async () => {
    let names: string[] = [];
    rstest.mocked(select).mockImplementationOnce(async ({ choices }: any) => {
        names = choices.map((choice: { name: string }) => choice.name);
        return { run: () => [] };
    });
    await addIntegration();
    return names;
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-integration-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('standalone use case writes files before reporting next steps', async () => {
    const filePath = path.join(root, 'created.ts');
    pickFirst();
    rstest.mocked(addStorybook).mockImplementationOnce(async () => {
        new File(filePath).data = 'created';
        return ['npm install vitest', 'Add !shared/prisma in your linter.'];
    });
    const log = rstest.spyOn(console, 'log').mockImplementation(() => {
        expect(fs.readFileSync(filePath, 'utf8')).toBe('created');
    });
    try {
        await addIntegration();
        expect(log).toHaveBeenCalledTimes(1);
        expect(stripVTControlCharacters(log.mock.calls[0][0])).toBe(
            [
                'Run these commands to install the required dependencies:',
                'npm install vitest',
                '',
                'Additional information:',
                'Add !shared/prisma in your linter.'
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

test('offers OpenAPI with @domain-first/handlers-rest and Orval also with React', async () => {
    const log = rstest.spyOn(console, 'log').mockImplementation(() => {});
    const orval = 'Orval (React Query client)';
    const config = ConfigFile.Instance.data as {
        domainFirstPackages: string[];
        useReact: boolean;
    };
    try {
        config.useReact = true;
        expect(await choiceNames()).not.toContain('OpenAPI');
        expect(await choiceNames()).not.toContain(orval);
        config.domainFirstPackages.push('@domain-first/handlers-rest');
        config.useReact = false;
        expect(await choiceNames()).toContain('OpenAPI');
        expect(await choiceNames()).not.toContain(orval);
        config.useReact = true;
        expect(await choiceNames()).toContain(orval);
    } finally {
        log.mockRestore();
    }
});
