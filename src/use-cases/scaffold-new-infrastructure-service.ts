import { input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldNewInfrastructureService = async (
    boundedContextFolder: Folder
) => {
    const name = await input({ message: 'Name: ' });
    const naming = new UnknownFormatNaming(name);

    const scaffoldUnitTests = Boolean(ConfigFile.Instance.data.testingLibrary);

    const withWiring =
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        );

    const wiringFolder = boundedContextFolder.subitem([
        'wiring',
        'infrastructure-services'
    ]);

    const infrastructureServicesFolder = boundedContextFolder.subitem([
        'infrastructure',
        'services'
    ]);
    infrastructureServicesFolder.createFile(
        `${naming.fileName}-infrastructure-service.ts`,
        `
export class ${naming.ClassName}InfrastructureService {

}
            `.trim()
    );

    if (scaffoldUnitTests) {
        infrastructureServicesFolder.createFile(
            `${naming.fileName}-infrastructure-service.spec.ts`,
            `
import { describe, test, expect, beforeEach } from '${ConfigFile.Instance.data.testingLibrary}'
${
    withWiring
        ? `import { type ${naming.ClassName}InfrastructureService } from './${naming.fileName}-infrastructure-service'
import { wire${naming.ClassName}InfrastructureService } from '../../wiring/infrastructure-services/wire-${naming.fileName}-infrastructure-service'`
        : `import { ${naming.ClassName}InfrastructureService } from './${naming.fileName}-infrastructure-service'`
}

let ${naming.variableName}InfrastructureService: ${naming.ClassName}InfrastructureService

beforeEach(() => {
    ${naming.variableName}InfrastructureService = ${withWiring ? `wire${naming.ClassName}InfrastructureService()` : `new ${naming.ClassName}InfrastructureService()`}
})

describe('${naming.withSpaces}', () => {
    test('can be ${withWiring ? 'wired' : 'created'}', () => {
        expect(${naming.variableName}InfrastructureService).toBeDefined()
    })
})
    `.trim()
        );
    }

    if (withWiring) {
        wiringFolder.createFile(
            `wire-${naming.fileName}-infrastructure-service.ts`,
            `
import { wireClass } from '@domain-first/wire'
import { ${naming.ClassName}InfrastructureService } from '../../infrastructure/services/${naming.fileName}-infrastructure-service'

export const wire${naming.ClassName}InfrastructureService = wireClass(
    ${naming.ClassName}InfrastructureService,
    []
)
            `.trim()
        );
    }
};
