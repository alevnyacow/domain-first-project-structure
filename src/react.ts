#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { select } from '@inquirer/prompts';
import { runCLI } from './agent-cli';
import { ConfigFile, outdatedConfigMessage } from './config-file';
import { Folder } from './file-system';
import { ProjectRoot } from './project-root';
import { savePendingChanges } from './save-pending-changes';
import {
    moveReactModuleUseCase,
    scaffoldReactPage,
    scaffoldReactSharedHook,
    scaffoldReactUIKitComponent,
    scaffoldReactWidget
} from './use-cases';

void runCLI('df-react', async () => {
    const help = `Usage: df-react

Scaffolds React modules of a Domain-First project: pages, widgets, UI-kit
components and shared hooks, and moves or renames pages and widgets.
Needs frontend.react in domain-first.project-structure.config.json.

Options:
  --request <json|-> execute an operation without prompts; - reads stdin
  --describe         output request schema and project IDs as JSON
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

    if (ConfigFile.outdated) {
        console.log(outdatedConfigMessage);
        process.exit(1);
    }

    if (!ConfigFile.Instance.data.frontend?.react) {
        console.log(
            'React is not configured: run df-init --section frontend or add Storybook with df-integration.'
        );
        process.exit(1);
    }

    const main = async () => {
        const reactFolder = new Folder(new ProjectRoot().path).subitem([
            ConfigFile.Instance.data.project.rootFolder,
            'presentation',
            'react'
        ]);
        const action = await select({
            message: 'Module: ',
            choices: [
                'New widget',
                'New page',
                'New UI-kit component',
                'New shared hook',
                'Move or rename widget',
                'Move or rename page'
            ]
        });
        switch (action) {
            case 'New widget': {
                await scaffoldReactWidget(reactFolder);
                return;
            }
            case 'New page': {
                await scaffoldReactPage(reactFolder);
                return;
            }
            case 'New UI-kit component': {
                await scaffoldReactUIKitComponent(reactFolder);
                return;
            }
            case 'New shared hook': {
                await scaffoldReactSharedHook(reactFolder);
                return;
            }
            case 'Move or rename widget': {
                await moveReactModuleUseCase(reactFolder, 'widget');
                return;
            }
            case 'Move or rename page': {
                await moveReactModuleUseCase(reactFolder, 'page');
                return;
            }
            default: {
                return;
            }
        }
    };

    const run = async () => {
        await main();

        await savePendingChanges();
    };

    await run();
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
