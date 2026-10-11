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
import { addVitest } from './index';

rstest.mock('@inquirer/prompts', () => ({
    confirm: rstest.fn(),
    select: rstest.fn(),
    input: rstest.fn()
}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-vitest-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
let sequence = 0;
const setup = (
    rootFolder = '.',
    dependencies = {},
    testingLibrary?: string
) => {
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
            domainFirstPackages: [],
            defaultPersistenceLayerImplementation: 'api',
            useReact: false,
            testingLibrary
        })
    );
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    return {
        project,
        configPath,
        vitestConfigPath: path.join(project, 'vitest.config.ts')
    };
};

test('adds config, scripts, gitignore entry and testing library with deferred writes', async () => {
    const { project, configPath, vitestConfigPath } = setup('src/server');
    const steps = await addVitest();
    expect(fs.existsSync(vitestConfigPath)).toBe(false);
    writePendingChanges();
    const content = fs.readFileSync(vitestConfigPath, 'utf8');
    expect(content).toContain('tsconfigPaths: true');
    expect(content).toContain('"src/server/bounded-contexts/**/*.ts"');
    expect(content).toContain('"src/server/shared/wiring/**"');
    expect(content).not.toContain('@domain-first/handlers-next');
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).testingLibrary).toBe(
        'vitest'
    );
    const manifest = JSON.parse(
        fs.readFileSync(path.join(project, 'package.json'), 'utf8')
    );
    expect(manifest.scripts.dev).toBe('vite');
    expect(manifest.scripts.test).toBe(
        'vitest run --reporter=dot --silent=passed-only'
    );
    expect(fs.readFileSync(path.join(project, '.gitignore'), 'utf8')).toBe(
        '/coverage/\n'
    );
    expect(steps).toEqual([
        'npm install --save-dev vitest @vitest/coverage-v8',
        'npm run test — run unit tests',
        'npm run test:coverage — run unit tests with a V8 coverage report in coverage/'
    ]);

    await addVitest();
    expect(filesToOverwrite()).toEqual([]);
    writePendingChanges();
    expect(fs.readFileSync(path.join(project, '.gitignore'), 'utf8')).toBe(
        '/coverage/\n'
    );
    fs.writeFileSync(vitestConfigPath, '// custom config');
    await addVitest();
    expect(filesToOverwrite()).toEqual([vitestConfigPath]);
});

test('inlines handlers-next and skips installed packages', async () => {
    const { vitestConfigPath } = setup('.', {
        '@domain-first/handlers-next': '^1.0.0',
        vitest: '^4.0.0'
    });
    const steps = await addVitest();
    writePendingChanges();
    const content = fs.readFileSync(vitestConfigPath, 'utf8');
    expect(content).toContain('"bounded-contexts/**/*.ts"');
    expect(content).toContain("inline: ['@domain-first/handlers-next']");
    expect(steps).toContain('npm install --save-dev @vitest/coverage-v8');
});

test('keeps another testing library when replacement is declined', async () => {
    const { configPath, vitestConfigPath } = setup('.', {}, 'bun:test');
    rstest.mocked(confirm).mockResolvedValueOnce(false);
    expect(await addVitest()).toEqual([]);
    writePendingChanges();
    expect(fs.existsSync(vitestConfigPath)).toBe(false);
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).testingLibrary).toBe(
        'bun:test'
    );
});
