import path from 'node:path';
import { ConfigFile } from '../config-file';
import { File, type Folder } from '../file-system';
import { input, report, select } from '../interaction';
import { NestedName } from '../nested-name';
import { ProjectRoot } from '../project-root';
import { routePageFile } from '../react-module-move';
import { svelteKitRoutesFolder, usesSvelteKit } from '../sveltekit-app';
import { UnknownFormatNaming } from '../unknown-format-naming';

/**
 * A Svelte 5 component: the props type is exported from the module
 * script, so importers can use it as with `export type` in React.
 */
export const svelteComponentContent = (propsType: string) =>
    `
<script lang="ts" module>
    export type ${propsType} = {}
</script>

<script lang="ts">
    let props: ${propsType} = $props()
</script>
`.trim();

/**
 * A CSF story of a Svelte component, typed by the Storybook framework.
 * svelte-check flags `args: {}` once the props have a required field, so
 * the story says where they go.
 */
const svelteStory = (
    storybookFramework: string,
    componentName: string,
    componentFile: string,
    title: string,
    propsType: string
) =>
    `
import type { Meta, StoryObj } from '${storybookFramework}'
import ${componentName} from './${componentFile}'

const meta = {
    title: '${title}',
    component: ${componentName}
} satisfies Meta<typeof ${componentName}>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
    // fill required props of ${propsType}
    args: {}
}
`.trim();

const storybookFramework = () =>
    ConfigFile.Instance.data.frontend?.svelte?.storybookFramework;

/** A thin SvelteKit route that renders the page component. */
export const svelteKitRouteContent = (ClassName: string, pageImport: string) =>
    `
<script lang="ts">
    import ${ClassName}Page from '${pageImport}'
</script>

<${ClassName}Page />
`.trim();

const relativeImport = (fromFile: string, toFile: string) => {
    const relative = path
        .relative(path.dirname(fromFile), toFile)
        .split(path.sep)
        .join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
};

/**
 * With SvelteKit, the page also gets its route at the same path, e.g.
 * `admin/users` → `src/routes/admin/users/+page.svelte`. An existing route
 * is kept: it may hold the user's code, and the returned hint says so.
 */
export const scaffoldSvelteKitRoute = (
    name: NestedName,
    pagePath: string
): string | undefined => {
    const root = new ProjectRoot().path;
    const route = path.join(
        root,
        svelteKitRoutesFolder(root),
        ...name.folders,
        name.folderName,
        routePageFile.svelte
    );
    const relativeRoute = path.relative(root, route).split(path.sep).join('/');
    const routeFile = new File(route);
    const content = svelteKitRouteContent(
        name.ClassName,
        relativeImport(route, pagePath)
    );
    if (routeFile.exists) {
        return routeFile.data === content
            ? undefined
            : `${relativeRoute} already exists: render ${name.ClassName}Page there yourself.`;
    }
    routeFile.data = content;
};

export const scaffoldSveltePage = async (presentationSvelteFolder: Folder) => {
    const name = await input({
        key: 'name',
        message: 'Provide name (folders split by "/"):',
        validate: NestedName.validate
    });
    const nestedName = new NestedName(name);
    const { folders, ClassName, fileName } = nestedName;

    const pageFile = presentationSvelteFolder
        .subitem(['pages', ...folders])
        .createFile(
            `${fileName}-page.svelte`,
            svelteComponentContent(`${ClassName}PageProps`)
        );

    if (usesSvelteKit()) {
        const hint = scaffoldSvelteKitRoute(nestedName, pageFile.path);
        if (hint) report(hint);
    }
};

export const scaffoldSvelteWidget = async (
    presentationSvelteFolder: Folder
) => {
    const widgetName = await input({
        key: 'name',
        message: 'Name (folders split by "/"): ',
        validate: NestedName.validate
    });

    const widgetType = await select({
        choices: ['monolithic', 'with separated ui', 'headless'],
        key: 'widgetType',
        message: 'Type: '
    });

    const { folders, folderName, ClassName, fileName, classNameSegments } =
        new NestedName(widgetName);

    const folder = presentationSvelteFolder.subitem([
        'widgets',
        ...folders,
        folderName
    ]);
    const storyTitle = ['Widgets', ...classNameSegments].join('/');
    const widgetFileName = `${fileName}-widget`;
    const uiFileName = `${fileName}-widget-ui`;

    if (widgetType === 'monolithic') {
        folder.createFile(
            'index.ts',
            `
export { default as ${ClassName}Widget } from './${widgetFileName}.svelte'
export type { ${ClassName}WidgetProps } from './${widgetFileName}.svelte'
            `.trim()
        );
        folder.createFile(
            `${widgetFileName}.svelte`,
            svelteComponentContent(`${ClassName}WidgetProps`)
        );
        return;
    }

    folder.createFile(
        'index.ts',
        `
export { default as ${ClassName}Widget } from './${widgetFileName}.svelte'
export type { ${ClassName}WidgetProps } from './types'
        `.trim()
    );

    if (widgetType === 'with separated ui') {
        folder.createFile(
            'types.ts',
            `
export type ${ClassName}WidgetProps = { }

export type ${ClassName}WidgetUIProps = { }
            `.trim()
        );

        folder.createFile(
            `${widgetFileName}.svelte`,
            `
<script lang="ts">
    import type { ${ClassName}WidgetProps, ${ClassName}WidgetUIProps } from './types'
    import ${ClassName}WidgetUI from './ui/${uiFileName}.svelte'

    let props: ${ClassName}WidgetProps = $props()

    const toUIProps = (): ${ClassName}WidgetUIProps => ({})
</script>

<${ClassName}WidgetUI {...toUIProps()} />
            `.trim()
        );

        folder.subitem(['ui']).createFile(
            `${uiFileName}.svelte`,
            `
<script lang="ts">
    import type { ${ClassName}WidgetUIProps } from '../types'

    let props: ${ClassName}WidgetUIProps = $props()
</script>
            `.trim()
        );

        const framework = storybookFramework();
        if (framework) {
            folder
                .subitem(['ui'])
                .createFile(
                    `${uiFileName}.stories.ts`,
                    svelteStory(
                        framework,
                        `${ClassName}WidgetUI`,
                        `${uiFileName}.svelte`,
                        storyTitle,
                        `${ClassName}WidgetUIProps`
                    )
                );
        }
        return;
    }

    folder.createFile(
        'types.ts',
        `
import type { Component } from 'svelte'

export type ${ClassName}WidgetUIProps = { }

export type ${ClassName}WidgetProps = {
    UI: Component<${ClassName}WidgetUIProps>
}
        `.trim()
    );

    folder.createFile(
        `${widgetFileName}.svelte`,
        `
<script lang="ts">
    import type { ${ClassName}WidgetProps, ${ClassName}WidgetUIProps } from './types'

    let { UI, ...rest }: ${ClassName}WidgetProps = $props()

    const toUIProps = (): ${ClassName}WidgetUIProps => ({})
</script>

<UI {...toUIProps()} />
        `.trim()
    );
};

export const scaffoldSvelteUIKitComponent = async (
    presentationSvelteFolder: Folder
) => {
    const name = await input({ key: 'name', message: 'Name: ' });
    const { ClassName, fileName } = new UnknownFormatNaming(name);

    const componentFolder = presentationSvelteFolder.subitem([
        'ui-kit',
        fileName
    ]);

    componentFolder.createFile(
        'index.ts',
        `
export { default as ${ClassName} } from './${fileName}.svelte'
export type { ${ClassName}Props } from './${fileName}.svelte'
        `.trim()
    );

    componentFolder.createFile(
        `${fileName}.svelte`,
        svelteComponentContent(`${ClassName}Props`)
    );

    const framework = storybookFramework();
    if (framework) {
        componentFolder.createFile(
            `${fileName}.stories.ts`,
            svelteStory(
                framework,
                ClassName,
                `${fileName}.svelte`,
                `UI-kit/${ClassName}`,
                `${ClassName}Props`
            )
        );
    }
};

/**
 * A shared model is a `.svelte.ts` factory, so it may use runes. Svelte
 * has no hooks: in SvelteKit they are `hooks.server.ts`/`hooks.client.ts`.
 */
export const scaffoldSvelteSharedModel = async (
    presentationSvelteFolder: Folder
) => {
    const name = await input({
        key: 'name',
        message: 'Name without "create" (e.g. debounce): '
    });
    const { ClassName, fileName } = new UnknownFormatNaming(
        name.trim().replace(/^create-/, '')
    );

    presentationSvelteFolder.subitem(['shared', 'model']).createFile(
        `create-${fileName}.svelte.ts`,
        `
export const create${ClassName} = () => {
    return {}
}
        `.trim()
    );
};
