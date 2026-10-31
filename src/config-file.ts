import path from 'node:path';
import z from 'zod';
import {
    defaultDependencies,
    dependencyRulesSchema,
    resolveDependencyRules
} from './dependency-rules';
import { File } from './file-system';
import {
    implementationKinds,
    implementationOptionsSchema
} from './implementation-options-schema';
import { ProjectRoot } from './project-root';

/**
 * `df-lint` checks that `backend.rules.lint` can turn off.
 */
export const lintChecks = [
    'context-isolation',
    'shared-kernel',
    'layers',
    'dependencies',
    'react',
    'clock'
] as const;

export type LintCheck = (typeof lintChecks)[number];

export const configFileName = 'domain-first.project-structure.config.json';
export const legacyImplementationChoicesFileName =
    'domain-first.project-structure.implementations.json';

export const projectConfigSchema = z
    .object({ rootFolder: z.string().min(1) })
    .passthrough();
export const domainFirstPackages = [
    '@domain-first/types',
    '@domain-first/errors',
    '@domain-first/handlers',
    '@domain-first/wire',
    '@domain-first/handlers-rest'
] as const;
const rulesSchema = z.object({
    dependencies: dependencyRulesSchema.optional(),
    lint: z.partialRecord(z.enum(lintChecks), z.boolean()).optional()
});
export const backendConfigSchema = z
    .object({
        domainFirstPackages: z.array(z.enum(domainFirstPackages)),
        withInMemoryDb: z.boolean().optional(),
        testingLibrary: z.string().optional(),
        implementations: implementationOptionsSchema.optional(),
        rules: rulesSchema.optional()
    })
    .passthrough();
export const reactConfigSchema = z
    .object({
        framework: z.enum(['react', 'next']).optional(),
        storybookFramework: z.string().optional()
    })
    .passthrough();
export const frontendConfigSchema = z
    .object({
        react: reactConfigSchema.optional()
    })
    .passthrough();
export const configSchema = z
    .object({
        project: projectConfigSchema,
        backend: backendConfigSchema.optional(),
        frontend: frontendConfigSchema.optional()
    })
    .passthrough();
export type ProjectConfig = z.infer<typeof configSchema>;
export type BackendConfig = z.infer<typeof backendConfigSchema>;

/** Make the defaults editable in generated configs without resetting overrides. */
export const scaffoldBackendRules = (
    rules: BackendConfig['rules'] = {}
): NonNullable<BackendConfig['rules']> => ({
    dependencies: {
        ...Object.fromEntries(
            Object.entries(defaultDependencies).map(([kind, dependencies]) => [
                kind,
                [...dependencies]
            ])
        ),
        ...rules.dependencies
    },
    lint: {
        ...Object.fromEntries(lintChecks.map((check) => [check, true])),
        ...rules.lint
    }
});

const legacyConfigSchema = backendConfigSchema.extend({
    rootFolder: z.string(),
    useReact: z.boolean(),
    storybookFramework: z.string().optional(),
    rules: rulesSchema.optional()
});
type LegacyConfig = z.infer<typeof legacyConfigSchema>;

type ImplementationOptions = z.infer<typeof implementationOptionsSchema>;
const mergeImplementationOptions = (
    current: ImplementationOptions | undefined,
    incoming: ImplementationOptions | undefined
): ImplementationOptions | undefined => {
    if (!incoming) return current;
    const merged = { ...current };
    for (const kind of implementationKinds) {
        const group = incoming[kind];
        if (!group) continue;
        merged[kind] = {
            primary: [
                ...new Set([
                    ...(current?.[kind]?.primary ?? []),
                    ...group.primary
                ])
            ],
            test: [
                ...new Set([...(current?.[kind]?.test ?? []), ...group.test])
            ]
        };
    }
    return merged;
};

// Accept the previous sectioned format, but keep backend settings only in backend.
const previousConfigSchema = configSchema.extend({
    implementations: implementationOptionsSchema.optional(),
    rules: rulesSchema.optional()
});
const normalizeConfig = (value: unknown): ProjectConfig => {
    if (typeof value === 'object' && value !== null && 'project' in value) {
        const { implementations, rules, ...config } =
            previousConfigSchema.parse(value);
        if (!implementations && !rules) return config;
        const backend = config.backend ?? { domainFirstPackages: [] };
        return configSchema.parse({
            ...config,
            backend: {
                ...backend,
                implementations: mergeImplementationOptions(
                    backend.implementations,
                    implementations
                ),
                rules: rules
                    ? {
                          ...rules,
                          ...backend.rules,
                          ...(rules.dependencies || backend.rules?.dependencies
                              ? {
                                    dependencies: {
                                        ...rules.dependencies,
                                        ...backend.rules?.dependencies
                                    }
                                }
                              : {}),
                          ...(rules.lint || backend.rules?.lint
                              ? {
                                    lint: {
                                        ...rules.lint,
                                        ...backend.rules?.lint
                                    }
                                }
                              : {})
                      }
                    : backend.rules
            }
        });
    }
    const legacy = legacyConfigSchema.parse(value);
    return configSchema.parse({
        project: { rootFolder: legacy.rootFolder },
        backend: {
            domainFirstPackages: legacy.domainFirstPackages,
            withInMemoryDb: legacy.withInMemoryDb,
            testingLibrary: legacy.testingLibrary,
            implementations: legacy.implementations,
            rules: legacy.rules
        },
        ...(legacy.useReact
            ? {
                  frontend: {
                      react: { storybookFramework: legacy.storybookFramework }
                  }
              }
            : {})
    });
};

const legacyChoicesFile = () =>
    new File(
        path.join(new ProjectRoot().path, legacyImplementationChoicesFileName)
    );
const mergeLegacyChoices = (config: ProjectConfig): ProjectConfig => {
    const legacy = legacyChoicesFile();
    if (!legacy.exists) return config;
    let choices: z.infer<typeof implementationOptionsSchema>;
    try {
        choices = implementationOptionsSchema.parse(JSON.parse(legacy.data));
    } catch (error) {
        throw new Error(
            `Invalid ${legacyImplementationChoicesFileName}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error }
        );
    }
    return {
        ...config,
        backend: {
            ...(config.backend ?? { domainFirstPackages: [] }),
            implementations: mergeImplementationOptions(
                config.backend?.implementations,
                choices
            )
        }
    };
};

export class ConfigFile {
    public readonly data: ProjectConfig;

    private constructor() {
        this.data = mergeLegacyChoices(
            normalizeConfig(JSON.parse(new File(ConfigFile.path).data))
        );
    }

    public static get Instance() {
        return new ConfigFile();
    }

    /** Backend generators require an explicitly configured backend section. */
    public static get backend(): BackendConfig {
        const backend = ConfigFile.Instance.data.backend;
        if (!backend)
            throw new Error(
                'Backend is not configured: run df-init --section backend.'
            );
        return backend;
    }

    private static get path() {
        return path.resolve(new ProjectRoot().path, configFileName);
    }

    static get exists() {
        return new File(ConfigFile.path).exists;
    }

    static write = (config: ProjectConfig | LegacyConfig) => {
        ConfigFile.stage(mergeLegacyChoices(normalizeConfig(config)));
    };

    /** Update only the supplied sections, preserving the latest staged changes. */
    static update = (sections: Partial<ProjectConfig>) => {
        ConfigFile.stage(
            normalizeConfig({ ...ConfigFile.Instance.data, ...sections })
        );
    };

    private static stage(config: ProjectConfig) {
        new File(ConfigFile.path).update(
            `${JSON.stringify(config, null, 4)}\n`
        );
        const legacy = legacyChoicesFile();
        if (legacy.exists) legacy.delete(new ProjectRoot().path);
    }

    /** Read compatibility is side-effect free; migrations join the next saved run. */
    static migrate = () => {
        if (!ConfigFile.exists) return;
        const file = new File(ConfigFile.path);
        const raw = JSON.parse(file.data);
        if (
            !raw.project ||
            'rules' in raw ||
            'implementations' in raw ||
            legacyChoicesFile().exists
        ) {
            ConfigFile.stage(ConfigFile.Instance.data);
        }
    };
}

/**
 * The dependency rules: the defaults with the config's `backend.rules.dependencies`.
 */
export const configuredDependencyRules = () =>
    resolveDependencyRules(
        ConfigFile.exists
            ? ConfigFile.Instance.data.backend?.rules?.dependencies
            : undefined
    );
