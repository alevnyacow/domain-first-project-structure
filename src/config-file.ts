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
    'clock',
    'config'
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
export const rulesSchema = z.object({
    dependencies: dependencyRulesSchema.optional(),
    lint: z.partialRecord(z.enum(lintChecks), z.boolean()).optional()
});
export const branchNameSchema = z
    .string()
    .regex(
        /^[a-z][a-z0-9]*$/,
        'Use lowercase letters and digits, e.g. staging.'
    );
/**
 * Custom `envBranchedWire` branches. Absent: `test`, `development` and
 * `production`, selected by `NODE_ENV`. Without `test`, every branch gets
 * the primary implementation and no test implementations are generated.
 */
export const envBranchesSchema = z
    .object({
        names: z.array(branchNameSchema).min(1),
        test: branchNameSchema.optional()
    })
    .refine(({ names }) => new Set(names).size === names.length, {
        message: 'Branch names must be unique.'
    })
    .refine(({ names, test }) => test === undefined || names.includes(test), {
        message: 'The test branch must be one of the branches.'
    })
    .refine(({ names, test }) => test === undefined || names.length > 1, {
        message:
            'The primary implementation needs a branch besides the test one.'
    });
export const backendConfigSchema = z
    .object({
        domainFirstPackages: z.array(z.enum(domainFirstPackages)),
        envBranches: envBranchesSchema.optional(),
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

/**
 * Configs from earlier major versions are not read: `df-upgrade` converts
 * them. The flat 7.x config has no `project` section.
 */
export const isOutdatedConfig = (value: unknown) =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('project' in value);

export const outdatedConfigMessage = `${configFileName} uses the format of an earlier major version: run npx df-upgrade.`;

export class ConfigOutdatedError extends Error {
    constructor() {
        super(outdatedConfigMessage);
    }
}

export class ConfigFile {
    public readonly data: ProjectConfig;

    private constructor() {
        const raw = JSON.parse(new File(ConfigFile.path).data);
        if (isOutdatedConfig(raw)) throw new ConfigOutdatedError();
        this.data = configSchema.parse(raw);
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

    /** The file exists but has the shape of an earlier major version. */
    static get outdated() {
        if (!ConfigFile.exists) return false;
        try {
            return isOutdatedConfig(JSON.parse(new File(ConfigFile.path).data));
        } catch {
            return false;
        }
    }

    static write = (config: ProjectConfig) => {
        ConfigFile.stage(configSchema.parse(config));
    };

    /** Update only the supplied sections, preserving the latest staged changes. */
    static update = (sections: Partial<ProjectConfig>) => {
        ConfigFile.stage(
            configSchema.parse({ ...ConfigFile.Instance.data, ...sections })
        );
    };

    private static stage(config: ProjectConfig) {
        new File(ConfigFile.path).update(
            `${JSON.stringify(config, null, 4)}\n`
        );
    }
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
