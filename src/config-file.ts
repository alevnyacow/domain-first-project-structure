import path from 'node:path';
import z from 'zod';
import {
    dependencyRulesSchema,
    resolveDependencyRules
} from './dependency-rules';
import { File } from './file-system';
import { ProjectRoot } from './project-root';

/**
 * `df-lint` checks that `rules.lint` can turn off.
 */
export const lintChecks = [
    'context-isolation',
    'shared-layer',
    'layers',
    'dependencies',
    'react',
    'clock'
] as const;

export type LintCheck = (typeof lintChecks)[number];

const configFileName = 'domain-first.project-structure.config.json';

const configSchema = z.object({
    rootFolder: z.string(),
    domainFirstPackages: z.array(
        z.enum([
            '@domain-first/types',
            '@domain-first/errors',
            '@domain-first/handlers',
            '@domain-first/wire',
            '@domain-first/handlers-rest'
        ])
    ),
    defaultPersistenceLayerImplementation: z.string(),
    withInMemoryDb: z.boolean().optional(),
    useReact: z.boolean(),
    storybookFramework: z.string().optional(),
    testingLibrary: z.string().optional(),
    rules: z
        .object({
            dependencies: dependencyRulesSchema.optional(),
            lint: z.partialRecord(z.enum(lintChecks), z.boolean()).optional()
        })
        .optional()
});

export class ConfigFile {
    public readonly data: z.infer<typeof configSchema>;

    private constructor() {
        const filePath = ConfigFile.path;
        const file = new File(filePath);
        const configObject = JSON.parse(file.data);
        this.data = configSchema.parse(configObject);
    }

    public static get Instance() {
        return new ConfigFile();
    }

    private static get path() {
        const { path: root } = new ProjectRoot();
        return path.resolve(root, configFileName);
    }

    static get exists() {
        return new File(ConfigFile.path).exists;
    }

    static write = (config: z.infer<typeof configSchema>) => {
        new File(ConfigFile.path).data = JSON.stringify(config, null, '\t');
    };
}

/**
 * The dependency rules: the defaults with the config's `rules.dependencies`.
 */
export const configuredDependencyRules = () =>
    resolveDependencyRules(
        ConfigFile.exists
            ? ConfigFile.Instance.data.rules?.dependencies
            : undefined
    );
