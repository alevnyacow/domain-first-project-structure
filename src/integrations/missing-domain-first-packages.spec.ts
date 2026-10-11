import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, rstest, test } from '@rstest/core';
import { missingDomainFirstPackages } from './index';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-missing-packages-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const check = (packages: string[], manifest: object) => {
    const manifestText = JSON.stringify(manifest);
    const configText = JSON.stringify({
        rootFolder: 'src',
        domainFirstPackages: packages,
        defaultPersistenceLayerImplementation: 'prisma',
        useReact: false
    });
    const manifestPath = path.join(root, 'package.json');
    const configPath = path.join(
        root,
        'domain-first.project-structure.config.json'
    );
    fs.writeFileSync(manifestPath, manifestText);
    fs.writeFileSync(configPath, configText);
    const cwd = rstest.spyOn(process, 'cwd').mockReturnValue(root);
    try {
        const result = missingDomainFirstPackages();
        expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestText);
        expect(fs.readFileSync(configPath, 'utf8')).toBe(configText);
        return result;
    } finally {
        cwd.mockRestore();
    }
};

test('prints only configured missing packages, once each', () => {
    expect(
        check(
            [
                '@domain-first/types',
                '@domain-first/errors',
                '@domain-first/wire',
                '@domain-first/handlers',
                '@domain-first/handlers-rest',
                '@domain-first/errors'
            ],
            {
                dependencies: { '@domain-first/types': '^5' },
                devDependencies: { '@domain-first/wire': '^1' },
                optionalDependencies: { '@domain-first/handlers': '^5' }
            }
        )
    ).toContain('npm i @domain-first/errors @domain-first/handlers-rest');
});

test('handles manifests without dependencies', () => {
    expect(check(['@domain-first/wire'], {})).toContain(
        'npm i @domain-first/wire'
    );
});

test('reports when no installation is needed, including empty config', () => {
    const message: string[] = [];
    expect(check([], {})).toEqual(message);
    expect(
        check(['@domain-first/types'], {
            dependencies: { '@domain-first/types': '^5' }
        })
    ).toEqual(message);
});
