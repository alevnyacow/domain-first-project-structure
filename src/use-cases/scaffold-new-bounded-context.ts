import { input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { Folder } from '../file-system';
import { ProjectRoot } from '../project-root';
import { UnknownFormatNaming } from '../unknown-format-naming';

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

    if (
        ConfigFile.Instance.data.domainFirstPackages.includes(
            '@domain-first/errors'
        )
    ) {
        folder.subitem(['domain', 'errors']).createFile(
            'index.ts',
            `
import { errorNamespace } from '@domain-first/errors'

export const ${new UnknownFormatNaming(name).ClassName}Errors = errorNamespace('${name}')
            `.trim()
        );
    }

    folder.createIfNotExisted();
};
