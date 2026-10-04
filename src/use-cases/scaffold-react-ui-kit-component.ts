import { input } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldReactUIKitComponent = async (
    presentationReactFolder: Folder
) => {
    const name = await input({ message: 'Name: ' });
    const { ClassName, fileName } = new UnknownFormatNaming(name);

    const componentFolder = presentationReactFolder.subitem([
        'ui-kit',
        fileName
    ]);

    componentFolder.createFile('index.ts', `export * from './${fileName}'`);

    componentFolder.createFile(
        `${fileName}.tsx`,
        `
import { type FC } from 'react'

export type ${ClassName}Props = {}

export const ${ClassName}: FC<${ClassName}Props> = (props) => {
    return <></>
}
        `.trim()
    );

    const { storybookFramework } = ConfigFile.Instance.data;

    if (storybookFramework) {
        componentFolder.createFile(
            `${fileName}.stories.tsx`,
            `
import type { Meta, StoryObj } from '${storybookFramework}'
import { ${ClassName} } from './${fileName}'

const meta = {
    title: 'UI-kit/${ClassName}',
    component: ${ClassName}
} satisfies Meta<typeof ${ClassName}>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
    args: {}
}
            `.trim()
        );
    }
};
