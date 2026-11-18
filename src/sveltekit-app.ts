import path from 'node:path';
import { ConfigFile } from './config-file';
import { Folder } from './file-system';

/** SvelteKit is used only when the config selects it explicitly. */
export const usesSvelteKit = () =>
    ConfigFile.exists &&
    ConfigFile.Instance.data.frontend?.svelte?.framework === 'sveltekit';

/**
 * The routes folder: `src/routes`, SvelteKit's default, or `routes` when
 * only that one exists.
 */
export const svelteKitRoutesFolder = (root: string) =>
    ['src/routes', 'routes'].find(
        (folder) => new Folder(path.join(root, folder)).exists
    ) ?? 'src/routes';
