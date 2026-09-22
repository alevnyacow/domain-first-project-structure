import { checkbox, confirm, input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { Folder } from '../file-system';
import { ProjectRoot } from '../project-root';

export const initializeUseCase = async () => {
    const rootFolderName = await input({
        message: 'Root folder (use "/" for inner folders):',
        default: 'src'
    });

    const domainFirstPackages = await checkbox({
        message: '@domain-first packages',
        choices: [
            '@domain-first/types',
            '@domain-first/errors',
            '@domain-first/handlers',
            '@domain-first/wire',
            '@domain-first/handlers-rest'
        ]
    });

    const defaultPersistenceLayerImplementation = await input({
        message: 'Default persistence layer implementation:'
    });

    const useReact = await confirm({ message: 'Use React' });

    let testingLibrary: string | undefined;

    const withTests = await confirm({ message: 'Scaffold unit tests' });
    if (withTests) {
        testingLibrary = await input({
            message: 'Unit testing library:',
            default: 'vitest'
        });
    }

    ConfigFile.write({
        rootFolder: rootFolderName,
        domainFirstPackages,
        defaultPersistenceLayerImplementation,
        useReact,
        testingLibrary
    });

    const { path } = new ProjectRoot();

    const rootFolder = new Folder(path);

    if (domainFirstPackages.includes('@domain-first/wire')) {
        rootFolder.subitem([rootFolderName, 'shared', 'wiring']).createFile(
            'env-branched-wire.ts',
            `
import { branchedWire } from '@domain-first/wire'

export const envBranchedWire = branchedWire(() => {
    return process.env.NODE_ENV ?? 'development' as 'test' | 'development' | 'production'
});
`
        );
    }

    if (domainFirstPackages.includes('@domain-first/errors')) {
        rootFolder
            .subitem([rootFolderName, 'shared'])
            .subitem(['domain', 'errors'])
            .createFile(
                'index.ts',
                `
import { errorNamespace } from '@domain-first/errors'

export const SharedErrors = errorNamespace('shared')
            `.trim()
            );
    }
};
