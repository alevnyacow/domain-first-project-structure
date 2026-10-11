import path from 'node:path';
import { File } from '../file-system';
import { ProjectRoot } from '../project-root';
import { addGitignoreEntry } from './gitignore';
import { addPackageScripts } from './package-scripts';

export const playwrightScripts = {
    'test:e2e': 'playwright test'
};

export const playwrightConfig = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './specs/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] }
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] }
        },
        {
            name: 'Mobile Chrome',
            use: { ...devices['Pixel 5'] }
        },
        {
            name: 'Mobile Safari',
            use: { ...devices['iPhone 12'] }
        }
    ],

    webServer: {
        // Playwright only stops the dev server on a clean shutdown. If its process dies any other
        // way (SIGHUP, SIGKILL), the dev server lives on in its own process group, so it is killed
        // as soon as Playwright is gone.
        command:
            process.platform === 'win32'
                ? 'npm run dev'
                : \`npm run dev & while kill -0 \${process.pid} 2>/dev/null && kill -0 $! 2>/dev/null; do sleep 1; done; kill 0\`,
        url: 'http://localhost:3000',
        timeout: 120000,
        reuseExistingServer: !process.env.CI
    }
});
`;

const exampleSpec = `import { expect, test } from '@playwright/test';

test.describe('home page', () => {
    test('opens the home page', async ({ page, baseURL }) => {
        await page.goto('/');
        await expect(page).toHaveURL(\`\${baseURL}/\`);
    });
});
`;

const exampleReadme = `# Home page e2e cases

## User Stories

1. Guest opens \`/\` and stays on the home page.
`;

const gitignoreEntries = [
    '/test-results/',
    '/playwright-report/',
    '/blob-report/',
    '/playwright/.cache/',
    '/playwright/.auth/'
];

export const addPlaywright = async (): Promise<string[]> => {
    const root = new ProjectRoot().path;
    const manifestFile = new File(path.join(root, 'package.json'));
    const manifest = JSON.parse(manifestFile.data);
    const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies
    };
    const selected = await addPackageScripts(manifestFile, playwrightScripts);

    const configFile = new File(path.join(root, 'playwright.config.ts'));
    if (!configFile.exists || configFile.data !== playwrightConfig) {
        configFile.data = playwrightConfig;
    }
    // The example is a starting point; edits to it are never overwritten.
    const exampleFolder = path.join(root, 'specs/e2e/home');
    for (const [name, content] of [
        ['home.e2e.spec.ts', exampleSpec],
        ['README.MD', exampleReadme]
    ]) {
        const file = new File(path.join(exampleFolder, name));
        if (!file.exists) file.data = content;
    }
    for (const entry of gitignoreEntries) addGitignoreEntry(root, entry);

    return [
        'Playwright configuration saved.',
        'Next steps (run from the project package directory):',
        ...(dependencies['@playwright/test']
            ? []
            : ['  npm install --save-dev @playwright/test']),
        '  npx playwright install --with-deps',
        '  Existing dependency versions were kept.',
        ...(manifest.scripts?.dev
            ? []
            : [
                  '  Add a "dev" script: Playwright starts it as the web server.'
              ]),
        '  Adjust baseURL and webServer.url if the dev server does not listen on http://localhost:3000.',
        `  ${selected['test:e2e'] ? `npm run ${selected['test:e2e']}` : 'npx playwright test'}`,
        '  Open the HTML report: npx playwright show-report'
    ];
};
