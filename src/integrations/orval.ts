import path from 'node:path';
import { input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { File } from '../file-system';
import { ProjectRoot } from '../project-root';
import { addGitignoreEntry } from './gitignore';
import { defaultOpenapiPath, openapiScriptPath } from './openapi';
import { addPackageScripts, describeScripts } from './package-scripts';

const dataLayerFolder = (rootFolder: string) =>
    path.posix.join(
        rootFolder.replaceAll('\\', '/'),
        'presentation/react/data-layer'
    );

export const orvalScripts = (rootFolder: string) => ({
    // JSON quotes protect paths containing spaces in package scripts.
    'client:orval': `orval --config ${JSON.stringify(`${dataLayerFolder(rootFolder)}/orval.config.ts`)}`
});

/**
 * Orval resolves paths relative to the config, which lives in the data layer
 * folder next to the generated client.
 */
export const orvalConfig = (
    rootFolder: string,
    openapiPath: string,
    withNext: boolean
) => {
    const inputPath = path.posix.relative(
        dataLayerFolder(rootFolder),
        openapiPath
    );
    const baseUrl = withNext
        ? `
            baseUrl: {
                runtime: 'process.env.NEXT_PUBLIC_API_BASE_URL ?? ""'
            },`
        : '';
    return `import { defineConfig } from 'orval';

export default defineConfig({
    api: {
        input: '${inputPath.startsWith('.') ? inputPath : `./${inputPath}`}',
        output: {
            mode: 'tags-split',
            target: './orval',
            schemas: './orval/model',
            client: 'react-query',
            httpClient: 'fetch',${baseUrl}
            clean: true,
            override: {
                mutator: {
                    path: './api-client/mutator.ts',
                    name: 'customInstance'
                },
                fetch: {
                    includeHttpResponseReturnType: false
                },
                query: {
                    version: 5
                }
            }
        }
    }
});
`;
};

export const orvalMutator = `/** Error of the generated hooks, with the parsed response body. */
export class ApiError<Body = unknown> extends Error {
    constructor(
        public readonly status: number,
        public readonly body: Body
    ) {
        super(\`API error \${status}\`);
        this.name = 'ApiError';
    }
}

/** Error type of the generated hooks, typed per endpoint by Orval. */
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
    const { rootFolder } = ConfigFile.Instance.data;
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

    const selected = await addPackageScripts(
        manifestFile,
        orvalScripts(rootFolder)
    );

    const dataLayer = dataLayerFolder(rootFolder);
    const configFile = new File(path.join(root, dataLayer, 'orval.config.ts'));
    const content = orvalConfig(
        rootFolder,
        path.posix.normalize(openapiPath.trim().replaceAll('\\', '/')),
        withNext
    );
    if (!configFile.exists || configFile.data !== content) {
        configFile.data = content;
    }
    // Starting points: edits to them are never overwritten.
    for (const [name, fileContent] of [
        ['api-client/mutator.ts', orvalMutator],
        ['query-provider.tsx', queryProvider]
    ]) {
        const file = new File(path.join(root, dataLayer, name));
        if (!file.exists) file.data = fileContent;
    }
    addGitignoreEntry(root, `/${dataLayer}/orval/`);

    const missing = (names: string[]) =>
        names.filter((name) => !dependencies[name]);
    const runtime = missing(['@tanstack/react-query']);
    const development = missing(['orval']);
    return [
        ...(runtime.length ? [`npm install ${runtime.join(' ')}`] : []),
        ...(development.length
            ? [`npm install --save-dev ${development.join(' ')}`]
            : []),
        ...describeScripts(selected, {
            'client:orval': `generate React Query hooks from ${openapiPath.trim()} in ${dataLayer}/orval`
        }),
        `Wrap your app in QueryProvider from ${dataLayer}/query-provider.tsx`,
        ...(generatedOpenapiPath
            ? []
            : [
                  'Add integration → OpenAPI generates the OpenAPI document the client is built from'
              ])
    ];
};
