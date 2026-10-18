import fs from 'node:fs';
import path from 'node:path';
import { configuredDependencyRules } from './config-file';
import {
    type DependencyRules,
    defaultDependencyRules,
    wiredModuleKind
} from './dependency-rules';
import { File } from './file-system';
import { UnknownFormatNaming } from './unknown-format-naming';

export const layers = [
    'domain',
    'application',
    'infrastructure',
    'presentation'
] as const;

export type Layer = (typeof layers)[number];

/**
 * Layers whose modules a module of the given layer may depend on.
 */
export const visibleLayers: Record<Layer, Layer[]> = {
    domain: ['domain'],
    application: ['domain', 'application'],
    /**
     * From the application layer, infrastructure takes only ports: see
     * `layerRules`.
     */
    infrastructure: ['domain', 'application', 'infrastructure'],
    presentation: ['application', 'presentation']
};

/**
 * A class built by a wire: the module itself, or one of the
 * implementations of a branched wire.
 */
export type WiredClass = {
    className: string;
    file: string;
};

export type WiredModule = {
    /**
     * `wireUserRepository`.
     */
    wireName: string;
    /**
     * `UserRepository`: what consumers declare in their constructors.
     */
    typeName: string;
    wireFile: string;
    typeFile: string;
    /**
     * Layer of the type, as seen by consumers.
     */
    layer: Layer;
    implementations: WiredClass[];
    /**
     * An env-branched wire: each implementation is wired on its own.
     */
    branched: boolean;
    /**
     * Layer of the implementations, which limits their dependencies.
     */
    implementationsLayer: Layer;
    /**
     * The folder under `wiring/`: `use-cases`, `application-ports`, ….
     */
    kind: string;
};

/**
 * Branched wires import only implementations, so the abstract type
 * they provide is found by the generator's file layout.
 */
const branchedTypeFiles: Record<string, (fileBase: string) => string[]> = {
    repositories: (fileBase) => [
        'domain',
        'aggregates',
        fileBase.replace(/-repository$/, ''),
        `${fileBase}.ts`
    ],
    commands: (fileBase) => [
        'application',
        'commands',
        'execution',
        `${fileBase}.ts`
    ],
    queries: (fileBase) => [
        'application',
        'queries',
        'execution',
        `${fileBase}.ts`
    ],
    'application-ports': (fileBase) => [
        'application',
        'ports',
        `${fileBase}.ts`
    ]
};

const layerOf = (file: string, contextPath: string) => {
    const [firstSegment] = path.relative(contextPath, file).split(path.sep);
    return layers.find((layer) => layer === firstSegment);
};

const namedImports = (source: string, fromFile: string) => {
    const result = new Map<string, string>();
    for (const [, names, importPath] of source.matchAll(
        /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
    )) {
        for (const name of names.split(',')) {
            const cleanName = name.replace(/^\s*type\s+/, '').trim();
            if (cleanName) {
                result.set(
                    cleanName,
                    `${path.resolve(path.dirname(fromFile), importPath)}.ts`
                );
            }
        }
    }
    return result;
};

/**
 * Endpoints are entry points: nothing depends on them, and their
 * constructor parameters don't follow their wire.
 */
const isEndpointWire = (wiringRelativePath: string) =>
    wiringRelativePath.startsWith(['presentation', 'rest'].join(path.sep));

/**
 * `const wireX = wireClass(X, …)`, also inside wrappers such as
 * `memoWire(wireClass(X, …))`, in the order of the file.
 */
const wireClassDefinitions = (source: string) =>
    [
        ...codeOnly(source).matchAll(
            /(?:export\s+)?const\s+(\w+)\s*=\s*(?:\w+\(\s*)*wireClass\(\s*(\w+)\s*,/g
        )
    ].map(([, wireName, className]) => ({ wireName, className }));

/**
 * Classes the module's wire builds: its own `wireClass`, or for a
 * branched wire the implementations passed to `envBranchedWire`.
 */
const wiredClassNames = (
    source: string,
    wireName: string,
    initializerStart: number,
    branched: boolean
) => {
    const definitions = wireClassDefinitions(source);

    if (!branched) {
        return definitions
            .filter((x) => x.wireName === wireName)
            .map((x) => x.className);
    }

    const openIndex = source.indexOf('(', initializerStart);
    const branches = codeOnly(source).slice(
        openIndex,
        closingIndex(source, openIndex)
    );
    const referenced = new Set(branches.match(/\w+/g));

    return definitions
        .filter((x) => referenced.has(x.wireName))
        .map((x) => x.className);
};

export const readWiredModule = (
    wireFile: string,
    contextPath: string
): WiredModule | undefined => {
    const wiringRelativePath = path.relative(
        path.join(contextPath, 'wiring'),
        wireFile
    );
    if (isEndpointWire(wiringRelativePath)) {
        return undefined;
    }

    const source = new File(wireFile).data;
    /**
     * The file name gives the module's wire, so other wires the user
     * adds to the file don't replace it.
     */
    const wireName = `wire${new UnknownFormatNaming(path.basename(wireFile, '.ts').replace(/^wire-/, '')).ClassName}`;
    const exportMatch = new RegExp(
        `export\\s+const\\s+${wireName}\\s*=\\s*`
    ).exec(source);
    if (!exportMatch) {
        return undefined;
    }

    const branched = source
        .slice(exportMatch.index + exportMatch[0].length)
        .startsWith('envBranchedWire(');

    const imports = namedImports(source, wireFile);
    const implementations = wiredClassNames(
        source,
        wireName,
        exportMatch.index + exportMatch[0].length,
        branched
    ).flatMap((className) => {
        const file = imports.get(className);
        return file ? [{ className, file }] : [];
    });
    if (!implementations.length) {
        return undefined;
    }

    const typeName = wireName.slice('wire'.length);
    const [wiringFolder] = wiringRelativePath.split(path.sep);
    const typeFileSegments = branchedTypeFiles[wiringFolder]?.(
        path.basename(wireFile, '.ts').replace(/^wire-/, '')
    );

    const typeFile = branched
        ? typeFileSegments && path.join(contextPath, ...typeFileSegments)
        : implementations[0].file;
    const layer = typeFile && layerOf(typeFile, contextPath);
    const implementationsLayer = layerOf(implementations[0].file, contextPath);

    if (!typeFile || !layer || !implementationsLayer) {
        return undefined;
    }

    return {
        wireName,
        typeName,
        wireFile,
        typeFile,
        layer,
        implementations,
        branched,
        implementationsLayer,
        kind: wiringFolder
    };
};

export const findWiredModules = (contextPath: string) => {
    const result: WiredModule[] = [];
    const walk = (folderPath: string) => {
        if (!fs.existsSync(folderPath)) {
            return;
        }
        for (const entry of fs.readdirSync(folderPath, {
            withFileTypes: true
        })) {
            const entryPath = path.join(folderPath, entry.name);
            if (entry.isDirectory()) {
                walk(entryPath);
            } else if (/^wire-.*(?<!\.spec)\.ts$/.test(entry.name)) {
                const wiredModule = readWiredModule(entryPath, contextPath);
                if (wiredModule) {
                    result.push(wiredModule);
                }
            }
        }
    };
    walk(path.join(contextPath, 'wiring'));
    return result.sort((a, b) => a.typeName.localeCompare(b.typeName));
};

/**
 * The kind a module has in the dependency rules.
 */
export const moduleKindOf = (module: WiredModule) =>
    wiredModuleKind(module.kind, module.typeFile);

/**
 * Modules of other kinds (folders the rules don't know) follow the
 * layers; infrastructure takes only ports from application.
 */
const layerRule = (consumer: WiredModule, candidate: WiredModule) =>
    visibleLayers[consumer.implementationsLayer].includes(candidate.layer) &&
    (consumer.implementationsLayer !== 'infrastructure' ||
        candidate.layer !== 'application' ||
        candidate.kind === 'application-ports');

/**
 * The implementation label of a branched wire's class, taken from its
 * folder: `infrastructure/repositories/prisma/…` → `prisma`.
 */
export const implementationType = (
    consumer: WiredModule,
    implementation: WiredClass
) =>
    consumer.branched
        ? path.basename(path.dirname(implementation.file))
        : undefined;

/**
 * An infrastructure module whose file name has the implementation label
 * as whole words: `in-memory-db-infrastructure-service` for `in-memory`.
 */
export const isSuggestedFor = (
    candidate: WiredModule,
    implementation: string
) =>
    candidate.layer === 'infrastructure' &&
    `-${path.basename(candidate.typeFile, '.ts')}-`.includes(
        `-${implementation}-`
    );

export const canDependOn = (
    consumer: WiredModule,
    candidate: WiredModule,
    rules: DependencyRules = defaultDependencyRules
) => {
    const consumerKind = moduleKindOf(consumer);
    const candidateKind = moduleKindOf(candidate);
    return consumerKind && candidateKind
        ? rules[consumerKind].has(candidateKind)
        : layerRule(consumer, candidate);
};

/**
 * What an implementation of the consumer can depend on by the project's
 * rules, except the consumer and what this implementation already
 * depends on.
 */
export const availableDependencies = (
    consumer: WiredModule,
    implementation: WiredClass,
    candidates: WiredModule[],
    rules: DependencyRules = configuredDependencyRules()
) => {
    const wired = wiredDependencyNames(
        new File(consumer.wireFile).data,
        implementation.className
    );

    return candidates.filter(
        (candidate) =>
            candidate.wireFile !== consumer.wireFile &&
            canDependOn(consumer, candidate, rules) &&
            !wired.includes(candidate.wireName)
    );
};

/**
 * Import path without extension, always starting with `./` or `../`.
 */
export const relativeImport = (fromFile: string, toFile: string) => {
    const relativePath = path
        .relative(path.dirname(fromFile), toFile)
        .replace(/\.ts$/, '')
        .split(path.sep)
        .join('/');
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
};

/**
 * The source with comments, string contents, and arrows (`=>`) blanked
 * out, so brackets and commas can be found at the same positions.
 */
const codeOnly = (source: string) => {
    let result = '';
    let index = 0;
    const blank = (text: string) => text.replace(/[^\n]/g, ' ');
    while (index < source.length) {
        const pair = source.slice(index, index + 2);
        const char = source[index];
        let end = index + 1;
        if (pair === '//') {
            const lineEnd = source.indexOf('\n', index);
            end = lineEnd === -1 ? source.length : lineEnd;
            result += blank(source.slice(index, end));
        } else if (pair === '/*') {
            const commentEnd = source.indexOf('*/', index + 2);
            end = commentEnd === -1 ? source.length : commentEnd + 2;
            result += blank(source.slice(index, end));
        } else if (pair === '=>') {
            end = index + 2;
            result += '  ';
        } else if (char === "'" || char === '"' || char === '`') {
            while (end < source.length && source[end] !== char) {
                end += source[end] === '\\' ? 2 : 1;
            }
            end = Math.min(end + 1, source.length);
            result += char + blank(source.slice(index + 1, end - 1));
            result += end - 1 > index ? source[end - 1] : '';
        } else {
            result += char;
        }
        index = end;
    }
    return result;
};

/**
 * Adds the line after the last top import (multi-line ones included);
 * does nothing if it is there.
 */
export const addImport = (source: string, importLine: string) => {
    if (source.split('\n').some((line) => line.trim() === importLine)) {
        return source;
    }
    const lastImport = [
        ...codeOnly(source).matchAll(
            /^import\s(?:[^'"]*?from\s*)?['"][^'"]*['"]/gm
        )
    ].at(-1);
    if (!lastImport) {
        return `${importLine}\n\n${source}`;
    }
    const importEnd = lastImport.index + lastImport[0].length;
    const lineEnd = source.indexOf('\n', importEnd);
    const insertAt = lineEnd === -1 ? source.length : lineEnd;
    return `${source.slice(0, insertAt)}\n${importLine}${source.slice(insertAt)}`;
};

const brackets: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
    '<': '>'
};

/**
 * Index of the bracket closing the one at `openIndex`, ignoring brackets
 * in comments and strings.
 */
const closingIndex = (source: string, openIndex: number) => {
    const code = codeOnly(source);
    let depth = 0;
    for (let index = openIndex; index < code.length; index++) {
        const char = code[index];
        if (char === code[openIndex]) {
            depth++;
        } else if (char === brackets[code[openIndex]]) {
            depth--;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
};

/**
 * Comma-separated items on the top level of a bracket's content,
 * without comments.
 */
const splitTopLevel = (content: string) => {
    const code = codeOnly(content);
    const items: string[] = [];
    let depth = 0;
    let itemStart = 0;
    for (let index = 0; index <= code.length; index++) {
        const char = code[index];
        if (char !== undefined && char in brackets) {
            depth++;
        } else if (Object.values(brackets).includes(char)) {
            depth--;
        }
        if (index === code.length || (char === ',' && depth === 0)) {
            const item = content.slice(itemStart, index);
            const itemCode = code.slice(itemStart, index);
            // Keep the item's own text, minus comments around it.
            const first = itemCode.search(/\S/);
            const last = itemCode.search(/\S\s*$/);
            if (first !== -1) {
                items.push(item.slice(first, last + 1));
            }
            itemStart = index + 1;
        }
    }
    return items;
};

/**
 * Appends items to a bracket's content. Existing items keep their
 * comments and line breaks; a multi-line list gets one item per line.
 */
const appendItems = (content: string, items: string[]) => {
    const code = codeOnly(content);
    const lastCode = code.search(/\S\s*$/);
    if (lastCode === -1) {
        return items.join(', ');
    }
    const trailingComma = code[lastCode] === ',';

    if (!content.includes('\n')) {
        const added = trailingComma
            ? ` ${items.join(', ')},`
            : `, ${items.join(', ')}`;
        return (
            content.slice(0, lastCode + 1) + added + content.slice(lastCode + 1)
        );
    }

    const indent = content.match(/\n([ \t]*)\S/)?.[1] ?? '';
    // The comma goes right after the last item, before its comment.
    const withComma = trailingComma
        ? content
        : `${content.slice(0, lastCode + 1)},${content.slice(lastCode + 1)}`;
    const lineEndIndex = withComma.indexOf('\n', lastCode + 1);
    const lineEnd = lineEndIndex === -1 ? withComma.length : lineEndIndex;
    const added = trailingComma
        ? items.map((x) => `\n${indent}${x},`).join('')
        : items.map((x) => `\n${indent}${x}`).join(',');
    return withComma.slice(0, lineEnd) + added + withComma.slice(lineEnd);
};

/**
 * Appends parameters to the class constructor, adding one if missing.
 */
export const addConstructorParameters = (
    source: string,
    className: string,
    parameters: string[]
) => {
    const classMatch = new RegExp(`class\\s+${className}\\b[^{]*\\{`).exec(
        codeOnly(source)
    );
    if (!classMatch) {
        throw new Error(`Class ${className} not found`);
    }
    const bodyStart = classMatch.index + classMatch[0].length;
    const bodyEnd = closingIndex(source, bodyStart - 1);
    const body = source.slice(bodyStart, bodyEnd);
    const constructorIndex = codeOnly(body).search(/\bconstructor\s*\(/);

    const renderParameters = (allParameters: string[], indent: string) =>
        allParameters.length === 1
            ? allParameters[0]
            : `\n${allParameters.map((x) => `${indent}    ${x}`).join(',\n')}\n${indent}`;

    if (constructorIndex === -1) {
        /**
         * A derived class must call `super()` in its constructor.
         */
        const constructorBody = /\bextends\b/.test(classMatch[0])
            ? '{\n        super()\n    }'
            : '{}';
        const constructorLine = `    constructor(${renderParameters(parameters, '    ')}) ${constructorBody}`;
        const newBody = body.trim()
            ? `\n${constructorLine}\n${body.replace(/^\s*\n/, '\n')}`
            : `\n${constructorLine}\n`;
        return source.slice(0, bodyStart) + newBody + source.slice(bodyEnd);
    }

    const openIndex = bodyStart + body.indexOf('(', constructorIndex);
    const closeIndex = closingIndex(source, openIndex);
    const content = source.slice(openIndex + 1, closeIndex);

    /**
     * A multi-line list may hold comments: append to it as is. A one-line
     * list is rebuilt, one parameter per line once there are several.
     */
    if (content.includes('\n')) {
        return (
            source.slice(0, openIndex + 1) +
            appendItems(content, parameters) +
            source.slice(closeIndex)
        );
    }

    const lineStart = source.lastIndexOf('\n', openIndex) + 1;
    const indent = source.slice(lineStart).match(/^\s*/)?.[0] ?? '';
    return (
        source.slice(0, openIndex + 1) +
        renderParameters([...splitTopLevel(content), ...parameters], indent) +
        source.slice(closeIndex)
    );
};

/**
 * Appends a member at the end of the class body.
 */
export const addClassMember = (
    source: string,
    className: string,
    member: string
) => {
    const classMatch = new RegExp(`class\\s+${className}\\b[^{]*\\{`).exec(
        codeOnly(source)
    );
    if (!classMatch) {
        throw new Error(`Class ${className} not found`);
    }
    const bodyStart = classMatch.index + classMatch[0].length;
    const bodyEnd = closingIndex(source, bodyStart - 1);
    const body = source.slice(bodyStart, bodyEnd).trimEnd();
    const separator = body.trim() ? '\n\n' : '\n';
    return `${source.slice(0, bodyStart)}${body}${separator}    ${member}\n${source.slice(bodyEnd)}`;
};

/**
 * Brackets of the dependency list of `wireClass(className, [...])`.
 */
const wireListRange = (source: string, className: string) => {
    const match = new RegExp(`wireClass\\(\\s*${className}\\s*,\\s*\\[`).exec(
        codeOnly(source)
    );
    if (!match) {
        throw new Error(`wireClass(${className}, [...]) not found`);
    }
    const openIndex = match.index + match[0].length - 1;
    return { openIndex, closeIndex: closingIndex(source, openIndex) };
};

export const wiredDependencyNames = (source: string, className: string) => {
    const { openIndex, closeIndex } = wireListRange(source, className);
    return splitTopLevel(source.slice(openIndex + 1, closeIndex));
};

/**
 * Appends wires to the dependency list of `wireClass(className, [...])`,
 * keeping the existing items as they are.
 */
export const addWireDependencies = (
    source: string,
    className: string,
    wireNames: string[]
) => {
    const { openIndex, closeIndex } = wireListRange(source, className);
    return (
        source.slice(0, openIndex + 1) +
        appendItems(source.slice(openIndex + 1, closeIndex), wireNames) +
        source.slice(closeIndex)
    );
};

const parameterName = (typeName: string) =>
    typeName.substring(0, 1).toLowerCase() + typeName.substring(1);

/**
 * Adds the dependencies to the implementation's wire and constructor, in
 * the same order.
 */
export const wireDependencies = (
    consumer: WiredModule,
    implementation: WiredClass,
    dependencies: WiredModule[]
) => {
    const wireFile = new File(consumer.wireFile);
    let wireSource = wireFile.data;
    for (const dependency of dependencies) {
        wireSource = addImport(
            wireSource,
            `import { ${dependency.wireName} } from '${relativeImport(consumer.wireFile, dependency.wireFile)}'`
        );
    }
    wireFile.update(
        addWireDependencies(
            wireSource,
            implementation.className,
            dependencies.map((x) => x.wireName)
        )
    );

    const classFile = new File(implementation.file);
    let classSource = classFile.data;
    for (const dependency of dependencies) {
        classSource = addImport(
            classSource,
            `import type { ${dependency.typeName} } from '${relativeImport(implementation.file, dependency.typeFile)}'`
        );
    }
    classFile.update(
        addConstructorParameters(
            classSource,
            implementation.className,
            dependencies.map(
                (x) =>
                    `private readonly ${parameterName(x.typeName)}: ${x.typeName}`
            )
        )
    );
};
