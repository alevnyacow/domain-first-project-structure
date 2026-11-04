#!/usr/bin/env node

import path from 'node:path';
import { parseArgs } from 'node:util';
import { confirm } from '@inquirer/prompts';
import { ConfigFile, configFileName } from './config-file';
import {
    discardPendingChanges,
    File,
    writePendingChanges
} from './file-system';
import { ProjectRoot } from './project-root';
import { type PlannedStep, planUpgrade, skillsNote } from './upgrade-steps';

const help = `Usage: df-upgrade [--dry-run] [--yes]

Brings the project up to date after upgrading @domain-first/project-structure.
Finds the steps the project needs, shows what each one changes, asks once
and applies them together. Other commands refuse a config of an earlier
major version until it is upgraded; optional steps move generated code to
the current layout.

Options:
  --dry-run  show the plan without writing anything
  --yes      apply without asking, optional steps included
  -h, --help show this help`;

const { values } = parseArgs({
    options: {
        help: { type: 'boolean', short: 'h', default: false },
        'dry-run': { type: 'boolean', default: false },
        yes: { type: 'boolean', short: 'y', default: false }
    }
});

if (values.help) {
    console.log(help);
    process.exit(0);
}

const printStep = ({ step, changes }: PlannedStep) => {
    console.log(
        `\n${step.title}${step.kind === 'optional' ? ' (optional)' : ''}`
    );
    for (const change of changes) console.log(`  ${change}`);
};

const run = async () => {
    const root = new ProjectRoot().path;
    const configPath = path.join(root, configFileName);
    if (!ConfigFile.exists) {
        console.log(
            `No ${configFileName} found: run df-init to initialize the project.`
        );
        process.exit(1);
    }
    let raw: unknown;
    try {
        raw = JSON.parse(new File(configPath).data);
    } catch {
        console.log(`${configFileName} is not valid JSON: fix it first.`);
        process.exit(1);
    }

    const dryRun = values['dry-run'];
    const { planned, changed, config } = await planUpgrade(raw, (entry) => {
        if (dryRun || values.yes) return true;
        printStep(entry);
        return confirm({ message: 'Apply this optional step?', default: true });
    });

    if (!changed) {
        console.log('Everything is up to date.');
        return;
    }

    console.log('Upgrade plan:');
    for (const entry of planned.filter(({ step }) => step.kind !== 'manual'))
        printStep(entry);
    const manual = [
        ...planned
            .filter(({ step }) => step.kind === 'manual')
            .flatMap(({ changes }) => changes),
        skillsNote
    ];

    if (dryRun) {
        console.log('\nDry run: nothing was written.');
        return;
    }
    if (!values.yes && !(await confirm({ message: 'Apply?', default: true }))) {
        discardPendingChanges();
        console.log('Cancelled: nothing was written.');
        return;
    }
    if (config) ConfigFile.write(config);
    writePendingChanges();
    console.log(config ? `\nUpgraded ${configFileName}.` : '\nUpgraded.');
    console.log('\nDo it yourself:');
    for (const note of manual) console.log(`  ${note}`);
};

run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
