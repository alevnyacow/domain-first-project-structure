import { input } from '@inquirer/prompts';
import type { Folder } from '../file-system';
import { NestedName } from '../nested-name';

/**
 * Content of `<file>-page.tsx`: imports go before React's, `body` is
 * what the page returns.
 */
export const reactPageContent = (
    ClassName: string,
    { imports = [], body = '<></>' }: { imports?: string[]; body?: string } = {}
) =>
    `
${[...imports, "import { type FC } from 'react'"].join('\n')}

export type ${ClassName}PageProps = {}

export const ${ClassName}Page: FC<${ClassName}PageProps> = (props) => {
    return ${body}
}
`.trim();

export const scaffoldReactPage = async (presentationReactFolder: Folder) => {
    const name = await input({
        message: 'Provide name (folders split by "/"):',
        validate: NestedName.validate
    });
    const { folders, ClassName, fileName } = new NestedName(name);

    presentationReactFolder
        .subitem(['pages', ...folders])
        .createFile(`${fileName}-page.tsx`, reactPageContent(ClassName));
};
