import { input, select } from '@inquirer/prompts';
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

    switch (widgetType) {
        case 'monolithic': {
            folder.createFile(
                'index.tsx',
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
                'index.tsx',
                `
import { type FC } from 'react'
import type { ${ClassName}WidgetProps } from './types'
import { ${ClassName}WidgetUI } from './ui'
import { useUIModel } from './hooks/use-ui-model'

export const ${ClassName}Widget: FC<${ClassName}WidgetProps> = (props) => {
    const uiModel = useUIModel(props)
    return <${ClassName}WidgetUI {...uiModel} />
}

export type { ${ClassName}WidgetProps }
            `.trim()
            );

            folder.subitem(['ui']).createFile(
                'index.tsx',
                `
import { FC } from 'react'
import type { ${ClassName}WidgetUIProps } from '../types'

export const ${ClassName}WidgetUI: FC<${ClassName}WidgetUIProps> = (props) => {
    return <></>
}
            `.trim()
            );
            folder.subitem(['hooks']).createFile(
                'use-ui-model.ts',
                `
import type { ${ClassName}WidgetProps, ${ClassName}WidgetUIProps } from '../types'

export const useUIModel = (widgetProps: ${ClassName}WidgetProps): ${ClassName}WidgetUIProps => {
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
                'index.tsx',
                `
import { type FC } from 'react'
import type { ${ClassName}WidgetProps } from './types'
import { useUIModel } from './hooks/use-ui-model'

export const ${ClassName}Widget: FC<${ClassName}WidgetProps> = (props) => {
    const uiModel = useUIModel(props)
    return <props.UI {...uiModel} />
}

export type { ${ClassName}WidgetProps }
            `.trim()
            );

            folder.subitem(['hooks']).createFile(
                'use-ui-model.ts',
                `
import type { ${ClassName}WidgetProps, ${ClassName}WidgetUIProps } from '../types'

export const useUIModel = (widgetProps: Omit<${ClassName}WidgetProps, 'UI'>): ${ClassName}WidgetUIProps => {
    return {}
}
            `.trim()
            );

            break;
        }
    }
};
