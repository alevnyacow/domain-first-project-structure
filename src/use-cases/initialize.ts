import path from 'node:path';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import {
    type BackendConfig,
    branchNameSchema,
    ConfigFile,
    type ProjectConfig,
    domainFirstPackages as packageChoices,
    scaffoldBackendRules
} from '../config-file';
import { File, Folder, withoutOverwrites } from '../file-system';
import { scaffoldInMemoryDb } from '../in-memory-db';
import {
    addStorybook,
    askRestAdapter,
    hasDependency,
    missingDomainFirstPackages,
    missingPackages,
    scaffoldRestEndpointGeneratorFiles,
    storybookPackageFor
} from '../integrations';
import { ProjectRoot } from '../project-root';
import type { RestAdapter } from '../rest-adapters';
import { defaultEnvBranches, envBranchedWireSource } from '../wire-branches';

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

const createTestBranch = Symbol('create-test-branch');
const noTestBranch = Symbol('no-test-branch');

/**
 * With `wire`: the default `NODE_ENV` branches (nothing saved) or custom
 * ones, one of them for tests.
 */
const promptEnvBranches = async (
    current: BackendConfig['envBranches']
): Promise<BackendConfig['envBranches']> => {
    const kind = await select<'default' | 'custom'>({
        message: 'envBranchedWire branches:',
        choices: [
            {
                name: 'Default: test, development, production by NODE_ENV',
                value: 'default'
            },
            { name: 'Custom branches', value: 'custom' }
        ],
        default: current ? 'custom' : 'default'
    });
    if (kind === 'default') return undefined;
    const parse = (value: string) =>
        value
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean);
    const names = parse(
        await input({
            message: 'Branches (comma-separated):',
            default: current?.names.join(', '),
            validate: (value) => {
                const names = parse(value);
                if (!names.length) return 'Enter at least one branch.';
                if (names.length === 1 && names[0] === 'test')
                    return 'Add a branch for primary implementations besides test.';
                const invalid = names.find(
                    (name) => !branchNameSchema.safeParse(name).success
                );
                if (invalid)
                    return `${invalid}: use lowercase letters and digits, e.g. staging.`;
                return new Set(names).size === names.length
                    ? true
                    : 'Branch names must be unique.';
            }
        })
    );
    const test = await select<
        string | typeof createTestBranch | typeof noTestBranch
    >({
        message: 'Test branch:',
        choices: [
            ...names.map((name) => ({
                name,
                value: name,
                // Primary implementations need a branch of their own.
                disabled: names.length === 1 ? '(the only branch)' : false
            })),
            ...(names.includes('test')
                ? []
                : [
                      {
                          name: 'Create a "test" branch',
                          value: createTestBranch as typeof createTestBranch
                      }
                  ]),
            {
                name: 'No test branch: every branch uses the primary implementation',
                value: noTestBranch as typeof noTestBranch
            }
        ],
        default:
            current && !current.test
                ? noTestBranch
                : current?.test && names.includes(current.test)
                  ? current.test
                  : names.includes('test')
                    ? 'test'
                    : createTestBranch
    });
    if (test === noTestBranch) return { names };
    return test === createTestBranch
        ? { names: [...names, 'test'], test: 'test' }
        : { names, test };
};

const configureBackend = async (config: ProjectConfig): Promise<string[]> => {
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
    const envBranches = domainFirstPackages.includes('@domain-first/wire')
        ? await promptEnvBranches(current?.envBranches)
        : current?.envBranches;
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
            envBranches,
            withInMemoryDb,
            testingLibrary,
            rules: scaffoldBackendRules(current?.rules)
        }
    });

    const rootFolder = new Folder(new ProjectRoot().path);
    const rootFolderName = config.project.rootFolder;
    const wiringFolder = rootFolder.subitem([
        rootFolderName,
        'shared-kernel',
        'wiring'
    ]);
    const notes: string[] = [];
    const envBranchedWireExisted = new File(
        path.join(wiringFolder.path, 'env-branched-wire.ts')
    ).exists;
    if (
        domainFirstPackages.includes('@domain-first/wire') &&
        envBranchedWireExisted &&
        JSON.stringify(envBranches ?? null) !==
            JSON.stringify(current?.envBranches ?? null)
    ) {
        const { names } = envBranches ?? defaultEnvBranches;
        notes.push(
            `${rootFolderName}/shared-kernel/wiring/env-branched-wire.ts and existing envBranchedWire calls keep their branches: change them to ${names.join(', ')} yourself`
        );
    }
    // Reconfiguration adds missing support files without replacing user code.
    withoutOverwrites(() => {
        if (domainFirstPackages.includes('@domain-first/wire')) {
            wiringFolder.createFile(
                'env-branched-wire.ts',
                envBranchedWireSource()
            );
        }
        if (withInMemoryDb)
            scaffoldInMemoryDb(
                rootFolder.subitem([rootFolderName, 'shared-kernel'])
            );
    });
    if (envBranches && !envBranchedWireExisted)
        notes.push(
            `${rootFolderName}/shared-kernel/wiring/env-branched-wire.ts doesn't compile until you write currentBranch: return the branch this process runs in (${envBranches.names.join(', ')})`
        );
    return notes;
};

type FrontendChoice = 'react' | 'next' | 'svelte' | 'sveltekit';

/** Packages of each frontend choice, printed when missing. */
const frontendPackages: Record<FrontendChoice, string[]> = {
    react: ['react', 'react-dom'],
    next: ['next', 'react', 'react-dom'],
    svelte: ['svelte'],
    sveltekit: ['@sveltejs/kit', 'svelte']
};

const savedFrontendChoice = ({ frontend }: ProjectConfig) =>
    frontend?.react?.framework ??
    frontend?.svelte?.framework ??
    (frontend?.react ? 'react' : frontend?.svelte ? 'svelte' : undefined);

const configureFrontend = async (config: ProjectConfig) => {
    // Next.js shares React generators and story settings, SvelteKit Svelte's.
    const choice = await select<FrontendChoice>({
        message: 'Frontend framework:',
        choices: [
            { name: 'React', value: 'react' },
            { name: 'Next.js', value: 'next' },
            { name: 'Svelte', value: 'svelte' },
            { name: 'SvelteKit', value: 'sveltekit' }
        ],
        default:
            savedFrontendChoice(config) ??
            (hasDependency('next')
                ? 'next'
                : hasDependency('@sveltejs/kit')
                  ? 'sveltekit'
                  : hasDependency('svelte')
                    ? 'svelte'
                    : 'react')
    });
    const family = choice === 'react' || choice === 'next' ? 'react' : 'svelte';
    const adapter: RestAdapter | undefined =
        choice === 'next'
            ? 'next'
            : choice === 'sveltekit'
              ? 'svelte'
              : undefined;
    const restAdapter =
        adapter && config.backend
            ? { adapter: await askRestAdapter({ adapter }) }
            : { adapter: undefined };
    const current = config.frontend?.[family];
    const withStorybook = await confirm({
        message: 'Use Storybook',
        default: current ? Boolean(current.storybookFramework) : true
    });
    // One frontend framework per project: the other section is replaced.
    const { react, svelte, ...otherSettings } = config.frontend ?? {};
    ConfigFile.update({
        frontend: {
            ...otherSettings,
            [family]: {
                ...current,
                framework: choice,
                storybookFramework: withStorybook
                    ? storybookPackageFor(choice)
                    : undefined
            }
        }
    });
    return {
        restAdapter,
        nextSteps: [
            ...missingPackages(frontendPackages[choice]),
            ...(withStorybook ? await addStorybook() : [])
        ]
    };
};

/**
 * Finish REST setup once, after the frontend choice is known. Without
 * `restAdapter`, the adapter of the configured framework is asked about.
 */
const configureRest = async (restAdapter?: {
    adapter?: RestAdapter;
}): Promise<string[]> => {
    const backend = ConfigFile.Instance.data.backend;
    if (!backend) return [];
    const withRest = backend.domainFirstPackages.includes(
        '@domain-first/handlers-rest'
    );
    const adapter =
        restAdapter?.adapter ??
        (restAdapter ? undefined : await askRestAdapter());
    if (!withRest && !adapter) return [];
    if (adapter && !withRest) {
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
    return scaffoldRestEndpointGeneratorFiles({ adapter });
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
    let restAdapter: { adapter?: RestAdapter } | undefined;
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
                nextSteps.push(...(await configureBackend(config)));
                backendConfigured = true;
                break;
            case 'frontend': {
                const frontend = await configureFrontend(config);
                restAdapter = frontend.restAdapter;
                nextSteps.push(...frontend.nextSteps);
                break;
            }
        }
    }
    if (backendConfigured || restAdapter?.adapter) {
        const restSteps = await configureRest(restAdapter);
        nextSteps.push(...missingDomainFirstPackages(), ...restSteps);
    }
    return nextSteps;
};
