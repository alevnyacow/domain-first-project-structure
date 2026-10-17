import { confirm, input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import {
    addInMemoryDbSection,
    inMemoryDbSectionMembers,
    inMemoryDbTypeImport,
    passInMemoryDb,
    usesInMemoryDb,
    wireInMemoryDb
} from '../in-memory-db';
import { UnknownFormatNaming } from '../unknown-format-naming';
import { wireNewModuleDependencies } from './wire-dependency';

export const scaffoldNewAggregateUseCase = async (
    boundedContextFolder: Folder
) => {
    const aggregateName = await input({
        message: 'Aggregate name:'
    });

    const aggregateNaming = new UnknownFormatNaming(aggregateName);

    const scaffoldUnitTests = Boolean(ConfigFile.Instance.data.testingLibrary);

    const withRepository = await confirm({
        message: 'With Repository'
    });

    const aggregatesFolder = boundedContextFolder.subitem([
        'domain',
        'aggregates',
        aggregateName
    ]);

    aggregatesFolder.createFile(
        `${aggregateNaming.fileName}.aggregate-root.ts`,
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/types'
        )
            ? /**
               * Content with domain-first types integration
               */
              `
import { domainType } from '@domain-first/types'

export class ${aggregateNaming.ClassName} extends domainType() {

}`.trim()
            : /**
               * Content without domain-first types integration
               */
              `export class ${aggregateNaming.ClassName} {}`
    );

    const barrelFile = aggregatesFolder.createFile(
        `index.ts`,
        `export * from './${aggregateNaming.fileName}.aggregate-root'`
    );

    if (scaffoldUnitTests) {
        aggregatesFolder.createFile(
            `${aggregateNaming.fileName}.aggregate-root.spec.ts`,
            `
import { describe, test, expect, beforeEach } from '${ConfigFile.Instance.data.testingLibrary}'
import { ${aggregateNaming.ClassName} } from './${aggregateNaming.fileName}.aggregate-root'

let ${aggregateNaming.variableName}: ${aggregateNaming.ClassName}

beforeEach(() => {
    ${aggregateNaming.variableName} = new ${aggregateNaming.ClassName}()
})

describe('${aggregateNaming.withSpaces}', () => {
    test('can be instantiated via constructor', () => {
        expect(${aggregateNaming.variableName}).toBeDefined()
    })
})
            `.trim()
        );
    }

    if (withRepository) {
        /**
         * Domain logic
         */
        aggregatesFolder.createFile(
            `${aggregateNaming.fileName}-repository.ts`,
            `export abstract class ${aggregateNaming.ClassName}Repository { }`
        );

        barrelFile.addLine(
            `export * from './${aggregateNaming.fileName}-repository'`
        );

        /**
         * Infrastructure prompts
         */
        const infrastructureImplementationType = await input({
            message: 'Repository infrastructure implementation type:',
            default:
                ConfigFile.Instance.data.defaultPersistenceLayerImplementation
        });

        let addTestImplementation: boolean = false;
        let testImplementationType: string = '';

        addTestImplementation = await confirm({
            message: 'Add a test implementation for Repository'
        });

        if (addTestImplementation) {
            testImplementationType = await input({
                message: 'Test Repository infrastructure implementation type:',
                default: 'in-memory'
            });
        }

        /**
         * Infrastructure scaffolding.
         */
        const infrastructureRepositoriesFolder = boundedContextFolder.subitem([
            'infrastructure',
            'repositories'
        ]);

        const implementationTypes = [
            infrastructureImplementationType,
            testImplementationType
        ].filter((x) => !!x);

        for (const implementation of implementationTypes) {
            const naming = new UnknownFormatNaming(implementation);
            const repositoryFolder = infrastructureRepositoriesFolder.subitem([
                naming.fileName
            ]);
            const repositoryFileName = `${naming.fileName}-${aggregateName}-repository.ts`;

            /**
             * An in-memory repository keeps its aggregates in their own
             * section of the shared in-memory DB.
             */
            if (usesInMemoryDb(implementation)) {
                const section = addInMemoryDbSection(
                    aggregateNaming,
                    aggregatesFolder.path
                );
                repositoryFolder.createFile(
                    repositoryFileName,
                    `
${inMemoryDbTypeImport(repositoryFolder.subitem([repositoryFileName]).path)}
import { ${aggregateNaming.ClassName}Repository } from '../../../domain/aggregates/${aggregateName}'

export class ${naming.ClassName}${aggregateNaming.ClassName}Repository implements ${aggregateNaming.ClassName}Repository {
    ${inMemoryDbSectionMembers(section, false)}
}
                        `.trim()
                );
                continue;
            }

            repositoryFolder.createFile(
                repositoryFileName,
                `
import { ${aggregateNaming.ClassName}Repository } from '../../../domain/aggregates/${aggregateName}'

export class ${naming.ClassName}${aggregateNaming.ClassName}Repository implements ${aggregateNaming.ClassName}Repository {
    constructor() {}
}

                        `.trim()
            );
        }

        if (scaffoldUnitTests) {
            const implementationNaming = new UnknownFormatNaming(
                infrastructureImplementationType
            );
            const specFile = aggregatesFolder.createFile(
                `${aggregateNaming.fileName}-repository.spec.ts`,
                `
import { describe, test, expect, beforeEach } from '${ConfigFile.Instance.data.testingLibrary}'
${
    ConfigFile.Instance.data.domainFirstPackages.includes('@domain-first/wire')
        ? `import { wire${aggregateNaming.ClassName}Repository } from '../../../wiring/repositories/wire-${aggregateNaming.fileName}-repository'
import type { ${aggregateNaming.ClassName}Repository } from './${aggregateNaming.fileName}-repository'`
        : `import { ${implementationNaming.ClassName}${aggregateNaming.ClassName}Repository } from '../../../infrastructure/repositories/${implementationNaming.fileName}/${implementationNaming.fileName}-${aggregateNaming.fileName}-repository'

type ${aggregateNaming.ClassName}Repository = ${implementationNaming.ClassName}${aggregateNaming.ClassName}Repository`
}

let ${aggregateNaming.variableName}Repository: ${aggregateNaming.ClassName}Repository

beforeEach(() => {
    ${aggregateNaming.variableName}Repository = ${ConfigFile.Instance.data.domainFirstPackages.includes('@domain-first/wire') ? `wire${aggregateNaming.ClassName}Repository()` : `new ${implementationNaming.ClassName}${aggregateNaming.ClassName}Repository()`}
})

describe('${aggregateNaming.withSpaces} repository', () => {
    test('can be ${ConfigFile.Instance.data.domainFirstPackages.includes('@domain-first/wire') ? 'wired' : 'created via constructor'}', () => {
        expect(${aggregateNaming.variableName}Repository).toBeDefined()
    })
})
                `.trim()
            );

            if (
                !ConfigFile.Instance.data.domainFirstPackages.includes(
                    '@domain-first/wire'
                ) &&
                usesInMemoryDb(infrastructureImplementationType)
            ) {
                passInMemoryDb(
                    specFile,
                    `${implementationNaming.ClassName}${aggregateNaming.ClassName}Repository`
                );
            }
        }

        if (
            ConfigFile.Instance.data.domainFirstPackages.includes(
                '@domain-first/wire'
            )
        ) {
            const implementationNaming = new UnknownFormatNaming(
                infrastructureImplementationType
            );
            const testImplementationNaming = new UnknownFormatNaming(
                testImplementationType
            );

            const wireFile = boundedContextFolder
                .subitem(['wiring', 'repositories'])
                .createFile(
                    `wire-${aggregateNaming.fileName}-repository.ts`,
                    `
import { wireClass } from '@domain-first/wire'
import { envBranchedWire } from '../../../../shared/wiring/env-branched-wire'
${implementationTypes
    .map((x) => new UnknownFormatNaming(x))
    .map(({ ClassName, fileName }) => {
        return `import { ${ClassName}${aggregateNaming.ClassName}Repository } from '../../infrastructure/repositories/${fileName}/${fileName}-${aggregateNaming.fileName}-repository'`;
    })
    .join('\n')}

${implementationTypes
    .map((x) => new UnknownFormatNaming(x))
    .map(
        ({ ClassName }) =>
            `const wire${ClassName}Implementation = wireClass(${ClassName}${aggregateNaming.ClassName}Repository, [])`
    )
    .join('\n\n')}

export const wire${aggregateNaming.ClassName}Repository = envBranchedWire({
    test: wire${addTestImplementation ? testImplementationNaming.ClassName : implementationNaming.ClassName}Implementation,
    development: wire${implementationNaming.ClassName}Implementation,
    production: wire${implementationNaming.ClassName}Implementation
})
    `.trim()
                );

            for (const implementation of implementationTypes.filter(
                usesInMemoryDb
            )) {
                wireInMemoryDb(
                    wireFile,
                    `${new UnknownFormatNaming(implementation).ClassName}${aggregateNaming.ClassName}Repository`
                );
            }

            await wireNewModuleDependencies(boundedContextFolder, wireFile);
        }
    }
};
