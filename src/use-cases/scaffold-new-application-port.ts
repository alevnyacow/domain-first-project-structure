import { ConfigFile } from '../config-file';
import { hasNeighboringBoundedContext } from '../context-dependencies';
import type { Folder } from '../file-system';
import { createImplementation } from '../implementations';
import { confirm, input } from '../interaction';
import { UnknownFormatNaming } from '../unknown-format-naming';
import { promptImplementationType } from './prompt-implementation-type';
import { wireNewModuleDependencies } from './wire-dependency';

export const scaffoldNewApplicationPort = async (
    boundedContextFolder: Folder
) => {
    const name = await input({ key: 'name', message: 'Name: ' });
    const naming = new UnknownFormatNaming(name);

    const scaffoldUnitTests = Boolean(ConfigFile.backend.testingLibrary);

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
    const { label: implementationType } = await promptImplementationType(
        'Adapter implementation type:',
        'ports',
        {
            crossContext
        }
    );

    const addTestImplementation = await confirm({
        key: 'withTestImplementation',
        message: 'With test implementation'
    });
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

    if (scaffoldUnitTests) {
        const implementationNaming = new UnknownFormatNaming(
            implementationType
        );
        applicationPortsFolder.createFile(
            `${naming.fileName}.spec.ts`,
            `
import { describe, test, expect, beforeEach } from '${ConfigFile.backend.testingLibrary}'
${
    ConfigFile.backend.domainFirstPackages.includes('@domain-first/wire')
        ? `import { type ${naming.ClassName} } from './${naming.fileName}'
import { wire${naming.ClassName} } from '../../wiring/application-ports/wire-${naming.fileName}'`
        : `import { ${implementationNaming.ClassName}${naming.ClassName} } from '../../infrastructure/application-adapters/${implementationNaming.fileName}/${implementationNaming.fileName}-${naming.fileName}'

type ${naming.ClassName} = ${implementationNaming.ClassName}${naming.ClassName}`
}

let ${naming.variableName}: ${naming.ClassName}

beforeEach(() => {
    ${naming.variableName} = ${ConfigFile.backend.domainFirstPackages.includes('@domain-first/wire') ? `wire${naming.ClassName}()` : `new ${implementationNaming.ClassName}${naming.ClassName}()`}
})

describe('${naming.withSpaces}', () => {
    test('can be ${ConfigFile.backend.domainFirstPackages.includes('@domain-first/wire') ? 'wired' : 'created via constructor'}', () => {
        expect(${naming.variableName}).toBeDefined()
    })
})
            `.trim()
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

export const wire${naming.ClassName} = envBranchedWire({
    test: wire${new UnknownFormatNaming(`${implementationTypes.at(-1)!}-implementation`).ClassName},
    development: wire${new UnknownFormatNaming(`${implementationTypes.at(0)!}-implementation`).ClassName},
    production: wire${new UnknownFormatNaming(`${implementationTypes.at(0)!}-implementation`).ClassName}
})

                `.trim()
        );

        await wireNewModuleDependencies(boundedContextFolder, wireFile);
    }
};
