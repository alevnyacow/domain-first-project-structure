import { input, select } from '@inquirer/prompts';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldNewErrorUseCase = async (boundedContextFolder: Folder) => {
    const currentErrorFolder = boundedContextFolder.subitem([
        'domain',
        'errors'
    ]);

    const currentErrorNamespaces = currentErrorFolder.content.fileNames.filter(
        (x) => x !== 'index'
    );

    const variants = [
        'New error without namespace',
        ...currentErrorNamespaces.map((x) => `New error in namespace ${x}`),
        'New namespace' as const
    ];

    const selectedVariant = await select({
        choices: variants,
        message: 'Action:'
    });

    if (selectedVariant === 'New error without namespace') {
        const errorName = await input({ message: 'Error name:' });
        const naming = new UnknownFormatNaming(errorName);
        currentErrorFolder
            .file('index.ts')
            .addLine(
                `export const ${naming.ClassName}Error = ${new UnknownFormatNaming(boundedContextFolder.name).ClassName}Errors.define('${naming.fileName}')`,
                '\n\n'
            );
        return;
    }

    if (selectedVariant === 'New namespace') {
        const namespaceName = await input({
            message: 'Namespace name:'
        });
        const { ClassName, fileName } = new UnknownFormatNaming(namespaceName);

        currentErrorFolder.createFile(
            `${fileName}.ts`,
            `
import { errorNamespace } from '@domain-first/errors'

const ${ClassName}Errors = errorNamespace('${boundedContextFolder.name}').subnamespace('${fileName}')
`
        );

        currentErrorFolder
            .file('index.ts')
            .addLine(`export * from './${fileName}'`);

        return;
    }

    const namespace = selectedVariant.substring(
        'New error in namespace '.length
    );

    const errorName = await input({
        message: 'Error name:'
    });

    const { ClassName, fileName } = new UnknownFormatNaming(errorName);

    currentErrorFolder
        .file(`${namespace}.ts`)
        .addLine(
            `export const ${ClassName}Error = ${new UnknownFormatNaming(namespace).ClassName}Errors.define('${fileName}')`,
            '\n\n'
        );
};
