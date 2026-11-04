import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    afterAll,
    afterEach,
    beforeEach,
    expect,
    rstest,
    test
} from '@rstest/core';
import { discardPendingChanges, writePendingChanges } from './file-system';
import {
    endpointFileLookup,
    legacyEndpointFileLookup,
    openapiExtractor,
    openapiExtractorPath
} from './integrations/openapi-extractor';
import { planUpgrade, type UpgradeStep } from './upgrade-steps';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-upgrade-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
let project: string;
let sequence = 0;
const manifest = (dependencies: Record<string, string> = {}) =>
    fs.writeFileSync(
        path.join(project, 'package.json'),
        JSON.stringify({ dependencies })
    );
beforeEach(() => {
    project = path.join(root, String(sequence++));
    fs.mkdirSync(project);
    manifest();
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
});
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});

const flat = {
    rootFolder: 'src/server',
    domainFirstPackages: ['@domain-first/wire'],
    withInMemoryDb: true,
    testingLibrary: 'vitest',
    useReact: true,
    storybookFramework: '@storybook/react-vite',
    defaultPersistenceLayerImplementation: 'prisma',
    rules: { lint: { clock: false } }
};

test('a 7.x config becomes sectioned, with an explicit framework and saved persistence types', async () => {
    manifest({ next: '16.0.0' });
    const { planned, changed, config } = await planUpgrade(flat);
    expect(changed).toBe(true);
    expect(planned.map(({ step }) => step.id)).toEqual([
        'config-sections',
        'react-framework',
        'persistence-default'
    ]);
    expect(config).toEqual({
        project: { rootFolder: 'src/server' },
        backend: {
            domainFirstPackages: ['@domain-first/wire'],
            withInMemoryDb: true,
            testingLibrary: 'vitest',
            rules: { lint: { clock: false } },
            implementations: {
                repositories: { primary: ['prisma'], test: [] },
                commands: { primary: ['prisma'], test: [] },
                queries: { primary: ['prisma'], test: [] }
            }
        },
        frontend: {
            react: {
                storybookFramework: '@storybook/react-vite',
                framework: 'next'
            }
        }
    });
    expect(planned[1].changes).toEqual([
        'frontend.react.framework: "next" (next is in package.json)'
    ]);
});

test('without next and React, the framework is react and there is no frontend', async () => {
    expect(
        (await planUpgrade({ ...flat, useReact: true })).config?.frontend
    ).toEqual({
        react: {
            storybookFramework: '@storybook/react-vite',
            framework: 'react'
        }
    });
    const { config, planned } = await planUpgrade({ ...flat, useReact: false });
    expect(config).not.toHaveProperty('frontend');
    expect(planned.map(({ step }) => step.id)).not.toContain('react-framework');
});

test('an invalid persistence label is dropped instead of saved', async () => {
    const { config, planned } = await planUpgrade({
        ...flat,
        defaultPersistenceLayerImplementation: 'My DB'
    });
    expect(config?.backend).not.toHaveProperty('implementations');
    expect(config?.backend).not.toHaveProperty(
        'defaultPersistenceLayerImplementation'
    );
    expect(planned.at(-1)?.changes[0]).toContain('is removed');
});

test('a current config needs nothing, so the command can run again', async () => {
    const first = await planUpgrade(flat);
    const second = await planUpgrade(first.config);
    expect(second).toEqual({ planned: [], changed: false, config: undefined });
});

test('a current React config without a framework only gets the framework', async () => {
    const { planned, config } = await planUpgrade({
        project: { rootFolder: 'src' },
        frontend: { react: {} }
    });
    expect(planned.map(({ step }) => step.id)).toEqual(['react-framework']);
    expect(config?.frontend?.react?.framework).toBe('react');
});

test('declined optional steps are skipped; manual steps change nothing', async () => {
    const optional: UpgradeStep = {
        id: 'optional',
        kind: 'optional',
        title: 'Optional',
        detect: () => true,
        plan: () => ['change'],
        apply: (context) => {
            context.config.applied = true;
        }
    };
    const manual: UpgradeStep = {
        id: 'manual',
        kind: 'manual',
        title: 'Manual',
        detect: () => true,
        plan: () => ['do it yourself']
    };
    const current = { project: { rootFolder: 'src' } };
    const declined = await planUpgrade(current, () => false, [
        optional,
        manual
    ]);
    expect(declined.changed).toBe(false);
    expect(declined.planned.map(({ step }) => step.id)).toEqual(['manual']);
    const accepted = await planUpgrade(current, () => true, [optional, manual]);
    expect(accepted.config).toMatchObject({ applied: true });
});

const write = (file: string, content: string) => {
    const target = path.join(project, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
};
const read = (file: string) =>
    fs.readFileSync(path.join(project, file), 'utf8');
const exists = (file: string) => fs.existsSync(path.join(project, file));

const posts = 'src/bounded-contexts/posts';
const wiring = `${posts}/wiring/presentation/rest`;
const sharedWire = (name: string) =>
    `export * from '../../bounded-contexts/posts/wiring/presentation/rest/${name}'`;

/** Context-root endpoints as 8.5 scaffolded them, next to a controller. */
const legacyLayout = () => {
    write(
        `${posts}/application/queries/posts-query.ts`,
        'export class PostsQuery {}'
    );
    write(
        `${posts}/presentation/rest/GET.ts`,
        "import type { PostsQuery } from '../../application/queries/posts-query'\nexport class PostsGetEndpoint {}"
    );
    write(
        `${posts}/presentation/rest/_id_/GET.ts`,
        "import type { PostsQuery } from '../../../application/queries/posts-query'\nexport class PostsIdGetEndpoint {}"
    );
    write(
        `${posts}/presentation/rest/comments/GET.ts`,
        'export class CommentsGetEndpoint {}'
    );
    write(
        `${wiring}/wire-posts-get-endpoint.ts`,
        "import { PostsGetEndpoint } from '../../../presentation/rest/GET'"
    );
    write(
        `${wiring}/wire-posts-_id_-get-endpoint.ts`,
        "import { PostsIdGetEndpoint } from '../../../presentation/rest/_id_/GET'"
    );
    write(
        `${wiring}/comments/wire-comments-get-endpoint.ts`,
        "import { CommentsGetEndpoint } from '../../../../presentation/rest/comments/GET'"
    );
    write(
        `${wiring}/comments/index.ts`,
        "export * from './wire-comments-get-endpoint'"
    );
    write(
        `${wiring}/index.ts`,
        [
            "export * from './comments'",
            "export * from './wire-posts-get-endpoint'",
            "export * from './wire-posts-_id_-get-endpoint'"
        ].join('\n')
    );
    write(
        'src/presentation/rest/wires.ts',
        [
            sharedWire('comments'),
            sharedWire('wire-posts-get-endpoint'),
            sharedWire('wire-posts-_id_-get-endpoint')
        ].join('\n')
    );
    write(
        openapiExtractorPath,
        openapiExtractor('src').replace(
            endpointFileLookup('src'),
            legacyEndpointFileLookup('src')
        )
    );
};
const current = { project: { rootFolder: 'src' } };

test('context-root endpoints of 8.5 move to (root) with their wires and imports', async () => {
    legacyLayout();
    const { planned, changed, config } = await planUpgrade(current);
    expect(planned.map(({ step }) => step.id)).toEqual([
        'rest-root-controller',
        'openapi-extractor-root'
    ]);
    expect(planned[0].changes).toContain(
        `${posts}/presentation/rest/_id_/GET.ts → ${posts}/presentation/rest/(root)/_id_/GET.ts`
    );
    expect(changed).toBe(true);
    expect(config).toBeUndefined();
    writePendingChanges();

    const rest = `${posts}/presentation/rest`;
    expect(exists(`${rest}/GET.ts`)).toBe(false);
    expect(exists(`${rest}/_id_`)).toBe(false);
    expect(read(`${rest}/(root)/GET.ts`)).toContain(
        "from '../../../application/queries/posts-query'"
    );
    expect(read(`${rest}/(root)/_id_/GET.ts`)).toContain(
        "from '../../../../application/queries/posts-query'"
    );
    expect(read(`${rest}/comments/GET.ts`)).toBe(
        'export class CommentsGetEndpoint {}'
    );
    expect(exists(`${wiring}/wire-posts-get-endpoint.ts`)).toBe(false);
    expect(read(`${wiring}/(root)/wire-posts-get-endpoint.ts`)).toContain(
        "from '../../../../presentation/rest/(root)/GET'"
    );
    expect(read(`${wiring}/(root)/wire-posts-_id_-get-endpoint.ts`)).toContain(
        "from '../../../../presentation/rest/(root)/_id_/GET'"
    );
    expect(read(`${wiring}/(root)/index.ts`)).toBe(
        "export * from './wire-posts-get-endpoint'\nexport * from './wire-posts-_id_-get-endpoint'"
    );
    expect(read(`${wiring}/index.ts`)).toBe(
        "export * from './comments'\nexport * from './(root)'"
    );
    expect(read('src/presentation/rest/wires.ts')).toBe(
        [sharedWire('comments'), sharedWire('(root)')].join('\n')
    );
    expect(read(openapiExtractorPath)).toBe(openapiExtractor('src'));

    expect((await planUpgrade(current)).planned).toEqual([]);
});

test('declined layout steps change nothing', async () => {
    legacyLayout();
    const { changed } = await planUpgrade(current, () => false);
    expect(changed).toBe(false);
    writePendingChanges();
    expect(exists(`${posts}/presentation/rest/GET.ts`)).toBe(true);
    expect(exists(`${posts}/presentation/rest/(root)`)).toBe(false);
});

test('an extractor changed by hand is left to the user', async () => {
    legacyLayout();
    write(openapiExtractorPath, '// my own extractor');
    const { planned } = await planUpgrade(current);
    expect(planned.map(({ step }) => step.id)).toEqual([
        'rest-root-controller',
        'openapi-extractor-manual'
    ]);
});
