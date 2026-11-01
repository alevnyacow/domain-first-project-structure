#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ConfigFile, outdatedConfigMessage } from './config-file';
import {
    formatOfFile,
    type GraphFormat,
    projectGraph,
    renderGraph,
    sharedKernel
} from './project-graph';
import { ProjectRoot } from './project-root';

const help = `Usage: df-graph [--context <name>] [--json | --markdown | --html] [--out <file>]

Shows the project's structure as a Mermaid flowchart, read from the wiring.
Without options it prints the bounded contexts and the Shared Kernel, with
the cross-context ports that reach a neighbor's handlers (solid arrows) and
the use of the Shared Kernel (dashed arrows).

Options:
  --context <name> the wired modules of one bounded context (or shared-kernel)
                   by layer, with their dependencies
  --markdown       wrap the chart in a \`\`\`mermaid block, e.g. for a README
  --json           the graph as JSON: owners, modules and dependencies
  --html           a page with the rendered charts (all contexts without
                   --context), opened in the browser; Mermaid loads from a CDN
  --out <file>     write to a file instead; the extension picks the format:
                   .md, .mmd/.mermaid, .json or .html
  -h, --help       show this help`;

const { values } = parseArgs({
    options: {
        help: { type: 'boolean', short: 'h', default: false },
        context: { type: 'string' },
        json: { type: 'boolean', default: false },
        markdown: { type: 'boolean', default: false },
        html: { type: 'boolean', default: false },
        out: { type: 'string' }
    }
});

if (values.help) {
    console.log(help);
    process.exit(0);
}

const fail = (message: string): never => {
    console.log(message);
    process.exit(1);
};

const flagged = (['json', 'markdown', 'html'] as const).filter(
    (flag) => values[flag]
);
if (flagged.length > 1) fail('Choose one of --json, --markdown and --html.');
const fileFormat =
    values.out === undefined ? undefined : formatOfFile(values.out);
if (values.out !== undefined && !fileFormat)
    fail('--out needs a .md, .mmd, .mermaid, .json or .html file.');
const flagFormat = flagged[0];
if (fileFormat && flagFormat && fileFormat !== flagFormat)
    fail(`--${flagFormat} doesn't match ${values.out}.`);
const format: GraphFormat = fileFormat ?? flagFormat ?? 'mermaid';

if (!ConfigFile.exists)
    fail(
        'No domain-first.project-structure.config.json found: run df-init first to initialize the project.'
    );
if (ConfigFile.outdated) fail(outdatedConfigMessage);
const config = ConfigFile.Instance.data;
if (!config.backend)
    fail('Backend is not configured: run df-init --section backend.');
if (!config.backend?.domainFirstPackages.includes('@domain-first/wire'))
    fail('df-graph reads the wiring: it needs @domain-first/wire.');

const projectRoot = new ProjectRoot().path;
const graph = projectGraph(projectRoot, config.project.rootFolder);
const owner = values.context;
if (owner !== undefined && !graph.owners.includes(owner))
    fail(`Unknown context: ${owner}. Known: ${graph.owners.join(', ')}.`);
if (!graph.modules.length)
    console.error(
        `No wired modules yet: generate some with df-scaffold (${sharedKernel} and bounded contexts are scanned).`
    );

const packageName = (() => {
    try {
        return JSON.parse(
            fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
        ).name as string | undefined;
    } catch {
        return undefined;
    }
})();
const output = renderGraph(graph, format, {
    owner,
    title: [packageName ?? path.basename(projectRoot), owner]
        .filter(Boolean)
        .join(' / ')
});

/** Opens a file in the default browser; prints the path when that fails. */
const openInBrowser = (file: string) => {
    const [command, args] =
        process.platform === 'darwin'
            ? ['open', [file]]
            : process.platform === 'win32'
              ? ['cmd', ['/c', 'start', '', file]]
              : ['xdg-open', [file]];
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => console.log(`Open ${file} in a browser.`));
    child.unref();
};

if (values.out !== undefined) {
    const file = path.resolve(values.out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${output}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), file) || file}.`);
} else if (format === 'html') {
    const file = path.join(
        os.tmpdir(),
        `df-graph-${(packageName ?? path.basename(projectRoot)).replace(/[^\w-]+/g, '-')}${owner ? `-${owner}` : ''}.html`
    );
    fs.writeFileSync(file, output);
    console.log(`Wrote ${file}; opening it in the browser.`);
    openInBrowser(file);
} else {
    console.log(output);
}
