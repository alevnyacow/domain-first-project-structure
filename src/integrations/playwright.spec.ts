import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, expect, rstest, test } from '@rstest/core';
import {
    discardPendingChanges,
    filesToOverwrite,
    writePendingChanges
} from '../file-system';
import { addPlaywright } from './index';

rstest.mock('@inquirer/prompts', () => ({
    confirm: rstest.fn(),
    select: rstest.fn(),
    input: rstest.fn()
}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-playwright-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
let sequence = 0;
const setup = (manifest: object) => {
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
            defaultPersistenceLayerImplementation: 'api',
            useReact: false
        })
    );
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    return {
        project,
        configPath: path.join(project, 'playwright.config.ts'),
        specPath: path.join(project, 'specs/e2e/home/home.e2e.spec.ts')
    };
};

test('adds config, example spec, script and gitignore entries with deferred writes', async () => {
    const { project, configPath, specPath } = setup({
        scripts: { dev: 'next dev' }
    });
    const steps = await addPlaywright();
    expect(fs.existsSync(configPath)).toBe(false);
    writePendingChanges();
    expect(fs.readFileSync(configPath, 'utf8')).toContain(
        "testDir: './specs/e2e'"
    );
    expect(fs.readFileSync(specPath, 'utf8')).toContain("page.goto('/')");
    expect(fs.existsSync(path.join(project, 'specs/e2e/home/README.MD'))).toBe(
        true
    );
    const manifest = JSON.parse(
        fs.readFileSync(path.join(project, 'package.json'), 'utf8')
    );
    expect(manifest.scripts).toEqual({
        dev: 'next dev',
        'test:e2e': 'playwright test'
    });
    expect(fs.readFileSync(path.join(project, '.gitignore'), 'utf8')).toBe(
        '/test-results/\n/playwright-report/\n/blob-report/\n/playwright/.cache/\n/playwright/.auth/\n'
    );
    expect(steps.slice(2, 4)).toEqual([
        '  npm install --save-dev @playwright/test',
        '  npx playwright install --with-deps'
    ]);
    expect(fs.readFileSync(configPath, 'utf8')).not.toContain(
        "channel: 'chrome'"
    );
    expect(steps).toContain('  npm run test:e2e');
    expect(steps.join('\n')).not.toContain('Add a "dev" script');

    fs.writeFileSync(specPath, '// custom spec');
    await addPlaywright();
    expect(filesToOverwrite()).toEqual([]);
    writePendingChanges();
    expect(fs.readFileSync(specPath, 'utf8')).toBe('// custom spec');
    expect(fs.readFileSync(path.join(project, '.gitignore'), 'utf8')).toBe(
        '/test-results/\n/playwright-report/\n/blob-report/\n/playwright/.cache/\n/playwright/.auth/\n'
    );
    fs.writeFileSync(configPath, '// custom config');
    await addPlaywright();
    expect(filesToOverwrite()).toEqual([configPath]);
});

test('skips installed package and asks for a dev script', async () => {
    setup({ devDependencies: { '@playwright/test': '^1.0.0' } });
    const steps = await addPlaywright();
    expect(steps.join('\n')).not.toContain('npm install');
    expect(steps).toContain(
        '  Add a "dev" script: Playwright starts it as the web server.'
    );
});
