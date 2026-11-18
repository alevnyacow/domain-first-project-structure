import path from 'node:path';
import { nextAppFolder } from './next-app';
import { svelteKitRoutesFolder } from './sveltekit-app';

/** Framework adapters of `@domain-first/handlers-rest`. */
export type RestAdapter = 'next' | 'svelte';

export const restAdapters: Record<
    RestAdapter,
    {
        package: string;
        /** The adapter passed to `createEndpoint`. */
        adapter: string;
        /** Combines endpoints into the catch-all route handler. */
        endpoints: string;
        /** The agent request key of the question. */
        key: string;
        /** The catch-all route, relative to the project root. */
        routePath: (root: string) => string;
    }
> = {
    next: {
        package: '@domain-first/handlers-next',
        adapter: 'nextAdapter',
        endpoints: 'nextEndpoints',
        key: 'nextAdapter',
        routePath: (root) =>
            path.posix.join(nextAppFolder(root), 'api/[...path]/route.ts')
    },
    svelte: {
        package: '@domain-first/handlers-svelte',
        adapter: 'svelteAdapter',
        endpoints: 'svelteEndpoints',
        key: 'svelteAdapter',
        routePath: (root) =>
            path.posix.join(
                svelteKitRoutesFolder(root),
                'api/[...path]/+server.ts'
            )
    }
};
