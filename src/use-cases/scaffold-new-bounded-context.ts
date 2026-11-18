import path from 'node:path';
import {
    boundedContextsFolderName,
    validateBoundedContextName
} from '../bounded-contexts';
import { ConfigFile } from '../config-file';
import { Folder } from '../file-system';
import { input } from '../interaction';
import { ProjectRoot } from '../project-root';

/**
 * Folders before the name group contexts, like the folders of React
 * pages and widgets: `sales/orders` → `bounded-contexts/sales/orders`.
 */
export const scaffoldNewBoundedContextUseCase = async () => {
    const rootFolder = new Folder(new ProjectRoot().path).subitem([
        ConfigFile.Instance.data.project.rootFolder
    ]);
    const contextsFolder = path.join(
        rootFolder.path,
        boundedContextsFolderName
    );

    const name = await input({
        key: 'name',
        message: 'Name (folders split by "/"):',
        validate: (value) => validateBoundedContextName(contextsFolder, value)
    });

    rootFolder
        .subitem([
            boundedContextsFolderName,
            ...name
                .split(/[\\/]/)
                .map((segment) => segment.trim())
                .filter((segment) => !!segment)
        ])
        .createIfNotExisted();
};
