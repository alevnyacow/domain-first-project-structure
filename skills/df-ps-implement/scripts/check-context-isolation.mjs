#!/usr/bin/env node
/**
 * Reports imports that cross bounded-context boundaries outside the allowed places.
 *
 * Usage (from the project root):
 *   node check-context-isolation.mjs [rootFolder]
 * rootFolder defaults to `rootFolder` in domain-first.project-structure.config.json.
 *
 * Bounded contexts never import each other (no exceptions).
 * Allowed: shared/** may import any context's domain/errors; the shared in-memory DB
 * (shared/infrastructure/services/in-memory-db-infrastructure-service.ts) may also import any
 * context's domain models: domain/aggregates/** (barrels included, `*-repository` files not),
 * domain/entities/**, domain/value-objects/**; presentation/react/** may only
 * `import type` from a context's presentation/rest/; presentation/react/ui-kit/** imports
 * nothing from bounded contexts, widgets or pages.
 * Widgets never import each other: a file of one widget (the nearest folder under widgets/
 * that has a `*-widget.tsx`) must not import anything of another widget.
 * Everything else that imports another bounded context is reported.
 *
 * Checked: `import … from`, `export … from`, side-effect `import '…'`, `import('…')`,
 * `require('…')`; specifiers are resolved as relative paths or tsconfig `paths` aliases.
 * Exit code 1 when violations are found.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const cwd = process.cwd();

const readRootFolder = () => {
    const configPath = path.join(cwd, 'domain-first.project-structure.config.json');
    if (!fs.existsSync(configPath)) return 'src';
    return JSON.parse(fs.readFileSync(configPath, 'utf8')).rootFolder ?? 'src';
};

const root = path.resolve(cwd, process.argv[2] ?? readRootFolder());
const contextsDir = path.join(root, 'bounded-contexts');
const sharedDir = path.join(root, 'shared');
const reactDir = path.join(root, 'presentation', 'react');
const uiKitDir = path.join(reactDir, 'ui-kit');
const widgetsDir = path.join(reactDir, 'widgets');
const inMemoryDbFile = path.join(sharedDir, 'infrastructure', 'services', 'in-memory-db-infrastructure-service.ts');

// Domain models of a context: aggregate roots, entities and value objects, not repository contracts.
const isDomainModel = (target, layer, part) =>
    layer === 'domain' &&
    ['aggregates', 'entities', 'value-objects'].includes(part) &&
    !/-repository(\.tsx?)?$/.test(path.basename(target));

// tsconfig `paths` → [{ prefix, wildcard, targets }]
const readTsconfig = (file) => {
    try {
        const ts = createRequire(path.join(cwd, 'package.json'))('typescript');
        const { config, error } = ts.readConfigFile(file, ts.sys.readFile);
        if (!error) return config;
    } catch {}
    const text = fs
        .readFileSync(file, 'utf8')
        .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, str) => str ?? '')
        .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(text);
};

const readAliases = () => {
    const file = path.join(cwd, 'tsconfig.json');
    if (!fs.existsSync(file)) return [];
    let options;
    try {
        options = readTsconfig(file).compilerOptions ?? {};
    } catch (e) {
        console.warn(`WARNING: cannot parse tsconfig.json (${e.message}); aliases are not checked\n`);
        return [];
    }
    const base = path.resolve(cwd, options.baseUrl ?? '.');
    return Object.entries(options.paths ?? {})
        .map(([key, targets]) => {
            const wildcard = key.endsWith('*');
            return {
                prefix: wildcard ? key.slice(0, -1) : key,
                wildcard,
                targets: targets.map((t) => path.resolve(base, wildcard ? t.replace(/\*$/, '') : t)),
            };
        })
        .sort((a, b) => b.prefix.length - a.prefix.length);
};

const aliases = readAliases();

// Absolute path a specifier points to, or null for a package.
const resolveSpecifier = (spec, fromFile) => {
    if (spec.startsWith('.')) return path.resolve(path.dirname(fromFile), spec);
    for (const { prefix, wildcard, targets } of aliases) {
        if (wildcard ? spec.startsWith(prefix) : spec === prefix) {
            return path.join(targets[0], wildcard ? spec.slice(prefix.length) : '');
        }
    }
    return null;
};

const inside = (dir, file) => {
    const rel = path.relative(dir, file);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep) : null;
};

const sourceFiles = (dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
        return /\.(c|m)?tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [full] : [];
    });
};

// One alternation, scanned left to right, so a match never spans two statements.
const importPattern =
    /\b(?:(import|export)\s+(type\s+)?(?:(?!\b(?:import|export)\b)[\w*{}\s,$])*?\s*from\s*|import\s*\(\s*|require\s*\(\s*|import\s*)(['"])([^'"\n]+)\3/g;

const importsOf = (file) => {
    const text = fs.readFileSync(file, 'utf8');
    return [...text.matchAll(importPattern)].map((m) => ({
        typeOnly: m[1] === 'import' && Boolean(m[2]),
        target: resolveSpecifier(m[4], file),
        line: text.slice(0, m.index).split('\n').length,
        statement: m[0].replace(/\s+/g, ' '),
    }));
};

const contexts = fs.existsSync(contextsDir)
    ? fs
          .readdirSync(contextsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort()
    : [];

// Folder of the widget a path belongs to: the nearest folder under widgets/ with a `*-widget.tsx`.
const widgetCache = new Map();
const isWidgetFolder = (dir) => {
    if (!widgetCache.has(dir)) {
        widgetCache.set(
            dir,
            fs.existsSync(dir) &&
                fs.statSync(dir).isDirectory() &&
                fs.readdirSync(dir).some((name) => name.endsWith('-widget.tsx')),
        );
    }
    return widgetCache.get(dir);
};
const widgetOf = (target) => {
    if (!inside(widgetsDir, target)) return null;
    for (let dir = target; inside(widgetsDir, dir); dir = path.dirname(dir)) {
        if (isWidgetFolder(dir)) return dir;
    }
    return null;
};

const violations = new Map();
const report = (title, file, imp) => {
    if (!violations.has(title)) violations.set(title, []);
    violations.get(title).push(`${path.relative(cwd, file)}:${imp.line}: ${imp.statement}`);
};

const scanned = [contextsDir, sharedDir, reactDir].flatMap(sourceFiles);

for (const file of scanned) {
    const ownContext = inside(contextsDir, file)?.[0];
    for (const imp of importsOf(file)) {
        if (!imp.target) continue;
        const [targetContext, layer, part] = inside(contextsDir, imp.target) ?? [];
        const allowedInMemoryDbImport = file === inMemoryDbFile && isDomainModel(imp.target, layer, part);

        if (ownContext) {
            if (targetContext && targetContext !== ownContext) report(`[${ownContext}] imports another context:`, file, imp);
        } else if (inside(sharedDir, file)) {
            if (targetContext && !(layer === 'domain' && part === 'errors') && !allowedInMemoryDbImport) {
                report('[shared] imports a bounded context outside its domain/errors (and domain models for the in-memory DB):', file, imp);
            }
        } else if (inside(uiKitDir, file)) {
            const [area] = inside(reactDir, imp.target) ?? [];
            if (targetContext || area === 'widgets' || area === 'pages') {
                report('[presentation/react/ui-kit] imports a bounded context, widget or page:', file, imp);
            }
        } else if (targetContext && !(imp.typeOnly && layer === 'presentation' && part === 'rest')) {
            report('[presentation/react] imports a context other than `import type` from presentation/rest:', file, imp);
        }

        const ownWidget = widgetOf(file);
        const targetWidget = widgetOf(imp.target);
        if (ownWidget && targetWidget && targetWidget !== ownWidget) {
            report('[presentation/react/widgets] a widget imports another widget:', file, imp);
        }
    }
}

for (const [title, lines] of violations) {
    console.log(title);
    for (const line of lines) console.log(`  ${line}`);
    console.log();
}

if (violations.size === 0) {
    console.log(`OK: no cross-context or cross-widget import violations (${contexts.length} contexts)`);
}
process.exit(violations.size === 0 ? 0 : 1);
