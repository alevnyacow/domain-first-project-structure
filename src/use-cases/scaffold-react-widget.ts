import { input, select } from '@inquirer/prompts';
import { ConfigFile } from '../config-file';
import type { Folder } from '../file-system';
import { UnknownFormatNaming } from '../unknown-format-naming';

export const scaffoldReactWidget = async (presentationReactFolder: Folder) => {
    const widgetName = await input({ message: 'Name: ' });

    const widgetType = await select({
        choices: ['monolithic', 'with separated ui', 'headless'],
        message: 'Type: '
    });

    const { ClassName, fileName } = new UnknownFormatNaming(widgetName);

    const folder = presentationReactFolder.subitem(['widgets', fileName]);
    const widgetFileName = `${fileName}-widget`;
    const uiFileName = `${fileName}-widget-ui`;
    const uiModelFileName = `use-${fileName}-ui-model`;

    folder.createFile('index.ts', `export * from './${widgetFileName}'`);

    switch (widgetType) {
        case 'monolithic': {
            folder.createFile(
                `${widgetFileName}.tsx`,
                `
import { type FC } from 'react'

export type ${ClassName}WidgetProps = {}

export const ${ClassName}Widget: FC<${ClassName}WidgetProps> = (props) => {
    return <></>
}
            `.trim()
            );
            break;
        }
        case 'with separated ui': {
            folder.createFile(
                'types.ts',
                `
export type ${ClassName}WidgetProps = { }

export type ${ClassName}WidgetUIProps = { }
            `.trim()
            );

            folder.createFile(
                `${widgetFileName}.tsx`,
                `
import { type FC } from 'react'
import type { ${ClassName}WidgetProps } from './types'
import { ${ClassName}WidgetUI } from './ui/${uiFileName}'
import { use${ClassName}UIModel } from './hooks/${uiModelFileName}'

export const ${ClassName}Widget: FC<${ClassName}WidgetProps> = (props) => {
    const uiModel = use${ClassName}UIModel(props)
    return <${ClassName}WidgetUI {...uiModel} />
}

export type { ${ClassName}WidgetProps }
            `.trim()
            );

            folder.subitem(['ui']).createFile(
                `${uiFileName}.tsx`,
                `
import { FC } from 'react'
import type { ${ClassName}WidgetUIProps } from '../types'

export const ${ClassName}WidgetUI: FC<${ClassName}WidgetUIProps> = (props) => {
    return <></>
}
            `.trim()
            );

            const { storybookFramework } = ConfigFile.Instance.data;

            if (storybookFramework) {
                folder.subitem(['ui']).createFile(
                    `${uiFileName}.stories.tsx`,
                    `
import type { Meta, StoryObj } from '${storybookFramework}'
import { ${ClassName}WidgetUI } from './${uiFileName}'

const meta = {
    title: 'Widgets/${ClassName}',
    component: ${ClassName}WidgetUI
} satisfies Meta<typeof ${ClassName}WidgetUI>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
    args: {}
}
                    `.trim()
                );
            }

            folder.subitem(['hooks']).createFile(
                `${uiModelFileName}.ts`,
                `
import type { ${ClassName}WidgetProps, ${ClassName}WidgetUIProps } from '../types'

export const use${ClassName}UIModel = (widgetProps: ${ClassName}WidgetProps): ${ClassName}WidgetUIProps => {
    return {}
}
            `.trim()
            );
            break;
        }
        case 'headless': {
            folder.createFile(
                'types.ts',
                `
import { type FC } from 'react'

export type ${ClassName}WidgetUIProps = { }

export type ${ClassName}WidgetProps = {
    UI: FC<${ClassName}WidgetUIProps>
}

            `.trim()
            );

            folder.createFile(
                `${widgetFileName}.tsx`,
                `
import { type FC } from 'react'
import type { ${ClassName}WidgetProps } from './types'
import { use${ClassName}UIModel } from './hooks/${uiModelFileName}'

export const ${ClassName}Widget: FC<${ClassName}WidgetProps> = (props) => {
    const uiModel = use${ClassName}UIModel(props)
    return <props.UI {...uiModel} />
}

export type { ${ClassName}WidgetProps }
            `.trim()
            );

            folder.subitem(['hooks']).createFile(
                `${uiModelFileName}.ts`,
                `
import type { ${ClassName}WidgetProps, ${ClassName}WidgetUIProps } from '../types'

export const use${ClassName}UIModel = (widgetProps: Omit<${ClassName}WidgetProps, 'UI'>): ${ClassName}WidgetUIProps => {
    return {}
}
            `.trim()
            );

            break;
        }
    }
};
