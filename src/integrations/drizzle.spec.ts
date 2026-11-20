import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { confirm } from '@inquirer/prompts';
import { afterAll, afterEach, expect, rstest, test } from '@rstest/core';
import {
    discardPendingChanges,
    filesToOverwrite,
    writePendingChanges
} from '../file-system';
import { addDrizzle, drizzleScripts } from './index';

rstest.mock('@inquirer/prompts', () => ({
    confirm: rstest.fn(),
    select: rstest.fn(),
    input: rstest.fn()
}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-drizzle-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
let sequence = 0;
const setup = (rootFolder = '.', wire = false, dependencies = {}) => {
    const project = path.join(root, String(sequence++));
    fs.mkdirSync(project);
    fs.writeFileSync(
        path.join(project, 'package.json'),
        JSON.stringify({ scripts: { dev: 'vite' }, dependencies })
    );
    const configPath = path.join(
        project,
        'domain-first.project-structure.config.json'
    );
    fs.writeFileSync(
        configPath,
        JSON.stringify({
            project: { rootFolder },
            backend: {
                domainFirstPackages: wire ? ['@domain-first/wire'] : []
            }
        })
    );
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    return {
        project,
        configPath,
        shared: path.join(project, rootFolder, 'shared-kernel')
    };
};

test('adds config, schema, optional service and wiring with deferred writes', async () => {
    const { project, configPath, shared } = setup('src/server', true);
    rstest.mocked(confirm).mockResolvedValueOnce(true);
    const steps = await addDrizzle();
    expect(fs.existsSync(shared)).toBe(false);
    writePendingChanges();
    const config = fs.readFileSync(
        path.join(shared, 'infrastructure/drizzle/drizzle.config.ts'),
        'utf8'
    );
    expect(config).toContain("dialect: 'postgresql'");
    expect(config).toContain(
        'schema: "src/server/shared-kernel/infrastructure/drizzle/schema.ts"'
    );
    expect(config).toContain(
        'out: "src/server/shared-kernel/infrastructure/drizzle/migrations"'
    );
    expect(
        fs.existsSync(path.join(shared, 'infrastructure/drizzle/schema.ts'))
    ).toBe(true);
    expect(
        fs.readFileSync(
            path.join(
                shared,
                'infrastructure/services/drizzle-infrastructure-service.ts'
            ),
            'utf8'
        )
    ).toContain('readonly db = drizzleDatabase');
    const service = fs.readFileSync(
        path.join(
            shared,
            'infrastructure/services/drizzle-infrastructure-service.ts'
        ),
        'utf8'
    );
    expect(service).toContain("import * as schema from '../drizzle/schema';");
    expect(service).toContain('        schema\n    });');
    expect(
        fs.readFileSync(
            path.join(
                shared,
                'wiring/infrastructure-services/wire-drizzle-infrastructure-service.ts'
            ),
            'utf8'
        )
    ).toContain('wireClass(\n    DrizzleInfrastructureService,');
    const choices = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(choices.backend.implementations).toEqual({
        repositories: { primary: ['drizzle'], test: [] },
        commands: { primary: ['drizzle'], test: [] },
        queries: { primary: ['drizzle'], test: [] }
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    const manifest = JSON.parse(
        fs.readFileSync(path.join(project, 'package.json'), 'utf8')
    );
    expect(manifest.scripts).toEqual({
        dev: 'vite',
        ...drizzleScripts('src/server')
    });
    expect(steps).toEqual([
        'npm install drizzle-orm pg dotenv',
        'npm install --save-dev drizzle-kit @types/pg',
        'Add !src/server/shared-kernel/infrastructure/drizzle/migrations in your linter, to ignore generated migrations.',
        'npm run drizzle:generate — generate a SQL migration from changes in schema.ts',
        'npm run drizzle:migrate — apply generated migrations to the database in DATABASE_URL'
    ]);
});

test('supports config only and preserves existing dependencies and implementation choices', async () => {
    const { shared, configPath } = setup('.', true, {
        dotenv: '^18.0.5',
        pg: '^9.0.0'
    });
    const original = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    fs.writeFileSync(
        configPath,
        JSON.stringify({
            ...original,
            backend: {
                ...original.backend,
                implementations: {
                    repositories: { primary: ['prisma'], test: ['stub'] }
                }
            }
        })
    );
    rstest.mocked(confirm).mockResolvedValueOnce(false);
    const steps = await addDrizzle();
    writePendingChanges();
    expect(fs.existsSync(path.join(shared, 'infrastructure/services'))).toBe(
        false
    );
    expect(fs.existsSync(path.join(shared, 'wiring'))).toBe(false);
    expect(steps).toContain('npm install drizzle-orm');
    expect(
        JSON.parse(fs.readFileSync(configPath, 'utf8')).backend.implementations
            .repositories
    ).toEqual({ primary: ['prisma', 'drizzle'], test: ['stub'] });
});

test('repeat setup preserves the schema and flags an edited config', async () => {
    const { shared } = setup();
    rstest.mocked(confirm).mockResolvedValue(true);
    await addDrizzle();
    writePendingChanges();
    expect(fs.existsSync(path.join(shared, 'wiring'))).toBe(false);
    const schemaPath = path.join(shared, 'infrastructure/drizzle/schema.ts');
    const tables = "export const orders = pgTable('orders', {});\n";
    fs.writeFileSync(schemaPath, tables);
    await addDrizzle();
    expect(filesToOverwrite()).toEqual([]);
    writePendingChanges();
    expect(fs.readFileSync(schemaPath, 'utf8')).toBe(tables);
    const configPath = path.join(
        shared,
        'infrastructure/drizzle/drizzle.config.ts'
    );
    fs.writeFileSync(configPath, '// custom config');
    await addDrizzle();
    expect(filesToOverwrite()).toEqual([configPath]);
});

test('rejects an existing Drizzle setup in the project root without staging changes', async () => {
    const { project } = setup();
    fs.writeFileSync(path.join(project, 'drizzle.config.ts'), '');
    const original = fs.readFileSync(
        path.join(project, 'package.json'),
        'utf8'
    );
    await expect(addDrizzle()).rejects.toThrow(
        'Move the existing Drizzle setup separately'
    );
    writePendingChanges();
    expect(fs.readFileSync(path.join(project, 'package.json'), 'utf8')).toBe(
        original
    );
    expect(fs.existsSync(path.join(project, 'shared-kernel'))).toBe(false);
});

test('scripts quote nested paths', () => {
    expect(drizzleScripts('src\\server app')).toEqual({
        'drizzle:generate':
            'drizzle-kit generate --config "src/server app/shared-kernel/infrastructure/drizzle/drizzle.config.ts"',
        'drizzle:migrate':
            'drizzle-kit migrate --config "src/server app/shared-kernel/infrastructure/drizzle/drizzle.config.ts"'
    });
});
