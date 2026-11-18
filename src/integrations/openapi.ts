import path from 'node:path';
import { ConfigFile } from '../config-file';
import { File } from '../file-system';
import { confirm, input } from '../interaction';
import { NestedName } from '../nested-name';
import { nextAppFolder, usesNext } from '../next-app';
import { ProjectRoot } from '../project-root';
import type { FrontendFramework } from '../react-module-move';
import { svelteKitRoutesFolder, usesSvelteKit } from '../sveltekit-app';
import { compilerOption } from '../tsconfig';
import {
    reactPageContent,
    scaffoldNextRoute
} from '../use-cases/scaffold-react-page';
import { scaffoldSvelteKitRoute } from '../use-cases/scaffold-svelte-modules';
import { openapiExtractor, openapiExtractorPath } from './openapi-extractor';
import { addPackageScripts, describeScripts } from './package-scripts';

export const openapiScriptPath = 'scripts/generate-openapi.ts';

/** The static assets folder of Next.js or SvelteKit, so the app can serve it. */
export const defaultOpenapiPath = () =>
    usesNext()
        ? 'public/openapi.json'
        : usesSvelteKit()
          ? 'static/openapi.json'
          : 'openapi.json';

const extractorPackages = ['ts-morph', '@microsoft/tsdoc'];

export const swaggerPagePath = (
    rootFolder: string,
    framework: FrontendFramework = 'react'
) =>
    path.posix.join(
        rootFolder.replaceAll('\\', '/'),
        framework === 'svelte'
            ? 'presentation/svelte/pages/swagger-page.svelte'
            : 'presentation/react/pages/swagger-page.tsx'
    );

const specImportOf = (pagePath: string, outputPath: string) => {
    const specImport = path.posix.relative(
        path.posix.dirname(pagePath),
        outputPath
    );
    return specImport.startsWith('.') ? specImport : `./${specImport}`;
};

/**
 * A React page rendering the OpenAPI document with Swagger UI. With
 * Next.js it is a client component: Swagger UI keeps state and its App
 * Router route is a server component.
 */
export const swaggerPage = (
    rootFolder: string,
    outputPath: string,
    withNext = false
) => {
    const page = reactPageContent('Swagger', {
        imports: [
            "import 'swagger-ui-react/swagger-ui.css'",
            "import SwaggerUI from 'swagger-ui-react'",
            `import spec from '${specImportOf(swaggerPagePath(rootFolder), outputPath)}' with { type: 'json' }`
        ],
        body: '<SwaggerUI displayOperationId spec={spec} />'
    });
    return withNext ? `'use client'\n\n${page}` : page;
};

/**
 * A Svelte page rendering the OpenAPI document with Swagger UI. Swagger UI
 * needs the browser, so it is loaded on mount and never runs during SSR.
 */
export const svelteSwaggerPage = (rootFolder: string, outputPath: string) =>
    `
<script lang="ts" module>
    export type SwaggerPageProps = {}
</script>

<script lang="ts">
    import 'swagger-ui/dist/swagger-ui.css'
    import { onMount } from 'svelte'
    import spec from '${specImportOf(swaggerPagePath(rootFolder, 'svelte'), outputPath)}'

    let props: SwaggerPageProps = $props()
    let container: HTMLDivElement

    onMount(async () => {
        const { default: SwaggerUI } = await import('swagger-ui')
        SwaggerUI({ domNode: container, spec, displayOperationId: true })
    })
</script>

<div bind:this={container}></div>
`.trim();

/** Packages of the Swagger UI page: dependencies and dev dependencies. */
const swaggerPackages: Record<
    FrontendFramework,
    { dependency: string; types: string }
> = {
    react: { dependency: 'swagger-ui-react', types: '@types/swagger-ui-react' },
    svelte: { dependency: 'swagger-ui', types: '@types/swagger-ui' }
};

export const openapiScripts = {
    // Wiring imported through `restHandlers` may read the environment
    openapi: `tsx --env-file-if-exists=.env ${openapiScriptPath}`
};

const splitPath = (value: string) =>
    value
        .split(/[\\/]/)
        .map((segment) => segment.trim())
        .filter((segment) => !!segment);

export const apiTitle = (packageName: unknown) => {
    const words = String(packageName ?? '')
        .replace(/^@[^/]*\//, '')
        .split(/[^a-zA-Z0-9]+/)
        .filter((word) => !!word)
        .map((word) => word[0].toUpperCase() + word.slice(1));
    return [...words, 'API'].join(' ');
};

export const openapiGenerator = (
    rootFolder: string,
    title: string,
    routePrefix: string,
    outputPath: string,
    withExtractor = false
) => {
    const restFolder = path.posix.join(
        rootFolder.replaceAll('\\', '/'),
        'presentation/rest'
    );
    const restImport = path.posix.relative(
        path.posix.dirname(openapiScriptPath),
        restFolder
    );
    const prefixSegments = splitPath(routePrefix);
    const apiRoutePrefix = prefixSegments.length
        ? `\n    apiRoutePrefix: [${prefixSegments.map((segment) => `'${segment}'`).join(', ')}],`
        : '';
    const extractorImport = `./${path.posix.relative(
        path.posix.dirname(openapiScriptPath),
        openapiExtractorPath.replace(/\.ts$/, '')
    )}`;
    const handlers = withExtractor
        ? `
const extractOpenApiDataFromEndpointLogic =
    createOpenApiDataFromEndpointLogicExtractor();

const handlers = restHandlers.map((x) => ({
    ...x,
    metadata: {
        ...x.metadata,
        openApiMetadata: {
            ...extractOpenApiDataFromEndpointLogic(x.metadata.route),
            ...(x.metadata.openApiMetadata ?? {})
        }
    }
}));
`
        : '';
    return `import { generateOpenAPI } from '@domain-first/handlers-rest';
import { restHandlers } from '${restImport.startsWith('.') ? restImport : `./${restImport}`}';${withExtractor ? `\nimport { createOpenApiDataFromEndpointLogicExtractor } from '${extractorImport}';` : ''}
${handlers}
generateOpenAPI(${withExtractor ? 'handlers' : 'restHandlers'}, {
    document: { info: { title: '${title}', version: '1.0.0' } },${apiRoutePrefix}
    outputFile: { path: '${outputPath}' }
});
`;
};

export const addOpenapi = async (): Promise<string[]> => {
    const { rootFolder } = ConfigFile.Instance.data.project;
    const root = new ProjectRoot().path;
    const manifestFile = new File(path.join(root, 'package.json'));
    const manifest = JSON.parse(manifestFile.data);
    const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies
    };

    const routePrefix = await input({
        key: 'routePrefix',
        message: 'Route prefix the REST handlers are served under:',
        default: '/api'
    });
    const outputPath = await input({
        key: 'openapiPath',
        message: 'OpenAPI document path:',
        default: defaultOpenapiPath(),
        validate: (value) =>
            splitPath(value).length ? true : 'Path is required'
    });

    const withExtractor = await confirm({
        key: 'withExtractor',
        message:
            'Fill operationId, summary and description from the endpoint logic TSDoc?',
        default: true
    });

    const { frontend } = ConfigFile.Instance.data;
    const framework: FrontendFramework | undefined = frontend?.svelte
        ? 'svelte'
        : frontend?.react
          ? 'react'
          : undefined;
    const withSwaggerPage =
        !!framework &&
        (await confirm({
            key: 'swaggerPage',
            message: 'Add a Swagger UI page?',
            default: true
        }));

    const selected = await addPackageScripts(manifestFile, openapiScripts);

    if (withExtractor) {
        const extractorFile = new File(path.join(root, openapiExtractorPath));
        const extractor = openapiExtractor(rootFolder);
        if (!extractorFile.exists || extractorFile.data !== extractor) {
            extractorFile.data = extractor;
        }
    }

    const generatorFile = new File(path.join(root, openapiScriptPath));
    const content = openapiGenerator(
        rootFolder,
        apiTitle(manifest.name),
        routePrefix,
        splitPath(outputPath).join('/'),
        withExtractor
    );
    if (!generatorFile.exists || generatorFile.data !== content) {
        generatorFile.data = content;
    }

    // Like a scaffolded page, it gets its route at /swagger
    const routeFile =
        withSwaggerPage && framework === 'react' && usesNext()
            ? `${nextAppFolder(root)}/swagger/page.tsx`
            : withSwaggerPage && framework === 'svelte' && usesSvelteKit()
              ? `${svelteKitRoutesFolder(root)}/swagger/+page.svelte`
              : undefined;
    let routeHint: string | undefined;
    if (withSwaggerPage) {
        const pagePath = path.join(
            root,
            swaggerPagePath(rootFolder, framework)
        );
        const pageFile = new File(pagePath);
        const page =
            framework === 'svelte'
                ? svelteSwaggerPage(rootFolder, splitPath(outputPath).join('/'))
                : swaggerPage(
                      rootFolder,
                      splitPath(outputPath).join('/'),
                      !!routeFile
                  );
        if (!pageFile.exists || pageFile.data !== page) {
            pageFile.data = page;
        }
        if (routeFile) {
            routeHint = (
                framework === 'svelte'
                    ? scaffoldSvelteKitRoute
                    : scaffoldNextRoute
            )(new NestedName('swagger'), pagePath);
        }
    }
    const packages = swaggerPackages[framework ?? 'react'];

    /**
     * The page imports the document as JSON. An unreadable config gives
     * no hint, since its value is unknown.
     */
    const resolveJsonModule = withSwaggerPage
        ? compilerOption(path.join(root, 'tsconfig.json'), 'resolveJsonModule')
        : true;

    const hasRestHandlers = new File(
        path.join(root, rootFolder, 'presentation', 'rest', 'index.ts')
    ).exists;
    const missingExtractorPackages = withExtractor
        ? extractorPackages.filter((name) => !dependencies[name])
        : [];
    return [
        ...(dependencies['@domain-first/handlers-rest']
            ? []
            : ['npm install @domain-first/handlers-rest']),
        ...(dependencies.tsx ? [] : ['npm install --save-dev tsx']),
        ...(missingExtractorPackages.length
            ? [`npm install --save-dev ${missingExtractorPackages.join(' ')}`]
            : []),
        ...(withSwaggerPage && !dependencies[packages.dependency]
            ? [`npm install ${packages.dependency}`]
            : []),
        ...(withSwaggerPage && !dependencies[packages.types]
            ? [`npm install --save-dev ${packages.types}`]
            : []),
        ...(resolveJsonModule === true || resolveJsonModule === null
            ? []
            : [
                  'set "resolveJsonModule": true in compilerOptions of tsconfig.json — the Swagger UI page imports the OpenAPI document as JSON'
              ]),
        ...describeScripts(selected, {
            openapi: `generate the OpenAPI document from restHandlers in ${splitPath(outputPath).join('/')}`
        }),
        ...(withSwaggerPage && !routeFile
            ? [
                  `SwaggerPage from ${swaggerPagePath(rootFolder, framework)} shows ${splitPath(outputPath).join('/')} once it is generated — render it on a route of your app`
              ]
            : []),
        ...(routeFile
            ? [
                  routeHint ??
                      `/swagger shows ${splitPath(outputPath).join('/')} once it is generated — the route is ${routeFile}`
              ]
            : []),
        ...(hasRestHandlers
            ? []
            : [
                  `restHandlers appear in ${path.posix.join(rootFolder, 'presentation/rest/index.ts')} with the first REST endpoint generated with @domain-first/wire`
              ])
    ];
};
