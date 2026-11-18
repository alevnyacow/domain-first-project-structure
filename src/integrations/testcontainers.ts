import path from 'node:path';
import { boundedContextNames } from '../bounded-contexts';
import { ConfigFile } from '../config-file';
import { File, Folder } from '../file-system';
import {
    implementationKinds,
    savedImplementations
} from '../implementation-choices';
import {
    contractClassName,
    contractWireFile,
    findContracts,
    implementationWireName
} from '../implementations';
import {
    integrationTestTypes,
    scaffoldIntegrationSpec,
    setIntegrationTestTypes,
    systemImplementationTypes
} from '../integration-tests';
import { checkbox } from '../interaction';
import { ProjectRoot } from '../project-root';
import { envBranches } from '../wire-branches';
import { wireBranches } from '../wiring';
import { drizzleConfigPath, drizzleScripts } from './drizzle';
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

export const testcontainersGlobalSetup = (migrationCommands: string[] = []) => {
    const migrations = migrationCommands.length
        ? `
    // dotenv in the ORM config does not override an already set variable
${migrationCommands
    .map(
        (command) => `    execSync(${JSON.stringify(command)}, {
        cwd: project.config.root,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        // On failure the error carries the command's output
        stdio: 'pipe'
    });
`
    )
    .join('')}`
        : `
    // Apply your migrations to databaseUrl here.
`;
    return `${migrationCommands.length ? "import { execSync } from 'node:child_process';\n" : ''}import { GenericContainer, Wait } from 'testcontainers';
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

/**
 * Asks which saved primary types get integration specs, and stages the
 * missing specs of their existing primary implementations: those wired
 * in a branch other than the test one.
 */
const configureIntegrationTests = async (root: string) => {
    if (!ConfigFile.backend.domainFirstPackages.includes('@domain-first/wire'))
        return;
    const kindsOf = new Map<string, string[]>();
    for (const kind of implementationKinds)
        for (const label of savedImplementations(kind, 'primary'))
            if (!systemImplementationTypes.has(label))
                kindsOf.set(label, [...(kindsOf.get(label) ?? []), kind]);
    const current = integrationTestTypes();
    if (kindsOf.size) {
        const selected = await checkbox<string>({
            key: 'integrationTestTypes',
            message: 'Integration tests for implementation types:',
            choices: [...kindsOf].map(([value, kinds]) => ({
                name: `${value} (${kinds.join(', ')})`,
                value,
                checked: current.includes(value)
            }))
        });
        // Types the menu doesn't offer, e.g. cross-context, stay as listed.
        const kept = current.filter((label) => !kindsOf.has(label));
        const next = [...selected, ...kept];
        if (
            next.length !== current.length ||
            next.some((label) => !current.includes(label))
        )
            setIntegrationTestTypes(next);
    }
    const types = integrationTestTypes();
    if (!types.length) return;
    const testBranch = envBranches().test;

    const source = new Folder(root).subitem([
        ConfigFile.Instance.data.project.rootFolder
    ]);
    const owners = [
        source.subitem(['shared-kernel']),
        ...boundedContextNames(source.subitem(['bounded-contexts']).path).map(
            (name) => source.subitem(['bounded-contexts', ...name.split('/')])
        )
    ];
    for (const owner of owners) {
        for (const unit of findContracts(owner.path)) {
            const wireFile = new File(
                path.join(owner.path, contractWireFile(unit))
            );
            if (!wireFile.exists) continue;
            let wired: Map<string, string>;
            try {
                wired = wireBranches(
                    wireFile.data,
                    `wire${contractClassName(unit)}`
                );
            } catch {
                continue;
            }
            const primaryWires = new Set(
                [...wired]
                    .filter(([branch]) => branch !== testBranch)
                    .map(([, wire]) => wire)
            );
            for (const label of unit.labels)
                if (
                    types.includes(label) &&
                    primaryWires.has(implementationWireName(label))
                )
                    scaffoldIntegrationSpec(unit, label);
        }
    }
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

    // Migrations run only for the Prisma and Drizzle presets; other setups add their own.
    const presetExists = (relativePath: string) =>
        new File(path.resolve(root, relativePath)).exists;
    const migrationCommands = [
        // Without --advance-ref: the db ref in migrations/app/refs/db.json tracks
        // the development database and must not move to the container's state.
        ...(presetExists(
            path.join(
                config.project.rootFolder,
                'shared-kernel/infrastructure/prisma/prisma.config.ts'
            )
        )
            ? [
                  `npx ${prismaScripts(config.project.rootFolder)['prisma:migration:apply'].replace(' --advance-ref db', '')}`
              ]
            : []),
        ...(presetExists(drizzleConfigPath(config.project.rootFolder))
            ? [
                  `npx ${drizzleScripts(config.project.rootFolder)['drizzle:migrate']}`
              ]
            : [])
    ];

    const folder = path.join(root, integrationFolder);
    stageFile(
        path.join(folder, 'vitest.config.ts'),
        testcontainersVitestConfig(
            Boolean(dependencies['@domain-first/handlers-next'])
        )
    );
    stageFile(
        path.join(folder, 'global-setup.ts'),
        testcontainersGlobalSetup(migrationCommands)
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

    await configureIntegrationTests(root);

    const missing = ['vitest', 'testcontainers', 'dotenv'].filter(
        (name) => !dependencies[name]
    );
    return [
        ...(missing.length
            ? [`npm install --save-dev ${missing.join(' ')}`]
            : []),
        `Integration specs run against postgres:15 and get its address in DATABASE_URL. Change the image, credentials and connection string in ${integrationFolder}/global-setup.ts, and the variable name in ${integrationFolder}/setup-env.ts.`,
        ...(migrationCommands.length
            ? []
            : [
                  `Apply your migrations in ${integrationFolder}/global-setup.ts.`
              ]),
        ...(excludedFromUnitTests
            ? []
            : [
                  `Add '${integrationFolder}/**' to test.exclude in vitest.config.ts, so unit tests skip integration specs.`
              ]),
        ...(envBranches().custom
            ? [
                  `${integrationFolder} runs with NODE_ENV=development and ${integrationFolder}/setup-env.ts requires it, but your envBranchedWire branches are custom: make currentBranch in shared-kernel/wiring/env-branched-wire.ts return the branch for integration specs, and adjust setup-env.ts.`
              ]
            : []),
        'Docker must be running for integration specs.',
        ...describeScripts(selected, {
            'test:integration': `run integration specs from ${integrationFolder} against PostgreSQL in a container`
        })
    ];
};
