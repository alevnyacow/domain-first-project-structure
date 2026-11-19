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
    scaffoldSvelteSharedModel,
    scaffoldSvelteUIKitComponent,
    scaffoldSvelteWidget
} from './use-cases';

/**
 * The operation name of reusable logic: React shared hooks, Svelte shared
 * models (`createN` in `shared/model`).
 */
export const sharedLogicOperation: Record<FrontendFramework, string> = {
    react: 'shared-hook',
    svelte: 'shared-model'
};

/**
 * Operations on frontend modules by their agent operation name; menus and
 * `--request` run the same ones.
 */
export const frontendOperations = (
    folder: Folder,
    framework: FrontendFramework
): Record<string, () => Promise<unknown>> => {
    const shared = sharedLogicOperation[framework];
    const scaffold =
        framework === 'svelte'
            ? {
                  page: scaffoldSveltePage,
                  widget: scaffoldSvelteWidget,
                  'ui-kit-component': scaffoldSvelteUIKitComponent,
                  shared: scaffoldSvelteSharedModel
              }
            : {
                  page: scaffoldReactPage,
                  widget: scaffoldReactWidget,
                  'ui-kit-component': scaffoldReactUIKitComponent,
                  shared: scaffoldReactSharedHook
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
        [shared]: () => scaffold.shared(folder),
        'move-page': move('page'),
        'move-widget': move('widget'),
        'move-ui-kit-component': move('ui-kit'),
        [`move-${shared}`]: move('hook'),
        'delete-page': remove('page'),
        'delete-widget': remove('widget'),
        'delete-ui-kit-component': remove('ui-kit'),
        [`delete-${shared}`]: remove('hook')
    };
};

/** Menu items of df-react and df-svelte → agent operations. */
export const frontendMenu = (
    framework: FrontendFramework
): [string, string][] => {
    const shared = sharedLogicOperation[framework];
    const title = framework === 'svelte' ? 'shared model' : 'shared hook';
    return [
        ['New widget', 'widget'],
        ['New page', 'page'],
        ['New UI-kit component', 'ui-kit-component'],
        [`New ${title}`, shared],
        ['Move or rename widget', 'move-widget'],
        ['Move or rename page', 'move-page'],
        ['Move or rename UI-kit component', 'move-ui-kit-component'],
        [`Move or rename ${title}`, `move-${shared}`],
        ['Delete widget', 'delete-widget'],
        ['Delete page', 'delete-page'],
        ['Delete UI-kit component', 'delete-ui-kit-component'],
        [`Delete ${title}`, `delete-${shared}`]
    ];
};
