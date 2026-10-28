import fs from 'node:fs';
import path from 'node:path';
import { File } from './file-system';
import { stripJsonComments } from './tsconfig';

const ignoredFolders = new Set([
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    'out',
    'coverage',
    'storybook-static'
]);

export const codeExtension = /\.(?:tsx?|mts|cts|jsx?|mjs|cjs|mdx)$/;

export const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const walk = (folder: string): string[] => {
    if (!fs.existsSync(folder)) return [];
    return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(folder, entry.name);
        if (entry.isDirectory()) {
            return ignoredFolders.has(entry.name) ? [] : walk(entryPath);
        }
        return entry.isFile() ? [entryPath] : [];
    });
};

export const toPosix = (value: string) => value.split(path.sep).join('/');

type TsconfigAlias = { prefix: string; target: string };

/**
 * Wildcard `paths` of the root tsconfig, e.g. `@/*` → `./*`.
 */
const readAliases = (projectRoot: string): TsconfigAlias[] => {
    const tsconfig = path.join(projectRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfig)) return [];
    try {
        const { compilerOptions = {} } = JSON.parse(
            stripJsonComments(fs.readFileSync(tsconfig, 'utf8'))
        );
        const base = path.resolve(projectRoot, compilerOptions.baseUrl ?? '.');
        return Object.entries(
            (compilerOptions.paths ?? {}) as Record<string, string[]>
        )
            .filter(
                ([pattern, targets]) =>
                    pattern.endsWith('*') && targets[0]?.endsWith('*')
            )
            .map(([pattern, [target]]) => ({
                prefix: pattern.slice(0, -1),
                target: path.resolve(base, target.slice(0, -1))
            }));
    } catch {
        return [];
    }
};

const specifierPattern =
    /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\bmock\s*\(\s*)(['"])([^'"\n]+)\2/g;

const reExportPattern =
    /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(['"])([^'"\n]+)\1/g;

/** Paths an import may use for the file: without extension, and its folder for `index`. */
const importPaths = (file: string) => {
    const withoutExtension = file.replace(codeExtension, '');
    return path.basename(withoutExtension) === 'index'
        ? [withoutExtension, path.dirname(withoutExtension)]
        : [withoutExtension];
};

/**
 * Code files of the project and how their import specifiers resolve:
 * relative paths and wildcard tsconfig aliases. Package imports resolve
 * to nothing.
 */
export const projectImports = (projectRoot: string) => {
    const aliases = readAliases(projectRoot);
    const resolve = (specifier: string, fromFile: string) => {
        if (specifier.startsWith('.')) {
            return {
                resolved: path.resolve(path.dirname(fromFile), specifier),
                alias: undefined
            };
        }
        const alias = aliases.find(({ prefix }) =>
            specifier.startsWith(prefix)
        );
        return alias
            ? {
                  resolved: path.resolve(
                      alias.target,
                      specifier.slice(alias.prefix.length)
                  ),
                  alias
              }
            : undefined;
    };
    const specifierFor = (
        fromFile: string,
        toPath: string,
        alias: TsconfigAlias | undefined
    ) => {
        const aliased = alias && toPosix(path.relative(alias.target, toPath));
        if (aliased && !aliased.startsWith('..')) {
            return `${alias.prefix}${aliased}`;
        }
        const relative = toPosix(path.relative(path.dirname(fromFile), toPath));
        return relative.startsWith('.') ? relative : `./${relative}`;
    };
    const codeFiles = new Map(
        walk(projectRoot)
            .filter((file) => codeExtension.test(file))
            .map((file) => [file, fs.readFileSync(file, 'utf8')] as const)
    );
    /** Resolved paths (without extension, or folders) a file imports. */
    const importsOf = (file: string) =>
        [...(codeFiles.get(file) ?? '').matchAll(specifierPattern)]
            .map(([, , , specifier]) => resolve(specifier, file)?.resolved)
            .filter((resolved): resolved is string => !!resolved);
    return { resolve, specifierFor, codeFiles, importsOf };
};

export type MovePlan = {
    /** Old path → new path of every file of the module. */
    moves: [string, string][];
    /** Other files with references to the module. */
    updated: string[];
};

export type ModuleMove = {
    projectRoot: string;
    /** Folders emptied by the move are removed up to this one (exclusive). */
    stopAt: string;
    /** Old path → new path of every file of the module. */
    moves: Map<string, string>;
    /**
     * Where a path of the module goes, for import resolution: files with or
     * without extension, and folders. Undefined for other paths.
     */
    movedPath: (candidate: string) => string | undefined;
    /**
     * Renames the module's names in a file of the module or in a file that
     * references it, directly or through a barrel.
     */
    rename: (content: string, file: { moved: boolean }) => string;
    /** A change every code file gets, references or not. */
    everyFile?: (content: string) => string;
};

/**
 * Stages the move with pending changes: files of the module, its imports
 * of other files, and every import of it in the project.
 */
export const stageModuleMove = ({
    projectRoot,
    stopAt,
    moves,
    movedPath,
    rename,
    everyFile = (content) => content
}: ModuleMove): MovePlan => {
    const { resolve, specifierFor, codeFiles } = projectImports(projectRoot);

    /**
     * Files re-exporting the module, directly or through each other: their
     * importers get the module's names, so they are renamed there too.
     */
    const barrels = new Set<string>();
    const isBarrel = (resolved: string) =>
        barrels.has(resolved.replace(codeExtension, ''));
    for (let found = true; found; ) {
        found = false;
        for (const [file, content] of codeFiles) {
            if (moves.has(file) || isBarrel(file)) continue;
            const reExportsModule = [...content.matchAll(reExportPattern)].some(
                ([, , specifier]) => {
                    const resolution = resolve(specifier, file);
                    return (
                        !!resolution &&
                        (!!movedPath(resolution.resolved) ||
                            isBarrel(resolution.resolved))
                    );
                }
            );
            if (reExportsModule) {
                for (const importPath of importPaths(file)) {
                    barrels.add(importPath);
                }
                found = true;
            }
        }
    }

    const rewrite = (content: string, oldFile: string, newFile: string) => {
        let referencesModule = false;
        const rewritten = content.replace(
            specifierPattern,
            (match, keyword, quote, specifier) => {
                const resolution = resolve(specifier, oldFile);
                if (!resolution) return match;
                const moved = movedPath(resolution.resolved);
                if (moved || isBarrel(resolution.resolved)) {
                    referencesModule = true;
                }
                if (!moved && oldFile === newFile) return match;
                const next = specifierFor(
                    newFile,
                    moved ?? resolution.resolved,
                    resolution.alias
                );
                return `${keyword}${quote}${next}${quote}`;
            }
        );
        const changed = everyFile(rewritten);
        if (!referencesModule && !moves.has(oldFile)) return changed;
        return rename(changed, { moved: moves.has(oldFile) });
    };

    for (const [file, newFile] of moves) {
        if (!codeFiles.has(file) && newFile !== file) {
            new File(file).moveTo(newFile, stopAt);
        }
    }

    const updated: string[] = [];
    for (const [file, content] of codeFiles) {
        const newFile = moves.get(file);
        const next = rewrite(content, file, newFile ?? file);
        if (newFile && newFile !== file) {
            new File(newFile).data = next;
            new File(file).delete(stopAt);
        } else if (next !== content) {
            new File(file).update(next);
            if (!newFile) updated.push(file);
        }
    }

    return {
        moves: [...moves].filter(([from, to]) => from !== to),
        updated
    };
};
