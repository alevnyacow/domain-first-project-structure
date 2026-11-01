import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import {
    afterAll,
    afterEach,
    beforeEach,
    expect,
    rstest,
    test
} from '@rstest/core';
import { ConfigFile, configFileName, lintChecks } from '../config-file';
import {
    defaultDependencyRules,
    moduleKinds,
    resolveDependencyRules
} from '../dependency-rules';
import {
    discardPendingChanges,
    filesToOverwrite,
    writePendingChanges
} from '../file-system';
import { initializeUseCase } from './initialize';

rstest.mock('@inquirer/prompts', () => ({
    input: rstest.fn(),
    confirm: rstest.fn(),
    select: rstest.fn(),
    checkbox: rstest.fn(),
    Separator: class {}
}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-sections-'));
let project: string;
let sequence = 0;
let prompts: string[];
const answer = (answers: Record<string, unknown>) => {
    const reply = async ({ message, default: fallback, choices }: any) => {
        prompts.push(message);
        if (message in answers) return answers[message];
        if (message === '@domain-first packages')
            return choices
                .filter((choice: any) => choice.checked)
                .map((choice: any) => choice.value);
        return fallback;
    };
    rstest.mocked(input).mockImplementation(reply);
    rstest.mocked(confirm).mockImplementation(reply);
    rstest.mocked(checkbox).mockImplementation(reply);
    rstest.mocked(select).mockImplementation(reply);
};
const persist = async () => {
    writePendingChanges();
    return ConfigFile.Instance.data;
};
beforeEach(() => {
    project = path.join(root, String(sequence++));
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, 'package.json'), '{}');
    rstest.spyOn(process, 'cwd').mockReturnValue(project);
    rstest.spyOn(console, 'log').mockImplementation(() => {});
    prompts = [];
});
afterEach(() => {
    discardPendingChanges();
    rstest.restoreAllMocks();
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('initial setup visits project, backend, frontend in order and can defer all three', async () => {
    answer({
        'Configure project now?': false,
        'Configure backend now?': false,
        'Configure frontend now?': false
    });
    const steps = await initializeUseCase();
    expect(prompts).toEqual([
        'Configure project now?',
        'Configure backend now?',
        'Configure frontend now?'
    ]);
    expect(fs.existsSync(path.join(project, configFileName))).toBe(false);
    expect(await persist()).toEqual({ project: { rootFolder: 'src' } });
    expect(fs.existsSync(path.join(project, 'src'))).toBe(false);
    for (const section of ['project', 'backend', 'frontend'])
        expect(steps).toContain(
            `configure ${section} later with df-init --section ${section}`
        );
});

test('backend setup writes every default dependency list and enabled lint check into the config', async () => {
    answer({
        'Scaffold in-memory DB for test implementations': false,
        'Scaffold unit tests': false
    });
    await initializeUseCase('backend');
    await persist();
    const config = JSON.parse(
        fs.readFileSync(path.join(project, configFileName), 'utf8')
    );
    const rules = config.backend.rules;
    expect(Object.keys(rules.dependencies).sort()).toEqual(
        [...moduleKinds].sort()
    );
    expect(Object.values(rules.dependencies).every(Array.isArray)).toBe(true);
    expect(resolveDependencyRules(rules.dependencies)).toEqual(
        defaultDependencyRules
    );
    expect(rules.lint).toEqual(
        Object.fromEntries(lintChecks.map((check) => [check, true]))
    );
});

test('backend reconfiguration fills missing rules without changing explicit lists, patches or disabled checks', async () => {
    const overrides = {
        dependencies: {
            queries: [],
            'use-cases': {
                add: ['use-cases' as const],
                remove: ['repositories' as const]
            }
        },
        lint: { clock: false }
    };
    ConfigFile.write({
        project: { rootFolder: 'src' },
        backend: { domainFirstPackages: [], rules: overrides }
    });
    writePendingChanges();
    answer({});
    await initializeUseCase('backend');
    const rules = (await persist()).backend!.rules!;
    expect(rules.dependencies?.queries).toEqual([]);
    expect(rules.dependencies?.['use-cases']).toEqual(
        overrides.dependencies['use-cases']
    );
    expect(resolveDependencyRules(rules.dependencies)).toEqual(
        resolveDependencyRules(overrides.dependencies)
    );
    expect(rules.lint?.clock).toBe(false);
    expect(
        lintChecks.every(
            (check) => check === 'clock' || rules.lint?.[check] === true
        )
    ).toBe(true);
    expect(Object.keys(rules.dependencies ?? {}).sort()).toEqual(
        [...moduleKinds].sort()
    );
    await initializeUseCase('backend');
    expect((await persist()).backend?.rules).toEqual(rules);
});

test('frontend-only setup can be followed by backend setup, preserving frontend and implementation choices', async () => {
    answer({
        'Configure project now?': true,
        'Root folder (use "/" for inner folders):': 'app',
        'Configure backend now?': false,
        'Configure frontend now?': true,
        'Frontend framework:': 'react',
        'Use Storybook': true
    });
    await initializeUseCase();
    await persist();
    expect(ConfigFile.Instance.data).toEqual({
        project: { rootFolder: 'app' },
        frontend: {
            react: {
                framework: 'react',
                storybookFramework: '@storybook/react-vite'
            }
        }
    });
    ConfigFile.update({
        backend: {
            domainFirstPackages: [],
            implementations: { ports: { primary: ['s3'], test: [] } },
            rules: { lint: { clock: false } }
        }
    });
    writePendingChanges();
    prompts = [];
    answer({
        '@domain-first packages': ['@domain-first/wire'],
        'Scaffold in-memory DB for test implementations': true,
        'Scaffold unit tests': true
    });
    await initializeUseCase('backend');
    const config = await persist();
    expect(prompts).not.toContain('Frontend framework:');
    expect(prompts).not.toContain('Root folder (use "/" for inner folders):');
    expect(config.backend).toMatchObject({
        domainFirstPackages: ['@domain-first/wire'],
        withInMemoryDb: true,
        testingLibrary: 'vitest'
    });
    expect(config.frontend?.react?.storybookFramework).toBe(
        '@storybook/react-vite'
    );
    expect(config.backend?.implementations?.ports?.primary).toEqual(['s3']);
    expect(config.backend?.rules?.lint?.clock).toBe(false);
    expect(
        fs.existsSync(
            path.join(project, 'app/shared-kernel/wiring/env-branched-wire.ts')
        )
    ).toBe(true);
    expect(
        fs.existsSync(
            path.join(
                project,
                'app/shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.spec.ts'
            )
        )
    ).toBe(true);
});

test('existing config prompts for one section, pre-fills its settings and keeps edited support files', async () => {
    ConfigFile.write({
        project: { rootFolder: 'src' },
        backend: {
            domainFirstPackages: ['@domain-first/wire'],
            withInMemoryDb: true,
            testingLibrary: 'bun:test'
        }
    });
    writePendingChanges();
    const wirePath = path.join(
        project,
        'src/shared-kernel/wiring/env-branched-wire.ts'
    );
    fs.mkdirSync(path.dirname(wirePath), { recursive: true });
    fs.writeFileSync(wirePath, '// user wire');
    answer({ 'Configuration section:': 'backend' });
    await initializeUseCase();
    await persist();
    expect(prompts).toEqual([
        'Configuration section:',
        '@domain-first packages',
        'envBranchedWire branches:',
        'Scaffold in-memory DB for test implementations',
        'Scaffold unit tests',
        'Unit testing library:'
    ]);
    expect(ConfigFile.backend.testingLibrary).toBe('bun:test');
    expect(ConfigFile.backend.domainFirstPackages).toEqual([
        '@domain-first/wire'
    ]);
    expect(fs.readFileSync(wirePath, 'utf8')).toBe('// user wire');
    expect(
        fs.existsSync(
            path.join(
                project,
                'src/shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts'
            )
        )
    ).toBe(true);
});

test('frontend can be configured later without backend settings or source scaffolding', async () => {
    ConfigFile.write({ project: { rootFolder: 'src' } });
    writePendingChanges();
    answer({ 'Frontend framework:': 'react', 'Use Storybook': false });
    await initializeUseCase('frontend');
    expect((await persist()).frontend).toEqual({
        react: { framework: 'react' }
    });
    expect(ConfigFile.Instance.data.backend).toBeUndefined();
    expect(prompts).toEqual(['Frontend framework:', 'Use Storybook']);
    expect(fs.existsSync(path.join(project, 'src'))).toBe(false);
});

const nextAdapterPrompt = 'Use @domain-first/handlers-next for REST endpoints';
const generatorPath =
    'src/shared-kernel/presentation/services/rest-endpoint-generator-presentation-service.ts';

test('Next.js setup asks once after choosing frontend and creates the Next adapter and wired route without installed next', async () => {
    fs.mkdirSync(path.join(project, 'src/app'), { recursive: true });
    answer({
        'Configure project now?': true,
        'Configure backend now?': true,
        '@domain-first packages': ['@domain-first/wire'],
        'Scaffold in-memory DB for test implementations': false,
        'Scaffold unit tests': false,
        'Configure frontend now?': true,
        'Frontend framework:': 'next',
        [nextAdapterPrompt]: true,
        'Use Storybook': true
    });
    const steps = await initializeUseCase();
    expect(fs.existsSync(path.join(project, generatorPath))).toBe(false);
    const config = await persist();
    expect(config.frontend?.react).toEqual({
        framework: 'next',
        storybookFramework: '@storybook/react-vite'
    });
    expect(config.backend?.domainFirstPackages).toEqual([
        '@domain-first/wire',
        '@domain-first/handlers-rest'
    ]);
    expect(
        prompts.filter((message) => message === nextAdapterPrompt)
    ).toHaveLength(1);
    expect(prompts.indexOf(nextAdapterPrompt)).toBeGreaterThan(
        prompts.indexOf('Frontend framework:')
    );
    const generator = fs.readFileSync(
        path.join(project, generatorPath),
        'utf8'
    );
    expect(generator).toContain(
        "import { nextAdapter } from '@domain-first/handlers-next'"
    );
    expect(generator).not.toContain('const adapter = undefined');
    expect(
        fs.readFileSync(
            path.join(project, 'src/app/api/[...path]/route.ts'),
            'utf8'
        )
    ).toContain('nextEndpoints(restHandlers)');
    expect(steps).toContain('npm i @domain-first/handlers-next');
    expect(steps).toContain(
        'npm i @domain-first/wire @domain-first/handlers-rest'
    );
    expect(steps).toContain('npm i next react react-dom');
    expect(prompts).not.toContain('Storybook framework package:');
    const storybookMain = fs.readFileSync(
        path.join(project, 'src/presentation/react/.storybook/main.ts'),
        'utf8'
    );
    expect(storybookMain).toContain("name: '@storybook/react-vite'");
    expect(storybookMain).not.toContain('@storybook/nextjs');
    const manifest = JSON.parse(
        fs.readFileSync(path.join(project, 'package.json'), 'utf8')
    );
    expect(manifest.scripts.storybook).toContain('storybook dev');
    expect(manifest.scripts['build-storybook']).toContain('storybook build');
    expect(fs.readFileSync(path.join(project, '.gitignore'), 'utf8')).toContain(
        '/src/presentation/react/storybook-static/'
    );
    expect(steps).toContain(
        'npm install --save-dev storybook @storybook/react-vite vite @vitejs/plugin-react'
    );
    expect(
        steps.some((step) =>
            step.includes('existing endpoint generator was kept')
        )
    ).toBe(false);
});

test('React selection skips the Next question even when next is installed', async () => {
    fs.writeFileSync(
        path.join(project, 'package.json'),
        JSON.stringify({ dependencies: { next: '16' } })
    );
    answer({
        'Configure project now?': true,
        'Configure backend now?': true,
        '@domain-first packages': ['@domain-first/handlers-rest'],
        'Scaffold in-memory DB for test implementations': false,
        'Scaffold unit tests': false,
        'Configure frontend now?': true,
        'Frontend framework:': 'react',
        'Use Storybook': false
    });
    const steps = await initializeUseCase();
    await persist();
    expect(prompts).not.toContain(nextAdapterPrompt);
    expect(ConfigFile.Instance.data.frontend?.react?.framework).toBe('react');
    expect(
        fs.readFileSync(path.join(project, generatorPath), 'utf8')
    ).toContain('const adapter = undefined');
    expect(
        fs.existsSync(path.join(project, 'app/api/[...path]/route.ts'))
    ).toBe(false);
    expect(steps).not.toContain('npm i @domain-first/handlers-next');
});

test('declining handlers-next keeps Next.js frontend without enabling backend REST', async () => {
    ConfigFile.write({
        project: { rootFolder: 'src' },
        backend: { domainFirstPackages: [], rules: { lint: { clock: false } } }
    });
    writePendingChanges();
    answer({
        'Frontend framework:': 'next',
        [nextAdapterPrompt]: false,
        'Use Storybook': false
    });
    const steps = await initializeUseCase('frontend');
    const config = await persist();
    expect(config.frontend?.react?.framework).toBe('next');
    expect(config.backend).toEqual({
        domainFirstPackages: [],
        rules: { lint: { clock: false } }
    });
    expect(fs.existsSync(path.join(project, generatorPath))).toBe(false);
    expect(fs.existsSync(path.join(project, 'app'))).toBe(false);
    expect(steps).not.toContain('npm i @domain-first/handlers-next');
});

test('Next.js frontend with deferred backend connects REST when backend is configured later', async () => {
    answer({ 'Frontend framework:': 'next', 'Use Storybook': false });
    await initializeUseCase('frontend');
    await persist();
    expect(ConfigFile.Instance.data.backend).toBeUndefined();
    expect(prompts).not.toContain(nextAdapterPrompt);
    prompts = [];
    answer({
        [nextAdapterPrompt]: true,
        'Scaffold in-memory DB for test implementations': false,
        'Scaffold unit tests': false
    });
    const steps = await initializeUseCase('backend');
    await persist();
    expect(
        prompts.filter((message) => message === nextAdapterPrompt)
    ).toHaveLength(1);
    expect(ConfigFile.backend.domainFirstPackages).toEqual([
        '@domain-first/handlers-rest'
    ]);
    expect(
        fs.readFileSync(
            path.join(project, 'app/api/[...path]/route.ts'),
            'utf8'
        )
    ).toContain('nextEndpoints([])');
    expect(steps).toContain('npm i @domain-first/handlers-next');
});

test('enabling Next REST from frontend preserves edited support files and backend settings', async () => {
    ConfigFile.write({
        project: { rootFolder: 'src' },
        backend: {
            domainFirstPackages: ['@domain-first/handlers-rest'],
            implementations: { ports: { primary: ['s3'], test: [] } },
            rules: { lint: { clock: false } }
        }
    });
    writePendingChanges();
    for (const file of [generatorPath, 'app/api/[...path]/route.ts']) {
        fs.mkdirSync(path.dirname(path.join(project, file)), {
            recursive: true
        });
        fs.writeFileSync(path.join(project, file), '// user code');
    }
    answer({
        'Frontend framework:': 'next',
        [nextAdapterPrompt]: true,
        'Use Storybook': false
    });
    const steps = await initializeUseCase('frontend');
    expect(filesToOverwrite()).toEqual([]);
    await persist();
    expect(fs.readFileSync(path.join(project, generatorPath), 'utf8')).toBe(
        '// user code'
    );
    expect(
        fs.readFileSync(
            path.join(project, 'app/api/[...path]/route.ts'),
            'utf8'
        )
    ).toBe('// user code');
    expect(ConfigFile.backend.implementations?.ports?.primary).toEqual(['s3']);
    expect(ConfigFile.backend.rules?.lint?.clock).toBe(false);
    expect(steps).toContain(
        'the existing endpoint generator was kept — pass nextAdapter from @domain-first/handlers-next to its createEndpoint calls'
    );
});

test('frontend reconfiguration preselects the saved framework and aligns Storybook with the Vite integration', async () => {
    ConfigFile.write({
        project: { rootFolder: 'src' },
        frontend: {
            react: {
                framework: 'next',
                storybookFramework: '@storybook/nextjs'
            }
        }
    });
    writePendingChanges();
    answer({});
    await initializeUseCase('frontend');
    await persist();
    expect(rstest.mocked(select).mock.lastCall?.[0].default).toBe('next');
    expect(ConfigFile.Instance.data.frontend?.react).toEqual({
        framework: 'next',
        storybookFramework: '@storybook/react-vite'
    });
});

test('revisiting all sections and deferring them preserves previously configured settings', async () => {
    const original = {
        project: { rootFolder: 'app' },
        backend: { domainFirstPackages: [] },
        frontend: { react: {} }
    };
    ConfigFile.write(original);
    writePendingChanges();
    answer({
        'Configuration section:': 'all',
        'Configure project now?': false,
        'Configure backend now?': false,
        'Configure frontend now?': false
    });
    await initializeUseCase();
    expect(await persist()).toEqual(original);
});

test('project-only setup preserves other sections and does not move existing source', async () => {
    ConfigFile.write({
        project: { rootFolder: 'src' },
        backend: {
            domainFirstPackages: [],
            implementations: { queries: { primary: ['sql'], test: [] } }
        },
        frontend: { react: {} }
    });
    writePendingChanges();
    fs.mkdirSync(path.join(project, 'src'));
    fs.writeFileSync(path.join(project, 'src/keep.ts'), '// existing');
    answer({ 'Root folder (use "/" for inner folders):': 'app' });
    await initializeUseCase('project');
    const config = await persist();
    expect(config.project.rootFolder).toBe('app');
    expect(config.backend).toMatchObject({ domainFirstPackages: [] });
    expect(config.frontend).toEqual({ react: {} });
    expect(config.backend?.implementations?.queries?.primary).toEqual(['sql']);
    expect(fs.readFileSync(path.join(project, 'src/keep.ts'), 'utf8')).toBe(
        '// existing'
    );
    expect(fs.existsSync(path.join(project, 'app'))).toBe(false);
    expect(prompts).toEqual(['Root folder (use "/" for inner folders):']);
});

test('interrupted initialization never writes a partially configured project', async () => {
    answer({ 'Configure project now?': true, 'Configure backend now?': true });
    rstest.mocked(checkbox).mockRejectedValueOnce(new Error('cancelled'));
    await expect(initializeUseCase()).rejects.toThrow('cancelled');
    discardPendingChanges();
    expect(fs.readdirSync(project)).toEqual(['package.json']);
});

const envWirePath = () =>
    path.join(project, 'src/shared-kernel/wiring/env-branched-wire.ts');
const backendAnswers = {
    '@domain-first packages': ['@domain-first/wire'],
    'Scaffold in-memory DB for test implementations': false,
    'Scaffold unit tests': false
};

test('default wire branches save nothing and select the branch by NODE_ENV', async () => {
    answer(backendAnswers);
    const steps = await initializeUseCase('backend');
    await persist();
    expect(ConfigFile.backend).not.toHaveProperty('envBranches');
    expect(fs.readFileSync(envWirePath(), 'utf8')).toContain(
        "process.env.NODE_ENV ?? 'development'"
    );
    expect(steps.join('\n')).not.toContain('currentBranch');
});

test('custom wire branches with a created test branch leave the selector for the user', async () => {
    answer({
        ...backendAnswers,
        'envBranchedWire branches:': 'custom',
        'Branches (comma-separated):': ' local, staging ,production '
    });
    // The test branch question defaults to creating one.
    const steps = await initializeUseCase('backend');
    await persist();
    expect(ConfigFile.backend.envBranches).toEqual({
        names: ['local', 'staging', 'production', 'test'],
        test: 'test'
    });
    expect(
        fs.readFileSync(envWirePath(), 'utf8')
    ).toBe(`import { branchedWire } from '@domain-first/wire'

export type EnvBranch = 'local' | 'staging' | 'production' | 'test'

/**
 * The branch this process runs in. Write how it is selected:
 * until then, this function doesn't compile.
 */
const currentBranch = (): EnvBranch => {
}

export const envBranchedWire = branchedWire(currentBranch)`);
    expect(steps).toContain(
        "src/shared-kernel/wiring/env-branched-wire.ts doesn't compile until you write currentBranch: return the branch this process runs in (local, staging, production, test)"
    );
});

test('one of the custom branches can be the test branch; names are validated', async () => {
    answer({
        ...backendAnswers,
        'envBranchedWire branches:': 'custom',
        'Branches (comma-separated):': 'qa, prod',
        'Test branch:': 'qa'
    });
    await initializeUseCase('backend');
    await persist();
    expect(ConfigFile.backend.envBranches).toEqual({
        names: ['qa', 'prod'],
        test: 'qa'
    });
    const { validate } = rstest
        .mocked(input)
        .mock.calls.map(([config]) => config as any)
        .find(({ message }) => message === 'Branches (comma-separated):');
    expect(validate('qa, qa')).toBe('Branch names must be unique.');
    expect(validate('Staging')).toContain('lowercase');
    expect(validate('test')).toContain('besides test');
    expect(validate('local')).toBe(true);
});

test('changing branches of an existing wire setup keeps env-branched-wire.ts and says so', async () => {
    ConfigFile.write({
        project: { rootFolder: 'src' },
        backend: { domainFirstPackages: ['@domain-first/wire'] }
    });
    writePendingChanges();
    fs.mkdirSync(path.dirname(envWirePath()), { recursive: true });
    fs.writeFileSync(envWirePath(), '// user wire');
    answer({
        ...backendAnswers,
        'envBranchedWire branches:': 'custom',
        'Branches (comma-separated):': 'qa, prod',
        'Test branch:': 'qa'
    });
    const steps = await initializeUseCase('backend');
    await persist();
    expect(fs.readFileSync(envWirePath(), 'utf8')).toBe('// user wire');
    expect(steps).toContain(
        'src/shared-kernel/wiring/env-branched-wire.ts and existing envBranchedWire calls keep their branches: change them to qa, prod yourself'
    );
});

test('custom wire branches can go without a test branch, even a single one', async () => {
    answer({
        ...backendAnswers,
        'envBranchedWire branches:': 'custom',
        'Branches (comma-separated):': 'local'
    });
    rstest
        .mocked(select)
        .mockImplementation(
            async ({ message, choices, default: fallback }: any) => {
                prompts.push(message);
                if (message === 'envBranchedWire branches:') return 'custom';
                if (message === 'Test branch:') {
                    expect(choices[0]).toMatchObject({
                        value: 'local',
                        disabled: '(the only branch)'
                    });
                    return choices.at(-1).value;
                }
                return fallback;
            }
        );
    await initializeUseCase('backend');
    await persist();
    expect(ConfigFile.backend.envBranches).toEqual({ names: ['local'] });
    expect(fs.readFileSync(envWirePath(), 'utf8')).toContain(
        "export type EnvBranch = 'local'"
    );
});

test('an entered test branch is preselected instead of offering to create one', async () => {
    answer({
        ...backendAnswers,
        'envBranchedWire branches:': 'custom',
        'Branches (comma-separated):': 'local, test, production'
    });
    await initializeUseCase('backend');
    await persist();
    const testBranch = rstest
        .mocked(select)
        .mock.calls.map(([config]) => config as any)
        .find(({ message }) => message === 'Test branch:');
    expect(testBranch.default).toBe('test');
    expect(
        testBranch.choices.map(({ name }: { name: string }) => name)
    ).toEqual([
        'local',
        'test',
        'production',
        'No test branch: every branch uses the primary implementation'
    ]);
    expect(ConfigFile.backend.envBranches).toEqual({
        names: ['local', 'test', 'production'],
        test: 'test'
    });
});
