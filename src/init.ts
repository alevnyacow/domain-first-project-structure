#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { ConfigFile } from './config-file';
import { printNextSteps } from './print-next-steps';
import { savePendingChanges } from './save-pending-changes';
import { initializeUseCase } from './use-cases';

const help = `Usage: df-init

Initializes a Domain-First project: asks for the source folder, the
@domain-first packages, the default persistence implementation, the shared
in-memory DB, React, Storybook and the testing library, writes
domain-first.project-structure.config.json and scaffolds the Shared Kernel
files they need. Prints the install command; nothing is installed.

Options:
  -h, --help show this help`;

const { values } = parseArgs({
    options: { help: { type: 'boolean', short: 'h', default: false } }
});

if (values.help) {
    console.log(help);
    process.exit(0);
}

if (ConfigFile.exists) {
    console.log(
        'domain-first.project-structure.config.json already exists: edit it or add Shared Kernel files with df-integration.'
    );
    process.exit(1);
}

const run = async () => {
    const nextSteps = await initializeUseCase();
    if (await savePendingChanges()) {
        printNextSteps(nextSteps);
    }
};

run();
