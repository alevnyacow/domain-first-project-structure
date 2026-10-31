import path from 'node:path';
import { ConfigFile } from './config-file';
import { Folder } from './file-system';
import { hasDependency } from './integrations/missing-domain-first-packages';

/**
 * Explicit framework selection takes precedence over installed packages;
 * configs without one fall back to the `next` dependency.
 */
export const usesNext = () => {
    const framework = ConfigFile.exists
        ? ConfigFile.Instance.data.frontend?.react?.framework
        : undefined;
    return framework ? framework === 'next' : hasDependency('next');
};

/**
 * The App Router folder: `app` or `src/app`, whichever exists, `app` by
 * default.
 */
export const nextAppFolder = (root: string) =>
    ['app', 'src/app'].find(
        (folder) => new Folder(path.join(root, folder)).exists
    ) ?? 'app';
