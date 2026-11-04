import fs from 'node:fs';
import path from 'node:path';
import { File } from './file-system';
import {
    endpointFileLookup,
    legacyEndpointFileLookup,
    openapiExtractorPath
} from './integrations/openapi-extractor';
import { codeExtension, stageModuleMove, toPosix, walk } from './module-move';
import { ProjectRoot } from './project-root';
import {
    hasLegacyRootEndpoints,
    legacyRootEndpoints,
    restFolders,
    rootControllerFolder
} from './rest-layout';
import type { UpgradeContext, UpgradeStep } from './upgrade-steps';

const rootFolderOf = ({ config }: UpgradeContext) => {
    const project = config.project;
    const rootFolder =
        typeof project === 'object' && project !== null
            ? (project as Record<string, unknown>).rootFolder
            : undefined;
    return typeof rootFolder === 'string' ? rootFolder : undefined;
};

const contextFolders = (context: UpgradeContext) => {
    const rootFolder = rootFolderOf(context);
    if (!rootFolder) return [];
    const contexts = path.join(
        new ProjectRoot().path,
        rootFolder,
        'bounded-contexts'
    );
    return fs.existsSync(contexts)
        ? fs
              .readdirSync(contexts, { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => path.join(contexts, entry.name))
        : [];
};

const legacyContexts = (context: UpgradeContext) =>
    contextFolders(context).filter(hasLegacyRootEndpoints);

const relative = (file: string) =>
    toPosix(path.relative(new ProjectRoot().path, file));

const intoRoot = (folder: string, file: string) =>
    path.join(folder, rootControllerFolder, path.relative(folder, file));

/** Old path → new path of the context-root files of a context. */
const rootMoves = (contextFolder: string) => {
    const { presentation, wiring } = restFolders(contextFolder);
    const { endpointFiles, parameterFolders, wireFiles } =
        legacyRootEndpoints(contextFolder);
    return {
        files: [
            ...[...endpointFiles, ...parameterFolders.flatMap(walk)].map(
                (file) => [file, intoRoot(presentation, file)] as const
            ),
            ...wireFiles.map((file) => [file, intoRoot(wiring, file)] as const)
        ],
        folders: parameterFolders.map(
            (folder) => [folder, intoRoot(presentation, folder)] as const
        )
    };
};

const exportPattern = /^export\s+\*\s+from\s+(['"])([^'"]+)\1;?\s*$/;

const exportedSpecifier = (line: string) =>
    line.trim().match(exportPattern)?.[2];

/**
 * Replaces the re-exports of single context-root wires with one of the
 * `(root)` folder, where the first of them was, and returns them. The
 * `(root)` re-export is added even without them: every wired endpoint
 * must reach `restHandlers`.
 */
const regroupExports = (
    file: File,
    isRootWire: (specifier: string) => boolean,
    groupSpecifier: string
) => {
    const lines = file.exists ? file.data.split('\n') : [];
    const rootWires = lines.filter((line) => {
        const specifier = exportedSpecifier(line);
        return !!specifier && isRootWire(specifier);
    });
    const first = rootWires.length
        ? lines.indexOf(rootWires[0])
        : lines.length -
          [...lines].reverse().findIndex((line) => !!line.trim());
    const kept = lines.filter((line) => !rootWires.includes(line));
    if (!kept.some((line) => exportedSpecifier(line) === groupSpecifier))
        kept.splice(first, 0, `export * from '${groupSpecifier}'`);
    file.update(kept.join('\n'));
    return rootWires;
};

export const restRootControllerStep: UpgradeStep = {
    id: 'rest-root-controller',
    kind: 'optional',
    title: `Move context-root REST endpoints to presentation/rest/${rootControllerFolder}/`,
    detect: (context) => legacyContexts(context).length > 0,
    plan: (context) =>
        legacyContexts(context).flatMap((contextFolder) => {
            const name = path.basename(contextFolder);
            const { wiring } = restFolders(contextFolder);
            const { files } = rootMoves(contextFolder);
            const wired = files.some(([file]) => file.startsWith(wiring));
            return [
                ...files.map(
                    ([from, to]) => `${relative(from)} → ${relative(to)}`
                ),
                ...(wired
                    ? [
                          `${relative(path.join(wiring, 'index.ts'))}: the context-root lines → one line for ./${rootControllerFolder}`,
                          `${relative(path.join(new ProjectRoot().path, rootFolderOf(context)!, 'presentation', 'rest', 'wires.ts'))}: the ${name} context-root lines → one line for ${rootControllerFolder}, added if missing`
                      ]
                    : []),
                'Imports of the moved files are rewritten'
            ];
        }),
    apply: (context) => {
        const contexts = legacyContexts(context);
        const projectRoot = new ProjectRoot().path;
        const moves = new Map<string, string>();
        const folders: (readonly [string, string])[] = [];
        for (const contextFolder of contexts) {
            const planned = rootMoves(contextFolder);
            for (const [from, to] of planned.files) {
                if (fs.existsSync(to))
                    throw new Error(
                        `${relative(to)} already exists: move ${relative(from)} by hand, then run df-upgrade again.`
                    );
                moves.set(from, to);
            }
            folders.push(...planned.folders);
        }
        const withoutExtension = new Map(
            [...moves].map(([from, to]) => [
                from.replace(codeExtension, ''),
                to.replace(codeExtension, '')
            ])
        );
        stageModuleMove({
            projectRoot,
            stopAt: projectRoot,
            stopAtFor: (file) =>
                contexts
                    .flatMap((folder) => Object.values(restFolders(folder)))
                    .find((folder) => file.startsWith(`${folder}${path.sep}`)),
            moves,
            movedPath: (candidate) => {
                const moved =
                    moves.get(candidate) ?? withoutExtension.get(candidate);
                if (moved) return moved;
                const folder = folders.find(
                    ([from]) =>
                        candidate === from ||
                        candidate.startsWith(`${from}${path.sep}`)
                );
                return folder
                    ? folder[1] + candidate.slice(folder[0].length)
                    : undefined;
            },
            rename: (content) => content
        });

        const sharedWires = new File(
            path.join(
                projectRoot,
                rootFolderOf(context)!,
                'presentation',
                'rest',
                'wires.ts'
            )
        );
        for (const contextFolder of contexts) {
            const name = path.basename(contextFolder);
            const { wiring } = restFolders(contextFolder);
            const movedWires = legacyRootEndpoints(contextFolder).wireFiles;
            if (!movedWires.length) continue;
            const listed = regroupExports(
                new File(path.join(wiring, 'index.ts')),
                (specifier) =>
                    specifier.startsWith(`./${rootControllerFolder}/`),
                `./${rootControllerFolder}`
            ).map((line) => line.replace(`./${rootControllerFolder}/`, './'));
            /** Wires the index missed are re-exported too. */
            const unlisted = movedWires
                .map((file) => `./${path.basename(file, '.ts')}`)
                .filter(
                    (specifier) =>
                        !listed.some(
                            (line) => exportedSpecifier(line) === specifier
                        )
                )
                .map((specifier) => `export * from '${specifier}'`);
            new File(path.join(wiring, rootControllerFolder, 'index.ts')).data =
                [...listed, ...unlisted].join('\n');
            const wiringPath = `bounded-contexts/${name}/wiring/presentation/rest/${rootControllerFolder}`;
            regroupExports(
                sharedWires,
                (specifier) => specifier.includes(`${wiringPath}/`),
                `../../${wiringPath}`
            );
        }
    }
};

const extractorFile = () =>
    new File(path.join(new ProjectRoot().path, openapiExtractorPath));

export const openapiExtractorRootStep: UpgradeStep = {
    id: 'openapi-extractor-root',
    kind: 'optional',
    title: `Let the OpenAPI extractor find endpoints in presentation/rest/${rootControllerFolder}/`,
    detect: (context) => {
        const rootFolder = rootFolderOf(context);
        const file = extractorFile();
        return (
            !!rootFolder &&
            file.exists &&
            file.data.includes(legacyEndpointFileLookup(rootFolder))
        );
    },
    plan: () => [
        `${openapiExtractorPath}: the endpoint file is looked up in the controller folder, then in ${rootControllerFolder}/`
    ],
    apply: (context) => {
        const rootFolder = rootFolderOf(context)!;
        const file = extractorFile();
        file.update(
            file.data.replace(
                legacyEndpointFileLookup(rootFolder),
                endpointFileLookup(rootFolder)
            )
        );
    }
};

/**
 * An extractor changed by hand, or of an earlier version, misses the
 * context-root endpoints once they are in `(root)/`.
 */
export const openapiExtractorManualStep: UpgradeStep = {
    id: 'openapi-extractor-manual',
    kind: 'manual',
    title: 'Update the OpenAPI extractor by hand',
    detect: (context) => {
        const rootFolder = rootFolderOf(context);
        const file = extractorFile();
        if (!rootFolder || !file.exists) return false;
        const data = file.data;
        return (
            !data.includes(endpointFileLookup(rootFolder)) &&
            !data.includes(legacyEndpointFileLookup(rootFolder)) &&
            contextFolders(context).some(
                (folder) =>
                    hasLegacyRootEndpoints(folder) ||
                    fs.existsSync(
                        path.join(
                            restFolders(folder).presentation,
                            rootControllerFolder
                        )
                    )
            )
        );
    },
    plan: () => [
        `${openapiExtractorPath} doesn't look up endpoints in presentation/rest/${rootControllerFolder}/: compare it with the one npx df-integration scaffolds for openapi`
    ]
};
