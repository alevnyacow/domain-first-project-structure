import { confirm, input, select } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldNewQuery = async (boundedContextFolder: Folder) => {
    const queriesFolder = boundedContextFolder.subitem([
        'application',
        'queries'
    ]);

    const infrastructureFolder = boundedContextFolder.subitem([
        'infrastructure',
        'queries'
    ]);

    const queryName = await input({ message: 'Name: ' });
    const naming = new UnknownFormatNaming(queryName);
    let scaffoldUnitTests: boolean | undefined;
    if (ConfigFile.Instance.data.testingLibrary) {
        scaffoldUnitTests = await confirm({ message: 'Scaffold unit-tests' });
    }

    const queryType = await select({
        choices: [
            'Execution (with infrastructure implementation)',
            'Orchestrator (no infrastructure implementation)'
        ],
        message: 'Query type'
    });

    const isOrchestrator =
        queryType === 'Orchestrator (no infrastructure implementation)';

    if (scaffoldUnitTests) {
        queriesFolder
            .subitem([isOrchestrator ? 'orchestration' : 'execution'])
            .createFile(
                `${naming.fileName}-query.spec.ts`,
                `
import { describe, test, expect, beforeEach } from '${ConfigFile.Instance.data.testingLibrary}'
import { type ${naming.ClassName}Query } from './${naming.fileName}-query'
import { wire${naming.ClassName}Query } from '../../../wiring/queries/wire-${naming.fileName}-query'

let ${naming.variableName}Query: ${naming.ClassName}Query

beforeEach(() => {
    ${naming.variableName}Query = wire${naming.ClassName}Query()
})

describe('${naming.withSpaces} query', () => {
    test('can be wired', () => {
        expect(${naming.variableName}Query).toBeDefined()
    })
})
                `.trim()
            );
    }

    if (!isOrchestrator) {
        const implementationType = await input({
            message: 'Query infrastructure implementation type:',
            default:
                ConfigFile.Instance.data.defaultPersistenceLayerImplementation
        });

        let addTestImplementation: boolean = false;
        let testImplementationType: string = '';

        addTestImplementation = await confirm({
            message: 'Add a test implementation for Query'
        });

        if (addTestImplementation) {
            testImplementationType = await input({
                message: 'Test Query infrastructure implementation type:',
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
                `${formatNaming.fileName}-${naming.fileName}-query.ts`,
                ConfigFile.Instance.data.domainFirstPackages.includes(
                    '@domain-first/handlers'
                )
                    ? /** Implementation with @domain-first/handlers */
                      `
import { defineHandler } from '@domain-first/handlers'
import { ${naming.ClassName}Query } from '../../../application/queries/execution/${naming.fileName}-query'

export class ${formatNaming.ClassName}${naming.ClassName}Query extends ${naming.ClassName}Query {
    constructor() {
        super()
    }

    handle = defineHandler({
        inputSchema: ${naming.ClassName}Query.inputSchema,
        outputSchema: ${naming.ClassName}Query.outputSchema,
        handler: async (input) => {
            return {}
        }
    })
}
        `.trim()
                    : /** Implementation without @domain-first/handlers */ `
import { ${naming.ClassName}Query } from '../../../domain/queries/${naming.fileName}-query'

export class ${formatNaming.ClassName}${naming.ClassName}Query extends ${naming.ClassName}Query {
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
            queriesFolder.subitem(['execution']).createFile(
                `${naming.fileName}-query.ts`,
                `
import type { Handler } from '@domain-first/handlers'

export abstract class ${naming.ClassName}Query {
    static inputSchema = {}
    static outputSchema = {}

    abstract handle: Handler<typeof ${naming.ClassName}Query.inputSchema, typeof ${naming.ClassName}Query.outputSchema>
}
                    `.trim()
            );
        } else {
            queriesFolder.createFile(
                `${naming.fileName}-query.ts`,
                `
export abstract class ${naming.ClassName}Query {

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

            boundedContextFolder.subitem(['wiring', 'queries']).createFile(
                `wire-${naming.fileName}-query.ts`,
                `
import { wireClass } from '@domain-first/wire'
import { envBranchedWire } from '../../../../shared/wiring/env-branched-wire'
${implementationTypes
    .map((x) => new UnknownFormatNaming(x))
    .map(({ ClassName, fileName }) => {
        return `import { ${ClassName}${naming.ClassName}Query } from '../../infrastructure/queries/${fileName}/${fileName}-${naming.fileName}-query'`;
    })
    .join('\n')}

${implementationTypes
    .map((x) => new UnknownFormatNaming(x))
    .map(
        ({ ClassName }) =>
            `const wire${ClassName}Implementation = wireClass(${ClassName}${naming.ClassName}Query, [])` //from '../../infrastructure/queries/${fileName}/wire-${fileName}-${naming.fileName}-query'`
    )
    .join('\n\n')}

export const wire${naming.ClassName}Query = envBranchedWire({
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
     * Orchestrator query
     */
    if (
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/handlers'
        )
    ) {
        queriesFolder.subitem(['orchestration']).createFile(
            `${naming.fileName}-query.ts`,
            `
import { defineHandler } from '@domain-first/handlers'

export class ${naming.ClassName}Query {
    static inputSchema = {}
    static outputSchema = {}

    handle = defineHandler({
        inputSchema: ${naming.ClassName}Query.inputSchema,
        outputSchema: ${naming.ClassName}Query.outputSchema,
        handler: async (payload) => {
            return {}
        }
    })
}
                `.trim()
        );
    } else {
        queriesFolder.subitem(['orchestration']).createFile(
            `${naming.fileName}-query.ts`,
            `
export class ${naming.ClassName}Query {

}`.trim()
        );
    }

    if (
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        )
    ) {
        boundedContextFolder.subitem(['wiring', 'queries']).createFile(
            `wire-${naming.fileName}-query.ts`,
            `
import { wireClass } from '@domain-first/wire'
import { ${naming.ClassName}Query } from '../../application/queries/orchestration/${naming.fileName}-query'

export const wire${naming.ClassName}Query = wireClass(${naming.ClassName}Query, [])
`.trim()
        );
    }
};
