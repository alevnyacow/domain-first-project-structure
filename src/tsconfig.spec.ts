import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, test } from '@rstest/core';
import { compilerOption } from './tsconfig';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-tsconfig-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

let sequence = 0;
const project = (files: Record<string, string>) => {
    const folder = path.join(root, String(sequence++));
    for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(folder, file)), {
            recursive: true
        });
        fs.writeFileSync(path.join(folder, file), content);
    }
    return path.join(folder, 'tsconfig.json');
};

test('reads the option despite comments and trailing commas', () => {
    const config = project({
        'tsconfig.json': `{
    // JSON documents
    "compilerOptions": { "resolveJsonModule": true, /* here */ },
}`
    });
    expect(compilerOption(config, 'resolveJsonModule')).toBe(true);
});

test('is undefined when no config sets the option', () => {
    const config = project({
        'tsconfig.json': '{ "compilerOptions": { "strict": true } }'
    });
    expect(compilerOption(config, 'resolveJsonModule')).toBeUndefined();
});

test('follows relative and package extends, the nearest config first', () => {
    const config = project({
        'tsconfig.json':
            '{ "extends": ["./base", "@acme/tsconfig"], "compilerOptions": {} }',
        'base.json': '{ "compilerOptions": { "resolveJsonModule": false } }',
        'node_modules/@acme/tsconfig/package.json':
            '{ "name": "@acme/tsconfig" }',
        'node_modules/@acme/tsconfig/tsconfig.json':
            '{ "compilerOptions": { "resolveJsonModule": true } }'
    });
    expect(compilerOption(config, 'resolveJsonModule')).toBe(true);
    expect(
        compilerOption(
            project({
                'tsconfig.json': '{ "extends": "./base" }',
                'base.json':
                    '{ "compilerOptions": { "resolveJsonModule": false } }'
            }),
            'resolveJsonModule'
        )
    ).toBe(false);
});

test('is null when a config is missing or unreadable', () => {
    expect(
        compilerOption(path.join(root, 'none.json'), 'resolveJsonModule')
    ).toBeNull();
    expect(
        compilerOption(
            project({ 'tsconfig.json': '{ "extends": "@missing/config" }' }),
            'resolveJsonModule'
        )
    ).toBeNull();
    expect(
        compilerOption(
            project({ 'tsconfig.json': '{ oops' }),
            'resolveJsonModule'
        )
    ).toBeNull();
});
