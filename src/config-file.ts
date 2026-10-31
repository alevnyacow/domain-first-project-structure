import path from 'node:path';
import z from 'zod';
import {
    defaultDependencies,
    dependencyRulesSchema,
    resolveDependencyRules
} from './dependency-rules';
import { File } from './file-system';
import { implementationOptionsSchema } from './implementation-options-schema';
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

const normalizeConfig = (value: unknown): ProjectConfig => {
    if (typeof value === 'object' && value !== null && 'project' in value)
        return configSchema.parse(value);
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

export class ConfigFile {
    public readonly data: ProjectConfig;

    private constructor() {
        this.data = normalizeConfig(JSON.parse(new File(ConfigFile.path).data));
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
        ConfigFile.stage(normalizeConfig(config));
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
    }

    /** Read compatibility is side-effect free; migrations join the next saved run. */
    static migrate = () => {
        if (!ConfigFile.exists) return;
        const raw = JSON.parse(new File(ConfigFile.path).data);
        if (!raw.project) ConfigFile.stage(ConfigFile.Instance.data);
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
