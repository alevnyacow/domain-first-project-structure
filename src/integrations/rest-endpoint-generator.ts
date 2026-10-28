import path from 'node:path';
import { confirm } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { File, Folder, withoutOverwrites } from '../file-system';
import { ProjectRoot } from '../project-root';
import {
    findRestEndpointGenerator,
    scaffoldRestEndpointGenerator
} from '../use-cases/rest-endpoint-generator';
import { relativeImport } from '../wiring';
import {
    hasDependency,
    missingPackages
} from './missing-domain-first-packages';

/**
 * The App Router folder: `app` or `src/app`, whichever exists, `app` by
 * default.
 */
const nextAppFolder = (root: string) =>
    ['app', 'src/app'].find(
        (folder) => new Folder(path.join(root, folder)).exists
    ) ?? 'app';

/**
 * The catch-all route serving every endpoint, relative to the project root.
 */
export const nextRoutePath = (root: string) =>
    path.posix.join(nextAppFolder(root), 'api/[...path]/route.ts');

const nextRoute = (restHandlersImport: string | undefined) =>
    `
import { nextEndpoints } from '@domain-first/handlers-next'
${
    restHandlersImport
        ? `import { restHandlers } from '${restHandlersImport}'

const handler = nextEndpoints(restHandlers)`
        : `
/**
 * Pass the endpoints' handle here; their paths are relative to this route's folder.
 */
const handler = nextEndpoints([])`
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
`.trim();

/**
 * With wiring, the route serves `restHandlers`, which every new endpoint is
 * added to. They appear with the first endpoint: until then the route
 * doesn't compile, and the returned note says so.
 */
const scaffoldNextRoute = (root: string): string[] => {
    const { rootFolder, domainFirstPackages } = ConfigFile.Instance.data;
    const routePath = nextRoutePath(root);
    const routeFile = path.join(root, routePath);
    if (new File(routeFile).exists) return [];
    if (!domainFirstPackages.includes('@domain-first/wire')) {
        new File(routeFile).data = nextRoute(undefined);
        return [];
    }
    const restFolder = new Folder(root).subitem([
        rootFolder,
        'presentation',
        'rest'
    ]);
    new File(routeFile).data = nextRoute(
        relativeImport(routeFile, restFolder.path)
    );
    return new File(path.join(restFolder.path, 'index.ts')).exists
        ? []
        : [
              `${routePath} serves restHandlers from ${path.posix.join(rootFolder.replaceAll('\\', '/'), 'presentation/rest/index.ts')}, which appears with the first REST endpoint — generate one with df-scaffold (Presentation → New Handlers-REST Endpoint) and the route compiles`
          ];
};

/**
 * Asked only in projects with `next` among their dependencies.
 */
export const askNextAdapter = async () =>
    hasDependency('next') &&
    (await confirm({ message: 'Use Next adapter for REST endpoints' }));

/**
 * The Shared Kernel endpoint generator and, with the Next adapter, the
 * catch-all route. Existing files are kept: the generator is edited by
 * hand.
 */
export const scaffoldRestEndpointGeneratorFiles = ({
    withNextAdapter
}: {
    withNextAdapter: boolean;
}): string[] => {
    const root = new ProjectRoot().path;
    const generatorExisted = restEndpointGeneratorApplied();
    const routeNotes = withoutOverwrites(() => {
        scaffoldRestEndpointGenerator(
            new Folder(root).subitem([
                ConfigFile.Instance.data.rootFolder,
                'shared-kernel'
            ]),
            { withNextAdapter }
        );
        return withNextAdapter ? scaffoldNextRoute(root) : [];
    });
    if (!withNextAdapter) return [];
    return [
        ...missingPackages(['@domain-first/handlers-next']),
        ...routeNotes,
        ...(generatorExisted
            ? [
                  'the existing endpoint generator was kept — pass nextAdapter from @domain-first/handlers-next to its createEndpoint calls'
              ]
            : [])
    ];
};

export const addRestEndpointGenerator = async (): Promise<string[]> =>
    scaffoldRestEndpointGeneratorFiles({
        withNextAdapter: await askNextAdapter()
    });

export const restEndpointGeneratorApplied = () =>
    Boolean(
        findRestEndpointGenerator(
            new Folder(new ProjectRoot().path).subitem([
                ConfigFile.Instance.data.rootFolder,
                'shared-kernel'
            ])
        )
    );
