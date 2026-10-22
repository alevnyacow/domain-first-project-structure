import path from 'node:path';
import { ConfigFile } from '../config-file';
import { File } from '../file-system';
import { ProjectRoot } from '../project-root';
import { addPackageScripts, describeScripts } from './package-scripts';
import { prismaScripts } from './prisma';

const integrationFolder = 'specs/integration';

export const testcontainersScripts = {
    'test:integration': `vitest run --config ${integrationFolder}/vitest.config.ts --reporter=dot --silent=passed-only`
};

export const testcontainersVitestConfig = (inlineHandlersNext: boolean) => {
    const server = inlineHandlersNext
        ? `,
        server: {
            deps: {
                // Imports \`next/headers\` without an extension, which only a bundler can resolve
                inline: ['@domain-first/handlers-next']
            }
        }`
        : '';
    return `import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Runs specs from this folder against PostgreSQL in a container, see global-setup.ts.
export default defineConfig({
    // Paths below are relative to the project root, not this folder
    root: fileURLToPath(new URL('../..', import.meta.url)),
    resolve: {
        tsconfigPaths: true
    },
    test: {
        include: ['${integrationFolder}/**/*.spec.ts'],
        // Development implementations work with the real database
        env: { NODE_ENV: 'development' },
        globalSetup: ['${integrationFolder}/global-setup.ts'],
        setupFiles: ['${integrationFolder}/setup-env.ts'],
        // Pulling the image on the first run takes a while
        hookTimeout: 120_000${server}
    }
});
`;
};

export const testcontainersGlobalSetup = (migrationCommand?: string) => {
    const migrations = migrationCommand
        ? `
    // dotenv in the Prisma config does not override an already set variable
    execSync(${JSON.stringify(migrationCommand)}, {
        cwd: project.config.root,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        // On failure the error carries the command's output
        stdio: 'pipe'
    });
`
        : `
    // Apply your migrations to databaseUrl here.
`;
    return `${migrationCommand ? "import { execSync } from 'node:child_process';\n" : ''}import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
    export interface ProvidedContext {
        databaseUrl: string;
    }
}

const POSTGRES_IMAGE = 'postgres:15';
const POSTGRES_PORT = 5432;
const POSTGRES_USER = 'test';
const POSTGRES_PASSWORD = 'test';
const POSTGRES_DB = 'test';

export default async function setup(project: TestProject) {
    const container = await new GenericContainer(POSTGRES_IMAGE)
        .withEnvironment({ POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB })
        .withExposedPorts(POSTGRES_PORT)
        // During init PostgreSQL listens on a unix socket only and restarts,
        // so checking over TCP passes once the final server is up
        .withHealthCheck({
            test: [
                'CMD-SHELL',
                \`pg_isready --host localhost --username \${POSTGRES_USER} --dbname \${POSTGRES_DB}\`
            ],
            interval: 250,
            timeout: 1000,
            retries: 1000
        })
        .withWaitStrategy(Wait.forHealthCheck())
        .withStartupTimeout(120_000)
        .start();

    const databaseUrl = \`postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@\${container.getHost()}:\${container.getMappedPort(POSTGRES_PORT)}/\${POSTGRES_DB}\`;
${migrations}
    project.provide('databaseUrl', databaseUrl);

    return async () => {
        await container.stop();
    };
}
`;
};

export const testcontainersSetupEnv = `import 'dotenv/config';
import { inject } from 'vitest';

// Runs before each spec's imports: development implementations get the .env
// config, and DATABASE_URL points to the container instead of the one from .env.
if (process.env.NODE_ENV !== 'development') {
    throw new Error(
        \`Integration specs need NODE_ENV=development to wire development implementations, got "\${process.env.NODE_ENV}"\`
    );
}

process.env.DATABASE_URL = inject('databaseUrl');
`;

const exampleSpec = `import { expect, inject, test } from 'vitest';

test('connects to the database in the container', () => {
    expect(process.env.DATABASE_URL).toBe(inject('databaseUrl'));
});
`;

/**
 * Adds the integration folder to `test.exclude` of the unit test config.
 * The array is found by `...configDefaults.exclude`, which coverage
 * excludes don't use. Returns `undefined` for configs of another shape.
 */
export const excludeFromUnitTests = (content: string) => {
    const exclude =
        /(exclude:\s*\[\s*\.\.\.configDefaults\.exclude\b[^\]]*?)(,?)(\s*)\]/;
    if (!exclude.test(content)) return undefined;
    const entry = `'${integrationFolder}/**'`;
    return content
        .replace(
            exclude,
            (_, items: string, comma: string, whitespace: string) => {
                // One item per line: the new one gets the last item's indent
                const indent = whitespace.includes('\n')
                    ? /\n([ \t]*)[^\n]*$/.exec(items)?.[1]
                    : undefined;
                const separator = indent === undefined ? ', ' : `,\n${indent}`;
                return `${items}${separator}${entry}${comma}${whitespace}]`;
            }
        )
        .replace(
            '// Playwright runs end-to-end specs\n',
            '// Playwright runs end-to-end specs, test:integration runs integration ones\n'
        );
};

const stageFile = (filePath: string, content: string) => {
    const file = new File(filePath);
    if (!file.exists || file.data !== content) file.data = content;
};

export const addTestcontainers = async (): Promise<string[]> => {
    const config = ConfigFile.Instance.data;
    const root = new ProjectRoot().path;
    const manifestFile = new File(path.join(root, 'package.json'));
    const manifest = JSON.parse(manifestFile.data);
    const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies
    };
    const selected = await addPackageScripts(
        manifestFile,
        testcontainersScripts
    );

    // Migrations run only for the Prisma preset; other setups add their own.
    const withPrisma = new File(
        path.resolve(
            root,
            config.rootFolder,
            'shared/infrastructure/prisma/prisma.config.ts'
        )
    ).exists;
    const migrationCommand = withPrisma
        ? `npx ${prismaScripts(config.rootFolder)['prisma:migration:apply']}`
        : undefined;

    const folder = path.join(root, integrationFolder);
    stageFile(
        path.join(folder, 'vitest.config.ts'),
        testcontainersVitestConfig(
            Boolean(dependencies['@domain-first/handlers-next'])
        )
    );
    stageFile(
        path.join(folder, 'global-setup.ts'),
        testcontainersGlobalSetup(migrationCommand)
    );
    stageFile(path.join(folder, 'setup-env.ts'), testcontainersSetupEnv);
    // The example is a starting point; edits to it are never overwritten.
    const example = new File(path.join(folder, 'database/database.spec.ts'));
    if (!example.exists) example.data = exampleSpec;

    const unitConfig = new File(path.join(root, 'vitest.config.ts'));
    let excludedFromUnitTests =
        !unitConfig.exists || unitConfig.data.includes(integrationFolder);
    if (!excludedFromUnitTests) {
        const excluded = excludeFromUnitTests(unitConfig.data);
        if (excluded) {
            unitConfig.update(excluded);
            excludedFromUnitTests = true;
        }
    }

    const missing = ['vitest', 'testcontainers', 'dotenv'].filter(
        (name) => !dependencies[name]
    );
    return [
        ...(missing.length
            ? [`npm install --save-dev ${missing.join(' ')}`]
            : []),
        `Integration specs run against postgres:15 and get its address in DATABASE_URL. Change the image, credentials and connection string in ${integrationFolder}/global-setup.ts, and the variable name in ${integrationFolder}/setup-env.ts.`,
        ...(migrationCommand
            ? []
            : [
                  `Apply your migrations in ${integrationFolder}/global-setup.ts.`
              ]),
        ...(excludedFromUnitTests
            ? []
            : [
                  `Add '${integrationFolder}/**' to test.exclude in vitest.config.ts, so unit tests skip integration specs.`
              ]),
        'Docker must be running for integration specs.',
        ...describeScripts(selected, {
            'test:integration': `run integration specs from ${integrationFolder} against PostgreSQL in a container`
        })
    ];
};
