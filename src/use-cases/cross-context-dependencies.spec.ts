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
import ts from 'typescript';
import {
    discardPendingChanges,
    Folder,
    writePendingChanges
} from '../file-system';
import { lintProject } from '../project-lint';
import {
    availableDependencies,
    findWiredModules,
    type WiredModule
} from '../wiring';
import {
    enterImplementationTypeOnce,
    implementationTypeEntryChoices
} from './prompt-implementation-type';
import { scaffoldNewApplicationPort } from './scaffold-new-application-port';
import { scaffoldNewCommand } from './scaffold-new-command';
import { scaffoldNewImplementation } from './scaffold-new-implementation';
import { scaffoldNewQuery } from './scaffold-new-query';
import { wireDependency } from './wire-dependency';

rstest.mock('@inquirer/prompts', () => ({
    input: rstest.fn(),
    confirm: rstest.fn(),
    select: rstest.fn(),
    checkbox: rstest.fn(),
    Separator: class {
        constructor(public readonly separator: string) {}
    }
}));

const repository = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cross-context-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
let project: string;
let sequence = 0;
const write = (file: string, source: string) => {
    const target = path.join(project, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
};
const read = (file: string) =>
    fs.readFileSync(path.join(project, file), 'utf8');
const owner = (name: string) => `src/bounded-contexts/${name}`;

const handler = (
    context: string,
    kind: 'queries' | 'commands' | 'use-cases'
) => {
    const suffix = {
        queries: 'query',
        commands: 'command',
        'use-cases': 'use-case'
    }[kind];
    const type = {
        queries: 'InvoiceQuery',
        commands: 'PayCommand',
        'use-cases': 'RefundUseCase'
    }[kind];
    const name = { queries: 'invoice', commands: 'pay', 'use-cases': 'refund' }[
        kind
    ];
    const file = `${name}-${suffix}`;
    write(
        `${owner(context)}/application/${kind}/${file}.ts`,
        `export class ${type} {}`
    );
    write(
        `${owner(context)}/wiring/${kind}/wire-${file}.ts`,
        `import { wireClass } from '@domain-first/wire'
import { ${type} } from '../../application/${kind}/${file}'
export const wire${type} = wireClass(${type}, [])`
    );
};

beforeEach(() => {
    project = path.join(root, String(sequence++));
    write('package.json', '{}');
    write(
        'domain-first.project-structure.config.json',
        JSON.stringify({
            project: { rootFolder: 'src' },
            backend: {
                domainFirstPackages: [
                    '@domain-first/wire',
                    '@domain-first/handlers'
                ],
                implementations: {
                    commands: { primary: ['prisma'], test: ['mock'] },
                    queries: { primary: ['prisma'], test: ['mock'] },
                    ports: { primary: ['api'], test: ['mock'] }
                }
            }
        })
    );
    write(
        'src/shared-kernel/wiring/env-branched-wire.ts',
        `import { branchedWire } from '@domain-first/wire'
export const envBranchedWire = branchedWire(() => 'development' as 'test' | 'development' | 'production')`
    );
    for (const context of ['billing', 'shipping']) {
        for (const kind of ['queries', 'commands', 'use-cases'] as const)
            handler(context, kind);
        write(
            `${owner(context)}/infrastructure/services/client-infrastructure-service.ts`,
            'export class ClientInfrastructureService {}'
        );
        write(
            `${owner(context)}/wiring/infrastructure-services/wire-client-infrastructure-service.ts`,
            `import { wireClass } from '@domain-first/wire'
import { ClientInfrastructureService } from '../../infrastructure/services/client-infrastructure-service'
export const wireClientInfrastructureService = wireClass(ClientInfrastructureService, [])`
        );
    }
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    rstest.mocked(input).mockReset();
    rstest.mocked(confirm).mockReset();
    rstest.mocked(checkbox).mockReset();
    rstest.mocked(select).mockReset();
});

type Choice = {
    value?: {
        module: WiredModule;
        label: string;
        implementation?: WiredModule['implementations'][number];
    };
};
const chooseDependencies = (labels: string[]) => {
    rstest.mocked(checkbox).mockImplementation((async ({
        choices
    }: {
        choices: Choice[];
    }) => {
        const options = choices.flatMap((choice) =>
            choice.value ? [choice.value] : []
        );
        expect(options.map((option) => option.label).sort()).toEqual(
            [...labels].sort()
        );
        return options;
    }) as never);
};

const foreignLabels = [
    'InvoiceQuery (billing)',
    'InvoiceQuery (shipping)',
    'PayCommand (billing)',
    'PayCommand (shipping)',
    'RefundUseCase (billing)',
    'RefundUseCase (shipping)'
];
const portWire = () =>
    `${owner('sales')}/wiring/application-ports/wire-invoice.ts`;
const portAdapter = (label: string) =>
    `${owner('sales')}/infrastructure/application-adapters/${label}/${label}-invoice.ts`;

test('port generator wires all foreign handler kinds and isolates its test adapter', async () => {
    rstest
        .mocked(input)
        .mockResolvedValueOnce('invoice')
        .mockResolvedValueOnce('stub');
    rstest
        .mocked(select)
        .mockResolvedValueOnce('cross-context')
        .mockResolvedValueOnce(null);
    rstest.mocked(confirm).mockResolvedValueOnce(true);
    chooseDependencies(foreignLabels);
    await scaffoldNewApplicationPort(
        new Folder(path.join(project, owner('sales')))
    );
    writePendingChanges();
    const menus = rstest.mocked(select).mock.calls;
    expect(menus[0][0].choices).toEqual([
        { name: 'api', value: 'api', disabled: false },
        {
            name: 'System: cross-context (calls handlers in another bounded context)',
            value: 'cross-context',
            disabled: false
        },
        ...implementationTypeEntryChoices
    ]);
    expect(menus[0][0].default).toBe('api');
    expect(menus[1][0].choices).toEqual([
        { name: 'mock', value: 'mock', disabled: false },
        {
            name: 'System: cross-context (calls handlers in another bounded context)',
            value: 'cross-context',
            disabled: true
        },
        ...implementationTypeEntryChoices
    ]);
    expect(menus[1][0].default).toBe('mock');
    expect(checkbox).toHaveBeenCalledTimes(1);
    const adapter = read(portAdapter('cross-context'));
    for (const name of [
        'BillingInvoiceQuery',
        'ShippingInvoiceQuery',
        'BillingPayCommand',
        'ShippingPayCommand',
        'BillingRefundUseCase',
        'ShippingRefundUseCase'
    ]) {
        expect(adapter).toContain(name);
    }
    expect(adapter).toContain(
        'private readonly billingInvoiceQuery: BillingInvoiceQuery'
    );
    expect(read(portAdapter('stub'))).not.toContain('billing');
    expect(
        read(`${owner('sales')}/application/ports/invoice.ts`)
    ).not.toContain('billing');
    expect(read(portWire())).toContain(
        'wireInvoiceQuery as wireBillingInvoiceQuery'
    );
    expect(read(portWire())).toContain('wireClass(StubInvoice, [])');
    expect(read(portWire())).toContain('test: wireStubImplementation');
    expect(lintProject(project, 'src')).toEqual([]);
    const consumer = findWiredModules(path.join(project, owner('sales')))[0];
    const candidates = ['billing', 'shipping'].flatMap((context) =>
        findWiredModules(path.join(project, owner(context)))
    );
    for (const implementation of consumer.implementations) {
        expect(
            availableDependencies(consumer, implementation, candidates)
        ).toEqual([]);
    }
    const program = ts.createProgram([path.join(project, portWire())], {
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        paths: {
            '@domain-first/*': [
                path.join(repository, 'node_modules/@domain-first/*')
            ]
        }
    });
    expect(
        ts
            .getPreEmitDiagnostics(program)
            .map((diagnostic) =>
                ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
            )
    ).toEqual([]);
});

test('port mock adapter is selected in tests without invoking neighboring handlers', async () => {
    rstest.mocked(input).mockResolvedValueOnce('invoice');
    rstest
        .mocked(select)
        .mockResolvedValueOnce('cross-context')
        .mockResolvedValueOnce('mock');
    rstest.mocked(confirm).mockResolvedValueOnce(true);
    chooseDependencies(foreignLabels);
    await scaffoldNewApplicationPort(
        new Folder(path.join(project, owner('sales')))
    );
    writePendingChanges();
    expect(read(portWire())).toContain('test: wireMockImplementation');
    expect(read(portAdapter('mock'))).not.toContain('billing');
    expect(input).toHaveBeenCalledTimes(1);
    expect(lintProject(project, 'src')).toEqual([]);
});

test('test menu disables an existing in-memory primary type', async () => {
    const catalog = JSON.parse(
        read('domain-first.project-structure.config.json')
    );
    catalog.backend.implementations.ports.test.unshift('in-memory');
    write(
        'domain-first.project-structure.config.json',
        JSON.stringify(catalog)
    );
    rstest
        .mocked(input)
        .mockResolvedValueOnce('invoice')
        .mockResolvedValueOnce('in-memory');
    rstest
        .mocked(select)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('mock');
    rstest.mocked(confirm).mockResolvedValueOnce(true);
    await scaffoldNewApplicationPort(
        new Folder(path.join(project, owner('sales')))
    );
    writePendingChanges();
    const menu = rstest.mocked(select).mock.calls[1][0];
    expect(menu.choices).toContainEqual({
        name: 'in-memory',
        value: 'in-memory',
        disabled: true
    });
    expect(menu.default).toBe('mock');
    expect(read(portWire())).toContain('test: wireMockImplementation');
});

test('Wire dependency adds foreign handlers to an existing adapter and preserves occupied aliases', async () => {
    rstest.mocked(input).mockResolvedValueOnce('invoice');
    rstest.mocked(select).mockResolvedValueOnce('cross-context');
    rstest.mocked(confirm).mockResolvedValueOnce(false);
    rstest.mocked(checkbox).mockResolvedValueOnce([]);
    const sales = new Folder(path.join(project, owner('sales')));
    await scaffoldNewApplicationPort(sales);
    writePendingChanges();
    write(
        portAdapter('cross-context'),
        `${read(portAdapter('cross-context'))}\nclass BillingInvoiceQuery {}`
    );
    write(
        portWire(),
        `${read(portWire())}\nconst wireBillingInvoiceQuery = () => ({})`
    );
    rstest
        .mocked(select)
        .mockImplementationOnce(
            (async ({ choices }: { choices: Choice[] }) =>
                choices.find((choice) => choice.value)?.value) as never
        );
    chooseDependencies(foreignLabels);
    await wireDependency(sales);
    writePendingChanges();
    expect(read(portAdapter('cross-context'))).toContain(
        'InvoiceQuery as BillingInvoiceQuery2'
    );
    expect(read(portAdapter('cross-context'))).toContain(
        'private readonly billingInvoiceQuery2: BillingInvoiceQuery2'
    );
    expect(read(portWire())).toContain(
        'wireInvoiceQuery as wireBillingInvoiceQuery2'
    );
    expect(lintProject(project, 'src')).toEqual([]);
});

test('a cross-context adapter can be added to an existing port without the handlers package', async () => {
    write(
        'domain-first.project-structure.config.json',
        JSON.stringify({
            rootFolder: 'src',
            domainFirstPackages: ['@domain-first/wire'],
            useReact: false
        })
    );
    rstest
        .mocked(input)
        .mockResolvedValueOnce('invoice')
        .mockResolvedValueOnce('stub');
    rstest.mocked(select).mockResolvedValueOnce(null);
    rstest.mocked(confirm).mockResolvedValueOnce(false);
    const sales = new Folder(path.join(project, owner('sales')));
    await scaffoldNewApplicationPort(sales);
    writePendingChanges();
    rstest
        .mocked(select)
        .mockImplementationOnce(
            (async ({ choices }: { choices: { value?: unknown }[] }) =>
                choices.find((choice) => choice.value)?.value) as never
        );
    rstest.mocked(select).mockResolvedValueOnce('cross-context');
    chooseDependencies(foreignLabels);
    rstest
        .mocked(checkbox)
        .mockResolvedValueOnce(['development', 'production']);
    await scaffoldNewImplementation(sales);
    writePendingChanges();
    expect(read(portWire())).toContain('test: wireStubImplementation');
    expect(read(portWire())).toContain(
        'production: wireCrossContextImplementation'
    );
    expect(read(portAdapter('cross-context'))).toContain(
        'BillingRefundUseCase'
    );
    expect(lintProject(project, 'src')).toEqual([]);
});

for (const [kind, scaffold] of [
    ['query', scaffoldNewQuery],
    ['command', scaffoldNewCommand]
] as const) {
    test(`${kind} implementations retain persistence and mock choices without cross-context access`, async () => {
        rstest.mocked(input).mockResolvedValueOnce('invoice');
        rstest
            .mocked(select)
            .mockResolvedValueOnce('prisma')
            .mockResolvedValueOnce('mock');
        rstest.mocked(confirm).mockResolvedValueOnce(true);
        await scaffold(new Folder(path.join(project, owner('sales'))));
        writePendingChanges();
        const menus = rstest.mocked(select).mock.calls;
        expect(menus[0][0].choices).toEqual([
            { name: 'prisma', value: 'prisma', disabled: false },
            ...implementationTypeEntryChoices
        ]);
        expect(menus[0][0].default).toBe('prisma');
        expect(menus[1][0].choices).toContainEqual({
            name: 'mock',
            value: 'mock',
            disabled: false
        });
        expect(checkbox).not.toHaveBeenCalled();
        const folder = kind === 'query' ? 'queries' : 'commands';
        const file = `${owner('sales')}/infrastructure/${folder}/prisma/prisma-invoice-${kind}.ts`;
        write(
            file,
            `${read(file)}\nimport type { InvoiceQuery as BillingInvoiceQuery } from '../../../../billing/application/queries/invoice-query'`
        );
        expect(
            lintProject(project, 'src').some(
                (violation) => violation.check === 'context-isolation'
            )
        ).toBe(true);
    });
}

test('Shared Kernel ports do not expose a cross-context adapter', async () => {
    rstest.mocked(input).mockResolvedValueOnce('invoice');
    rstest.mocked(select).mockResolvedValueOnce('api');
    rstest.mocked(confirm).mockResolvedValueOnce(false);
    await scaffoldNewApplicationPort(
        new Folder(path.join(project, 'src/shared-kernel'))
    );
    writePendingChanges();
    expect(rstest.mocked(select).mock.calls[0][0].choices).toEqual([
        { name: 'api', value: 'api', disabled: false },
        ...implementationTypeEntryChoices
    ]);
    expect(checkbox).not.toHaveBeenCalled();
    expect(lintProject(project, 'src')).toEqual([]);
});

for (const withNeighbor of [false, true]) {
    test(`port menus ${withNeighbor ? 'include' : 'hide'} cross-context with ${withNeighbor ? 'an empty neighbor' : 'only the current context'}`, async () => {
        // No handlers are needed: the existence of another context is enough.
        for (const context of ['billing', 'shipping']) {
            fs.rmSync(path.join(project, owner(context)), { recursive: true });
        }
        const sales = new Folder(path.join(project, owner('sales')));
        fs.mkdirSync(sales.path, { recursive: true });
        write(
            'src/bounded-contexts/not-a-context.txt',
            'not a context directory'
        );
        if (withNeighbor) fs.mkdirSync(path.join(project, owner('billing')));

        rstest.mocked(input).mockResolvedValueOnce('invoice');
        rstest.mocked(select).mockResolvedValueOnce('api');
        rstest.mocked(confirm).mockResolvedValueOnce(false);
        await scaffoldNewApplicationPort(sales);
        writePendingChanges();
        const choices = [
            { name: 'api', value: 'api', disabled: false },
            ...(withNeighbor
                ? [
                      {
                          name: 'System: cross-context (calls handlers in another bounded context)',
                          value: 'cross-context',
                          disabled: false
                      }
                  ]
                : []),
            ...implementationTypeEntryChoices
        ];
        expect(rstest.mocked(select).mock.calls[0][0].choices).toEqual(choices);

        rstest
            .mocked(select)
            .mockImplementationOnce(
                (async ({ choices }: { choices: { value?: unknown }[] }) =>
                    choices.find((choice) => choice.value)?.value) as never
            );
        rstest.mocked(select).mockResolvedValueOnce(null);
        rstest.mocked(input).mockResolvedValueOnce('mock');
        rstest.mocked(checkbox).mockResolvedValueOnce(['test']);
        await scaffoldNewImplementation(sales);
        writePendingChanges();
        const addedAdapterMenu = rstest.mocked(select).mock.calls[2][0];
        expect(addedAdapterMenu.choices).toEqual([
            { name: 'api', value: 'api', disabled: true },
            { name: 'mock', value: 'mock', disabled: false },
            ...(withNeighbor
                ? [
                      {
                          name: 'System: cross-context (calls handlers in another bounded context)',
                          value: 'cross-context',
                          disabled: false
                      }
                  ]
                : []),
            ...implementationTypeEntryChoices
        ]);
        if (!withNeighbor) {
            const validate = rstest.mocked(input).mock.calls[1][0].validate!;
            expect(await validate('cross-context')).not.toBe(true);
        }
        expect(lintProject(project, 'src')).toEqual([]);
    });
}

test('one-off primary and test port types generate adapters without changing the catalog', async () => {
    const catalog = path.join(
        project,
        'domain-first.project-structure.config.json'
    );
    const original = fs.readFileSync(catalog, 'utf8');
    rstest
        .mocked(input)
        .mockResolvedValueOnce('invoice')
        .mockResolvedValueOnce('redis')
        .mockResolvedValueOnce('stub');
    rstest
        .mocked(select)
        .mockResolvedValueOnce(enterImplementationTypeOnce)
        .mockResolvedValueOnce(enterImplementationTypeOnce);
    rstest.mocked(confirm).mockResolvedValueOnce(true);
    await scaffoldNewApplicationPort(
        new Folder(path.join(project, owner('sales')))
    );
    writePendingChanges();
    expect(read(portAdapter('redis'))).toContain('RedisInvoice');
    expect(read(portAdapter('stub'))).toContain('StubInvoice');
    expect(read(portWire())).toContain('test: wireStubImplementation');
    expect(fs.readFileSync(catalog, 'utf8')).toBe(original);
    expect(lintProject(project, 'src')).toEqual([]);
});
