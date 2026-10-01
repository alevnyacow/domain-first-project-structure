import { confirm, input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldNewPresentationService = async (
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
        'presentation-services'
    ]);

    const presentationServicesFolder = boundedContextFolder.subitem([
        'presentation',
        'services'
    ]);
    presentationServicesFolder.createFile(
        `${naming.fileName}-presentation-service.ts`,
        `
export class ${naming.ClassName}PresentationService {

}
            `.trim()
    );

    if (scaffoldUnitTests) {
        presentationServicesFolder.createFile(
            `${naming.fileName}-presentation-service.spec.ts`,
            `
import { describe, test, expect, beforeEach } from '${ConfigFile.Instance.data.testingLibrary}'
${
    withWiring
        ? `import { type ${naming.ClassName}PresentationService } from './${naming.fileName}-presentation-service'
import { wire${naming.ClassName}PresentationService } from '../../wiring/presentation-services/wire-${naming.fileName}-presentation-service'`
        : `import { ${naming.ClassName}PresentationService } from './${naming.fileName}-presentation-service'`
}

let ${naming.variableName}PresentationService: ${naming.ClassName}PresentationService

beforeEach(() => {
    ${naming.variableName}PresentationService = ${withWiring ? `wire${naming.ClassName}PresentationService()` : `new ${naming.ClassName}PresentationService()`}
})

describe('${naming.withSpaces}', () => {
    test('can be ${withWiring ? 'wired' : 'created'}', () => {
        expect(${naming.variableName}PresentationService).toBeDefined()
    })
})
    `.trim()
        );
    }

    if (withWiring) {
        wiringFolder.createFile(
            `wire-${naming.fileName}-presentation-service.ts`,
            `
import { wireClass } from '@domain-first/wire'
import { ${naming.ClassName}PresentationService } from '../../presentation/services/${naming.fileName}-presentation-service'

export const wire${naming.ClassName}PresentationService = wireClass(
    ${naming.ClassName}PresentationService,
    []
)
            `.trim()
        );
    }
};
