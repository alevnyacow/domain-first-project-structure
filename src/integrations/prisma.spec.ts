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
import { addPrisma, prismaScripts } from './index';

rstest.mock('@inquirer/prompts', () => ({
    confirm: rstest.fn(),
    select: rstest.fn(),
    input: rstest.fn()
}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-prisma-'));
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
            rootFolder,
            domainFirstPackages: wire ? ['@domain-first/wire'] : [],
            defaultPersistenceLayerImplementation: 'api',
            useReact: false
        })
    );
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    return {
        project,
        configPath,
        shared: path.join(project, rootFolder, 'shared')
    };
};

test('adds config, optional service and wiring with deferred writes', async () => {
    const { project, configPath, shared } = setup('src/server', true);
    rstest
        .mocked(confirm)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);
    const steps = await addPrisma();
    expect(fs.existsSync(shared)).toBe(false);
    writePendingChanges();
    expect(
        fs.readFileSync(
            path.join(shared, 'infrastructure/prisma/prisma.config.ts'),
            'utf8'
        )
    ).toContain("contract: './contract.prisma'");
    expect(
        fs.readFileSync(
            path.join(
                shared,
                'infrastructure/services/prisma-infrastructure-service.ts'
            ),
            'utf8'
        )
    ).toContain('readonly orm = prismaClient.orm.public');
    expect(
        fs.existsSync(
            path.join(
                shared,
                'wiring/infrastructure-services/wire-prisma-infrastructure-service.ts'
            )
        )
    ).toBe(true);
    expect(
        JSON.parse(fs.readFileSync(configPath, 'utf8'))
            .defaultPersistenceLayerImplementation
    ).toBe('prisma');
    const manifest = JSON.parse(
        fs.readFileSync(path.join(project, 'package.json'), 'utf8')
    );
    expect(manifest.scripts.dev).toBe('vite');
    expect(manifest.dependencies).toEqual({});
    expect(steps).toContain(
        '  npm install --save-dev prisma @prisma/cli-engine'
    );
    expect(steps).toContain(
        '  npm install @prisma/orm-postgres temporal-polyfill dotenv'
    );
});

test('supports config only and preserves existing dependencies and persistence default', async () => {
    const { shared, configPath } = setup('.', false, { dotenv: '^18.0.5' });
    rstest
        .mocked(confirm)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);
    const steps = await addPrisma();
    writePendingChanges();
    expect(
        fs.existsSync(
            path.join(shared, 'infrastructure/prisma/contract.prisma')
        )
    ).toBe(true);
    expect(fs.existsSync(path.join(shared, 'infrastructure/services'))).toBe(
        false
    );
    expect(steps).toContain(
        '  npm install @prisma/orm-postgres temporal-polyfill'
    );
    expect(
        JSON.parse(fs.readFileSync(configPath, 'utf8'))
            .defaultPersistenceLayerImplementation
    ).toBe('api');
});

test('repeat setup preserves models and flags edited config, without wiring when disabled', async () => {
    const { shared } = setup();
    rstest.mocked(confirm).mockResolvedValue(true);
    await addPrisma();
    writePendingChanges();
    expect(fs.existsSync(path.join(shared, 'wiring'))).toBe(false);
    const contractPath = path.join(
        shared,
        'infrastructure/prisma/contract.prisma'
    );
    const models = '// use prisma-8\nmodel Order {\n id String @id\n}\n';
    fs.writeFileSync(contractPath, models);
    await addPrisma();
    expect(filesToOverwrite()).toEqual([]);
    writePendingChanges();
    expect(fs.readFileSync(contractPath, 'utf8')).toBe(models);
    const configPath = path.join(
        shared,
        'infrastructure/prisma/prisma.config.ts'
    );
    fs.writeFileSync(configPath, '// custom config');
    await addPrisma();
    expect(filesToOverwrite()).toEqual([configPath]);
    discardPendingChanges();
    writePendingChanges();
    expect(fs.readFileSync(configPath, 'utf8')).toBe('// custom config');
});

test('rejects old Prisma without staging changes', async () => {
    const { project } = setup('.', false, { prisma: '^7.0.0' });
    const original = fs.readFileSync(
        path.join(project, 'package.json'),
        'utf8'
    );
    await expect(addPrisma()).rejects.toThrow(
        'Migrate the existing Prisma setup separately'
    );
    writePendingChanges();
    expect(fs.readFileSync(path.join(project, 'package.json'), 'utf8')).toBe(
        original
    );
    expect(fs.existsSync(path.join(project, 'shared'))).toBe(false);
});

test('scripts quote nested paths and retain the migration sequence', () => {
    const scripts = prismaScripts('src/server app');
    expect(scripts['prisma:emit']).toContain(
        '"src/server app/shared/infrastructure/prisma/prisma.config.ts"'
    );
    expect(scripts['prisma:migration:plan']).toBe(
        `${scripts['prisma:emit']} && prisma migration plan --config "src/server app/shared/infrastructure/prisma/prisma.config.ts"`
    );
    expect(scripts['prisma:migration:apply']).toContain(
        'db migrate --advance-ref db'
    );
});
