import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    afterAll,
    afterEach,
    beforeEach,
    expect,
    rstest,
    test
} from '@rstest/core';
import { planUpgrade, type UpgradeStep } from './upgrade-steps';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-upgrade-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
let project: string;
let sequence = 0;
const manifest = (dependencies: Record<string, string> = {}) =>
    fs.writeFileSync(
        path.join(project, 'package.json'),
        JSON.stringify({ dependencies })
    );
beforeEach(() => {
    project = path.join(root, String(sequence++));
    fs.mkdirSync(project);
    manifest();
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
});
afterEach(() => {
    rstest.restoreAllMocks();
});

const flat = {
    rootFolder: 'src/server',
    domainFirstPackages: ['@domain-first/wire'],
    withInMemoryDb: true,
    testingLibrary: 'vitest',
    useReact: true,
    storybookFramework: '@storybook/react-vite',
    defaultPersistenceLayerImplementation: 'prisma',
    rules: { lint: { clock: false } }
};

test('a 7.x config becomes sectioned, with an explicit framework and saved persistence types', async () => {
    manifest({ next: '16.0.0' });
    const { planned, changed, config } = await planUpgrade(flat);
    expect(changed).toBe(true);
    expect(planned.map(({ step }) => step.id)).toEqual([
        'config-sections',
        'react-framework',
        'persistence-default'
    ]);
    expect(config).toEqual({
        project: { rootFolder: 'src/server' },
        backend: {
            domainFirstPackages: ['@domain-first/wire'],
            withInMemoryDb: true,
            testingLibrary: 'vitest',
            rules: { lint: { clock: false } },
            implementations: {
                repositories: { primary: ['prisma'], test: [] },
                commands: { primary: ['prisma'], test: [] },
                queries: { primary: ['prisma'], test: [] }
            }
        },
        frontend: {
            react: {
                storybookFramework: '@storybook/react-vite',
                framework: 'next'
            }
        }
    });
    expect(planned[1].changes).toEqual([
        'frontend.react.framework: "next" (next is in package.json)'
    ]);
});

test('without next and React, the framework is react and there is no frontend', async () => {
    expect(
        (await planUpgrade({ ...flat, useReact: true })).config?.frontend
    ).toEqual({
        react: {
            storybookFramework: '@storybook/react-vite',
            framework: 'react'
        }
    });
    const { config, planned } = await planUpgrade({ ...flat, useReact: false });
    expect(config).not.toHaveProperty('frontend');
    expect(planned.map(({ step }) => step.id)).not.toContain('react-framework');
});

test('an invalid persistence label is dropped instead of saved', async () => {
    const { config, planned } = await planUpgrade({
        ...flat,
        defaultPersistenceLayerImplementation: 'My DB'
    });
    expect(config?.backend).not.toHaveProperty('implementations');
    expect(config?.backend).not.toHaveProperty(
        'defaultPersistenceLayerImplementation'
    );
    expect(planned.at(-1)?.changes[0]).toContain('is removed');
});

test('a current config needs nothing, so the command can run again', async () => {
    const first = await planUpgrade(flat);
    const second = await planUpgrade(first.config);
    expect(second).toEqual({ planned: [], changed: false, config: undefined });
});

test('a current React config without a framework only gets the framework', async () => {
    const { planned, config } = await planUpgrade({
        project: { rootFolder: 'src' },
        frontend: { react: {} }
    });
    expect(planned.map(({ step }) => step.id)).toEqual(['react-framework']);
    expect(config?.frontend?.react?.framework).toBe('react');
});

test('declined optional steps are skipped; manual steps change nothing', async () => {
    const optional: UpgradeStep = {
        id: 'optional',
        kind: 'optional',
        title: 'Optional',
        detect: () => true,
        plan: () => ['change'],
        apply: (context) => {
            context.config.applied = true;
        }
    };
    const manual: UpgradeStep = {
        id: 'manual',
        kind: 'manual',
        title: 'Manual',
        detect: () => true,
        plan: () => ['do it yourself']
    };
    const current = { project: { rootFolder: 'src' } };
    const declined = await planUpgrade(current, () => false, [
        optional,
        manual
    ]);
    expect(declined.changed).toBe(false);
    expect(declined.planned.map(({ step }) => step.id)).toEqual(['manual']);
    const accepted = await planUpgrade(current, () => true, [optional, manual]);
    expect(accepted.config).toMatchObject({ applied: true });
});
