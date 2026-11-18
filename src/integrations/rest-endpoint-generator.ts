import path from 'node:path';
import { ConfigFile } from '../config-file';
import { File, Folder, withoutOverwrites } from '../file-system';
import { confirm } from '../interaction';
import { usesNext } from '../next-app';
import { ProjectRoot } from '../project-root';
import { type RestAdapter, restAdapters } from '../rest-adapters';
import { usesSvelteKit } from '../sveltekit-app';
import {
    findRestEndpointGenerator,
    scaffoldRestEndpointGenerator
} from '../use-cases/rest-endpoint-generator';
import { relativeImport } from '../wiring';
import { missingPackages } from './missing-domain-first-packages';

/**
 * The catch-all route serving every endpoint, relative to the project root.
 */
export const nextRoutePath = (root: string) =>
    restAdapters.next.routePath(root);

const catchAllRoute = (
    adapter: RestAdapter,
    restHandlersImport: string | undefined
) => {
    const { endpoints, package: packageName } = restAdapters[adapter];
    return `
import { ${endpoints} } from '${packageName}'
${
    restHandlersImport
        ? `import { restHandlers } from '${restHandlersImport}'

const handler = ${endpoints}(restHandlers)`
        : `
/**
 * Pass the endpoints' handle here; their paths are relative to this route's folder.
 */
const handler = ${endpoints}([])`
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
`.trim();
};

/**
 * With wiring, the route serves `restHandlers`, which every new endpoint is
 * added to. They appear with the first endpoint: until then the route
 * doesn't compile, and the returned note says so.
 */
const scaffoldCatchAllRoute = (
    root: string,
    adapter: RestAdapter
): string[] => {
    const { rootFolder } = ConfigFile.Instance.data.project;
    const { domainFirstPackages } = ConfigFile.backend;
    const routePath = restAdapters[adapter].routePath(root);
    const routeFile = path.join(root, routePath);
    if (new File(routeFile).exists) return [];
    if (!domainFirstPackages.includes('@domain-first/wire')) {
        new File(routeFile).data = catchAllRoute(adapter, undefined);
        return [];
    }
    const restFolder = new Folder(root).subitem([
        rootFolder,
        'presentation',
        'rest'
    ]);
    new File(routeFile).data = catchAllRoute(
        adapter,
        relativeImport(routeFile, restFolder.path)
    );
    return new File(path.join(restFolder.path, 'index.ts')).exists
        ? []
        : [
              `${routePath} serves restHandlers from ${path.posix.join(rootFolder.replaceAll('\\', '/'), 'presentation/rest/index.ts')}, which appears with the first REST endpoint — generate one with df-scaffold (Presentation → New Handlers-REST Endpoint) and the route compiles`
          ];
};

/** The adapter of the configured framework: Next.js or SvelteKit. */
export const frameworkRestAdapter = (): RestAdapter | undefined =>
    usesNext() ? 'next' : usesSvelteKit() ? 'svelte' : undefined;

/**
 * Offered only when the config selects Next.js or SvelteKit (or the caller
 * names the framework's adapter).
 */
export const askRestAdapter = async ({
    adapter = frameworkRestAdapter()
}: {
    adapter?: RestAdapter;
} = {}): Promise<RestAdapter | undefined> => {
    if (!adapter) return undefined;
    const { key, package: packageName } = restAdapters[adapter];
    return (await confirm({
        key,
        message: `Use ${packageName} for REST endpoints`
    }))
        ? adapter
        : undefined;
};

/**
 * The Shared Kernel endpoint generator and, with a framework adapter, the
 * catch-all route. Existing files are kept: the generator is edited by
 * hand.
 */
export const scaffoldRestEndpointGeneratorFiles = ({
    adapter
}: {
    adapter?: RestAdapter;
}): string[] => {
    const root = new ProjectRoot().path;
    const generatorExisted = restEndpointGeneratorApplied();
    const routeNotes = withoutOverwrites(() => {
        scaffoldRestEndpointGenerator(
            new Folder(root).subitem([
                ConfigFile.Instance.data.project.rootFolder,
                'shared-kernel'
            ]),
            { adapter }
        );
        return adapter ? scaffoldCatchAllRoute(root, adapter) : [];
    });
    if (!adapter) return [];
    const { adapter: adapterName, package: packageName } =
        restAdapters[adapter];
    return [
        ...missingPackages([packageName]),
        ...routeNotes,
        ...(generatorExisted
            ? [
                  `the existing endpoint generator was kept — pass ${adapterName} from ${packageName} to its createEndpoint calls`
              ]
            : [])
    ];
};

export const addRestEndpointGenerator = async (): Promise<string[]> =>
    scaffoldRestEndpointGeneratorFiles({
        adapter: await askRestAdapter()
    });

export const restEndpointGeneratorApplied = () =>
    Boolean(
        findRestEndpointGenerator(
            new Folder(new ProjectRoot().path).subitem([
                ConfigFile.Instance.data.project.rootFolder,
                'shared-kernel'
            ])
        )
    );
