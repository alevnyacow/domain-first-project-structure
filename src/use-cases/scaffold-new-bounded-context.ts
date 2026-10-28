import { input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { Folder } from '../file-system';
import { ProjectRoot } from '../project-root';

export const scaffoldNewBoundedContextUseCase = async () => {
    const name = await input({
        message: 'Name:',
        validate: (x) => !!x.length
    });

    const { path } = new ProjectRoot();

    const rootFolder = new Folder(path);
    const folder = rootFolder.subitem([
        ConfigFile.Instance.data.rootFolder,
        'bounded-contexts',
        name
    ]);

    folder.createIfNotExisted();
};
