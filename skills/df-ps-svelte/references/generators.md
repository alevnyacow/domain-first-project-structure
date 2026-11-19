# df-svelte generators: operations and output

Prefer JSON requests; operations and fields are those of [df-react](../../df-ps-scaffold/references/agent-operations.md#react-operations-df-react), with `SvelteKit` routes in place of Next.js ones. Settings: `project.rootFolder` and `frontend.svelte.storybookFramework`. The frontend section must be configured by the user before these runs.

Notation: `…/svelte/` = `<rootFolder>/presentation/svelte/`. `n` = the entered kebab-case name, `N` = PascalCase. Components are Svelte 5 with runes; each one exports its props type from `<script lang="ts" module>`.

## New page

`…/svelte/pages/n-page.svelte` (`NPageProps`); with SvelteKit (`frontend.svelte.framework: sveltekit`) also `src/routes/n/+page.svelte` importing `NPage` from the page file and rendering `<NPage />`, unless that route already exists. A nested name nests the route too: `admin/users` → `src/routes/admin/users/+page.svelte`.

## New widget

`…/svelte/widgets/n/`:

- `with separated ui` (default): `n-widget.svelte`, `types.ts`, `ui/n-widget-ui.svelte`, `model/create-n-ui-model.svelte.ts` (`createNUIModel`, returning getters); with `storybookFramework`: `ui/n-widget-ui.stories.ts` (CSF3: `title: 'Widgets/N'`, `component: NWidgetUI`, story `Default`)
- `headless`: `n-widget.svelte` (renders `<UI {...uiModel} />`), `types.ts` (props include `UI: Component<NWidgetUIProps>`), `model/create-n-ui-model.svelte.ts`, given the rest of `let { UI, ...widgetProps } = $props()`
- `monolithic`: `n-widget.svelte` (`NWidgetProps`)
- every type: `index.ts` (`export { default as NWidget } from './n-widget.svelte'` and the props type)

Nested names work as in df-react: `admin/panel/users` → `…/widgets/admin/panel/users/admin-panel-users-widget.svelte`, story title `Widgets/Admin/Panel/Users`.

## New UI-kit component

`…/svelte/ui-kit/n/`: `n.svelte` (`NProps`), `index.ts` (`export { default as N } from './n.svelte'` and `NProps`), with `storybookFramework`: `n.stories.ts` (`title: 'UI-kit/N'`).

## New shared model

Operation `shared-model`: `…/svelte/shared/model/create-n.svelte.ts` (`const createN = () => …`), so it may use runes. A leading `create-` in the name is dropped. Svelte has no hooks: in SvelteKit they are `hooks.server.ts`/`hooks.client.ts`.

## Move, rename, delete

As in df-react: files, `<Name>Page` / `<Name>Widget…` / `create<Name>UIModel` / `<Name>` / `create<Name>`, story titles and every import (with or without the `.svelte` extension, relative or through `tsconfig` aliases) follow a move; a delete is refused while other files import the module. With SvelteKit, the page's own route folder files move or are deleted too when confirmed.

## Story templates

Only for recreating a **missing** story (`df-ps-scaffold`, rule 2, exception 4).

UI-kit, at `…/svelte/ui-kit/n/n.stories.ts`; widget UI (`with separated ui` only), at `…/svelte/widgets/n/ui/n-widget-ui.stories.ts` with `NWidgetUI`, `./n-widget-ui.svelte` and `Widgets/N`:

```ts
import type { Meta, StoryObj } from "<storybookFramework>";
import N from "./n.svelte";

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
