import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from '@rstest/core';
import { resolveDependencyRules } from './dependency-rules';
import {
    formatViolations,
    type LintOptions,
    lintProject
} from './project-lint';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-lint-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

let sequence = 0;
const lint = (files: Record<string, string>, options?: LintOptions) => {
    const project = path.join(root, String(sequence++));
    for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(project, file)), {
            recursive: true
        });
        fs.writeFileSync(path.join(project, file), content);
    }
    return lintProject(project, 'src', options).map((x) => ({
        rule: x.rule,
        file: path.relative(project, x.file),
        line: x.line
    }));
};

const sales = 'src/bounded-contexts/sales';
const billing = 'src/bounded-contexts/billing';

describe('lintProject', () => {
    test('rejects foreign handlers from non-cross-context port implementations', () => {
        const files = Object.fromEntries(
            ['api', 'prisma', 'in-memory', 'stub', 'custom', 'in-process'].map(
                (label) => [
                    `${sales}/infrastructure/application-adapters/${label}/cross-context-invoice.ts`,
                    "import type { InvoiceQuery } from '../../../../billing/application/queries/invoice-query'"
                ]
            )
        );
        expect(
            lint(files).filter((violation) =>
                violation.rule.includes('imports another context:')
            )
        ).toHaveLength(6);
    });

    test('commands and queries cannot directly import foreign handlers even under a cross-context label', () => {
        const files = Object.fromEntries(
            ['queries', 'commands'].map((kind) => [
                `${sales}/infrastructure/${kind}/cross-context/cross-context-invoice-${kind === 'queries' ? 'query' : 'command'}.ts`,
                `import type { InvoiceQuery } from '../../../../billing/application/queries/invoice-query'
import type { PayCommand } from '../../../../billing/application/commands/pay-command'
import type { RefundUseCase } from '../../../../billing/application/use-cases/refund-use-case'`
            ])
        );
        expect(
            lint(files).filter((violation) =>
                violation.rule.includes('imports another context:')
            )
        ).toHaveLength(6);
    });

    test('restricts foreign wire dependencies per port adapter in a mixed factory', () => {
        const files = {
            [`${billing}/wiring/queries/wire-invoice-query.ts`]: `import { InvoiceQuery } from '../../application/queries/invoice-query'
export const wireInvoiceQuery = wireClass(InvoiceQuery, [])`,
            [`${sales}/wiring/application-ports/wire-invoice.ts`]: `import { CrossContextInvoice } from '../../infrastructure/application-adapters/cross-context/cross-context-invoice'
import { ApiInvoice } from '../../infrastructure/application-adapters/api/api-invoice'
import { wireInvoiceQuery as wireBillingInvoiceQuery } from '../../../billing/wiring/queries/wire-invoice-query'
const wireCrossContext = wireClass(CrossContextInvoice, [wireBillingInvoiceQuery])
const wireApi = wireClass(ApiInvoice, [wireBillingInvoiceQuery])
export const wireInvoice = envBranchedWire({ development: wireCrossContext, production: wireApi })`
        };
        expect(
            lint(files).filter((violation) =>
                violation.rule.includes('wiring:')
            )
        ).toEqual([
            {
                rule: "[sales] wiring: a dependency the dependency rules don't allow:",
                file: `${sales}/wiring/application-ports/wire-invoice.ts`,
                line: 5
            }
        ]);
        expect(
            lint({
                ...files,
                [`${sales}/wiring/application-ports/wire-invoice.ts`]: files[
                    `${sales}/wiring/application-ports/wire-invoice.ts`
                ].replace('development: wireCrossContext, ', '')
            }).some((violation) =>
                violation.rule.includes('imports another context:')
            )
        ).toBe(true);
    });

    test('allows cross-context port adapters to import all foreign application handler kinds', () => {
        expect(
            lint({
                'tsconfig.json':
                    '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
                [`${sales}/infrastructure/application-adapters/cross-context/cross-context-invoice.ts`]: `import type { InvoiceQuery } from '@/bounded-contexts/billing/application/queries/invoice-query'
import type { PayCommand } from '../../../../billing/application/commands/pay-command'
import type { RefundUseCase } from '../../../../billing/application/use-cases/refund-use-case'`,
                [`${sales}/wiring/application-ports/wire-invoice.ts`]: `import { wireInvoiceQuery as wireBillingInvoiceQuery } from '../../../billing/wiring/queries/wire-invoice-query'
import { CrossContextInvoice } from '../../infrastructure/application-adapters/cross-context/cross-context-invoice'
const wireImplementation = wireClass(CrossContextInvoice, [wireBillingInvoiceQuery])
export const wireInvoice = envBranchedWire({ development: wireImplementation })`
            })
        ).toEqual([]);
    });

    test('keeps foreign domain models, implementations and non-adapter consumers isolated', () => {
        const files = {
            [`${sales}/application/ports/invoice.ts`]:
                "import type { InvoiceQuery } from '../../../billing/application/queries/invoice-query'",
            [`${sales}/application/use-cases/pay-use-case.ts`]:
                "import type { PayCommand } from '../../../billing/application/commands/pay-command'",
            [`${sales}/infrastructure/services/client-infrastructure-service.ts`]:
                "import type { InvoiceQuery } from '../../../billing/application/queries/invoice-query'",
            [`${sales}/infrastructure/application-adapters/cross-context/cross-context-invoice.ts`]: `import type { Invoice } from '../../../../billing/domain/entities/invoice.entity'
import type { BillingErrors } from '../../../../billing/domain/errors'
import type { InvoiceRepository } from '../../../../billing/domain/aggregates/invoice/invoice-repository'
import type { PrismaInvoiceQuery } from '../../../../billing/infrastructure/queries/prisma/prisma-invoice-query'
import type { Service } from '../../../../billing/application/services/invoice-application-service'
import type { PaymentGateway } from '../../../../billing/application/ports/payment-gateway'
import type { InvoiceQuery } from '../../../../billing/application/queries/invoice-query.spec'
export * from '../../../../billing/application/queries'`,
            [`${sales}/wiring/use-cases/wire-pay-use-case.ts`]:
                "import { wireInvoiceQuery } from '../../../billing/wiring/queries/wire-invoice-query'",
            [`${sales}/wiring/commands/wire-pay-command.ts`]:
                "import { wirePayCommand } from '../../../billing/wiring/commands/wire-pay-command'",
            'src/shared-kernel/infrastructure/application-adapters/cross-context/cross-context-invoice.ts':
                "import type { InvoiceQuery } from '../../../../bounded-contexts/billing/application/queries/invoice-query'"
        };
        expect(
            lint(files).filter((violation) =>
                violation.rule.includes('imports another context:')
            )
        ).toHaveLength(13);
        expect(
            lint(files).some((violation) =>
                violation.rule.startsWith('[shared-kernel]')
            )
        ).toBe(true);
    });

    test('checks aliased foreign wiring by its imported file', () => {
        expect(
            lint({
                'tsconfig.json':
                    '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
                [`${billing}/wiring/application-ports/wire-payment-gateway.ts`]: `import { PaymentGateway } from '../../application/ports/payment-gateway'
export const wirePaymentGateway = wireClass(PaymentGateway, [])`,
                [`${sales}/wiring/application-ports/wire-invoice.ts`]: `import { CrossContextInvoice } from '../../infrastructure/application-adapters/cross-context/cross-context-invoice'
import { wirePaymentGateway as wireForeignPort } from '@/bounded-contexts/billing/wiring/application-ports/wire-payment-gateway'
const wireImplementation = wireClass(CrossContextInvoice, [wireForeignPort])
export const wireInvoice = envBranchedWire({ development: wireImplementation })`
            }).filter((violation) => violation.rule.includes('wiring:'))
        ).toHaveLength(1);
    });

    test('finds nothing in a project that follows the rules', () => {
        expect(
            lint({
                [`${sales}/domain/aggregates/order/order.ts`]:
                    'export class Order {}',
                [`${sales}/application/use-cases/pay-use-case.ts`]:
                    "import { Order } from '../../domain/aggregates/order/order'",
                [`${sales}/infrastructure/commands/prisma/prisma-pay-command.ts`]: `import { PayCommand } from '../../../application/commands/pay-command'
import { PrismaInfrastructureService } from '../../services/prisma-infrastructure-service'`,
                [`${sales}/application/use-cases/pay-use-case.spec.ts`]:
                    "import { wirePayUseCase } from '../../wiring/use-cases/wire-pay-use-case'",
                'src/shared-kernel/presentation/services/errors.ts':
                    "import { SalesErrors } from '../../bounded-contexts/sales/domain/errors'"
            })
        ).toEqual([]);
    });

    test('reports imports of another context, through aliases too', () => {
        expect(
            lint({
                'tsconfig.json': `{
    // aliases
    "compilerOptions": { "paths": { "@/*": ["./src/*"] }, },
}`,
                [`${sales}/domain/a.ts`]: `import type { B } from '../../billing/domain/b'
import { C } from '@/bounded-contexts/billing/domain/c'`
            })
        ).toEqual([
            {
                rule: '[sales] imports another context:',
                file: `${sales}/domain/a.ts`,
                line: 1
            },
            {
                rule: '[sales] imports another context:',
                file: `${sales}/domain/a.ts`,
                line: 2
            }
        ]);
    });

    test('reports imports against the layers, except in specs', () => {
        expect(
            lint({
                [`${sales}/domain/a.ts`]:
                    "import { X } from '../application/use-cases/x'",
                [`${sales}/application/b.ts`]:
                    "import { Y } from '../infrastructure/y'",
                [`${sales}/infrastructure/c.ts`]:
                    "import { Z } from '../application/services/z'",
                [`${sales}/presentation/rest/d.ts`]:
                    "import { W } from '../../infrastructure/w'",
                [`${sales}/application/e.spec.ts`]:
                    "import { V } from '../infrastructure/v'"
            }).map((x) => x.file)
        ).toEqual([
            `${sales}/application/b.ts`,
            `${sales}/domain/a.ts`,
            `${sales}/infrastructure/c.ts`,
            `${sales}/presentation/rest/d.ts`
        ]);
    });

    test('reports module files importing what the dependency rules forbid', () => {
        expect(
            lint({
                [`${sales}/application/queries/summary-query.ts`]:
                    "import type { PayCommand } from '../commands/pay-command'",
                [`${sales}/application/use-cases/pay-use-case.ts`]:
                    "import { CancelUseCase } from './cancel-use-case'",
                [`${sales}/infrastructure/queries/prisma/prisma-order-query.ts`]: `import { OrderQuery } from '../../../application/queries/order-query'
import { ListQuery } from '../../../application/queries/list-query'`,
                [`${sales}/application/services/checkout-application-service.ts`]:
                    "import { PrismaOrderQuery } from '../../infrastructure/queries/prisma/prisma-order-query'"
            }).map((x) => `${x.rule} ${x.file}:${x.line}`)
        ).toEqual([
            `[sales] queries may not use commands (dependency rules): ${sales}/application/queries/summary-query.ts:1`,
            `[sales] application imports outside domain and application: ${sales}/application/services/checkout-application-service.ts:1`,
            `[sales] use-cases may not use use-cases (dependency rules): ${sales}/application/use-cases/pay-use-case.ts:1`,
            `[sales] queries may not use queries (dependency rules): ${sales}/infrastructure/queries/prisma/prisma-order-query.ts:2`
        ]);
    });

    test('follows the configured dependency rules and checks', () => {
        const files = {
            [`${sales}/application/use-cases/pay-use-case.ts`]:
                "import { CancelUseCase } from './cancel-use-case'",
            [`${sales}/domain/a.ts`]:
                'const a = new Date()\nconst b = process.env.LIMIT'
        };

        expect(
            lint(files, {
                rules: resolveDependencyRules({
                    'use-cases': { add: ['use-cases'] }
                }),
                checks: { clock: false, config: false }
            })
        ).toEqual([]);
    });

    test('reports React modules importing what they must not', () => {
        const react = 'src/presentation/react';
        expect(
            lint({
                [`${react}/ui-kit/button.tsx`]:
                    "import { A } from '../widgets/cart/cart-widget'",
                [`${react}/hooks/use-x.ts`]:
                    "import { Button } from '../ui-kit/button'",
                [`${react}/widgets/cart/cart-widget.tsx`]:
                    "import { B } from '../orders/orders-widget'",
                [`${react}/widgets/orders/orders-widget.tsx`]: `import type { C } from '../../../../bounded-contexts/sales/presentation/rest/c'
import { D } from '../../../../bounded-contexts/sales/presentation/rest/d'`
            }).map((x) => `${x.file}:${x.line}`)
        ).toEqual([
            `${react}/hooks/use-x.ts:1`,
            `${react}/ui-kit/button.tsx:1`,
            `${react}/widgets/cart/cart-widget.tsx:1`,
            `${react}/widgets/orders/orders-widget.tsx:2`
        ]);
    });

    test('reports wired dependencies the dependency rules forbid', () => {
        expect(
            lint({
                [`${sales}/wiring/commands/wire-pay-command.ts`]: `import { wireClass } from '@domain-first/wire'
import { InMemoryPayCommand } from '../../infrastructure/commands/in-memory/in-memory-pay-command'

const wireInMemoryImplementation = wireClass(InMemoryPayCommand, [])

export const wirePayCommand = envBranchedWire({ test: wireInMemoryImplementation })`,
                [`${sales}/wiring/queries/wire-summary-query.ts`]: `import { wireClass } from '@domain-first/wire'
import { InMemorySummaryQuery } from '../../infrastructure/queries/in-memory/in-memory-summary-query'
import { wirePayCommand } from '../commands/wire-pay-command'

const wireInMemoryImplementation = wireClass(InMemorySummaryQuery, [
    wirePayCommand
])

export const wireSummaryQuery = envBranchedWire({ test: wireInMemoryImplementation })`
            }).filter((x) => x.rule.includes('wiring'))
        ).toEqual([
            {
                rule: "[sales] wiring: a dependency the dependency rules don't allow:",
                file: `${sales}/wiring/queries/wire-summary-query.ts`,
                line: 6
            }
        ]);
    });

    for (const [title, specifier, extra] of [
        ['an ESM .js specifier', '../commands/wire-pay-command.js', {}],
        [
            'a barrel',
            '../commands',
            {
                [`${sales}/wiring/commands/index.ts`]:
                    "export * from './wire-pay-command'"
            }
        ]
    ] as const) {
        test(`reports forbidden wired dependencies imported through ${title}`, () => {
            expect(
                lint({
                    ...extra,
                    [`${sales}/wiring/commands/wire-pay-command.ts`]: `import { InMemoryPayCommand } from '../../infrastructure/commands/in-memory/in-memory-pay-command'
const wireInMemoryImplementation = wireClass(InMemoryPayCommand, [])
export const wirePayCommand = envBranchedWire({ test: wireInMemoryImplementation })`,
                    [`${sales}/wiring/queries/wire-summary-query.ts`]: `import { InMemorySummaryQuery } from '../../infrastructure/queries/in-memory/in-memory-summary-query'
import { wirePayCommand } from '${specifier}'
const wireInMemoryImplementation = wireClass(InMemorySummaryQuery, [wirePayCommand])
export const wireSummaryQuery = envBranchedWire({ test: wireInMemoryImplementation })`
                }).filter((x) => x.rule.includes('wiring'))
            ).toHaveLength(1);
        });
    }

    test('allows cross-context port adapters to use ESM .js specifiers', () => {
        expect(
            lint({
                [`${sales}/infrastructure/application-adapters/cross-context/cross-context-invoice.ts`]:
                    "import type { InvoiceQuery } from '../../../../billing/application/queries/invoice-query.js'",
                [`${billing}/wiring/queries/wire-invoice-query.ts`]: `import { InvoiceQuery } from '../../application/queries/invoice-query.js'
export const wireInvoiceQuery = wireClass(InvoiceQuery, [])`,
                [`${sales}/wiring/application-ports/wire-invoice.ts`]: `import { wireInvoiceQuery as wireBillingInvoiceQuery } from '../../../billing/wiring/queries/wire-invoice-query.js'
import { CrossContextInvoice } from '../../infrastructure/application-adapters/cross-context/cross-context-invoice.js'
const wireImplementation = wireClass(CrossContextInvoice, [wireBillingInvoiceQuery])
export const wireInvoice = envBranchedWire({ development: wireImplementation })`
            })
        ).toEqual([]);
    });

    test('reports reading the current time in domain and application', () => {
        expect(
            lint({
                [`${sales}/domain/a.ts`]:
                    'const a = new Date()\nconst b = new Date(value)',
                [`${sales}/application/b.ts`]: 'const now = Date.now()',
                [`${sales}/infrastructure/c.ts`]: 'const now = new Date()'
            }).map((x) => `${x.file}:${x.line}`)
        ).toEqual([`${sales}/domain/a.ts:1`, `${sales}/application/b.ts:1`]);
    });

    test('reports reading environment variables in domain and application', () => {
        expect(
            lint({
                'src/shared-kernel/domain/a.ts':
                    "const a = process.env.LIMIT\nconst b = process['env']\nconst c = process?.env",
                [`${sales}/application/b.ts`]:
                    'const { LIMIT } = process.env\nconst d = import.meta.env.LIMIT',
                [`${sales}/application/b.spec.ts`]: 'process.env.NODE_ENV',
                [`${sales}/infrastructure/c.ts`]: 'const url = process.env.URL',
                [`${sales}/wiring/d.ts`]: 'process.env.NODE_ENV'
            }).map((x) => `${x.rule} ${x.file}:${x.line}`)
        ).toEqual(
            [
                'src/shared-kernel/domain/a.ts:1',
                'src/shared-kernel/domain/a.ts:2',
                'src/shared-kernel/domain/a.ts:3',
                `${sales}/application/b.ts:1`,
                `${sales}/application/b.ts:2`
            ].map(
                (location) =>
                    `domain or application reads environment variables directly (use the config port): ${location}`
            )
        );
    });
});

describe('formatViolations', () => {
    test('groups violations under their rules', () => {
        const check = 'layers' as const;
        expect(
            formatViolations(
                [
                    {
                        check,
                        rule: 'A:',
                        file: '/p/x.ts',
                        line: 1,
                        text: 'one'
                    },
                    {
                        check,
                        rule: 'B:',
                        file: '/p/y.ts',
                        line: 2,
                        text: 'two'
                    },
                    {
                        check,
                        rule: 'A:',
                        file: '/p/z.ts',
                        line: 3,
                        text: 'three'
                    }
                ],
                '/p'
            )
        ).toBe('A:\n  x.ts:1: one\n  z.ts:3: three\n\nB:\n  y.ts:2: two');
    });
});
