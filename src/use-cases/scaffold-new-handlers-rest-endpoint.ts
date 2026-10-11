import path from 'node:path';
import { input, select } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';
import { relativeImport } from '../wiring';
import { promptEndpointDependencies } from './wire-dependency';

export const scaffoldNewHandlersRestEndpoint = async (
    boundedContextFolder: Folder
) => {
    const restPresentationFolder = boundedContextFolder.subitem([
        'presentation',
        'rest'
    ]);
    const controllers = restPresentationFolder.content.subfolderNames;

    let controller = await select({
        message: 'Controller: ',
        choices: [...controllers, 'New controller']
    });

    if (controller === 'New controller') {
        controller = await input({
            message: 'Name: '
        });

        if (
            ConfigFile.Instance.data.domainFirstPackages.includes(
                '@domain-first/wire'
            )
        ) {
            boundedContextFolder
                .subitem(['wiring', 'presentation', 'rest'])
                .file('index.ts')
                .addLine(`export * from './${controller}'`);

            const sharedRestFolder = boundedContextFolder.subitem([
                '..',
                '..',
                'presentation',
                'rest'
            ]);

            sharedRestFolder
                .file('wires.ts')
                .addLine(
                    `export * from '../../bounded-contexts/${boundedContextFolder.name}/wiring/presentation/rest/${controller}'`
                );

            if (!sharedRestFolder.file('index.ts').exists) {
                sharedRestFolder.createFile(
                    'index.ts',
                    `
import * as wires from './wires'

const restWires = Object.values(wires)

export const restHandlers = restWires.map(x => x().handle)
`.trim()
                );
            }
        }
    }

    const method = await select({
        message: 'Method:',
        choices: ['get', 'post', 'patch', 'delete', 'put']
    });

    const routeSegments = (
        await input({
            message: 'Relative path (split by "/"):'
        })
    )
        .split('/')
        .filter((x) => !!x);

    const controllerFolder = restPresentationFolder.subitem([controller]);
    const endpointFolder = controllerFolder.subitem(routeSegments);

    const nameBase = `${controller}-${routeSegments.length ? `${routeSegments.join('-')}-` : ''}${method}-endpoint`;

    const endpointNaming = new UnknownFormatNaming(nameBase);

    const withWiring =
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        );

    /**
     * With wiring, the user picks both constructor parameters from wired
     * modules; otherwise they stay placeholders.
     */
    const { endpointGenerator, handler } = withWiring
        ? await promptEndpointDependencies(boundedContextFolder)
        : { endpointGenerator: undefined, handler: undefined };

    const endpointFile = path.join(
        endpointFolder.path,
        `${method.toUpperCase()}.ts`
    );

    /**
     * Endpoint class.
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

export class ${endpointNaming.ClassName} {
    constructor(
        private readonly endpointGenerator: ${endpointGenerator?.typeName ?? 'EndpointGenerator'},
        private readonly handler: ${handler?.typeName ?? 'never'}
    ) {}

    get handle() {
        return this.endpointGenerator(this.handler.handle, {
            route: { method: '${method}', path: ['${boundedContextFolder.name}', '${controller}'${routeSegments.length ? `, ${routeSegments.map((x) => `'${x}'`).join(', ')}` : ''}] },
            tags: ['${boundedContextFolder.name}: ${controller}'],
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
            controller
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
import { ${endpointNaming.ClassName} } from '${relativeImport(wireFile, endpointFile)}'
${dependencies
    .map(
        (x) =>
            `import { ${x.wireName} } from '${relativeImport(wireFile, x.wireFile)}'`
    )
    .join('\n')}

export const wire${endpointNaming.ClassName} = wireClass(
    ${endpointNaming.ClassName},
    [${dependencies.map((x) => x.wireName).join(', ')}]
)
        `.trim()
        );

        wiringFolder
            .file('index.ts')
            .addLine(`export * from './${wireNaming.fileName}'`);
    }
};
