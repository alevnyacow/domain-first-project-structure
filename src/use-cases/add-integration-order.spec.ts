import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { checkbox, confirm } from '@inquirer/prompts';
import { afterAll, expect, rstest, test } from '@rstest/core';
import { addIntegration } from './add-integration';

rstest.mock('@inquirer/prompts', () => ({
    Separator: class {
        constructor(readonly separator: string) {}
    },
    checkbox: rstest.fn(),
    confirm: rstest.fn(),
    input: rstest.fn(),
    select: rstest.fn()
}));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-integration-order-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('integration tests selected with Prisma and Vitest see their changes', async () => {
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    fs.writeFileSync(
        path.join(root, 'domain-first.project-structure.config.json'),
        JSON.stringify({
            rootFolder: 'src',
            domainFirstPackages: [],
            defaultPersistenceLayerImplementation: 'prisma',
            useReact: false
        })
    );
    rstest.spyOn(process, 'cwd').mockReturnValue(root);
    // Listed before its dependencies: the run order comes from the list
    rstest
        .mocked(checkbox)
        .mockImplementationOnce(async ({ choices }: any) =>
            [
                'Integration tests (Testcontainers, PostgreSQL) · backend',
                'Vitest · backend',
                'Prisma 8 (PostgreSQL, RC) · backend'
            ].map(
                (name) =>
                    choices.find((choice: any) => choice.name === name).value
            )
        );
    rstest
        .mocked(confirm)
        .mockImplementation(
            async ({ message }) => message === 'Overwrite them?'
        );
    const log = rstest.spyOn(console, 'log').mockImplementation(() => {});
    try {
        await addIntegration();
        expect(
            fs.readFileSync(
                path.join(root, 'specs/integration/global-setup.ts'),
                'utf8'
            )
        ).toContain('prisma db migrate');
        const output = stripVTControlCharacters(log.mock.lastCall?.[0]);
        expect(output).toContain(
            [
                'Run these commands to install the required dependencies:',
                'npm install @prisma/orm-postgres temporal-polyfill dotenv',
                'npm install --save-dev prisma @prisma/cli-engine vitest @vitest/coverage-v8 testcontainers',
                ''
            ].join('\n')
        );
        expect(output).not.toContain('Apply your migrations');
        expect(output).not.toContain('to test.exclude');
    } finally {
        log.mockRestore();
    }
});
