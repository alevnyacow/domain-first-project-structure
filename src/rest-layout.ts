import fs from 'node:fs';
import path from 'node:path';

/**
 * Folder of the context-root controller (`/<context>/...`) in
 * `presentation/rest/` and `wiring/presentation/rest/`. Like a Next.js route
 * group, it is not a segment of the route.
 */
export const rootControllerFolder = '(root)';

/**
 * Path parameters (`:id`) can't be part of file and folder names
 * everywhere (Windows), so they are named `_id_` there.
 */
export const pathParameterAsName = (segment: string) =>
    segment.startsWith(':') ? `_${segment.slice(1)}_` : segment;

export const isPathParameterName = (name: string) =>
    name.startsWith(':') || /^_.+_$/.test(name);

const endpointFileNames = new Set(
    ['get', 'post', 'put', 'patch', 'delete'].map(
        (method) => `${method.toUpperCase()}.ts`
    )
);

const entries = (folder: string) =>
    fs.existsSync(folder)
        ? fs.readdirSync(folder, { withFileTypes: true })
        : [];

const subfolders = (folder: string) =>
    entries(folder)
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

export const restFolders = (boundedContextFolder: string) => ({
    presentation: path.join(boundedContextFolder, 'presentation', 'rest'),
    wiring: path.join(boundedContextFolder, 'wiring', 'presentation', 'rest')
});

/** Static subfolders of `presentation/rest/`, except `(root)`. */
export const restControllers = (boundedContextFolder: string) =>
    subfolders(restFolders(boundedContextFolder).presentation).filter(
        (name) => name !== rootControllerFolder && !isPathParameterName(name)
    );

/**
 * Static first segments of the context-root endpoints: each one is the
 * start of `/<context>/<segment>`, which a controller of that name would
 * share.
 */
export const rootStaticSegments = (boundedContextFolder: string) =>
    subfolders(
        path.join(
            restFolders(boundedContextFolder).presentation,
            rootControllerFolder
        )
    ).filter((name) => !isPathParameterName(name));

/**
 * Context-root endpoints of 8.5 lived right in `presentation/rest/`
 * (`GET.ts`, `_id_/`), their wires right in `wiring/presentation/rest/`.
 */
export const legacyRootEndpoints = (boundedContextFolder: string) => {
    const { presentation, wiring } = restFolders(boundedContextFolder);
    return {
        endpointFiles: entries(presentation)
            .filter(
                (entry) => entry.isFile() && endpointFileNames.has(entry.name)
            )
            .map((entry) => path.join(presentation, entry.name)),
        parameterFolders: subfolders(presentation)
            .filter(isPathParameterName)
            .map((name) => path.join(presentation, name)),
        wireFiles: entries(wiring)
            .filter(
                (entry) =>
                    entry.isFile() &&
                    entry.name !== 'index.ts' &&
                    /\.ts$/.test(entry.name)
            )
            .map((entry) => path.join(wiring, entry.name))
    };
};

export const hasLegacyRootEndpoints = (boundedContextFolder: string) =>
    Object.values(legacyRootEndpoints(boundedContextFolder)).some(
        (paths) => paths.length > 0
    );
