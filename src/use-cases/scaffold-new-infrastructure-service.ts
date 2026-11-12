import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import {
    scaffoldIntegrationSpec,
    wantsServiceIntegrationSpec
} from '../integration-tests';
import { input } from '../interaction';
import { UnknownFormatNaming } from '../unknown-format-naming';
import { wireNewModuleDependencies } from './wire-dependency';

export const scaffoldNewInfrastructureService = async (
    boundedContextFolder: Folder
) => {
    const name = await input({ key: 'name', message: 'Name: ' });
    const naming = new UnknownFormatNaming(name);
    const withIntegrationSpec = await wantsServiceIntegrationSpec();

    const withWiring =
        ConfigFile.backend.domainFirstPackages.includes('@domain-first/wire');

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

    if (withWiring) {
        const wireFile = wiringFolder.createFile(
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

        await wireNewModuleDependencies(boundedContextFolder, wireFile);

        if (withIntegrationSpec)
            scaffoldIntegrationSpec({
                kind: 'infrastructure-service',
                name: naming.fileName,
                ownerPath: boundedContextFolder.path
            });
    }
};
