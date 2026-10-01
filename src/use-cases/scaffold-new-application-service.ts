import { confirm, input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldNewApplicationService = async (
    boundedContextFolder: Folder
) => {
    const name = await input({ message: 'Name: ' });
    const naming = new UnknownFormatNaming(name);

    let scaffoldUnitTests: boolean | undefined;

    if (ConfigFile.Instance.data.testingLibrary) {
        scaffoldUnitTests = await confirm({ message: 'Scaffold unit-tests' });
    }

    const withWiring =
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        );

    const wiringFolder = boundedContextFolder.subitem([
        'wiring',
        'application-services'
    ]);

    const applicationServicesFolder = boundedContextFolder.subitem([
        'application',
        'services'
    ]);
    applicationServicesFolder.createFile(
        `${naming.fileName}-application-service.ts`,
        `
export class ${naming.ClassName}ApplicationService {

}
            `.trim()
    );

    if (scaffoldUnitTests) {
        applicationServicesFolder.createFile(
            `${naming.fileName}-application-service.spec.ts`,
            `
import { describe, test, expect, beforeEach } from '${ConfigFile.Instance.data.testingLibrary}'
${
    withWiring
        ? `import { type ${naming.ClassName}ApplicationService } from './${naming.fileName}-application-service'
import { wire${naming.ClassName}ApplicationService } from '../../wiring/application-services/wire-${naming.fileName}-application-service'`
        : `import { ${naming.ClassName}ApplicationService } from './${naming.fileName}-application-service'`
}

let ${naming.variableName}ApplicationService: ${naming.ClassName}ApplicationService

beforeEach(() => {
    ${naming.variableName}ApplicationService = ${withWiring ? `wire${naming.ClassName}ApplicationService()` : `new ${naming.ClassName}ApplicationService()`}
})

describe('${naming.withSpaces}', () => {
    test('can be ${withWiring ? 'wired' : 'created'}', () => {
        expect(${naming.variableName}ApplicationService).toBeDefined()
    })
})
    `.trim()
        );
    }

    if (withWiring) {
        wiringFolder.createFile(
            `wire-${naming.fileName}-application-service.ts`,
            `
import { wireClass } from '@domain-first/wire'
import { ${naming.ClassName}ApplicationService } from '../../application/services/${naming.fileName}-application-service'

export const wire${naming.ClassName}ApplicationService = wireClass(
    ${naming.ClassName}ApplicationService,
    []
)
            `.trim()
        );
    }
};
