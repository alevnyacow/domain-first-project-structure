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
import { describeAgentCommand, executeAgentRequest } from './agent-cli';
import { type BackendConfig, ConfigFile } from './config-file';
import { discardPendingChanges, writePendingChanges } from './file-system';

rstest.mock('@inquirer/prompts', () => ({
    input: rstest.fn(() => {
        throw new Error('Unexpected interactive input');
    }),
    confirm: rstest.fn(() => {
        throw new Error('Unexpected interactive confirm');
    }),
    select: rstest.fn(() => {
        throw new Error('Unexpected interactive select');
    }),
    checkbox: rstest.fn(() => {
        throw new Error('Unexpected interactive checkbox');
    }),
    search: rstest.fn(() => {
        throw new Error('Unexpected interactive search');
    }),
    Separator: class {
        constructor(readonly separator: string) {}
    }
}));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-integration-tests-'));
let project: string;
let sequence = 0;
const read = (file: string) =>
    fs.readFileSync(path.join(project, file), 'utf8');
const exists = (file: string) => fs.existsSync(path.join(project, file));
const write = (file: string, content: string) => {
    const target = path.join(project, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
};
const config = () =>
    JSON.parse(read('domain-first.project-structure.config.json'));

const configure = (backend: Partial<BackendConfig> = {}) => {
    ConfigFile.write({
        project: { rootFolder: 'src' },
        backend: { domainFirstPackages: ['@domain-first/wire'], ...backend }
    });
    writePendingChanges();
};
const withIntegration = () =>
    write('specs/integration/vitest.config.ts', 'export default {}\n');

const scaffold = (request: Record<string, unknown>) =>
    executeAgentRequest('df-scaffold', { context: 'sales', ...request });

const querySpec =
    'specs/integration/sales/queries/prisma/prisma-orders-query.spec.ts';

/** Every relative import of a generated spec points to an existing file. */
const importsResolve = (file: string) => {
    for (const [, specifier] of read(file).matchAll(/from '(\.[^']+)'/g))
        expect(exists(path.join(path.dirname(file), `${specifier}.ts`))).toBe(
            true
        );
};

beforeEach(() => {
    project = path.join(root, String(sequence++));
    for (const context of ['sales', 'billing'])
        fs.mkdirSync(path.join(project, 'src/bounded-contexts', context), {
            recursive: true
        });
    write('package.json', '{}');
    write(
        'src/shared-kernel/wiring/env-branched-wire.ts',
        "import { branchedWire } from '@domain-first/wire'\nexport const envBranchedWire = branchedWire(() => 'development' as 'test' | 'development' | 'production')"
    );
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    configure();
    withIntegration();
});
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('a new saved type records the answer, and its implementations get an integration spec', async () => {
    const result = await scaffold({
        operation: 'query',
        name: 'orders',
        implementation: { type: 'prisma', save: true, integrationTests: true }
    });
    expect(result.files.created).toContain(querySpec);
    expect(config().backend.implementations.integrationTests).toEqual([
        'prisma'
    ]);
    expect(
        read(querySpec)
    ).toBe(`import { describe, test, expect } from 'vitest'
import { PrismaOrdersQuery } from '../../../../../src/bounded-contexts/sales/infrastructure/queries/prisma/prisma-orders-query'
import { wirePrismaImplementation as wirePrismaOrdersQuery } from '../../../../../src/bounded-contexts/sales/wiring/queries/wire-orders-query'

describe('orders query (prisma)', () => {
    test('can be wired', () => {
        expect(wirePrismaOrdersQuery()).toBeInstanceOf(PrismaOrdersQuery)
    })

    test.todo('works against the infrastructure')
})
`);
    importsResolve(querySpec);
    // Only the factory a spec builds is exported; the wire stays as it was.
    const wire = read(
        'src/bounded-contexts/sales/wiring/queries/wire-orders-query.ts'
    );
    expect(wire).toContain(
        'export const wirePrismaImplementation = wireClass(PrismaOrdersQuery, [])'
    );

    // The saved type needs no answer any more, and takes none.
    await scaffold({
        operation: 'command',
        name: 'ship',
        implementation: { type: 'prisma' }
    });
    expect(
        exists(
            'specs/integration/sales/commands/prisma/prisma-ship-command.spec.ts'
        )
    ).toBe(true);
    await expect(
        scaffold({
            operation: 'query',
            name: 'totals',
            implementation: { type: 'prisma', integrationTests: true }
        })
    ).rejects.toMatchObject({ code: 'UNUSED_PARAMETERS' });
});

test('a new type defaults to integration specs; false keeps it without them', async () => {
    await scaffold({
        operation: 'query',
        name: 'orders',
        implementation: { type: 'prisma', save: true }
    });
    expect(exists(querySpec)).toBe(true);
    expect(config().backend.implementations.integrationTests).toEqual([
        'prisma'
    ]);

    await scaffold({
        operation: 'query',
        name: 'totals',
        implementation: { type: 'mongo', save: true, integrationTests: false }
    });
    expect(exists('specs/integration/sales/queries/mongo')).toBe(false);
    expect(config().backend.implementations.integrationTests).toEqual([
        'prisma'
    ]);
    expect(
        read('src/bounded-contexts/sales/wiring/queries/wire-totals-query.ts')
    ).not.toContain('export const wireMongoImplementation');
});

test('a run-only type asks too, but remembers nothing', async () => {
    await scaffold({
        operation: 'query',
        name: 'orders',
        implementation: { type: 'prisma', integrationTests: true }
    });
    expect(exists(querySpec)).toBe(true);
    expect(config().backend.implementations).toBeUndefined();
});

test('test implementations and system types get no integration spec', async () => {
    configure({
        implementations: {
            queries: { primary: ['prisma'], test: [] },
            integrationTests: ['prisma']
        }
    });
    await expect(
        scaffold({
            operation: 'query',
            name: 'orders',
            implementation: { type: 'prisma' },
            testImplementation: { type: 'fake', integrationTests: true }
        })
    ).rejects.toMatchObject({ code: 'UNUSED_PARAMETERS' });
    await scaffold({
        operation: 'query',
        name: 'orders',
        implementation: { type: 'prisma' },
        testImplementation: { type: 'fake' }
    });
    expect(exists(querySpec)).toBe(true);
    expect(exists('specs/integration/sales/queries/fake')).toBe(false);

    // cross-context is generated only when listed by hand.
    await scaffold({
        operation: 'port',
        context: 'billing',
        name: 'order-refunds',
        implementation: { type: 'cross-context' }
    });
    expect(exists('specs/integration/billing')).toBe(false);
});

test('without the integration or wiring, nothing is generated or asked', async () => {
    fs.rmSync(path.join(project, 'specs'), { recursive: true });
    await expect(
        scaffold({
            operation: 'query',
            name: 'orders',
            implementation: { type: 'prisma', integrationTests: true }
        })
    ).rejects.toMatchObject({ code: 'UNUSED_PARAMETERS' });
    withIntegration();
    configure({
        domainFirstPackages: [],
        implementations: {
            queries: { primary: ['prisma'], test: [] },
            integrationTests: ['prisma']
        }
    });
    await scaffold({
        operation: 'query',
        name: 'orders',
        implementation: { type: 'prisma' }
    });
    expect(exists(querySpec)).toBe(false);
});

test('repositories and ports get theirs too', async () => {
    configure({ implementations: { integrationTests: ['prisma', 'stripe'] } });
    await scaffold({
        operation: 'aggregate',
        name: 'order',
        withRepository: true,
        implementation: { type: 'prisma' }
    });
    await scaffold({
        operation: 'port',
        name: 'payments',
        implementation: { type: 'stripe' }
    });
    const repository =
        'specs/integration/sales/repositories/prisma/prisma-order-repository.spec.ts';
    const port =
        'specs/integration/sales/application-adapters/stripe/stripe-payments.spec.ts';
    expect(read(repository)).toContain("describe('order repository (prisma)'");
    expect(read(port)).toContain(
        'expect(wireStripePayments()).toBeInstanceOf(StripePayments)'
    );
    importsResolve(repository);
    importsResolve(port);
});

test('New Implementation generates the spec of a primary implementation in any branch', async () => {
    configure({ implementations: { integrationTests: ['mongo'] } });
    await scaffold({
        operation: 'query',
        name: 'orders',
        implementation: { type: 'prisma', integrationTests: false }
    });
    await scaffold({
        operation: 'implementation',
        contract: 'query:orders',
        implementation: { type: 'mongo' },
        environments: ['production']
    });
    const mongoSpec =
        'specs/integration/sales/queries/mongo/mongo-orders-query.spec.ts';
    expect(read(mongoSpec)).toContain(
        'import { wireMongoImplementation as wireMongoOrdersQuery }'
    );
    importsResolve(mongoSpec);

    await scaffold({
        operation: 'implementation',
        contract: 'query:orders',
        implementation: { type: 'elastic', save: true, integrationTests: true },
        environments: ['development']
    });
    expect(
        exists(
            'specs/integration/sales/queries/elastic/elastic-orders-query.spec.ts'
        )
    ).toBe(true);
    expect(config().backend.implementations.integrationTests).toEqual([
        'mongo',
        'elastic'
    ]);

    // A test-only implementation takes no answer.
    await expect(
        scaffold({
            operation: 'implementation',
            contract: 'query:orders',
            implementation: { type: 'fake', integrationTests: true },
            environments: ['test']
        })
    ).rejects.toMatchObject({ code: 'UNUSED_PARAMETERS' });
});

test('integration specs move, rename and are deleted with their module', async () => {
    configure({ implementations: { integrationTests: ['prisma'] } });
    await scaffold({
        operation: 'query',
        name: 'orders',
        implementation: { type: 'prisma' }
    });

    await scaffold({
        operation: 'move',
        module: 'query:orders',
        name: 'customer-orders'
    });
    const renamed =
        'specs/integration/sales/queries/prisma/prisma-customer-orders-query.spec.ts';
    expect(exists(querySpec)).toBe(false);
    expect(read(renamed)).toContain(
        'expect(wirePrismaCustomerOrdersQuery()).toBeInstanceOf(PrismaCustomerOrdersQuery)'
    );
    expect(read(renamed)).toContain(
        "describe('customer orders query (prisma)'"
    );
    importsResolve(renamed);

    await scaffold({
        operation: 'move',
        module: 'query:customer-orders',
        targetContext: 'billing'
    });
    const moved =
        'specs/integration/billing/queries/prisma/prisma-customer-orders-query.spec.ts';
    expect(exists(moved)).toBe(true);
    expect(exists('specs/integration/sales')).toBe(false);
    importsResolve(moved);

    const deleted = await executeAgentRequest('df-scaffold', {
        operation: 'delete',
        context: 'billing',
        module: 'query:customer-orders'
    });
    expect(deleted.files.deleted).toContain(moved);
    expect(exists('specs/integration/billing')).toBe(false);
    expect(exists('specs/integration/vitest.config.ts')).toBe(true);
});

test('the integration asks for types and adds the missing specs of existing implementations', async () => {
    fs.rmSync(path.join(project, 'specs'), { recursive: true });
    configure({
        implementations: {
            queries: { primary: ['prisma'], test: [] },
            ports: { primary: ['stripe'], test: [] }
        }
    });
    await scaffold({
        operation: 'query',
        name: 'orders',
        implementation: { type: 'prisma' }
    });
    await scaffold({
        operation: 'port',
        name: 'payments',
        implementation: { type: 'stripe' }
    });
    expect(exists(querySpec)).toBe(false);

    const add = (request: Record<string, unknown> = {}) =>
        executeAgentRequest('df-integration', {
            operation: 'add',
            integrations: ['testcontainers'],
            ...request
        });
    await add({ integrationTestTypes: ['prisma'] });
    expect(exists(querySpec)).toBe(true);
    expect(exists('specs/integration/sales/application-adapters')).toBe(false);
    expect(config().backend.implementations.integrationTests).toEqual([
        'prisma'
    ]);

    // A rerun keeps the list and never replaces a spec.
    write(querySpec, '// edited');
    await add();
    expect(read(querySpec)).toBe('// edited');
    expect(config().backend.implementations.integrationTests).toEqual([
        'prisma'
    ]);
    await expect(
        add({ integrationTestTypes: ['unknown'] })
    ).rejects.toMatchObject({ code: 'INVALID_CHOICE' });
});

test('describe lists the integration spec of each implementation', async () => {
    configure({ implementations: { integrationTests: ['prisma'] } });
    await scaffold({
        operation: 'query',
        name: 'orders',
        implementation: { type: 'prisma' },
        testImplementation: { type: 'fake' }
    });
    const sales = describeAgentCommand('df-scaffold').project?.contexts.find(
        (context) => context.name === 'sales'
    );
    expect(sales?.contracts).toEqual([
        {
            id: 'query:orders',
            kind: 'query',
            implementations: ['fake', 'prisma'],
            integrationSpecs: [
                {
                    implementation: 'fake',
                    file: 'specs/integration/sales/queries/fake/fake-orders-query.spec.ts',
                    exists: false
                },
                {
                    implementation: 'prisma',
                    file: querySpec,
                    exists: true
                }
            ]
        }
    ]);
});

test('interactively, a new saved type asks once, defaulting to yes', async () => {
    const prompts = await import('@inquirer/prompts');
    const asked: string[] = [];
    const answers: Record<string, unknown> = {
        'Name: ': 'orders',
        'Query infrastructure implementation type:': 'prisma',
        'Add a test implementation for Query': false
    };
    const reply = async ({ message, default: fallback }: any) => {
        asked.push(message);
        if (message in answers) return answers[message];
        if (message === 'Query infrastructure implementation type:')
            return null;
        return fallback;
    };
    rstest.mocked(prompts.input).mockImplementation(reply);
    rstest.mocked(prompts.confirm).mockImplementation(reply);
    rstest.mocked(prompts.checkbox).mockImplementation(reply);
    // The type select picks "save for future use", the input names it.
    rstest.mocked(prompts.select).mockImplementation((async ({
        message
    }: any) => {
        asked.push(message);
        return null;
    }) as any);
    const { scaffoldNewQuery } = await import('./use-cases/scaffold-new-query');
    const { Folder } = await import('./file-system');
    await scaffoldNewQuery(
        new Folder(path.join(project, 'src/bounded-contexts/sales'))
    );
    writePendingChanges();
    expect(asked).toContain(
        'Generate integration tests for prisma implementations?'
    );
    expect(exists(querySpec)).toBe(true);
    expect(config().backend.implementations.integrationTests).toEqual([
        'prisma'
    ]);
});

test('an infrastructure service gets an integration spec only when asked', async () => {
    await scaffold({ operation: 'infrastructure-service', name: 'mailer' });
    expect(exists('specs/integration/sales/services')).toBe(false);

    const result = await scaffold({
        operation: 'infrastructure-service',
        name: 'cache',
        integrationSpec: true
    });
    const spec =
        'specs/integration/sales/services/cache-infrastructure-service.spec.ts';
    expect(result.files.created).toContain(spec);
    expect(read(spec)).toContain(
        "import { wireCacheInfrastructureService } from '../../../../src/bounded-contexts/sales/wiring/infrastructure-services/wire-cache-infrastructure-service'"
    );
    expect(read(spec)).toContain(
        'expect(wireCacheInfrastructureService()).toBeInstanceOf(CacheInfrastructureService)'
    );
    importsResolve(spec);

    await scaffold({
        operation: 'move',
        module: 'infrastructure-service:cache',
        name: 'store'
    });
    const renamed =
        'specs/integration/sales/services/store-infrastructure-service.spec.ts';
    expect(exists(spec)).toBe(false);
    expect(read(renamed)).toContain(
        'expect(wireStoreInfrastructureService()).toBeInstanceOf(StoreInfrastructureService)'
    );
    importsResolve(renamed);

    const deleted = await scaffold({
        operation: 'delete',
        module: 'infrastructure-service:store'
    });
    expect(deleted.files.deleted).toContain(renamed);

    fs.rmSync(path.join(project, 'specs'), { recursive: true });
    await expect(
        scaffold({
            operation: 'infrastructure-service',
            name: 'queue',
            integrationSpec: true
        })
    ).rejects.toMatchObject({ code: 'UNUSED_PARAMETERS' });
});

test('the integration exports the factories of existing wires, with custom branches too', async () => {
    fs.rmSync(path.join(project, 'specs'), { recursive: true });
    configure({
        envBranches: { names: ['qa', 'staging', 'prod'], test: 'qa' },
        implementations: { queries: { primary: ['prisma'], test: [] } }
    });
    await scaffold({
        operation: 'query',
        name: 'orders',
        implementation: { type: 'prisma' },
        testImplementation: { type: 'fake' }
    });
    const wirePath =
        'src/bounded-contexts/sales/wiring/queries/wire-orders-query.ts';
    expect(read(wirePath)).not.toContain('export const wirePrisma');

    await executeAgentRequest('df-integration', {
        operation: 'add',
        integrations: ['testcontainers'],
        integrationTestTypes: ['prisma']
    });
    expect(read(wirePath)).toContain(
        'export const wirePrismaImplementation = '
    );
    expect(read(wirePath)).toContain('\nconst wireFakeImplementation = ');
    expect(read(querySpec)).toContain(
        'expect(wirePrismaOrdersQuery()).toBeInstanceOf(PrismaOrdersQuery)'
    );
    importsResolve(querySpec);
});
