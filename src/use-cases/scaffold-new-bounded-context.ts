import { ConfigFile } from '../config-file';
import { Folder } from '../file-system';
import { input } from '../interaction';
import { ProjectRoot } from '../project-root';

export const scaffoldNewBoundedContextUseCase = async () => {
    const name = await input({
        key: 'name',
        message: 'Name:',
        validate: (x) => !!x.length
    });

    const { path } = new ProjectRoot();

    const rootFolder = new Folder(path);
    const folder = rootFolder.subitem([
        ConfigFile.Instance.data.project.rootFolder,
        'bounded-contexts',
        name
    ]);

    folder.createIfNotExisted();
};
