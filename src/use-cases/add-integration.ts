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
import { printNextSteps } from '../print-next-steps';
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
        printNextSteps(nextSteps);
    }
};
