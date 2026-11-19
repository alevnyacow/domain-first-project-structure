import path from 'node:path';
import { ConfigFile } from '../config-file';
import { File } from '../file-system';
import { checkbox, input } from '../interaction';
import { usesNext } from '../next-app';
import { ProjectRoot } from '../project-root';
import type { FrontendFramework } from '../react-module-move';
import { svelteKitRoutesFolder, usesSvelteKit } from '../sveltekit-app';
import { addGitignoreEntry } from './gitignore';
import { defaultOpenapiPath, openapiScriptPath } from './openapi';
import { addPackageScripts, describeScripts } from './package-scripts';

export type OrvalTarget = 'hooks' | 'client';

/**
 * Query hooks go to the data layer of the frontend framework (React Query
 * or Svelte Query), the typed client to the shared one.
 */
export const dataLayerFolder = (
    rootFolder: string,
    target: OrvalTarget,
    framework: FrontendFramework = 'react'
) =>
    path.posix.join(
        rootFolder.replaceAll('\\', '/'),
        target === 'hooks'
            ? `presentation/${framework}/data-layer`
            : 'presentation/data-layer'
    );

export const orvalScripts = (
    rootFolder: string,
    targets: OrvalTarget[],
    framework: FrontendFramework = 'react'
) => ({
    // JSON quotes protect paths containing spaces in package scripts.
    'client:orval': targets
        .map(
            (target) =>
                `orval --config ${JSON.stringify(`${dataLayerFolder(rootFolder, target, framework)}/orval.config.ts`)}`
        )
        .join(' && ')
});

/**
 * The base URL of requests, read at runtime: `NEXT_PUBLIC_API_BASE_URL`
 * with Next.js, `VITE_API_BASE_URL` with Svelte, both empty by default, so
 * requests go to the app's own origin.
 */
export const orvalBaseUrls = {
    next: 'process.env.NEXT_PUBLIC_API_BASE_URL ?? ""',
    svelte: 'import.meta.env.VITE_API_BASE_URL ?? ""'
} as const;

export type OrvalBaseUrl = keyof typeof orvalBaseUrls;

/**
 * Orval resolves paths relative to the config, which lives in the data layer
 * folder next to the generated code. `mutatorPath` is relative to the config.
 */
export const orvalConfig = (
    rootFolder: string,
    openapiPath: string,
    baseUrlSource: OrvalBaseUrl | undefined,
    target: OrvalTarget = 'hooks',
    mutatorPath = './api-client/mutator.ts',
    framework: FrontendFramework = 'react'
) => {
    const inputPath = path.posix.relative(
        dataLayerFolder(rootFolder, target, framework),
        openapiPath
    );
    const baseUrl = baseUrlSource
        ? `
            baseUrl: {
                runtime: '${orvalBaseUrls[baseUrlSource]}'
            },`
        : '';
    const svelteQuery = target === 'hooks' && framework === 'svelte';
    const client =
        target === 'hooks'
            ? `
            client: '${svelteQuery ? 'svelte-query' : 'react-query'}',
            httpClient: 'fetch',`
            : `
            client: 'fetch',`;
    const packageJson = svelteQuery
        ? `
            // Svelte Query 6 (runes) even before it is installed; an installed version wins
            packageJson: './${svelteQueryPackageJsonFile}',`
        : '';
    const query =
        target === 'hooks'
            ? `,
                query: {
                    version: 5
                }`
            : '';
    return `import { defineConfig } from 'orval';

export default defineConfig({
    api: {
        input: '${inputPath.startsWith('.') ? inputPath : `./${inputPath}`}',
        output: {
            mode: 'tags-split',
            target: './orval',
            schemas: './orval/model',${client}${packageJson}${baseUrl}
            clean: true,
            override: {
                mutator: {
                    path: '${mutatorPath}',
                    name: 'customInstance'
                },
                fetch: {
                    includeHttpResponseReturnType: false
                }${query}
            }
        }
    }
});
`;
};

/**
 * Orval picks the Svelte Query API by the version it finds in a
 * package.json: this one declares version 6, so the hooks use runes.
 */
export const svelteQueryPackageJsonFile = 'orval.package.json';
export const svelteQueryPackageJson = `${JSON.stringify(
    { private: true, dependencies: { '@tanstack/svelte-query': '^6.0.0' } },
    null,
    4
)}
`;

export const orvalMutator = `/** Error of the generated requests, with the parsed response body. */
export class ApiError<Body = unknown> extends Error {
    constructor(
        public readonly status: number,
        public readonly body: Body
    ) {
        super(\`API error \${status}\`);
        this.name = 'ApiError';
    }
}

/** Error type of the generated requests, typed per endpoint by Orval. */
export type ErrorType<Body> = ApiError<Body>;

/** Every generated request goes through here: add auth headers, token refresh, logging. */
export const customInstance = async <T>(
    url: string,
    init?: RequestInit
): Promise<T> => {
    const response = await fetch(url, init);
    const text = await response.text();
    const body = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
        throw new ApiError(response.status, body);
    }

    return body as T;
};
`;

export const queryProvider = `'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type FC, type ReactNode, useState } from 'react';

export const QueryProvider: FC<{ children: ReactNode }> = ({ children }) => {
    // One client per browser session; a module-level client would be shared between requests on the server
    const [queryClient] = useState(() => new QueryClient());

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};
`;

/**
 * The Svelte Query provider. With SvelteKit, queries run only in the
 * browser: a page rendered on the server has no client of its own yet.
 */
export const svelteQueryProvider = (
    withSvelteKit: boolean
) => `<script lang="ts">
    import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query'
    import type { Snippet } from 'svelte'${withSvelteKit ? "\n    import { browser } from '$app/environment'" : ''}

    let { children }: { children: Snippet } = $props()

    // One client per app instance; a module-level client would be shared between requests on the server
    const queryClient = new QueryClient(${
        withSvelteKit
            ? `{
        defaultOptions: { queries: { enabled: browser } }
    }`
            : ''
    })
</script>

<QueryClientProvider client={queryClient}>
    {@render children()}
</QueryClientProvider>
`;

/** The root SvelteKit layout wrapping every page in the query provider. */
export const svelteKitQueryLayout = (
    providerImport: string
) => `<script lang="ts">
    import type { Snippet } from 'svelte'
    import QueryProvider from '${providerImport}'

    let { children }: { children: Snippet } = $props()
</script>

<QueryProvider>
    {@render children()}
</QueryProvider>
`;

/**
 * With SvelteKit, the root layout gets the provider: a new layout is
 * created, an existing one without it is left to the user with a note.
 */
const connectSvelteKitProvider = (root: string, providerPath: string) => {
    const layoutPath = path.posix.join(
        svelteKitRoutesFolder(root),
        '+layout.svelte'
    );
    const layout = new File(path.join(root, layoutPath));
    if (!layout.exists) {
        const providerImport = path.posix.relative(
            path.posix.dirname(layoutPath),
            providerPath
        );
        layout.data = svelteKitQueryLayout(
            providerImport.startsWith('.')
                ? providerImport
                : `./${providerImport}`
        );
        return undefined;
    }
    return layout.data.includes('QueryProvider')
        ? undefined
        : `Wrap {@render children()} of ${layoutPath} in QueryProvider from ${providerPath}`;
};

const openapiOutputPath = (root: string) => {
    const generator = new File(path.join(root, openapiScriptPath));
    if (!generator.exists) return undefined;
    return generator.data.match(/outputFile:\s*{\s*path:\s*'([^']+)'/)?.[1];
};

export const addOrval = async (): Promise<string[]> => {
    const {
        project: { rootFolder },
        frontend
    } = ConfigFile.Instance.data;
    // Query hooks need a frontend; Svelte projects get Svelte Query
    const framework: FrontendFramework | undefined = frontend?.svelte
        ? 'svelte'
        : frontend?.react
          ? 'react'
          : undefined;
    const root = new ProjectRoot().path;
    const manifestFile = new File(path.join(root, 'package.json'));
    const manifest = JSON.parse(manifestFile.data);
    const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies
    };
    const withSvelteKit = usesSvelteKit();
    const baseUrl: OrvalBaseUrl | undefined =
        framework === 'svelte' ? 'svelte' : usesNext() ? 'next' : undefined;
    const hooksFramework = framework ?? 'react';
    const generatedOpenapiPath = openapiOutputPath(root);

    const openapiPath = await input({
        key: 'openapiPath',
        message: 'OpenAPI document path:',
        default: generatedOpenapiPath ?? defaultOpenapiPath(),
        validate: (value) => (value.trim() ? true : 'Path is required')
    });
    const targets: OrvalTarget[] = framework
        ? await checkbox({
              key: 'targets',
              message: 'Generate:',
              choices: [
                  {
                      name:
                          framework === 'svelte'
                              ? 'Svelte Query (createQuery)'
                              : 'React Query hooks',
                      value: 'hooks',
                      checked: true
                  },
                  { name: 'Typed API client', value: 'client' }
              ],
              required: true
          })
        : ['client'];

    const selected = await addPackageScripts(
        manifestFile,
        orvalScripts(rootFolder, targets, hooksFramework)
    );
    const layer = (target: OrvalTarget) =>
        dataLayerFolder(rootFolder, target, hooksFramework);
    const providerFile =
        hooksFramework === 'svelte'
            ? 'query-provider.svelte'
            : 'query-provider.tsx';
    const providerContent =
        hooksFramework === 'svelte'
            ? svelteQueryProvider(withSvelteKit)
            : queryProvider;

    const document = path.posix.normalize(
        openapiPath.trim().replaceAll('\\', '/')
    );
    const withClient = targets.includes('client');
    for (const target of targets) {
        const dataLayer = layer(target);
        // With the typed client, hooks share its mutator: one place for auth headers
        const sharedMutator = target === 'hooks' && withClient;
        const mutatorPath = sharedMutator
            ? `${path.posix.relative(dataLayer, layer('client'))}/api-client/mutator.ts`
            : undefined;
        const configFile = new File(
            path.join(root, dataLayer, 'orval.config.ts')
        );
        const content = orvalConfig(
            rootFolder,
            document,
            baseUrl,
            target,
            mutatorPath,
            hooksFramework
        );
        if (!configFile.exists || configFile.data !== content) {
            configFile.data = content;
        }
        if (target === 'hooks' && hooksFramework === 'svelte') {
            const versions = new File(
                path.join(root, dataLayer, svelteQueryPackageJsonFile)
            );
            if (!versions.exists || versions.data !== svelteQueryPackageJson)
                versions.data = svelteQueryPackageJson;
        }
        // Starting points: edits to them are never overwritten.
        for (const [name, fileContent] of [
            ...(sharedMutator ? [] : [['api-client/mutator.ts', orvalMutator]]),
            ...(target === 'hooks' ? [[providerFile, providerContent]] : [])
        ]) {
            const file = new File(path.join(root, dataLayer, name));
            if (!file.exists) file.data = fileContent;
        }
        addGitignoreEntry(root, `/${dataLayer}/orval/`);
    }

    const withHooks = targets.includes('hooks');
    const providerPath = `${layer('hooks')}/${providerFile}`;
    const layoutNote =
        withHooks && hooksFramework === 'svelte' && withSvelteKit
            ? connectSvelteKitProvider(root, providerPath)
            : undefined;
    const queryPackage =
        hooksFramework === 'svelte'
            ? '@tanstack/svelte-query'
            : '@tanstack/react-query';
    const generated = targets.map((target) =>
        target === 'hooks'
            ? `${hooksFramework === 'svelte' ? 'Svelte' : 'React'} Query hooks in ${layer('hooks')}/orval`
            : `a typed API client in ${layer('client')}/orval`
    );
    const missing = (names: string[]) =>
        names.filter((name) => !dependencies[name]);
    const runtime = missing(withHooks ? [queryPackage] : []);
    const development = missing(['orval']);
    return [
        ...(runtime.length ? [`npm install ${runtime.join(' ')}`] : []),
        ...(development.length
            ? [`npm install --save-dev ${development.join(' ')}`]
            : []),
        ...describeScripts(selected, {
            'client:orval': `generate ${generated.join(' and ')} from ${openapiPath.trim()}`
        }),
        ...(withHooks && !(hooksFramework === 'svelte' && withSvelteKit)
            ? [`Wrap your app in QueryProvider from ${providerPath}`]
            : []),
        ...(layoutNote ? [layoutNote] : []),
        ...(generatedOpenapiPath
            ? []
            : [
                  'npx df-integration → OpenAPI generates the OpenAPI document the client is built from'
              ])
    ];
};
