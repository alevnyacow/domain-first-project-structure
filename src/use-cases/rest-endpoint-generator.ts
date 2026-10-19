import path from 'node:path';
import { File, type Folder } from '../file-system';
import { createPresentationService } from './scaffold-new-presentation-service';

const name = 'rest-endpoint-generator';

/**
 * The one endpoint generator of the project: a Shared Layer presentation
 * service, scaffolded like any other. Every generating method is a getter
 * typed as `EndpointGenerator`. With `withNextAdapter`, the adapter is
 * `nextAdapter` of `@domain-first/handlers-next` instead of a placeholder.
 */
export const scaffoldRestEndpointGenerator = (
    sharedFolder: Folder,
    { withNextAdapter = false }: { withNextAdapter?: boolean } = {}
) =>
    createPresentationService(sharedFolder, name, (className) => {
        const adapter = withNextAdapter ? 'nextAdapter' : 'adapter';
        return `
import {
${withNextAdapter ? '' : '    type Adapter,\n'}    type EndpointGenerator,
    createEndpoint,
    invalidRequest
} from '@domain-first/handlers-rest'
${
    withNextAdapter
        ? `import { nextAdapter } from '@domain-first/handlers-next'`
        : `
/**
 * The adapter of your HTTP framework.
 */
const adapter = undefined as unknown as Adapter<any[], any>`
}

export class ${className} {
    get withoutGuards(): EndpointGenerator {
        return createEndpoint({
            errors: [invalidRequest()]
        })(${adapter}) as EndpointGenerator
    }
}
`.trim();
    });

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
