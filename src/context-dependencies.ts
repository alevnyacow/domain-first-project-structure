import fs from 'node:fs';
import path from 'node:path';

export const crossContextImplementation = 'cross-context';

/** Context folders follow the same directory layout as the CLI context menu. */
export const hasNeighboringBoundedContext = (ownerPath: string) => {
    const contextsPath = path.dirname(ownerPath);
    return (
        path.basename(contextsPath) === 'bounded-contexts' &&
        fs.existsSync(contextsPath) &&
        fs
            .readdirSync(contextsPath, { withFileTypes: true })
            .some(
                (entry) =>
                    entry.isDirectory() &&
                    entry.name !== path.basename(ownerPath)
            )
    );
};

/** A file inside a bounded context, including its project source root. */
export const boundedContextLocation = (file: string) => {
    const parts = path.resolve(file).split(path.sep);
    const index = parts.lastIndexOf('bounded-contexts');
    if (index === -1 || parts.length < index + 3) return undefined;
    return {
        root: parts.slice(0, index).join(path.sep),
        name: parts[index + 1],
        segments: parts.slice(index + 2)
    };
};

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
