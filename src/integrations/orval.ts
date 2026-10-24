import path from 'node:path';
import { checkbox, input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { File } from '../file-system';
import { ProjectRoot } from '../project-root';
import { addGitignoreEntry } from './gitignore';
import { defaultOpenapiPath, openapiScriptPath } from './openapi';
import { addPackageScripts, describeScripts } from './package-scripts';

export type OrvalTarget = 'hooks' | 'client';

/** React Query hooks go to the React data layer, the typed client to the shared one. */
export const dataLayerFolder = (rootFolder: string, target: OrvalTarget) =>
    path.posix.join(
        rootFolder.replaceAll('\\', '/'),
        target === 'hooks'
            ? 'presentation/react/data-layer'
            : 'presentation/data-layer'
    );

export const orvalScripts = (rootFolder: string, targets: OrvalTarget[]) => ({
    // JSON quotes protect paths containing spaces in package scripts.
    'client:orval': targets
        .map(
            (target) =>
                `orval --config ${JSON.stringify(`${dataLayerFolder(rootFolder, target)}/orval.config.ts`)}`
        )
        .join(' && ')
});

/**
 * Orval resolves paths relative to the config, which lives in the data layer
 * folder next to the generated code. `mutatorPath` is relative to the config.
 */
export const orvalConfig = (
    rootFolder: string,
    openapiPath: string,
    withNext: boolean,
    target: OrvalTarget = 'hooks',
    mutatorPath = './api-client/mutator.ts'
) => {
    const inputPath = path.posix.relative(
        dataLayerFolder(rootFolder, target),
        openapiPath
    );
    const baseUrl = withNext
        ? `
            baseUrl: {
                runtime: 'process.env.NEXT_PUBLIC_API_BASE_URL ?? ""'
            },`
        : '';
    const client =
        target === 'hooks'
            ? `
            client: 'react-query',
            httpClient: 'fetch',`
            : `
            client: 'fetch',`;
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
            schemas: './orval/model',${client}${baseUrl}
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

const openapiOutputPath = (root: string) => {
    const generator = new File(path.join(root, openapiScriptPath));
    if (!generator.exists) return undefined;
    return generator.data.match(/outputFile:\s*{\s*path:\s*'([^']+)'/)?.[1];
};

export const addOrval = async (): Promise<string[]> => {
    const { rootFolder, useReact } = ConfigFile.Instance.data;
    const root = new ProjectRoot().path;
    const manifestFile = new File(path.join(root, 'package.json'));
    const manifest = JSON.parse(manifestFile.data);
    const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies
    };
    const withNext = Boolean(dependencies.next);
    const generatedOpenapiPath = openapiOutputPath(root);

    const openapiPath = await input({
        message: 'OpenAPI document path:',
        default: generatedOpenapiPath ?? defaultOpenapiPath(withNext),
        validate: (value) => (value.trim() ? true : 'Path is required')
    });
    const targets: OrvalTarget[] = useReact
        ? await checkbox({
              message: 'Generate:',
              choices: [
                  { name: 'React Query hooks', value: 'hooks', checked: true },
                  { name: 'Typed API client', value: 'client' }
              ],
              required: true
          })
        : ['client'];

    const selected = await addPackageScripts(
        manifestFile,
        orvalScripts(rootFolder, targets)
    );

    const document = path.posix.normalize(
        openapiPath.trim().replaceAll('\\', '/')
    );
    const withClient = targets.includes('client');
    for (const target of targets) {
        const dataLayer = dataLayerFolder(rootFolder, target);
        // With the typed client, hooks share its mutator: one place for auth headers
        const sharedMutator = target === 'hooks' && withClient;
        const mutatorPath = sharedMutator
            ? `${path.posix.relative(dataLayer, dataLayerFolder(rootFolder, 'client'))}/api-client/mutator.ts`
            : undefined;
        const configFile = new File(
            path.join(root, dataLayer, 'orval.config.ts')
        );
        const content = orvalConfig(
            rootFolder,
            document,
            withNext,
            target,
            mutatorPath
        );
        if (!configFile.exists || configFile.data !== content) {
            configFile.data = content;
        }
        // Starting points: edits to them are never overwritten.
        for (const [name, fileContent] of [
            ...(sharedMutator ? [] : [['api-client/mutator.ts', orvalMutator]]),
            ...(target === 'hooks'
                ? [['query-provider.tsx', queryProvider]]
                : [])
        ]) {
            const file = new File(path.join(root, dataLayer, name));
            if (!file.exists) file.data = fileContent;
        }
        addGitignoreEntry(root, `/${dataLayer}/orval/`);
    }

    const generated = targets.map((target) =>
        target === 'hooks'
            ? `React Query hooks in ${dataLayerFolder(rootFolder, 'hooks')}/orval`
            : `a typed API client in ${dataLayerFolder(rootFolder, 'client')}/orval`
    );
    const missing = (names: string[]) =>
        names.filter((name) => !dependencies[name]);
    const runtime = missing(
        targets.includes('hooks') ? ['@tanstack/react-query'] : []
    );
    const development = missing(['orval']);
    return [
        ...(runtime.length ? [`npm install ${runtime.join(' ')}`] : []),
        ...(development.length
            ? [`npm install --save-dev ${development.join(' ')}`]
            : []),
        ...describeScripts(selected, {
            'client:orval': `generate ${generated.join(' and ')} from ${openapiPath.trim()}`
        }),
        ...(targets.includes('hooks')
            ? [
                  `Wrap your app in QueryProvider from ${dataLayerFolder(rootFolder, 'hooks')}/query-provider.tsx`
              ]
            : []),
        ...(generatedOpenapiPath
            ? []
            : [
                  'npx df-integration → OpenAPI generates the OpenAPI document the client is built from'
              ])
    ];
};
