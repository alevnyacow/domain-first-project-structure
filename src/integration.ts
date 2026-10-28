#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { ConfigFile } from './config-file';
import { addIntegration } from './use-cases';

const help = `Usage: df-integration

Adds integrations to a Domain-First project: the REST endpoint generator,
the in-memory DB, Storybook, Prisma, Vitest, Playwright, integration tests,
OpenAPI and Orval. Several can be selected at once. Changes project files and prints
the install commands; nothing is installed or run.

Options:
  -h, --help show this help`;

const { values } = parseArgs({
    options: { help: { type: 'boolean', short: 'h', default: false } }
});

if (values.help) {
    console.log(help);
    process.exit(0);
}

if (!ConfigFile.exists) {
    console.log(
        'No domain-first.project-structure.config.json found: run df-init first to initialize the project.'
    );
    process.exit(1);
}

addIntegration();
