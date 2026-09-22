import { confirm, input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldNewAggregateUseCase = async (
    boundedContextFolder: Folder
) => {
    const aggregateName = await input({
        message: 'Aggregate name:'
    });

    const aggregateNaming = new UnknownFormatNaming(aggregateName);

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
            default: 'prisma'
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

            infrastructureRepositoriesFolder
                .subitem([naming.fileName])
                .createFile(
                    `${naming.fileName}-${aggregateName}-repository.ts`,
                    `
import { ${aggregateNaming.ClassName}Repository } from '../../../domain/aggregates/${aggregateName}'

export class ${naming.ClassName}${aggregateNaming.ClassName}Repository implements ${aggregateNaming.ClassName}Repository {
    constructor() {}
}

                        `.trim()
                );
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

            boundedContextFolder.subitem(['wiring', 'repositories']).createFile(
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
        }
    }
};
