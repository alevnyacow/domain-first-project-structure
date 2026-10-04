import { input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldNewDomainService = async (
    boundedContextFolder: Folder
) => {
    const portName = await input({
        message: 'Name:'
    });
    const naming = new UnknownFormatNaming(portName);

    const scaffoldUnitTests = Boolean(ConfigFile.Instance.data.testingLibrary);

    const withWiring =
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        );

    const domainServicesFolder = boundedContextFolder.subitem([
        'domain',
        'services'
    ]);

    /**
     * Content.
     */
    domainServicesFolder.createFile(
        `${naming.fileName}-domain-service.ts`,
        `
export class ${naming.ClassName}DomainService {

}
        `.trim()
    );

    if (scaffoldUnitTests) {
        domainServicesFolder.createFile(
            `${naming.fileName}-domain-service.spec.ts`,
            `
import { describe, test, expect, beforeEach } from '${ConfigFile.Instance.data.testingLibrary}'
${
    withWiring
        ? `import { type ${naming.ClassName}DomainService } from './${naming.fileName}-domain-service'
import { wire${naming.ClassName}DomainService } from '../../wiring/domain-services/wire-${naming.fileName}-domain-service'`
        : `import { ${naming.ClassName}DomainService } from './${naming.fileName}-domain-service'`
}

let ${naming.variableName}DomainService: ${naming.ClassName}DomainService

beforeEach(() => {
    ${naming.variableName}DomainService = ${withWiring ? `wire${naming.ClassName}DomainService()` : `new ${naming.ClassName}DomainService()`}
})

describe('${naming.withSpaces}', () => {
    test('can be ${withWiring ? 'wired' : 'created'}', () => {
        expect(${naming.variableName}DomainService).toBeDefined()
    })
})
    `.trim()
        );
    }

    /**
     * Wiring.
     */
    if (withWiring) {
        boundedContextFolder.subitem(['wiring', 'domain-services']).createFile(
            `wire-${naming.fileName}-domain-service.ts`,
            `
import { wireClass } from '@domain-first/wire'
import { ${naming.ClassName}DomainService } from '../../domain/services/${naming.fileName}-domain-service'

export const wire${naming.ClassName}DomainService = wireClass(
    ${naming.ClassName}DomainService,
    []
)
            `.trim()
        );
    }
};
