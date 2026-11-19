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
    /** `useDebounce` → `createDebounce`. */
    names: [string, string][];
};

const legacyFunctionNames = (file: string): [string, string][] =>
    [
        ...fs
            .readFileSync(file, 'utf8')
            .matchAll(/export\s+(?:const|function)\s+use(\w+)\b/g)
    ].map(([, name]) => [`use${name}`, `create${name}`]);

/** Shared hooks `hooks/use-n.svelte.ts` of 8.11, with their places in `shared/model/`. */
const legacyModels = (context: UpgradeContext): ModelMove[] => {
    const folder = svelteFolder(context);
    if (!folder) return [];
    const sharedFolder = path.join(folder, 'hooks');
    if (!fs.existsSync(sharedFolder)) return [];
    return fs
        .readdirSync(sharedFolder)
        .map((name) => path.join(sharedFolder, name))
        .filter(
            (file) =>
                /^use-.+\.svelte\.[jt]s$/.test(path.basename(file)) &&
                !/\.(spec|test)\./.test(file)
        )
        .map((file) => ({
            from: file,
            to: path.join(
                folder,
                'shared',
                'model',
                path.basename(file).replace(/^use-/, 'create-')
            )
        }))
        .filter(({ to }) => !fs.existsSync(to))
        .map((move) => ({ ...move, names: legacyFunctionNames(move.from) }));
};

/**
 * Svelte has no hooks: shared hooks move to `shared/model/create-*.svelte.ts`,
 * `useN` becomes `createN`, and imports follow.
 */
export const svelteModelsStep: UpgradeStep = {
    id: 'svelte-models',
    kind: 'optional',
    title: 'Rename Svelte shared hooks to shared models: shared/model/create-*.svelte.ts',
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

/** Lines that are `//` comments only. */
const withoutLineComments = (text: string) =>
    text
        .split('\n')
        .filter((line) => !/^\s*\/\//.test(line))
        .join('\n');

/** Whether the `{` the text starts with closes at its very end. */
const closesAtEnd = (text: string) => {
    let depth = 0;
    let quote: string | undefined;
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (quote) {
            if (char === '\\') index++;
            else if (char === quote) quote = undefined;
            continue;
        }
        if (char === "'" || char === '"' || char === '`') quote = char;
        else if (char === '{') depth++;
        else if (char === '}' && --depth === 0)
            return index === text.length - 1;
    }
    return false;
};

/**
 * The object a UI model returns, when the model only maps props:
 * `(widgetProps) => ({ … })` or `(widgetProps) => { return { … } }`,
 * importing nothing but types. Undefined for any other model.
 */
const mappedObject = (content: string) => {
    const lines = content.replace(/\/\*[\s\S]*?\*\//g, '').split('\n');
    const exportAt = lines.findIndex((line) => /^export\s/.test(line));
    if (exportAt < 0) return undefined;
    const onlyTypeImports = lines
        .slice(0, exportAt)
        .filter((line) => line.trim() && !/^\s*\/\//.test(line))
        .every((line) =>
            /^import\s+type\s*\{[^}]*\}\s*from\s*['"]\.\.\/types['"];?\s*$/.test(
                line
            )
        );
    const declaration = lines
        .slice(exportAt)
        .join('\n')
        .trim()
        .match(
            /^export\s+const\s+(?:use|create)(\w+)UIModel\s*=\s*\(\s*([\w$]+)\s*(?::[^)]*)?\)\s*(?::[^=]+?)?=>\s*([\s\S]*?);?$/
        );
    if (!onlyTypeImports || !declaration) return undefined;
    const [, ClassName, param, rawBody] = declaration;
    const body = rawBody.trim();
    const object =
        body.startsWith('(') && body.endsWith(')')
            ? body.slice(1, -1).trim()
            : body.startsWith('{') && body.endsWith('}')
              ? withoutLineComments(body.slice(1, -1))
                    .trim()
                    .match(/^return\s*(\{[\s\S]*\})\s*;?$/)?.[1]
              : undefined;
    if (!object || !closesAtEnd(object)) return undefined;
    // Getters and runes keep state of their own: not a plain mapping
    if (/\b(?:get|set)\s+[\w$]+\s*\(|\$(?:state|derived|effect)\b/.test(object))
        return undefined;
    const ownProps = new RegExp(`(?<![\\w$.])${escapeRegExp(param)}\\.`, 'g');
    // Props used otherwise than by property, e.g. spread
    if (
        new RegExp(`(?<![\\w$])${escapeRegExp(param)}(?![\\w$])`).test(
            object.replace(ownProps, '')
        )
    )
        return undefined;
    return {
        ClassName,
        object:
            withoutLineComments(object).replace(/\s/g, '') === '{}'
                ? '{}'
                : object,
        ownProps
    };
};

type WidgetModel = {
    /** `hooks/use-n-ui-model.svelte.ts` of 8.11 or `model/create-n-ui-model.svelte.ts` of 8.12. */
    model: string;
    widget?: string;
    /** The widget with the model inlined into `toUIProps`; undefined: by hand. */
    inlined?: string;
};

/** The widget file with its model call replaced by `toUIProps`. */
const inlineModel = (widget: string, model: string) => {
    const mapped = mappedObject(fs.readFileSync(model, 'utf8'));
    if (!mapped) return undefined;
    const { ClassName, object, ownProps } = mapped;
    const content = fs.readFileSync(widget, 'utf8');
    const importLine = new RegExp(
        `^[ \\t]*import\\s*\\{\\s*(?:use|create)${ClassName}UIModel\\s*\\}\\s*from\\s*['"]\\./(?:hooks|model)/[^'"]+['"];?[ \\t]*\\n`,
        'm'
    );
    // The comments 8.12 generated above the call go with it
    const call = new RegExp(
        `^(?:[ \\t]*// The (?:\\$props\\(\\) proxy|rest of \\$props\\(\\)).*\\n)?(?:[ \\t]*// svelte-ignore state_referenced_locally\\n)?([ \\t]*)const\\s+uiModel\\s*=\\s*(?:use|create)${ClassName}UIModel\\(\\s*([\\w$]+)\\s*\\);?[ \\t]*\\n`,
        'm'
    );
    const typesImport = new RegExp(
        `import\\s+type\\s*\\{\\s*${ClassName}WidgetProps\\s*\\}\\s*from\\s*(['"])\\./types\\1`
    );
    const callMatch = content.match(call);
    if (
        !importLine.test(content) ||
        !callMatch ||
        !typesImport.test(content) ||
        !content.includes('{...uiModel}')
    )
        return undefined;
    const [, indent, argument] = callMatch;
    const objectLines = object.replace(ownProps, `${argument}.`).split('\n');
    const closingIndent = objectLines.at(-1)!.match(/^\s*/)![0].length;
    const shift = indent.length - closingIndent;
    const reindented = objectLines
        .map((line, index) =>
            index === 0
                ? line
                : shift >= 0
                  ? `${' '.repeat(shift)}${line}`
                  : line.replace(new RegExp(`^ {0,${-shift}}`), '')
        )
        .join('\n');
    const inlined = content
        .replace(importLine, '')
        .replace(
            call,
            `${indent}const toUIProps = (): ${ClassName}WidgetUIProps => (${reindented})\n`
        )
        .replace(
            typesImport,
            (_, quote) =>
                `import type { ${ClassName}WidgetProps, ${ClassName}WidgetUIProps } from ${quote}./types${quote}`
        )
        .replaceAll('{...uiModel}', '{...toUIProps()}');
    return /(?<![\w$])uiModel(?![\w$])/.test(inlined) ? undefined : inlined;
};

/** UI models of separated UI and headless widgets generated by 8.11 and 8.12. */
const widgetModels = (context: UpgradeContext): WidgetModel[] => {
    const folder = svelteFolder(context);
    if (!folder) return [];
    return walk(path.join(folder, 'widgets'))
        .filter(
            (file) =>
                ['hooks', 'model'].includes(
                    path.basename(path.dirname(file))
                ) &&
                /^(?:use|create)-.+-ui-model\.svelte\.[jt]s$/.test(
                    path.basename(file)
                )
        )
        .map((model) => {
            const widgetFolder = path.dirname(path.dirname(model));
            const widgetName = fs
                .readdirSync(widgetFolder)
                .find((name) => name.endsWith('-widget.svelte'));
            const widget = widgetName && path.join(widgetFolder, widgetName);
            const specifier = path.basename(model).replace(codeExtension, '');
            // Imported by other files than the widget, e.g. tests
            const usedElsewhere = walk(widgetFolder).some(
                (file) =>
                    file !== widget &&
                    file !== model &&
                    codeExtension.test(file) &&
                    fs.readFileSync(file, 'utf8').includes(specifier)
            );
            return {
                model,
                widget,
                inlined:
                    widget && !usedElsewhere
                        ? inlineModel(widget, model)
                        : undefined
            };
        });
};

/**
 * Widgets map their props to UI props with `toUIProps`, called in the
 * markup, so Svelte re-runs it on every change: a UI model file that only
 * maps props moves into the widget and is deleted.
 */
export const svelteToUIPropsStep: UpgradeStep = {
    id: 'svelte-to-ui-props',
    kind: 'optional',
    title: 'Map Svelte widget props with toUIProps in the widget',
    detect: (context) =>
        widgetModels(context).some(({ inlined }) => inlined !== undefined),
    plan: (context) =>
        widgetModels(context)
            .filter(({ inlined }) => inlined !== undefined)
            .map(
                ({ model, widget }) =>
                    `${relative(model)} → toUIProps in ${relative(widget!)}; the model file is deleted`
            ),
    apply: (context) => {
        for (const { model, widget, inlined } of widgetModels(context)) {
            if (inlined === undefined) continue;
            new File(widget!).update(inlined);
            new File(model).delete(path.dirname(widget!));
        }
    }
};

/** UI models with logic of their own: state, getters, other imports. */
export const svelteToUIPropsManualStep: UpgradeStep = {
    id: 'svelte-to-ui-props-manual',
    kind: 'manual',
    title: 'Move Svelte widget UI models into toUIProps by hand',
    detect: (context) =>
        widgetModels(context).some(({ inlined }) => inlined === undefined),
    plan: (context) =>
        widgetModels(context)
            .filter(({ inlined }) => inlined === undefined)
            .map(({ model, widget }) =>
                widget
                    ? `${relative(model)}: move its state and methods into the <script> of ${relative(widget)}, map props in toUIProps and render {...toUIProps()}, then delete the model`
                    : `${relative(model)}: no widget file next to it; map props with toUIProps in the widget`
            )
};
