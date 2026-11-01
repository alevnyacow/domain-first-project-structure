import { checkbox, confirm, input, select } from '@inquirer/prompts';
import {
    type BackendConfig,
    ConfigFile,
    type ProjectConfig,
    domainFirstPackages as packageChoices,
    scaffoldBackendRules
} from '../config-file';
import { Folder, withoutOverwrites } from '../file-system';
import { scaffoldInMemoryDb } from '../in-memory-db';
import {
    addStorybook,
    askNextAdapter,
    hasDependency,
    missingDomainFirstPackages,
    missingPackages,
    scaffoldRestEndpointGeneratorFiles,
    storybookFrameworkPackage
} from '../integrations';
import { ProjectRoot } from '../project-root';

export const configurationSections = [
    'project',
    'backend',
    'frontend'
] as const;
export type ConfigurationSection = (typeof configurationSections)[number];

const configureProject = async (config: ProjectConfig) => {
    const rootFolder = await input({
        message: 'Root folder (use "/" for inner folders):',
        default: config.project.rootFolder,
        validate: (value) => (value.trim() ? true : 'Root folder is required')
    });
    ConfigFile.update({
        project: { ...config.project, rootFolder: rootFolder.trim() }
    });
};

const configureBackend = async (config: ProjectConfig): Promise<void> => {
    const current = config.backend;
    const domainFirstPackages = await checkbox<
        BackendConfig['domainFirstPackages'][number]
    >({
        message: '@domain-first packages',
        choices: packageChoices.map((value) => ({
            name: value,
            value,
            checked: current?.domainFirstPackages.includes(value) ?? false
        }))
    });
    const withInMemoryDb = await confirm({
        message: 'Scaffold in-memory DB for test implementations',
        default: current ? Boolean(current.withInMemoryDb) : true
    });
    const withTests = await confirm({
        message: 'Scaffold unit tests',
        default: current ? Boolean(current.testingLibrary) : true
    });
    const testingLibrary = withTests
        ? await input({
              message: 'Unit testing library:',
              default: current?.testingLibrary ?? 'vitest'
          })
        : undefined;
    ConfigFile.update({
        backend: {
            ...current,
            domainFirstPackages,
            withInMemoryDb,
            testingLibrary,
            rules: scaffoldBackendRules(current?.rules)
        }
    });

    const rootFolder = new Folder(new ProjectRoot().path);
    const rootFolderName = config.project.rootFolder;
    // Reconfiguration adds missing support files without replacing user code.
    withoutOverwrites(() => {
        if (domainFirstPackages.includes('@domain-first/wire')) {
            rootFolder
                .subitem([rootFolderName, 'shared-kernel', 'wiring'])
                .createFile(
                    'env-branched-wire.ts',
                    `import { branchedWire } from '@domain-first/wire'

export const envBranchedWire = branchedWire(() => {
    return process.env.NODE_ENV ?? 'development' as 'test' | 'development' | 'production'
});`
                );
        }
        if (withInMemoryDb)
            scaffoldInMemoryDb(
                rootFolder.subitem([rootFolderName, 'shared-kernel'])
            );
    });
};

const configureFrontend = async (config: ProjectConfig) => {
    // Next.js shares React generators and story settings.
    const currentFramework =
        config.frontend?.react?.framework ??
        (hasDependency('next') ? 'next' : 'react');
    const framework = await select<'react' | 'next'>({
        message: 'Frontend framework:',
        choices: [
            { name: 'React', value: 'react' },
            { name: 'Next.js', value: 'next' }
        ],
        default: currentFramework
    });
    const withNextAdapter =
        framework === 'next' && config.backend
            ? await askNextAdapter({ nextSelected: true })
            : false;
    const withStorybook = await confirm({
        message: 'Use Storybook',
        default: config.frontend?.react
            ? Boolean(config.frontend.react.storybookFramework)
            : true
    });
    const storybookFramework = withStorybook
        ? storybookFrameworkPackage
        : undefined;
    ConfigFile.update({
        frontend: {
            ...config.frontend,
            react: { ...config.frontend?.react, framework, storybookFramework }
        }
    });
    return {
        withNextAdapter,
        nextSteps: [
            ...missingPackages(
                framework === 'next'
                    ? ['next', 'react', 'react-dom']
                    : ['react', 'react-dom']
            ),
            ...(withStorybook ? await addStorybook() : [])
        ]
    };
};

/** Finish REST setup once, after the frontend choice is known. */
const configureRest = async (withNextAdapter?: boolean): Promise<string[]> => {
    const backend = ConfigFile.Instance.data.backend;
    if (!backend) return [];
    const withRest = backend.domainFirstPackages.includes(
        '@domain-first/handlers-rest'
    );
    const nextSelected =
        ConfigFile.Instance.data.frontend?.react?.framework === 'next';
    if (withNextAdapter === undefined && (withRest || nextSelected)) {
        withNextAdapter = await askNextAdapter();
    }
    if (!withRest && !withNextAdapter) return [];
    if (withNextAdapter && !withRest) {
        ConfigFile.update({
            backend: {
                ...backend,
                domainFirstPackages: [
                    ...backend.domainFirstPackages,
                    '@domain-first/handlers-rest'
                ]
            }
        });
    }
    return scaffoldRestEndpointGeneratorFiles({
        withNextAdapter: withNextAdapter ?? false
    });
};

/** New projects walk all sections; existing projects can resume any section. */
export const initializeUseCase = async (
    section?: ConfigurationSection
): Promise<string[]> => {
    const existing = ConfigFile.exists;
    if (!existing) ConfigFile.write({ project: { rootFolder: 'src' } });
    let sections: readonly ConfigurationSection[] = configurationSections;
    if (section)
        sections =
            section === 'project' || existing
                ? [section]
                : ['project', section];
    else if (existing) {
        const selected = await select<ConfigurationSection | 'all'>({
            message: 'Configuration section:',
            choices: [
                ...configurationSections.map((value) => ({
                    name: `${value[0].toUpperCase()}${value.slice(1)}${ConfigFile.Instance.data[value] ? '' : ' (not configured)'}`,
                    value
                })),
                { name: 'All sections', value: 'all' }
            ]
        });
        sections = selected === 'all' ? configurationSections : [selected];
    }
    const nextSteps: string[] = [];
    let backendConfigured = false;
    let withNextAdapter: boolean | undefined;
    for (const currentSection of sections) {
        console.log(
            `\n${currentSection[0].toUpperCase()}${currentSection.slice(1)} configuration`
        );
        if (
            !section &&
            sections.length > 1 &&
            !(await confirm({
                message: `Configure ${currentSection} now?`,
                default: true
            }))
        ) {
            if (currentSection === 'project')
                console.log(
                    `Keeping project root folder: ${ConfigFile.Instance.data.project.rootFolder}.`
                );
            nextSteps.push(
                `configure ${currentSection} later with df-init --section ${currentSection}`
            );
            continue;
        }
        const config = ConfigFile.Instance.data;
        switch (currentSection) {
            case 'project':
                await configureProject(config);
                break;
            case 'backend':
                await configureBackend(config);
                backendConfigured = true;
                break;
            case 'frontend': {
                const frontend = await configureFrontend(config);
                withNextAdapter = frontend.withNextAdapter;
                nextSteps.push(...frontend.nextSteps);
                break;
            }
        }
    }
    if (backendConfigured || withNextAdapter) {
        const restSteps = await configureRest(withNextAdapter);
        nextSteps.push(...missingDomainFirstPackages(), ...restSteps);
    }
    return nextSteps;
};
