import { input, select } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import { type File, Folder } from '../file-system';
import { ProjectRoot } from '../project-root';
import { UnknownFormatNaming } from '../unknown-format-naming';

/**
 * Inside a context its name is implied, so names get no suffix. In the
 * Shared Kernel they end with `SharedKernel`, and errors with `SharedKernelError`.
 */
const errorNames = (boundedContextFolder: Folder) => {
    const isShared =
        boundedContextFolder.path ===
        new Folder(new ProjectRoot().path).subitem([
            ConfigFile.Instance.data.rootFolder,
            'shared-kernel'
        ]).path;

    return {
        namespace: (namespaceName: string) =>
            `${namespaceName}${isShared ? 'SharedKernel' : ''}Errors`,
        error: (errorName: string) =>
            `${errorName}${isShared ? 'SharedKernelError' : ''}`
    };
};

const namespacePattern = /export\s+const\s+(\w+)\s*=\s*errorNamespace\b/;

/**
 * The namespace the file exports, so files of older naming keep working.
 */
const exportedNamespace = (file: File, fallback: string) =>
    namespacePattern.exec(file.data)?.[1] ?? fallback;

/**
 * Contexts and the Shared Kernel start without errors: the root namespace
 * is added to `index.ts` with the first error outside a namespace, above
 * the re-exports of namespaces created before it.
 */
const rootNamespace = (indexFile: File, namespace: string, code: string) => {
    const content = indexFile.exists ? indexFile.data.trim() : '';
    const existing = namespacePattern.exec(content)?.[1];
    if (existing) return existing;
    indexFile.update(
        [
            `import { errorNamespace } from '@domain-first/errors'`,
            `export const ${namespace} = errorNamespace('${code}')`,
            content
        ]
            .filter((x) => !!x)
            .join('\n\n')
    );
    return namespace;
};

const errorClass = (className: string, namespace: string, code: string) =>
    `export class ${className} extends ${namespace}.define('${code}') {}`;

export const scaffoldNewErrorUseCase = async (boundedContextFolder: Folder) => {
    const currentErrorFolder = boundedContextFolder.subitem([
        'domain',
        'errors'
    ]);
    const names = errorNames(boundedContextFolder);
    const contextNaming = new UnknownFormatNaming(boundedContextFolder.name);

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
        const indexFile = currentErrorFolder.file('index.ts');
        indexFile.addLineIfMissing(
            errorClass(
                names.error(naming.ClassName),
                rootNamespace(
                    indexFile,
                    `${contextNaming.ClassName}Errors`,
                    boundedContextFolder.name
                ),
                naming.fileName
            ),
            '\n\n'
        );
        return;
    }

    if (selectedVariant === 'New namespace') {
        const namespaceName = await input({
            message: 'Namespace name:'
        });
        const { ClassName, fileName } = new UnknownFormatNaming(namespaceName);

        /**
         * An existing namespace file holds its errors: never overwrite it.
         */
        if (!currentErrorFolder.file(`${fileName}.ts`).exists) {
            currentErrorFolder.createFile(
                `${fileName}.ts`,
                `
import { errorNamespace } from '@domain-first/errors'

export const ${names.namespace(ClassName)} = errorNamespace('${boundedContextFolder.name}').subnamespace('${fileName}')
`.trim()
            );
        }

        currentErrorFolder
            .file('index.ts')
            .addLineIfMissing(`export * from './${fileName}'`, '\n\n');

        return;
    }

    const namespace = selectedVariant.substring(
        'New error in namespace '.length
    );

    const namespaceNaming = new UnknownFormatNaming(namespace);

    const errorName = await input({
        message: 'Error name:'
    });

    const { ClassName, fileName } = new UnknownFormatNaming(errorName);
    const namespaceFile = currentErrorFolder.file(`${namespace}.ts`);

    /**
     * The namespace goes first: `PaymentDeclined`, not `DeclinedPayment`.
     */
    namespaceFile.addLineIfMissing(
        errorClass(
            names.error(`${namespaceNaming.ClassName}${ClassName}`),
            exportedNamespace(
                namespaceFile,
                names.namespace(namespaceNaming.ClassName)
            ),
            fileName
        ),
        '\n\n'
    );
};
