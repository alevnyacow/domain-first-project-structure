import path from 'node:path';
import { confirm } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { File, Folder } from '../file-system';
import { ProjectRoot } from '../project-root';
import { addPackageScripts } from './package-scripts';

export const storybookFiles = (relativeProjectRoot: string) => ({
    'main.ts': `import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import type { StorybookConfig } from '@storybook/react-vite';

const projectRoot = resolve(import.meta.dirname, ${JSON.stringify(relativeProjectRoot)});

const config: StorybookConfig = {
    stories: ['../**/*.mdx', '../**/*.stories.@(ts|tsx)'],
    framework: {
        name: '@storybook/react-vite',
        options: {}
    },
    core: {
        disableTelemetry: true
    },
    async viteFinal(viteConfig) {
        const { mergeConfig } = await import('vite');

        return mergeConfig(viteConfig, {
            plugins: [react()],
            resolve: {
                alias: {
                    '@': projectRoot
                }
            }
        });
    }
};

export default config;
`,
    'preview.ts': `import type { Preview } from '@storybook/react-vite';

const preview: Preview = {
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i
            }
        }
    }
};

export default preview;
`
});

export const storybookScripts = (rootFolder: string) => {
    const folder = path.posix.join(
        rootFolder.replaceAll('\\', '/'),
        'presentation/react'
    );
    // JSON quotes protect paths containing spaces in package scripts.
    const quote = (value: string) => JSON.stringify(value);
    return {
        storybook: `storybook dev -p 6006 -c ${quote(`${folder}/.storybook`)}`,
        'build-storybook': `storybook build -c ${quote(`${folder}/.storybook`)} -o ${quote(`${folder}/storybook-static`)}`
    };
};

export const addStorybook = async (): Promise<string[]> => {
    const config = ConfigFile.Instance.data;
    if (
        (!config.useReact ||
            (config.storybookFramework &&
                config.storybookFramework !== '@storybook/react-vite')) &&
        !(await confirm({
            message: 'Configure React scaffolding with @storybook/react-vite?',
            default: false
        }))
    ) {
        return [];
    }
    const root = new ProjectRoot().path;
    const manifestFile = new File(path.join(root, 'package.json'));
    const manifest = JSON.parse(manifestFile.data);
    const selected = await addPackageScripts(
        manifestFile,
        storybookScripts(config.rootFolder)
    );
    const folder = new Folder(root).subitem([
        config.rootFolder,
        'presentation',
        'react',
        '.storybook'
    ]);
    for (const [name, content] of Object.entries(
        storybookFiles(
            path.relative(folder.path, root).split(path.sep).join('/')
        )
    )) {
        const file = new File(path.join(folder.path, name));
        if (!file.exists || file.data !== content) file.data = content;
    }
    if (
        !config.useReact ||
        config.storybookFramework !== '@storybook/react-vite'
    ) {
        ConfigFile.write({
            ...config,
            useReact: true,
            storybookFramework: '@storybook/react-vite'
        });
    }
    const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies
    };
    const missing = [
        'storybook',
        '@storybook/react-vite',
        'vite',
        '@vitejs/plugin-react'
    ].filter((name) => !dependencies[name]);
    const missingReact = ['react', 'react-dom'].filter(
        (name) => !dependencies[name]
    );
    return [
        'Storybook configuration saved (React + Vite).',
        'Next steps (run from the project package directory):',
        ...(missing.length
            ? [`  npm install --save-dev ${missing.join(' ')}`]
            : []),
        ...(missingReact.length
            ? [`  npm install ${missingReact.join(' ')}`]
            : []),
        '  Existing dependency versions were kept; ensure Storybook packages are compatible.',
        '  Add your CSS imports to .storybook/preview.ts using relative paths or the @/ alias (project root).',
        '  Generate a UI-kit component or widget UI to create a story.',
        ...(selected.storybook ? [`  npm run ${selected.storybook}`] : []),
        ...(selected['build-storybook']
            ? [`  npm run ${selected['build-storybook']}`]
            : [])
    ];
};
