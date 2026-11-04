import z from 'zod';
import {
    configSchema,
    domainFirstPackages,
    isOutdatedConfig,
    type ProjectConfig,
    rulesSchema
} from './config-file';
import { implementationLabelSchema } from './implementation-options-schema';
import { hasDependency } from './integrations/missing-domain-first-packages';
import {
    openapiExtractorManualStep,
    openapiExtractorRootStep,
    restRootControllerStep
} from './upgrade-rest-root';

type Draft = Record<string, unknown>;

/**
 * The config being upgraded. Steps run in order on the same draft, so a
 * step sees the result of the previous ones.
 */
export type UpgradeContext = { config: Draft };

/**
 * - `required`: other commands refuse to run until it is applied.
 * - `optional`: changes generated code the user may have edited; asked one by one.
 *   Staged file changes are written with the config.
 * - `manual`: a note about what the user does themselves; changes nothing.
 */
export type UpgradeStepKind = 'required' | 'optional' | 'manual';

export type UpgradeStep = {
    id: string;
    kind: UpgradeStepKind;
    title: string;
    /** Whether the project needs the step. Must be false once it is applied. */
    detect: (context: UpgradeContext) => boolean;
    /** What the step changes, for review before anything is written. */
    plan: (context: UpgradeContext) => string[];
    /** Changes the draft config (and stages files). Not called for manual steps. */
    apply?: (context: UpgradeContext) => void;
};

const record = (value: unknown): Draft =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Draft)
        : {};

/** The 7.x config, as far as the upgrade needs it; other fields are kept. */
const flatConfigSchema = z
    .object({
        rootFolder: z.string().min(1),
        domainFirstPackages: z.array(z.enum(domainFirstPackages)),
        withInMemoryDb: z.boolean().optional(),
        testingLibrary: z.string().optional(),
        useReact: z.boolean().optional(),
        storybookFramework: z.string().optional(),
        defaultPersistenceLayerImplementation: z.string().optional(),
        rules: rulesSchema.optional()
    })
    .passthrough();

const sectionsStep: UpgradeStep = {
    id: 'config-sections',
    kind: 'required',
    title: 'Split the config into project, backend and frontend sections',
    detect: ({ config }) => isOutdatedConfig(config),
    plan: ({ config }) => {
        const flat = flatConfigSchema.parse(config);
        const backend = [
            'domainFirstPackages',
            'withInMemoryDb',
            'testingLibrary',
            'rules'
        ].filter((key) => key in flat);
        return [
            'rootFolder → project.rootFolder',
            `${backend.join(', ')} → backend`,
            flat.useReact
                ? `useReact${flat.storybookFramework ? ', storybookFramework' : ''} → frontend.react`
                : 'useReact: false → no frontend section'
        ];
    },
    apply: (context) => {
        const {
            rootFolder,
            domainFirstPackages,
            withInMemoryDb,
            testingLibrary,
            useReact,
            storybookFramework,
            defaultPersistenceLayerImplementation,
            rules,
            ...other
        } = flatConfigSchema.parse(context.config);
        context.config = {
            ...other,
            project: { rootFolder },
            backend: {
                domainFirstPackages,
                withInMemoryDb,
                testingLibrary,
                rules,
                // Handed to the persistence step below.
                defaultPersistenceLayerImplementation
            },
            ...(useReact ? { frontend: { react: { storybookFramework } } } : {})
        };
    }
};

const reactOf = (config: Draft) => record(record(config.frontend).react);

const frameworkStep: UpgradeStep = {
    id: 'react-framework',
    kind: 'required',
    title: 'Record the frontend framework explicitly',
    detect: ({ config }) =>
        'react' in record(config.frontend) && !reactOf(config).framework,
    plan: () => [
        hasDependency('next')
            ? 'frontend.react.framework: "next" (next is in package.json)'
            : 'frontend.react.framework: "react" (next is not in package.json)'
    ],
    apply: ({ config }) => {
        const frontend = record(config.frontend);
        config.frontend = {
            ...frontend,
            react: {
                ...reactOf(config),
                framework: hasDependency('next') ? 'next' : 'react'
            }
        };
    }
};

const persistenceKinds = ['repositories', 'commands', 'queries'] as const;

const persistenceStep: UpgradeStep = {
    id: 'persistence-default',
    kind: 'required',
    title: 'Move the default persistence implementation to saved implementation types',
    detect: ({ config }) =>
        'defaultPersistenceLayerImplementation' in record(config.backend),
    plan: ({ config }) => {
        const label = record(
            config.backend
        ).defaultPersistenceLayerImplementation;
        if (label === undefined) return [];
        return implementationLabelSchema.safeParse(label).success
            ? [
                  `defaultPersistenceLayerImplementation "${label}" → first primary type of backend.implementations.${persistenceKinds.join(', ')}`
              ]
            : [
                  `defaultPersistenceLayerImplementation "${String(label)}" is removed: it is not a kebab-case implementation type`
              ];
    },
    apply: ({ config }) => {
        const { defaultPersistenceLayerImplementation: label, ...backend } =
            record(config.backend);
        const implementations = record(backend.implementations);
        if (implementationLabelSchema.safeParse(label).success) {
            for (const kind of persistenceKinds) {
                const group = record(implementations[kind]);
                const primary = Array.isArray(group.primary)
                    ? (group.primary as string[])
                    : [];
                implementations[kind] = {
                    primary: [
                        label as string,
                        ...primary.filter((x) => x !== label)
                    ],
                    test: Array.isArray(group.test) ? group.test : []
                };
            }
            backend.implementations = implementations;
        }
        config.backend = backend;
    }
};

/**
 * Upgrade steps in the order they run. Each detects by the project's shape
 * whether it applies, so the command can run any number of times.
 */
export const upgradeSteps: UpgradeStep[] = [
    sectionsStep,
    frameworkStep,
    persistenceStep,
    restRootControllerStep,
    openapiExtractorRootStep,
    openapiExtractorManualStep
];

/** Shown after any change: skills of an earlier version describe the old CLI. */
export const skillsNote =
    'Update the agent skills to this version: npx df-skills';

export type PlannedStep = {
    step: UpgradeStep;
    changes: string[];
};

/**
 * Runs the steps on a copy of the config. Optional steps are applied only
 * when `acceptOptional` accepts them.
 */
export const planUpgrade = async (
    config: unknown,
    acceptOptional: (step: PlannedStep) => Promise<boolean> | boolean = () =>
        true,
    steps: UpgradeStep[] = upgradeSteps
) => {
    const context: UpgradeContext = {
        config: structuredClone(record(config))
    };
    const original = JSON.stringify(context.config);
    const planned: PlannedStep[] = [];
    for (const step of steps) {
        if (!step.detect(context)) continue;
        const entry = { step, changes: step.plan(context) };
        if (step.kind === 'optional' && !(await acceptOptional(entry)))
            continue;
        planned.push(entry);
        step.apply?.(context);
    }
    const changed = planned.some(({ step }) => step.kind !== 'manual');
    /** Steps that only move files leave the config as it is. */
    const configChanged = JSON.stringify(context.config) !== original;
    return {
        planned,
        changed,
        config: configChanged
            ? (configSchema.parse(context.config) as ProjectConfig)
            : undefined
    };
};
