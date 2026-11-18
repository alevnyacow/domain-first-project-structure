import type { Folder } from './file-system';
import type { FrontendFramework } from './react-module-move';
import {
    deleteReactModuleUseCase,
    moveReactModuleUseCase,
    scaffoldReactPage,
    scaffoldReactSharedHook,
    scaffoldReactUIKitComponent,
    scaffoldReactWidget,
    scaffoldSveltePage,
    scaffoldSvelteSharedHook,
    scaffoldSvelteUIKitComponent,
    scaffoldSvelteWidget
} from './use-cases';

/**
 * Operations on frontend modules by their agent operation name; menus and
 * `--request` run the same ones.
 */
export const frontendOperations = (
    folder: Folder,
    framework: FrontendFramework
): Record<string, () => Promise<unknown>> => {
    const scaffold =
        framework === 'svelte'
            ? {
                  page: scaffoldSveltePage,
                  widget: scaffoldSvelteWidget,
                  'ui-kit-component': scaffoldSvelteUIKitComponent,
                  'shared-hook': scaffoldSvelteSharedHook
              }
            : {
                  page: scaffoldReactPage,
                  widget: scaffoldReactWidget,
                  'ui-kit-component': scaffoldReactUIKitComponent,
                  'shared-hook': scaffoldReactSharedHook
              };
    const move = (kind: Parameters<typeof moveReactModuleUseCase>[1]) => () =>
        moveReactModuleUseCase(folder, kind, framework);
    const remove =
        (kind: Parameters<typeof deleteReactModuleUseCase>[1]) => () =>
            deleteReactModuleUseCase(folder, kind, framework);
    return {
        page: () => scaffold.page(folder),
        widget: () => scaffold.widget(folder),
        'ui-kit-component': () => scaffold['ui-kit-component'](folder),
        'shared-hook': () => scaffold['shared-hook'](folder),
        'move-page': move('page'),
        'move-widget': move('widget'),
        'move-ui-kit-component': move('ui-kit'),
        'move-shared-hook': move('hook'),
        'delete-page': remove('page'),
        'delete-widget': remove('widget'),
        'delete-ui-kit-component': remove('ui-kit'),
        'delete-shared-hook': remove('hook')
    };
};

/** Menu items of df-react and df-svelte → agent operations. */
export const frontendMenu: [string, string][] = [
    ['New widget', 'widget'],
    ['New page', 'page'],
    ['New UI-kit component', 'ui-kit-component'],
    ['New shared hook', 'shared-hook'],
    ['Move or rename widget', 'move-widget'],
    ['Move or rename page', 'move-page'],
    ['Move or rename UI-kit component', 'move-ui-kit-component'],
    ['Move or rename shared hook', 'move-shared-hook'],
    ['Delete widget', 'delete-widget'],
    ['Delete page', 'delete-page'],
    ['Delete UI-kit component', 'delete-ui-kit-component'],
    ['Delete shared hook', 'delete-shared-hook']
];
