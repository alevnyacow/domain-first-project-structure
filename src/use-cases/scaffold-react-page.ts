import { input } from '@inquirer/prompts';
import type { Folder } from '../file-system';
import { NestedName } from '../nested-name';

export const scaffoldReactPage = async (presentationReactFolder: Folder) => {
    const name = await input({
        message: 'Provide name (folders split by "/"):',
        validate: NestedName.validate
    });
    const { folders, ClassName, fileName } = new NestedName(name);

    presentationReactFolder.subitem(['pages', ...folders]).createFile(
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
