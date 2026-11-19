import { parseArgs } from 'node:util';
import { select } from '@inquirer/prompts';
import { runCLI } from './agent-cli';
import { ConfigFile, outdatedConfigMessage } from './config-file';
import { Folder } from './file-system';
import { frontendMenu, frontendOperations } from './frontend-modules';
import { ProjectRoot } from './project-root';
import type { FrontendFramework } from './react-module-move';
import { savePendingChanges } from './save-pending-changes';

const texts: Record<
    FrontendFramework,
    { command: 'df-react' | 'df-svelte'; help: string; notConfigured: string }
> = {
    react: {
        command: 'df-react',
        help: `Usage: df-react

Scaffolds React modules of a Domain-First project: pages, widgets, UI-kit
components and shared hooks, and moves or renames pages and widgets.
Needs frontend.react in domain-first.project-structure.config.json.`,
        notConfigured:
            'React is not configured: run df-init --section frontend or add Storybook with df-integration.'
    },
    svelte: {
        command: 'df-svelte',
        help: `Usage: df-svelte

Scaffolds Svelte 5 modules of a Domain-First project: pages, widgets, UI-kit
components and shared models (create… in .svelte.ts), and moves, renames or deletes
them. With SvelteKit, pages get their routes in src/routes.
Needs frontend.svelte in domain-first.project-structure.config.json.`,
        notConfigured:
            'Svelte is not configured: run df-init --section frontend.'
    }
};

/** The interactive menu and agent mode of df-react and df-svelte. */
export const runFrontendCLI = (framework: FrontendFramework) => {
    const { command, help, notConfigured } = texts[framework];
    return runCLI(command, async () => {
        const { values } = parseArgs({
            options: { help: { type: 'boolean', short: 'h', default: false } }
        });

        if (values.help) {
            console.log(`${help}

Options:
  --request <json|-> execute an operation without prompts; - reads stdin
  --describe         output request schema and project IDs as JSON
  -h, --help show this help`);
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

        if (!ConfigFile.Instance.data.frontend?.[framework]) {
            console.log(notConfigured);
            process.exit(1);
        }

        const folder = new Folder(new ProjectRoot().path).subitem([
            ConfigFile.Instance.data.project.rootFolder,
            'presentation',
            framework
        ]);
        const operation = await select({
            message: 'Module: ',
            choices: frontendMenu(framework).map(([name, value]) => ({
                name,
                value
            }))
        });
        await frontendOperations(folder, framework)[operation]();
        await savePendingChanges();
    }).catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
};
