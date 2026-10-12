import path from 'node:path';
import { confirm, input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { File } from '../file-system';
import { ProjectRoot } from '../project-root';
import { openapiExtractor, openapiExtractorPath } from './openapi-extractor';
import { addPackageScripts, describeScripts } from './package-scripts';

export const openapiScriptPath = 'scripts/generate-openapi.ts';

export const defaultOpenapiPath = (withNext: boolean) =>
    withNext ? 'public/openapi.json' : 'openapi.json';

const extractorPackages = ['ts-morph', '@microsoft/tsdoc'];

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

    const withExtractor = await confirm({
        message:
            'Fill operationId, summary and description from the endpoint logic TSDoc?',
        default: true
    });

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
