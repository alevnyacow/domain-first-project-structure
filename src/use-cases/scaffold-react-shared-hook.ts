import type { Folder } from '../file-system';
import { input } from '../interaction';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldReactSharedHook = async (
    presentationReactFolder: Folder
) => {
    const name = await input({
        key: 'name',
        message: 'Name without "use" (e.g. debounce): '
    });
    const { ClassName, fileName } = new UnknownFormatNaming(
        name.trim().replace(/^use-/, '')
    );

    presentationReactFolder.subitem(['hooks']).createFile(
        `use-${fileName}.ts`,
        `
export const use${ClassName} = () => {
    return {}
}
        `.trim()
    );
};
