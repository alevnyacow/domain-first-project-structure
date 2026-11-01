import path from 'node:path';
import { ConfigFile } from './config-file';
import { Folder } from './file-system';

/** Next.js is used only when the config selects it explicitly. */
export const usesNext = () =>
    ConfigFile.exists &&
    ConfigFile.Instance.data.frontend?.react?.framework === 'next';

/**
 * The App Router folder: `app` or `src/app`, whichever exists, `app` by
 * default.
 */
export const nextAppFolder = (root: string) =>
    ['app', 'src/app'].find(
        (folder) => new Folder(path.join(root, folder)).exists
    ) ?? 'app';
