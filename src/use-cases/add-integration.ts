import path from 'node:path';
import { checkbox, Separator } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { File } from '../file-system';
import {
    addInMemoryDb,
    addOpenapi,
    addOrval,
    addPlaywright,
    addPrisma,
    addRestEndpointGenerator,
    addStorybook,
    addTestcontainers,
    addVitest,
    inMemoryDbApplied,
    openapiScriptPath,
    restEndpointGeneratorApplied
} from '../integrations';
import { printNextSteps } from '../print-next-steps';
import { ProjectRoot } from '../project-root';
import { savePendingChanges } from '../save-pending-changes';

const withHandlersRest = () =>
    ConfigFile.Instance.data.domainFirstPackages.includes(
        '@domain-first/handlers-rest'
    );

/** Whether a file the integration creates exists, relative to the project root. */
const created = (...segments: string[]) =>
    new File(path.join(new ProjectRoot().path, ...segments)).exists;
const createdInRoot = (...segments: string[]) =>
    created(ConfigFile.Instance.data.rootFolder, ...segments);

/**
 * Integrations are shown by group, but selected ones run in this order, each one seeing the changes of
 * the previous ones: Storybook turns on `useReact` for the Swagger UI page
 * of OpenAPI, integration tests read the Prisma config and the Vitest
 * config, Orval reads the OpenAPI document path.
 */
const integrations: {
    name: string;
    group: 'backend' | 'frontend';
    run: () => string[] | Promise<string[]>;
    available?: () => boolean;
    applied: () => boolean;
}[] = [
    {
        name: 'Storybook (React + Vite)',
        group: 'frontend',
        run: addStorybook,
        applied: () => createdInRoot('presentation/react/.storybook/main.ts')
    },
    {
        name: 'REST endpoint generator',
        group: 'backend',
        run: addRestEndpointGenerator,
        available: () => withHandlersRest(),
        applied: restEndpointGeneratorApplied
    },
    {
        name: 'In-memory DB',
        group: 'backend',
        run: addInMemoryDb,
        applied: inMemoryDbApplied
    },
    {
        name: 'Prisma 8 (PostgreSQL, RC)',
        group: 'backend',
        run: addPrisma,
        applied: () =>
            createdInRoot(
                'shared-kernel/infrastructure/prisma/prisma.config.ts'
            )
    },
    {
        name: 'Vitest',
        group: 'backend',
        run: addVitest,
        applied: () => created('vitest.config.ts')
    },
    {
        name: 'Playwright',
        group: 'frontend',
        run: addPlaywright,
        applied: () => created('playwright.config.ts')
    },
    {
        name: 'Integration tests (Testcontainers, PostgreSQL)',
        group: 'backend',
        run: addTestcontainers,
        applied: () => created('specs/integration/vitest.config.ts')
    },
    {
        name: 'OpenAPI',
        group: 'backend',
        run: addOpenapi,
        available: () => withHandlersRest(),
        applied: () => created(openapiScriptPath)
    },
    {
        name: 'Orval (API client)',
        group: 'frontend',
        run: addOrval,
        available: () => withHandlersRest(),
        applied: () =>
            createdInRoot('presentation/react/data-layer/orval.config.ts') ||
            createdInRoot('presentation/data-layer/orval.config.ts')
    }
];

export const addIntegration = async () => {
    const available = integrations
        .filter(({ available }) => available?.() ?? true)
        .map((value) => ({ value, applied: value.applied() }));
    // Backend first, then frontend; the run order stays the list order
    const section = (title: string, applied: boolean) => {
        const items = ['backend', 'frontend'].flatMap((group) =>
            available.filter(
                (item) => item.applied === applied && item.value.group === group
            )
        );
        return items.length
            ? [
                  new Separator(title),
                  ...items.map(({ value }) => ({
                      name: `${value.name} · ${value.group}`,
                      value
                  }))
              ]
            : [];
    };
    const choices = [
        ...section('New integrations', false),
        ...section('Already applied (select to reapply)', true)
    ];
    // Every section stays visible without scrolling
    const selected = await checkbox({
        message: 'Integrations:',
        choices,
        pageSize: choices.length
    });
    const nextSteps: string[] = [];
    for (const integration of integrations.filter((value) =>
        selected.includes(value)
    )) {
        nextSteps.push(...(await integration.run()));
    }
    if (await savePendingChanges()) {
        printNextSteps(nextSteps);
    }
};
