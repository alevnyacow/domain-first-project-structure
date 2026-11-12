import { ConfigFile } from '../config-file';
import { hasNeighboringBoundedContext } from '../context-dependencies';
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

export const scaffoldNewApplicationPort = async (
    boundedContextFolder: Folder
) => {
    const name = await input({ key: 'name', message: 'Name: ' });
    const naming = new UnknownFormatNaming(name);

    const wiringFolder = boundedContextFolder.subitem([
        'wiring',
        'application-ports'
    ]);

    const applicationPortsFolder = boundedContextFolder.subitem([
        'application',
        'ports'
    ]);
    applicationPortsFolder.createFile(
        `${naming.fileName}.ts`,
        `
export abstract class ${naming.ClassName} {

}
            `.trim()
    );

    const crossContext = hasNeighboringBoundedContext(
        boundedContextFolder.path
    );
    const primary = await promptImplementationType(
        'Adapter implementation type:',
        'ports',
        {
            crossContext
        }
    );
    const implementationType = primary.label;
    const withIntegrationSpec = await wantsIntegrationTests(primary.label, {
        entered: primary.entered,
        save: primary.saveForFutureUse
    });

    const addTestImplementation =
        offersTestImplementation() &&
        (await confirm({
            key: 'withTestImplementation',
            message: 'With test implementation'
        }));
    let testImplementationType = '';
    if (addTestImplementation) {
        testImplementationType = (
            await promptImplementationType(
                'Test adapter implementation type:',
                'ports',
                {
                    existing: [implementationType],
                    purpose: 'test',
                    crossContext
                }
            )
        ).label;
    }

    const implementationTypes = [implementationType, testImplementationType]
        .filter((x) => !!x)
        .map((x) => new UnknownFormatNaming(x).fileName);

    for (const implementation of implementationTypes) {
        createImplementation(
            boundedContextFolder,
            {
                kind: 'port',
                name: naming.fileName,
                ownerPath: boundedContextFolder.path,
                labels: []
            },
            implementation
        );
    }

    if (ConfigFile.backend.domainFirstPackages.includes('@domain-first/wire')) {
        const wireFile = wiringFolder.createFile(
            `wire-${naming.fileName}.ts`,
            `
import { wireClass } from '@domain-first/wire'
import { envBranchedWire } from '../../../${boundedContextFolder.name === 'shared-kernel' ? '' : '../'}shared-kernel/wiring/env-branched-wire'
${implementationTypes
    .map((x) => {
        return {
            naming: new UnknownFormatNaming(`${x}-${naming.fileName}`),
            implementation: x
        };
    })
    .map(
        ({ naming: { ClassName, fileName }, implementation }) =>
            `import { ${ClassName} } from '../../infrastructure/application-adapters/${implementation}/${fileName}'`
    )
    .join('\n')}

${implementationTypes
    .map((x) => {
        return {
            naming: new UnknownFormatNaming(`${x}-${naming.fileName}`),
            implementation: x
        };
    })
    .map(
        ({ naming: { ClassName }, implementation }) =>
            `const wire${new UnknownFormatNaming(implementation).ClassName}Implementation = wireClass(${ClassName}, [])`
    )
    .join('\n\n')}

export const wire${naming.ClassName} = envBranchedWire(${envBranchedWireArgument(
                `wire${new UnknownFormatNaming(`${implementationTypes.at(-1)!}-implementation`).ClassName}`,
                `wire${new UnknownFormatNaming(`${implementationTypes.at(0)!}-implementation`).ClassName}`
            )})

                `.trim()
        );

        await wireNewModuleDependencies(boundedContextFolder, wireFile);

        // After wiring: the spec builds the implementation through its factory.
        if (withIntegrationSpec)
            scaffoldIntegrationSpec(
                {
                    kind: 'port',
                    name: naming.fileName,
                    ownerPath: boundedContextFolder.path
                },
                new UnknownFormatNaming(implementationType).fileName
            );
    }
};
