import { confirm, input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { createImplementation } from '../implementations';
import { passInMemoryDb, usesInMemoryDb } from '../in-memory-db';
import { UnknownFormatNaming } from '../unknown-format-naming';
import { wireNewModuleDependencies } from './wire-dependency';

export const scaffoldNewCommand = async (boundedContextFolder: Folder) => {
    const commandsFolder = boundedContextFolder.subitem([
        'application',
        'commands'
    ]);

    const commandName = await input({ message: 'Name: ' });
    const scaffoldUnitTests = Boolean(ConfigFile.Instance.data.testingLibrary);
    const naming = new UnknownFormatNaming(commandName);
    const withWiring =
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        );

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
        createImplementation(
            boundedContextFolder,
            {
                kind: 'command',
                name: naming.fileName,
                ownerPath: boundedContextFolder.path,
                labels: []
            },
            new UnknownFormatNaming(implementation).fileName
        );
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

    if (scaffoldUnitTests) {
        const implementationNaming = new UnknownFormatNaming(
            implementationType
        );
        const specFile = commandsFolder.createFile(
            `${naming.fileName}-command.spec.ts`,
            `
import { describe, test, expect, beforeEach } from '${ConfigFile.Instance.data.testingLibrary}'
${
    withWiring
        ? `import { type ${naming.ClassName}Command } from './${naming.fileName}-command'
import { wire${naming.ClassName}Command } from '../../wiring/commands/wire-${naming.fileName}-command'`
        : `import { ${implementationNaming.ClassName}${naming.ClassName}Command } from '../../infrastructure/commands/${implementationNaming.fileName}/${implementationNaming.fileName}-${naming.fileName}-command'

type ${naming.ClassName}Command = ${implementationNaming.ClassName}${naming.ClassName}Command`
}

let ${naming.variableName}Command: ${naming.ClassName}Command

beforeEach(() => {
    ${naming.variableName}Command = ${withWiring ? `wire${naming.ClassName}Command()` : `new ${implementationNaming.ClassName}${naming.ClassName}Command()`}
})

describe('${naming.withSpaces} command', () => {
    test('can be ${withWiring ? 'wired' : 'created via constructor'}', () => {
        expect(${naming.variableName}Command).toBeDefined()
    })
})
                `.trim()
        );

        if (!withWiring && usesInMemoryDb(implementationType)) {
            passInMemoryDb(
                specFile,
                `${implementationNaming.ClassName}${naming.ClassName}Command`
            );
        }
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

        const wireFile = boundedContextFolder
            .subitem(['wiring', 'commands'])
            .createFile(
                `wire-${naming.fileName}-command.ts`,
                `
import { wireClass } from '@domain-first/wire'
import { envBranchedWire } from '../../../../shared-kernel/wiring/env-branched-wire'
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

        await wireNewModuleDependencies(boundedContextFolder, wireFile);
    }
};
