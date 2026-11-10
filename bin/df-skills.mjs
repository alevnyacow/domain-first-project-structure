#!/usr/bin/env node

import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkbox, confirm, select } from '@inquirer/prompts';
import { applyPrinciples, principlesState } from '../dist/agent-principles.js';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_SOURCE = join(PACKAGE_ROOT, 'skills');
const PRINCIPLES_SOURCE = join(PACKAGE_ROOT, 'principles', 'df-principles.md');

const AGENTS = {
    claude: { title: 'Claude Code', folder: join('.claude', 'skills'), entry: 'CLAUDE.md' },
    codex: { title: 'Codex', folder: join('.agents', 'skills'), entry: 'AGENTS.md' },
};

const HELP = `Usage: df-skills [options]

Copies Domain-First (df-ps) agent skills into your project.
Runs interactively when no agent is given.

Options:
  --claude      install for Claude Code (.claude/skills)
  --codex       install for Codex (.agents/skills)
  --global      install into the home directory instead of the current project
  --principles  connect the programming principles to CLAUDE.md and AGENTS.md
                (connected ones are refreshed without this flag; not with --global)
  -h, --help    show this help`;

const { values } = parseArgs({
    options: {
        claude: { type: 'boolean', default: false },
        codex: { type: 'boolean', default: false },
        global: { type: 'boolean', default: false },
        principles: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
    },
});

if (values.help) {
    console.log(HELP);
    process.exit(0);
}

const principles = readFileSync(PRINCIPLES_SOURCE, 'utf8');

const refuse = (message) => {
    console.error(message);
    process.exit(1);
};

if (values.principles && values.global) {
    refuse('--principles is not available with --global: they apply to one project.');
}
if (values.principles && !principles.trim()) {
    refuse('This version of the package has no programming principles to connect.');
}

const skills = readdirSync(SKILLS_SOURCE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

const interactive = !values.claude && !values.codex;

const agents = interactive
    ? await checkbox({
          message: 'Install skills for',
          choices: Object.entries(AGENTS).map(([value, { title }]) => ({
              value,
              name: title,
              checked: value === 'claude',
          })),
          required: true,
      })
    : Object.keys(AGENTS).filter((agent) => values[agent]);

const global =
    interactive && !values.global
        ? await select({
              message: 'Install into',
              choices: [
                  { value: false, name: `This project (${process.cwd()})` },
                  { value: true, name: `Home directory (${homedir()})` },
              ],
          })
        : values.global;

const root = global ? homedir() : process.cwd();

// The principles of one architecture don't belong in every project of the user.
const withPrinciples = !global && Boolean(principles.trim());
const notConnected = withPrinciples
    ? agents.filter((agent) => principlesState(root, agent) === 'absent')
    : [];
const installPrinciples =
    values.principles ||
    (interactive && notConnected.length > 0
        ? await confirm({
              message: `Add the programming principles to ${notConnected
                  .map((agent) => AGENTS[agent].entry)
                  .join(' and ')}?`,
              default: true,
          })
        : false);

for (const agent of agents) {
    const target = join(root, AGENTS[agent].folder);
    console.log(`\n${AGENTS[agent].title} → ${global ? target : relative(root, target)}`);

    for (const skill of skills) {
        const destination = join(target, skill);
        const existed = existsSync(destination);
        // Replace the whole folder so files removed upstream don't linger.
        rmSync(destination, { recursive: true, force: true });
        cpSync(join(SKILLS_SOURCE, skill), destination, { recursive: true });
        console.log(`  ${existed ? 'updated' : 'added  '} ${skill}`);
    }

    if (!withPrinciples) continue;
    const result = applyPrinciples(root, agent, principles, installPrinciples);
    if (result === 'conflict') {
        console.warn(
            `  skipped principles: fix the df-principles markers in ${AGENTS[agent].entry} (one start, then one end)`
        );
    } else if (result !== 'skipped') {
        console.log(`  ${result === 'updated' ? 'updated' : 'added  '} principles`);
    }
}
