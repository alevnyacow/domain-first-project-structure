import path from 'node:path';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { input, RequestError, select } from '../interaction';
import {
    hasLegacyRootEndpoints,
    isPathParameterName,
    pathParameterAsName,
    restControllers,
    rootControllerFolder,
    rootStaticSegments
} from '../rest-layout';
import { UnknownFormatNaming } from '../unknown-format-naming';
import { relativeImport } from '../wiring';
import { findRestEndpointGenerator } from './rest-endpoint-generator';
import { promptEndpointHandler } from './wire-dependency';

const newController = 'New controller';
/**
 * The answer value of the context-root controller, kept from 8.5 so
 * recorded answers still select it.
 */
export const rootControllerChoice = 'No controller (context root)';

/**
 * `<rootFolder>/presentation/rest/`: `wires.ts` and `restHandlers`.
 */
const sharedRestFolder = (boundedContextFolder: Folder) =>
    boundedContextFolder.subitem(['..', '..', 'presentation', 'rest']);

export const legacyRootEndpointsMessage = (context: string) =>
    `${context} keeps its context-root endpoints in the 8.5 layout (presentation/rest/<METHOD>.ts, _param_/). Run npx df-upgrade to move them to presentation/rest/${rootControllerFolder}/ first.`;

export const scaffoldNewHandlersRestEndpoint = async (
    boundedContextFolder: Folder
) => {
    const context = boundedContextFolder.name;
    const restPresentationFolder = boundedContextFolder.subitem([
        'presentation',
        'rest'
    ]);
    const controllers = restControllers(boundedContextFolder.path);
    /**
     * `/<context>/<segment>` belongs either to the root or to a
     * controller: `(root)/from-scratch/` and controller `from-scratch`
     * would share every route.
     */
    const rootSegments = rootStaticSegments(boundedContextFolder.path);

    let controllerChoice = await select({
        key: 'controllerSelection',
        message: 'Controller: ',
        choices: [
            {
                value: rootControllerChoice,
                name: `${rootControllerFolder} — /${context}`
            },
            ...controllers,
            newController
        ]
    });

    if (
        controllerChoice === rootControllerChoice &&
        hasLegacyRootEndpoints(boundedContextFolder.path)
    ) {
        throw new RequestError(
            'UPGRADE_REQUIRED',
            legacyRootEndpointsMessage(context)
        );
    }

    if (controllerChoice === newController) {
        controllerChoice = await input({
            key: 'controllerName',
            message: 'Name: ',
            validate: (value) => {
                if (!value.trim())
                    return `Name is required; pick "${rootControllerFolder}" for an endpoint at the context root`;
                if (
                    isPathParameterName(value) ||
                    value.includes('/') ||
                    /[()]/.test(value)
                )
                    return 'A controller is one static path segment';
                if (value === context)
                    return `"${value}" is the context itself: pick "${rootControllerFolder}" for /${context}`;
                if (rootSegments.includes(value))
                    return `/${context}/${value} belongs to the context root (${rootControllerFolder}/${value}): add the endpoint there`;
                return true;
            }
        });
    }

    /**
     * Endpoints at the context root (`GET /<context>`) live in
     * `presentation/rest/(root)/`, and their wires in
     * `wiring/presentation/rest/(root)/`.
     */
    const controller =
        controllerChoice === rootControllerChoice
            ? undefined
            : controllerChoice;

    const withWiring =
        ConfigFile.backend.domainFirstPackages.includes('@domain-first/wire');

    const method = await select({
        key: 'method',
        message: 'Method:',
        choices: ['get', 'post', 'patch', 'delete', 'put']
    });

    const routeSegments = (
        await input({
            key: 'path',
            message: 'Relative path (split by "/"):',
            validate: (value) => {
                const [first] = value.split('/').filter((x) => !!x);
                return controller ||
                    !first ||
                    first.startsWith(':') ||
                    !controllers.includes(first)
                    ? true
                    : `/${context}/${first} belongs to controller "${first}": add the endpoint there`;
            }
        })
    )
        .split('/')
        .filter((x) => !!x);

    /**
     * The first folder below `presentation/rest/` is the controller, or
     * `(root)`, which is not part of the route.
     */
    const group = controller ?? rootControllerFolder;
    const folderSegments = [group, ...routeSegments];
    const routePath = [
        context,
        ...(controller ? [controller] : []),
        ...routeSegments
    ];
    const endpointFolder = restPresentationFolder.subitem(
        folderSegments.map(pathParameterAsName)
    );

    /**
     * Named after the context without a controller: wires of every
     * context meet in `<rootFolder>/presentation/rest/wires.ts`.
     */
    const nameSegments = [controller ?? context, ...routeSegments];
    const nameBase = `${[...nameSegments.map(pathParameterAsName), method].join('-')}-endpoint`;

    /**
     * A colon can't be part of a class name either.
     */
    const endpointClassName = [...nameSegments, method, 'endpoint']
        .map((segment) =>
            segment.startsWith(':')
                ? pathParameterAsName(segment)
                : new UnknownFormatNaming(segment).ClassName
        )
        .join('');

    /**
     * The generator is the Shared Kernel one; with wiring, the user picks
     * the handler from wired modules, otherwise it stays a placeholder.
     */
    const endpointGenerator = findRestEndpointGenerator(
        boundedContextFolder.subitem(['..', '..', 'shared-kernel'])
    );
    const handler = withWiring
        ? await promptEndpointHandler(boundedContextFolder)
        : undefined;

    const endpointFile = path.join(
        endpointFolder.path,
        `${method.toUpperCase()}.ts`
    );

    /**
     * Endpoint class. With the Shared Kernel generator, `get handle()` calls
     * the service itself and doesn't compile until the user picks one of
     * its generating getters.
     */
    endpointFolder.createFile(
        `${method.toUpperCase()}.ts`,
        `
${
    endpointGenerator
        ? `import type { ${endpointGenerator.typeName} } from '${relativeImport(endpointFile, endpointGenerator.typeFile)}'`
        : `import { EndpointGenerator } from '@domain-first/handlers-rest'`
}${
    handler
        ? `
import type { ${handler.typeName} } from '${relativeImport(endpointFile, handler.typeFile)}'`
        : ''
}

export class ${endpointClassName} {
    constructor(
        private readonly endpointGenerator: ${endpointGenerator?.typeName ?? 'EndpointGenerator'},
        private readonly handler: ${handler?.typeName ?? 'never'}
    ) {}

    get handle() {
        return this.endpointGenerator(this.handler.handle, {
            route: { method: '${method}', path: [${routePath.map((x) => `'${x}'`).join(', ')}] },
            tags: ['${context}${controller ? `: ${controller}` : ''}'],
        })
    }
}
        `.trim()
    );

    /**
     * Wiring.
     */
    if (withWiring) {
        const wiringFolder = boundedContextFolder.subitem([
            'wiring',
            'presentation',
            'rest',
            group
        ]);

        const wireNameBase = `wire-${nameBase}`;
        const wireNaming = new UnknownFormatNaming(wireNameBase);
        const wireFile = path.join(
            wiringFolder.path,
            `${wireNaming.fileName}.ts`
        );
        /**
         * Positional: the handler can't be wired without the generator.
         */
        const dependencies = endpointGenerator
            ? [endpointGenerator, handler].filter((x) => !!x)
            : [];
        wiringFolder.createFile(
            `${wireNaming.fileName}.ts`,
            `
import { wireClass } from '@domain-first/wire'
import { ${endpointClassName} } from '${relativeImport(wireFile, endpointFile)}'
${dependencies
    .map(
        (x) =>
            `import { ${x.wireName} } from '${relativeImport(wireFile, x.wireFile)}'`
    )
    .join('\n')}

export const wire${endpointClassName} = wireClass(
    ${endpointClassName},
    [${dependencies.map((x) => x.wireName).join(', ')}]
)
        `.trim()
        );

        wiringFolder
            .file('index.ts')
            .addLineIfMissing(`export * from './${wireNaming.fileName}'`);

        /**
         * A controller, `(root)` included, is re-exported once: its
         * `index.ts` re-exports its endpoints.
         */
        boundedContextFolder
            .subitem(['wiring', 'presentation', 'rest'])
            .file('index.ts')
            .addLineIfMissing(`export * from './${group}'`);
        sharedRestFolder(boundedContextFolder)
            .file('wires.ts')
            .addLineIfMissing(
                `export * from '../../bounded-contexts/${context}/wiring/presentation/rest/${group}'`
            );

        const restHandlersFile =
            sharedRestFolder(boundedContextFolder).file('index.ts');
        if (!restHandlersFile.exists) {
            sharedRestFolder(boundedContextFolder).createFile(
                'index.ts',
                `
import * as wires from './wires'

const restWires = Object.values(wires)

export const restHandlers = restWires.map(x => x().handle)
`.trim()
            );
        }
    }
};
