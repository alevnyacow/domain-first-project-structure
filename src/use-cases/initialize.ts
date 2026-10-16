import nodePath from 'node:path';
import { checkbox, confirm, input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { File, Folder } from '../file-system';
import { ProjectRoot } from '../project-root';
import { scaffoldRestEndpointGenerator } from './rest-endpoint-generator';

/**
 * Whether the project's manifest lists `name` among its dependencies.
 */
const hasDependency = (root: string, name: string) => {
    const manifestFile = new File(nodePath.join(root, 'package.json'));
    if (!manifestFile.exists) return false;
    const manifest = JSON.parse(manifestFile.data);
    return [
        manifest.dependencies,
        manifest.devDependencies,
        manifest.optionalDependencies
    ].some((dependencies) => dependencies && Object.hasOwn(dependencies, name));
};

/**
 * Initializes the project and returns the steps left to the user.
 */
export const initializeUseCase = async (): Promise<string[]> => {
    const nextSteps: string[] = [];

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
        hasDependency(new ProjectRoot().path, 'next') &&
        (await confirm({ message: 'Use Next adapter for REST endpoints' }));

    const defaultPersistenceLayerImplementation = await input({
        message: 'Default persistence layer implementation:'
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
        useReact,
        storybookFramework,
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
`.trim()
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

    if (domainFirstPackages.includes('@domain-first/handlers-rest')) {
        scaffoldRestEndpointGenerator(
            rootFolder.subitem([rootFolderName, 'shared']),
            { withNextAdapter }
        );

        if (
            withNextAdapter &&
            !hasDependency(path, '@domain-first/handlers-next')
        ) {
            nextSteps.push('npm i @domain-first/handlers-next');
        }
    }

    return nextSteps;
};
