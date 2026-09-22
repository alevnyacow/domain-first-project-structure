import { confirm, input, select } from '@inquirer/prompts';
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
    let scaffoldUnitTests: boolean | undefined;
    if (ConfigFile.Instance.data.testingLibrary) {
        scaffoldUnitTests = await confirm({ message: 'Scaffold unit-tests' });
    }
    const naming = new UnknownFormatNaming(commandName);
    const commandType = await select({
        choices: [
            'Execution (with infrastructure implementation)',
            'Orchestrator (no infrastructure implementation)'
        ],
        message: 'Command type'
    });

    const isOrchestrator =
        commandType === 'Orchestrator (no infrastructure implementation)';

    if (scaffoldUnitTests) {
        commandsFolder
            .subitem([isOrchestrator ? 'orchestration' : 'execution'])
            .createFile(
                `${naming.fileName}-command.spec.ts`,
                `
import { describe, test, expect, beforeEach } from '${ConfigFile.Instance.data.testingLibrary}'
import { type ${naming.ClassName}Command } from './${naming.fileName}-command'
import { wire${naming.ClassName}Command } from '../../../wiring/commands/wire-${naming.fileName}-command'

let ${naming.variableName}Command: ${naming.ClassName}Command

beforeEach(() => {
    ${naming.variableName}Command = wire${naming.ClassName}Command()
})

describe('${naming.withSpaces} command', () => {
    test('can be wired', () => {
        expect(${naming.variableName}Command).toBeDefined()
    })
})
                `
            );
    }

    if (!isOrchestrator) {
        const implementationType = await input({
            message: 'Command infrastructure implementation type:',
            default:
                ConfigFile.Instance.data.defaultPersistenceLayerImplementation
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
import { ${naming.ClassName}Command } from '../../../application/commands/execution/${naming.fileName}-command'

export class ${formatNaming.ClassName}${naming.ClassName}Command extends ${naming.ClassName}Command {
    constructor() {
        super()
    }

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

export class ${formatNaming.ClassName}${naming.ClassName}Command extends ${naming.ClassName}Command {
    constructor() {
        super()
    }
}
    `.trim()
            );
        }

        if (
            ConfigFile.Instance.data.domainFirstPackages.includes(
                '@domain-first/handlers'
            )
        ) {
            commandsFolder.subitem(['execution']).createFile(
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

            boundedContextFolder.subitem(['wiring', 'commands']).createFile(
                `wire-${naming.fileName}-command.ts`,
                `
import { wireClass } from '@domain-first/wire'
import { envBranchedWire } from '../../../../shared/wiring/env-branched-wire'
${implementationTypes
    .map((x) => new UnknownFormatNaming(x))
    .map(({ ClassName, fileName }) => {
        return `import { ${ClassName}${naming.ClassName}Command } from '../../infrastructure/commands/${fileName}/${fileName}-${naming.fileName}-command'`;
    })
    .join('\n')}

${implementationTypes
    .map((x) => new UnknownFormatNaming(x))
    .map(
        ({ ClassName }) =>
            `const wire${ClassName}Implementation = wireClass(${ClassName}${naming.ClassName}Command, [])` //from '../../infrastructure/commands/${fileName}/wire-${fileName}-${naming.fileName}-command'`
    )
    .join('\n\n')}

export const wire${naming.ClassName}Command = envBranchedWire({
    test: wire${addTestImplementation ? testImplementationNaming.ClassName : implementationNaming.ClassName}Implementation,
    development: wire${implementationNaming.ClassName}Implementation,
    production: wire${implementationNaming.ClassName}Implementation
})
    `.trim()
            );
        }
        return;
    }

    /**
     * Orchestrator command
     */
    if (
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/handlers'
        )
    ) {
        commandsFolder.subitem(['orchestration']).createFile(
            `${naming.fileName}-command.ts`,
            `
import { defineHandler } from '@domain-first/handlers'

export class ${naming.ClassName}Command {
    static inputSchema = {}
    static outputSchema = {}

    handle = defineHandler({
        inputSchema: ${naming.ClassName}Command.inputSchema,
        outputSchema: ${naming.ClassName}Command.outputSchema,
        handler: async (payload) => {
            return {}
        }
    })
}
                `.trim()
        );
    } else {
        commandsFolder.subitem(['orchestration']).createFile(
            `${naming.fileName}-command.ts`,
            `
export class ${naming.ClassName}Command {

}`.trim()
        );
    }

    if (
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        )
    ) {
        boundedContextFolder.subitem(['wiring', 'commands']).createFile(
            `wire-${naming.fileName}-command.ts`,
            `
import { wireClass } from '@domain-first/wire'
import { ${naming.ClassName}Command } from '../../application/commands/orchestration/${naming.fileName}-command'

export const wire${naming.ClassName}Command = wireClass(${naming.ClassName}Command, [])
`.trim()
        );
    }
};
