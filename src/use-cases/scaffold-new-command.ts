import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { createImplementation } from '../implementations';
import {
    scaffoldIntegrationSpec,
    wantsIntegrationTests
} from '../integration-tests';
import { confirm, input } from '../interaction';
import { UnknownFormatNaming } from '../unknown-format-naming';
import {
    envBranchedWireArgument,
    envBranchedWireImport,
    offersTestImplementation
} from '../wire-branches';
import { promptImplementationType } from './prompt-implementation-type';
import { wireNewModuleDependencies } from './wire-dependency';

export const scaffoldNewCommand = async (boundedContextFolder: Folder) => {
    const commandsFolder = boundedContextFolder.subitem([
        'application',
        'commands'
    ]);

    const commandName = await input({ key: 'name', message: 'Name: ' });
    const naming = new UnknownFormatNaming(commandName);
    const primary = await promptImplementationType(
        'Command infrastructure implementation type:',
        'commands'
    );
    const implementationType = primary.label;
    const withIntegrationSpec = await wantsIntegrationTests(primary.label, {
        entered: primary.entered,
        save: primary.saveForFutureUse
    });

    let addTestImplementation: boolean = false;
    let testImplementationType: string = '';

    addTestImplementation =
        offersTestImplementation() &&
        (await confirm({
            key: 'withTestImplementation',
            message: 'Add a test implementation for Command'
        }));

    if (addTestImplementation) {
        testImplementationType = (
            await promptImplementationType(
                'Test Command infrastructure implementation type:',
                'commands',
                { existing: [implementationType], purpose: 'test' }
            )
        ).label;
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
        ConfigFile.backend.domainFirstPackages.includes(
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

    if (ConfigFile.backend.domainFirstPackages.includes('@domain-first/wire')) {
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
${envBranchedWireImport(boundedContextFolder.subitem(['wiring', 'commands']).path)}
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

export const wire${naming.ClassName}Command = envBranchedWire(${envBranchedWireArgument(
                    `wire${addTestImplementation ? testImplementationNaming.ClassName : implementationNaming.ClassName}Implementation`,
                    `wire${implementationNaming.ClassName}Implementation`
                )})
    `.trim()
            );

        await wireNewModuleDependencies(boundedContextFolder, wireFile);

        // After wiring: the spec builds the implementation through its factory.
        if (withIntegrationSpec)
            scaffoldIntegrationSpec(
                {
                    kind: 'command',
                    name: naming.fileName,
                    ownerPath: boundedContextFolder.path
                },
                new UnknownFormatNaming(implementationType).fileName
            );
    }
};
