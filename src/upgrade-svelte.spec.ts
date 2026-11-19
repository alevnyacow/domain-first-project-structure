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
import { discardPendingChanges, writePendingChanges } from './file-system';
import { planUpgrade } from './upgrade-steps';
import {
    svelteModelsStep,
    svelteSwaggerPackagesStep,
    svelteSwaggerPageStep,
    svelteToUIPropsManualStep,
    svelteToUIPropsStep
} from './upgrade-svelte';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-upgrade-svelte-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
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
beforeEach(() => {
    project = path.join(root, String(sequence++));
    fs.mkdirSync(project);
    write('package.json', '{}');
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
});
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});

const svelte = 'src/lib/presentation/svelte';
const config = (framework: 'svelte' | 'sveltekit' = 'sveltekit') => ({
    project: { rootFolder: 'src/lib' },
    frontend: { svelte: { framework } }
});

const legacySwaggerPage = (specImport: string) => `<script lang="ts" module>
    export type SwaggerPageProps = {}
</script>

<script lang="ts">
    import 'swagger-ui/dist/swagger-ui.css'
    import { onMount } from 'svelte'
    import spec from '${specImport}'

    let props: SwaggerPageProps = $props()
    let container: HTMLDivElement

    onMount(async () => {
        const { default: SwaggerUI } = await import('swagger-ui')
        SwaggerUI({ domNode: container, spec, displayOperationId: true })
    })
</script>

<div bind:this={container}></div>`;

test('the Svelte Swagger UI page moves to swagger-ui-dist; packages are replaced by hand', async () => {
    write(
        'package.json',
        JSON.stringify({
            dependencies: { 'swagger-ui': '*' },
            devDependencies: { '@types/swagger-ui': '*' }
        })
    );
    write(
        `${svelte}/pages/swagger-page.svelte`,
        legacySwaggerPage('../../../../../static/openapi.json')
    );
    const { planned } = await planUpgrade(config(), () => true, [
        svelteSwaggerPageStep,
        svelteSwaggerPackagesStep
    ]);
    expect(planned.map(({ step }) => step.id)).toEqual([
        'svelte-swagger-ui-dist',
        'svelte-swagger-ui-dist-packages'
    ]);
    expect(planned[1].changes).toEqual([
        'npm uninstall swagger-ui @types/swagger-ui',
        'npm install swagger-ui-dist',
        'npm install --save-dev @types/swagger-ui-dist'
    ]);
    writePendingChanges();
    const page = read(`${svelte}/pages/swagger-page.svelte`);
    expect(page).toContain("import 'swagger-ui-dist/swagger-ui.css'");
    expect(page).toContain("'swagger-ui-dist/swagger-ui-bundle.js'");
    // SvelteKit serves static/: the page fetches the document
    expect(page).toContain("url: '/openapi.json'");
    expect(page).not.toContain('import spec');
    expect(
        (await planUpgrade(config(), () => true, [svelteSwaggerPageStep]))
            .planned
    ).toEqual([]);
});

test('without SvelteKit, the regenerated page keeps importing the document', async () => {
    write(
        `${svelte}/pages/swagger-page.svelte`,
        legacySwaggerPage('../../../../../openapi.json')
    );
    await planUpgrade(config('svelte'), () => true, [svelteSwaggerPageStep]);
    writePendingChanges();
    const page = read(`${svelte}/pages/swagger-page.svelte`);
    expect(page).toContain("import spec from '../../../../../openapi.json'");
    expect(page).toContain('SwaggerUIBundle({ domNode: container, spec,');
});

test('Svelte shared hooks of 8.11 become shared models with create functions', async () => {
    write(
        `${svelte}/widgets/orders/orders-widget.svelte`,
        `<script lang="ts">
    import { useDebounce } from '../../hooks/use-debounce.svelte'
    useDebounce()
</script>`
    );
    write(
        `${svelte}/hooks/use-debounce.svelte.ts`,
        `export const useDebounce = () => {
    return {}
}`
    );
    const { planned } = await planUpgrade(config(), () => true, [
        svelteModelsStep
    ]);
    expect(planned[0].changes).toEqual([
        `${svelte}/hooks/use-debounce.svelte.ts → ${svelte}/shared/model/create-debounce.svelte.ts`,
        '  useDebounce → createDebounce'
    ]);
    writePendingChanges();
    expect(
        read(`${svelte}/widgets/orders/orders-widget.svelte`)
    ).toBe(`<script lang="ts">
    import { createDebounce } from '../../shared/model/create-debounce.svelte'
    createDebounce()
</script>`);
    expect(read(`${svelte}/shared/model/create-debounce.svelte.ts`)).toContain(
        'export const createDebounce = () =>'
    );
    expect(exists(`${svelte}/hooks`)).toBe(false);
});

const widget811 = `${svelte}/widgets/admin/orders`;
const write811Widget = (model: string) => {
    write(
        `${widget811}/admin-orders-widget.svelte`,
        `<script lang="ts">
    import type { AdminOrdersWidgetProps } from './types'
    import AdminOrdersWidgetUI from './ui/admin-orders-widget-ui.svelte'
    import { useAdminOrdersUIModel } from './hooks/use-admin-orders-ui-model.svelte'

    let props: AdminOrdersWidgetProps = $props()
    const uiModel = useAdminOrdersUIModel(props)
</script>

<AdminOrdersWidgetUI {...uiModel} />`
    );
    write(`${widget811}/hooks/use-admin-orders-ui-model.svelte.ts`, model);
};

test('8.11 UI models that only map props move into toUIProps of the widget', async () => {
    write811Widget(`import type { AdminOrdersWidgetProps, AdminOrdersWidgetUIProps } from '../types'

export const useAdminOrdersUIModel = (widgetProps: AdminOrdersWidgetProps): AdminOrdersWidgetUIProps => {
    return {
        title: widgetProps.title,
        total: widgetProps.items.length,
    }
}`);
    const { planned } = await planUpgrade(config(), () => true, [
        svelteToUIPropsStep,
        svelteToUIPropsManualStep
    ]);
    expect(planned.map(({ step }) => step.id)).toEqual(['svelte-to-ui-props']);
    expect(planned[0].changes).toEqual([
        `${widget811}/hooks/use-admin-orders-ui-model.svelte.ts → toUIProps in ${widget811}/admin-orders-widget.svelte; the model file is deleted`
    ]);
    writePendingChanges();
    expect(
        read(`${widget811}/admin-orders-widget.svelte`)
    ).toBe(`<script lang="ts">
    import type { AdminOrdersWidgetProps, AdminOrdersWidgetUIProps } from './types'
    import AdminOrdersWidgetUI from './ui/admin-orders-widget-ui.svelte'

    let props: AdminOrdersWidgetProps = $props()
    const toUIProps = (): AdminOrdersWidgetUIProps => ({
        title: props.title,
        total: props.items.length,
    })
</script>

<AdminOrdersWidgetUI {...toUIProps()} />`);
    expect(exists(`${widget811}/hooks`)).toBe(false);
    expect(
        (
            await planUpgrade(config(), () => true, [
                svelteToUIPropsStep,
                svelteToUIPropsManualStep
            ])
        ).planned
    ).toEqual([]);
});

test('8.12 headless UI models move into toUIProps with the widget props name', async () => {
    const widget = `${svelte}/widgets/carts`;
    write(
        `${widget}/carts-widget.svelte`,
        `<script lang="ts">
    import type { CartsWidgetProps } from './types'
    import { createCartsUIModel } from './model/create-carts-ui-model.svelte'

    let { UI, ...widgetProps }: CartsWidgetProps = $props()
    // The rest of $props() stays reactive, a copy made by hand would not
    // svelte-ignore state_referenced_locally
    const uiModel = createCartsUIModel(widgetProps)
</script>

<UI {...uiModel} />`
    );
    write(
        `${widget}/model/create-carts-ui-model.svelte.ts`,
        `import type { CartsWidgetProps, CartsWidgetUIProps } from '../types'

/**
 * - widgetProps is the $props() proxy as a whole: destructuring it in the
 *   signature (({ a }) =>) or copying it ({ ...props }) loses reactivity
 */
export const createCartsUIModel = (
    widgetProps: Omit<CartsWidgetProps, 'UI'>,
): CartsWidgetUIProps => {
    // derived values go here
    // const value = $derived(widgetProps.value)

    return {
        // expose values via getters to keep reactivity:
        // get value() { return value },
    }
}`
    );
    await planUpgrade(config(), () => true, [svelteToUIPropsStep]);
    writePendingChanges();
    expect(read(`${widget}/carts-widget.svelte`)).toBe(`<script lang="ts">
    import type { CartsWidgetProps, CartsWidgetUIProps } from './types'

    let { UI, ...widgetProps }: CartsWidgetProps = $props()
    const toUIProps = (): CartsWidgetUIProps => ({})
</script>

<UI {...toUIProps()} />`);
    expect(exists(`${widget}/model`)).toBe(false);
});

test('UI models with state, getters or other imports are listed for a manual move', async () => {
    write811Widget(`import type { AdminOrdersWidgetProps, AdminOrdersWidgetUIProps } from '../types'

export const useAdminOrdersUIModel = (widgetProps: AdminOrdersWidgetProps): AdminOrdersWidgetUIProps => {
    let open = $state(false)
    return {
        get open() { return open },
        toggle: () => { open = !open },
    }
}`);
    const { planned } = await planUpgrade(config(), () => true, [
        svelteToUIPropsStep,
        svelteToUIPropsManualStep
    ]);
    expect(planned.map(({ step }) => step.id)).toEqual([
        'svelte-to-ui-props-manual'
    ]);
    expect(planned[0].changes).toEqual([
        `${widget811}/hooks/use-admin-orders-ui-model.svelte.ts: move its state and methods into the <script> of ${widget811}/admin-orders-widget.svelte, map props in toUIProps and render {...toUIProps()}, then delete the model`
    ]);
    for (const model of [
        `import { format } from '../format'
import type { AdminOrdersWidgetProps, AdminOrdersWidgetUIProps } from '../types'

export const useAdminOrdersUIModel = (widgetProps: AdminOrdersWidgetProps): AdminOrdersWidgetUIProps => ({ title: format(widgetProps.title) })`,
        `export const useAdminOrdersUIModel = (widgetProps) => ({ ...widgetProps })`,
        `export const useAdminOrdersUIModel = (widgetProps) => {
    const title = widgetProps.title
    return { title }
}`
    ]) {
        write811Widget(model);
        expect(
            (await planUpgrade(config(), () => true, [svelteToUIPropsStep]))
                .planned
        ).toEqual([]);
    }
});

test('React projects keep their hooks', async () => {
    write(
        'src/lib/presentation/react/hooks/use-debounce.ts',
        'export const useDebounce = () => ({})'
    );
    const { planned } = await planUpgrade(
        {
            project: { rootFolder: 'src/lib' },
            frontend: { react: { framework: 'react' } }
        },
        () => true,
        [
            svelteModelsStep,
            svelteToUIPropsStep,
            svelteToUIPropsManualStep,
            svelteSwaggerPageStep,
            svelteSwaggerPackagesStep
        ]
    );
    expect(planned).toEqual([]);
});
