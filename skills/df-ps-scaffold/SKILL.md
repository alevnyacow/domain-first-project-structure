---
name: df-ps-scaffold
description: Generate Domain-First components with the `df-ps` CLI (@domain-first/project-structure) — bounded contexts, aggregates, repositories, errors, services, use cases, commands, queries, ports, handlers-rest endpoints, React pages, widgets, UI-kit components (with Storybook stories) and shared hooks, and moving or renaming pages and widgets. Use when the project has domain-first.project-structure.config.json and the user asks to add or create any of these, or to move, rename or regroup a page or widget. Holds the mandatory rules (work plan approval, new files and new dependencies only via df-ps) that the other df-ps skills rely on.
---

# Scaffold components with df-ps

## Workflow

Follow this order for every request:

1. Read `domain-first.project-structure.config.json` (beside the nearest `package.json`). If missing, stop and tell the user to initialize the project with `npx df-ps` first. Its optional `rules.dependencies` changes what each kind of module may depend on; where it differs from the defaults in these skills, the config wins.
2. Feature request without named contexts/components → `df-ps-plan-feature` (it covers steps 3–5).
3. Choose a component for each piece of logic with `references/choosing-components.md`.
4. Prepare the run details ("Preparing runs" below).
5. If the task creates files, show the work plan and **stop until it's approved** (rule 1).
6. Run the generators in plan order with the driver; check each output.
7. Implement with `df-ps-implement`, in its order: domain → application → schema tool runs (migrations) → infrastructure → endpoints → other tool runs (OpenAPI, API client) → React.
8. Run `npx df-lint` and the project's tsc/lint/tests.
9. Report against the plan.

## Mandatory rules

### 1. Work plan approval

**A task that creates any new file** (a df-ps run, or a hand-created file under rule 2) needs an approved work plan first, even for one component, unless the user explicitly says to skip approval for this task. Until approval, only read. Files written by the project's own scripts (rule 2, exception 2) don't count: run those scripts when the work needs them.

Tasks that only edit existing files (a bug fix, a new field, a changed rule) don't need a plan: do them directly and say what you changed.

Show the plan in this format and stop:

```markdown
**Work plan**

| #   | Where | CLI path                   | Name        | Options                 | Files (+ new, ~ changed)                                                                                                                                                                                |
| --- | ----- | -------------------------- | ----------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | sales | Domain → New Aggregate     | order       | repo prisma + in-memory | + …/domain/aggregates/order/{order.aggregate-root.ts, index.ts, order-repository.ts, specs}<br>+ …/infrastructure/repositories/{prisma,in-memory}/…<br>+ …/wiring/repositories/wire-order-repository.ts |
| 2   | sales | Domain → New Entity        | order-line  | aggregate order         | + …/domain/aggregates/order/entities/{order-line.entity.ts, spec}<br>~ …/domain/aggregates/order/index.ts                                                                                               |
| 3   | sales | Application → New Use Case | place-order | deps: OrderRepository   | + …/application/use-cases/place-order-use-case.ts, spec<br>+ …/wiring/use-cases/wire-place-order-use-case.ts                                                                                            |
| 4   | react | Move or rename widget      | users → admin/users |                   | → …/widgets/admin/users/{admin-users-widget.tsx, ui/admin-users-widget-ui.tsx, hooks/use-admin-users-ui-model.ts, …}<br>~ …/pages/users-page.tsx (import) |

Hand-written changes:

- `order.aggregate-root.ts`: schema (id, lines, status), method `pay()`
- `place-order-use-case.ts`: schemas, handler

Hand-created files (exception #): none; list each as `<path>` (#n)

Tool runs:

- after application, before infrastructure: `npm run prisma:migration:plan -- --name add-order`: migration for the `order` table (applied by the user)
- `npm run openapi && npx orval`: OpenAPI document and API client with the new endpoints
```

- Every run lists the CLI path, target, name, every answer you'll give, and the files from `references/generators.md`. Flag overwrites of existing files.
- Hand-written changes: members, schemas, dependencies. Not full code.
- Tool runs: every command that generates files (migrations, OpenAPI, API client, other codegen), with what it produces and when. Use the project's own scripts; find them in `package.json` and configs. Their output needs no approval of its own and is never edited; scripts that change a database are run only by the user. Details: the project's scripts skill (`project-scripts`), if there is one.
- Any file outside the rule 2 exceptions appears as a separate **exception request** with a reason.
- Approval must be explicit ("ok", "да", "делай"…). A question or silence isn't approval. Changes to the plan → show the updated plan and ask again.
- After approval, do exactly the plan. An extra **new file**, component, or a different name/option → stop and get the delta approved. Edits to existing files needed along the way don't need approval; list them in the final report.

### 2. New files only through df-ps

Every new file is created by `df-ps`. Don't create files with the Write tool, `touch`, redirects, or by copying templates. The only exceptions (`<C>` = `<rootFolder>/bounded-contexts/<context>`):

| #   | Files                            | Location                                                                                                                                                                                                                                              | Condition                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Missing spec                     | `<component>.spec.ts` next to the component                                                                                                                                                                                                           | Exactly from "Spec templates" in `references/generators.md`.                                                                                                                                                                                                                                                                                                                                   |
| 2   | Output of project tools          | where the tool puts it                                                                                                                                                                                                                                | Migrations, codegen: run the project's script, use its output as-is; never hand-write or edit it. No approval needed for these files.                                                                                                                                                                                                                                                          |
| 3   | Widget hooks / UI                | `…/presentation/react/widgets/<name>/hooks/**`, `ui/**`                                                                                                                                                                                               | Widget generated by df-ps.                                                                                                                                                                                                                                                                                                                                                                     |
| 4   | Widget/page/UI-kit support files | inside the widget folder or `ui-kit/<name>/`: styles, assets, `*.test.tsx`, `*.stories.tsx`; next to a page: `pages/<name>-page.module.css`, for a nested page in its folder (`pages/admin/admin-users-page.module.css`) (layout of its widgets only) | Widget/page/UI-kit component generated by df-ps. A page stays one file that composes widgets, plus an optional CSS module for their layout (grid, spacing, areas); no page tests. Its own hooks, UI parts, types, or styles for how a block looks mean a widget is missing, so generate it. A missing UI-kit or widget UI story: exactly from "Story templates" in `references/generators.md`. |
| 5   | App bootstrap and config         | outside `<rootFolder>/{bounded-contexts,shared,presentation}/`: entry point, HTTP server setup registering `restHandlers`, tool configs                                                                                                               | Bootstrapping only. Domain/application/infrastructure logic never goes there.                                                                                                                                                                                                                                                                                                                  |

Anything else (helpers, types, constants, mappers, wiring, barrels): put it in an existing generated file, or generate a component that can host it. Editing existing files is fine. If neither works, request an exception for that exact file.

If the CLI can't run, give the user the menu path and answers to run `npx df-ps` themselves (`! npx df-ps`). Never hand-write its output. Missing generated files are only recreated by re-running the generator, as an approved overwrite.

Moving or renaming a page or widget is a df-ps run too (`Move or rename page` / `Move or rename widget`, see `references/generators.md`): it creates the files at the new paths, so it needs an approved plan (rule 1). Don't move, rename, or copy their files by hand, and don't rename their `<Name>Page…`, `<Name>Widget…`, or `use<Name>UIModel` by hand: df-ps keeps file names, code names, story titles, and imports in sync. List each move as a run: old → new name, the files to move (`→`), and the files whose imports change (`~`).

### 3. New dependencies only through df-ps

With `@domain-first/wire`, every new dependency of a wired class (a constructor parameter plus its wire) is added by `df-ps`: the generator's `Dependencies:` step for a new module, `Wire dependency` for an existing one, and the `Handler:` pick for an endpoint (its generator is added automatically). Don't add constructor parameters or wire entries by hand, and don't reorder or remove the ones `df-ps` added.

- List each module's dependencies in the plan as run options (`deps: OrderRepository`), with a `Wire dependency` run for existing modules.
- A dependency the CLI doesn't offer is forbidden by the project's dependency rules (the defaults, changed by `rules.dependencies` in the config) or by context isolation: change the design (a port, a query or command, an infrastructure service) instead of adding it by hand.
- A value that isn't a wired module (a database or SDK client, a config value) lives in an infrastructure service named after the implementation label (`prisma`, `in-memory-db`, `stripe`): the service creates or reads it itself (`readonly client = new PrismaClient()`), with no constructor parameter for it. Implementations get the service through `df-ps`, where it shows up under `Suggested`. Wrap the service's wire in `memoWire(...)` when one instance must be shared (a connection pool, an in-memory store). No `wireValue(...)`. A domain or application module never gets such a value directly: it depends on a port whose adapter uses the service.
- An endpoint generated with `handler: never` gets its handler by re-running the endpoint generator once the handler exists, as an approved overwrite.

### 4. Bounded contexts never import each other

Details and the check script: `df-ps-implement`, "Bounded context isolation".

## Preparing runs

- **Contexts**: subfolders of `<rootFolder>/bounded-contexts/` (menu: `Bounded Context: <name>`).
- **Names**: lowercase kebab-case, no generator suffix (`place-order`, not `place-order-use-case`). No empty segments (`a--b`). Pages and widgets only: folders before the name, each segment kebab-case (`admin/users`); when to nest: `references/choosing-components.md`.
- **Collisions**: before writing, the CLI asks `Overwrite them?` if the run would replace existing files. Check the target paths; rename, or flag the overwrite in the plan and end that run's steps with `yes`.
- **Tests**: with `testingLibrary` set, df-ps always generates specs; add a test implementation (`in-memory`/`mock`) to repositories, commands/queries, and ports. Otherwise the spec wires the real one. Without `testingLibrary`, tell the user once and suggest adding it; don't edit the config yourself.
- **Prompts**: take the exact sequence for the generator and config from `references/generators.md`.

## Running the driver

`df-ps` is interactive. `scripts/drive.mjs` answers its prompts, then lists created (`+`) and changed (`~`) files.

```bash
node <this-skill-dir>/scripts/drive.mjs [--cwd <dir>] [--delay <ms>] <step>...
node scripts/drive.mjs "pick:Bounded Context: sales" pick:Domain "pick:New Aggregate" text:order yes default yes default
```

| Step                   | Prompt   | Effect                                                                                                           |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `pick:<label>`         | select   | Types a **prefix of the choice text** + Enter. Aborts before submitting if the highlighted choice doesn't match. |
| `text:<v>` / `default` | input    | Types a value / accepts the default.                                                                             |
| `yes` / `no`           | confirm  |                                                                                                                  |
| `toggle:1,3` / `none`  | checkbox | Init, `Dependencies:`, `Dependencies for <Implementation>:`. `Suggested` items come checked: toggling unchecks. |

Check every run: exit code 0, no `WARNING`/`ABORTED`, and exactly the planned files. "Still waiting for input" means too few steps; nothing was written. If the raw output ends at `Overwrite them?`, the run would replace files the plan didn't flag: show the user the listed files and ask, never just add `yes`. If prompts get out of sync, retry with `--delay 1200`.

## Menu map

| Layer          | Bounded context                                                  | Shared Layer                                      |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| Domain         | New Aggregate, New Entity, New Value Object, Errors, New Service | New Entity, New Value Object, Errors, New Service |
| Application    | New Query, New Command, New Use Case, New Port, New Service      | New Port, New Service                             |
| Infrastructure | New Service                                                      | New Service                                       |
| Presentation   | New Handlers-REST Endpoint (needs handlers-rest), New Service    | New Service                                       |

With `@domain-first/wire`, the layer menu of a context and of the Shared Layer also has `Wire dependency`: it adds dependencies to an existing wired module.

The main menu also has `Scaffold React module` (needs `useReact`: New widget, New page, New UI-kit component, New shared hook) and `Scaffold new bounded context`.

Run order in a plan: new contexts → domain (aggregates before their entities and value objects) → application (ports, commands/queries, use cases) → endpoints → React (shared hooks → UI-kit → widgets → pages).
