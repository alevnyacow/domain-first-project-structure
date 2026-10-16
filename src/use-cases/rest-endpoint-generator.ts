import path from 'node:path';
import { File, type Folder } from '../file-system';
import { createPresentationService } from './scaffold-new-presentation-service';

const name = 'rest-endpoint-generator';

/**
 * The one endpoint generator of the project: a Shared Layer presentation
 * service, scaffolded like any other. Every generating method is a getter
 * typed as `EndpointGenerator`.
 */
export const scaffoldRestEndpointGenerator = (sharedFolder: Folder) =>
    createPresentationService(sharedFolder, name, (className) =>
        `
import {
    type Adapter,
    type EndpointGenerator,
    type ErrorStatuses,
    createEndpoint,
    InputMappingError,
    RequestParsingError
} from '@domain-first/handlers-rest'

export class ${className} {
    get withoutGuards(): EndpointGenerator {
        return createEndpoint({
            errorStatuses: {
                400: {
                    checks: this.invalidRequestChecks,
                    description: 'Invalid request'
                }
            }
        })(this.adapter) as EndpointGenerator
    }

    /**
     * Default checks of an invalid request, to spread into a generator's
     * own checks.
     */
    private get invalidRequestChecks(): ErrorStatuses[number]['checks'] {
        return [RequestParsingError.is, InputMappingError.is]
    }

    /**
     * The adapter of your HTTP framework.
     */
    private get adapter(): Adapter<any[], any> {
        throw new Error('REST adapter is not set')
    }
}
`.trim()
    );

/**
 * The generator's type and factory, or undefined in projects initialized
 * without it.
 */
export const findRestEndpointGenerator = (sharedFolder: Folder) => {
    const typeFile = path.join(
        sharedFolder.path,
        'presentation',
        'services',
        `${name}-presentation-service.ts`
    );

    if (!new File(typeFile).exists) {
        return undefined;
    }

    return {
        typeName: 'RestEndpointGeneratorPresentationService',
        typeFile,
        wireName: 'wireRestEndpointGeneratorPresentationService',
        wireFile: path.join(
            sharedFolder.path,
            'wiring',
            'presentation-services',
            `wire-${name}-presentation-service.ts`
        )
    };
};
