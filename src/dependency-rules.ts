import z from 'zod';

/**
 * Kinds of modules the dependency rules are written in: the folders
 * under `wiring/`.
 */
export const moduleKinds = [
    'repositories',
    'domain-services',
    'application-ports',
    'application-services',
    'use-cases',
    'commands',
    'queries',
    'infrastructure-services',
    'presentation-services'
] as const;

export type ModuleKind = (typeof moduleKinds)[number];

export type DependencyRules = Record<ModuleKind, ReadonlySet<ModuleKind>>;

const domain: ModuleKind[] = ['repositories', 'domain-services'];
const commandsAndQueries: ModuleKind[] = ['commands', 'queries'];
/**
 * What infrastructure implementations see: domain, application ports
 * and other infrastructure.
 */
const infrastructure: ModuleKind[] = [
    ...domain,
    'application-ports',
    'infrastructure-services'
];

/**
 * What each kind of module may depend on. Repositories, commands,
 * queries and ports are their implementations here.
 */
export const defaultDependencies: Record<ModuleKind, ModuleKind[]> = {
    /**
     * Domain services work with the data they are handed: loading it is
     * the application layer's job.
     */
    'domain-services': ['domain-services'],
    repositories: [
        'domain-services',
        'application-ports',
        'infrastructure-services'
    ],
    'application-ports': infrastructure,
    'application-services': [
        ...domain,
        'application-ports',
        ...commandsAndQueries
    ],
    'use-cases': [
        ...domain,
        'application-ports',
        'application-services',
        ...commandsAndQueries
    ],
    /**
     * One atomic operation each: only the technology they run on.
     */
    commands: ['infrastructure-services'],
    queries: ['infrastructure-services'],
    'infrastructure-services': infrastructure,
    'presentation-services': [
        'application-ports',
        'application-services',
        'use-cases',
        ...commandsAndQueries,
        'presentation-services'
    ]
};

const kindSchema = z.enum(moduleKinds);

/**
 * A list replaces the default one; `add` and `remove` change it.
 */
export const dependencyRulesSchema = z.partialRecord(
    kindSchema,
    z.union([
        z.array(kindSchema),
        z.object({
            add: z.array(kindSchema).optional(),
            remove: z.array(kindSchema).optional()
        })
    ])
);

export type DependencyRulesConfig = z.infer<typeof dependencyRulesSchema>;

export const resolveDependencyRules = (
    config: DependencyRulesConfig = {}
): DependencyRules => {
    const entries = moduleKinds.map((kind) => {
        const override = config[kind];
        if (Array.isArray(override)) {
            return [kind, new Set(override)];
        }
        const kinds = new Set([
            ...defaultDependencies[kind],
            ...(override?.add ?? [])
        ]);
        for (const removed of override?.remove ?? []) {
            kinds.delete(removed);
        }
        return [kind, kinds];
    });
    return Object.fromEntries(entries);
};

export const defaultDependencyRules = resolveDependencyRules();

const isModuleKind = (value: string): value is ModuleKind =>
    (moduleKinds as readonly string[]).includes(value);

/**
 * The kind of a wired module: its folder under `wiring/`.
 */
export const wiredModuleKind = (wiringKind: string) =>
    isModuleKind(wiringKind) ? wiringKind : undefined;

/**
 * The kind of a module file, from its path inside a context or the
 * Shared Kernel (`application/use-cases/…`), or undefined for other files
 * such as entities, value objects and errors.
 */
export const fileModuleKind = (segments: string[]): ModuleKind | undefined => {
    const [layer, folder] = segments;
    const file = segments.at(-1) ?? '';
    /**
     * Barrels only re-export.
     */
    if (/^index(\.tsx?)?$/.test(file)) {
        return undefined;
    }
    if (layer === 'domain') {
        if (folder === 'services') {
            return 'domain-services';
        }
        return folder === 'aggregates' && /-repository(\.tsx?)?$/.test(file)
            ? 'repositories'
            : undefined;
    }
    if (layer === 'application') {
        return (
            {
                commands: 'commands',
                queries: 'queries',
                ports: 'application-ports',
                services: 'application-services',
                'use-cases': 'use-cases'
            } as const
        )[folder];
    }
    if (layer === 'infrastructure') {
        return (
            {
                repositories: 'repositories',
                commands: 'commands',
                queries: 'queries',
                'application-adapters': 'application-ports',
                services: 'infrastructure-services'
            } as const
        )[folder];
    }
    return layer === 'presentation' && folder === 'services'
        ? 'presentation-services'
        : undefined;
};
