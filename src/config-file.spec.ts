import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { confirm } from '@inquirer/prompts';
import {
    afterAll,
    afterEach,
    beforeEach,
    expect,
    rstest,
    test
} from '@rstest/core';
import { ConfigFile, configFileName } from './config-file';
import {
    discardPendingChanges,
    File,
    filesToOverwrite,
    writePendingChanges
} from './file-system';
import {
    rememberImplementation,
    savedImplementations
} from './implementation-choices';
import { savePendingChanges } from './save-pending-changes';

rstest.mock('@inquirer/prompts', () => ({ confirm: rstest.fn() }));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'));
let project: string;
let sequence = 0;
const read = () =>
    JSON.parse(fs.readFileSync(path.join(project, configFileName), 'utf8'));
const write = (name: string, value: unknown) =>
    fs.writeFileSync(path.join(project, name), JSON.stringify(value));
beforeEach(() => {
    project = path.join(root, String(sequence++));
    fs.mkdirSync(project);
    write('package.json', {});
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
});
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('legacy flat settings migrate without changing files on read', async () => {
    const legacy = {
        rootFolder: 'src/server',
        domainFirstPackages: ['@domain-first/wire'],
        withInMemoryDb: true,
        testingLibrary: 'vitest',
        useReact: true,
        storybookFramework: '@storybook/react-vite',
        rules: { lint: { clock: false } },
        defaultPersistenceLayerImplementation: 'ignored'
    };
    write(configFileName, legacy);
    expect(ConfigFile.Instance.data).toMatchObject({
        project: { rootFolder: 'src/server' },
        backend: {
            domainFirstPackages: ['@domain-first/wire'],
            withInMemoryDb: true,
            testingLibrary: 'vitest',
            rules: legacy.rules
        },
        frontend: { react: { storybookFramework: '@storybook/react-vite' } }
    });
    expect(read()).toEqual(legacy);
    expect(filesToOverwrite()).toEqual([]);
    await savePendingChanges();
    expect(read()).toEqual(ConfigFile.Instance.data);
    expect(read()).not.toHaveProperty('rootFolder');
    expect(read()).not.toHaveProperty('defaultPersistenceLayerImplementation');
    expect(confirm).not.toHaveBeenCalled();
});

test('section and implementation updates preserve each other and unrelated settings', () => {
    ConfigFile.write({
        project: { rootFolder: 'src' },
        frontend: { svelte: { futureSetting: true } },
        backend: { domainFirstPackages: [], rules: { lint: { clock: false } } }
    });
    ConfigFile.update({
        backend: { ...ConfigFile.backend, testingLibrary: 'vitest' }
    });
    rememberImplementation('queries', 'primary', 'sql');
    ConfigFile.update({
        frontend: { ...ConfigFile.Instance.data.frontend, react: {} }
    });
    rememberImplementation('ports', 'test', 'fake');
    writePendingChanges();
    expect(read()).toEqual({
        project: { rootFolder: 'src' },
        backend: {
            domainFirstPackages: [],
            testingLibrary: 'vitest',
            rules: { lint: { clock: false } },
            implementations: {
                queries: { primary: ['sql'], test: [] },
                ports: { primary: [], test: ['fake'] }
            }
        },
        frontend: { svelte: { futureSetting: true }, react: {} }
    });
});

test('declined source overwrite discards config migration and saved choices together', async () => {
    const original = {
        rootFolder: 'src',
        domainFirstPackages: [],
        useReact: false
    };
    write(configFileName, original);
    fs.writeFileSync(path.join(project, 'source.ts'), 'original');
    rememberImplementation('ports', 'test', 'stub');
    new File(path.join(project, 'source.ts')).data = 'replacement';
    rstest.mocked(confirm).mockResolvedValueOnce(false);
    expect(await savePendingChanges()).toBe(false);
    expect(read()).toEqual(original);
    expect(savedImplementations('ports', 'test')).toEqual([]);
});

test('a deferred backend is distinct from an explicitly configured backend with no packages', () => {
    ConfigFile.write({ project: { rootFolder: 'src' } });
    expect(ConfigFile.Instance.data.backend).toBeUndefined();
    expect(() => ConfigFile.backend).toThrow('df-init --section backend');
    ConfigFile.update({ backend: { domainFirstPackages: [] } });
    expect(ConfigFile.backend.domainFirstPackages).toEqual([]);
});
