import { input, select } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

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

    const path = (
        await input({
            message: 'Relative path (split by "/"):'
        })
    )
        .split('/')
        .filter((x) => !!x);

    const controllerFolder = restPresentationFolder.subitem([controller]);
    const endpointFolder = controllerFolder.subitem(path);

    const nameBase = `${controller}-${path.length ? `${path.join('-')}-` : ''}${method}-endpoint`;

    const endpointNaming = new UnknownFormatNaming(nameBase);

    /**
     * Endpoint class.
     */
    endpointFolder.createFile(
        `${method.toUpperCase()}.ts`,
        `
import { EndpointGenerator } from '@domain-first/handlers-rest'

export class ${endpointNaming.ClassName} {
    constructor(
        private readonly endpointGenerator: EndpointGenerator,
        private readonly handler: never
    ) {}

    get handle() {
        return this.endpointGenerator(this.handler.handle, {
            route: { method: '${method}', path: ['${boundedContextFolder.name}', '${controller}'${path.length ? `, ${path.map((x) => `'${x}'`).join(', ')}` : ''}] },
            tags: ['${boundedContextFolder.name}: ${controller}'],
        })
    }
}
        `.trim()
    );

    /**
     * Wiring.
     */
    if (
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        )
    ) {
        const wiringFolder = boundedContextFolder.subitem([
            'wiring',
            'presentation',
            'rest',
            controller
        ]);

        const wireNameBase = `wire-${nameBase}`;
        const wireNaming = new UnknownFormatNaming(wireNameBase);
        wiringFolder.createFile(
            `${wireNaming.fileName}.ts`,
            `
import { wireClass } from '@domain-first/wire'
import { ${endpointNaming.ClassName} } from '../../../../presentation/rest/${controller}/${path.length ? `${path.join('/')}/` : ''}${method.toUpperCase()}'

export const wire${endpointNaming.ClassName} = wireClass(
    ${endpointNaming.ClassName},
    []
)
        `
        );

        wiringFolder
            .file('index.ts')
            .addLine(`export * from './${wireNaming.fileName}'`);
    }
};
