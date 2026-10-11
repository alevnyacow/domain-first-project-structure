import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { input } from '@inquirer/prompts';
import { afterAll, afterEach, expect, rstest, test } from '@rstest/core';
import {
    discardPendingChanges,
    filesToOverwrite,
    writePendingChanges
} from '../file-system';
import { addOrval, orvalMutator, queryProvider } from './index';

rstest.mock('@inquirer/prompts', () => ({
    confirm: rstest.fn(),
    select: rstest.fn(),
    input: rstest.fn()
}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-orval-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
let sequence = 0;
const setup = (rootFolder: string, manifest: Record<string, unknown>) => {
    const project = path.join(root, String(sequence++));
    fs.mkdirSync(project);
    fs.writeFileSync(
        path.join(project, 'package.json'),
        JSON.stringify({ scripts: { dev: 'next dev' }, ...manifest })
    );
    fs.writeFileSync(
        path.join(project, 'domain-first.project-structure.config.json'),
        JSON.stringify({
            rootFolder,
            domainFirstPackages: ['@domain-first/handlers-rest'],
            defaultPersistenceLayerImplementation: 'api',
            useReact: true
        })
    );
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    rstest
        .mocked(input)
        .mockImplementation(async ({ default: answer }: any) => answer);
    const read = (file: string) =>
        fs.readFileSync(path.join(project, file), 'utf8');
    return { project, read };
};

test('adds config, mutator, query provider, script and gitignore entry with deferred writes', async () => {
    const { project, read } = setup('.', {
        dependencies: { next: '16.0.0' }
    });
    const steps = await addOrval();
    const configPath = 'presentation/react/data-layer/orval.config.ts';
    expect(fs.existsSync(path.join(project, configPath))).toBe(false);
    writePendingChanges();

    expect(fs.existsSync(path.join(project, 'orval.config.ts'))).toBe(false);
    const config = read(configPath);
    expect(config).toContain("input: '../../../public/openapi.json'");
    expect(config).toContain("target: './orval'");
    expect(config).toContain("path: './api-client/mutator.ts'");
    expect(config).toContain('NEXT_PUBLIC_API_BASE_URL');
    expect(read('presentation/react/data-layer/api-client/mutator.ts')).toBe(
        orvalMutator
    );
    expect(read('presentation/react/data-layer/query-provider.tsx')).toBe(
        queryProvider
    );
    expect(read('.gitignore')).toBe('/presentation/react/data-layer/orval/\n');
    expect(JSON.parse(read('package.json')).scripts['client:orval']).toBe(
        'orval --config "presentation/react/data-layer/orval.config.ts"'
    );
    expect(steps).toEqual([
        'npm install @tanstack/react-query',
        'npm install --save-dev orval',
        'npm run client:orval — generate React Query hooks from public/openapi.json in presentation/react/data-layer/orval',
        'Wrap your app in QueryProvider from presentation/react/data-layer/query-provider.tsx',
        'Add integration → OpenAPI generates the OpenAPI document the client is built from'
    ]);

    await addOrval();
    expect(filesToOverwrite()).toEqual([]);
});

test('reads the document path from the OpenAPI generator and keeps edited mutator and query provider', async () => {
    const { project, read } = setup('src', {
        dependencies: { '@tanstack/react-query': '^5.0.0' },
        devDependencies: { orval: '^8.0.0' }
    });
    fs.mkdirSync(path.join(project, 'scripts'));
    fs.writeFileSync(
        path.join(project, 'scripts/generate-openapi.ts'),
        "generateOpenAPI(restHandlers, { outputFile: { path: 'docs/api.json' } });"
    );
    const providerPath = path.join(
        project,
        'src/presentation/react/data-layer/query-provider.tsx'
    );
    fs.mkdirSync(path.dirname(providerPath), { recursive: true });
    fs.writeFileSync(providerPath, '// custom provider');
    const mutatorPath = path.join(
        project,
        'src/presentation/react/data-layer/api-client/mutator.ts'
    );
    fs.mkdirSync(path.dirname(mutatorPath), { recursive: true });
    fs.writeFileSync(mutatorPath, '// custom mutator');

    const steps = await addOrval();
    writePendingChanges();

    const config = read('src/presentation/react/data-layer/orval.config.ts');
    expect(config).toContain("input: '../../../../docs/api.json'");
    expect(config).not.toContain('baseUrl');
    expect(fs.readFileSync(providerPath, 'utf8')).toBe('// custom provider');
    expect(fs.readFileSync(mutatorPath, 'utf8')).toBe('// custom mutator');
    expect(steps).toEqual([
        'npm run client:orval — generate React Query hooks from docs/api.json in src/presentation/react/data-layer/orval',
        'Wrap your app in QueryProvider from src/presentation/react/data-layer/query-provider.tsx'
    ]);
});
