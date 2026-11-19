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
import { ConfigFile } from './config-file';
import { discardPendingChanges, writePendingChanges } from './file-system';
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
    Separator: class {}
}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-svelte-'));
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
const svelteFolder = 'src/lib/presentation/svelte';
beforeEach(() => {
    project = path.join(root, String(sequence++));
    fs.mkdirSync(project);
    write('package.json', '{}');
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    ConfigFile.write({
        project: { rootFolder: 'src/lib' },
        frontend: { svelte: { framework: 'sveltekit' } }
    });
    writePendingChanges();
    rstest.clearAllMocks();
});
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('SvelteKit pages get a route that renders the page component', async () => {
    const result = await executeAgentRequest('df-svelte', {
        operation: 'page',
        name: 'admin/users'
    });
    expect(result.files.created).toEqual([
        `${svelteFolder}/pages/admin/admin-users-page.svelte`,
        'src/routes/admin/users/+page.svelte'
    ]);
    expect(read('src/routes/admin/users/+page.svelte')).toBe(`<script lang="ts">
    import AdminUsersPage from '../../../lib/presentation/svelte/pages/admin/admin-users-page.svelte'
</script>

<AdminUsersPage />`);
    expect(read(`${svelteFolder}/pages/admin/admin-users-page.svelte`)).toBe(
        `<script lang="ts" module>
    export type AdminUsersPageProps = {}
</script>

<script lang="ts">
    let props: AdminUsersPageProps = $props()
</script>`
    );
});

test('moving a SvelteKit page moves its route files and renames the component', async () => {
    await executeAgentRequest('df-svelte', {
        operation: 'page',
        name: 'admin/users'
    });
    write('src/routes/admin/users/+page.ts', 'export const load = () => ({})');
    write('src/routes/admin/users/[id]/+page.svelte', '<p>user</p>');
    await executeAgentRequest('df-svelte', {
        operation: 'move-page',
        module: 'admin/users',
        name: 'backoffice/users'
    });
    expect(exists(`${svelteFolder}/pages/admin/admin-users-page.svelte`)).toBe(
        false
    );
    expect(
        exists(`${svelteFolder}/pages/backoffice/backoffice-users-page.svelte`)
    ).toBe(true);
    expect(exists('src/routes/admin/users/+page.svelte')).toBe(false);
    expect(exists('src/routes/admin/users/[id]/+page.svelte')).toBe(true);
    expect(read('src/routes/backoffice/users/+page.ts')).toBe(
        'export const load = () => ({})'
    );
    expect(
        read('src/routes/backoffice/users/+page.svelte')
    ).toBe(`<script lang="ts">
    import BackofficeUsersPage from '../../../lib/presentation/svelte/pages/backoffice/backoffice-users-page.svelte'
</script>

<BackofficeUsersPage />`);
});

test('a page used by its route is deleted together with the route', async () => {
    await executeAgentRequest('df-svelte', {
        operation: 'page',
        name: 'orders'
    });
    const result = await executeAgentRequest('df-svelte', {
        operation: 'delete-page',
        module: 'orders'
    });
    expect(result.files.deleted).toEqual(
        expect.arrayContaining([
            `${svelteFolder}/pages/orders-page.svelte`,
            'src/routes/orders/+page.svelte'
        ])
    );
    await executeAgentRequest('df-svelte', {
        operation: 'page',
        name: 'carts'
    });
    await expect(
        executeAgentRequest('df-svelte', {
            operation: 'delete-page',
            module: 'carts',
            deleteRoute: false
        })
    ).rejects.toMatchObject({ code: 'DELETE_NOT_ALLOWED' });
});

test('widgets with separated UI map props with toUIProps and get stories', async () => {
    ConfigFile.update({
        frontend: {
            svelte: {
                framework: 'svelte',
                storybookFramework: '@storybook/svelte-vite'
            }
        }
    });
    writePendingChanges();
    const result = await executeAgentRequest('df-svelte', {
        operation: 'widget',
        name: 'admin/orders',
        widgetType: 'separated'
    });
    const widget = `${svelteFolder}/widgets/admin/orders`;
    expect(result.files.created.sort()).toEqual(
        [
            `${widget}/index.ts`,
            `${widget}/types.ts`,
            `${widget}/admin-orders-widget.svelte`,
            `${widget}/ui/admin-orders-widget-ui.svelte`,
            `${widget}/ui/admin-orders-widget-ui.stories.ts`
        ].sort()
    );
    expect(read(`${widget}/index.ts`)).toContain(
        "export { default as AdminOrdersWidget } from './admin-orders-widget.svelte'"
    );
    expect(
        read(`${widget}/admin-orders-widget.svelte`)
    ).toBe(`<script lang="ts">
    import type { AdminOrdersWidgetProps, AdminOrdersWidgetUIProps } from './types'
    import AdminOrdersWidgetUI from './ui/admin-orders-widget-ui.svelte'

    let props: AdminOrdersWidgetProps = $props()

    const toUIProps = (): AdminOrdersWidgetUIProps => ({})
</script>

<AdminOrdersWidgetUI {...toUIProps()} />`);
    const story = read(`${widget}/ui/admin-orders-widget-ui.stories.ts`);
    expect(story).toContain(
        "import type { Meta, StoryObj } from '@storybook/svelte-vite'"
    );
    expect(story).toContain(`export const Default: Story = {
    // fill required props of AdminOrdersWidgetUIProps
    args: {}
}`);
    // No route for plain Svelte pages
    const page = await executeAgentRequest('df-svelte', {
        operation: 'page',
        name: 'orders'
    });
    expect(page.files.created).toEqual([
        `${svelteFolder}/pages/orders-page.svelte`
    ]);
});

test('moving a widget renames its files, imports and story title', async () => {
    ConfigFile.update({
        frontend: {
            svelte: {
                framework: 'sveltekit',
                storybookFramework: '@storybook/sveltekit'
            }
        }
    });
    writePendingChanges();
    await executeAgentRequest('df-svelte', {
        operation: 'widget',
        name: 'orders'
    });
    write(
        `${svelteFolder}/pages/shop-page.svelte`,
        `<script lang="ts">
    import { OrdersWidget } from '../widgets/orders'
</script>

<OrdersWidget />`
    );
    await executeAgentRequest('df-svelte', {
        operation: 'move-widget',
        module: 'orders',
        name: 'sales/purchases'
    });
    const widget = `${svelteFolder}/widgets/sales/purchases`;
    expect(
        read(`${svelteFolder}/pages/shop-page.svelte`)
    ).toBe(`<script lang="ts">
    import { SalesPurchasesWidget } from '../widgets/sales/purchases'
</script>

<SalesPurchasesWidget />`);
    const moved = read(`${widget}/sales-purchases-widget.svelte`);
    expect(moved).toContain(
        "import SalesPurchasesWidgetUI from './ui/sales-purchases-widget-ui.svelte'"
    );
    expect(moved).toContain(
        'const toUIProps = (): SalesPurchasesWidgetUIProps => ({})'
    );
    expect(read(`${widget}/ui/sales-purchases-widget-ui.stories.ts`)).toContain(
        "title: 'Widgets/Sales/Purchases'"
    );
});

test('headless widgets map the reactive rest of $props() with toUIProps', async () => {
    const result = await executeAgentRequest('df-svelte', {
        operation: 'widget',
        name: 'orders',
        widgetType: 'headless'
    });
    const widget = `${svelteFolder}/widgets/orders`;
    expect(result.files.created.sort()).toEqual(
        [
            `${widget}/index.ts`,
            `${widget}/types.ts`,
            `${widget}/orders-widget.svelte`
        ].sort()
    );
    expect(read(`${widget}/orders-widget.svelte`)).toBe(`<script lang="ts">
    import type { OrdersWidgetProps, OrdersWidgetUIProps } from './types'

    let { UI, ...rest }: OrdersWidgetProps = $props()

    const toUIProps = (): OrdersWidgetUIProps => ({})
</script>

<UI {...toUIProps()} />`);
});

test('UI-kit components and shared models are listed, moved and deleted', async () => {
    await executeAgentRequest('df-svelte', {
        operation: 'ui-kit-component',
        name: 'button'
    });
    await executeAgentRequest('df-svelte', {
        operation: 'shared-model',
        name: 'create-debounce'
    });
    expect(read(`${svelteFolder}/ui-kit/button/index.ts`)).toContain(
        "export { default as Button } from './button.svelte'"
    );
    expect(
        read(`${svelteFolder}/shared/model/create-debounce.svelte.ts`)
    ).toContain('export const createDebounce = () =>');
    expect(
        (describeAgentCommand('df-svelte').project as any).svelteModules
    ).toEqual([
        {
            kind: 'ui-kit',
            name: 'button',
            file: `${svelteFolder}/ui-kit/button`
        },
        {
            kind: 'model',
            name: 'debounce',
            file: `${svelteFolder}/shared/model/create-debounce.svelte.ts`
        }
    ]);
    await executeAgentRequest('df-svelte', {
        operation: 'move-shared-model',
        module: 'debounce',
        name: 'throttle'
    });
    expect(
        read(`${svelteFolder}/shared/model/create-throttle.svelte.ts`)
    ).toContain('export const createThrottle = () =>');
    // React operation names are not Svelte ones
    await expect(
        executeAgentRequest('df-svelte', {
            operation: 'shared-hook',
            name: 'debounce'
        })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await executeAgentRequest('df-svelte', {
        operation: 'delete-shared-model',
        module: 'throttle'
    });
    expect(exists(`${svelteFolder}/shared`)).toBe(false);
    await executeAgentRequest('df-svelte', {
        operation: 'delete-ui-kit-component',
        module: 'button'
    });
    expect(exists(`${svelteFolder}/ui-kit/button`)).toBe(false);
});

test('df-svelte needs frontend.svelte and df-react frontend.react', async () => {
    await expect(
        executeAgentRequest('df-react', { operation: 'page', name: 'orders' })
    ).rejects.toMatchObject({ code: 'FRONTEND_NOT_CONFIGURED' });
    ConfigFile.update({ frontend: { react: { framework: 'react' } } });
    writePendingChanges();
    await expect(
        executeAgentRequest('df-svelte', { operation: 'page', name: 'orders' })
    ).rejects.toMatchObject({ code: 'FRONTEND_NOT_CONFIGURED' });
});

test('df-lint applies the frontend rules to Svelte modules', async () => {
    await executeAgentRequest('df-svelte', {
        operation: 'widget',
        name: 'orders',
        widgetType: 'monolithic'
    });
    await executeAgentRequest('df-svelte', {
        operation: 'widget',
        name: 'carts',
        widgetType: 'monolithic'
    });
    write(
        `${svelteFolder}/widgets/carts/carts-widget.svelte`,
        `<script lang="ts">
    import { OrdersWidget } from '../orders'
</script>`
    );
    write(
        `${svelteFolder}/ui-kit/button/button.svelte`,
        `<script lang="ts">
    import { OrdersWidget } from '../../widgets/orders'
</script>`
    );
    write(
        `${svelteFolder}/shared/model/create-cart.svelte.ts`,
        "import { OrdersWidget } from '../../widgets/orders'"
    );
    const rules = lintProject(project, 'src/lib').map(
        (violation) => violation.rule
    );
    expect(rules).toEqual(
        expect.arrayContaining([
            '[presentation/svelte/widgets] a widget imports another widget:',
            '[presentation/svelte/ui-kit] imports a bounded context, widget or page:',
            '[presentation/svelte/shared/model] a shared model imports a bounded context, UI-kit, widget or page:'
        ])
    );
});
