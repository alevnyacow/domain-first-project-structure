import path from 'node:path';
import { ConfigFile } from '../config-file';
import { File, Folder } from '../file-system';
import { confirm } from '../interaction';
import { ProjectRoot } from '../project-root';
import { addGitignoreEntry } from './gitignore';
import { addPackageScripts, describeScripts } from './package-scripts';

export const storybookFrameworkPackage = '@storybook/react-vite';
export const svelteStorybookPackages = {
    svelte: '@storybook/svelte-vite',
    sveltekit: '@storybook/sveltekit'
} as const;

/** The Storybook framework of a frontend choice; Next.js uses React + Vite. */
export const storybookPackageFor = (
    framework: 'react' | 'next' | 'svelte' | 'sveltekit'
) =>
    framework === 'svelte' || framework === 'sveltekit'
        ? svelteStorybookPackages[framework]
        : storybookFrameworkPackage;

/** Svelte projects get Svelte stories; others React ones. */
const storybookFamily = () =>
    ConfigFile.Instance.data.frontend?.svelte ? 'svelte' : 'react';

/** How the Storybook integration is named in menus. */
export const storybookTitle = () =>
    ConfigFile.exists && ConfigFile.Instance.data.frontend?.svelte
        ? ConfigFile.Instance.data.frontend.svelte.framework === 'sveltekit'
            ? 'Storybook (SvelteKit)'
            : 'Storybook (Svelte + Vite)'
        : 'Storybook (React + Vite)';

/** The Storybook config folder relative to the root folder. */
export const storybookFolder = () =>
    `presentation/${storybookFamily()}/.storybook`;

const storybookPreview = (
    frameworkPackage: string
) => `import type { Preview } from '${frameworkPackage}';

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
`;

/**
 * Svelte + Vite needs the Svelte plugin unless the project's Vite config
 * has it; SvelteKit's framework reads the project's Vite config.
 */
export const svelteStorybookFiles = (
    relativeProjectRoot: string,
    frameworkPackage: (typeof svelteStorybookPackages)[keyof typeof svelteStorybookPackages]
) => {
    const withPlugin = frameworkPackage === svelteStorybookPackages.svelte;
    return {
        'main.ts': `import { resolve } from 'node:path';
import type { StorybookConfig } from '${frameworkPackage}';

const projectRoot = resolve(import.meta.dirname, ${JSON.stringify(relativeProjectRoot)});

const config: StorybookConfig = {
    stories: ['../**/*.mdx', '../**/*.stories.@(ts|svelte)'],
    framework: {
        name: '${frameworkPackage}',
        options: {}
    },
    core: {
        disableTelemetry: true
    },
    async viteFinal(viteConfig) {
        const { mergeConfig } = await import('vite');
${
    withPlugin
        ? `        const { svelte } = await import('@sveltejs/vite-plugin-svelte');
        const hasSvelte = (viteConfig.plugins ?? [])
            .flat(Infinity)
            .some(
                (plugin) =>
                    !!plugin &&
                    typeof plugin === 'object' &&
                    'name' in plugin &&
                    String(plugin.name).startsWith('vite-plugin-svelte')
            );

        return mergeConfig(viteConfig, {
            plugins: hasSvelte ? [] : [svelte()],`
        : `
        return mergeConfig(viteConfig, {`
}
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
        'preview.ts': storybookPreview(frameworkPackage)
    };
};

export const storybookFiles = (relativeProjectRoot: string) => ({
    'main.ts': `import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import type { StorybookConfig } from '${storybookFrameworkPackage}';

const projectRoot = resolve(import.meta.dirname, ${JSON.stringify(relativeProjectRoot)});

const config: StorybookConfig = {
    stories: ['../**/*.mdx', '../**/*.stories.@(ts|tsx)'],
    framework: {
        name: '${storybookFrameworkPackage}',
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
    'preview.ts': storybookPreview(storybookFrameworkPackage)
});

export const storybookScripts = (
    rootFolder: string,
    family: 'react' | 'svelte' = 'react'
) => {
    const folder = path.posix.join(
        rootFolder.replaceAll('\\', '/'),
        `presentation/${family}`
    );
    // JSON quotes protect paths containing spaces in package scripts.
    const quote = (value: string) => JSON.stringify(value);
    return {
        storybook: `storybook dev -p 6006 -c ${quote(`${folder}/.storybook`)}`,
        'build-storybook': `storybook build -c ${quote(`${folder}/.storybook`)} -o ${quote(`${folder}/storybook-static`)}`
    };
};

/**
 * Storybook of a Svelte project: the framework follows
 * `frontend.svelte.framework`, stories live in `presentation/svelte`.
 */
const addSvelteStorybook = async (): Promise<string[]> => {
    const config = ConfigFile.Instance.data;
    const svelte = config.frontend?.svelte ?? {};
    const frameworkPackage =
        svelteStorybookPackages[
            svelte.framework === 'sveltekit' ? 'sveltekit' : 'svelte'
        ];
    const root = new ProjectRoot().path;
    const manifestFile = new File(path.join(root, 'package.json'));
    const manifest = JSON.parse(manifestFile.data);
    const selected = await addPackageScripts(
        manifestFile,
        storybookScripts(config.project.rootFolder, 'svelte')
    );
    const folder = new Folder(root).subitem([
        config.project.rootFolder,
        'presentation',
        'svelte',
        '.storybook'
    ]);
    for (const [name, content] of Object.entries(
        svelteStorybookFiles(
            path.relative(folder.path, root).split(path.sep).join('/'),
            frameworkPackage
        )
    )) {
        const file = new File(path.join(folder.path, name));
        if (!file.exists || file.data !== content) file.data = content;
    }
    if (svelte.storybookFramework !== frameworkPackage) {
        ConfigFile.update({
            frontend: {
                ...config.frontend,
                svelte: { ...svelte, storybookFramework: frameworkPackage }
            }
        });
    }
    const buildFolder = path.posix.join(
        config.project.rootFolder.replaceAll('\\', '/'),
        'presentation/svelte/storybook-static'
    );
    addGitignoreEntry(root, `/${buildFolder}/`);
    const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies
    };
    const missing = [
        'storybook',
        frameworkPackage,
        'vite',
        ...(frameworkPackage === svelteStorybookPackages.svelte
            ? ['@sveltejs/vite-plugin-svelte']
            : [])
    ].filter((name) => !dependencies[name]);
    const missingSvelte = (
        svelte.framework === 'sveltekit'
            ? ['@sveltejs/kit', 'svelte']
            : ['svelte']
    ).filter((name) => !dependencies[name]);
    return [
        ...(missing.length
            ? [`npm install --save-dev ${missing.join(' ')}`]
            : []),
        ...(missingSvelte.length
            ? [`npm install ${missingSvelte.join(' ')}`]
            : []),
        ...describeScripts(selected, {
            storybook: 'start Storybook on http://localhost:6006',
            'build-storybook': `build static Storybook into ${buildFolder}`
        })
    ];
};

export const addStorybook = async (): Promise<string[]> => {
    const config = ConfigFile.Instance.data;
    if (config.frontend?.svelte) return addSvelteStorybook();
    if (
        (!config.frontend?.react ||
            (config.frontend?.react?.storybookFramework &&
                config.frontend?.react?.storybookFramework !==
                    storybookFrameworkPackage)) &&
        !(await confirm({
            key: 'configureReact',
            requestRequired: true,
            message: `Configure React scaffolding with ${storybookFrameworkPackage}?`,
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
        storybookScripts(config.project.rootFolder)
    );
    const folder = new Folder(root).subitem([
        config.project.rootFolder,
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
        !config.frontend?.react ||
        config.frontend?.react?.storybookFramework !== storybookFrameworkPackage
    ) {
        ConfigFile.update({
            frontend: {
                ...config.frontend,
                react: {
                    ...config.frontend?.react,
                    storybookFramework: storybookFrameworkPackage
                }
            }
        });
    }
    const buildFolder = path.posix.join(
        config.project.rootFolder.replaceAll('\\', '/'),
        'presentation/react/storybook-static'
    );
    addGitignoreEntry(root, `/${buildFolder}/`);
    const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies
    };
    const missing = [
        'storybook',
        storybookFrameworkPackage,
        'vite',
        '@vitejs/plugin-react'
    ].filter((name) => !dependencies[name]);
    const missingReact = ['react', 'react-dom'].filter(
        (name) => !dependencies[name]
    );
    return [
        ...(missing.length
            ? [`npm install --save-dev ${missing.join(' ')}`]
            : []),
        ...(missingReact.length
            ? [`npm install ${missingReact.join(' ')}`]
            : []),
        ...describeScripts(selected, {
            storybook: 'start Storybook on http://localhost:6006',
            'build-storybook': `build static Storybook into ${buildFolder}`
        })
    ];
};
