import { styleText } from 'node:util';
import { select } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import {
    addOpenapi,
    addOrval,
    addPlaywright,
    addPrisma,
    addStorybook,
    addVitest,
    missingDomainFirstPackages
} from '../integrations';
import { savePendingChanges } from '../save-pending-changes';

const withHandlersRest = () =>
    ConfigFile.Instance.data.domainFirstPackages.includes(
        '@domain-first/handlers-rest'
    );

const integrations: {
    name: string;
    run: () => string[] | Promise<string[]>;
    available?: () => boolean;
}[] = [
    { name: 'Storybook (React + Vite)', run: addStorybook },
    { name: 'Prisma 8 (PostgreSQL, RC)', run: addPrisma },
    { name: 'Vitest', run: addVitest },
    { name: 'Playwright', run: addPlaywright },
    { name: 'OpenAPI', run: addOpenapi, available: () => withHandlersRest() },
    {
        name: 'Orval (React Query client)',
        run: addOrval,
        available: () => withHandlersRest() && ConfigFile.Instance.data.useReact
    },
    { name: 'Missing domain-first packages', run: missingDomainFirstPackages }
];

export const addIntegration = async () => {
    const integration = await select({
        message: 'Integration:',
        choices: integrations
            .filter(({ available }) => available?.() ?? true)
            .map((value) => ({ name: value.name, value }))
    });
    const nextSteps = await integration.run();
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
