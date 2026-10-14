#!/usr/bin/env node

import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkbox, select } from '@inquirer/prompts';

const SKILLS_SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills');

const AGENTS = {
    claude: { title: 'Claude Code', folder: join('.claude', 'skills') },
    codex: { title: 'Codex', folder: join('.agents', 'skills') },
};

const HELP = `Usage: df-skills [options]

Copies Domain-First (df-ps) agent skills into your project.
Runs interactively when no agent is given.

Options:
  --claude   install for Claude Code (.claude/skills)
  --codex    install for Codex (.agents/skills)
  --global   install into the home directory instead of the current project
  -h, --help show this help`;

const { values } = parseArgs({
    options: {
        claude: { type: 'boolean', default: false },
        codex: { type: 'boolean', default: false },
        global: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
    },
});

if (values.help) {
    console.log(HELP);
    process.exit(0);
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
}
