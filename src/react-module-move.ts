import fs from 'node:fs';
import path from 'node:path';
import { File } from './file-system';
import { NestedName } from './nested-name';

export type ReactModuleKind = 'page' | 'widget';

export type ReactModule = {
    kind: ReactModuleKind;
    /** Nested name, e.g. `admin/users`. */
    name: string;
    /** The page file or the widget folder. */
    path: string;
    /** The name part of file names, e.g. `admin-users` in `admin-users-page.tsx`. */
    fileBase: string;
    ClassName: string;
};

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

const codeExtension = /\.(?:tsx?|mts|cts|jsx?|mjs|cjs|mdx)$/;

const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const walk = (folder: string): string[] => {
    if (!fs.existsSync(folder)) return [];
    return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(folder, entry.name);
        if (entry.isDirectory()) {
            return ignoredFolders.has(entry.name) ? [] : walk(entryPath);
        }
        return entry.isFile() ? [entryPath] : [];
    });
};

const toPosix = (value: string) => value.split(path.sep).join('/');

/**
 * Files made before names used the whole path (`admin/users-page.tsx`)
 * and after (`admin/admin-users-page.tsx`) give the same nested name.
 */
const nestedName = (folders: string[], fileBase: string) => {
    const prefix = `${folders.join('-')}-`;
    const last =
        folders.length && fileBase.startsWith(prefix)
            ? fileBase.slice(prefix.length)
            : fileBase;
    return [...folders, last].join('/');
};

const declaredClassName = (filePath: string, suffix: string, name: string) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const declared = content.match(
        new RegExp(`export\\s+(?:const|function)\\s+(\\w+)${suffix}\\b`)
    )?.[1];
    return declared ?? new NestedName(name).ClassName;
};

export const findReactModules = (
    reactFolder: string,
    kind: ReactModuleKind
): ReactModule[] => {
    const modules =
        kind === 'page'
            ? walk(path.join(reactFolder, 'pages'))
                  .filter((file) => file.endsWith('-page.tsx'))
                  .map((file) => {
                      const folders = path
                          .relative(
                              path.join(reactFolder, 'pages'),
                              path.dirname(file)
                          )
                          .split(path.sep)
                          .filter((segment) => !!segment);
                      const fileBase = path.basename(file, '-page.tsx');
                      const name = nestedName(folders, fileBase);
                      return {
                          kind,
                          name,
                          path: file,
                          fileBase,
                          ClassName: declaredClassName(file, 'Page', name)
                      };
                  })
            : walk(path.join(reactFolder, 'widgets'))
                  .filter((file) => file.endsWith('-widget.tsx'))
                  .map((file) => {
                      const folder = path.dirname(file);
                      const name = toPosix(
                          path.relative(
                              path.join(reactFolder, 'widgets'),
                              folder
                          )
                      );
                      return {
                          kind,
                          name,
                          path: folder,
                          fileBase: path.basename(file, '-widget.tsx'),
                          ClassName: declaredClassName(file, 'Widget', name)
                      };
                  });
    return modules.sort((a, b) => a.name.localeCompare(b.name));
};

const targetPath = (
    reactFolder: string,
    module: ReactModule,
    rawName: string
) => {
    const { folders, folderName, fileName } = new NestedName(rawName);
    return module.kind === 'page'
        ? path.join(reactFolder, 'pages', ...folders, `${fileName}-page.tsx`)
        : path.join(reactFolder, 'widgets', ...folders, folderName);
};

export const validateMove = (
    reactFolder: string,
    module: ReactModule,
    rawName: string
) => {
    const nameError = NestedName.validate(rawName);
    if (nameError !== true) return nameError;

    const target = targetPath(reactFolder, module, rawName);
    if (target !== module.path && fs.existsSync(target)) {
        return `${path.relative(reactFolder, target)} already exists`;
    }
    if (target.startsWith(`${module.path}${path.sep}`)) {
        return 'A widget cannot be moved into itself';
    }
    return true;
};

type TsconfigAlias = { prefix: string; target: string };

const stripJsonComments = (source: string) =>
    source
        .replace(
            /("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
            (_, text) => (text ? text : '')
        )
        .replace(/,(\s*[}\]])/g, '$1');

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

export type MovePlan = {
    /** Old path → new path of every file of the module. */
    moves: [string, string][];
    /** Other files with references to the module. */
    updated: string[];
};

/**
 * Stages the move with pending changes: files of the module, its imports
 * of other files, and every import of it in the project.
 */
export const moveReactModule = (
    projectRoot: string,
    reactFolder: string,
    module: ReactModule,
    rawName: string
): MovePlan => {
    const newName = new NestedName(rawName);
    const target = targetPath(reactFolder, module, rawName);
    const newClassName = newName.ClassName;
    const renameFile = (name: string) =>
        name.replace(
            new RegExp(`^(use-)?${escapeRegExp(module.fileBase)}(?=[-.])`),
            (_, use = '') => `${use}${newName.fileName}`
        );

    const oldFolder =
        module.kind === 'page' ? path.dirname(module.path) : module.path;
    const newFolder = module.kind === 'page' ? path.dirname(target) : target;
    const ownsPath = (candidate: string) =>
        module.kind === 'page'
            ? path.dirname(candidate) === oldFolder &&
              new RegExp(
                  `^${escapeRegExp(module.fileBase)}-page(?:\\.|$)`
              ).test(path.basename(candidate))
            : candidate === oldFolder ||
              candidate.startsWith(`${oldFolder}${path.sep}`);
    /** Where a path of the module goes; undefined for other paths. */
    const movedPath = (candidate: string) => {
        if (!ownsPath(candidate)) return undefined;
        // Only file names carry the module name; widget subfolders keep theirs
        const segments = path.relative(oldFolder, candidate).split(path.sep);
        const last = segments.length - 1;
        segments[last] = renameFile(segments[last]);
        return path.join(newFolder, ...segments);
    };

    const moduleFiles =
        module.kind === 'page'
            ? fs
                  .readdirSync(oldFolder)
                  .map((name) => path.join(oldFolder, name))
                  .filter(
                      (file) => fs.statSync(file).isFile() && ownsPath(file)
                  )
            : walk(oldFolder);
    const moves = new Map(
        moduleFiles.map((file) => [file, movedPath(file) ?? file] as const)
    );

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

    const suffixes = module.kind === 'page' ? 'Page' : 'Widget|UIModel';
    const classPattern = new RegExp(
        `(?<![\\w$])(use)?${escapeRegExp(module.ClassName)}(?=${suffixes})`,
        'g'
    );
    const oldTitle = `Widgets/${module.name
        .split('/')
        .map((segment) => new NestedName(segment).ClassName)
        .join('/')}`;
    const titlePattern = new RegExp(
        `(['"\`])${escapeRegExp(oldTitle)}\\1`,
        'g'
    );
    const newTitle = ['Widgets', ...newName.classNameSegments].join('/');

    const codeFiles = new Map(
        walk(projectRoot)
            .filter((file) => codeExtension.test(file))
            .map((file) => [file, fs.readFileSync(file, 'utf8')] as const)
    );

    /**
     * Files re-exporting the module, directly or through each other: their
     * importers get the module's classes, so they are renamed there too.
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
        if (!referencesModule && !moves.has(oldFile)) return content;
        const renamed = rewritten.replace(
            classPattern,
            (_, use = '') => `${use}${newClassName}`
        );
        return moves.has(oldFile) && module.kind === 'widget'
            ? renamed.replace(
                  titlePattern,
                  (_, quote) => `${quote}${newTitle}${quote}`
              )
            : renamed;
    };

    for (const [file, newFile] of moves) {
        if (!codeFiles.has(file) && newFile !== file) {
            new File(file).moveTo(newFile, reactFolder);
        }
    }

    const updated: string[] = [];
    for (const [file, content] of codeFiles) {
        const newFile = moves.get(file);
        const next = rewrite(content, file, newFile ?? file);
        if (newFile && newFile !== file) {
            new File(newFile).data = next;
            new File(file).delete(reactFolder);
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
