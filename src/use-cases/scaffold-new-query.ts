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
    offersTestImplementation
} from '../wire-branches';
import { promptImplementationType } from './prompt-implementation-type';
import { wireNewModuleDependencies } from './wire-dependency';

export const scaffoldNewQuery = async (boundedContextFolder: Folder) => {
    const queriesFolder = boundedContextFolder.subitem([
        'application',
        'queries'
    ]);

    const queryName = await input({ key: 'name', message: 'Name: ' });
    const naming = new UnknownFormatNaming(queryName);
    const primary = await promptImplementationType(
        'Query infrastructure implementation type:',
        'queries'
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
            message: 'Add a test implementation for Query'
        }));

    if (addTestImplementation) {
        testImplementationType = (
            await promptImplementationType(
                'Test Query infrastructure implementation type:',
                'queries',
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
                kind: 'query',
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

    if (ConfigFile.backend.domainFirstPackages.includes('@domain-first/wire')) {
        const implementationNaming = new UnknownFormatNaming(
            implementationType
        );
        const testImplementationNaming = new UnknownFormatNaming(
            testImplementationType
        );

        const wireFile = boundedContextFolder
            .subitem(['wiring', 'queries'])
            .createFile(
                `wire-${naming.fileName}-query.ts`,
                `
import { wireClass } from '@domain-first/wire'
import { envBranchedWire } from '../../../../shared-kernel/wiring/env-branched-wire'
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

export const wire${naming.ClassName}Query = envBranchedWire(${envBranchedWireArgument(
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
                    kind: 'query',
                    name: naming.fileName,
                    ownerPath: boundedContextFolder.path
                },
                new UnknownFormatNaming(implementationType).fileName
            );
    }
};
