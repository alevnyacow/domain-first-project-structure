import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';
import {
    afterAll,
    afterEach,
    beforeEach,
    expect,
    rstest,
    test
} from '@rstest/core';
import { ConfigFile } from './config-file';
import {
    discardPendingChanges,
    File,
    Folder,
    filesToOverwrite,
    writePendingChanges
} from './file-system';
import {
    implementationChoicesFileName,
    implementationKinds,
    rememberImplementation,
    savedImplementations
} from './implementation-choices';
import { scaffoldInMemoryDb } from './in-memory-db';
import { savePendingChanges } from './save-pending-changes';
import {
    enterImplementationTypeOnce,
    implementationTypeEntryChoices,
    promptImplementationType
} from './use-cases/prompt-implementation-type';

rstest.mock('@inquirer/prompts', () => ({
    input: rstest.fn(),
    select: rstest.fn(),
    confirm: rstest.fn()
}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-choices-'));
let project: string;
let sequence = 0;
const catalogPath = () => path.join(project, implementationChoicesFileName);
beforeEach(() => {
    project = path.join(root, String(sequence++));
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, 'package.json'), '{}');
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    ConfigFile.write({
        project: { rootFolder: 'src' },
        backend: { domainFirstPackages: [] }
    });
    writePendingChanges();
    rstest.mocked(select).mockReset();
    rstest.mocked(input).mockReset();
    rstest.mocked(confirm).mockReset();
});
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('repository custom labels persist only when the run is saved and appear in the next menu', async () => {
    rstest.mocked(select).mockResolvedValueOnce(null);
    rstest.mocked(input).mockResolvedValueOnce('  mongo  ');
    expect(
        await promptImplementationType(
            'Repository implementation:',
            'repositories'
        )
    ).toEqual({ label: 'mongo', saveForFutureUse: true });
    expect(rstest.mocked(select).mock.calls[0][0].choices).toEqual([
        {
            name: 'Enter implementation type and save for future use',
            value: null
        },
        {
            name: 'Enter implementation type for this run only',
            value: enterImplementationTypeOnce
        }
    ]);
    expect(savedImplementations('repositories', 'primary')).toEqual(['mongo']);
    expect(
        JSON.parse(fs.readFileSync(catalogPath(), 'utf8')).backend
            .implementations
    ).toBeUndefined();
    expect(filesToOverwrite()).toEqual([]);
    writePendingChanges();
    expect(
        JSON.parse(fs.readFileSync(catalogPath(), 'utf8')).backend
            .implementations
    ).toEqual({
        repositories: { primary: ['mongo'], test: [] }
    });
    rstest.mocked(select).mockResolvedValueOnce('mongo');
    expect(
        await promptImplementationType(
            'Repository implementation:',
            'repositories'
        )
    ).toEqual({ label: 'mongo', saveForFutureUse: true });
    expect(rstest.mocked(select).mock.calls[1][0].default).toBe('mongo');
    expect(input).toHaveBeenCalledTimes(1);
});

test('kinds and primary/test choices stay separate and existing data is preserved', () => {
    for (const kind of implementationKinds) {
        rememberImplementation(kind, 'primary', `${kind}-storage`);
        rememberImplementation(kind, 'test', `${kind}-stub`);
        rememberImplementation(kind, 'primary', `${kind}-storage`);
    }
    writePendingChanges();
    for (const kind of implementationKinds) {
        expect(savedImplementations(kind, 'primary')).toEqual([
            `${kind}-storage`
        ]);
        expect(savedImplementations(kind, 'test')).toEqual([`${kind}-stub`]);
    }
    rememberImplementation('ports', 'primary', 's3');
    expect(filesToOverwrite()).toEqual([]);
    writePendingChanges();
    expect(savedImplementations('ports', 'primary')).toEqual([
        'ports-storage',
        's3'
    ]);
    expect(savedImplementations('repositories', 'primary')).toEqual([
        'repositories-storage'
    ]);
});

test('test custom labels reappear in test menus without leaking into primary menus', async () => {
    rstest.mocked(select).mockResolvedValueOnce(null);
    rstest.mocked(input).mockResolvedValueOnce('stub');
    await promptImplementationType('Test adapter:', 'ports', {
        purpose: 'test'
    });
    writePendingChanges();
    rstest.mocked(select).mockResolvedValueOnce('stub');
    await promptImplementationType('Test adapter:', 'ports', {
        purpose: 'test'
    });
    expect(rstest.mocked(select).mock.calls[1][0].default).toBe('stub');
    rstest.mocked(select).mockResolvedValueOnce(enterImplementationTypeOnce);
    rstest.mocked(input).mockResolvedValueOnce('temporary');
    await promptImplementationType('Adapter:', 'ports');
    expect(rstest.mocked(select).mock.calls[2][0].choices).not.toContainEqual({
        name: 'stub',
        value: 'stub',
        disabled: false
    });
    expect(savedImplementations('queries', 'test')).toEqual([]);
});

test('system choices do not create a catalog, and invalid custom labels are rejected', async () => {
    rstest
        .mocked(select)
        .mockResolvedValueOnce('cross-context')
        .mockResolvedValueOnce(null);
    await promptImplementationType('Adapter:', 'ports', { crossContext: true });
    expect(ConfigFile.Instance.data.backend?.implementations).toBeUndefined();
    rstest.mocked(input).mockResolvedValueOnce('redis');
    await promptImplementationType('Adapter:', 'ports', { existing: ['s3'] });
    const validate = rstest.mocked(input).mock.calls[0][0].validate!;
    for (const label of ['s3', '', 'Dynamo', 'cross-context', '../outside'])
        expect(await validate(label)).not.toBe(true);
    expect(await validate('redis')).toBe(true);
});

test('saved choices are deduplicated, disabled when already implemented, and cross-context stays conditional', async () => {
    fs.writeFileSync(
        catalogPath(),
        JSON.stringify({
            ...ConfigFile.Instance.data,
            backend: {
                ...ConfigFile.backend,
                implementations: {
                    ports: {
                        primary: ['s3', 's3', 'cross-context'],
                        test: ['stub']
                    },
                    queries: { primary: ['cross-context'], test: [] }
                }
            }
        })
    );
    rstest
        .mocked(select)
        .mockResolvedValueOnce(enterImplementationTypeOnce)
        .mockResolvedValueOnce(enterImplementationTypeOnce)
        .mockResolvedValueOnce(enterImplementationTypeOnce);
    rstest.mocked(input).mockResolvedValue('temporary');
    await promptImplementationType('Port:', 'ports', { existing: ['s3'] });
    expect(rstest.mocked(select).mock.calls[0][0].choices).toEqual([
        { name: 's3', value: 's3', disabled: true },
        ...implementationTypeEntryChoices
    ]);
    await promptImplementationType('Port:', 'ports', { crossContext: true });
    expect(rstest.mocked(select).mock.calls[1][0].choices).toContainEqual({
        name: 'System: cross-context (calls handlers in another bounded context)',
        value: 'cross-context',
        disabled: false
    });
    await promptImplementationType('Query:', 'queries');
    expect(rstest.mocked(select).mock.calls[2][0].choices).toEqual([
        ...implementationTypeEntryChoices
    ]);
});

test('new implementation menus combine roles without prematurely saving a new label', async () => {
    rememberImplementation('repositories', 'primary', 'mongo');
    rememberImplementation('repositories', 'test', 'stub');
    writePendingChanges();
    rstest.mocked(select).mockResolvedValueOnce(null);
    rstest.mocked(input).mockResolvedValueOnce('dynamo');
    await promptImplementationType('Implementation:', 'repositories', {
        purpose: 'all',
        remember: false
    });
    expect(rstest.mocked(select).mock.calls[0][0].choices).toEqual([
        { name: 'mongo', value: 'mongo', disabled: false },
        { name: 'stub', value: 'stub', disabled: false },
        ...implementationTypeEntryChoices
    ]);
    expect(savedImplementations('repositories', 'primary')).toEqual(['mongo']);
});

test('cancelling an overwrite also cancels the catalog update', async () => {
    rememberImplementation('repositories', 'primary', 'mongo');
    writePendingChanges();
    const original = fs.readFileSync(catalogPath(), 'utf8');
    const existing = path.join(project, 'existing.ts');
    fs.writeFileSync(existing, 'original');
    rememberImplementation('repositories', 'primary', 'dynamo');
    new File(existing).data = 'replacement';
    rstest.mocked(confirm).mockResolvedValueOnce(false);
    expect(await savePendingChanges()).toBe(false);
    expect(fs.readFileSync(catalogPath(), 'utf8')).toBe(original);
    expect(savedImplementations('repositories', 'primary')).toEqual(['mongo']);
    expect(fs.readFileSync(existing, 'utf8')).toBe('original');
});

test('malformed catalog data fails before prompts or writes', async () => {
    for (const source of [
        '{',
        '{"repositories":{"primary":["../bad"]}}',
        '{"unknown":{"primary":[]}}'
    ]) {
        const content =
            source === '{'
                ? source
                : JSON.stringify({
                      project: { rootFolder: 'src' },
                      backend: {
                          domainFirstPackages: [],
                          implementations: JSON.parse(source)
                      }
                  });
        fs.writeFileSync(catalogPath(), content);
        await expect(
            promptImplementationType('Implementation:', 'repositories')
        ).rejects.toThrow();
        expect(fs.readFileSync(catalogPath(), 'utf8')).toBe(content);
    }
    expect(select).not.toHaveBeenCalled();
});

for (const kind of implementationKinds) {
    for (const purpose of ['primary', 'test'] as const) {
        test(`one-off ${kind} ${purpose} labels are returned without being remembered`, async () => {
            rstest
                .mocked(select)
                .mockResolvedValueOnce(enterImplementationTypeOnce);
            rstest.mocked(input).mockResolvedValueOnce('temporary');
            expect(
                await promptImplementationType('Implementation:', kind, {
                    purpose
                })
            ).toEqual({ label: 'temporary', saveForFutureUse: false });
            writePendingChanges();
            expect(
                ConfigFile.Instance.data.backend?.implementations
            ).toBeUndefined();
            expect(savedImplementations(kind, purpose)).toEqual([]);
        });
    }
}

test('one-off labels leave an existing catalog unchanged', async () => {
    rememberImplementation('repositories', 'primary', 'mongo');
    writePendingChanges();
    const original = fs.readFileSync(catalogPath(), 'utf8');
    rstest.mocked(select).mockResolvedValueOnce(enterImplementationTypeOnce);
    rstest.mocked(input).mockResolvedValueOnce('temporary');
    await promptImplementationType('Implementation:', 'repositories');
    writePendingChanges();
    expect(fs.readFileSync(catalogPath(), 'utf8')).toBe(original);
});

for (const kind of implementationKinds) {
    for (const purpose of ['primary', 'test', 'all'] as const) {
        test(`empty ${kind} ${purpose} menus have no ordinary presets or suggested names`, async () => {
            rstest
                .mocked(select)
                .mockResolvedValueOnce(enterImplementationTypeOnce);
            rstest.mocked(input).mockResolvedValueOnce('temporary');
            await promptImplementationType('Implementation:', kind, {
                purpose
            });
            expect(rstest.mocked(select).mock.calls[0][0].choices).toEqual([
                ...implementationTypeEntryChoices
            ]);
            expect(rstest.mocked(select).mock.calls[0][0].default).toBe(null);
            expect(rstest.mocked(input).mock.calls[0][0].default).toBe('');
        });
    }
}

test('api, mock and inactive in-memory are ordinary saved types', async () => {
    for (const label of ['api', 'mock', 'in-memory'])
        rememberImplementation('queries', 'primary', label);
    writePendingChanges();
    rstest.mocked(select).mockResolvedValueOnce('api');
    await promptImplementationType('Implementation:', 'queries');
    expect(rstest.mocked(select).mock.calls[0][0].choices).toEqual([
        { name: 'api', value: 'api', disabled: false },
        { name: 'mock', value: 'mock', disabled: false },
        { name: 'in-memory', value: 'in-memory', disabled: false },
        ...implementationTypeEntryChoices
    ]);
});

for (const wire of [false, true]) {
    test(`in-memory is explicitly marked as a system type only for supported kinds with the DB ready, wire ${wire}`, async () => {
        ConfigFile.write({
            project: { rootFolder: 'src' },
            backend: {
                domainFirstPackages: wire ? ['@domain-first/wire'] : [],
                withInMemoryDb: true
            }
        });
        scaffoldInMemoryDb(new Folder(path.join(project, 'src/shared-kernel')));
        for (const kind of implementationKinds) {
            for (const purpose of ['primary', 'test', 'all'] as const) {
                rstest
                    .mocked(select)
                    .mockResolvedValueOnce(
                        kind === 'ports'
                            ? enterImplementationTypeOnce
                            : 'in-memory'
                    );
                rstest.mocked(input).mockResolvedValue('temporary');
                await promptImplementationType('Implementation:', kind, {
                    purpose
                });
                expect(
                    rstest.mocked(select).mock.lastCall?.[0].choices
                ).toEqual([
                    ...(kind === 'ports'
                        ? []
                        : [
                              {
                                  name: 'System: in-memory (uses the shared in-memory database)',
                                  value: 'in-memory',
                                  disabled: false
                              }
                          ]),
                    ...implementationTypeEntryChoices
                ]);
            }
        }
        expect(
            ConfigFile.Instance.data.backend?.implementations
        ).toBeUndefined();
    });
}

test('in-memory is not a system choice when its DB integration is incomplete', async () => {
    ConfigFile.write({
        project: { rootFolder: 'src' },
        backend: {
            domainFirstPackages: ['@domain-first/wire'],
            withInMemoryDb: true
        }
    });
    const service = new File(
        path.join(
            project,
            'src/shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts'
        )
    );
    service.data = 'export class InMemoryDbInfrastructureService {}';
    rstest.mocked(select).mockResolvedValueOnce(enterImplementationTypeOnce);
    rstest.mocked(input).mockResolvedValueOnce('temporary');
    await promptImplementationType('Implementation:', 'repositories');
    expect(rstest.mocked(select).mock.calls[0][0].choices).toEqual([
        ...implementationTypeEntryChoices
    ]);
});

test('a saved in-memory type keeps its system marker when the DB is active, without duplication', async () => {
    ConfigFile.write({
        project: { rootFolder: 'src' },
        backend: { domainFirstPackages: [], withInMemoryDb: true }
    });
    scaffoldInMemoryDb(new Folder(path.join(project, 'src/shared-kernel')));
    rememberImplementation('queries', 'primary', 'in-memory');
    writePendingChanges();
    const original = fs.readFileSync(catalogPath(), 'utf8');
    rstest.mocked(select).mockResolvedValueOnce('in-memory');
    await promptImplementationType('Implementation:', 'queries');
    expect(rstest.mocked(select).mock.calls[0][0].choices).toEqual([
        {
            name: 'System: in-memory (uses the shared in-memory database)',
            value: 'in-memory',
            disabled: false
        },
        ...implementationTypeEntryChoices
    ]);
    writePendingChanges();
    expect(fs.readFileSync(catalogPath(), 'utf8')).toBe(original);
});
