import path from 'node:path';
import { input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { File } from '../file-system';
import { ProjectRoot } from '../project-root';
import { addPackageScripts, describeScripts } from './package-scripts';

export const openapiScriptPath = 'scripts/generate-openapi.ts';

export const defaultOpenapiPath = (withNext: boolean) =>
    withNext ? 'public/openapi.json' : 'openapi.json';

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
    outputPath: string
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
    return `import { generateOpenAPI } from '@domain-first/handlers-rest';
import { restHandlers } from '${restImport.startsWith('.') ? restImport : `./${restImport}`}';

generateOpenAPI(restHandlers, {
    document: { info: { title: '${title}', version: '1.0.0' } },${apiRoutePrefix}
    outputFile: { path: '${outputPath}' }
});
`;
};

// The first version where generateOpenAPI adds the leading "/" to paths itself
const minimalHandlersRest = [7, 0, 2];

const parseVersion = (value: unknown) =>
    String(value ?? '')
        .match(/(\d+)\.(\d+)\.(\d+)/)
        ?.slice(1)
        .map(Number);

/**
 * The installed version wins over the declared range, which only gives
 * the lowest version allowed.
 */
export const handlersRestUpToDate = (root: string, declared: unknown) => {
    const installed = new File(
        path.join(root, 'node_modules/@domain-first/handlers-rest/package.json')
    );
    const version = parseVersion(
        installed.exists ? JSON.parse(installed.data).version : declared
    );
    if (!version) return false;
    for (const [index, part] of minimalHandlersRest.entries()) {
        if (version[index] !== part) return version[index] > part;
    }
    return true;
};

export const addOpenapi = async (): Promise<string[]> => {
    const { rootFolder } = ConfigFile.Instance.data;
    const root = new ProjectRoot().path;
    const manifestFile = new File(path.join(root, 'package.json'));
    const manifest = JSON.parse(manifestFile.data);
    const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies
    };

    const routePrefix = await input({
        message: 'Route prefix the REST handlers are served under:',
        default: '/api'
    });
    const outputPath = await input({
        message: 'OpenAPI document path:',
        default: defaultOpenapiPath(Boolean(dependencies.next)),
        validate: (value) =>
            splitPath(value).length ? true : 'Path is required'
    });

    const selected = await addPackageScripts(manifestFile, openapiScripts);

    const generatorFile = new File(path.join(root, openapiScriptPath));
    const content = openapiGenerator(
        rootFolder,
        apiTitle(manifest.name),
        routePrefix,
        splitPath(outputPath).join('/')
    );
    if (!generatorFile.exists || generatorFile.data !== content) {
        generatorFile.data = content;
    }

    const hasRestHandlers = new File(
        path.join(root, rootFolder, 'presentation', 'rest', 'index.ts')
    ).exists;
    return [
        ...(handlersRestUpToDate(
            root,
            dependencies['@domain-first/handlers-rest']
        )
            ? []
            : [
                  `npm install @domain-first/handlers-rest@^${minimalHandlersRest.join('.')}`
              ]),
        ...(dependencies.tsx ? [] : ['npm install --save-dev tsx']),
        ...describeScripts(selected, {
            openapi: `generate the OpenAPI document from restHandlers in ${splitPath(outputPath).join('/')}`
        }),
        ...(hasRestHandlers
            ? []
            : [
                  `restHandlers appear in ${path.posix.join(rootFolder, 'presentation/rest/index.ts')} with the first REST endpoint generated with @domain-first/wire`
              ])
    ];
};
