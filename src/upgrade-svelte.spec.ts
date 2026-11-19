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
    svelteSwaggerPageStep
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

test('Svelte widget hooks and shared hooks become models with create functions', async () => {
    const widget = `${svelte}/widgets/admin/orders`;
    write(
        `${widget}/admin-orders-widget.svelte`,
        `<script lang="ts">
    import type { AdminOrdersWidgetProps } from './types'
    import AdminOrdersWidgetUI from './ui/admin-orders-widget-ui.svelte'
    import { useAdminOrdersUIModel } from './hooks/use-admin-orders-ui-model.svelte'

    let props: AdminOrdersWidgetProps = $props()
    const uiModel = useAdminOrdersUIModel(props)
</script>

<AdminOrdersWidgetUI {...uiModel} />`
    );
    write(
        `${widget}/hooks/use-admin-orders-ui-model.svelte.ts`,
        `import type { AdminOrdersWidgetProps, AdminOrdersWidgetUIProps } from '../types'
import { useDebounce } from '../../../../hooks/use-debounce.svelte'

export const useAdminOrdersUIModel = (widgetProps: AdminOrdersWidgetProps): AdminOrdersWidgetUIProps => {
    useDebounce()
    return {}
}`
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
        `${widget}/hooks/use-admin-orders-ui-model.svelte.ts → ${widget}/model/create-admin-orders-ui-model.svelte.ts`,
        '  useAdminOrdersUIModel → createAdminOrdersUIModel',
        `${svelte}/hooks/use-debounce.svelte.ts → ${svelte}/shared/model/create-debounce.svelte.ts`,
        '  useDebounce → createDebounce'
    ]);
    writePendingChanges();
    expect(read(`${widget}/admin-orders-widget.svelte`)).toContain(
        `    import { createAdminOrdersUIModel } from './model/create-admin-orders-ui-model.svelte'

    let props: AdminOrdersWidgetProps = $props()
    const uiModel = createAdminOrdersUIModel(props)`
    );
    expect(
        read(`${widget}/model/create-admin-orders-ui-model.svelte.ts`)
    ).toBe(`import type { AdminOrdersWidgetProps, AdminOrdersWidgetUIProps } from '../types'
import { createDebounce } from '../../../../shared/model/create-debounce.svelte'

export const createAdminOrdersUIModel = (widgetProps: AdminOrdersWidgetProps): AdminOrdersWidgetUIProps => {
    createDebounce()
    return {}
}`);
    expect(read(`${svelte}/shared/model/create-debounce.svelte.ts`)).toContain(
        'export const createDebounce = () =>'
    );
    expect(exists(`${widget}/hooks`)).toBe(false);
    expect(exists(`${svelte}/hooks`)).toBe(false);
    expect(
        (await planUpgrade(config(), () => true, [svelteModelsStep])).planned
    ).toEqual([]);
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
        [svelteModelsStep, svelteSwaggerPageStep, svelteSwaggerPackagesStep]
    );
    expect(planned).toEqual([]);
});
