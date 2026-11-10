# df-react generators: operations and output

Prefer JSON requests; [agent operations](../../df-ps-scaffold/references/agent-operations.md#react-operations-df-react) maps all six React operations and fields. Generated files and story templates apply to both modes.

Settings: `project.rootFolder` and `frontend.react.storybookFramework`. The frontend section must be configured by the user before these runs.

Notation: `…/react/` = `<rootFolder>/presentation/react/`. `n` = the entered kebab-case name, `N` = PascalCase. If the run would replace existing files, the last prompt is the confirm `Overwrite them?` (the files are listed above it).

## New page

`…/react/pages/n-page.tsx`; with Next.js (`frontend.react.framework: next`) also `app/n/page.tsx` (`src/app/…` when that folder exists) rendering `NPage`, unless that route already exists. A nested name nests the route too: `admin/users` → `app/admin/users/page.tsx`.

## New widget

`…/react/widgets/n/`:

- `with separated ui` (default): `n-widget.tsx`, `types.ts`, `ui/n-widget-ui.tsx`, `hooks/use-n-ui-model.ts`; with `storybookFramework`: `ui/n-widget-ui.stories.tsx` (CSF3: `meta` with `title: 'Widgets/N'`, `component: NWidgetUI`, story `Default`)
- `headless`: `n-widget.tsx`, `types.ts` (props include `UI`), `hooks/use-n-ui-model.ts`
- `monolithic`: `n-widget.tsx`
- every type: `index.ts` (`export * from './n-widget'`)

Page and widget names may have folders before them: `text:admin/panel/users` → `…/pages/admin/panel/admin-panel-users-page.tsx` and `…/widgets/admin/panel/users/`. The widget folder uses only the last segment; file names use the whole path (`admin-panel-users-page.tsx`, `admin-panel-users-widget.tsx`, `ui/admin-panel-users-widget-ui.tsx`, `hooks/use-admin-panel-users-ui-model.ts`), and so do code names (`AdminPanelUsersPage`, `AdminPanelUsersWidget`, `useAdminPanelUsersUIModel`); the story title follows the folders (`Widgets/Admin/Panel/Users`). `.` and `..` are rejected.

## Move or rename page / widget

Move or rename a page or a widget only with df-react, never by hand (JSON `move-widget`, `move-page`). It moves the widget folder (or the page with its `<name>-page.*` files), renames files and `<Name>Widget…` / `use<Name>UIModel` / `<Name>Page…` to the new name, updates a generated story title and every import of the module (relative and `tsconfig` aliases; importers of barrels re-exporting it get the renamed classes), and fixes relative imports inside it. Before `Apply?` it prints the files to move and to update; check them. An existing target or a move into itself is rejected.

## Move, rename or delete a UI-kit component / shared hook

The same runs exist for them (`move-ui-kit-component`, `move-shared-hook`, `delete-ui-kit-component`, `delete-shared-hook`). Names have no folders; a hook's name is entered without `use-`. A move renames the folder or `use-<name>.*` files, `<Name>` / `<Name>Props` / `use<Name>`, the `UI-kit/<Name>` story title and every import; a delete is refused while other files import the module.

## Delete page / widget

Delete a page or a widget only with df-react (JSON `delete-widget`, `delete-page`; with Next.js and the page's own route, whether to delete the route is asked too). It deletes the widget folder (or the page with its `<name>-page.*` files) and, if confirmed, the route folder's own files. It refuses while other files import the module and lists them; nothing changes then.

## New UI-kit component

`…/react/ui-kit/n/`:

- `n.tsx` (`type NProps`, `const N: FC<NProps>`)
- `index.ts` (`export * from './n'`)
- with `storybookFramework`: `n.stories.tsx` (CSF3: `meta` with `title: 'UI-kit/N'`, story `Default`)

No Storybook prompt: UI-kit and widget UI stories follow the config.

## New shared hook

`…/react/hooks/use-n.ts` (`const useN = () => …`). A leading `use-` in the name is dropped, so `use-debounce` gives the same file.

## Story templates

Only for recreating a **missing** story (`df-ps-scaffold`, rule 2, exception 4).

UI-kit, at `…/react/ui-kit/n/n.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "<storybookFramework>";
import { N } from "./n";

const meta = {
  title: "UI-kit/N",
  component: N,
} satisfies Meta<typeof N>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
```

Widget UI (`with separated ui` only), at `…/react/widgets/n/ui/n-widget-ui.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "<storybookFramework>";
import { NWidgetUI } from "./n-widget-ui";

const meta = {
  title: "Widgets/N",
  component: NWidgetUI,
} satisfies Meta<typeof NWidgetUI>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
```
