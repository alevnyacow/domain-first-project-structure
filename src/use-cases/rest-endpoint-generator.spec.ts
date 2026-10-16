import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, rstest, test } from '@rstest/core';
import { Folder, writePendingChanges } from '../file-system';
import { scaffoldRestEndpointGenerator } from './rest-endpoint-generator';

const roots: string[] = [];
afterAll(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

const generate = (withNextAdapter?: boolean) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-rest-generator-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    fs.writeFileSync(
        path.join(root, 'domain-first.project-structure.config.json'),
        JSON.stringify({
            rootFolder: 'src',
            domainFirstPackages: ['@domain-first/handlers-rest'],
            defaultPersistenceLayerImplementation: 'prisma',
            useReact: false
        })
    );
    const cwd = rstest.spyOn(process, 'cwd').mockReturnValue(root);
    try {
        scaffoldRestEndpointGenerator(
            new Folder(root).subitem(['src', 'shared']),
            { withNextAdapter }
        );
        writePendingChanges();
    } finally {
        cwd.mockRestore();
    }
    return fs.readFileSync(
        path.join(
            root,
            'src/shared/presentation/services/rest-endpoint-generator-presentation-service.ts'
        ),
        'utf8'
    );
};

test('declares a placeholder adapter above the class by default', () => {
    const content = generate();
    expect(content).toContain(
        'const adapter = undefined as unknown as Adapter<any[], any>'
    );
    expect(content.indexOf('const adapter')).toBeLessThan(
        content.indexOf('export class')
    );
    expect(content).toContain('})(adapter) as EndpointGenerator');
    expect(content).not.toContain('@domain-first/handlers-next');
});

test('puts default client request errors before generating getters', () => {
    const content = generate();
    expect(content.indexOf('get defaultClientRequestErrors')).toBeLessThan(
        content.indexOf('get withoutGuards')
    );
});

test('imports the Next adapter instead of the placeholder', () => {
    const content = generate(true);
    expect(content).toContain(
        "import { nextAdapter } from '@domain-first/handlers-next'"
    );
    expect(content).toContain('})(nextAdapter) as EndpointGenerator');
    expect(content).not.toContain('const adapter');
    expect(content).not.toContain('type Adapter');
});
