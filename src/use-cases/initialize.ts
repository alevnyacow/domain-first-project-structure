import { checkbox, confirm, input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { Folder } from '../file-system';
import { scaffoldInMemoryDb } from '../in-memory-db';
import {
    askNextAdapter,
    missingDomainFirstPackages,
    scaffoldRestEndpointGeneratorFiles
} from '../integrations';
import { ProjectRoot } from '../project-root';

/**
 * Initializes the project and returns the steps left to the user.
 */
export const initializeUseCase = async (): Promise<string[]> => {
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

    const withNextAdapter =
        domainFirstPackages.includes('@domain-first/handlers-rest') &&
        (await askNextAdapter());

    const defaultPersistenceLayerImplementation = await input({
        message: 'Default persistence layer implementation:'
    });

    const withInMemoryDb = await confirm({
        message: 'Scaffold in-memory DB for test implementations'
    });

    const useReact = await confirm({ message: 'Use React' });

    let storybookFramework: string | undefined;

    const withStorybook = useReact
        ? await confirm({ message: 'Use Storybook' })
        : false;
    if (withStorybook) {
        storybookFramework = await input({
            message: 'Storybook framework package:',
            default: '@storybook/react-vite'
        });
    }

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
        withInMemoryDb,
        useReact,
        storybookFramework,
        testingLibrary
    });

    const { path } = new ProjectRoot();

    const rootFolder = new Folder(path);

    if (domainFirstPackages.includes('@domain-first/wire')) {
        rootFolder
            .subitem([rootFolderName, 'shared-kernel', 'wiring'])
            .createFile(
                'env-branched-wire.ts',
                `
import { branchedWire } from '@domain-first/wire'

export const envBranchedWire = branchedWire(() => {
    return process.env.NODE_ENV ?? 'development' as 'test' | 'development' | 'production'
});
`.trim()
            );
    }

    if (withInMemoryDb) {
        scaffoldInMemoryDb(
            rootFolder.subitem([rootFolderName, 'shared-kernel'])
        );
    }

    const nextSteps = missingDomainFirstPackages();

    if (domainFirstPackages.includes('@domain-first/handlers-rest')) {
        nextSteps.push(
            ...scaffoldRestEndpointGeneratorFiles({ withNextAdapter })
        );
    }

    return nextSteps;
};
