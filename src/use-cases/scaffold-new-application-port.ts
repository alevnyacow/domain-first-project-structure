import { confirm, input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldNewApplicationPort = async (
    boundedContextFolder: Folder
) => {
    const name = await input({ message: 'Name: ' });
    const naming = new UnknownFormatNaming(name);

    const scaffoldUnitTests = Boolean(ConfigFile.Instance.data.testingLibrary);

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

    const implementationType = await input({
        message: 'Adapter implementation type:',
        default: 'api'
    });

    const addTestImplementation = await confirm({
        message: 'With test implementation'
    });
    let testImplementationType = '';
    if (addTestImplementation) {
        testImplementationType = await input({
            message: 'Test adapter implementation type:',
            default: 'mock'
        });
    }

    const infrastructureFolder = boundedContextFolder.subitem([
        'infrastructure',
        'application-adapters'
    ]);

    const implementationTypes = [
        implementationType,
        testImplementationType
    ].filter((x) => !!x);

    for (const implementation of implementationTypes) {
        const currentNaming = new UnknownFormatNaming(
            `${implementation}-${naming.fileName}`
        );
        infrastructureFolder.subitem([implementation]).createFile(
            `${currentNaming.fileName}.ts`,
            `
import { ${naming.ClassName} } from '../../../application/ports/${naming.fileName}'

export class ${currentNaming.ClassName} extends ${naming.ClassName} {

}
            `
        );
    }

    if (scaffoldUnitTests) {
        const implementationNaming = new UnknownFormatNaming(
            implementationType
        );
        applicationPortsFolder.createFile(
            `${naming.fileName}.spec.ts`,
            `
import { describe, test, expect, beforeEach } from '${ConfigFile.Instance.data.testingLibrary}'
${
    ConfigFile.Instance.data.domainFirstPackages.includes('@domain-first/wire')
        ? `import { type ${naming.ClassName} } from './${naming.fileName}'
import { wire${naming.ClassName} } from '../../wiring/application-ports/wire-${naming.fileName}'`
        : `import { ${implementationNaming.ClassName}${naming.ClassName} } from '../../infrastructure/application-adapters/${implementationNaming.fileName}/${implementationNaming.fileName}-${naming.fileName}'

type ${naming.ClassName} = ${implementationNaming.ClassName}${naming.ClassName}`
}

let ${naming.variableName}: ${naming.ClassName}

beforeEach(() => {
    ${naming.variableName} = ${ConfigFile.Instance.data.domainFirstPackages.includes('@domain-first/wire') ? `wire${naming.ClassName}()` : `new ${implementationNaming.ClassName}${naming.ClassName}()`}
})

describe('${naming.withSpaces}', () => {
    test('can be ${ConfigFile.Instance.data.domainFirstPackages.includes('@domain-first/wire') ? 'wired' : 'created via constructor'}', () => {
        expect(${naming.variableName}).toBeDefined()
    })
})
            `.trim()
        );
    }

    if (
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        )
    ) {
        wiringFolder.createFile(
            `wire-${naming.fileName}.ts`,
            `
import { wireClass } from '@domain-first/wire'
import { envBranchedWire } from '../../../${boundedContextFolder.name === 'shared' ? '' : '../'}shared/wiring/env-branched-wire'
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
    }
};
