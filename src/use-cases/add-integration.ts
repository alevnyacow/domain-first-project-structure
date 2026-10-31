import path from 'node:path';
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
import { checkbox, Separator } from '../interaction';
import { printNextSteps } from '../print-next-steps';
import { ProjectRoot } from '../project-root';
import { savePendingChanges } from '../save-pending-changes';

const withHandlersRest = () =>
    ConfigFile.Instance.data.backend?.domainFirstPackages.includes(
        '@domain-first/handlers-rest'
    ) ?? false;

/** Whether a file the integration creates exists, relative to the project root. */
const created = (...segments: string[]) =>
    new File(path.join(new ProjectRoot().path, ...segments)).exists;
const createdInRoot = (...segments: string[]) =>
    created(ConfigFile.Instance.data.project.rootFolder, ...segments);

/**
 * Integrations are shown by group, but selected ones run in this order, each one seeing the changes of
 * the previous ones: Storybook configures `frontend.react` for the Swagger UI page
 * of OpenAPI, integration tests read the Prisma config and the Vitest
 * config, Orval reads the OpenAPI document path.
 */
export const integrationIds = [
    'storybook',
    'rest-endpoint-generator',
    'in-memory-db',
    'prisma',
    'vitest',
    'playwright',
    'testcontainers',
    'openapi',
    'orval'
] as const;

const integrations: {
    id: (typeof integrationIds)[number];
    name: string;
    group: 'backend' | 'frontend';
    run: () => string[] | Promise<string[]>;
    available?: () => boolean;
    applied: () => boolean;
}[] = [
    {
        id: 'storybook',
        name: 'Storybook (React + Vite)',
        group: 'frontend',
        run: addStorybook,
        applied: () => createdInRoot('presentation/react/.storybook/main.ts')
    },
    {
        id: 'rest-endpoint-generator',
        name: 'REST endpoint generator',
        group: 'backend',
        run: addRestEndpointGenerator,
        available: () => withHandlersRest(),
        applied: restEndpointGeneratorApplied
    },
    {
        id: 'in-memory-db',
        name: 'In-memory DB',
        group: 'backend',
        run: addInMemoryDb,
        applied: inMemoryDbApplied
    },
    {
        id: 'prisma',
        name: 'Prisma 8 (PostgreSQL, RC)',
        group: 'backend',
        run: addPrisma,
        applied: () =>
            createdInRoot(
                'shared-kernel/infrastructure/prisma/prisma.config.ts'
            )
    },
    {
        id: 'vitest',
        name: 'Vitest',
        group: 'backend',
        run: addVitest,
        applied: () => created('vitest.config.ts')
    },
    {
        id: 'playwright',
        name: 'Playwright',
        group: 'frontend',
        run: addPlaywright,
        applied: () => created('playwright.config.ts')
    },
    {
        id: 'testcontainers',
        name: 'Integration tests (Testcontainers, PostgreSQL)',
        group: 'backend',
        run: addTestcontainers,
        applied: () => created('specs/integration/vitest.config.ts')
    },
    {
        id: 'openapi',
        name: 'OpenAPI',
        group: 'backend',
        run: addOpenapi,
        available: () => withHandlersRest(),
        applied: () => created(openapiScriptPath)
    },
    {
        id: 'orval',
        name: 'Orval (API client)',
        group: 'frontend',
        run: addOrval,
        available: () => withHandlersRest(),
        applied: () =>
            createdInRoot('presentation/react/data-layer/orval.config.ts') ||
            createdInRoot('presentation/data-layer/orval.config.ts')
    }
];

export const addIntegration = async ({
    save = true
}: {
    save?: boolean;
} = {}) => {
    const available = integrations
        .filter(
            ({ group, available }) =>
                (group !== 'backend' ||
                    Boolean(ConfigFile.Instance.data.backend)) &&
                (available?.() ?? true)
        )
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
        key: 'integrations',
        id: (integration) => integration.id,
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
    if (save && (await savePendingChanges())) {
        printNextSteps(nextSteps);
    }
    return nextSteps;
};

export const integrationDescriptions = () =>
    integrations.map((integration) => ({
        id: integration.id,
        name: integration.name,
        group: integration.group,
        available:
            (integration.group !== 'backend' ||
                Boolean(ConfigFile.Instance.data.backend)) &&
            (integration.available?.() ?? true)
    }));
