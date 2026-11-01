---
name: df-ps-react
description: Build the React part of a Domain-First project with the `df-react` CLI (@domain-first/project-structure) — choose between pages, widgets (separated UI, headless, monolithic), UI-kit components and shared hooks, generate them with Storybook stories, move or rename pages and widgets, and implement them against the backend without importing bounded contexts. Use when the project has domain-first.project-structure.config.json with frontend.react configured and the user asks for screens, UI blocks, components, hooks or stories, or to move, rename or regroup a page or widget.
---

# React modules with df-react

React modules live in `<rootFolder>/presentation/react/` (`…/react/` below) and come only from `df-react`. The mandatory rules of `df-ps-scaffold` apply here too: an approved work plan before any new file (rule 1), new files only through the CLI or its listed exceptions (rule 2).

## Workflow

1. Read `domain-first.project-structure.config.json`: source root is `project.rootFolder`; React is enabled by `frontend.react`; `frontend.react.framework` is `react` or `next`, and both use `df-react`. Stories use `frontend.react.storybookFramework` (initialization uses `@storybook/react-vite` for both React and Next.js via the shared Storybook integration). A config of an earlier major version (`CONFIG_OUTDATED`): ask the user to run `npx df-upgrade`; never run it yourself. Without the config, tell the user to run `npx df-init`; without React configured, tell them to run `npx df-init --section frontend`. Initialization and configuration belong to the human: do not run `df-init` or edit these settings yourself.
2. A feature that also needs backend work → plan it with `df-ps-plan-feature`; React runs come last in the plan.
3. Choose a module for each piece of UI ("Choosing the module").
4. Show the work plan in the `df-ps-scaffold` rule 1 format and **stop until it's approved**. CLI paths are `df-react → New widget` etc.; list every answer and the files from `references/generators.md`.
5. Run the generators with `df-react --request` JSON in plan order (shared hooks → UI-kit → widgets → pages); check each output.
6. Implement ("Implementing"), after the backend and the regenerated API client.
7. Run `npx df-lint` and the project's tsc/lint/tests. Report against the plan.

## Choosing the module

| Piece | Module |
| --- | --- |
| A route / whole screen | **Page** |
| A block with business meaning or backend data (`cart`, `order-summary`) | **Widget** |
| A generic element with no business meaning, driven only by props (`button`, `date-picker`, `modal`) | **UI-kit component** |
| A business element that several widgets repeat whole, with the same meaning (`product-card`) | **UI-kit component** (domain) |
| Generic app-wide logic without markup and business meaning (`debounce`, `media-query`, `local-storage`) | **Shared hook** |

A UI-kit component or shared hook that starts needing data (API client, loading, backend state) becomes a widget that uses it. A widget's own state goes in its `hooks/`, not in a shared hook.

A business element goes to UI-kit only when several widgets contain the same element, repeated whole and with the same meaning (a product card shown in a catalog, a cart and recommendations). It stays presentational: business data comes in through props, actions go out through callbacks; no API client, no data loading, no imports from widgets, pages or bounded contexts. Its props describe what it shows (`title`, `price`), not domain types. One widget needing it, or several widgets sharing only a piece of markup, is not a reason: keep it in the widget, or extract the generic piece as a generic UI-kit component.

**Widgets never import each other.** Not a widget, not its `ui/`, `hooks/` or `types.ts`. What two widgets share goes to UI-kit (an element, by the rules above) or a shared hook (logic without markup); combining widgets is the page's job.

**Widget type.** Default **`with separated ui`**. Use `headless` only when consumers must supply different visuals for the same behavior, or the user asks. Use `monolithic` only on explicit request. "It's small" and "other widgets use another type" are not reasons. State any deviation in the plan.

**Folders.** Nest a page or widget name in folders (`admin/users`) when it belongs to an area of the UI with several pages or widgets: a route group (`/admin/*`) or one section of a screen. Pages follow the route path; a widget goes under the area it serves. Otherwise keep the name flat (`order-summary`); one page or widget is no reason to start a folder. The whole path becomes the code name, so it must read as the module's name: `admin/users/list` (`AdminUsersListWidget`), not `admin/lists/user` (`AdminListsUserWidget`). Not for UI-kit components or shared hooks: they are generic and have no area. When a second page or widget joins an area, move the existing flat one into its folder with `Move or rename page` / `Move or rename widget` (`users` → `admin/users`).

**Names**: lowercase kebab-case, no suffix (`cart`, not `cart-widget`); page and widget names may have folders before them, each segment kebab-case.

## Running df-react

Prefer `npx df-react --describe` and `npx df-react --request` JSON. The installed schema lists operations (`page`, `widget`, `ui-kit-component`, `shared-hook`, `move-page`, `move-widget`), fields and current React modules. For example:

```bash
npx df-react --request '{"operation":"widget","name":"cart","widgetType":"separated"}'
```

Read `df-ps-scaffold` [agent-mode.md](../df-ps-scaffold/references/agent-mode.md) for previews, overwrite control and JSON result checks; [agent-operations.md](../df-ps-scaffold/references/agent-operations.md#react-operations-df-react) covers all React operations and naming conditions. Initialization remains a human task. For older CLI versions without JSON support, use the interactive driver with `--bin df-react`:

```bash
node <df-ps-scaffold-skill-dir>/scripts/drive.mjs --bin df-react [--cwd <dir>] [--delay <ms>] <step>...
node <df-ps-scaffold-skill-dir>/scripts/drive.mjs --bin df-react "pick:New widget" text:cart "pick:with separated ui"
```

Steps and checks are the same as for `df-scaffold` ("Legacy interactive driver" in `df-ps-scaffold`). Its menu: `New widget`, `New page`, `New UI-kit component`, `New shared hook`, `Move or rename widget`, `Move or rename page`. Prompts and output of each: `references/generators.md`.

If the CLI cannot run, report the failure and give the user the prepared JSON command (a menu path only for a legacy CLI). Never hand-write its output.

### Moving and renaming

Moving or renaming a page or widget is a df-react run (`Move or rename page` / `Move or rename widget`): it creates the files at the new paths, so it needs an approved plan. With Next.js, moving a page can also move its App Router route and so change its URL: state in the plan whether the route moves (`moveRoute`), and ask the user when the request doesn't say. Don't move, rename, or copy their files by hand, and don't rename their `<Name>Page…`, `<Name>Widget…`, or `use<Name>UIModel` by hand: df-react keeps file names, code names, story titles, and imports in sync. List each move as a run: old → new name, the files to move (`→`), and the files whose imports change (`~`).

### Files you may create by hand

Only these (`df-ps-scaffold`, rule 2, exceptions 3–4), for modules generated by df-react:

- Widget hooks and UI parts: `…/react/widgets/<name>/hooks/**`, `ui/**`.
- Support files inside the widget folder or `ui-kit/<name>/`: styles, assets, `*.test.tsx`, `*.stories.tsx`. A missing UI-kit or widget UI story: exactly from "Story templates" in `references/generators.md`.
- Next to a page: `pages/<name>-page.module.css` (for a nested page in its folder: `pages/admin/admin-users-page.module.css`), for the layout of its widgets only. A page stays one file that composes widgets; no page tests. Its own hooks, UI parts, types, or styles for how a block looks mean a widget is missing, so generate it.

## Implementing

- Separated UI widget: state, effects, and derived data in `hooks/use-<name>-ui-model.ts` (props → UI props); `ui/` stays presentational. Headless: the same hook, and the consumer passes `UI`.
- Widgets never import other widgets (their component, `ui/`, `hooks/` or `types.ts`). Shared markup → UI-kit, shared logic → a shared hook, combining widgets → the page.
- UI-kit components: presentational, driven only by props; no API client, no data loading, no imports from widgets, pages, or contexts. Other UI-kit components and shared hooks (`hooks/`) are fine. Business terms only in a domain UI-kit component; its props describe what it shows, not domain types.
- Shared hooks (`…/react/hooks/use-<name>.ts`): generic app-wide logic, driven only by arguments; no business terms, no API client, no imports from UI-kit, widgets, pages, or contexts.
- Stories (`frontend.react.storybookFramework`): fill `args` of `Default` with valid props and add one story per meaningful state (`Disabled`, `Loading`, `WithError`). Keep `meta`, the file name, and the title (`UI-kit/N` or `Widgets/N`). For widget UI, the stories cover the UI states that its UI model produces.

### Talking to the backend

`…/react/` imports **nothing** from bounded contexts whenever it can avoid it (`ui-kit/` never does). Talk to the backend over HTTP:

1. First look for a generated API client (orval config, `openapi-typescript` output, generated `*.gen.ts` / `api/` folders) and use its hooks and types. Regenerating it is tool output (`df-ps-scaffold`, rule 2, exception 2); widgets need it regenerated after new endpoints. No client yet and the project has `handlers-rest` → suggest the Orval integration (`! npx df-integration`).
2. Only without such a client, take types from endpoint contracts: `import type` from `<C>/presentation/rest/**`, e.g. `type Contract = EndpointContract<OrdersRecentGetEndpoint['handle']>`. No value imports, no `import { type X }`, nothing from other layers.

`npx df-lint` reports a widget importing another widget, UI-kit importing widgets, pages or contexts, shared hooks importing UI-kit, widgets, pages or contexts, and React importing contexts beyond the contract types. Fix every finding.
