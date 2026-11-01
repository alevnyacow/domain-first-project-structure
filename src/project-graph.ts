import fs from 'node:fs';
import path from 'node:path';
import { File } from './file-system';
import { readAliases, resolveSpecifier } from './project-lint';
import {
    findWiredModules,
    type Layer,
    layers,
    namedImportFiles,
    type WiredModule,
    wiredDependencyNames
} from './wiring';

export const sharedKernel = 'shared-kernel';

export type GraphModule = {
    /** `<owner>:<TypeName>`, the module ID of the JSON interface. */
    id: string;
    owner: string;
    typeName: string;
    layer: Layer;
    /** Implementation classes; several for an env-branched module. */
    implementations: string[];
};

export type GraphEdge = {
    from: string;
    to: string;
    /** The implementation class that takes the dependency. */
    implementation: string;
};

export type ProjectGraph = {
    owners: string[];
    modules: GraphModule[];
    edges: GraphEdge[];
};

const contextsOf = (contextsFolder: string) =>
    fs.existsSync(contextsFolder)
        ? fs
              .readdirSync(contextsFolder, { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name)
              .sort()
        : [];

/**
 * Wired modules of the Shared Kernel and every bounded context, and the
 * dependencies their wires inject, per implementation.
 */
export const projectGraph = (
    projectRoot: string,
    rootFolder: string
): ProjectGraph => {
    const root = path.resolve(projectRoot, rootFolder);
    const contextsFolder = path.join(root, 'bounded-contexts');
    const owners = [sharedKernel, ...contextsOf(contextsFolder)];
    const ownerPath = (owner: string) =>
        owner === sharedKernel
            ? path.join(root, sharedKernel)
            : path.join(contextsFolder, owner);

    const byWireFile = new Map<string, GraphModule>();
    const wired: [WiredModule, GraphModule][] = [];
    for (const owner of owners) {
        for (const module of findWiredModules(ownerPath(owner))) {
            const node = {
                id: `${owner}:${module.typeName}`,
                owner,
                typeName: module.typeName,
                layer: module.layer,
                implementations: module.implementations.map(
                    ({ className }) => className
                )
            };
            byWireFile.set(module.wireFile, node);
            wired.push([module, node]);
        }
    }

    const aliases = readAliases(projectRoot);
    const edges: GraphEdge[] = [];
    for (const [module, node] of wired) {
        const source = new File(module.wireFile).data;
        const imported = namedImportFiles(
            source,
            module.wireFile,
            (specifier, file) => resolveSpecifier(specifier, file, aliases)
        );
        for (const { className } of module.implementations) {
            for (const name of wiredDependencyNames(source, className)) {
                const file = imported.get(name);
                const target = file && byWireFile.get(file);
                if (target)
                    edges.push({
                        from: node.id,
                        to: target.id,
                        implementation: className
                    });
            }
        }
    }

    return {
        owners,
        modules: wired.map(([, node]) => node),
        edges
    };
};

const sanitize = (value: string) => value.replace(/[^A-Za-z0-9]/g, '_');
const quoted = (value: string) => `"${value.replace(/"/g, '#quot;')}"`;
const ownerOf = (graph: ProjectGraph, id: string) =>
    graph.modules.find((module) => module.id === id)?.owner;
const typeOf = (graph: ProjectGraph, id: string) =>
    graph.modules.find((module) => module.id === id)?.typeName ?? id;

/**
 * Bounded contexts and the Shared Kernel. A solid arrow is a cross-context
 * port reaching a neighbor's handlers; a dashed one, use of the Shared Kernel.
 */
export const contextMap = (graph: ProjectGraph, idPrefix = '') => {
    const nodeId = (value: string) => `${idPrefix}${sanitize(value)}`;
    const links = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
        const from = ownerOf(graph, edge.from);
        const to = ownerOf(graph, edge.to);
        if (!from || !to || from === to) continue;
        const key = `${from}\u0000${to}`;
        const set = links.get(key) ?? new Set<string>();
        set.add(
            to === sharedKernel
                ? typeOf(graph, edge.to)
                : `${typeOf(graph, edge.from)} → ${typeOf(graph, edge.to)}`
        );
        links.set(key, set);
    }
    const lines = ['flowchart LR'];
    for (const owner of graph.owners) {
        lines.push(
            owner === sharedKernel
                ? `    ${nodeId(owner)}[(${quoted(owner)})]`
                : `    ${nodeId(owner)}[${quoted(owner)}]`
        );
    }
    for (const [key, labels] of [...links].sort(([a], [b]) =>
        a.localeCompare(b)
    )) {
        const [from, to] = key.split('\u0000');
        const label = [...labels].sort().join('<br/>');
        lines.push(
            to === sharedKernel
                ? `    ${nodeId(from)} -.->|${quoted(label)}| ${nodeId(to)}`
                : `    ${nodeId(from)} -->|${quoted(label)}| ${nodeId(to)}`
        );
    }
    return lines.join('\n');
};

/**
 * The wired modules of one owner by layer, with their dependencies. Modules
 * of other owners it depends on are grouped under their owner. A branched
 * module's arrows name the implementations that take the dependency.
 */
export const ownerGraph = (
    graph: ProjectGraph,
    owner: string,
    idPrefix = ''
) => {
    const nodeId = (value: string) => `${idPrefix}${sanitize(value)}`;
    const own = graph.modules.filter((module) => module.owner === owner);
    const ownIds = new Set(own.map((module) => module.id));
    const edges = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
        if (!ownIds.has(edge.from)) continue;
        const key = `${edge.from}\u0000${edge.to}`;
        const set = edges.get(key) ?? new Set<string>();
        set.add(edge.implementation);
        edges.set(key, set);
    }
    const external = [
        ...new Set(
            [...edges.keys()]
                .map((key) => key.split('\u0000')[1])
                .filter((id) => !ownIds.has(id))
        )
    ].sort();

    const lines = ['flowchart TB'];
    const node = (id: string) => `${nodeId(id)}[${quoted(typeOf(graph, id))}]`;
    for (const layer of layers) {
        const members = own.filter((module) => module.layer === layer);
        if (!members.length) continue;
        lines.push(
            `    subgraph ${nodeId(`${owner}_${layer}`)}[${quoted(layer)}]`
        );
        for (const module of members) lines.push(`        ${node(module.id)}`);
        lines.push('    end');
    }
    for (const other of [
        ...new Set(external.map((id) => ownerOf(graph, id) ?? ''))
    ]) {
        lines.push(
            `    subgraph ${nodeId(`owner_${other}`)}[${quoted(other)}]`
        );
        for (const id of external.filter((x) => ownerOf(graph, x) === other))
            lines.push(`        ${node(id)}`);
        lines.push('    end');
    }
    for (const [key, implementations] of [...edges].sort(([a], [b]) =>
        a.localeCompare(b)
    )) {
        const [from, to] = key.split('\u0000');
        const all =
            graph.modules.find((module) => module.id === from)?.implementations
                .length ?? 0;
        // Only a dependency some implementations don't take is labelled.
        const label =
            implementations.size < all
                ? `|${quoted([...implementations].sort().join(', '))}|`
                : '';
        lines.push(`    ${nodeId(from)} -->${label} ${nodeId(to)}`);
    }
    return lines.join('\n');
};

export type GraphFormat = 'mermaid' | 'markdown' | 'json' | 'html';

/** The format a `--out` file gets from its extension. */
export const formatOfFile = (file: string): GraphFormat | undefined =>
    (
        ({
            '.md': 'markdown',
            '.mmd': 'mermaid',
            '.mermaid': 'mermaid',
            '.json': 'json',
            '.html': 'html'
        }) as const
    )[path.extname(file).toLowerCase()];

const escapeHtml = (value: string) =>
    value.replace(
        /[&<>"]/g,
        (char) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ??
            char
    );

/** Mermaid version the HTML page loads; pinned so the page keeps working. */
export const mermaidScript =
    'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs';

/**
 * A page that renders the charts with Mermaid from a CDN: the context map
 * and every context, or one context.
 */
export const graphHtml = (
    graph: ProjectGraph,
    title: string,
    owner?: string
) => {
    // Charts on one page need their own node IDs, or Mermaid mixes them up.
    const sections = owner
        ? [[owner, ownerGraph(graph, owner, 'c0_')]]
        : [
              ['Bounded contexts', contextMap(graph, 'c0_')],
              ...graph.owners
                  .filter((name) =>
                      graph.modules.some((module) => module.owner === name)
                  )
                  .map((name, index) => [
                      name,
                      ownerGraph(graph, name, `c${index + 1}_`)
                  ])
          ];
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body { margin: 0 auto; max-width: 1200px; padding: 24px 16px; font-family: ui-monospace, Menlo, Consolas, monospace; background: #fafaf7; color: #1d1d1b; }
h1 { font-size: 22px; } h2 { margin-top: 40px; font-size: 18px; border-bottom: 2px solid #1d1d1b; padding-bottom: 6px; }
.mermaid { overflow-x: auto; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${sections
    .map(
        ([name, chart]) =>
            `<h2>${escapeHtml(name)}</h2>\n<pre class="mermaid">\n${escapeHtml(chart)}\n</pre>`
    )
    .join('\n')}
<script type="module">
import mermaid from '${mermaidScript}';
mermaid.initialize({ startOnLoad: false });
// One chart at a time: charts rendered together disturb each other's layout.
for (const node of document.querySelectorAll('.mermaid')) {
    await mermaid.run({ nodes: [node] });
}
</script>
</body>
</html>
`;
};

/** The graph in a format: one owner with `owner`, otherwise the whole project. */
export const renderGraph = (
    graph: ProjectGraph,
    format: GraphFormat,
    {
        owner,
        title = 'Project structure'
    }: { owner?: string; title?: string } = {}
) => {
    if (format === 'html') return graphHtml(graph, title, owner);
    if (format === 'json') {
        const modules = owner
            ? graph.modules.filter((module) => module.owner === owner)
            : graph.modules;
        const ids = new Set(modules.map((module) => module.id));
        return JSON.stringify({
            owners: owner ? [owner] : graph.owners,
            modules,
            edges: owner
                ? graph.edges.filter((edge) => ids.has(edge.from))
                : graph.edges
        });
    }
    const chart = owner ? ownerGraph(graph, owner) : contextMap(graph);
    return format === 'markdown' ? `\`\`\`mermaid\n${chart}\n\`\`\`` : chart;
};
