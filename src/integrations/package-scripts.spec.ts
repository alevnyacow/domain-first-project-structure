import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, rstest, test } from '@rstest/core';
import { File, filesToOverwrite, writePendingChanges } from '../file-system';
import {
    addPackageScripts,
    addStorybook,
    describeScripts,
    storybookScripts
} from './index';

rstest.mock('@inquirer/prompts', () => ({
    select: rstest.fn(),
    input: rstest.fn(),
    confirm: rstest.fn()
}));

import { input, select } from '@inquirer/prompts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-storybook-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
let sequence = 0;
const createManifest = () => {
    const filePath = path.join(root, `${sequence++}.json`);
    fs.writeFileSync(
        filePath,
        JSON.stringify(
            {
                name: 'example',
                scripts: { dev: 'vite', storybook: 'custom' },
                dependencies: { react: '19' }
            },
            null,
            2
        )
    );
    return new File(filePath);
};

test('stages scripts without touching disk and preserves unrelated fields', async () => {
    const file = createManifest();
    const original = fs.readFileSync(file.path, 'utf8');
    await addPackageScripts(file, { 'build-storybook': 'storybook build' });
    expect(fs.readFileSync(file.path, 'utf8')).toBe(original);
    writePendingChanges();
    expect(JSON.parse(fs.readFileSync(file.path, 'utf8'))).toEqual({
        name: 'example',
        scripts: {
            dev: 'vite',
            storybook: 'custom',
            'build-storybook': 'storybook build'
        },
        dependencies: { react: '19' }
    });
});

test('keeps, replaces or renames conflicting scripts', async () => {
    const file = createManifest();
    rstest.mocked(select).mockResolvedValueOnce('Keep existing');
    expect(await addPackageScripts(file, { storybook: 'new' })).toEqual({});
    expect(JSON.parse(file.data).scripts.storybook).toBe('custom');
    rstest.mocked(select).mockResolvedValueOnce('Use another name');
    rstest.mocked(input).mockResolvedValueOnce('storybook:new');
    expect(await addPackageScripts(file, { storybook: 'new' })).toEqual({
        storybook: 'storybook:new'
    });
    expect(JSON.parse(file.data).scripts.storybook).toBe('custom');
    rstest.mocked(select).mockResolvedValueOnce('Replace');
    await addPackageScripts(file, { storybook: 'new' });
    expect(JSON.parse(file.data).scripts.storybook).toBe('new');
    writePendingChanges();
});

test('identical scripts are left unchanged without prompting', async () => {
    const file = createManifest();
    const original = file.data;
    rstest.mocked(select).mockClear();
    await addPackageScripts(file, { storybook: 'custom' });
    expect(file.data).toBe(original);
    expect(select).not.toHaveBeenCalled();
});

test('describes only selected scripts under their final names', () => {
    expect(
        describeScripts(
            { test: 'test:unit' },
            { test: 'run unit tests', 'test:coverage': 'run coverage' }
        )
    ).toEqual(['npm run test:unit — run unit tests']);
});

test('script paths follow rootFolder, including nested folders and spaces', () => {
    expect(storybookScripts('.').storybook).toBe(
        'storybook dev -p 6006 -c "presentation/react/.storybook"'
    );
    expect(storybookScripts('src/client app')['build-storybook']).toBe(
        'storybook build -c "src/client app/presentation/react/.storybook" -o "src/client app/presentation/react/storybook-static"'
    );
});

test('Storybook integration stages config, is repeatable and flags edited files', async () => {
    const project = path.join(root, 'project');
    fs.mkdirSync(project);
    fs.writeFileSync(
        path.join(project, 'package.json'),
        JSON.stringify({
            scripts: { dev: 'vite' },
            devDependencies: { storybook: '^10.6.1' }
        })
    );
    const configPath = path.join(
        project,
        'domain-first.project-structure.config.json'
    );
    fs.writeFileSync(
        configPath,
        JSON.stringify({
            rootFolder: 'src/client',
            domainFirstPackages: [],
            defaultPersistenceLayerImplementation: 'prisma',
            useReact: true
        })
    );
    const gitignorePath = path.join(project, '.gitignore');
    fs.writeFileSync(gitignorePath, '# Existing rules\nnode_modules/\n');
    const cwd = rstest.spyOn(process, 'cwd').mockReturnValue(project);
    try {
        const steps = await addStorybook();
        const mainPath = path.join(
            project,
            'src/client/presentation/react/.storybook/main.ts'
        );
        expect(fs.existsSync(mainPath)).toBe(false);
        expect(fs.readFileSync(gitignorePath, 'utf8')).toBe(
            '# Existing rules\nnode_modules/\n'
        );
        expect(steps).toContain(
            'npm install --save-dev @storybook/react-vite vite @vitejs/plugin-react'
        );
        writePendingChanges();
        expect(fs.readFileSync(mainPath, 'utf8')).toContain("'@': projectRoot");
        expect(fs.readFileSync(mainPath, 'utf8')).toContain(
            'resolve(import.meta.dirname, "../../../../..")'
        );
        expect(
            JSON.parse(fs.readFileSync(configPath, 'utf8')).storybookFramework
        ).toBe('@storybook/react-vite');
        expect(
            JSON.parse(
                fs.readFileSync(path.join(project, 'package.json'), 'utf8')
            ).scripts.dev
        ).toBe('vite');
        await addStorybook();
        expect(filesToOverwrite()).toEqual([]);
        writePendingChanges();
        expect(fs.readFileSync(gitignorePath, 'utf8')).toBe(
            '# Existing rules\nnode_modules/\n/src/client/presentation/react/storybook-static/\n'
        );
        fs.writeFileSync(mainPath, '// custom config');
        await addStorybook();
        expect(filesToOverwrite()).toEqual([mainPath]);
        expect(fs.readFileSync(mainPath, 'utf8')).toBe('// custom config');
        writePendingChanges();
    } finally {
        cwd.mockRestore();
    }
});
