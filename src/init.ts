#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { printNextSteps } from './print-next-steps';
import { savePendingChanges } from './save-pending-changes';
import { initializeUseCase } from './use-cases';
import {
    type ConfigurationSection,
    configurationSections
} from './use-cases/initialize';

const help = `Usage: df-init [--section project|backend|frontend]

Configures project, backend and frontend in order. Any section
can be deferred and configured later by rerunning df-init or selecting
--section. Backend setup writes editable default dependency rules and lint
checks into backend.rules, preserving existing entries and saved choices.
Frontend selects React or Next.js; Next.js offers handlers-next REST setup
when backend is configured.
Migrates the legacy config and implementation choices into sections in
domain-first.project-structure.config.json. Prints install commands;
nothing is installed.

Options:
  --section <name> configure one section
  -h, --help      show this help`;

const { values } = parseArgs({
    options: {
        help: { type: 'boolean', short: 'h', default: false },
        section: { type: 'string' }
    }
});

if (values.help) {
    console.log(help);
    process.exit(0);
}

if (
    values.section !== undefined &&
    !configurationSections.includes(values.section as ConfigurationSection)
) {
    console.error('Unknown section: use project, backend or frontend.');
    process.exit(1);
}

const run = async () => {
    const nextSteps = await initializeUseCase(
        values.section as ConfigurationSection | undefined
    );
    if (await savePendingChanges()) {
        printNextSteps(nextSteps);
    }
};

run();
