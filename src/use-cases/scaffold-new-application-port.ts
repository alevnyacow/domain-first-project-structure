import { confirm, input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldNewApplicationPort = async (
    boundedContextFolder: Folder
) => {
    const name = await input({ message: 'Name: ' });
    const naming = new UnknownFormatNaming(name);

    const wiringFolder = boundedContextFolder.subitem(['wiring', 'ports']);

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
        message: 'Adapter implementation type:'
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
