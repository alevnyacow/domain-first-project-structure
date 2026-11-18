import { nextAppFolder, usesNext } from './next-app';
import type { FrontendFramework } from './react-module-move';
import { routePageFile } from './react-module-move';
import { svelteKitRoutesFolder, usesSvelteKit } from './sveltekit-app';

/**
 * The file-based router pages get routes in: the Next.js App Router for
 * React, SvelteKit for Svelte. Undefined without one.
 */
export type PageRouter = {
    title: 'Next.js' | 'SvelteKit';
    /** The routes folder relative to the project root. */
    folder: (root: string) => string;
    /** The file of a route that renders the page. */
    pageFile: string;
};

export const pageRouter = (
    framework: FrontendFramework
): PageRouter | undefined => {
    if (framework === 'react')
        return usesNext()
            ? {
                  title: 'Next.js',
                  folder: nextAppFolder,
                  pageFile: routePageFile.react
              }
            : undefined;
    return usesSvelteKit()
        ? {
              title: 'SvelteKit',
              folder: svelteKitRoutesFolder,
              pageFile: routePageFile.svelte
          }
        : undefined;
};

/** How messages name modules of each framework. */
export const frameworkTitles: Record<
    FrontendFramework,
    { title: string; cli: string }
> = {
    react: { title: 'React', cli: 'df-react' },
    svelte: { title: 'Svelte', cli: 'df-svelte' }
};
