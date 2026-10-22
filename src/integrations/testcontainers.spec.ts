import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, expect, rstest, test } from '@rstest/core';
import {
    discardPendingChanges,
    filesToOverwrite,
    writePendingChanges
} from '../file-system';
import { addTestcontainers } from './index';

rstest.mock('@inquirer/prompts', () => ({
    confirm: rstest.fn(),
    select: rstest.fn(),
    input: rstest.fn()
}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-testcontainers-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
let sequence = 0;
const setup = (
    manifest: object,
    {
        withPrisma = false,
        unitConfig
    }: { withPrisma?: boolean; unitConfig?: string } = {}
) => {
    const project = path.join(root, String(sequence++));
    fs.mkdirSync(project);
    fs.writeFileSync(
        path.join(project, 'package.json'),
        JSON.stringify(manifest)
    );
    fs.writeFileSync(
        path.join(project, 'domain-first.project-structure.config.json'),
        JSON.stringify({
            rootFolder: 'src',
            domainFirstPackages: [],
            defaultPersistenceLayerImplementation: 'prisma',
            useReact: false
        })
    );
    if (withPrisma) {
        const prismaFolder = path.join(
            project,
            'src/shared/infrastructure/prisma'
        );
        fs.mkdirSync(prismaFolder, { recursive: true });
        fs.writeFileSync(path.join(prismaFolder, 'prisma.config.ts'), '');
    }
    if (unitConfig !== undefined) {
        fs.writeFileSync(path.join(project, 'vitest.config.ts'), unitConfig);
    }
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    const folder = path.join(project, 'specs/integration');
    return {
        project,
        configPath: path.join(folder, 'vitest.config.ts'),
        globalSetupPath: path.join(folder, 'global-setup.ts'),
        setupEnvPath: path.join(folder, 'setup-env.ts'),
        specPath: path.join(folder, 'database/database.spec.ts')
    };
};

const notes = [
    'Integration specs run against postgres:15 and get its address in DATABASE_URL. Change the image, credentials and connection string in specs/integration/global-setup.ts, and the variable name in specs/integration/setup-env.ts.',
    'Docker must be running for integration specs.',
    'npm run test:integration — run integration specs from specs/integration against PostgreSQL in a container'
];

test('adds config, setup files, example spec and script with deferred writes', async () => {
    const { project, configPath, globalSetupPath, setupEnvPath, specPath } =
        setup({ scripts: { test: 'vitest run' } }, { withPrisma: true });
    const steps = await addTestcontainers();
    expect(fs.existsSync(configPath)).toBe(false);
    writePendingChanges();

    const config = fs.readFileSync(configPath, 'utf8');
    expect(config).toContain("include: ['specs/integration/**/*.spec.ts']");
    expect(config).toContain("env: { NODE_ENV: 'development' }");
    expect(config).not.toContain('@domain-first/handlers-next');
    const globalSetup = fs.readFileSync(globalSetupPath, 'utf8');
    expect(globalSetup).toContain("const POSTGRES_IMAGE = 'postgres:15';");
    expect(globalSetup).toContain(
        'npx prisma db migrate --advance-ref db --config \\"src/shared/infrastructure/prisma/prisma.config.ts\\"'
    );
    expect(fs.readFileSync(setupEnvPath, 'utf8')).toContain(
        "process.env.DATABASE_URL = inject('databaseUrl');"
    );
    expect(fs.readFileSync(specPath, 'utf8')).toContain(
        "inject('databaseUrl')"
    );
    const manifest = JSON.parse(
        fs.readFileSync(path.join(project, 'package.json'), 'utf8')
    );
    expect(manifest.scripts).toEqual({
        test: 'vitest run',
        'test:integration':
            'vitest run --config specs/integration/vitest.config.ts --reporter=dot --silent=passed-only'
    });
    expect(steps).toEqual([
        'npm install --save-dev vitest testcontainers dotenv',
        ...notes
    ]);

    fs.writeFileSync(specPath, '// custom spec');
    await addTestcontainers();
    expect(filesToOverwrite()).toEqual([]);
    writePendingChanges();
    expect(fs.readFileSync(specPath, 'utf8')).toBe('// custom spec');
    fs.writeFileSync(globalSetupPath, '// custom setup');
    await addTestcontainers();
    expect(filesToOverwrite()).toEqual([globalSetupPath]);
});

test('without Prisma leaves migrations to the project', async () => {
    const { globalSetupPath } = setup({
        devDependencies: { vitest: '^5.0.0', testcontainers: '^12.0.0' },
        dependencies: {
            dotenv: '^18.0.0',
            '@domain-first/handlers-next': '^2.0.0'
        }
    });
    const steps = await addTestcontainers();
    writePendingChanges();
    const globalSetup = fs.readFileSync(globalSetupPath, 'utf8');
    expect(globalSetup).not.toContain('execSync');
    expect(globalSetup).toContain('Apply your migrations to databaseUrl here');
    expect(
        fs.readFileSync(
            path.join(path.dirname(globalSetupPath), 'vitest.config.ts'),
            'utf8'
        )
    ).toContain("inline: ['@domain-first/handlers-next']");
    expect(steps).toEqual([
        notes[0],
        'Apply your migrations in specs/integration/global-setup.ts.',
        ...notes.slice(1)
    ]);
});

const installed = {
    devDependencies: {
        vitest: '^5.0.0',
        testcontainers: '^12.0.0',
        dotenv: '^18.0.0'
    }
};

test('excludes integration specs from the unit config generated by the Vitest integration', async () => {
    const { project } = setup(installed, {
        withPrisma: true,
        unitConfig: `    test: {
        // Playwright runs end-to-end specs
        exclude: [...configDefaults.exclude, 'specs/e2e/**'],
        coverage: {
            exclude: ['**/*.spec.ts']
        }
    }
`
    });
    expect(await addTestcontainers()).toEqual(notes);
    expect(filesToOverwrite()).not.toContain(
        path.join(project, 'vitest.config.ts')
    );
    writePendingChanges();
    expect(
        fs.readFileSync(path.join(project, 'vitest.config.ts'), 'utf8')
    ).toBe(`    test: {
        // Playwright runs end-to-end specs, test:integration runs integration ones
        exclude: [...configDefaults.exclude, 'specs/e2e/**', 'specs/integration/**'],
        coverage: {
            exclude: ['**/*.spec.ts']
        }
    }
`);
});

test('keeps one item per line in a multiline exclude', async () => {
    const { project } = setup(installed, {
        withPrisma: true,
        unitConfig: `exclude: [
    ...configDefaults.exclude,
    'specs/e2e/**'
],`
    });
    await addTestcontainers();
    writePendingChanges();
    expect(
        fs.readFileSync(path.join(project, 'vitest.config.ts'), 'utf8')
    ).toBe(`exclude: [
    ...configDefaults.exclude,
    'specs/e2e/**',
    'specs/integration/**'
],`);
});

test('asks to exclude integration specs from a unit config of another shape', async () => {
    const { project } = setup(installed, {
        withPrisma: true,
        unitConfig: "exclude: ['**/node_modules/**']"
    });
    expect(await addTestcontainers()).toEqual([
        notes[0],
        "Add 'specs/integration/**' to test.exclude in vitest.config.ts, so unit tests skip integration specs.",
        ...notes.slice(1)
    ]);
    writePendingChanges();
    expect(
        fs.readFileSync(path.join(project, 'vitest.config.ts'), 'utf8')
    ).toBe("exclude: ['**/node_modules/**']");
});
