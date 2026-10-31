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
import {
    ConfigFile,
    configFileName,
    legacyImplementationChoicesFileName
} from './config-file';
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

test('legacy flat settings and choices migrate together without changing files on read', async () => {
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
    write(legacyImplementationChoicesFileName, {
        repositories: { primary: ['mongo'], test: ['stub'] }
    });
    expect(ConfigFile.Instance.data).toMatchObject({
        project: { rootFolder: 'src/server' },
        backend: {
            domainFirstPackages: ['@domain-first/wire'],
            withInMemoryDb: true,
            testingLibrary: 'vitest',
            implementations: {
                repositories: { primary: ['mongo'], test: ['stub'] }
            },
            rules: legacy.rules
        },
        frontend: { react: { storybookFramework: '@storybook/react-vite' } }
    });
    expect(read()).toEqual(legacy);
    expect(
        fs.existsSync(path.join(project, legacyImplementationChoicesFileName))
    ).toBe(true);
    expect(filesToOverwrite()).toEqual([]);
    await savePendingChanges();
    expect(read()).toEqual(ConfigFile.Instance.data);
    expect(read()).not.toHaveProperty('rootFolder');
    expect(read()).not.toHaveProperty('defaultPersistenceLayerImplementation');
    expect(
        fs.existsSync(path.join(project, legacyImplementationChoicesFileName))
    ).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
});

test('coexisting implementation lists merge per role, deduplicate and preserve current ordering', () => {
    write(configFileName, {
        project: { rootFolder: 'src' },
        implementations: { ports: { primary: ['s3', 'mongo'], test: ['fake'] } }
    });
    write(legacyImplementationChoicesFileName, {
        ports: { primary: ['mongo', 'redis'], test: ['stub', 'fake'] },
        queries: { primary: ['sql'] }
    });
    expect(savedImplementations('ports', 'primary')).toEqual([
        's3',
        'mongo',
        'redis'
    ]);
    rememberImplementation('repositories', 'test', 'stub');
    writePendingChanges();
    expect(read().backend.implementations).toEqual({
        ports: { primary: ['s3', 'mongo', 'redis'], test: ['fake', 'stub'] },
        queries: { primary: ['sql'], test: [] },
        repositories: { primary: [], test: ['stub'] }
    });
    ConfigFile.migrate();
    expect(filesToOverwrite()).toEqual([]);
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

test('previous root-level settings migrate into backend, preserving nested overrides and other sections', async () => {
    const previous = {
        project: { rootFolder: 'src' },
        backend: {
            domainFirstPackages: [],
            implementations: { ports: { primary: ['s3', 'mongo'], test: [] } },
            rules: { lint: { clock: true }, dependencies: { queries: [] } }
        },
        frontend: { react: {} },
        implementations: {
            ports: { primary: ['mongo', 'redis'], test: ['stub'] }
        },
        rules: {
            lint: { clock: false, layers: false },
            dependencies: { queries: ['domain-services'], commands: [] }
        }
    };
    write(configFileName, previous);
    expect(ConfigFile.Instance.data.backend?.implementations?.ports).toEqual({
        primary: ['s3', 'mongo', 'redis'],
        test: ['stub']
    });
    expect(read()).toEqual(previous);
    await savePendingChanges();
    expect(read()).not.toHaveProperty('rules');
    expect(read()).not.toHaveProperty('implementations');
    expect(read().backend.rules).toEqual({
        lint: { clock: true, layers: false },
        dependencies: { queries: [], commands: [] }
    });
    expect(read().backend.implementations.ports).toEqual({
        primary: ['s3', 'mongo', 'redis'],
        test: ['stub']
    });
    expect(read().frontend).toEqual(previous.frontend);
    expect(read().project).toEqual(previous.project);
});

test('declined source overwrite discards config changes and legacy-file deletion together', async () => {
    const original = {
        rootFolder: 'src',
        domainFirstPackages: [],
        useReact: false
    };
    write(configFileName, original);
    write(legacyImplementationChoicesFileName, { ports: { primary: ['s3'] } });
    fs.writeFileSync(path.join(project, 'source.ts'), 'original');
    rememberImplementation('ports', 'test', 'stub');
    new File(path.join(project, 'source.ts')).data = 'replacement';
    rstest.mocked(confirm).mockResolvedValueOnce(false);
    expect(await savePendingChanges()).toBe(false);
    expect(read()).toEqual(original);
    expect(
        fs.existsSync(path.join(project, legacyImplementationChoicesFileName))
    ).toBe(true);
    expect(savedImplementations('ports', 'test')).toEqual([]);
});

test('malformed legacy history prevents migration without overwriting or deleting it', () => {
    const config = { project: { rootFolder: 'src' } };
    write(configFileName, config);
    write(legacyImplementationChoicesFileName, {
        queries: { primary: ['../invalid'] }
    });
    expect(() => ConfigFile.migrate()).toThrow(
        `Invalid ${legacyImplementationChoicesFileName}`
    );
    writePendingChanges();
    expect(read()).toEqual(config);
    expect(
        fs.existsSync(path.join(project, legacyImplementationChoicesFileName))
    ).toBe(true);
});

test('a deferred backend is distinct from an explicitly configured backend with no packages', () => {
    ConfigFile.write({ project: { rootFolder: 'src' } });
    expect(ConfigFile.Instance.data.backend).toBeUndefined();
    expect(() => ConfigFile.backend).toThrow('df-init --section backend');
    ConfigFile.update({ backend: { domainFirstPackages: [] } });
    expect(ConfigFile.backend.domainFirstPackages).toEqual([]);
});
