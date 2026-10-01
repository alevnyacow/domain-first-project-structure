import { confirm, input } from '@inquirer/prompts';
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

    let scaffoldUnitTests: boolean | undefined;

    if (ConfigFile.Instance.data.testingLibrary) {
        scaffoldUnitTests = await confirm({ message: 'Scaffold unit-tests' });
    }

    const withWiring =
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        );

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

    if (scaffoldUnitTests) {
        useCasesFolder.createFile(
            `${naming.fileName}-use-case.spec.ts`,
            `
import { describe, test, expect, beforeEach } from '${ConfigFile.Instance.data.testingLibrary}'
${
    withWiring
        ? `import { type ${naming.ClassName}UseCase } from './${naming.fileName}-use-case'
import { wire${naming.ClassName}UseCase } from '../../wiring/use-cases/wire-${naming.fileName}-use-case'`
        : `import { ${naming.ClassName}UseCase } from './${naming.fileName}-use-case'`
}

let ${naming.variableName}UseCase: ${naming.ClassName}UseCase

beforeEach(() => {
    ${naming.variableName}UseCase = ${withWiring ? `wire${naming.ClassName}UseCase()` : `new ${naming.ClassName}UseCase()`}
})

describe('${naming.withSpaces} use case', () => {
    test('can be ${withWiring ? 'wired' : 'created'}', () => {
        expect(${naming.variableName}UseCase).toBeDefined()
    })
})
            `.trim()
        );
    }

    if (withWiring) {
        boundedContextFolder.subitem(['wiring', 'use-cases']).createFile(
            `wire-${naming.fileName}-use-case.ts`,
            `
import { wireClass } from '@domain-first/wire'
import { ${naming.ClassName}UseCase } from '../../application/use-cases/${naming.fileName}-use-case'

export const wire${naming.ClassName}UseCase = wireClass(
    ${naming.ClassName}UseCase,
    []
)

`.trim()
        );
    }
};
