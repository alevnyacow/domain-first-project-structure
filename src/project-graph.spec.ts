import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, test } from '@rstest/core';
import {
    contextMap,
    formatOfFile,
    mermaidScript,
    ownerGraph,
    projectGraph,
    renderGraph
} from './project-graph';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-graph-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const files: Record<string, string> = {
    'src/shared-kernel/wiring/infrastructure-services/wire-prisma-infrastructure-service.ts': `import { PrismaInfrastructureService } from '../../infrastructure/services/prisma-infrastructure-service'
export const wirePrismaInfrastructureService = wireClass(PrismaInfrastructureService, [])`,
    'src/bounded-contexts/sales/wiring/queries/wire-invoice-query.ts': `import { PrismaInvoiceQuery } from '../../infrastructure/queries/prisma/prisma-invoice-query'
import { FakeInvoiceQuery } from '../../infrastructure/queries/fake/fake-invoice-query'
import { wirePrismaInfrastructureService } from '../../../../shared-kernel/wiring/infrastructure-services/wire-prisma-infrastructure-service'
const wirePrismaImplementation = wireClass(PrismaInvoiceQuery, [wirePrismaInfrastructureService])
const wireFakeImplementation = wireClass(FakeInvoiceQuery, [])
export const wireInvoiceQuery = envBranchedWire({ test: wireFakeImplementation, development: wirePrismaImplementation, production: wirePrismaImplementation })`,
    'tsconfig.json':
        '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
    'src/bounded-contexts/billing/wiring/application-ports/wire-order-refunds.ts': `import { CrossContextOrderRefunds } from '../../infrastructure/application-adapters/cross-context/cross-context-order-refunds'
import { StubOrderRefunds } from '../../infrastructure/application-adapters/stub/stub-order-refunds'
import { wireInvoiceQuery as wireSalesInvoiceQuery } from '@/bounded-contexts/sales/wiring/queries/wire-invoice-query'
const wireCrossContextImplementation = wireClass(CrossContextOrderRefunds, [wireSalesInvoiceQuery])
const wireStubImplementation = wireClass(StubOrderRefunds, [])
export const wireOrderRefunds = envBranchedWire({ test: wireStubImplementation, development: wireCrossContextImplementation, production: wireCrossContextImplementation })`,
    'src/bounded-contexts/billing/wiring/use-cases/wire-refund-use-case.ts': `import { RefundUseCase } from '../../application/use-cases/refund-use-case'
import { wireOrderRefunds } from '../application-ports/wire-order-refunds'
export const wireRefundUseCase = wireClass(RefundUseCase, [wireOrderRefunds])`
};
for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
}
fs.mkdirSync(path.join(root, 'src/bounded-contexts/catalog'));
const graph = projectGraph(root, 'src');

test('reads owners, wired modules and the dependencies of each implementation', () => {
    expect(graph.owners).toEqual([
        'shared-kernel',
        'billing',
        'catalog',
        'sales'
    ]);
    expect(
        graph.modules.map(({ id, layer, implementations }) => [
            id,
            layer,
            implementations
        ])
    ).toEqual(
        expect.arrayContaining([
            [
                'shared-kernel:PrismaInfrastructureService',
                'infrastructure',
                ['PrismaInfrastructureService']
            ],
            [
                'sales:InvoiceQuery',
                'application',
                ['PrismaInvoiceQuery', 'FakeInvoiceQuery']
            ],
            [
                'billing:OrderRefunds',
                'application',
                ['CrossContextOrderRefunds', 'StubOrderRefunds']
            ],
            ['billing:RefundUseCase', 'application', ['RefundUseCase']]
        ])
    );
    expect(graph.edges).toEqual(
        expect.arrayContaining([
            {
                from: 'sales:InvoiceQuery',
                to: 'shared-kernel:PrismaInfrastructureService',
                implementation: 'PrismaInvoiceQuery'
            },
            {
                from: 'billing:OrderRefunds',
                to: 'sales:InvoiceQuery',
                implementation: 'CrossContextOrderRefunds'
            },
            {
                from: 'billing:RefundUseCase',
                to: 'billing:OrderRefunds',
                implementation: 'RefundUseCase'
            }
        ])
    );
    expect(graph.edges).toHaveLength(3);
});

test('the context map shows cross-context ports and Shared Kernel use, every context listed', () => {
    expect(contextMap(graph)).toBe(`flowchart LR
    shared_kernel[("shared-kernel")]
    billing["billing"]
    catalog["catalog"]
    sales["sales"]
    billing -->|"OrderRefunds → InvoiceQuery"| sales
    sales -.->|"PrismaInfrastructureService"| shared_kernel`);
});

test('a context graph groups modules by layer and names implementations only for partial dependencies', () => {
    expect(ownerGraph(graph, 'billing')).toBe(`flowchart TB
    subgraph billing_application["application"]
        billing_OrderRefunds["OrderRefunds"]
        billing_RefundUseCase["RefundUseCase"]
    end
    subgraph owner_sales["sales"]
        sales_InvoiceQuery["InvoiceQuery"]
    end
    billing_OrderRefunds -->|"CrossContextOrderRefunds"| sales_InvoiceQuery
    billing_RefundUseCase --> billing_OrderRefunds`);
});

test('--out picks the format from the file extension', () => {
    expect(formatOfFile('docs/ARCHITECTURE.md')).toBe('markdown');
    expect(formatOfFile('graph.mmd')).toBe('mermaid');
    expect(formatOfFile('graph.MERMAID')).toBe('mermaid');
    expect(formatOfFile('graph.json')).toBe('json');
    expect(formatOfFile('graph.html')).toBe('html');
    expect(formatOfFile('graph.svg')).toBeUndefined();
});

test('markdown and JSON render the map or one owner', () => {
    expect(renderGraph(graph, 'markdown')).toBe(
        `\`\`\`mermaid\n${contextMap(graph)}\n\`\`\``
    );
    const billing = JSON.parse(
        renderGraph(graph, 'json', { owner: 'billing' })
    );
    expect(billing.owners).toEqual(['billing']);
    expect(billing.modules.map(({ id }: { id: string }) => id).sort()).toEqual([
        'billing:OrderRefunds',
        'billing:RefundUseCase'
    ]);
    expect(billing.edges).toHaveLength(2);
});

test('the HTML page renders the map and every context with modules, escaped for HTML', () => {
    const page = renderGraph(graph, 'html', { title: 'shop <api>' });
    expect(page).toContain('<title>shop &lt;api&gt;</title>');
    expect(page).toContain(`import mermaid from '${mermaidScript}'`);
    expect(page.match(/<h2>/g)).toHaveLength(4);
    expect(page).toContain('<h2>Bounded contexts</h2>');
    expect(page).not.toContain('<h2>catalog</h2>');
    // Each chart has its own node IDs.
    expect(page).toContain('c2_billing_OrderRefunds');
    expect(page).toContain('c3_sales_InvoiceQuery');
    expect(page).toContain(
        'c0_billing --&gt;|&quot;OrderRefunds → InvoiceQuery&quot;| c0_sales'
    );
    const one = renderGraph(graph, 'html', { title: 'shop', owner: 'billing' });
    expect(one.match(/<h2>/g)).toHaveLength(1);
    expect(one).toContain('<h2>billing</h2>');
});
