---
name: df-ps-scaffold
description: Generate Domain-First components with the `df-scaffold` CLI (@domain-first/project-structure) — bounded contexts, aggregates, repositories, errors, services, use cases, commands, queries, ports and handlers-rest endpoints. Use when the project has domain-first.project-structure.config.json and the user asks to add or create any of these. Holds the mandatory rules (work plan approval, new files and new dependencies only via the CLIs) and the JSON CLI workflow that the other df-ps skills, df-ps-react included, rely on.
---

# Scaffold components with df-scaffold

## Workflow

Follow this order for every request:

1. Read `domain-first.project-structure.config.json` beside the nearest `package.json`: `project.rootFolder`, `backend` (including `backend.implementations` and `backend.rules`), and `frontend`. `frontend.react.framework` records React (`react`) or Next.js (`next`); both use `df-react`. Initialization and configuration belong to the human: never run `df-init` or manually add/change these settings. If the config is missing, tell the user to run `npx df-init`; if backend work needs an absent `backend`, tell them to run `npx df-init --section backend`. Continue only with work whose required sections are configured. A config of an earlier major version (flat, without `project`) makes every command stop with `run npx df-upgrade` (`CONFIG_OUTDATED` in JSON mode): ask the user to run `npx df-upgrade`; never run it or convert the config yourself. `df-init` scaffolds explicit standard lists and enabled lint checks under `backend.rules`; read the saved values as authoritative. Older or partial configs may omit entries, which retain the defaults. Backend reconfiguration by the user fills missing entries without resetting existing rules.
2. Feature request without named contexts/components → `df-ps-plan-feature` (it covers steps 3–5).
3. Choose a component for each piece of logic with `references/choosing-components.md`. Pieces of UI (pages, widgets, UI-kit components, shared hooks): `df-ps-react`.
4. Read `references/units/<unit>.md` for every unit in the plan ("Units" below) and prepare the run details ("Preparing runs"). Read [agent-mode.md](references/agent-mode.md) for the JSON protocol and use `--describe` to obtain the installed request schema and selectable IDs.
5. If the task creates files, show the work plan and **stop until it's approved** (rule 1).
6. Run the generators in plan order with `--request` JSON; check exit code, `ok` and all returned file lists. Use the driver only for older CLI versions without JSON support.
7. Implement each unit by the "Implement" and "Test" sections of its unit file and the general rules of `df-ps-implement`, in this order: domain → application → schema tool runs (migrations) → infrastructure → endpoints → other tool runs (OpenAPI, API client) → React (`df-ps-react`).
8. Run `npx df-lint` and the project's tsc/lint/tests.
9. Report against the plan.

## Mandatory rules

### 1. Work plan approval

**A task that creates any new file** (a df-scaffold run, or a hand-created file under rule 2) needs an approved work plan first, even for one component, unless the user explicitly says to skip approval for this task. Until approval, only read (`--describe` and `dryRun: true` do not write files). Files written by the project's own scripts (rule 2, exception 2) don't count: run those scripts when the work needs them.

Tasks that only edit existing files (a bug fix, a new field, a changed rule) don't need a plan: do them directly and say what you changed.

Show the plan in this format and stop:

```markdown
**Plan: order cancellation**

**Scaffolding**

**sales**

Why here: cancelling changes the order's status; orders belong to sales.

What will be scaffolded:

| Layer | Type | Name | Details | Why |
| --- | --- | --- | --- | --- |
| **domain** | error | order-already-shipped | | shipped orders can't be cancelled |
| **application** | command | cancel-order | prisma, fake in tests | one atomic status change |
| | query | cancellable-orders | prisma | read-only list for the UI |
| **presentation** | endpoint | POST orders/:id/cancel | → cancel-order | UI calls it over HTTP |

**billing**

Why here: refunds are payments; payments belong to billing.

What will be scaffolded:

| Layer | Type | Name | Details | Why |
| --- | --- | --- | --- | --- |
| **application** | port | order-refunds | cross-context, stub in tests | paid amount lives in sales |
| | use case | refund-cancelled-order | deps: OrderRefunds, PaymentGateway | read order, then call provider |

**React**

Why here: the user cancels from the order screen.

What will be scaffolded:

| Layer | Type | Name | Details | Why |
| --- | --- | --- | --- | --- |
| **presentation** | widget | orders/cancel-order | with separated ui | dialog has its own state |
| | page | orders/details | add the widget | button goes on this screen |

**Writing by hand**
- cancel-order: input { orderId }, output { status }
- prisma implementation: update status, throw OrderAlreadyShipped
- endpoint: :id → orderId, OrderAlreadyShipped → 409
- order-refunds adapter: sales:OrderSummaryQuery result → RefundableAmount

**Running**
- after the endpoint: npm run openapi && npm run client:orval

**Question**
1. Refund right on cancel, or after a manager confirms?

Reply "ok" to start.
```

- Write the plan in the user's language (headings and sentences); module names, types, commands and paths stay as in the code. Omit empty sections.
- **Scaffolding** has one block per owner, in run order: new contexts first, marked `(new)` (and `(provisional)` with the reason when ownership is a reversible default), then existing contexts, `shared-kernel`, React last.
- **Why here**: one short sentence on why this owner, not another: the data or rule the context owns; for `shared-kernel`, why several contexts share it; for React, why the UI changes.
- **What will be scaffolded**: one table per owner, one row per `df-scaffold`/`df-react` run. Layers in order domain → application → infrastructure → presentation, the layer in bold only on its first row. Repositories go with their aggregate in domain; commands, queries and ports in application (their implementations are Details); endpoints and React modules in presentation.
  - **Type**: the unit: aggregate, entity, value object, error, error namespace, service, port, command, query, use case, implementation, endpoint, wire dependency, move; for React: page, widget, ui-kit component, hook, page move, widget move.
  - **Name**: the entered name; for a move `old → new`; for an implementation the contract; for wire dependency the module.
  - **Details**: only what changes behavior: implementation types (`(saved)` when saved for future runs), the test implementation, dependencies (`deps: OrderRepository`), environments, widget type, the endpoint's handler, whether a Next.js route moves (`route moves: /a → /b`). No file paths, no CLI menu paths.
  - **Why**: at most six words: why this kind of module (`choosing-components.md`).
- **Writing by hand**: members, schemas, mappings. Not full code.
- **Running**: every command that generates files (migrations, OpenAPI, API client, other codegen), with what it produces and when. Use the project's own scripts; find them in `package.json` and configs. Their output needs no approval of its own and is never edited; scripts that change a database are run only by the user. Details: the project's scripts skill (`project-scripts`), if there is one.
- **Overwrites**, only when a run would replace existing files (`overwriteRequired` of a `dryRun`): list those files.
- **Exception requests**, only for hand-created files: `<path>` (rule 2, #n) with the reason. Any other file needs its own request with a reason.
- **Question**, only for open decisions that change structure or domain behavior. Open questions block approval: answers first, then the updated plan.
- The last line says what reply starts the work.
- Approval must be explicit ("ok", "да", "делай"…). A question or silence isn't approval. Changes to the plan → show the updated plan and ask again.
- After approval, do exactly the plan. An extra module or file, or a different name/option → stop and get the delta approved. Edits to existing files needed along the way don't need approval; list them in the final report.

### 2. New files only through df-scaffold

Every new file is created by `df-scaffold` (React modules: `df-react`). Don't create files with the Write tool, `touch`, redirects, or by copying templates. The only exceptions (`<C>` = `<rootFolder>/bounded-contexts/<context>`):

| #   | Files                            | Location                                                                                                                                                                                                                                              | Condition                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Missing spec                     | `<component>.spec.ts` next to the component                                                                                                                                                                                                           | Exactly from "Spec templates" in `references/generators.md`.                                                                                                                                                                                                                                                                                                                                   |
| 2   | Output of project tools          | where the tool puts it                                                                                                                                                                                                                                | Migrations, codegen: run the project's script, use its output as-is; never hand-write or edit it. No approval needed for these files.                                                                                                                                                                                                                                                          |
| 3   | Widget hooks / UI                | `…/presentation/react/widgets/<name>/hooks/**`, `ui/**`                                                                                                                                                                                               | Widget generated by df-react.                                                                                                                                                                                                                                                                                                                                                                     |
| 4   | Widget/page/UI-kit support files | inside the widget folder or `ui-kit/<name>/`: styles, assets, `*.test.tsx`, `*.stories.tsx`; next to a page: `pages/<name>-page.module.css`, for a nested page in its folder (`pages/admin/admin-users-page.module.css`) (layout of its widgets only) | Widget/page/UI-kit component generated by df-react. Details and story templates: `df-ps-react`.                                                                                                                                                                                                                                                                                                 |
| 5   | App bootstrap and config         | outside `<rootFolder>/{bounded-contexts,shared-kernel,presentation}/`: entry point, HTTP server setup registering `restHandlers`, tool configs                                                                                                               | Bootstrapping only. Domain/application/infrastructure logic never goes there.                                                                                                                                                                                                                                                                                                                  |

Anything else (helpers, types, constants, mappers, wiring, barrels): put it in an existing generated file, or generate a component that can host it. Editing existing files is fine. If neither works, request an exception for that exact file.

If the CLI cannot run, report the failure and give the user the prepared JSON command to run themselves (the menu path and answers only for a legacy CLI). Never hand-write its output. Missing generated files are only recreated by re-running the generator, as an approved overwrite.

Moving or renaming a module (aggregate, entity, value object, service, port, query, command, use case) is a df-scaffold run, `Move or rename` (`references/units/move-or-rename.md`); a page or widget, a df-react run (`df-ps-react`). Never by hand: it creates files at the new paths, so it needs an approved plan.

### 3. New dependencies only through df-scaffold

With `@domain-first/wire`, every new dependency of a wired class (a constructor parameter plus its wire) is added by `df-scaffold`: the generator's `Dependencies:` step for a new module, `Wire dependency` for an existing one, and the `Handler:` pick for an endpoint (its generator is added automatically). Don't add constructor parameters or wire entries by hand, and don't reorder or remove the ones `df-scaffold` added.

- List each module's dependencies in its plan row's Details (`deps: OrderRepository`); for an existing module, add a `wire dependency` row.
- A dependency the CLI doesn't offer is forbidden by the project's dependency rules (the defaults, changed by `backend.rules.dependencies` in the config) or by context isolation: change the design (a port, a query or command, an infrastructure service) instead of adding it by hand.
- A value that isn't a wired module (a database or SDK client, a config value) lives in an infrastructure service named after the implementation label (`prisma`, `in-memory-db`, `stripe`): the service creates or reads it itself (`readonly client = new PrismaClient()`), with no constructor parameter for it. Implementations get the service through `df-scaffold`, where it shows up under `Suggested`. Wrap the service's wire in `memoWire(...)` when one instance must be shared (a connection pool, an in-memory store). No `wireValue(...)`. A domain or application module never gets such a value directly: it depends on a port whose adapter uses the service.
- An endpoint generated with `handler: never` gets its handler by re-running the endpoint generator once the handler exists, as an approved overwrite.

### 4. Cross-context calls stay in application port adapters

Details and the check script: `df-ps-implement`, "Bounded context isolation".

## Units

One file per unit in `references/units/`: when to choose it, how to generate it (prompts, example steps, output), how to implement and test it. Read `references/generators.md` first: it holds what all generators share (the notation the unit files use, `Dependencies:`, env-branched wiring, spec templates). Then read only the files of the units in the plan. `references/choosing-components.md` decides between units.

| Unit | File | Menu |
| --- | --- | --- |
| Bounded context | `bounded-context.md` | Scaffold new bounded context |
| Aggregate + repository | `aggregate.md` | Domain → New Aggregate |
| Entity, value object | `entity-value-object.md` | Domain → New Entity / New Value Object |
| Errors | `errors.md` | Domain → Errors |
| Domain, application, infrastructure, presentation service | `services.md` | <Layer> → New Service |
| Use case | `use-case.md` | Application → New Use Case |
| Command, query | `command-query.md` | Application → New Command / New Query |
| Port + adapters | `port.md` | Application → New Port |
| One more implementation of a repository, command, query or port | `implementation.md` | Infrastructure → New Implementation |
| REST endpoint | `endpoint.md` | Presentation → New Handlers-REST Endpoint |
| Dependency of an existing module | `wire-dependency.md` | Wire dependency |
| Moving or renaming a module | `move-or-rename.md` | Move or rename |
| React modules | `df-ps-react` skill | `df-react` |

## Preparing runs

- **Contexts**: subfolders of `<rootFolder>/bounded-contexts/` (menu: `Bounded Context: <name>`).
- **Names**: lowercase kebab-case, no generator suffix (`place-order`, not `place-order-use-case`). No empty segments (`a--b`).
- **Collisions**: JSON requests require `overwrite: true` to replace changed existing files. Inspect `overwriteRequired` with `dryRun: true` and include those overwrites in the plan. The interactive equivalent asks `Overwrite them?`.
- **Tests**: with `backend.testingLibrary` set, df-scaffold always generates specs; add a test implementation (`in-memory`/`mock`) to repositories, commands/queries, and ports. Otherwise the spec wires the real one. Without `backend.testingLibrary`, tell the user once and suggest adding it with `! npx df-integration` (Vitest); don't edit the config yourself.
- **Requests**: take the unit semantics and output files from its reference, then use `--describe` and `references/agent-mode.md` to build a JSON request. The scripted prompt sequences are the legacy interactive fallback.

## Running non-interactively

Use `npx df-scaffold --describe` and execute approved operations with `--request` JSON. React uses `df-react`; integrations use `df-integration`. Protocol, discovery IDs, previews and error handling: [references/agent-mode.md](references/agent-mode.md). Complete backend/React operation map, dependency recipes and conditional integration options: [references/agent-operations.md](references/agent-operations.md).

Initialization remains a human task. No JSON initialization workflow is provided.

## Legacy interactive driver

For CLI versions without JSON support, `scripts/drive.mjs` answers its prompts, then lists created (`+`) and changed (`~`) files. With `--bin df-react` it drives the React CLI instead (`df-ps-react`).

```bash
node <this-skill-dir>/scripts/drive.mjs [--bin df-react] [--cwd <dir>] [--delay <ms>] <step>...
node scripts/drive.mjs "pick:Bounded Context: sales" pick:Domain "pick:New Aggregate" text:order yes "pick:Enter implementation type and save for future use" text:prisma no
```

| Step                   | Prompt   | Effect                                                                                                           |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `pick:<label>`         | select   | Types a **prefix of the choice text** + Enter. Aborts before submitting if the highlighted choice doesn't match. |
| `text:<v>`             | input        | Types a value. |
| `default`              | input/select | Accepts the suggested input value or the highlighted default choice. |
| `yes` / `no`           | confirm  |                                                                                                                  |
| `toggle:1,3` / `none`  | checkbox | `Dependencies:`, `Dependencies for <Implementation>:`. `Suggested` items come checked: toggling unchecks. |

Implementation-type menus contain saved names and active system choices, without automatic `api` or `mock` presets. Use `pick:prisma` only when saved for that category, `"pick:System: cross-context"` for a port with a neighboring context, or `"pick:System: in-memory"` for a repository/command/query with the shared DB integration ready. New ordinary names take two steps: `"pick:Enter implementation type and save for future use" text:redis` or `"pick:Enter implementation type for this run only" text:redis`. Use the complete manual-entry label to distinguish saving from run-only input. `default` accepts the selected choice.

Custom types entered with the save action update `backend.implementations` in `domain-first.project-structure.config.json`; mark the type `(saved)` in the plan row's Details. The run-only action generates code without adding saved choices. These generator-managed choice updates are allowed; project/backend/frontend setup remains a human task. Changes are staged with the generated code and cancelled with it. Repository, command, query and port choices are independent; read that category's saved `primary`/`test` lists before preparing answers.

Check every run: exit code 0, no `WARNING`/`ABORTED`, and exactly the files its unit file lists for the planned options. "Still waiting for input" means too few steps; nothing was written. If the raw output ends at `Overwrite them?`, the run would replace files the plan's Overwrites didn't list: show the user the listed files and ask, never just add `yes`. If prompts get out of sync, retry with `--delay 1200`.

## Menu map

| Layer          | Bounded context                                                  | Shared Kernel                                      |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| Domain         | New Aggregate, New Entity, New Value Object, Errors, New Service | New Entity, New Value Object, Errors, New Service |
| Application    | New Query, New Command, New Use Case, New Port, New Service      | New Port, New Service                             |
| Infrastructure | New Service, New Implementation                                  | New Service, New Implementation                   |
| Presentation   | New Handlers-REST Endpoint (needs handlers-rest), New Service    | New Service                                       |

With `@domain-first/wire`, the layer menu of a context and of the Shared Kernel also has `Wire dependency`: it adds dependencies to an existing wired module. Every layer menu has `Move or rename`.

The main menu also has `Scaffold new bounded context`. React modules come from a separate CLI, `df-react`: see `df-ps-react`.

Run order in a plan: new contexts → domain (aggregates before their entities and value objects) → application (ports, commands/queries, use cases) → new implementations of existing contracts → endpoints → React (`df-ps-react`).
