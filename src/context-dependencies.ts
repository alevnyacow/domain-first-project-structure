import path from 'node:path';
import {
    boundedContextNames,
    boundedContextsFolderName,
    splitContextSegments
} from './bounded-contexts';

export const crossContextImplementation = 'cross-context';

/**
 * Whether another bounded context exists anywhere under `bounded-contexts`,
 * nested ones included.
 */
export const hasNeighboringBoundedContext = (ownerPath: string) => {
    const location = boundedContextLocation(path.join(ownerPath, 'domain'));
    if (!location) return false;
    const contextsPath = path.join(location.root, boundedContextsFolderName);
    return boundedContextNames(contextsPath).some(
        (name) => name !== location.name
    );
};

/**
 * A file inside a bounded context, including its project source root.
 * A nested context is named by its path, e.g. `sales/orders`.
 */
export const boundedContextLocation = (file: string) => {
    const parts = path.resolve(file).split(path.sep);
    const index = parts.lastIndexOf(boundedContextsFolderName);
    if (index === -1 || parts.length < index + 3) return undefined;
    return {
        root: parts.slice(0, index).join(path.sep),
        ...splitContextSegments(parts.slice(index + 1))
    };
};

/**
 * The name of the context in the folder (`sales/orders` when nested), or
 * undefined for the Shared Kernel.
 */
export const boundedContextName = (folder: string) =>
    boundedContextLocation(path.join(folder, 'domain'))?.name;

/** The reserved implementation type, determined by its infrastructure folder. */
export const isCrossContextImplementation = (file: string) => {
    const location = boundedContextLocation(file);
    const [layer, kind, label] = location?.segments ?? [];
    return (
        layer === 'infrastructure' &&
        kind === 'application-adapters' &&
        label === crossContextImplementation
    );
};

/**
 * Undefined for local/shared dependencies. Across contexts, only
 * cross-context port adapters and their wiring reach application handlers.
 */
export const crossContextImportAllowed = (from: string, to: string) => {
    const source = boundedContextLocation(from);
    const target = boundedContextLocation(to);
    if (!source || !target || source.name === target.name) return undefined;
    if (source.root !== target.root) return false;

    const [layer, kind] = source.segments;
    const [targetLayer, targetKind] = target.segments;
    if (targetLayer === 'wiring' && !path.basename(to).startsWith('wire-'))
        return false;
    if (/\.(spec|test)\.[^.]+$/.test(to)) return false;
    const suffix = {
        queries: '-query',
        commands: '-command',
        'use-cases': '-use-case'
    }[targetKind];
    if (!suffix || !new RegExp(`${suffix}(\\.(?:c|m)?[jt]sx?)?$`).test(to))
        return false;

    return (
        ['queries', 'commands', 'use-cases'].includes(targetKind) &&
        ((isCrossContextImplementation(from) &&
            targetLayer === 'application') ||
            (layer === 'wiring' &&
                kind === 'application-ports' &&
                targetLayer === 'wiring'))
    );
};
