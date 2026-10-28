# df-react generators: prompts and output

Notation: `…/react/` = `<rootFolder>/presentation/react/`. `n` = the entered kebab-case name, `N` = PascalCase. Every step list goes after `--bin df-react`; the first prompt is the module menu. If the run would replace existing files, the last prompt is the confirm `Overwrite them?` (the files are listed above it).

## New page

`"pick:New page" text:checkout` → `…/react/pages/n-page.tsx`

## New widget

`"pick:New widget" text:cart "pick:with separated ui"` → `…/react/widgets/n/`:

- `with separated ui` (default): `n-widget.tsx`, `types.ts`, `ui/n-widget-ui.tsx`, `hooks/use-n-ui-model.ts`; with `storybookFramework`: `ui/n-widget-ui.stories.tsx` (CSF3: `meta` with `title: 'Widgets/N'`, `component: NWidgetUI`, story `Default`)
- `headless`: `n-widget.tsx`, `types.ts` (props include `UI`), `hooks/use-n-ui-model.ts`
- `monolithic`: `n-widget.tsx`
- every type: `index.ts` (`export * from './n-widget'`)

Page and widget names may have folders before them: `text:admin/panel/users` → `…/pages/admin/panel/admin-panel-users-page.tsx` and `…/widgets/admin/panel/users/`. The widget folder uses only the last segment; file names use the whole path (`admin-panel-users-page.tsx`, `admin-panel-users-widget.tsx`, `ui/admin-panel-users-widget-ui.tsx`, `hooks/use-admin-panel-users-ui-model.ts`), and so do code names (`AdminPanelUsersPage`, `AdminPanelUsersWidget`, `useAdminPanelUsersUIModel`); the story title follows the folders (`Widgets/Admin/Panel/Users`). `.` and `..` are rejected.

## Move or rename page / widget

Move or rename a page or a widget only with df-react, never by hand: `"pick:Move or rename widget" "pick:admin/users" text:team/users "yes"` (`Move or rename page` for pages; the list shows nested names, the default new name is the current one). It moves the widget folder (or the page with its `<name>-page.*` files), renames files and `<Name>Widget…` / `use<Name>UIModel` / `<Name>Page…` to the new name, updates a generated story title and every import of the module (relative and `tsconfig` aliases; importers of barrels re-exporting it get the renamed classes), and fixes relative imports inside it. Before `Apply?` it prints the files to move and to update; check them. An existing target or a move into itself is rejected.

## New UI-kit component

`"pick:New UI-kit" text:date-picker` → `…/react/ui-kit/n/`:

- `n.tsx` (`type NProps`, `const N: FC<NProps>`)
- `index.ts` (`export * from './n'`)
- with `storybookFramework`: `n.stories.tsx` (CSF3: `meta` with `title: 'UI-kit/N'`, story `Default`)

No Storybook prompt: UI-kit and widget UI stories follow the config.

## New shared hook

`"pick:New shared hook" text:debounce` → `…/react/hooks/use-n.ts` (`const useN = () => …`). A leading `use-` in the name is dropped, so `use-debounce` gives the same file.

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
