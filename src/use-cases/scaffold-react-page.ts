import { input } from '@inquirer/prompts';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldReactPage = async (presentationReactFolder: Folder) => {
    const name = await input({ message: 'Provide name:' });
    const { ClassName, fileName } = new UnknownFormatNaming(name);

    presentationReactFolder.subitem(['pages']).createFile(
        `${fileName}-page.tsx`,
        `
import { type FC } from 'react'

export type ${ClassName}PageProps = {}

export const ${ClassName}Page: FC<${ClassName}PageProps> = (props) => {
    return <></>
}
        `.trim()
    );
};
