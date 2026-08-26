import { confirm, input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldNewCommand = async (boundedContextFolder: Folder) => {
    const commandsFolder = boundedContextFolder.subitem([
        'application',
        'commands'
    ]);

    const infrastructureFolder = boundedContextFolder.subitem([
        'infrastructure',
        'commands'
    ]);

    const commandName = await input({ message: 'Name: ' });
    const naming = new UnknownFormatNaming(commandName);

    const implementationType = await input({
        message: 'Command infrastructure implementation type:',
        default: ConfigFile.Instance.data.defaultPersistenceLayerImplementation
    });

    let addTestImplementation: boolean = false;
    let testImplementationType: string = '';

    addTestImplementation = await confirm({
        message: 'Add a test implementation for Command'
    });

    if (addTestImplementation) {
        testImplementationType = await input({
            message: 'Test Command infrastructure implementation type:',
            default: 'in-memory'
        });
    }

    const implementationTypes = [
        implementationType,
        testImplementationType
    ].filter((x) => !!x);

    for (const implementation of implementationTypes) {
        const formatNaming = new UnknownFormatNaming(implementation);

        infrastructureFolder.subitem([formatNaming.fileName]).createFile(
            `${formatNaming.fileName}-${naming.fileName}-command.ts`,
            ConfigFile.Instance.data.domainFirstPackages.includes(
                '@domain-first/handlers'
            )
                ? /** Implementation with @domain-first/handlers */
                  `
import { defineHandler } from '@domain-first/handlers'
import { ${naming.ClassName}Command } from '../../../application/commands/${naming.fileName}-command'

export class ${formatNaming.ClassName}${naming.ClassName}Command implements ${naming.ClassName}Command {
    constructor() {}

    handle = defineHandler({
        inputSchema: ${naming.ClassName}Command.inputSchema,
        outputSchema: ${naming.ClassName}Command.outputSchema,
        handler: async (input) => {
            return {}
        }
    })
}
    `.trim()
                : /** Implementation without @domain-first/handlers */ `
import { ${naming.ClassName}Command } from '../../../domain/commands/${naming.fileName}-command'

export class ${formatNaming.ClassName}${naming.ClassName}Command implements ${naming.ClassName}Command {

}
`.trim()
        );

        if (
            ConfigFile.Instance.data.domainFirstPackages.includes(
                '@domain-first/wire'
            )
        ) {
            const wiringFolder = boundedContextFolder.subitem([
                'wiring',
                'infrastructure',
                'commands',
                formatNaming.fileName
            ]);
            wiringFolder.createFile(
                `wire-${formatNaming.fileName}-${naming.fileName}-command.ts`,
                `
import { wireClass } from '@domain-first/wire'
import { ${formatNaming.ClassName}${naming.ClassName}Command } from '../../../../infrastructure/commands/${formatNaming.fileName}/${formatNaming.fileName}-${naming.fileName}-command'

export const wire${formatNaming.ClassName}${naming.ClassName}Command = wireClass(
    ${formatNaming.ClassName}${naming.ClassName}Command,
    []
)

                `.trim()
            );
        }
    }

    if (
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/handlers'
        )
    ) {
        commandsFolder.createFile(
            `${naming.fileName}-command.ts`,
            `
import type { Handler } from '@domain-first/handlers'

export abstract class ${naming.ClassName}Command {
    static inputSchema = {}
    static outputSchema = {}

    abstract handle: Handler<typeof ${naming.ClassName}Command.inputSchema, typeof ${naming.ClassName}Command.outputSchema>
}
                `.trim()
        );
    } else {
        commandsFolder.createFile(
            `${naming.fileName}-command.ts`,
            `
export abstract class ${naming.ClassName}Command {

}`.trim()
        );
    }

    if (
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        )
    ) {
        const implementationNaming = new UnknownFormatNaming(
            implementationType
        );
        const testImplementationNaming = new UnknownFormatNaming(
            testImplementationType
        );

        boundedContextFolder
            .subitem(['wiring', 'application', 'commands'])
            .createFile(
                `wire-${naming.fileName}-command.ts`,
                `
import { envBranchedWire } from '../../../../../shared/wiring/env-branched-wire'
${implementationTypes
    .map((x) => new UnknownFormatNaming(x))
    .map(
        ({ ClassName, fileName }) =>
            `import { wire${ClassName}${naming.ClassName}Command } from '../../infrastructure/commands/${fileName}/wire-${fileName}-${naming.fileName}-command'`
    )
    .join('\n')}

export const wire${naming.ClassName}Command = envBranchedWire({
    test: wire${addTestImplementation ? testImplementationNaming.ClassName : implementationNaming.ClassName}${naming.ClassName}Command,
    development: wire${implementationNaming.ClassName}${naming.ClassName}Command,
    production: wire${implementationNaming.ClassName}${naming.ClassName}Command
})
`.trim()
            );
    }
};
