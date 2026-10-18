#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { ConfigFile, configuredDependencyRules } from './config-file';
import { formatViolations, lintProject } from './project-lint';
import { ProjectRoot } from './project-root';

const help = `Usage: df-lint [rootFolder]

Reports what breaks the Domain-First rules in the project:
bounded context isolation, layers, dependency rules (imports and wiring),
React modules, and reading the time without the clock port.
rootFolder defaults to the one in domain-first.project-structure.config.json,
whose optional \`rules\` change the dependency rules and turn checks off.
Exits with 1 when something is found.

Options:
  -h, --help show this help`;

const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { help: { type: 'boolean', short: 'h', default: false } }
});

if (values.help) {
    console.log(help);
    process.exit(0);
}

const projectRoot = new ProjectRoot().path;
const config = ConfigFile.exists ? ConfigFile.Instance.data : undefined;
const rootFolder = positionals[0] ?? config?.rootFolder ?? 'src';
const violations = lintProject(projectRoot, rootFolder, {
    rules: configuredDependencyRules(),
    checks: config?.rules?.lint
});

if (violations.length) {
    console.log(formatViolations(violations, projectRoot));
    console.log(`\n${violations.length} problem(s) found.`);
    process.exit(1);
}
console.log('OK: no Domain-First rule violations.');
