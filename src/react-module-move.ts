import fs from 'node:fs';
import path from 'node:path';
import { File } from './file-system';
import {
    codeExtension,
    escapeRegExp,
    type MovePlan,
    projectImports,
    stageModuleMove,
    toPosix,
    walk
} from './module-move';
import { NestedName } from './nested-name';

export type { MovePlan } from './module-move';

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

/** A Next.js App Router route folder moved with a page. */
export type RouteMove = {
    /** The App Router folder, e.g. `<root>/app`. */
    appFolder: string;
    from: string;
    to: string;
};

/** The route folder of a nested page name: `admin/users` → `<app>/admin/users`. */
export const routeFolder = (appFolder: string, rawName: string) => {
    const { folders, folderName } = new NestedName(rawName);
    return path.join(appFolder, ...folders, folderName);
};

/**
 * The files of a route segment itself: `page.tsx`, `layout.tsx` and the
 * like. Subfolders are other routes and stay.
 */
export const routeFiles = (folder: string) =>
    fs.existsSync(folder)
        ? fs
              .readdirSync(folder, { withFileTypes: true })
              .filter((entry) => entry.isFile())
              .map((entry) => path.join(folder, entry.name))
        : [];

/**
 * Stages the move with pending changes: files of the module, its imports
 * of other files, and every import of it in the project. With `route`, the
 * files of that Next.js route folder move too.
 */
export const moveReactModule = (
    projectRoot: string,
    reactFolder: string,
    module: ReactModule,
    rawName: string,
    route?: RouteMove
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
    const routeFileSet = new Set(route ? routeFiles(route.from) : []);
    const routeTarget = (candidate: string) => {
        if (!route) return undefined;
        const file = [...routeFileSet].find(
            (x) => x === candidate || x.replace(codeExtension, '') === candidate
        );
        if (!file) return undefined;
        const moved = path.join(route.to, path.relative(route.from, file));
        return file === candidate ? moved : moved.replace(codeExtension, '');
    };
    /** Where a path of the module goes; undefined for other paths. */
    const movedPath = (candidate: string) => {
        const routed = routeTarget(candidate);
        if (routed) return routed;
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
        [...moduleFiles, ...routeFileSet].map(
            (file) => [file, movedPath(file) ?? file] as const
        )
    );

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

    return stageModuleMove({
        projectRoot,
        stopAt: reactFolder,
        stopAtFor: (file) =>
            route && routeFileSet.has(file) ? route.appFolder : undefined,
        moves,
        movedPath,
        rename: (content, { moved }) => {
            const renamed = content.replace(
                classPattern,
                (_, use = '') => `${use}${newClassName}`
            );
            return moved && module.kind === 'widget'
                ? renamed.replace(
                      titlePattern,
                      (_, quote) => `${quote}${newTitle}${quote}`
                  )
                : renamed;
        }
    });
};

/**
 * The route folder of a page with Next.js: `<app>/<name>/` when its
 * `page.tsx` renders the page. Undefined for other routes or none.
 */
export const pageRouteFolder = (appFolder: string, page: ReactModule) => {
    const folder = routeFolder(appFolder, page.name);
    const routePage = path.join(folder, 'page.tsx');
    return fs.existsSync(routePage) &&
        new RegExp(`(?<![\\w$])${page.ClassName}Page(?![\\w$])`).test(
            fs.readFileSync(routePage, 'utf8')
        )
        ? folder
        : undefined;
};

/** The files of a page (it and its same-named companions) or a widget. */
const reactModuleFiles = (module: ReactModule) => {
    if (module.kind === 'widget') return walk(module.path);
    const folder = path.dirname(module.path);
    const own = new RegExp(`^${escapeRegExp(module.fileBase)}-page(?:\\.|$)`);
    return fs
        .readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isFile() && own.test(entry.name))
        .map((entry) => path.join(folder, entry.name));
};

export type ReactDeleteResult =
    | {
          /** Files outside the module that still import it: [file, import]. */
          usedBy: [string, string][];
      }
    | { deleted: string[]; usedBy?: undefined };

const importSpecifier =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g;

/**
 * Stages the deletion of a page or widget with its files, and with `route`
 * the files of that Next.js route folder too. Nothing is staged while other
 * files still import the module; those imports are returned instead.
 */
export const deleteReactModule = (
    projectRoot: string,
    reactFolder: string,
    module: ReactModule,
    route?: { appFolder: string; folder: string }
): ReactDeleteResult => {
    const moduleFiles = reactModuleFiles(module);
    const routeFileList = route ? routeFiles(route.folder) : [];
    const own = new Set([...moduleFiles, ...routeFileList]);
    const stems = new Set(
        moduleFiles.map((file) => file.replace(codeExtension, ''))
    );
    const isModule = (resolved: string) =>
        stems.has(resolved) ||
        (module.kind === 'widget' &&
            (resolved === module.path ||
                resolved.startsWith(`${module.path}${path.sep}`)));

    const { codeFiles, resolve } = projectImports(projectRoot);
    const relative = (file: string) =>
        toPosix(path.relative(projectRoot, file));
    const usedBy: [string, string][] = [];
    for (const [file, content] of codeFiles) {
        if (own.has(file)) continue;
        for (const [, , specifier] of content.matchAll(importSpecifier)) {
            const target = resolve(specifier, file)?.resolved;
            if (target && isModule(target))
                usedBy.push([relative(file), relative(target)]);
        }
    }
    if (usedBy.length) return { usedBy };

    for (const file of moduleFiles) new File(file).delete(reactFolder);
    for (const file of routeFileList)
        new File(file).delete((route as { appFolder: string }).appFolder);
    return { deleted: [...moduleFiles, ...routeFileList] };
};
