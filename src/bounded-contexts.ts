import fs from 'node:fs';
import path from 'node:path';
import { NestedName } from './nested-name';

export const boundedContextsFolderName = 'bounded-contexts';

/**
 * Folders right in a bounded context. A context name can't use them as a
 * segment: they tell a context from a folder grouping contexts.
 */
export const contextLayerFolders = [
    'domain',
    'application',
    'infrastructure',
    'presentation',
    'wiring'
];

const subfolders = (folder: string) =>
    fs.existsSync(folder)
        ? fs
              .readdirSync(folder, { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name)
        : [];

/**
 * A bounded context has a layer folder or no folders yet; any other
 * folder groups contexts, like the folders of React pages and widgets.
 */
export const isBoundedContextFolder = (folder: string) => {
    const names = subfolders(folder);
    return (
        !names.length ||
        names.some((name) => contextLayerFolders.includes(name))
    );
};

/**
 * Names of the bounded contexts in `<rootFolder>/bounded-contexts`,
 * nested ones as paths (`sales/orders`), sorted.
 */
export const boundedContextNames = (contextsFolder: string): string[] => {
    const walk = (folder: string, prefix: string[]): string[] =>
        subfolders(folder).flatMap((name) => {
            const child = path.join(folder, name);
            return isBoundedContextFolder(child)
                ? [[...prefix, name].join('/')]
                : walk(child, [...prefix, name]);
        });
    return walk(contextsFolder, []).sort();
};

export const boundedContextPath = (contextsFolder: string, name: string) =>
    path.join(contextsFolder, ...name.split('/'));

/** `sales/orders` → `SalesOrders`, for names shared across contexts. */
export const contextClassName = (name: string) =>
    new NestedName(name).ClassName;

/**
 * The context of the path segments below `bounded-contexts`: up to the
 * first layer folder. Without one, the first segment, as before nesting.
 */
export const splitContextSegments = (segments: string[]) => {
    const layer = segments.findIndex((segment) =>
        contextLayerFolders.includes(segment)
    );
    const length = layer > 0 ? layer : 1;
    return {
        name: segments.slice(0, length).join('/'),
        segments: segments.slice(length)
    };
};

/**
 * Where a context of the given name could be created: names are checked
 * like page names, segments can't be layer folders, and a context can't
 * hold or be part of another context.
 */
export const validateBoundedContextName = (
    contextsFolder: string,
    name: string
) => {
    const valid = NestedName.validate(name);
    if (valid !== true) return valid;
    const segments = name
        .split(/[\\/]/)
        .map((segment) => segment.trim())
        .filter((segment) => !!segment);
    const reserved = segments.find((segment) =>
        contextLayerFolders.includes(segment)
    );
    if (reserved)
        return `"${reserved}" is a layer folder of a bounded context and can't name one`;
    for (let index = 1; index < segments.length; index++) {
        const parent = path.join(contextsFolder, ...segments.slice(0, index));
        if (fs.existsSync(parent) && isBoundedContextFolder(parent))
            return `${segments.slice(0, index).join('/')} is a bounded context: contexts can't be nested in one`;
    }
    const folder = path.join(contextsFolder, ...segments);
    if (fs.existsSync(folder) && !isBoundedContextFolder(folder))
        return `${segments.join('/')} groups bounded contexts: pick a name inside it`;
    return true;
};
