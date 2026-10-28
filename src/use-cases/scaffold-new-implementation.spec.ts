import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkbox, input, select } from '@inquirer/prompts';
import { afterAll, beforeEach, expect, rstest, test } from '@rstest/core';
import { Folder, writePendingChanges } from '../file-system';
import { scaffoldNewImplementation } from './scaffold-new-implementation';

rstest.mock('@inquirer/prompts', () => ({
    input: rstest.fn(),
    select: rstest.fn(),
    checkbox: rstest.fn(),
    Separator: class {
        constructor(public readonly separator: string) {}
    }
}));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-implementation-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const sales = path.join(root, 'src', 'bounded-contexts', 'sales');
const shared = path.join(root, 'src', 'shared-kernel');

const write = (folder: string, file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
    fs.writeFileSync(path.join(folder, file), content);
};

const read = (folder: string, file: string) =>
    fs.readFileSync(path.join(folder, file), 'utf8');

const configure = (packages: string[], withInMemoryDb = false) =>
    write(
        root,
        'domain-first.project-structure.config.json',
        JSON.stringify({
            rootFolder: 'src',
            domainFirstPackages: packages,
            defaultPersistenceLayerImplementation: 'prisma',
            withInMemoryDb,
            useReact: false
        })
    );

const inMemoryDb = [
    'export class InMemoryDbInfrastructureService {',
    '    protected section<T>(key: string) {}',
    '}'
].join('\n');

const orderRepositoryWire = [
    "import { wireClass } from '@domain-first/wire'",
    "import { envBranchedWire } from '../../../../shared-kernel/wiring/env-branched-wire'",
    "import { PrismaOrderRepository } from '../../infrastructure/repositories/prisma/prisma-order-repository'",
    '',
    'const wirePrismaImplementation = wireClass(PrismaOrderRepository, [])',
    '',
    'export const wireOrderRepository = envBranchedWire({',
    '    test: wirePrismaImplementation,',
    '    development: wirePrismaImplementation,',
    '    production: wirePrismaImplementation',
    '})'
].join('\n');

beforeEach(() => {
    fs.rmSync(path.join(root, 'src'), { recursive: true, force: true });
    write(root, 'package.json', '{}');
    write(
        sales,
        'domain/aggregates/order/order.aggregate-root.ts',
        'export class Order {}'
    );
    write(
        sales,
        'domain/aggregates/order/order-repository.ts',
        'export abstract class OrderRepository { }'
    );
    write(
        sales,
        'domain/aggregates/order/index.ts',
        "export * from './order.aggregate-root'\nexport * from './order-repository'"
    );
    write(
        sales,
        'infrastructure/repositories/prisma/prisma-order-repository.ts',
        "import { OrderRepository } from '../../../domain/aggregates/order'\n\nexport class PrismaOrderRepository implements OrderRepository {\n    constructor() {}\n}"
    );
    write(
        sales,
        'wiring/repositories/wire-order-repository.ts',
        orderRepositoryWire
    );
    write(
        sales,
        'application/queries/order-summary-query.ts',
        'export abstract class OrderSummaryQuery {}'
    );
    write(
        sales,
        'application/ports/payment-gateway.ts',
        'export abstract class PaymentGateway {}'
    );
    write(
        sales,
        'infrastructure/application-adapters/api/api-payment-gateway.ts',
        "import { PaymentGateway } from '../../../application/ports/payment-gateway'\n\nexport class ApiPaymentGateway extends PaymentGateway {}"
    );
    write(
        shared,
        'infrastructure/services/in-memory-db-infrastructure-service.ts',
        inMemoryDb
    );
    write(
        shared,
        'wiring/infrastructure-services/wire-in-memory-db-infrastructure-service.ts',
        "import { wireClass } from '@domain-first/wire'\nimport { InMemoryDbInfrastructureService } from '../../infrastructure/services/in-memory-db-infrastructure-service'\n\nexport const wireInMemoryDbInfrastructureService = wireClass(InMemoryDbInfrastructureService, [])"
    );
    rstest.spyOn(process, 'cwd').mockReturnValue(root);
    rstest.mocked(select).mockReset();
    rstest.mocked(input).mockReset();
    rstest.mocked(checkbox).mockReset();
});

type Choice = { value?: { name: string }; checked?: boolean };

/**
 * Picks the contract, types the implementation, and answers checkboxes:
 * the environments, then the suggested dependencies as they come.
 */
const run = async (
    contract: string,
    label: string,
    environments: string[] = []
) => {
    rstest
        .mocked(select)
        .mockImplementationOnce(
            (async ({ choices }: { choices: Choice[] }) =>
                choices.find((x) => x.value?.name === contract)?.value) as never
        );
    rstest.mocked(input).mockResolvedValueOnce(label);
    rstest
        .mocked(checkbox)
        .mockImplementation((async ({
            message,
            choices
        }: {
            message: string;
            choices: Choice[];
        }) =>
            message === 'Environments:'
                ? environments
                : choices
                      .filter((x) => x.checked)
                      .map((x) => x.value)) as never);
    await scaffoldNewImplementation(new Folder(sales));
    writePendingChanges();
};

test('a port gets an adapter next to the existing ones', async () => {
    configure([]);
    await run('payment-gateway', 'stripe');

    expect(
        read(
            sales,
            'infrastructure/application-adapters/stripe/stripe-payment-gateway.ts'
        )
    ).toBe(
        "import { PaymentGateway } from '../../../application/ports/payment-gateway'\n\nexport class StripePaymentGateway extends PaymentGateway {\n\n}"
    );
    expect(checkbox).not.toHaveBeenCalled();
});

test('a query implementation follows handlers', async () => {
    configure(['@domain-first/handlers']);
    await run('order-summary', 'mongo');

    expect(
        read(sales, 'infrastructure/queries/mongo/mongo-order-summary-query.ts')
    ).toContain(
        'export class MongoOrderSummaryQuery extends OrderSummaryQuery {\n    constructor() {\n        super()\n    }\n\n    handle = defineHandler({'
    );
});

test('the implementation serves the chosen environments of the wire', async () => {
    configure(['@domain-first/wire']);
    await run('order', 'dynamo', ['production']);

    expect(
        read(
            sales,
            'infrastructure/repositories/dynamo/dynamo-order-repository.ts'
        )
    ).toContain(
        'export class DynamoOrderRepository implements OrderRepository'
    );
    expect(read(sales, 'wiring/repositories/wire-order-repository.ts')).toBe(
        [
            "import { wireClass } from '@domain-first/wire'",
            "import { envBranchedWire } from '../../../../shared-kernel/wiring/env-branched-wire'",
            "import { PrismaOrderRepository } from '../../infrastructure/repositories/prisma/prisma-order-repository'",
            "import { DynamoOrderRepository } from '../../infrastructure/repositories/dynamo/dynamo-order-repository'",
            '',
            'const wirePrismaImplementation = wireClass(PrismaOrderRepository, [])',
            '',
            'const wireDynamoImplementation = wireClass(DynamoOrderRepository, [])',
            '',
            'export const wireOrderRepository = envBranchedWire({',
            '    test: wirePrismaImplementation,',
            '    development: wirePrismaImplementation,',
            '    production: wireDynamoImplementation',
            '})'
        ].join('\n')
    );
});

test('a wired in-memory repository gets its section of the in-memory DB', async () => {
    configure(['@domain-first/wire'], true);
    await run('order', 'in-memory', ['test']);

    expect(
        read(sales, 'wiring/repositories/wire-order-repository.ts')
    ).toContain(
        'const wireInMemoryImplementation = wireClass(InMemoryOrderRepository, [wireInMemoryDbInfrastructureService])'
    );
    expect(
        read(
            sales,
            'infrastructure/repositories/in-memory/in-memory-order-repository.ts'
        )
    ).toContain('this.data = inMemoryDbInfrastructureService.orders');
    expect(
        read(
            shared,
            'infrastructure/services/in-memory-db-infrastructure-service.ts'
        )
    ).toContain("orders = this.section<Order>('ORDERS');");
});

test('an existing implementation type is rejected', async () => {
    configure([]);
    await run('order', 'in-memory');
    const [[{ validate }]] = rstest.mocked(input).mock.calls as unknown as [
        [{ validate: (value: string) => string | true }]
    ];

    expect(validate('prisma')).toBe(
        'order already has the prisma implementation.'
    );
    expect(validate('')).not.toBe(true);
    expect(validate('Dynamo')).not.toBe(true);
    expect(validate('dynamo')).toBe(true);
});
