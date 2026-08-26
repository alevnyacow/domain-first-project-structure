import { input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldNewUseCase = async (boundedContextFolder: Folder) => {
    const useCasesFolder = boundedContextFolder.subitem([
        'application',
        'use-cases'
    ]);

    const useCaseName = await input({ message: 'Name: ' });
    const naming = new UnknownFormatNaming(useCaseName);

    useCasesFolder.createFile(
        `${naming.fileName}-use-case.ts`,
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/handlers'
        )
            ? /** implementation with @domain-first */
              `
import { defineHandler } from '@domain-first/handlers'

export class ${naming.ClassName}UseCase {
    constructor() {}

    static inputSchema = {}
    static outputSchema = {}

    handle = defineHandler({
        inputSchema: ${naming.ClassName}UseCase.inputSchema,
        outputSchema: ${naming.ClassName}UseCase.outputSchema,
        handler: async (input) => {
            return {}
        }
    })
}
        `.trim()
            : /**
               * implementation without @domain-first/handlers
               */
              `
export class ${naming.ClassName}UseCase {

}
`.trim()
    );

    if (
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        )
    ) {
        boundedContextFolder
            .subitem(['wiring', 'application', 'use-cases'])
            .createFile(
                `wire-${naming.fileName}-use-case.ts`,
                `
import { wireClass } from '@domain-first/wire'
import { ${naming.ClassName}UseCase } from '../../../application/use-cases/${naming.fileName}-use-case'

export const wire${naming.ClassName}UseCase = wireClass(
    ${naming.ClassName}UseCase,
    []
)

`.trim()
            );
    }
};
