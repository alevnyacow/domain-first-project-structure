import path from 'node:path';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { input, select } from '../interaction';
import { UnknownFormatNaming } from '../unknown-format-naming';
import { relativeImport } from '../wiring';
import { findRestEndpointGenerator } from './rest-endpoint-generator';
import { promptEndpointHandler } from './wire-dependency';

const newController = 'New controller';
const withoutController = 'No controller (context root)';

/**
 * Path parameters (`:id`) can't be part of file and folder names
 * everywhere (Windows), so they are named `_id_` there.
 */
const pathParameterAsName = (segment: string) =>
    segment.startsWith(':') ? `_${segment.slice(1)}_` : segment;

const isPathParameterName = (name: string) =>
    name.startsWith(':') || /^_.+_$/.test(name);

/**
 * `<rootFolder>/presentation/rest/`: `wires.ts` and `restHandlers`.
 */
const sharedRestFolder = (boundedContextFolder: Folder) =>
    boundedContextFolder.subitem(['..', '..', 'presentation', 'rest']);

export const scaffoldNewHandlersRestEndpoint = async (
    boundedContextFolder: Folder
) => {
    const restPresentationFolder = boundedContextFolder.subitem([
        'presentation',
        'rest'
    ]);
    /**
     * Folders of context-root endpoints starting with a path parameter
     * (`_id_`) aren't controllers.
     */
    const controllers = restPresentationFolder.content.subfolderNames.filter(
        (x) => !isPathParameterName(x)
    );

    let controllerChoice = await select({
        key: 'controllerSelection',
        message: 'Controller: ',
        choices: [...controllers, newController, withoutController]
    });

    if (controllerChoice === newController) {
        controllerChoice = await input({
            key: 'controllerName',
            message: 'Name: ',
            validate: (value) =>
                !value.trim()
                    ? `Name is required; pick "${withoutController}" for an endpoint at the context root`
                    : isPathParameterName(value) || value.includes('/')
                      ? 'A controller is one static path segment'
                      : true
        });
    }

    /**
     * Endpoints at the context root (`GET /<context>`) live right in
     * `presentation/rest/`, and their wires in `wiring/presentation/rest/`.
     */
    const controller =
        controllerChoice === withoutController ? undefined : controllerChoice;

    const withWiring =
        ConfigFile.backend.domainFirstPackages.includes('@domain-first/wire');

    if (controller && !controllers.includes(controller) && withWiring) {
        boundedContextFolder
            .subitem(['wiring', 'presentation', 'rest'])
            .file('index.ts')
            .addLine(`export * from './${controller}'`);

        sharedRestFolder(boundedContextFolder)
            .file('wires.ts')
            .addLine(
                `export * from '../../bounded-contexts/${boundedContextFolder.name}/wiring/presentation/rest/${controller}'`
            );
    }

    const method = await select({
        key: 'method',
        message: 'Method:',
        choices: ['get', 'post', 'patch', 'delete', 'put']
    });

    const routeSegments = (
        await input({
            key: 'path',
            message: 'Relative path (split by "/"):',
            /**
             * Below the context root, a static first segment is a
             * controller: `/<context>/orders` is controller `orders`.
             */
            validate: (value) => {
                const [first] = value.split('/').filter((x) => !!x);
                return controller || !first || first.startsWith(':')
                    ? true
                    : `Without a controller, the path is empty or starts with a path parameter; "${first}" is a controller`;
            }
        })
    )
        .split('/')
        .filter((x) => !!x);

    /**
     * The controller is the first folder below `presentation/rest/`; the
     * context-root endpoints have none.
     */
    const folderSegments = [
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
    const nameSegments = [
        controller ?? boundedContextFolder.name,
        ...routeSegments
    ];
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
            route: { method: '${method}', path: [${[boundedContextFolder.name, ...folderSegments].map((x) => `'${x}'`).join(', ')}] },
            tags: ['${boundedContextFolder.name}${controller ? `: ${controller}` : ''}'],
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
            ...(controller ? [controller] : [])
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
         * A controller is re-exported once, when it is created; a
         * context-root endpoint is re-exported on its own.
         */
        if (!controller) {
            sharedRestFolder(boundedContextFolder)
                .file('wires.ts')
                .addLineIfMissing(
                    `export * from '../../bounded-contexts/${boundedContextFolder.name}/wiring/presentation/rest/${wireNaming.fileName}'`
                );
        }

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
