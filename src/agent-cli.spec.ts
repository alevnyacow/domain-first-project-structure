import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import {
    afterAll,
    afterEach,
    beforeEach,
    expect,
    rstest,
    test
} from '@rstest/core';
import {
    agentError,
    describeAgentCommand,
    executeAgentRequest
} from './agent-cli';
import { ConfigFile, configFileName } from './config-file';
import {
    discardPendingChanges,
    Folder,
    writePendingChanges
} from './file-system';
import { scaffoldInMemoryDb } from './in-memory-db';
import { lintProject } from './project-lint';

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
    Separator: class {
        constructor(readonly separator: string) {}
    }
}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-agent-'));
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
const service = (owner: string, name: string) => {
    const suffix =
        owner === 'shared-kernel'
            ? 'shared-kernel'
            : `bounded-contexts/${owner}`;
    write(
        `src/${suffix}/infrastructure/services/${name.toLowerCase()}-infrastructure-service.ts`,
        `export class ${name}InfrastructureService {}`
    );
    write(
        `src/${suffix}/wiring/infrastructure-services/wire-${name.toLowerCase()}-infrastructure-service.ts`,
        `import { wireClass } from '@domain-first/wire'\nimport { ${name}InfrastructureService } from '../../infrastructure/services/${name.toLowerCase()}-infrastructure-service'\nexport const wire${name}InfrastructureService = wireClass(${name}InfrastructureService, [])`
    );
};
const query = {
    operation: 'query',
    context: 'sales',
    name: 'orders',
    implementation: { type: 'prisma' }
};
const queryFile =
    'src/bounded-contexts/sales/application/queries/orders-query.ts';
const adapterFile =
    'src/bounded-contexts/sales/infrastructure/queries/prisma/prisma-orders-query.ts';
beforeEach(() => {
    project = path.join(root, String(sequence++));
    fs.mkdirSync(project);
    write('package.json', '{}');
    for (const context of ['sales', 'billing'])
        fs.mkdirSync(path.join(project, 'src/bounded-contexts', context), {
            recursive: true
        });
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    ConfigFile.write({
        project: { rootFolder: 'src' },
        backend: {
            domainFirstPackages: ['@domain-first/wire'],
            withInMemoryDb: true
        },
        frontend: { react: { framework: 'next' } }
    });
    scaffoldInMemoryDb(new Folder(path.join(project, 'src/shared-kernel')));
    writePendingChanges();
    write(
        'src/shared-kernel/wiring/env-branched-wire.ts',
        "import { branchedWire } from '@domain-first/wire'\nexport const envBranchedWire = branchedWire(() => 'development' as 'test' | 'development' | 'production')"
    );
    service('shared-kernel', 'Prisma');
    rstest.clearAllMocks();
});
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('JSON query creation uses qualified dependency IDs and returns changed files without prompting', async () => {
    const original = read(configFileName);
    const result = await executeAgentRequest('df-scaffold', {
        ...query,
        dependencies: {
            PrismaOrdersQuery: ['shared-kernel:PrismaInfrastructureService']
        }
    });
    expect(result.ok).toBe(true);
    expect(result.files.created).toContain(queryFile);
    expect(result.files.created).toContain(adapterFile);
    expect(read(adapterFile)).toContain(
        'private readonly prismaInfrastructureService: PrismaInfrastructureService'
    );
    expect(read(configFileName)).toBe(original);
    expect(lintProject(project, 'src')).toEqual([]);
    for (const prompt of [input, select, confirm, checkbox])
        expect(prompt).not.toHaveBeenCalled();
});

test('dry run previews generated code and saved choices without writing either', async () => {
    const original = read(configFileName);
    const result = await executeAgentRequest('df-scaffold', {
        ...query,
        implementation: { type: 'prisma', save: true },
        dryRun: true
    });
    expect(result.dryRun).toBe(true);
    expect(result.files.created).toContain(queryFile);
    expect(result.files.updated).toContain(configFileName);
    expect(exists(queryFile)).toBe(false);
    expect(read(configFileName)).toBe(original);
    await executeAgentRequest('df-scaffold', {
        ...query,
        implementation: { type: 'prisma', save: true }
    });
    expect(ConfigFile.backend.implementations?.queries?.primary).toEqual([
        'prisma'
    ]);
});

test('invalid dependencies roll back source and implementation history staged before validation', async () => {
    const original = read(configFileName);
    await expect(
        executeAgentRequest('df-scaffold', {
            ...query,
            implementation: { type: 'redis', save: true },
            dependencies: {
                RedisOrdersQuery: ['billing:SecretInfrastructureService']
            }
        })
    ).rejects.toMatchObject({ code: 'INVALID_CHOICE' });
    expect(exists(queryFile)).toBe(false);
    expect(
        exists(
            'src/bounded-contexts/sales/infrastructure/queries/redis/redis-orders-query.ts'
        )
    ).toBe(false);
    expect(read(configFileName)).toBe(original);
});

test('unused dependency keys cannot silently produce incompletely wired modules', async () => {
    await expect(
        executeAgentRequest('df-scaffold', {
            ...query,
            dependencies: { TypoOrdersQuery: [] }
        })
    ).rejects.toMatchObject({ code: 'UNUSED_PARAMETERS' });
    expect(exists(queryFile)).toBe(false);
});

test('overwrites require explicit opt-in and an error leaves existing files and config intact', async () => {
    await executeAgentRequest('df-scaffold', query);
    write(queryFile, '// user edit');
    const original = read(configFileName);
    await expect(
        executeAgentRequest('df-scaffold', {
            ...query,
            implementation: { type: 'prisma', save: true }
        })
    ).rejects.toMatchObject({ code: 'OVERWRITE_REQUIRED' });
    expect(read(queryFile)).toBe('// user edit');
    expect(read(configFileName)).toBe(original);
    const preview = await executeAgentRequest('df-scaffold', {
        ...query,
        dryRun: true
    });
    expect(preview.overwriteRequired).toContain(queryFile);
    expect(read(queryFile)).toBe('// user edit');
    await executeAgentRequest('df-scaffold', { ...query, overwrite: true });
    expect(read(queryFile)).toContain('abstract class OrdersQuery');
});

for (const request of [
    { ...query, implementation: undefined },
    { ...query, name: '../escape' },
    { ...query, typo: true }
]) {
    test(`invalid requests fail before writing: ${JSON.stringify(request)}`, async () => {
        await expect(
            executeAgentRequest('df-scaffold', request)
        ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
        expect(exists(queryFile)).toBe(false);
    });
}

test('reserved cross-context implementations retain the port-only boundary', async () => {
    await expect(
        executeAgentRequest('df-scaffold', {
            ...query,
            implementation: { type: 'cross-context' }
        })
    ).rejects.toMatchObject({ code: 'INVALID_IMPLEMENTATION' });
    await executeAgentRequest('df-scaffold', {
        operation: 'query',
        context: 'billing',
        name: 'invoice',
        implementation: { type: 'sql' }
    });
    const result = await executeAgentRequest('df-scaffold', {
        operation: 'port',
        context: 'sales',
        name: 'billing-gateway',
        implementation: { type: 'cross-context' },
        dependencies: { CrossContextBillingGateway: ['billing:InvoiceQuery'] }
    });
    expect(
        result.files.created.some((file) =>
            file.includes('application-adapters/cross-context')
        )
    ).toBe(true);
    expect(
        read(
            'src/bounded-contexts/sales/infrastructure/application-adapters/cross-context/cross-context-billing-gateway.ts'
        )
    ).toContain('BillingInvoiceQuery');
    expect(lintProject(project, 'src')).toEqual([]);
});

test('description exposes schemas, context IDs and actual dependency choices', async () => {
    await executeAgentRequest('df-scaffold', query);
    const description = describeAgentCommand('df-scaffold');
    expect(
        JSON.parse(JSON.stringify(description)).requestSchema
    ).toHaveProperty('$schema');
    const sales = description.project!.contexts.find(
        (context) => context.name === 'sales'
    )!;
    expect(sales.contracts).toContainEqual({
        id: 'query:orders',
        kind: 'query',
        implementations: ['prisma']
    });
    expect(sales.modules[0].id).toBe('sales:OrdersQuery');
    expect(sales.modules[0].implementations[0].target).toBe(
        'sales:OrdersQuery:PrismaOrdersQuery'
    );
    expect(sales.modules[0].implementations[0].dependencies).not.toContain(
        'billing:PrismaInfrastructureService'
    );
    expect(
        description
            .project!.contexts.find(
                (context) => context.name === 'shared-kernel'
            )!
            .modules.some(
                (module) =>
                    module.id === 'shared-kernel:PrismaInfrastructureService'
            )
    ).toBe(true);
});

test('new test implementations keep their environment-specific history and wiring', async () => {
    await executeAgentRequest('df-scaffold', query);
    await executeAgentRequest('df-scaffold', {
        operation: 'implementation',
        context: 'sales',
        contract: 'query:orders',
        implementation: { type: 'fake', save: true },
        environments: ['test']
    });
    expect(ConfigFile.backend.implementations?.queries?.test).toEqual(['fake']);
    expect(ConfigFile.backend.implementations?.queries?.primary).toEqual([]);
    expect(
        read('src/bounded-contexts/sales/wiring/queries/wire-orders-query.ts')
    ).toContain('test: wireFakeImplementation');
});

test('React requests support nested names and moving generated modules', async () => {
    const created = await executeAgentRequest('df-react', {
        operation: 'widget',
        name: 'admin/orders'
    });
    expect(created.files.created).toContain(
        'src/presentation/react/widgets/admin/orders/admin-orders-widget.tsx'
    );
    const moved = await executeAgentRequest('df-react', {
        operation: 'move-widget',
        module: 'admin/orders',
        name: 'backoffice/orders'
    });
    expect(moved.files.deleted).toContain(
        'src/presentation/react/widgets/admin/orders/admin-orders-widget.tsx'
    );
    expect(
        exists(
            'src/presentation/react/widgets/backoffice/orders/backoffice-orders-widget.tsx'
        )
    ).toBe(true);
});

test('Next.js pages get an App Router route that renders the page component', async () => {
    const result = await executeAgentRequest('df-react', {
        operation: 'page',
        name: 'admin/users'
    });
    expect(result.files.created).toEqual([
        'app/admin/users/page.tsx',
        'src/presentation/react/pages/admin/admin-users-page.tsx'
    ]);
    expect(
        read('app/admin/users/page.tsx')
    ).toBe(`import { AdminUsersPage } from '../../../src/presentation/react/pages/admin/admin-users-page'

export default function Page() {
    return <AdminUsersPage />
}`);
    await executeAgentRequest('df-react', {
        operation: 'move-page',
        module: 'admin/users',
        name: 'backoffice/users',
        moveRoute: false
    });
    expect(read('app/admin/users/page.tsx')).toContain(
        "import { BackofficeUsersPage } from '../../../src/presentation/react/pages/backoffice/backoffice-users-page'"
    );
    expect(read('app/admin/users/page.tsx')).toContain(
        'return <BackofficeUsersPage />'
    );
});

test('moving a Next.js page moves its route files; child routes stay', async () => {
    await executeAgentRequest('df-react', {
        operation: 'page',
        name: 'admin/users'
    });
    write('app/admin/users/layout.tsx', 'export default function Layout() {}');
    write('app/admin/users/[id]/page.tsx', 'export default function User() {}');
    const preview = await executeAgentRequest('df-react', {
        operation: 'move-page',
        module: 'admin/users',
        name: 'backoffice/users',
        dryRun: true
    });
    expect(preview.files.deleted).toEqual(
        expect.arrayContaining([
            'app/admin/users/page.tsx',
            'app/admin/users/layout.tsx'
        ])
    );
    await executeAgentRequest('df-react', {
        operation: 'move-page',
        module: 'admin/users',
        name: 'backoffice/users'
    });
    expect(exists('app/admin/users/page.tsx')).toBe(false);
    expect(exists('app/admin/users/layout.tsx')).toBe(false);
    expect(exists('app/admin/users/[id]/page.tsx')).toBe(true);
    expect(read('app/backoffice/users/layout.tsx')).toBe(
        'export default function Layout() {}'
    );
    expect(
        read('app/backoffice/users/page.tsx')
    ).toBe(`import { BackofficeUsersPage } from '../../../src/presentation/react/pages/backoffice/backoffice-users-page'

export default function Page() {
    return <BackofficeUsersPage />
}`);
});

test('an emptied route folder is removed, and a taken target route is never replaced', async () => {
    await executeAgentRequest('df-react', {
        operation: 'page',
        name: 'orders'
    });
    await executeAgentRequest('df-react', {
        operation: 'move-page',
        module: 'orders',
        name: 'purchases'
    });
    expect(exists('app/orders')).toBe(false);
    expect(exists('app/purchases/page.tsx')).toBe(true);

    await executeAgentRequest('df-react', { operation: 'page', name: 'carts' });
    write('app/baskets/page.tsx', 'custom route');
    const result = await executeAgentRequest('df-react', {
        operation: 'move-page',
        module: 'carts',
        name: 'baskets'
    });
    expect(read('app/baskets/page.tsx')).toBe('custom route');
    expect(read('app/carts/page.tsx')).toContain('BasketsPage');
    expect(result.messages).toContain(
        'app/baskets/page.tsx already exists: the route app/carts stays.'
    );
    // A route at the page path that doesn't render the page isn't its route.
    await expect(
        executeAgentRequest('df-react', {
            operation: 'move-page',
            module: 'baskets',
            name: 'trolleys',
            moveRoute: true
        })
    ).rejects.toMatchObject({ code: 'UNUSED_PARAMETERS' });
    await executeAgentRequest('df-react', {
        operation: 'move-page',
        module: 'baskets',
        name: 'trolleys'
    });
    expect(read('app/baskets/page.tsx')).toBe('custom route');
});

test('Next.js pages use src/app when it exists and keep an existing route', async () => {
    write('src/app/layout.tsx', 'export default function Layout() {}');
    write('src/app/orders/page.tsx', 'custom route');
    const result = await executeAgentRequest('df-react', {
        operation: 'page',
        name: 'orders'
    });
    expect(result.files.created).toEqual([
        'src/presentation/react/pages/orders-page.tsx'
    ]);
    expect(read('src/app/orders/page.tsx')).toBe('custom route');
    expect(result.messages).toEqual([
        'src/app/orders/page.tsx already exists: render OrdersPage there yourself.'
    ]);
});

test('plain React pages get no Next.js route', async () => {
    ConfigFile.update({ frontend: { react: { framework: 'react' } } });
    writePendingChanges();
    const result = await executeAgentRequest('df-react', {
        operation: 'page',
        name: 'orders'
    });
    expect(result.files.created).toEqual([
        'src/presentation/react/pages/orders-page.tsx'
    ]);
});

test('integration requests use stable IDs and the real Storybook integration', async () => {
    const result = await executeAgentRequest('df-integration', {
        operation: 'add',
        integrations: ['storybook']
    });
    expect(result.files.created).toContain(
        'src/presentation/react/.storybook/main.ts'
    );
    expect(ConfigFile.Instance.data.frontend?.react?.framework).toBe('next');
    expect(ConfigFile.Instance.data.frontend?.react?.storybookFramework).toBe(
        '@storybook/react-vite'
    );
    expect(JSON.parse(read('package.json')).scripts.storybook).toContain(
        'storybook dev'
    );
    expect(
        result.nextSteps.some((step) => step.includes('@storybook/react-vite'))
    ).toBe(true);
});

test('integration script conflicts require a supplied decision and fail before saving', async () => {
    write(
        'package.json',
        JSON.stringify({ scripts: { storybook: 'custom command' } })
    );
    await expect(
        executeAgentRequest('df-integration', {
            operation: 'add',
            integrations: ['storybook']
        })
    ).rejects.toMatchObject({ code: 'MISSING_PARAMETER' });
    expect(exists('src/presentation/react/.storybook/main.ts')).toBe(false);
    await executeAgentRequest('df-integration', {
        operation: 'add',
        integrations: ['storybook'],
        scriptConflicts: { storybook: 'keep' }
    });
    expect(JSON.parse(read('package.json')).scripts.storybook).toBe(
        'custom command'
    );
});

test('REST integration and endpoint creation use the same handler wiring as interactive mode', async () => {
    ConfigFile.update({
        backend: {
            ...ConfigFile.backend,
            domainFirstPackages: [
                '@domain-first/wire',
                '@domain-first/handlers-rest'
            ]
        }
    });
    writePendingChanges();
    await executeAgentRequest('df-integration', {
        operation: 'add',
        integrations: ['rest-endpoint-generator'],
        nextAdapter: true
    });
    await executeAgentRequest('df-scaffold', query);
    const result = await executeAgentRequest('df-scaffold', {
        operation: 'endpoint',
        context: 'sales',
        controller: 'orders',
        method: 'get',
        path: ':id',
        handler: 'sales:OrdersQuery'
    });
    expect(
        result.files.created.some((file) =>
            file.endsWith('orders-_id_-get-endpoint.ts')
        )
    ).toBe(true);
    expect(
        read(
            'src/bounded-contexts/sales/wiring/presentation/rest/orders/wire-orders-_id_-get-endpoint.ts'
        )
    ).toContain('wireOrdersQuery');
    const barrel =
        'src/bounded-contexts/sales/wiring/presentation/rest/orders/index.ts';
    const original = read(barrel);
    const repeated = await executeAgentRequest('df-scaffold', {
        operation: 'endpoint',
        context: 'sales',
        controller: 'orders',
        method: 'get',
        path: ':id',
        handler: 'sales:OrdersQuery'
    });
    expect(read(barrel)).toBe(original);
    expect(repeated.files.updated).toEqual([]);
});

test('endpoints without a controller live in the (root) controller', async () => {
    ConfigFile.update({
        backend: {
            ...ConfigFile.backend,
            domainFirstPackages: [
                '@domain-first/wire',
                '@domain-first/handlers-rest'
            ]
        }
    });
    writePendingChanges();
    await executeAgentRequest('df-integration', {
        operation: 'add',
        integrations: ['rest-endpoint-generator'],
        nextAdapter: true
    });
    await executeAgentRequest('df-scaffold', query);
    const endpoint = (fields: Record<string, string>) =>
        executeAgentRequest('df-scaffold', {
            operation: 'endpoint',
            context: 'sales',
            method: 'get',
            handler: 'sales:OrdersQuery',
            ...fields
        });
    for (const path of ['', ':id', 'from-scratch']) await endpoint({ path });
    const rest = 'src/bounded-contexts/sales/presentation/rest/(root)';
    const root = read(`${rest}/GET.ts`);
    expect(root).toContain('export class SalesGetEndpoint');
    expect(root).toContain("path: ['sales'] }");
    expect(root).toContain("tags: ['sales']");
    expect(read(`${rest}/_id_/GET.ts`)).toContain("path: ['sales', ':id'] }");
    expect(read(`${rest}/from-scratch/GET.ts`)).toContain(
        'export class SalesFromScratchGetEndpoint'
    );
    expect(read(`${rest}/from-scratch/GET.ts`)).toContain(
        "path: ['sales', 'from-scratch'] }"
    );
    const wiring = 'src/bounded-contexts/sales/wiring/presentation/rest';
    expect(read(`${wiring}/index.ts`)).toBe("export * from './(root)'");
    expect(read(`${wiring}/(root)/index.ts`)).toBe(
        [
            "export * from './wire-sales-get-endpoint'",
            "export * from './wire-sales-_id_-get-endpoint'",
            "export * from './wire-sales-from-scratch-get-endpoint'"
        ].join('\n')
    );
    expect(read(`${wiring}/(root)/wire-sales-get-endpoint.ts`)).toContain(
        "from '../../../../presentation/rest/(root)/GET'"
    );
    expect(read('src/presentation/rest/wires.ts')).toBe(
        "export * from '../../bounded-contexts/sales/wiring/presentation/rest/(root)'"
    );
    expect(read('src/presentation/rest/index.ts')).toContain('restHandlers');

    // A formatter's semicolons don't make the re-exports repeat
    write(
        'src/presentation/rest/wires.ts',
        "export * from '../../bounded-contexts/sales/wiring/presentation/rest/(root)';"
    );
    await endpoint({ path: 'recent' });
    expect(read('src/presentation/rest/wires.ts')).toBe(
        "export * from '../../bounded-contexts/sales/wiring/presentation/rest/(root)';"
    );

    // `/sales/from-scratch` belongs to the root, `/sales/orders` to a controller
    await expect(
        endpoint({ controller: 'from-scratch', path: '' })
    ).rejects.toThrow('belongs to the context root');
    await expect(endpoint({ controller: 'sales', path: '' })).rejects.toThrow(
        'is the context itself'
    );
    await endpoint({ controller: 'orders', path: 'latest' });
    await expect(endpoint({ path: 'orders' })).rejects.toThrow(
        'belongs to controller "orders"'
    );
    expect(read(`${wiring}/index.ts`)).toBe(
        "export * from './(root)'\nexport * from './orders'"
    );
    expect(
        read(
            'src/bounded-contexts/sales/presentation/rest/orders/latest/GET.ts'
        )
    ).toContain("path: ['sales', 'orders', 'latest'] }");
});

test('context-root endpoints of the 8.5 layout ask for df-upgrade first', async () => {
    ConfigFile.update({
        backend: {
            ...ConfigFile.backend,
            domainFirstPackages: [
                '@domain-first/wire',
                '@domain-first/handlers-rest'
            ]
        }
    });
    writePendingChanges();
    await executeAgentRequest('df-integration', {
        operation: 'add',
        integrations: ['rest-endpoint-generator'],
        nextAdapter: true
    });
    write(
        'src/bounded-contexts/sales/presentation/rest/GET.ts',
        'export class SalesGetEndpoint {}'
    );
    const request = {
        operation: 'endpoint',
        context: 'sales',
        method: 'post',
        path: ''
    };
    await expect(executeAgentRequest('df-scaffold', request)).rejects.toThrow(
        'Run npx df-upgrade'
    );
    expect(
        agentError(
            await executeAgentRequest('df-scaffold', request).catch((e) => e)
        ).error.code
    ).toBe('UPGRADE_REQUIRED');
    // Controllers are not affected
    await executeAgentRequest('df-scaffold', {
        ...request,
        controller: 'orders'
    });
    expect(
        exists('src/bounded-contexts/sales/presentation/rest/orders/POST.ts')
    ).toBe(true);
});

test('backend moves and entity creation use stable unit IDs and preserve aggregate placement', async () => {
    await executeAgentRequest('df-scaffold', {
        operation: 'aggregate',
        context: 'sales',
        name: 'order'
    });
    await executeAgentRequest('df-scaffold', {
        operation: 'entity',
        context: 'sales',
        aggregate: 'order',
        name: 'line'
    });
    const moved = await executeAgentRequest('df-scaffold', {
        operation: 'move',
        context: 'sales',
        module: 'entity:order/line',
        name: 'order-line'
    });
    expect(moved.files.deleted).toContain(
        'src/bounded-contexts/sales/domain/aggregates/order/entities/line.entity.ts'
    );
    expect(
        exists(
            'src/bounded-contexts/sales/domain/aggregates/order/entities/order-line.entity.ts'
        )
    ).toBe(true);
});

test('machine errors have stable codes and do not expose stack traces', () => {
    expect(agentError(new Error('example'))).toEqual({
        schemaVersion: 1,
        ok: false,
        error: { code: 'OPERATION_FAILED', message: 'example' }
    });
});

test('an outdated config stops requests and is reported by describe', async () => {
    write(
        configFileName,
        JSON.stringify({
            rootFolder: 'src',
            domainFirstPackages: [],
            useReact: false
        })
    );
    await expect(
        executeAgentRequest('df-scaffold', {
            operation: 'bounded-context',
            name: 'orders'
        })
    ).rejects.toMatchObject({ code: 'CONFIG_OUTDATED' });
    expect(exists('src/bounded-contexts/orders')).toBe(false);
    const description = describeAgentCommand('df-scaffold');
    expect(description.project).toMatchObject({
        configured: false,
        configStatus: 'outdated'
    });
});

test('custom wire branches shape generated wires and New Implementation environments', async () => {
    ConfigFile.update({
        backend: {
            ...ConfigFile.backend,
            envBranches: { names: ['qa', 'staging', 'prod'], test: 'qa' }
        }
    });
    writePendingChanges();
    await executeAgentRequest('df-scaffold', {
        ...query,
        testImplementation: { type: 'fake' },
        dependencies: { PrismaOrdersQuery: [], FakeOrdersQuery: [] }
    });
    const wireFile =
        'src/bounded-contexts/sales/wiring/queries/wire-orders-query.ts';
    expect(
        read(wireFile)
    ).toContain(`export const wireOrdersQuery = envBranchedWire({
    qa: wireFakeImplementation,
    staging: wirePrismaImplementation,
    prod: wirePrismaImplementation
})`);
    await expect(
        executeAgentRequest('df-scaffold', {
            operation: 'implementation',
            context: 'sales',
            contract: 'query:orders',
            implementation: { type: 'sql' },
            environments: ['development']
        })
    ).rejects.toMatchObject({ code: 'INVALID_CHOICE' });
    await executeAgentRequest('df-scaffold', {
        operation: 'implementation',
        context: 'sales',
        contract: 'query:orders',
        implementation: { type: 'sql', save: true },
        environments: ['staging'],
        dependencies: { SqlOrdersQuery: [] }
    });
    expect(read(wireFile)).toContain('staging: wireSqlImplementation');
    expect(ConfigFile.backend.implementations?.queries?.primary).toContain(
        'sql'
    );
});

test('without a test branch, every branch gets the primary implementation and no test one is asked', async () => {
    ConfigFile.update({
        backend: {
            ...ConfigFile.backend,
            envBranches: { names: ['staging', 'prod'] }
        }
    });
    writePendingChanges();
    await expect(
        executeAgentRequest('df-scaffold', {
            ...query,
            testImplementation: { type: 'fake' },
            dependencies: { PrismaOrdersQuery: [] }
        })
    ).rejects.toMatchObject({ code: 'UNUSED_PARAMETERS' });
    await executeAgentRequest('df-scaffold', {
        ...query,
        dependencies: { PrismaOrdersQuery: [] }
    });
    expect(
        read('src/bounded-contexts/sales/wiring/queries/wire-orders-query.ts')
    ).toContain(`export const wireOrdersQuery = envBranchedWire({
    staging: wirePrismaImplementation,
    prod: wirePrismaImplementation
})`);
});

test('deleting an unused query removes its contract, implementations, wire and emptied folders', async () => {
    await executeAgentRequest('df-scaffold', {
        ...query,
        dependencies: { PrismaOrdersQuery: [] }
    });
    const result = await executeAgentRequest('df-scaffold', {
        operation: 'delete',
        context: 'sales',
        module: 'query:orders'
    });
    expect(result.files.deleted).toEqual(
        expect.arrayContaining([
            queryFile,
            adapterFile,
            'src/bounded-contexts/sales/wiring/queries/wire-orders-query.ts'
        ])
    );
    expect(exists(queryFile)).toBe(false);
    expect(exists('src/bounded-contexts/sales/infrastructure/queries')).toBe(
        false
    );
    expect(exists('src/bounded-contexts/sales/wiring/queries')).toBe(false);
});

test('a module still in use is not deleted, and the uses are listed', async () => {
    await executeAgentRequest('df-scaffold', {
        ...query,
        dependencies: { PrismaOrdersQuery: [] }
    });
    await executeAgentRequest('df-scaffold', {
        operation: 'use-case',
        context: 'sales',
        name: 'place-order',
        dependencies: { PlaceOrderUseCase: ['sales:OrdersQuery'] }
    });
    const error = await executeAgentRequest('df-scaffold', {
        operation: 'delete',
        context: 'sales',
        module: 'query:orders'
    }).catch((caught) => caught);
    expect(error).toMatchObject({ code: 'DELETE_NOT_ALLOWED' });
    expect(error.details.usedBy.map(([file]: string[]) => file)).toEqual(
        expect.arrayContaining([
            'src/bounded-contexts/sales/application/use-cases/place-order-use-case.ts',
            'src/bounded-contexts/sales/wiring/use-cases/wire-place-order-use-case.ts'
        ])
    );
    expect(exists(queryFile)).toBe(true);
});

test('deleting an aggregate removes its folder and its in-memory DB section', async () => {
    await executeAgentRequest('df-scaffold', {
        operation: 'aggregate',
        context: 'sales',
        name: 'order',
        withRepository: true,
        implementation: { type: 'in-memory' },
        dependencies: {
            InMemoryOrderRepository: [
                'shared-kernel:InMemoryDbInfrastructureService'
            ]
        }
    });
    const dbFile =
        'src/shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts';
    expect(read(dbFile)).toContain("orders = this.section<Order>('ORDERS')");
    await executeAgentRequest('df-scaffold', {
        operation: 'entity',
        context: 'sales',
        aggregate: 'order',
        name: 'line'
    });
    const result = await executeAgentRequest('df-scaffold', {
        operation: 'delete',
        context: 'sales',
        module: 'aggregate:order'
    });
    expect(result.files.updated).toEqual([dbFile]);
    expect(read(dbFile)).not.toContain('orders = this.section');
    expect(read(dbFile)).not.toContain('aggregates/order');
    expect(exists('src/bounded-contexts/sales/domain/aggregates/order')).toBe(
        false
    );
    expect(
        exists(
            'src/bounded-contexts/sales/wiring/repositories/wire-order-repository.ts'
        )
    ).toBe(false);
});

test('deleting an entity drops its re-export, unless the aggregate barrel still brings it to others', async () => {
    await executeAgentRequest('df-scaffold', {
        operation: 'aggregate',
        context: 'sales',
        name: 'order'
    });
    for (const name of ['line', 'note'])
        await executeAgentRequest('df-scaffold', {
            operation: 'entity',
            context: 'sales',
            aggregate: 'order',
            name
        });
    const index = 'src/bounded-contexts/sales/domain/aggregates/order/index.ts';
    write(
        'src/bounded-contexts/sales/domain/services/totals.ts',
        "import { Line } from '../aggregates/order'\nexport const total = (lines: Line[]) => lines.length"
    );
    await expect(
        executeAgentRequest('df-scaffold', {
            operation: 'delete',
            context: 'sales',
            module: 'entity:order/line'
        })
    ).rejects.toMatchObject({ code: 'DELETE_NOT_ALLOWED' });
    const result = await executeAgentRequest('df-scaffold', {
        operation: 'delete',
        context: 'sales',
        module: 'entity:order/note'
    });
    expect(result.files.updated).toEqual([index]);
    expect(read(index)).not.toContain('note.entity');
    expect(read(index)).toContain('line.entity');
});

test('deleting an unused widget removes its folder; a widget in use stays', async () => {
    for (const name of ['orders/list', 'orders/filters'])
        await executeAgentRequest('df-react', { operation: 'widget', name });
    await executeAgentRequest('df-react', {
        operation: 'page',
        name: 'orders'
    });
    const page = 'src/presentation/react/pages/orders-page.tsx';
    write(
        page,
        `${read(page)}\nimport { OrdersListWidget } from '../widgets/orders/list'`
    );
    const error = await executeAgentRequest('df-react', {
        operation: 'delete-widget',
        module: 'orders/list'
    }).catch((caught) => caught);
    expect(error).toMatchObject({ code: 'DELETE_NOT_ALLOWED' });
    expect(error.details.usedBy).toEqual([
        [page, 'src/presentation/react/widgets/orders/list']
    ]);
    const result = await executeAgentRequest('df-react', {
        operation: 'delete-widget',
        module: 'orders/filters'
    });
    expect(result.files.deleted).toContain(
        'src/presentation/react/widgets/orders/filters/orders-filters-widget.tsx'
    );
    expect(exists('src/presentation/react/widgets/orders/filters')).toBe(false);
    expect(exists('src/presentation/react/widgets/orders/list')).toBe(true);
});

test('deleting a Next.js page deletes its route by default; a kept route blocks it', async () => {
    await executeAgentRequest('df-react', {
        operation: 'page',
        name: 'admin/users'
    });
    write('app/admin/users/layout.tsx', 'export default function Layout() {}');
    write('app/admin/users/[id]/page.tsx', 'export default function User() {}');
    const blocked = await executeAgentRequest('df-react', {
        operation: 'delete-page',
        module: 'admin/users',
        deleteRoute: false
    }).catch((caught) => caught);
    expect(blocked).toMatchObject({ code: 'DELETE_NOT_ALLOWED' });
    expect(blocked.details.usedBy[0][0]).toBe('app/admin/users/page.tsx');

    const result = await executeAgentRequest('df-react', {
        operation: 'delete-page',
        module: 'admin/users'
    });
    expect(result.files.deleted).toEqual(
        expect.arrayContaining([
            'src/presentation/react/pages/admin/admin-users-page.tsx',
            'app/admin/users/page.tsx',
            'app/admin/users/layout.tsx'
        ])
    );
    expect(exists('app/admin/users/page.tsx')).toBe(false);
    expect(exists('app/admin/users/[id]/page.tsx')).toBe(true);
    expect(exists('src/presentation/react/pages/admin')).toBe(false);
});

test('a page without its own route takes no deleteRoute', async () => {
    write('app/orders/page.tsx', 'custom route');
    await executeAgentRequest('df-react', {
        operation: 'page',
        name: 'orders'
    });
    await expect(
        executeAgentRequest('df-react', {
            operation: 'delete-page',
            module: 'orders',
            deleteRoute: true
        })
    ).rejects.toMatchObject({ code: 'UNUSED_PARAMETERS' });
    await executeAgentRequest('df-react', {
        operation: 'delete-page',
        module: 'orders'
    });
    expect(read('app/orders/page.tsx')).toBe('custom route');
    expect(exists('src/presentation/react/pages/orders-page.tsx')).toBe(false);
});

test('UI-kit components and shared hooks move with their files, names, story titles and importers', async () => {
    ConfigFile.update({
        frontend: {
            react: {
                framework: 'next',
                storybookFramework: '@storybook/react-vite'
            }
        }
    });
    writePendingChanges();
    await executeAgentRequest('df-react', {
        operation: 'ui-kit-component',
        name: 'button'
    });
    await executeAgentRequest('df-react', {
        operation: 'shared-hook',
        name: 'debounce'
    });
    write(
        'src/presentation/react/widgets/search.tsx',
        "import { Button, type ButtonProps } from '../ui-kit/button'\nimport { useDebounce } from '../hooks/use-debounce'\nexport const props: ButtonProps = {}\nexport const parts = [Button, useDebounce]"
    );
    const kit = 'src/presentation/react/ui-kit';
    await executeAgentRequest('df-react', {
        operation: 'move-ui-kit-component',
        module: 'button',
        name: 'primary-button'
    });
    expect(exists(`${kit}/button`)).toBe(false);
    expect(read(`${kit}/primary-button/primary-button.tsx`)).toContain(
        'export const PrimaryButton: FC<PrimaryButtonProps>'
    );
    expect(read(`${kit}/primary-button/primary-button.stories.tsx`)).toContain(
        "title: 'UI-kit/PrimaryButton'"
    );
    expect(read(`${kit}/primary-button/index.ts`)).toBe(
        "export * from './primary-button'"
    );
    await executeAgentRequest('df-react', {
        operation: 'move-shared-hook',
        module: 'debounce',
        name: 'use-throttle'
    });
    expect(exists('src/presentation/react/hooks/use-debounce.ts')).toBe(false);
    expect(read('src/presentation/react/hooks/use-throttle.ts')).toContain(
        'export const useThrottle'
    );
    expect(
        read('src/presentation/react/widgets/search.tsx')
    ).toBe(`import { PrimaryButton, type PrimaryButtonProps } from '../ui-kit/primary-button'
import { useThrottle } from '../hooks/use-throttle'
export const props: PrimaryButtonProps = {}
export const parts = [PrimaryButton, useThrottle]`);
    expect(
        (describeAgentCommand('df-react').project as any).reactModules
    ).toEqual(
        expect.arrayContaining([
            {
                kind: 'ui-kit',
                name: 'primary-button',
                file: `${kit}/primary-button`
            },
            {
                kind: 'hook',
                name: 'throttle',
                file: 'src/presentation/react/hooks/use-throttle.ts'
            }
        ])
    );
});

test('a UI-kit component in use is not deleted; an unused hook is', async () => {
    await executeAgentRequest('df-react', {
        operation: 'ui-kit-component',
        name: 'badge'
    });
    await executeAgentRequest('df-react', {
        operation: 'shared-hook',
        name: 'toggle'
    });
    write(
        'src/presentation/react/widgets/card.tsx',
        "import { Badge } from '../ui-kit/badge'\nexport const parts = [Badge]"
    );
    const error = await executeAgentRequest('df-react', {
        operation: 'delete-ui-kit-component',
        module: 'badge'
    }).catch((caught) => caught);
    expect(error).toMatchObject({ code: 'DELETE_NOT_ALLOWED' });
    expect(error.details.usedBy).toEqual([
        [
            'src/presentation/react/widgets/card.tsx',
            'src/presentation/react/ui-kit/badge'
        ]
    ]);
    const result = await executeAgentRequest('df-react', {
        operation: 'delete-shared-hook',
        module: 'toggle'
    });
    expect(result.files.deleted).toEqual([
        'src/presentation/react/hooks/use-toggle.ts'
    ]);
    expect(exists('src/presentation/react/hooks')).toBe(false);
    expect(exists('src/presentation/react/ui-kit/badge/badge.tsx')).toBe(true);
});
