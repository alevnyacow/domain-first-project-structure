import fs from 'node:fs';
import path from 'node:path';
import { File } from './file-system';
import { hasDependency } from './integrations/missing-domain-first-packages';
import {
    svelteKitStaticUrl,
    svelteSwaggerPage,
    swaggerPagePath
} from './integrations/openapi';
import {
    codeExtension,
    escapeRegExp,
    stageModuleMove,
    toPosix,
    walk
} from './module-move';
import { ProjectRoot } from './project-root';
import type { UpgradeContext, UpgradeStep } from './upgrade-steps';

const record = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

const svelteOf = ({ config }: UpgradeContext) =>
    'svelte' in record(config.frontend)
        ? record(record(config.frontend).svelte)
        : undefined;

const rootFolderOf = ({ config }: UpgradeContext) => {
    const rootFolder = record(config.project).rootFolder;
    return typeof rootFolder === 'string' ? rootFolder : undefined;
};

const relative = (file: string) =>
    toPosix(path.relative(new ProjectRoot().path, file));

const svelteFolder = (context: UpgradeContext) => {
    const rootFolder = rootFolderOf(context);
    return svelteOf(context) && rootFolder
        ? path.join(
              new ProjectRoot().path,
              rootFolder,
              'presentation',
              'svelte'
          )
        : undefined;
};

/** The Svelte Swagger UI page of `swagger-ui`, which takes React from the project. */
const legacySwaggerPage = (context: UpgradeContext) => {
    const rootFolder = rootFolderOf(context);
    if (!svelteOf(context) || !rootFolder) return undefined;
    const file = new File(
        path.join(new ProjectRoot().path, swaggerPagePath(rootFolder, 'svelte'))
    );
    return file.exists &&
        /swagger-ui\/dist\/swagger-ui\.css|import\(\s*['"]swagger-ui['"]\s*\)/.test(
            file.data
        )
        ? file
        : undefined;
};

/** The project-relative path of the document the old page imports. */
const importedSpecPath = (page: File) => {
    const specifier = page.data.match(
        /import\s+spec\s+from\s+['"]([^'"]+)['"]/
    )?.[1];
    return specifier?.startsWith('.')
        ? relative(path.resolve(path.dirname(page.path), specifier))
        : undefined;
};

/**
 * Regenerates the Svelte Swagger UI page on `swagger-ui-dist`: `swagger-ui`
 * renders with the project's React, and React 19 (brought by Storybook)
 * has no `createRoot` in `react-dom`, so the page fails in the browser.
 */
export const svelteSwaggerPageStep: UpgradeStep = {
    id: 'svelte-swagger-ui-dist',
    kind: 'optional',
    title: 'Render the Svelte Swagger UI page with swagger-ui-dist',
    detect: (context) => {
        const page = legacySwaggerPage(context);
        return !!page && !!importedSpecPath(page);
    },
    plan: (context) => {
        const page = legacySwaggerPage(context)!;
        return [
            `${relative(page.path)}: regenerated on swagger-ui-dist/swagger-ui-bundle.js, which bundles its own React`
        ];
    },
    apply: (context) => {
        const page = legacySwaggerPage(context)!;
        const outputPath = importedSpecPath(page)!;
        const sveltekit = svelteOf(context)?.framework === 'sveltekit';
        page.update(
            svelteSwaggerPage(
                rootFolderOf(context)!,
                outputPath,
                sveltekit ? svelteKitStaticUrl(outputPath) : undefined
            )
        );
    }
};

/** Packages of the old Svelte Swagger UI page, to replace by hand. */
export const svelteSwaggerPackagesStep: UpgradeStep = {
    id: 'svelte-swagger-ui-dist-packages',
    kind: 'manual',
    title: 'Replace swagger-ui with swagger-ui-dist',
    detect: (context) => !!svelteOf(context) && hasDependency('swagger-ui'),
    plan: () => [
        `npm uninstall swagger-ui${hasDependency('@types/swagger-ui') ? ' @types/swagger-ui' : ''}`,
        ...(hasDependency('swagger-ui-dist')
            ? []
            : ['npm install swagger-ui-dist']),
        ...(hasDependency('@types/swagger-ui-dist')
            ? []
            : ['npm install --save-dev @types/swagger-ui-dist'])
    ]
};

type ModelMove = {
    from: string;
    to: string;
    /** `useOrdersUIModel` → `createOrdersUIModel`. */
    names: [string, string][];
};

const legacyFunctionNames = (file: string): [string, string][] =>
    [
        ...fs
            .readFileSync(file, 'utf8')
            .matchAll(/export\s+(?:const|function)\s+use(\w+)\b/g)
    ].map(([, name]) => [`use${name}`, `create${name}`]);

/**
 * Widget UI models `widgets/**\/hooks/use-n-ui-model.svelte.ts` and shared
 * hooks `hooks/use-n.svelte.ts`, with their new places in `model/` and
 * `shared/model/`.
 */
const legacyModels = (context: UpgradeContext): ModelMove[] => {
    const folder = svelteFolder(context);
    if (!folder) return [];
    const isModule = (file: string) =>
        /^use-.+\.svelte\.[jt]s$/.test(path.basename(file)) &&
        !/\.(spec|test)\./.test(file);
    const renamed = (file: string) =>
        path.basename(file).replace(/^use-/, 'create-');
    const widgetModels = walk(path.join(folder, 'widgets'))
        .filter(
            (file) =>
                path.basename(path.dirname(file)) === 'hooks' &&
                /-ui-model\./.test(file) &&
                isModule(file)
        )
        .map((file) => ({
            from: file,
            to: path.join(
                path.dirname(path.dirname(file)),
                'model',
                renamed(file)
            )
        }));
    const sharedFolder = path.join(folder, 'hooks');
    const sharedHooks = fs.existsSync(sharedFolder)
        ? fs
              .readdirSync(sharedFolder)
              .map((name) => path.join(sharedFolder, name))
              .filter(isModule)
              .map((file) => ({
                  from: file,
                  to: path.join(folder, 'shared', 'model', renamed(file))
              }))
        : [];
    return [...widgetModels, ...sharedHooks]
        .filter(({ to }) => !fs.existsSync(to))
        .map((move) => ({ ...move, names: legacyFunctionNames(move.from) }));
};

/**
 * Svelte has no hooks: widget UI models move to `model/create-*.svelte.ts`
 * and shared hooks to `shared/model/create-*.svelte.ts`, `useN` becomes
 * `createN`, and imports follow.
 */
export const svelteModelsStep: UpgradeStep = {
    id: 'svelte-models',
    kind: 'optional',
    title: 'Rename Svelte hooks to models: model/create-*.svelte.ts',
    detect: (context) => legacyModels(context).length > 0,
    plan: (context) =>
        legacyModels(context).flatMap(({ from, to, names }) => [
            `${relative(from)} → ${relative(to)}`,
            ...names.map(([from, to]) => `  ${from} → ${to}`)
        ]),
    apply: (context) => {
        const models = legacyModels(context);
        const moves = new Map(models.map(({ from, to }) => [from, to]));
        const withoutExtension = new Map(
            models.map(({ from, to }) => [
                from.replace(codeExtension, ''),
                to.replace(codeExtension, '')
            ])
        );
        const names = models.flatMap((model) => model.names);
        const namePattern =
            names.length &&
            new RegExp(
                `(?<![\\w$])(${names.map(([from]) => escapeRegExp(from)).join('|')})(?![\\w$])`,
                'g'
            );
        const renames = new Map(names);
        stageModuleMove({
            projectRoot: new ProjectRoot().path,
            stopAt: svelteFolder(context)!,
            moves,
            movedPath: (candidate) =>
                moves.get(candidate) ?? withoutExtension.get(candidate),
            rename: (content) =>
                namePattern
                    ? content.replace(
                          namePattern,
                          (name) => renames.get(name) ?? name
                      )
                    : content
        });
    }
};
