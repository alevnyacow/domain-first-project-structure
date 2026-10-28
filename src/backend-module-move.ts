import fs from 'node:fs';
import path from 'node:path';
import { File } from './file-system';
import { plural } from './in-memory-db';
import {
    codeExtension,
    escapeRegExp,
    type MovePlan,
    projectImports,
    stageModuleMove,
    toPosix,
    walk
} from './module-move';
import { UnknownFormatNaming } from './unknown-format-naming';

export type BackendUnitKind =
    | 'aggregate'
    | 'entity'
    | 'value-object'
    | 'domain-service'
    | 'application-service'
    | 'infrastructure-service'
    | 'presentation-service'
    | 'use-case'
    | 'command'
    | 'query'
    | 'port';

/**
 * Where a unit lives: a bounded context or the Shared Kernel folder, and
 * for entities and value objects, the aggregate they belong to.
 */
export type UnitPlace = {
    ownerPath: string;
    name: string;
    aggregate?: string;
};

export type BackendUnit = UnitPlace & {
    kind: BackendUnitKind;
    /** Implementation folders, e.g. `prisma`, `in-memory`, `api`. */
    labels: string[];
};

type KindLayout = {
    title: string;
    /** The class every other name derives from, e.g. `PlaceOrderUseCase`. */
    core: (ClassName: string) => string;
    /** Files of the unit relative to its owner, in a fixed order. */
    files: (place: UnitPlace, labels: string[]) => string[];
    /** Implementation folders: classes `<Label><Core>` live there. */
    implementations?: string;
    wired: boolean;
    /** Generated in the Shared Kernel too. */
    sharedKernel: boolean;
};

const serviceLayout = (layer: string): KindLayout => ({
    title: `${layer[0].toUpperCase()}${layer.slice(1)} services`,
    core: (ClassName) =>
        `${ClassName}${layer[0].toUpperCase()}${layer.slice(1)}Service`,
    files: ({ name }) => [
        `${layer}/services/${name}-${layer}-service.ts`,
        `${layer}/services/${name}-${layer}-service.spec.ts`,
        `wiring/${layer}-services/wire-${name}-${layer}-service.ts`
    ],
    wired: true,
    sharedKernel: true
});

const handlerLayout = (kind: 'command' | 'query'): KindLayout => {
    const folder = kind === 'command' ? 'commands' : 'queries';
    const Suffix = kind === 'command' ? 'Command' : 'Query';
    return {
        title: kind === 'command' ? 'Commands' : 'Queries',
        core: (ClassName) => `${ClassName}${Suffix}`,
        files: ({ name }, labels) => [
            `application/${folder}/${name}-${kind}.ts`,
            `application/${folder}/${name}-${kind}.spec.ts`,
            ...labels.map(
                (label) =>
                    `infrastructure/${folder}/${label}/${label}-${name}-${kind}.ts`
            ),
            `wiring/${folder}/wire-${name}-${kind}.ts`
        ],
        implementations: `infrastructure/${folder}`,
        wired: true,
        sharedKernel: false
    };
};

const domainModelLayout = (kind: 'entity' | 'value-object'): KindLayout => {
    const folder = kind === 'entity' ? 'entities' : 'value-objects';
    return {
        title: kind === 'entity' ? 'Entities' : 'Value objects',
        core: (ClassName) => ClassName,
        files: ({ name, aggregate }) => {
            const base = aggregate
                ? `domain/aggregates/${aggregate}/${folder}`
                : `domain/${folder}`;
            return [
                `${base}/${name}.${kind}.ts`,
                `${base}/${name}.${kind}.spec.ts`
            ];
        },
        wired: false,
        sharedKernel: true
    };
};

/** Files directly in an aggregate folder that carry its name. */
const aggregateOwnFiles = (name: string) => [
    `${name}.aggregate-root.ts`,
    `${name}.aggregate-root.spec.ts`,
    `${name}-repository.ts`,
    `${name}-repository.spec.ts`,
    'index.ts'
];

export const kindLayouts: Record<BackendUnitKind, KindLayout> = {
    aggregate: {
        title: 'Aggregates',
        core: (ClassName) => `${ClassName}Repository`,
        files: ({ name }, labels) => [
            ...aggregateOwnFiles(name).map(
                (file) => `domain/aggregates/${name}/${file}`
            ),
            ...labels.map(
                (label) =>
                    `infrastructure/repositories/${label}/${label}-${name}-repository.ts`
            ),
            `wiring/repositories/wire-${name}-repository.ts`
        ],
        implementations: 'infrastructure/repositories',
        wired: true,
        sharedKernel: false
    },
    entity: domainModelLayout('entity'),
    'value-object': domainModelLayout('value-object'),
    'domain-service': serviceLayout('domain'),
    'application-service': serviceLayout('application'),
    'infrastructure-service': serviceLayout('infrastructure'),
    'presentation-service': serviceLayout('presentation'),
    'use-case': {
        title: 'Use cases',
        core: (ClassName) => `${ClassName}UseCase`,
        files: ({ name }) => [
            `application/use-cases/${name}-use-case.ts`,
            `application/use-cases/${name}-use-case.spec.ts`,
            `wiring/use-cases/wire-${name}-use-case.ts`
        ],
        wired: true,
        sharedKernel: false
    },
    command: handlerLayout('command'),
    query: handlerLayout('query'),
    port: {
        title: 'Ports',
        core: (ClassName) => ClassName,
        files: ({ name }, labels) => [
            `application/ports/${name}.ts`,
            `application/ports/${name}.spec.ts`,
            ...labels.map(
                (label) =>
                    `infrastructure/application-adapters/${label}/${label}-${name}.ts`
            ),
            `wiring/application-ports/wire-${name}.ts`
        ],
        implementations: 'infrastructure/application-adapters',
        wired: true,
        sharedKernel: true
    }
};

const subfolders = (folder: string) =>
    fs.existsSync(folder)
        ? fs
              .readdirSync(folder, { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name)
              .sort()
        : [];

/** Names of the files in a folder that end with the suffix, without it. */
const namesBySuffix = (folder: string, suffix: string) =>
    fs.existsSync(folder)
        ? fs
              .readdirSync(folder)
              .filter(
                  (file) => file.endsWith(suffix) && !file.endsWith('.spec.ts')
              )
              .map((file) => file.slice(0, -suffix.length))
              .sort()
        : [];

const labelsOf = (ownerPath: string, kind: BackendUnitKind, name: string) => {
    const { implementations } = kindLayouts[kind];
    if (!implementations) return [];
    return subfolders(path.join(ownerPath, implementations)).filter((label) =>
        kindLayouts[kind]
            .files({ ownerPath, name }, [label])
            .some(
                (file) =>
                    file.startsWith(`${implementations}/`) &&
                    fs.existsSync(path.join(ownerPath, file))
            )
    );
};

export const aggregatesOf = (ownerPath: string) =>
    subfolders(path.join(ownerPath, 'domain/aggregates')).filter((name) =>
        fs.existsSync(
            path.join(
                ownerPath,
                'domain/aggregates',
                name,
                `${name}.aggregate-root.ts`
            )
        )
    );

/**
 * Units generated in a bounded context or the Shared Kernel, found by
 * their file layout, so projects without wiring are covered too.
 */
export const findBackendUnits = (ownerPath: string): BackendUnit[] => {
    const unit = (
        kind: BackendUnitKind,
        name: string,
        aggregate?: string
    ): BackendUnit => ({
        kind,
        name,
        ownerPath,
        aggregate,
        labels: labelsOf(ownerPath, kind, name)
    });
    const aggregates = aggregatesOf(ownerPath);
    const inAggregates = (kind: 'entity' | 'value-object') =>
        aggregates.flatMap((aggregate) =>
            namesBySuffix(
                path.join(
                    ownerPath,
                    'domain/aggregates',
                    aggregate,
                    kind === 'entity' ? 'entities' : 'value-objects'
                ),
                `.${kind}.ts`
            ).map((name) => unit(kind, name, aggregate))
        );
    const at = (folder: string, suffix: string, kind: BackendUnitKind) =>
        namesBySuffix(path.join(ownerPath, folder), suffix).map((name) =>
            unit(kind, name)
        );
    return [
        ...aggregates.map((name) => unit('aggregate', name)),
        ...inAggregates('entity'),
        ...at('domain/entities', '.entity.ts', 'entity'),
        ...inAggregates('value-object'),
        ...at('domain/value-objects', '.value-object.ts', 'value-object'),
        ...at('domain/services', '-domain-service.ts', 'domain-service'),
        ...at('application/ports', '.ts', 'port'),
        ...at('application/queries', '-query.ts', 'query'),
        ...at('application/commands', '-command.ts', 'command'),
        ...at('application/use-cases', '-use-case.ts', 'use-case'),
        ...at(
            'application/services',
            '-application-service.ts',
            'application-service'
        ),
        ...at(
            'infrastructure/services',
            '-infrastructure-service.ts',
            'infrastructure-service'
        ),
        ...at(
            'presentation/services',
            '-presentation-service.ts',
            'presentation-service'
        )
    ];
};

export const kebabName = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const lowerFirst = (value: string) => value[0].toLowerCase() + value.slice(1);

/**
 * Old path → new path of every existing file of the unit. Files inside an
 * aggregate folder that don't carry its name (entities, value objects)
 * keep their paths relative to it.
 */
const unitMoves = (unit: BackendUnit, target: UnitPlace) => {
    const layout = kindLayouts[unit.kind];
    const from = layout.files(unit, unit.labels);
    const to = layout.files(target, unit.labels);
    const moves = new Map<string, string>();
    from.forEach((file, index) => {
        const oldPath = path.join(unit.ownerPath, file);
        if (fs.existsSync(oldPath)) {
            moves.set(oldPath, path.join(target.ownerPath, to[index]));
        }
    });
    if (unit.kind === 'aggregate') {
        const oldFolder = path.join(
            unit.ownerPath,
            'domain/aggregates',
            unit.name
        );
        const newFolder = path.join(
            target.ownerPath,
            'domain/aggregates',
            target.name
        );
        const own = new Set(
            aggregateOwnFiles(unit.name).map((file) =>
                path.join(oldFolder, file)
            )
        );
        for (const file of walk(oldFolder)) {
            if (!own.has(file)) {
                moves.set(
                    file,
                    path.join(newFolder, path.relative(oldFolder, file))
                );
            }
        }
    }
    return moves;
};

/**
 * Checks a move before anything is staged; true or the reason it can't
 * be done.
 */
export const validateBackendMove = (
    unit: BackendUnit,
    target: UnitPlace,
    sharedKernelPath: string
) => {
    if (!kebabName.test(target.name)) {
        return 'Use kebab-case: lowercase words split by "-", e.g. place-order';
    }
    if (
        target.ownerPath === sharedKernelPath &&
        !kindLayouts[unit.kind].sharedKernel
    ) {
        return `${kindLayouts[unit.kind].title} are not part of the Shared Kernel`;
    }
    if (
        target.ownerPath === unit.ownerPath &&
        target.name === unit.name &&
        target.aggregate === unit.aggregate
    ) {
        return 'Nothing to change: enter a new name or pick another place';
    }
    for (const [from, to] of unitMoves(unit, target)) {
        if (to !== from && fs.existsSync(to)) {
            return `${path.relative(target.ownerPath, to)} already exists`;
        }
    }
    return true;
};

/** Where a file belongs: a bounded context, the Shared Kernel or neither. */
const ownerOf = (rootFolderPath: string, file: string) => {
    const [area, context] = path.relative(rootFolderPath, file).split(path.sep);
    if (area === 'bounded-contexts' && context) {
        return { context, path: path.join(rootFolderPath, area, context) };
    }
    if (area === 'shared-kernel') {
        return { context: undefined, path: path.join(rootFolderPath, area) };
    }
    return undefined;
};

const inMemoryDbFile = (rootFolderPath: string) =>
    path.join(
        rootFolderPath,
        'shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts'
    );

/**
 * Whether `from` may import `to` by bounded context isolation: never
 * another context; the Shared Kernel only a context's errors, and the
 * in-memory DB also its domain models.
 */
const isolationAllows = (rootFolderPath: string, from: string, to: string) => {
    const fromOwner = ownerOf(rootFolderPath, from);
    const toOwner = ownerOf(rootFolderPath, to);
    if (!fromOwner || !toOwner?.context) return true;
    if (fromOwner.context) return fromOwner.context === toOwner.context;
    const inside = (folder: string) =>
        to === path.join(toOwner.path, folder) ||
        to.startsWith(path.join(toOwner.path, folder) + path.sep);
    return (
        inside('domain/errors') ||
        (from.replace(codeExtension, '') ===
            inMemoryDbFile(rootFolderPath).replace(codeExtension, '') &&
            inside('domain'))
    );
};

export type BackendMoveResult =
    | { violations: [string, string][] }
    | (MovePlan & { violations?: undefined });

/**
 * Stages the move of a unit: its files, the names derived from it in the
 * project, and the imports of it. Nothing is staged when the move would
 * make a file import across a bounded context boundary; those imports
 * are returned instead, with paths after the move.
 */
export const moveBackendUnit = (
    projectRoot: string,
    rootFolderPath: string,
    unit: BackendUnit,
    target: UnitPlace
): BackendMoveResult => {
    const layout = kindLayouts[unit.kind];
    const moves = unitMoves(unit, target);
    const withoutExtension = new Map(
        [...moves].map(([from, to]) => [
            from.replace(codeExtension, ''),
            to.replace(codeExtension, '')
        ])
    );
    const folders: [string, string][] =
        unit.kind === 'aggregate'
            ? [
                  [
                      path.join(unit.ownerPath, 'domain/aggregates', unit.name),
                      path.join(
                          target.ownerPath,
                          'domain/aggregates',
                          target.name
                      )
                  ]
              ]
            : [];
    const movedPath = (candidate: string) => {
        const extension = candidate.match(codeExtension)?.[0];
        if (extension) return moves.get(candidate);
        return (
            withoutExtension.get(candidate) ??
            folders.find(([from]) => from === candidate)?.[1]
        );
    };

    const { codeFiles, importsOf, resolve } = projectImports(projectRoot);
    const oldNaming = new UnknownFormatNaming(unit.name);
    const newNaming = new UnknownFormatNaming(target.name);

    /**
     * An entity or value object leaving its aggregate is no longer
     * re-exported there: importers of the aggregate's barrel import it
     * from its new file instead.
     */
    const leavesAggregate =
        !!unit.aggregate &&
        (unit.aggregate !== target.aggregate ||
            unit.ownerPath !== target.ownerPath);
    const oldAggregateFolder =
        unit.aggregate &&
        path.join(unit.ownerPath, 'domain/aggregates', unit.aggregate);
    /** An import of the aggregate's barrel: its folder or its `index`. */
    const isOldBarrel = (resolved: string | undefined) =>
        !!oldAggregateFolder &&
        (resolved === oldAggregateFolder ||
            resolved === path.join(oldAggregateFolder, 'index'));
    const mainFile = [...moves.keys()][0];
    const newMainFile = moves.get(mainFile) as string;
    const namedImports =
        /import\s+(type\s+)?\{([^}]*)\}\s*from\s*(['"])([^'"\n]+)\3;?/g;
    const barrelImporters = leavesAggregate
        ? [...codeFiles].filter(
              ([file, content]) =>
                  !moves.has(file) &&
                  [...content.matchAll(namedImports)].some(
                      ([, , names, , specifier]) =>
                          isOldBarrel(resolve(specifier, file)?.resolved) &&
                          new RegExp(
                              `(?<![\\w$])${oldNaming.ClassName}(?![\\w$])`
                          ).test(names)
                  )
          )
        : [];

    const violations: [string, string][] = [];
    const relative = (file: string) =>
        toPosix(path.relative(projectRoot, file));
    for (const file of codeFiles.keys()) {
        const from = moves.get(file) ?? file;
        for (const imported of importsOf(file)) {
            const to = movedPath(imported);
            if (!moves.has(file) && !to) continue;
            if (!isolationAllows(rootFolderPath, from, to ?? imported)) {
                violations.push([relative(from), relative(to ?? imported)]);
            }
        }
    }
    for (const [file] of barrelImporters) {
        if (!isolationAllows(rootFolderPath, file, newMainFile)) {
            violations.push([relative(file), relative(newMainFile)]);
        }
    }
    if (violations.length) return { violations };

    const word = (form: string) => `(?<![\\w$])${escapeRegExp(form)}(?![\\w$])`;
    const oldCore = layout.core(oldNaming.ClassName);
    const newCore = layout.core(newNaming.ClassName);
    const prefixes = [
        ...unit.labels.map((label) => new UnknownFormatNaming(label).ClassName),
        ...(layout.wired ? ['wire'] : [])
    ];
    const renames: { pattern: RegExp; to: string; movedOnly?: boolean }[] = [
        {
            pattern: new RegExp(
                `(?<![\\w$])(${prefixes.map(escapeRegExp).join('|')})?${escapeRegExp(oldCore)}(?![\\w$])`,
                'g'
            ),
            to: `$1${newCore}`
        },
        {
            pattern: new RegExp(word(lowerFirst(oldCore)), 'g'),
            to: lowerFirst(newCore)
        },
        {
            pattern: new RegExp(
                `(describe\\(\\s*['"\`])${escapeRegExp(oldNaming.withSpaces)}(?=[ '"\`])`,
                'g'
            ),
            to: `$1${newNaming.withSpaces}`,
            movedOnly: true
        }
    ];
    if (unit.kind === 'aggregate') {
        renames.push(
            {
                pattern: new RegExp(word(oldNaming.ClassName), 'g'),
                to: newNaming.ClassName
            },
            {
                pattern: new RegExp(word(oldNaming.variableName), 'g'),
                to: newNaming.variableName,
                movedOnly: true
            }
        );
    }
    if (unit.kind === 'entity' || unit.kind === 'value-object') {
        renames.push({
            pattern: new RegExp(word(oldNaming.variableName), 'g'),
            to: newNaming.variableName,
            movedOnly: true
        });
    }

    /** The in-memory DB section of an aggregate follows its name. */
    const oldSection = new UnknownFormatNaming(plural(unit.name));
    const newSection = new UnknownFormatNaming(plural(target.name));
    const renamesSection =
        unit.kind === 'aggregate' && unit.name !== target.name;
    const everyFile = (content: string) =>
        renamesSection
            ? content
                  .replace(
                      new RegExp(
                          `(InMemoryDbInfrastructureService\\[\\s*['"])${oldSection.variableName}(?=['"]\\s*\\])`,
                          'g'
                      ),
                      `$1${newSection.variableName}`
                  )
                  .replace(
                      new RegExp(
                          `(inMemoryDbInfrastructureService\\s*\\.\\s*)${oldSection.variableName}(?![\\w$])`,
                          'g'
                      ),
                      `$1${newSection.variableName}`
                  )
                  .replace(
                      new RegExp(
                          `(?<![\\w$.])${oldSection.variableName}(\\s*=\\s*this\\.section<[^>]*>\\(\\s*['"])${oldSection.fileName.toUpperCase()}(?=['"])`,
                          'g'
                      ),
                      `${newSection.variableName}$1${newSection.fileName.toUpperCase()}`
                  )
            : content;

    const plan = stageModuleMove({
        projectRoot,
        stopAt: rootFolderPath,
        moves,
        movedPath,
        rename: (content, { moved }) =>
            renames.reduce(
                (result, { pattern, to, movedOnly }) =>
                    movedOnly && !moved ? result : result.replace(pattern, to),
                content
            ),
        everyFile
    });

    if (leavesAggregate && oldAggregateFolder) {
        const indexFile = new File(path.join(oldAggregateFolder, 'index.ts'));
        const exportLine = /^export\s+\*\s+from\s+(['"])([^'"\n]+)\1;?\s*$/;
        indexFile.update(
            indexFile.data
                .split('\n')
                .filter((line) => {
                    const specifier = line.match(exportLine)?.[2];
                    return (
                        !specifier ||
                        path.resolve(
                            path.dirname(indexFile.path),
                            specifier
                        ) !== newMainFile.replace(codeExtension, '')
                    );
                })
                .join('\n')
        );
        if (!plan.updated.includes(indexFile.path)) {
            plan.updated.push(indexFile.path);
        }
        for (const [file] of barrelImporters) {
            const importer = new File(file);
            let content = importer.data;
            for (const match of content.matchAll(namedImports)) {
                const [statement, typeOnly = '', names, quote, specifier] =
                    match;
                if (!isOldBarrel(resolve(specifier, file)?.resolved)) {
                    continue;
                }
                const items = names
                    .split(',')
                    .map((item) => item.trim())
                    .filter((item) => !!item);
                const own = new RegExp(
                    `^(?:type\\s+)?${newNaming.ClassName}(?:\\s+as\\s+[\\w$]+)?$`
                );
                const moved = items.filter((item) => own.test(item));
                if (!moved.length) continue;
                const rest = items.filter((item) => !own.test(item));
                const direct = `import ${typeOnly}{ ${moved.join(', ')} } from ${quote}${projectRelative(file, newMainFile)}${quote}`;
                content = content.replace(
                    statement,
                    rest.length
                        ? `import ${typeOnly}{ ${rest.join(', ')} } from ${quote}${specifier}${quote}\n${direct}`
                        : direct
                );
            }
            importer.update(content);
        }
    }

    if (
        target.aggregate &&
        (target.aggregate !== unit.aggregate ||
            target.ownerPath !== unit.ownerPath)
    ) {
        const kindFolder =
            unit.kind === 'entity' ? 'entities' : 'value-objects';
        const indexFile = new File(
            path.join(
                target.ownerPath,
                'domain/aggregates',
                target.aggregate,
                'index.ts'
            )
        );
        indexFile.addLineIfMissing(
            `export * from './${kindFolder}/${target.name}.${unit.kind}'`
        );
        if (!plan.updated.includes(indexFile.path)) {
            plan.updated.push(indexFile.path);
        }
    }

    return plan;
};

const projectRelative = (fromFile: string, toFile: string) => {
    const relative = toPosix(
        path.relative(path.dirname(fromFile), toFile.replace(codeExtension, ''))
    );
    return relative.startsWith('.') ? relative : `./${relative}`;
};
