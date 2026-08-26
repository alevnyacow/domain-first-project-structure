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

    /**
     * Content.
     */
    boundedContextFolder.subitem(['domain', 'services']).createFile(
        `${naming.fileName}-service.ts`,
        `
export class ${naming.ClassName}Service {

}
        `.trim()
    );

    /**
     * Wiring.
     */
    if (
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/wire'
        )
    ) {
        boundedContextFolder
            .subitem(['wiring', 'domain', 'services'])
            .createFile(
                `wire-${naming.fileName}-service.ts`,
                `
import { wireClass } from '@domain-first/wire'
import { ${naming.ClassName}Service } from '../../../domain/services/${naming.fileName}-service'

export const wire${naming.ClassName}Service = wireClass(
    ${naming.ClassName}Service,
    []
)
            `.trim()
            );
    }
};
