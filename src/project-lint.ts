import fs from 'node:fs';
import path from 'node:path';
import { compilerOption } from './tsconfig';
import {
    canDependOn,
    findWiredModules,
    type WiredModule,
    wiredDependencyNames
} from './wiring';

export type Violation = {
    /**
     * The broken rule, as printed above its violations.
     */
    rule: string;
    file: string;
    line: number;
    text: string;
};

type Import = {
    typeOnly: boolean;
    /**
     * Absolute path without extension, or undefined for a package.
     */
    target: string | undefined;
    line: number;
    statement: string;
};

type Alias = { prefix: string; wildcard: boolean; target: string };

/**
 * Wildcard and exact `paths` of the root tsconfig, longest first.
 */
const readAliases = (projectRoot: string): Alias[] => {
    const tsconfig = path.join(projectRoot, 'tsconfig.json');
    const paths = compilerOption(tsconfig, 'paths');
    if (!paths || typeof paths !== 'object') {
        return [];
    }
    const baseUrl = compilerOption(tsconfig, 'baseUrl');
    const base = path.resolve(
        projectRoot,
        typeof baseUrl === 'string' ? baseUrl : '.'
    );
    return Object.entries(paths as Record<string, string[]>)
        .filter(([, targets]) => targets.length)
        .map(([key, [target]]) => {
            const wildcard = key.endsWith('*');
            return {
                prefix: wildcard ? key.slice(0, -1) : key,
                wildcard,
                target: path.resolve(
                    base,
                    wildcard ? target.replace(/\*$/, '') : target
                )
            };
        })
        .sort((a, b) => b.prefix.length - a.prefix.length);
};

const resolveSpecifier = (
    specifier: string,
    fromFile: string,
    aliases: Alias[]
) => {
    if (specifier.startsWith('.')) {
        return path.resolve(path.dirname(fromFile), specifier);
    }
    for (const { prefix, wildcard, target } of aliases) {
        if (wildcard ? specifier.startsWith(prefix) : specifier === prefix) {
            return path.join(
                target,
                wildcard ? specifier.slice(prefix.length) : ''
            );
        }
    }
    return undefined;
};

/**
 * Path segments of `file` inside `folder`, or undefined outside it.
 */
const inside = (folder: string, file: string) => {
    const relativePath = path.relative(folder, file);
    return relativePath &&
        !relativePath.startsWith('..') &&
        !path.isAbsolute(relativePath)
        ? relativePath.split(path.sep)
        : undefined;
};

const sourceFiles = (folder: string): string[] => {
    if (!fs.existsSync(folder)) {
        return [];
    }
    return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(folder, entry.name);
        if (entry.isDirectory()) {
            return entry.name === 'node_modules' ? [] : sourceFiles(entryPath);
        }
        return /\.(c|m)?tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')
            ? [entryPath]
            : [];
    });
};

/**
 * `import … from`, `export … from`, side-effect `import '…'`,
 * `import('…')` and `require('…')`, scanned left to right in one
 * alternation, so a match never spans two statements.
 */
const importPattern =
    /\b(?:(import|export)\s+(type\s+)?(?:(?!\b(?:import|export)\b)[\w*{}\s,$])*?\s*from\s*|import\s*\(\s*|require\s*\(\s*|import\s*)(['"])([^'"\n]+)\3/g;

const lineAt = (source: string, index: number) =>
    source.slice(0, index).split('\n').length;

const importsOf = (source: string, file: string, aliases: Alias[]) =>
    [...source.matchAll(importPattern)].map(
        (match): Import => ({
            typeOnly: match[1] === 'import' && Boolean(match[2]),
            target: resolveSpecifier(match[4], file, aliases),
            line: lineAt(source, match.index),
            statement: match[0].replace(/\s+/g, ' ')
        })
    );

const isSpec = (file: string) => /\.(spec|test)\.(c|m)?tsx?$/.test(file);

/**
 * Where a file of a context or the Shared Layer lives: `domain`,
 * `application`, …, then the folders below.
 */
type Location = { owner: string; segments: string[] };

/**
 * The layers below may import only these targets of a context or the
 * Shared Layer. Wiring and specs know everything.
 */
const layerImportRules: Record<
    string,
    { allows: (target: string[]) => boolean; rule: string }
> = {
    domain: {
        allows: ([layer]) => layer === 'domain',
        rule: 'domain imports outside the domain layer:'
    },
    application: {
        allows: ([layer]) => layer === 'domain' || layer === 'application',
        rule: 'application imports outside domain and application:'
    },
    infrastructure: {
        allows: ([layer, part, mode]) =>
            layer === 'domain' ||
            layer === 'infrastructure' ||
            (layer === 'application' &&
                (part === 'ports' ||
                    ((part === 'commands' || part === 'queries') &&
                        mode === 'execution'))),
        rule: 'infrastructure imports outside domain, infrastructure, application ports and execution contracts:'
    },
    presentation: {
        allows: ([layer]) => layer !== 'infrastructure',
        rule: 'presentation imports infrastructure (only wiring knows concrete classes):'
    }
};

const isKindFile = (segments: string[] | undefined, kind: string) =>
    Boolean(
        segments &&
            ['application', 'infrastructure', 'wiring'].includes(segments[0]) &&
            segments[1] === kind
    );

/**
 * Checks imports: bounded context isolation, layers, React modules, and
 * queries that use commands.
 */
const importViolations = (projectRoot: string, rootFolder: string) => {
    const root = path.resolve(projectRoot, rootFolder);
    const contextsFolder = path.join(root, 'bounded-contexts');
    const sharedFolder = path.join(root, 'shared');
    const reactFolder = path.join(root, 'presentation', 'react');
    const uiKitFolder = path.join(reactFolder, 'ui-kit');
    const widgetsFolder = path.join(reactFolder, 'widgets');
    const hooksFolder = path.join(reactFolder, 'hooks');
    const inMemoryDbFile = path.join(
        sharedFolder,
        'infrastructure',
        'services',
        'in-memory-db-infrastructure-service.ts'
    );
    const aliases = readAliases(projectRoot);
    const violations: Violation[] = [];

    const locate = (file: string): Location | undefined => {
        const inContext = inside(contextsFolder, file);
        if (inContext && inContext.length > 1) {
            const [owner, ...segments] = inContext;
            return { owner, segments };
        }
        const inShared = inside(sharedFolder, file);
        return inShared && { owner: 'shared', segments: inShared };
    };

    /**
     * Aggregate roots, entities and value objects, not repository
     * contracts.
     */
    const isDomainModel = ([layer, part]: string[], target: string) =>
        layer === 'domain' &&
        ['aggregates', 'entities', 'value-objects'].includes(part) &&
        !/-repository(\.tsx?)?$/.test(path.basename(target));

    const widgetFolders = new Map<string, boolean>();
    const isWidgetFolder = (folder: string) => {
        if (!widgetFolders.has(folder)) {
            widgetFolders.set(
                folder,
                fs.existsSync(folder) &&
                    fs.statSync(folder).isDirectory() &&
                    fs
                        .readdirSync(folder)
                        .some((name) => name.endsWith('-widget.tsx'))
            );
        }
        return widgetFolders.get(folder);
    };
    /**
     * The nearest folder under widgets/ with a `*-widget.tsx`.
     */
    const widgetOf = (file: string) => {
        for (
            let folder = file;
            inside(widgetsFolder, folder);
            folder = path.dirname(folder)
        ) {
            if (isWidgetFolder(folder)) {
                return folder;
            }
        }
        return undefined;
    };

    const files = [contextsFolder, sharedFolder, reactFolder].flatMap(
        sourceFiles
    );

    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        const from = locate(file);
        const ownContext = inside(contextsFolder, file)?.[0];
        const report = (rule: string, imported: Import) =>
            violations.push({
                rule,
                file,
                line: imported.line,
                text: imported.statement
            });

        for (const imported of importsOf(source, file, aliases)) {
            const target = imported.target;
            if (!target) {
                continue;
            }
            const to = locate(target);
            const targetContext = inside(contextsFolder, target)?.[0];

            if (ownContext) {
                if (targetContext && targetContext !== ownContext) {
                    report(
                        `[${ownContext}] imports another context:`,
                        imported
                    );
                }
            } else if (inside(sharedFolder, file)) {
                const allowed =
                    !to ||
                    to.owner === 'shared' ||
                    (to.segments[0] === 'domain' &&
                        to.segments[1] === 'errors') ||
                    (file === inMemoryDbFile &&
                        isDomainModel(to.segments, target));
                if (!allowed) {
                    report(
                        '[shared] imports a bounded context outside its domain/errors (and domain models for the in-memory DB):',
                        imported
                    );
                }
            } else if (inside(uiKitFolder, file) || inside(hooksFolder, file)) {
                const [area] = inside(reactFolder, target) ?? [];
                const forbidden = inside(uiKitFolder, file)
                    ? ['widgets', 'pages']
                    : ['ui-kit', 'widgets', 'pages'];
                if (targetContext || forbidden.includes(area)) {
                    report(
                        inside(uiKitFolder, file)
                            ? '[presentation/react/ui-kit] imports a bounded context, widget or page:'
                            : '[presentation/react/hooks] a shared hook imports a bounded context, UI-kit, widget or page:',
                        imported
                    );
                }
            } else if (
                targetContext &&
                !(
                    imported.typeOnly &&
                    to?.segments[0] === 'presentation' &&
                    to.segments[1] === 'rest'
                )
            ) {
                report(
                    '[presentation/react] imports a context other than `import type` from presentation/rest:',
                    imported
                );
            }

            const ownWidget = widgetOf(file);
            const targetWidget = widgetOf(target);
            if (ownWidget && targetWidget && targetWidget !== ownWidget) {
                report(
                    '[presentation/react/widgets] a widget imports another widget:',
                    imported
                );
            }

            if (!from || !to) {
                continue;
            }
            if (
                to.owner === from.owner &&
                isKindFile(from.segments, 'queries') &&
                isKindFile(to.segments, 'commands')
            ) {
                report(
                    `[${from.owner}] a query imports a command (queries only read):`,
                    imported
                );
            }
            const layerRule = layerImportRules[from.segments[0]];
            if (layerRule && !isSpec(file) && !layerRule.allows(to.segments)) {
                report(`[${from.owner}] ${layerRule.rule}`, imported);
            }
        }
    }
    return violations;
};

/**
 * Checks each wired dependency against the rules the CLI offers
 * dependencies by.
 */
const wiringViolations = (projectRoot: string, rootFolder: string) => {
    const root = path.resolve(projectRoot, rootFolder);
    const sharedFolder = path.join(root, 'shared');
    const contextsFolder = path.join(root, 'bounded-contexts');
    const sharedModules = findWiredModules(sharedFolder);
    const owners = [
        { name: 'shared', modules: sharedModules },
        ...(fs.existsSync(contextsFolder)
            ? fs
                  .readdirSync(contextsFolder, { withFileTypes: true })
                  .filter((entry) => entry.isDirectory())
                  .map((entry) => ({
                      name: entry.name,
                      modules: findWiredModules(
                          path.join(contextsFolder, entry.name)
                      )
                  }))
            : [])
    ];
    const violations: Violation[] = [];

    for (const { name, modules } of owners) {
        const visible = new Map<string, WiredModule>(
            [...sharedModules, ...modules].map((x) => [x.wireName, x])
        );
        for (const consumer of modules) {
            const source = fs.readFileSync(consumer.wireFile, 'utf8');
            for (const implementation of consumer.implementations) {
                let dependencies: string[];
                try {
                    dependencies = wiredDependencyNames(
                        source,
                        implementation.className
                    );
                } catch {
                    continue;
                }
                const listStart = source.search(
                    new RegExp(`wireClass\\(\\s*${implementation.className}\\b`)
                );
                for (const dependency of dependencies) {
                    const candidate = visible.get(dependency);
                    if (!candidate || canDependOn(consumer, candidate)) {
                        continue;
                    }
                    const index = source.indexOf(dependency, listStart);
                    violations.push({
                        rule: `[${name}] wiring: a dependency the CLI never offers (layer or kind rules):`,
                        file: consumer.wireFile,
                        line: lineAt(source, index),
                        text: `${implementation.className} ← ${candidate.typeName} (${candidate.kind})`
                    });
                }
            }
        }
    }
    return violations;
};

/**
 * Domain and application code reads time through the clock port.
 */
const clockViolations = (projectRoot: string, rootFolder: string) => {
    const root = path.resolve(projectRoot, rootFolder);
    const folders = [
        path.join(root, 'shared'),
        ...(fs.existsSync(path.join(root, 'bounded-contexts'))
            ? fs
                  .readdirSync(path.join(root, 'bounded-contexts'))
                  .map((name) => path.join(root, 'bounded-contexts', name))
            : [])
    ].flatMap((folder) => [
        path.join(folder, 'domain'),
        path.join(folder, 'application')
    ]);

    return folders
        .flatMap(sourceFiles)
        .filter((file) => !isSpec(file))
        .flatMap((file) => {
            const source = fs.readFileSync(file, 'utf8');
            return [
                ...source.matchAll(/\bnew\s+Date\s*\(\s*\)|\bDate\.now\s*\(/g)
            ].map(
                (match): Violation => ({
                    rule: 'domain or application reads the current time directly (use the clock port):',
                    file,
                    line: lineAt(source, match.index),
                    text: match[0]
                })
            );
        });
};

export const lintProject = (projectRoot: string, rootFolder: string) => [
    ...importViolations(projectRoot, rootFolder),
    ...wiringViolations(projectRoot, rootFolder),
    ...clockViolations(projectRoot, rootFolder)
];

/**
 * Violations grouped under their rules, with paths from the project root.
 */
export const formatViolations = (
    violations: Violation[],
    projectRoot: string
) => {
    const groups = new Map<string, string[]>();
    for (const { rule, file, line, text } of violations) {
        groups.set(rule, [
            ...(groups.get(rule) ?? []),
            `  ${path.relative(projectRoot, file)}:${line}: ${text}`
        ]);
    }
    return [...groups]
        .map(([rule, lines]) => [rule, ...lines].join('\n'))
        .join('\n\n');
};
