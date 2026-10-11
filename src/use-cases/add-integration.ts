import { styleText } from 'node:util';
import { select } from '@inquirer/prompts';
import {
    addPlaywright,
    addPrisma,
    addStorybook,
    addVitest,
    missingDomainFirstPackages
} from '../integrations';
import { savePendingChanges } from '../save-pending-changes';

const integrations = [
    { name: 'Storybook (React + Vite)', run: addStorybook },
    { name: 'Prisma 8 (PostgreSQL, RC)', run: addPrisma },
    { name: 'Vitest', run: addVitest },
    { name: 'Playwright', run: addPlaywright },
    { name: 'Missing domain-first packages', run: missingDomainFirstPackages }
];

export const addIntegration = async () => {
    const index = await select({
        message: 'Integration:',
        choices: integrations.map((integration, value) => ({
            name: integration.name,
            value
        }))
    });
    const nextSteps = await integrations[index].run();
    if (await savePendingChanges()) {
        const isCommand = (line: string) =>
            /^\s*(?:npm (?:i|install)|npx playwright install)\b/.test(line);
        const commands = nextSteps.filter(isCommand);
        const notes = nextSteps.filter((line) => !isCommand(line));
        const sections = [];
        if (commands.length) {
            sections.push(
                [
                    'Run these commands to install the required dependencies:',
                    ...commands.map((line) => styleText(['bold', 'cyan'], line))
                ].join('\n')
            );
        }
        if (notes.length) {
            sections.push(
                [
                    'Additional information:',
                    ...notes.map((line) =>
                        line.replace(
                            /^(\s*Add )(!\S+)/,
                            (_, prefix, path) =>
                                prefix + styleText(['bold', 'cyan'], path)
                        )
                    )
                ].join('\n')
            );
        }
        if (sections.length) console.log(sections.join('\n\n'));
    }
};
