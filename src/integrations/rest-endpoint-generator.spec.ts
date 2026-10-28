import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { confirm } from '@inquirer/prompts';
import { afterAll, afterEach, expect, rstest, test } from '@rstest/core';
import {
    discardPendingChanges,
    filesToOverwrite,
    writePendingChanges
} from '../file-system';
import {
    addInMemoryDb,
    addRestEndpointGenerator,
    inMemoryDbApplied,
    restEndpointGeneratorApplied
} from './index';

rstest.mock('@inquirer/prompts', () => ({
    confirm: rstest.fn(),
    select: rstest.fn(),
    input: rstest.fn()
}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-rest-generator-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
let sequence = 0;
const setup = (
    domainFirstPackages: string[],
    dependencies: Record<string, string> = {}
) => {
    const project = path.join(root, String(sequence++));
    fs.mkdirSync(project);
    fs.writeFileSync(
        path.join(project, 'package.json'),
        JSON.stringify({ dependencies })
    );
    fs.writeFileSync(
        path.join(project, 'domain-first.project-structure.config.json'),
        JSON.stringify({
            rootFolder: 'src',
            domainFirstPackages,
            defaultPersistenceLayerImplementation: 'prisma',
            useReact: false
        })
    );
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    return project;
};
const read = (project: string, file: string) =>
    fs.readFileSync(path.join(project, file), 'utf8');
const generatorPath =
    'src/shared-kernel/presentation/services/rest-endpoint-generator-presentation-service.ts';

test('without next, scaffolds the generator with an adapter placeholder and no route', async () => {
    const project = setup(['@domain-first/handlers-rest']);
    expect(await addRestEndpointGenerator()).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
    writePendingChanges();
    expect(read(project, generatorPath)).toContain(
        'const adapter = undefined as unknown as Adapter'
    );
    expect(fs.existsSync(path.join(project, 'app'))).toBe(false);
    expect(restEndpointGeneratorApplied()).toBe(true);
});

test('with the Next adapter, scaffolds the catch-all route and reports handlers-next', async () => {
    const project = setup(['@domain-first/handlers-rest'], { next: '16' });
    rstest.mocked(confirm).mockResolvedValueOnce(true);
    expect(await addRestEndpointGenerator()).toEqual([
        'npm i @domain-first/handlers-next'
    ]);
    writePendingChanges();
    expect(read(project, generatorPath)).toContain(
        "import { nextAdapter } from '@domain-first/handlers-next'"
    );
    const route = read(project, 'app/api/[...path]/route.ts');
    expect(route).toContain('const handler = nextEndpoints([])');
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(route).toContain(`export const ${method} = handler`);
    }
});

test('with wiring, the route serves restHandlers and warns until the first endpoint', async () => {
    const project = setup(
        ['@domain-first/handlers-rest', '@domain-first/wire'],
        { next: '16', '@domain-first/handlers-next': '2' }
    );
    rstest.mocked(confirm).mockResolvedValueOnce(true);
    expect(await addRestEndpointGenerator()).toEqual([
        'app/api/[...path]/route.ts serves restHandlers from src/presentation/rest/index.ts, which appears with the first REST endpoint — generate one with df-scaffold (Presentation → New Handlers-REST Endpoint) and the route compiles'
    ]);
    writePendingChanges();
    const route = read(project, 'app/api/[...path]/route.ts');
    expect(route).toContain(
        "import { restHandlers } from '../../../src/presentation/rest'"
    );
    expect(route).toContain('const handler = nextEndpoints(restHandlers)');
    expect(fs.existsSync(path.join(project, 'src/presentation/rest'))).toBe(
        false
    );
});

test('with wiring and endpoints, the route in src/app serves restHandlers', async () => {
    const project = setup(
        ['@domain-first/handlers-rest', '@domain-first/wire'],
        { next: '16', '@domain-first/handlers-next': '2' }
    );
    fs.mkdirSync(path.join(project, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(project, 'src/presentation/rest'), {
        recursive: true
    });
    fs.writeFileSync(path.join(project, 'src/presentation/rest/index.ts'), '');
    rstest.mocked(confirm).mockResolvedValueOnce(true);
    expect(await addRestEndpointGenerator()).toEqual([]);
    writePendingChanges();
    const route = read(project, 'src/app/api/[...path]/route.ts');
    expect(route).toContain(
        "import { restHandlers } from '../../../presentation/rest'"
    );
    expect(route).toContain('const handler = nextEndpoints(restHandlers)');
});

test('reapplying keeps the edited generator and route', async () => {
    const project = setup(['@domain-first/handlers-rest'], {
        next: '16',
        '@domain-first/handlers-next': '2'
    });
    for (const file of [generatorPath, 'app/api/[...path]/route.ts']) {
        fs.mkdirSync(path.dirname(path.join(project, file)), {
            recursive: true
        });
        fs.writeFileSync(path.join(project, file), 'edited');
    }
    rstest.mocked(confirm).mockResolvedValueOnce(true);
    expect(await addRestEndpointGenerator()).toEqual([
        'the existing endpoint generator was kept — pass nextAdapter from @domain-first/handlers-next to its createEndpoint calls'
    ]);
    expect(filesToOverwrite()).toEqual([]);
    writePendingChanges();
    expect(read(project, generatorPath)).toBe('edited');
    expect(read(project, 'app/api/[...path]/route.ts')).toBe('edited');
});

test('in-memory DB turns on withInMemoryDb and adds only its missing wire', () => {
    const project = setup(['@domain-first/wire']);
    const servicePath =
        'src/shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts';
    fs.mkdirSync(path.dirname(path.join(project, servicePath)), {
        recursive: true
    });
    fs.writeFileSync(path.join(project, servicePath), 'edited');
    expect(inMemoryDbApplied()).toBe(false);
    expect(addInMemoryDb()).toEqual([]);
    expect(filesToOverwrite()).toEqual([
        path.join(project, 'domain-first.project-structure.config.json')
    ]);
    writePendingChanges();
    expect(read(project, servicePath)).toBe('edited');
    expect(
        read(
            project,
            'src/shared-kernel/wiring/infrastructure-services/wire-in-memory-db-infrastructure-service.ts'
        )
    ).toContain('InMemoryDbInfrastructureService');
    expect(
        JSON.parse(read(project, 'domain-first.project-structure.config.json'))
            .withInMemoryDb
    ).toBe(true);
    expect(inMemoryDbApplied()).toBe(true);
});
