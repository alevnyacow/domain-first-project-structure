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
import { addOpenapi, apiTitle } from './index';

rstest.mock('@inquirer/prompts', () => ({
    confirm: rstest.fn(),
    select: rstest.fn(),
    input: rstest.fn()
}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-openapi-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
let sequence = 0;
const setup = (
    rootFolder: string,
    manifest: Record<string, unknown>,
    answers: string[]
) => {
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
            domainFirstPackages: [],
            defaultPersistenceLayerImplementation: 'api',
            useReact: false
        })
    );
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    for (const answer of answers) {
        rstest.mocked(input).mockResolvedValueOnce(answer);
    }
    return {
        project,
        scriptPath: path.join(project, 'scripts/generate-openapi.ts')
    };
};

test('builds the API title from the package name', () => {
    expect(apiTitle('demo')).toBe('Demo API');
    expect(apiTitle('@acme/order-service')).toBe('Order Service API');
    expect(apiTitle(undefined)).toBe('API');
});

test('adds the generator script and the package script with deferred writes', async () => {
    const { project, scriptPath } = setup(
        '.',
        {
            name: 'demo',
            dependencies: { next: '16.0.0' }
        },
        ['/api', 'public/openapi.json']
    );
    const steps = await addOpenapi();
    expect(fs.existsSync(scriptPath)).toBe(false);
    expect(rstest.mocked(input).mock.calls[1][0].default).toBe(
        'public/openapi.json'
    );
    writePendingChanges();
    expect(fs.readFileSync(scriptPath, 'utf8')).toBe(
        `import { generateOpenAPI } from '@domain-first/handlers-rest';
import { restHandlers } from '../presentation/rest';

generateOpenAPI(restHandlers, {
    document: { info: { title: 'Demo API', version: '1.0.0' } },
    apiRoutePrefix: ['', 'api'],
    outputFile: { path: 'public/openapi.json' }
});
`
    );
    const manifest = JSON.parse(
        fs.readFileSync(path.join(project, 'package.json'), 'utf8')
    );
    expect(manifest.scripts.dev).toBe('next dev');
    expect(manifest.scripts.openapi).toBe(
        'tsx --env-file-if-exists=.env scripts/generate-openapi.ts'
    );
    expect(steps).toEqual([
        'npm install @domain-first/handlers-rest',
        'npm install --save-dev tsx',
        'npm run openapi — generate the OpenAPI document from restHandlers in public/openapi.json',
        'restHandlers appear in presentation/rest/index.ts with the first REST endpoint generated with @domain-first/wire'
    ]);

    rstest.mocked(input).mockResolvedValueOnce('/api');
    rstest.mocked(input).mockResolvedValueOnce('public/openapi.json');
    await addOpenapi();
    expect(filesToOverwrite()).toEqual([]);
});

test('resolves the root folder and skips installed packages', async () => {
    const { project, scriptPath } = setup(
        'src/server',
        {
            name: 'shop',
            dependencies: { '@domain-first/handlers-rest': '^7.0.0' },
            devDependencies: { tsx: '^4.0.0' }
        },
        ['', 'openapi.json']
    );
    fs.mkdirSync(path.join(project, 'src/server/presentation/rest'), {
        recursive: true
    });
    fs.writeFileSync(
        path.join(project, 'src/server/presentation/rest/index.ts'),
        ''
    );
    const steps = await addOpenapi();
    expect(rstest.mocked(input).mock.calls[1][0].default).toBe('openapi.json');
    writePendingChanges();
    const content = fs.readFileSync(scriptPath, 'utf8');
    expect(content).toContain(
        "import { restHandlers } from '../src/server/presentation/rest';"
    );
    expect(content).toContain("apiRoutePrefix: [''],");
    expect(steps).toEqual([
        'npm run openapi — generate the OpenAPI document from restHandlers in openapi.json'
    ]);
});
