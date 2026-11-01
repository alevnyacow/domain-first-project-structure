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
import { ConfigFile, ConfigOutdatedError, configFileName } from './config-file';
import {
    discardPendingChanges,
    File,
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

test('a config of an earlier major version is refused, never rewritten', async () => {
    const legacy = {
        rootFolder: 'src',
        domainFirstPackages: ['@domain-first/wire'],
        useReact: true
    };
    write(configFileName, legacy);
    expect(ConfigFile.outdated).toBe(true);
    expect(() => ConfigFile.Instance).toThrow(ConfigOutdatedError);
    expect(() => ConfigFile.Instance).toThrow('run npx df-upgrade');
    expect(await savePendingChanges()).toBe(true);
    expect(read()).toEqual(legacy);
});

test('a current config is not outdated', () => {
    write(configFileName, { project: { rootFolder: 'src' } });
    expect(ConfigFile.outdated).toBe(false);
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

test('declined source overwrite discards saved choices together with source', async () => {
    const original = {
        project: { rootFolder: 'src' },
        backend: { domainFirstPackages: [] }
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
