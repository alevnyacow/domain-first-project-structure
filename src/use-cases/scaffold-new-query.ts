import { confirm, input } from '@inquirer/prompts';
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

    const implementationType = await input({
        message: 'Query infrastructure implementation type:',
        default: ConfigFile.Instance.data.defaultPersistenceLayerImplementation
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
import { ${naming.ClassName}Query } from '../../../application/queries/${naming.fileName}-query'

export class ${formatNaming.ClassName}${naming.ClassName}Query implements ${naming.ClassName}Query {
    constructor() {}

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

export class ${formatNaming.ClassName}${naming.ClassName}Query implements ${naming.ClassName}Query {

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
                'queries',
                formatNaming.fileName
            ]);
            wiringFolder.createFile(
                `wire-${formatNaming.fileName}-${naming.fileName}-query.ts`,
                `
import { wireClass } from '@domain-first/wire'
import { ${formatNaming.ClassName}${naming.ClassName}Query } from '../../../../infrastructure/queries/${formatNaming.fileName}/${formatNaming.fileName}-${naming.fileName}-query'

export const wire${formatNaming.ClassName}${naming.ClassName}Query = wireClass(
    ${formatNaming.ClassName}${naming.ClassName}Query,
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
        queriesFolder.createFile(
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

        boundedContextFolder
            .subitem(['wiring', 'application', 'queries'])
            .createFile(
                `wire-${naming.fileName}-query.ts`,
                `
import { envBranchedWire } from '../../../../../shared/wiring/env-branched-wire'
${implementationTypes
    .map((x) => new UnknownFormatNaming(x))
    .map(
        ({ ClassName, fileName }) =>
            `import { wire${ClassName}${naming.ClassName}Query } from '../../infrastructure/queries/${fileName}/wire-${fileName}-${naming.fileName}-query'`
    )
    .join('\n')}

export const wire${naming.ClassName}Query = envBranchedWire({
    test: wire${addTestImplementation ? testImplementationNaming.ClassName : implementationNaming.ClassName}${naming.ClassName}Query,
    development: wire${implementationNaming.ClassName}${naming.ClassName}Query,
    production: wire${implementationNaming.ClassName}${naming.ClassName}Query
})
`.trim()
            );
    }
};
