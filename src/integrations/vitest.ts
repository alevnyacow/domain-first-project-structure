import path from 'node:path';
import { confirm } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { File } from '../file-system';
import { ProjectRoot } from '../project-root';
import { addGitignoreEntry } from './gitignore';
import { addPackageScripts, describeScripts } from './package-scripts';

export const vitestScripts = {
    test: 'vitest run --reporter=dot --silent=passed-only',
    'test:coverage': 'vitest run --coverage --reporter=dot --silent=passed-only'
};

export const vitestConfig = (
    rootFolder: string,
    inlineHandlersNext: boolean
) => {
    const folder = (subpath: string) =>
        JSON.stringify(
            path.posix.join(rootFolder.replaceAll('\\', '/'), subpath)
        );
    const server = inlineHandlersNext
        ? `,
        server: {
            deps: {
                // Imports \`next/headers\` without an extension, which only a bundler can resolve
                inline: ['@domain-first/handlers-next']
            }
        }`
        : '';
    return `import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        tsconfigPaths: true
    },
    test: {
        // Playwright runs end-to-end specs
        exclude: [...configDefaults.exclude, 'specs/e2e/**'],
        coverage: {
            provider: 'v8',
            include: [${folder('bounded-contexts/**/*.ts')}, ${folder('shared/**/*.ts')}],
            exclude: [
                '**/*.spec.ts',
                ${folder('shared/infrastructure/**')},
                ${folder('bounded-contexts/*/infrastructure/**')},
                ${folder('bounded-contexts/*/presentation/rest/**')},
                ${folder('shared/wiring/**')},
                ${folder('bounded-contexts/*/wiring/**')}
            ],
            reporter: [['text', { skipFull: true }], 'html']
        }${server}
    }
});
`;
};

export const addVitest = async (): Promise<string[]> => {
    const config = ConfigFile.Instance.data;
    if (
        config.testingLibrary &&
        config.testingLibrary !== 'vitest' &&
        !(await confirm({
            message: `Replace testing library "${config.testingLibrary}" with vitest for generated tests?`,
            default: false
        }))
    ) {
        return [];
    }
    const root = new ProjectRoot().path;
    const manifestFile = new File(path.join(root, 'package.json'));
    const manifest = JSON.parse(manifestFile.data);
    const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies
    };
    const selected = await addPackageScripts(manifestFile, vitestScripts);

    const configFile = new File(path.join(root, 'vitest.config.ts'));
    const content = vitestConfig(
        config.rootFolder,
        Boolean(dependencies['@domain-first/handlers-next'])
    );
    if (!configFile.exists || configFile.data !== content) {
        configFile.data = content;
    }
    if (config.testingLibrary !== 'vitest') {
        ConfigFile.write({ ...config, testingLibrary: 'vitest' });
    }
    addGitignoreEntry(root, '/coverage/');

    const missing = ['vitest', '@vitest/coverage-v8'].filter(
        (name) => !dependencies[name]
    );
    return [
        ...(missing.length
            ? [`npm install --save-dev ${missing.join(' ')}`]
            : []),
        ...describeScripts(selected, {
            test: 'run unit tests',
            'test:coverage':
                'run unit tests with a V8 coverage report in coverage/'
        })
    ];
};
