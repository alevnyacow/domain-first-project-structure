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
6. Run the generators in plan order with `--request` JSON; check exit code, `ok` and all returned file lists.
7. Implement each unit by the "Implement" and "Test" sections of its unit file and the general rules of `df-ps-implement`, in this order: domain → application → schema tool runs (migrations) → infrastructure → endpoints → other tool runs (OpenAPI, API client) → React (`df-ps-react`).
8. Run `npx df-lint` and the project's tsc/lint/tests.
9. Report against the plan.

## Mandatory rules

### 1. Work plan approval

**A task that creates any new file** (a df-scaffold run, or a hand-created file under rule 2) needs an approved work plan first, even for one component. The plan can be skipped only when the user explicitly says, for this task, that no plan is needed: the message names the plan itself and declines it ("skip the plan", "without a plan", "no plan needed"), in whatever language the user writes. A request that doesn't mention the plan always starts with one, however direct or urgent it sounds ("let's build the order export", "just do it", "build it now", "no need to ask"). Never infer that the user wants no plan from the size of the task, its urgency or earlier tasks. This is about skipping the plan: once a plan is shown, an ordinary "yes" or "go ahead" approves it. Until approval, only read (`--describe` and `dryRun: true` do not write files). Files written by the project's own scripts (rule 2, exception 2) don't count: run those scripts when the work needs them.

Tasks that only edit existing files (a bug fix, a new field, a changed rule) don't need a plan: do them directly and say what you changed.

Read [references/work-plan.md](references/work-plan.md), show the plan in that format and stop.

- Approval must be explicit ("ok", "yes", "go ahead"…). A question or silence isn't approval. Changes to the plan → show the updated plan and ask again.
- After approval, do exactly the plan. An extra module or file, or a different name/option → stop and get the delta approved. Edits to existing files needed along the way don't need approval; list them in the final report.

### 2. New files only through df-scaffold

Every new file is created by `df-scaffold` (React modules: `df-react`). Don't create files with the Write tool, `touch`, redirects, or by copying templates. The only exceptions (`<C>` = `<rootFolder>/bounded-contexts/<context>`):

| # | Files | Location | Condition |
| --- | --- | --- | --- |
| 1 | Missing spec | `<component>.spec.ts` next to the component | Exactly from "Spec templates" in `references/generators.md`. |
| 2 | Output of project tools | where the tool puts it | Migrations, codegen: run the project's script, use its output as-is; never hand-write or edit it. No approval needed for these files. |
| 3 | Widget hooks / UI | `…/presentation/react/widgets/<name>/hooks/**`, `ui/**` | Widget generated by df-react. |
| 4 | Widget/page/UI-kit support files | inside the widget folder or `ui-kit/<name>/`: styles, assets, `*.test.tsx`, `*.stories.tsx`; next to a page: `pages/<name>-page.module.css`, for a nested page in its folder (`pages/admin/admin-users-page.module.css`) (layout of its widgets only) | Widget/page/UI-kit component generated by df-react. Details and story templates: `df-ps-react`. |
| 5 | App bootstrap and config | outside `<rootFolder>/{bounded-contexts,shared-kernel,presentation}/`: entry point, HTTP server setup registering `restHandlers`, tool configs | Bootstrapping only. Domain/application/infrastructure logic never goes there. |

Anything else (helpers, types, constants, mappers, wiring, barrels): put it in an existing generated file, or generate a component that can host it. Stateless technical code of the infrastructure layer (mappers included) is an infrastructure helper, generated with `New Helper` (`references/units/helper.md`). Editing existing files is fine. If neither works, request an exception for that exact file.

If the CLI cannot run, report the failure and give the user the prepared JSON command to run themselves. Never hand-write its output. Missing generated files are only recreated by re-running the generator, as an approved overwrite.

Moving, renaming and deleting a module go through the CLI too, never by hand, and need an approved plan: `references/units/move-or-rename.md`, `references/units/delete.md`; pages and widgets: `df-ps-react`.

### 3. New dependencies only through df-scaffold

With `@domain-first/wire`, every new dependency of a wired class (a constructor parameter plus its wire) is added by `df-scaffold`: the generator's `Dependencies:` step for a new module, `Wire dependency` for an existing one, and the `Handler:` pick for an endpoint (its generator is added automatically). Don't add constructor parameters or wire entries by hand, and don't reorder or remove the ones `df-scaffold` added. The one exception: an approved plan removes a dependency (from the wire and the constructor together), e.g. before deleting the module it points to.

- List each module's dependencies in its plan row's Details (`deps: OrderRepository`); for an existing module, add a `wire dependency` row.
- A dependency the CLI doesn't offer is forbidden by the project's dependency rules (the defaults, changed by `backend.rules.dependencies` in the config) or by context isolation: change the design (a port, a query or command, an infrastructure service) instead of adding it by hand.
- A value that isn't a wired module (a database or SDK client, a config value) lives in an infrastructure service (`references/units/services.md`). A domain or application module never gets such a value directly: it depends on a port whose adapter uses the service.

### 4. Cross-context calls stay in application port adapters

Details and the check script: `df-ps-implement`, "Bounded context isolation".

## Units

One file per unit in `references/units/`: when to choose it, how to generate it (prompts, output), how to implement and test it. Read `references/generators.md` first: it holds what all generators share (the notation the unit files use, `Dependencies:`, env-branched wiring, spec templates). Then read only the files of the units in the plan. `references/choosing-components.md` decides between units.

| Unit | File | Menu |
| --- | --- | --- |
| Bounded context | `bounded-context.md` | Scaffold new bounded context |
| Aggregate + repository | `aggregate.md` | Domain → New Aggregate |
| Entity, value object | `entity-value-object.md` | Domain → New Entity / New Value Object |
| Errors | `errors.md` | Domain → Errors |
| Domain, application, infrastructure, presentation service | `services.md` | <Layer> → New Service |
| Infrastructure helper (mapper, query builder, error translator) | `helper.md` | Infrastructure → New Helper |
| Use case | `use-case.md` | Application → New Use Case |
| Command, query | `command-query.md` | Application → New Command / New Query |
| Port + adapters | `port.md` | Application → New Port |
| One more implementation of a repository, command, query or port | `implementation.md` | Infrastructure → New Implementation |
| REST endpoint | `endpoint.md` | Presentation → New Handlers-REST Endpoint |
| Dependency of an existing module | `wire-dependency.md` | Wire dependency |
| Moving or renaming a module | `move-or-rename.md` | Move or rename |
| Deleting a module | `delete.md` | Delete |
| React modules | `df-ps-react` skill | `df-react` |

## Preparing runs

- **Contexts**: subfolders of `<rootFolder>/bounded-contexts/`.
- **Names**: lowercase kebab-case, no generator suffix (`place-order`, not `place-order-use-case`). No empty segments (`a--b`).
- **Collisions**: JSON requests require `overwrite: true` to replace changed existing files. Inspect `overwriteRequired` with `dryRun: true` and include those overwrites in the plan. The interactive equivalent asks `Overwrite them?`.
- **Integration specs**: with the Testcontainers integration and wire, primary implementations of the types in `backend.implementations.integrationTests`, and infrastructure services when asked, get a spec in `specs/integration/` (`references/generators.md`). For a new type, set `integrationTests: false` when the container can't exercise it (an external API).
- **Tests**: with `backend.testingLibrary` set, df-scaffold generates specs for modules without infrastructure (domain model, non-infrastructure services, use cases); repositories, commands/queries, ports, infrastructure services and helpers get none. Add a test implementation (`in-memory`/`mock`) to repositories, commands/queries and ports, so `NODE_ENV=test` specs of the use cases that inject them don't touch real infrastructure. Without `backend.testingLibrary`, tell the user once and suggest adding it with `! npx df-integration` (Vitest); don't edit the config yourself.
- **Run order** in a plan: new contexts → domain (aggregates before their entities and value objects) → application (ports, commands/queries, use cases) → new implementations of existing contracts → endpoints → React (`df-ps-react`).
- **Requests**: take the unit semantics and output files from its reference, then use `--describe` and `references/agent-mode.md` to build a JSON request.

## Running non-interactively

Use `npx df-scaffold --describe` and execute approved operations with `--request` JSON. React uses `df-react`; integrations use `df-integration`. Protocol, discovery IDs, previews and error handling: [references/agent-mode.md](references/agent-mode.md). Complete backend/React operation map, dependency recipes and conditional integration options: [references/agent-operations.md](references/agent-operations.md).

Initialization remains a human task. No JSON initialization workflow is provided.
