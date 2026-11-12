import { kebabName } from '../backend-module-move';
import { crossContextImplementation } from '../context-dependencies';
import type { Folder } from '../file-system';
import {
    implementationKinds,
    savedImplementations
} from '../implementation-choices';
import { input, report, select } from '../interaction';
import { NestedName } from '../nested-name';
import { systemImplementationChoices } from '../system-implementations';
import { UnknownFormatNaming } from '../unknown-format-naming';

/**
 * Every implementation type the project knows, of any kind: a helper is
 * shared between the repositories, commands, queries and ports of a type.
 */
export const helperImplementationTypes = () =>
    [
        ...new Set(
            implementationKinds.flatMap((kind) => [
                ...savedImplementations(kind, 'primary'),
                ...savedImplementations(kind, 'test'),
                ...systemImplementationChoices(kind).map(({ value }) => value)
            ])
        )
    ].filter((label) => label !== crossContextImplementation);

const validateName = (value: string) => {
    const valid = NestedName.validate(value);
    if (valid !== true) return valid;
    const { folders, folderName } = new NestedName(value);
    return [...folders, folderName].every((part) => kebabName.test(part))
        ? true
        : 'Use lowercase kebab-case split by "/", e.g. mappers/social-network-type';
};

export const scaffoldNewInfrastructureHelper = async (ownerFolder: Folder) => {
    const types = helperImplementationTypes();
    if (!types.length) {
        report(
            'No implementation types yet: a helper belongs to one, so add an implementation first.'
        );
        return;
    }
    const name = new NestedName(
        await input({
            key: 'name',
            message: 'Name (folders split by "/"): ',
            validate: validateName
        })
    );
    const label = await select<string>({
        key: 'implementationType',
        message: 'Implementation:',
        choices: types.map((value) => ({ name: value, value }))
    });

    const fileName = name.folderName.startsWith(`${label}-`)
        ? name.folderName
        : `${label}-${name.folderName}`;
    const naming = new UnknownFormatNaming(fileName);
    const folder = ownerFolder.subitem([
        'infrastructure',
        'helpers',
        label,
        ...name.folders
    ]);

    folder.createFile(
        `${fileName}.ts`,
        `export const ${naming.variableName} = () => {}`
    );
};
