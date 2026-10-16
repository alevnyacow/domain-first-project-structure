# API Reference

Technical specification of the command-line interface of `@domain-first/project-structure`.

- [Package](#package)
- [Commands overview](#commands-overview)
- [`df-ps`](#df-ps)
    - [Run lifecycle](#run-lifecycle)
    - [Project root](#project-root)
    - [Initialization](#initialization)
    - [Main menu](#main-menu)
    - [Layer menus](#layer-menus)
- [Configuration file](#configuration-file)
    - [Fields](#fields)
    - [Package integrations](#package-integrations)
- [Naming](#naming)
- [Bounded context generators](#bounded-context-generators)
    - [New bounded context](#new-bounded-context)
    - [New Aggregate](#new-aggregate)
    - [New Entity and New Value Object](#new-entity-and-new-value-object)
    - [Errors](#errors)
    - [New Service](#new-service)
    - [New Use Case](#new-use-case)
    - [New Command and New Query](#new-command-and-new-query)
    - [New Port](#new-port)
    - [New Handlers-REST Endpoint](#new-handlers-rest-endpoint)
- [Wiring](#wiring)
    - [`envBranchedWire`](#envbranchedwire)
    - [Dependency selection](#dependency-selection)
    - [Wire dependency](#wire-dependency)
    - [Dependency rules](#dependency-rules)
- [Unit tests](#unit-tests)
- [React modules](#react-modules)
    - [New page](#new-page)
    - [New widget](#new-widget)
    - [New UI-kit component](#new-ui-kit-component)
    - [New shared hook](#new-shared-hook)
    - [Move or rename page / widget](#move-or-rename-page--widget)
- [Integrations](#integrations)
    - [Storybook (React + Vite)](#storybook-react--vite)
    - [Prisma 8 (PostgreSQL, RC)](#prisma-8-postgresql-rc)
    - [Vitest](#vitest)
    - [Playwright](#playwright)
    - [OpenAPI](#openapi)
    - [Orval (React Query client)](#orval-react-query-client)
    - [Missing domain-first packages](#missing-domain-first-packages)
    - [Package scripts](#package-scripts)
- [`df-skills`](#df-skills)
- [Runtime semantics](#runtime-semantics)

Notation used below:

- `<rootFolder>` is the `rootFolder` value of the [configuration file](#configuration-file), relative to the project root.
- `<context>` is the folder of the selected bounded context: `<rootFolder>/bounded-contexts/<name>`. In the Shared Layer, it is `<rootFolder>/shared`.
- `<name>` is the entered name as is, `<Name>` its class form and `<nameVar>` its variable form. See [Naming](#naming).
- An **implementation label** is a name such as `prisma`, `in-memory`, `api` or `mock`. It names the folder and the class prefix of an implementation: `prisma` gives `infrastructure/repositories/prisma/prisma-order-repository.ts` with `PrismaOrderRepository`.
- **With `wire`**, **with `handlers`** etc. mean that `domainFirstPackages` includes `@domain-first/wire`, `@domain-first/handlers` etc.
- **With tests** means that `testingLibrary` is set.

## Package

| Property       | Value                                                    |
| -------------- | -------------------------------------------------------- |
| Name           | `@domain-first/project-structure`                        |
| Binaries       | `df-ps`, `df-skills`                                     |
| Programmatic   | None: the package is a CLI and exports no public API     |
| Shipped files  | `dist`, `bin`, `skills`                                  |
| Dependencies   | `@inquirer/prompts`, `zod`                               |
| Runtime        | Node.js 22.13+ within the Node 22 release line, or 24+   |
| Interaction    | Interactive prompts only; `df-ps` takes no arguments     |

## Commands overview

| Command     | Purpose                                                                 | Section                   |
| ----------- | ----------------------------------------------------------------------- | ------------------------- |
| `df-ps`     | Initializes a project, scaffolds components, adds integrations          | [`df-ps`](#df-ps)         |
| `df-skills` | Copies the bundled agent skills into a project or the home directory    | [`df-skills`](#df-skills) |

```bash
npx df-ps
npx df-skills [--claude] [--codex] [--global]
```

## `df-ps`

### Run lifecycle

1. The [project root](#project-root) is located.
2. If the configuration file does not exist, [initialization](#initialization) runs and the process exits.
3. Otherwise the [main menu](#main-menu) is shown, and exactly one operation runs.
4. Every file change of the operation is staged in memory. At the end, the staged changes are written in one step. See [Runtime semantics](#runtime-semantics).

### Project root

The nearest directory containing `package.json`, found by walking up from the current directory. If none is found, the CLI throws `No package.json was found`. All paths are relative to this directory. In a monorepo, run the CLI inside the package to scaffold.

### Initialization

Runs when `domain-first.project-structure.config.json` is missing in the project root.

**Prompts**

| Prompt                                       | Kind     | Default                 | Stored as                               |
| -------------------------------------------- | -------- | ----------------------- | --------------------------------------- |
| `Root folder (use "/" for inner folders):`   | input    | `src`                   | `rootFolder`                            |
| `@domain-first packages`                     | checkbox | none selected           | `domainFirstPackages`                   |
| `Use Next adapter for REST endpoints` (only with `handlers-rest` and `next` in `package.json`) | confirm |  |  |
| `Default persistence layer implementation:`  | input    | empty                   | `defaultPersistenceLayerImplementation` |
| `Use React`                                  | confirm  |                         | `useReact`                              |
| `Use Storybook` (only with React)            | confirm  |                         |                                         |
| `Storybook framework package:`               | input    | `@storybook/react-vite` | `storybookFramework`                    |
| `Scaffold unit tests`                        | confirm  |                         |                                         |
| `Unit testing library:`                      | input    | `vitest`                | `testingLibrary`                        |

**Output**

| File                                                  | Condition    | Content                                                                         |
| ----------------------------------------------------- | ------------ | ------------------------------------------------------------------------------- |
| `domain-first.project-structure.config.json`          | Always       | The [configuration](#configuration-file), tab-indented                          |
| `<rootFolder>/shared/wiring/env-branched-wire.ts`     | With `wire`   | [`envBranchedWire`](#envbranchedwire)                                          |
| `<rootFolder>/shared/domain/errors/index.ts`          | With `errors` | `export const SharedErrors = errorNamespace('shared')`                         |
| `<rootFolder>/shared/presentation/services/rest-endpoint-generator-presentation-service.ts` | With `handlers-rest` | The [endpoint generator](#endpoint-generator), with its spec and wire as for [New Service](#new-service) |

With the Next adapter confirmed and `@domain-first/handlers-next` missing from `package.json`, initialization prints `npm i @domain-first/handlers-next` after writing the files.

### Main menu

| Item                         | Shown when       | Action                                                           |
| ---------------------------- | ---------------- | ---------------------------------------------------------------- |
| `Bounded Context: <name>`    | One per subfolder of `<rootFolder>/bounded-contexts` | [Layer menus](#layer-menus) for that context |
| `Scaffold React module`      | `useReact`       | [React modules](#react-modules)                                  |
| `Shared Layer`               | Always           | [Layer menus](#layer-menus) for `<rootFolder>/shared`            |
| `Scaffold new bounded context` | Always         | [New bounded context](#new-bounded-context)                      |
| `Add integration`            | Always           | [Integrations](#integrations)                                    |

### Layer menus

After choosing a bounded context or the Shared Layer, the CLI asks for a layer and then for an operation.

| Layer             | Bounded context                                                              | Shared Layer                                         |
| ----------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| `Domain`          | `New Aggregate`, `New Entity`, `New Value Object`, `Errors`, `New Service`   | `New Entity`, `New Value Object`, `Errors`, `New Service` |
| `Application`     | `New Query`, `New Command`, `New Use Case`, `New Port`, `New Service`        | `New Port`, `New Service`                            |
| `Infrastructure`  | `New Service`                                                                | `New Service`                                        |
| `Presentation`    | `New Handlers-REST Endpoint` (with `handlers-rest`), `New Service`           | `New Service`                                        |
| `Wire dependency` | With `wire`: [Wire dependency](#wire-dependency)                             | With `wire`: [Wire dependency](#wire-dependency)     |

## Configuration file

`domain-first.project-structure.config.json` in the project root. It is read on every run and validated with a strict schema: an invalid file makes the CLI throw.

```ts
type Config = {
    rootFolder: string;
    domainFirstPackages: Array<
        | '@domain-first/types'
        | '@domain-first/errors'
        | '@domain-first/handlers'
        | '@domain-first/wire'
        | '@domain-first/handlers-rest'
    >;
    defaultPersistenceLayerImplementation: string;
    useReact: boolean;
    storybookFramework?: string;
    testingLibrary?: string;
};
```

**Example**

```json
{
    "rootFolder": "src",
    "domainFirstPackages": [
        "@domain-first/types",
        "@domain-first/errors",
        "@domain-first/handlers",
        "@domain-first/wire",
        "@domain-first/handlers-rest"
    ],
    "defaultPersistenceLayerImplementation": "prisma",
    "useReact": true,
    "storybookFramework": "@storybook/react-vite",
    "testingLibrary": "vitest"
}
```

### Fields

| Field                                   | Effect                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `rootFolder`                            | Base path of generated source, relative to the project root. May contain inner folders: `src/server`.                                       |
| `domainFirstPackages`                   | Integrations used by templates. See [Package integrations](#package-integrations). An empty array selects plain class templates.             |
| `defaultPersistenceLayerImplementation` | Default implementation label for repositories, execution commands and execution queries.                                                     |
| `useReact`                              | Shows `Scaffold React module` in the main menu and enables the Orval integration.                                                            |
| `storybookFramework`                    | Package that generated stories import `Meta` and `StoryObj` from. Omitted: no stories are generated.                                         |
| `testingLibrary`                        | Module that generated tests import `describe`, `test`, `expect` and `beforeEach` from. Omitted: no tests are generated.                      |

Edits apply to future runs only. Existing files are not migrated: enabling `wire` or `errors` later also requires the shared files [initialization](#initialization) would create and, for `errors`, the error namespaces of existing contexts.

### Package integrations

| Package                       | Effect on generated code                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@domain-first/types`         | Aggregate roots, entities and value objects extend `domainType()`.                                                |
| `@domain-first/errors`        | Error namespaces for the Shared Layer and each new context. Required by the [Errors](#errors) generator.          |
| `@domain-first/handlers`      | `inputSchema` / `outputSchema` placeholders, `Handler` contracts and `defineHandler` implementations for use cases, commands and queries. |
| `@domain-first/wire`          | `wireClass` factories under `wiring/`, [`envBranchedWire`](#envbranchedwire), dependency selection and the `Wire dependency` menu. |
| `@domain-first/handlers-rest` | The `New Handlers-REST Endpoint` generator and the OpenAPI and Orval integrations.                                |

The CLI does not install these packages. Use [Missing domain-first packages](#missing-domain-first-packages) to get the install command.

## Naming

Names are entered in lowercase kebab-case: `place-order`, `payment-gateway`.

| Form          | Rule                                                        | `place-order` |
| ------------- | ----------------------------------------------------------- | ------------- |
| File name     | The entered name as is                                      | `place-order` |
| Class name    | Hyphen-separated words, each capitalized, rest lowercased   | `PlaceOrder`  |
| Variable name | Class name with a lowercase first letter                    | `placeOrder`  |
| Title         | Hyphens replaced with spaces (test `describe` titles)       | `place order` |

Repeated hyphens are ignored in class and variable names. Names are not validated, except where stated: a name with uppercase letters or spaces ends up in paths as is.

**Nested names** (pages, widgets and their moves) may contain folders split by `/` or `\`:

| Form        | Rule                                             | `admin/panel/users` |
| ----------- | ------------------------------------------------ | ------------------- |
| Folders     | All segments except the last                     | `admin/panel`       |
| Folder name | The last segment                                 | `users`             |
| File name   | All segments joined with `-`                     | `admin-panel-users` |
| Class name  | All segments in class form, joined               | `AdminPanelUsers`   |

An empty name or a `.` / `..` segment is rejected.

## Bounded context generators

Every generator below writes into `<context>`. Unless stated otherwise:

- With tests, a `.spec.ts` file is created next to the class. See [Unit tests](#unit-tests).
- With `wire`, a factory `wire<Type>` is created under `<context>/wiring/<kind>/`, followed by [dependency selection](#dependency-selection).

### New bounded context

**Prompts**: `Name:` (required).

**Output**

| Path                                                  | Condition     | Content                                                        |
| ----------------------------------------------------- | ------------- | -------------------------------------------------------------- |
| `<rootFolder>/bounded-contexts/<name>/`               | Always        | Empty folder                                                   |
| `<rootFolder>/bounded-contexts/<name>/domain/errors/index.ts` | With `errors` | `export const <Name>Errors = errorNamespace('<name>')` |

### New Aggregate

Bounded contexts only.

**Prompts**

| Prompt                                                  | Default                                  | Condition                 |
| ------------------------------------------------------- | ---------------------------------------- | ------------------------- |
| `Aggregate name:`                                       |                                          |                           |
| `With Repository`                                       |                                          |                           |
| `Repository infrastructure implementation type:`        | `defaultPersistenceLayerImplementation`  | With repository           |
| `Add a test implementation for Repository`              |                                          | With repository           |
| `Test Repository infrastructure implementation type:`   | `in-memory`                              | With test implementation  |

**Output**

| Path                                                                   | Condition       | Content                                                                                 |
| ---------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------- |
| `domain/aggregates/<name>/<name>.aggregate-root.ts`                    | Always          | `class <Name>`; extends `domainType()` with `types`                                     |
| `domain/aggregates/<name>/index.ts`                                    | Always          | Barrel of the aggregate root, and of the repository contract when one is created        |
| `domain/aggregates/<name>/<name>.aggregate-root.spec.ts`               | With tests      | Construction test                                                                       |
| `domain/aggregates/<name>/<name>-repository.ts`                        | With repository | `abstract class <Name>Repository`                                                       |
| `infrastructure/repositories/<impl>/<impl>-<name>-repository.ts`       | With repository, per implementation | `class <Impl><Name>Repository implements <Name>Repository`          |
| `domain/aggregates/<name>/<name>-repository.spec.ts`                   | With repository and tests | Wiring test with `wire`, construction test of the primary implementation otherwise |
| `wiring/repositories/wire-<name>-repository.ts`                        | With repository and `wire` | `wire<Name>Repository` built with [`envBranchedWire`](#envbranchedwire) |

### New Entity and New Value Object

**Prompts**

| Prompt       | Condition                                                         |
| ------------ | ----------------------------------------------------------------- |
| `Name:`      |                                                                   |
| `Aggregate:` | Only when `domain/aggregates/` has subfolders. Choices: each aggregate and `No aggregate` |

**Output**

| Kind         | Folder with an aggregate                         | Folder without one         | File                        | Class    |
| ------------ | ------------------------------------------------ | -------------------------- | --------------------------- | -------- |
| Entity       | `domain/aggregates/<aggregate>/entities/`        | `domain/entities/`         | `<name>.entity.ts`          | `<Name>` |
| Value object | `domain/aggregates/<aggregate>/value-objects/`   | `domain/value-objects/`    | `<name>.value-object.ts`    | `<Name>` |

- The class extends `domainType()` with `types`.
- With an aggregate, `export * from './<entities|value-objects>/<file>'` is added to the aggregate's `index.ts` if missing.
- With tests, a construction test is created next to the file. No wiring is created.

### Errors

Requires `@domain-first/errors` in the project: the generated code imports from it. Works on `domain/errors/`.

**Prompts**: `Action:` with these choices, then a name.

| Choice                               | Prompt             | Change                                                                                                               |
| ------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `New error without namespace`        | `Error name:`      | Adds `export const <Name><Context>Error = <Context>Errors.define('<name>')` to `index.ts`                             |
| `New error in namespace <namespace>` | `Error name:`      | Adds `export const <Name><Namespace><Context>Error = <Namespace><Context>Errors.define('<name>')` to `<namespace>.ts` |
| `New namespace`                      | `Namespace name:`  | Creates `<namespace>.ts` with `<Namespace><Context>Errors = errorNamespace('<context>').subnamespace('<namespace>')` and adds `export * from './<namespace>'` to `index.ts` |

`<Context>` is the class form of the context folder name: `Shared` in the Shared Layer. One choice is listed per `.ts` file in `domain/errors/` other than `index.ts`. Lines are added only if missing, and an existing namespace file is never replaced.

### New Service

Available in every layer. **Prompts**: `Name:`.

| Layer          | Class file                                                  | Class                         | Wiring                                                                  |
| -------------- | ----------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| Domain         | `domain/services/<name>-domain-service.ts`                  | `<Name>DomainService`         | `wiring/domain-services/wire-<name>-domain-service.ts`                  |
| Application    | `application/services/<name>-application-service.ts`       | `<Name>ApplicationService`    | `wiring/application-services/wire-<name>-application-service.ts`        |
| Infrastructure | `infrastructure/services/<name>-infrastructure-service.ts`  | `<Name>InfrastructureService` | `wiring/infrastructure-services/wire-<name>-infrastructure-service.ts`  |
| Presentation   | `presentation/services/<name>-presentation-service.ts`      | `<Name>PresentationService`   | `wiring/presentation-services/wire-<name>-presentation-service.ts`      |

The class is empty. The factory is `wire<Class> = wireClass(<Class>, [])`.

### New Use Case

Bounded contexts only. **Prompts**: `Name:`.

| Path                                               | Condition  | Content                                                                         |
| -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| `application/use-cases/<name>-use-case.ts`         | Always     | `class <Name>UseCase`; with `handlers`, static schemas and `handle = defineHandler(...)` |
| `application/use-cases/<name>-use-case.spec.ts`    | With tests | Wiring or construction test                                                     |
| `wiring/use-cases/wire-<name>-use-case.ts`         | With `wire` | `wire<Name>UseCase`                                                            |

### New Command and New Query

Bounded contexts only. Both generators are identical except for the folder (`commands` / `queries`) and the class suffix (`Command` / `Query`). Below, `<kind>` is `commands` or `queries` and `<Suffix>` is `Command` or `Query`.

**Prompts**

| Prompt                                                   | Default                                 | Condition                |
| -------------------------------------------------------- | --------------------------------------- | ------------------------ |
| `Name:`                                                  |                                         |                          |
| `Command type` / `Query type`                            |                                         |                          |
| `<Suffix> infrastructure implementation type:`           | `defaultPersistenceLayerImplementation` | Execution                |
| `Add a test implementation for <Suffix>`                 |                                         | Execution                |
| `Test <Suffix> infrastructure implementation type:`      | `in-memory`                             | With test implementation |

**Execution (with infrastructure implementation)**

| Path                                                                 | Condition          | Content                                                                                 |
| -------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| `application/<kind>/execution/<name>-<suffix>.ts`                    | Always             | `abstract class <Name><Suffix>`; with `handlers`, static schemas and an abstract `handle: Handler<...>` |
| `infrastructure/<kind>/<impl>/<impl>-<name>-<suffix>.ts`             | Per implementation | `class <Impl><Name><Suffix> extends <Name><Suffix>`; with `handlers`, `handle = defineHandler(...)` |
| `application/<kind>/execution/<name>-<suffix>.spec.ts`               | With tests         | Wiring test with `wire`, construction test of the primary implementation otherwise      |
| `wiring/<kind>/wire-<name>-<suffix>.ts`                              | With `wire`        | `wire<Name><Suffix>` built with [`envBranchedWire`](#envbranchedwire)                   |

**Orchestrator (no infrastructure implementation)**

| Path                                                     | Condition   | Content                                                                    |
| -------------------------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| `application/<kind>/orchestration/<name>-<suffix>.ts`    | Always      | `class <Name><Suffix>`; with `handlers`, static schemas and `handle = defineHandler(...)` |
| `application/<kind>/orchestration/<name>-<suffix>.spec.ts` | With tests | Wiring or construction test                                               |
| `wiring/<kind>/wire-<name>-<suffix>.ts`                  | With `wire` | `wire<Name><Suffix> = wireClass(<Name><Suffix>, [])`                       |

### New Port

**Prompts**

| Prompt                              | Default | Condition                |
| ----------------------------------- | ------- | ------------------------ |
| `Name:`                             |         |                          |
| `Adapter implementation type:`      | `api`   |                          |
| `With test implementation`          |         |                          |
| `Test adapter implementation type:` | `mock`  | With test implementation |

**Output**

| Path                                                               | Condition          | Content                                                            |
| ------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------ |
| `application/ports/<name>.ts`                                      | Always             | `abstract class <Name>`                                            |
| `infrastructure/application-adapters/<impl>/<impl>-<name>.ts`      | Per implementation | `class <Impl><Name> extends <Name>`                                |
| `application/ports/<name>.spec.ts`                                 | With tests         | Wiring test with `wire`, construction test of the adapter otherwise |
| `wiring/application-ports/wire-<name>.ts`                          | With `wire`        | `wire<Name>` built with [`envBranchedWire`](#envbranchedwire)      |

### New Handlers-REST Endpoint

Bounded contexts only, with `handlers-rest`.

**Prompts**

| Prompt                            | Condition                                     | Choices / value                                                              |
| --------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `Controller:`                     |                                               | Subfolders of `presentation/rest/` and `New controller`                      |
| `Name:`                           | New controller                                | Controller name                                                              |
| `Method:`                         |                                               | `get`, `post`, `patch`, `delete`, `put`                                      |
| `Relative path (split by "/"):`   |                                               | Path below the controller; may be empty. `:param` segments are path parameters |
| `Handler:`                        | With `wire` and at least one candidate        | Wired queries, commands and use cases of the context                         |

**Output**

| Path                                                                        | Condition                       | Content                                                                 |
| --------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| `presentation/rest/<controller>/<path>/<METHOD>.ts`                         | Always                          | Endpoint class                                                          |
| `wiring/presentation/rest/<controller>/wire-<controller>-<path>-<method>-endpoint.ts` | With `wire`           | `wire<Class>`, with the chosen generator and handler factories          |
| `wiring/presentation/rest/<controller>/index.ts`                            | With `wire`                     | Re-exports of the controller's endpoint factories                       |
| `wiring/presentation/rest/index.ts`                                         | With `wire`, new controller     | `export * from './<controller>'` added                                   |
| `<rootFolder>/presentation/rest/wires.ts`                                   | With `wire`, new controller     | Re-export of the controller's factories added                            |
| `<rootFolder>/presentation/rest/index.ts`                                   | With `wire`, created once       | `export const restHandlers = Object.values(wires).map(x => x().handle)` |

- Path parameters are named `_param_` in folder and class names, since `:` is not allowed there. The route keeps `:param`.
- The class name joins the controller, path segments, method and `Endpoint` in class form: `orders/recent` with `get` gives `OrdersRecentGetEndpoint`.
- The route is `{ method, path: ['<context>', '<controller>', ...segments] }`, and the tag is `'<context>: <controller>'`.
- The constructor takes `endpointGenerator: RestEndpointGeneratorPresentationService`, the [endpoint generator](#endpoint-generator) of the Shared Layer, and `handler`, the chosen handler or `never` without one. `get handle()` calls `this.endpointGenerator(this.handler.handle, { route, tags })`, which doesn't compile on purpose: the user picks a generating getter of the service, e.g. `this.endpointGenerator.withoutGuards(...)`.
- In projects without the generator file, the generator type is `EndpointGenerator` from `@domain-first/handlers-rest` and the wire takes no dependencies.

#### Endpoint generator

`RestEndpointGeneratorPresentationService`, created during [initialization](#initialization) with `handlers-rest`, is the one generator every endpoint uses.

| Member                        | Kind            | Content                                                                                      |
| ----------------------------- | --------------- | -------------------------------------------------------------------------------------------- |
| `adapter`                     | Module constant | `Adapter<any[], any>`, declared above the class; `undefined` until replaced, used by the class through closure. With the Next adapter: `import { nextAdapter } from '@domain-first/handlers-next'` instead, and the getters pass `nextAdapter` |
| `defaultClientRequestErrors`  | Private getter  | Default `400` checks: `RequestParsingError` and `InputMappingError`; declared first in the class |
| `withoutGuards`               | Getter          | `createEndpoint({ errorStatuses: { 400: { checks: this.defaultClientRequestErrors, description: 'Invalid request' } } })(adapter) as EndpointGenerator` |

Further generating methods are getters typed as `EndpointGenerator`; they spread the default checks into their own: `checks: [...this.defaultClientRequestErrors, ...]`.

**Example**

Context `sales`, controller `orders`, method `get`, path `recent`:

```text
src/bounded-contexts/sales/presentation/rest/orders/recent/GET.ts           # route /sales/orders/recent
src/bounded-contexts/sales/wiring/presentation/rest/orders/wire-orders-recent-get-endpoint.ts
```

## Wiring

All of this section applies only with `wire`.

### `envBranchedWire`

Created during [initialization](#initialization) in `<rootFolder>/shared/wiring/env-branched-wire.ts`:

```ts
import { branchedWire } from '@domain-first/wire'

export const envBranchedWire = branchedWire(() => {
    return process.env.NODE_ENV ?? 'development' as 'test' | 'development' | 'production'
});
```

Repositories, execution commands, execution queries and ports wire every implementation separately and select one with it:

| `NODE_ENV`               | Implementation                                                |
| ------------------------ | ------------------------------------------------------------- |
| `test`                   | The test implementation if one was created, otherwise the primary one |
| `development` or unset   | The primary implementation                                    |
| `production`             | The primary implementation                                    |

Any other value makes the wire throw `NonExistingBranchError` from `@domain-first/wire`.

### Dependency selection

The last step of every generator that creates a factory, except REST endpoints, which take the [endpoint generator](#endpoint-generator) and select their handler [themselves](#new-handlers-rest-endpoint).

- Candidates are the wired modules of the context and of the Shared Layer, the latter labelled `(shared)`. A module is any `wire*` factory found under `wiring/`.
- Candidates are filtered by the [dependency rules](#dependency-rules), excluding the module itself and modules it already depends on.
- Choices are grouped by kind: Repositories, Domain services, Ports, Application services, Queries, Commands, Use cases, Infrastructure services, Presentation services.
- An env-branched factory asks once per implementation (`Dependencies for PrismaOrderRepository:`). Infrastructure modules whose file name contains the implementation label as whole words are listed first under **Suggested**: `prisma-infrastructure-service` for `prisma`, `in-memory-db-infrastructure-service` for `in-memory`.
- When there are no candidates, nothing is asked.

Each selected module is added, in order:

- to the dependency list of the factory, with its import;
- to the constructor of the class, as `private readonly <typeVar>: <Type>`, with an `import type`.

### Wire dependency

`Layer: Wire dependency` adds dependencies to an existing module of the selected context or the Shared Layer.

1. `Module:` lists the wired modules. An env-branched module is listed once per implementation: `OrderRepository (prisma)`, `OrderRepository (in-memory)`. REST endpoints are not listed.
2. The [dependency selection](#dependency-selection) runs for the chosen module or implementation only.

Prints `No wired modules here yet.` when there are no modules, and `No dependencies available for this module.` when there is nothing to add.

### Dependency rules

The layer of a candidate is where its type lives. The layer of a consumer is where its implementation lives: repository, execution command, execution query and port implementations belong to infrastructure.

| Consumer layer | Can depend on             |
| -------------- | ------------------------- |
| Domain         | Domain                    |
| Application    | Domain, application       |
| Infrastructure | Domain, infrastructure    |
| Presentation   | Application, presentation |

Narrower rules on top of the layer rules:

| Consumer                         | Rule                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Application service              | From the application layer, only ports                                       |
| Use case                         | No use cases                                                                 |
| Repository implementation        | No repositories                                                              |
| Execution command or query       | No commands or queries                                                       |
| Orchestration command or query   | From the application layer, only execution commands and queries              |

REST endpoints are never offered as dependencies.

## Unit tests

With tests, the generators create one `.spec.ts` per class:

- It imports `describe`, `test`, `expect` and `beforeEach` from `testingLibrary`.
- With `wire`, it builds the module through its factory (`can be wired`). Otherwise it calls the constructor; for modules with implementations, the primary implementation's constructor (`can be created via constructor`).
- It only checks that the instance is defined. Business tests are yours to add.

Repository, command, query and port tests reference wiring factories with `wire`. Without it, they reference the primary implementation directly.

## React modules

`Scaffold React module` is shown when `useReact` is `true`. Modules are written to `<rootFolder>/presentation/react`, `react/` below. None of them is wired or tested.

### New page

**Prompts**: `Provide name (folders split by "/"):` (a [nested name](#naming)).

**Output**: `react/pages/<folders>/<file>-page.tsx` with `type <Name>PageProps = {}` and `const <Name>Page: FC<<Name>PageProps>`.

### New widget

**Prompts**: `Name (folders split by "/"):` (a [nested name](#naming)), then `Type:`.

Files are created in `react/widgets/<folders>/<folder-name>/`, with `<w>` standing for `<file>-widget`:

| Type                | Files                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `monolithic`        | `index.ts`, `<w>.tsx` with props and rendering                                                             |
| `with separated ui` | `index.ts`, `<w>.tsx`, `types.ts`, `ui/<w>-ui.tsx`, `hooks/use-<file>-ui-model.ts`; with `storybookFramework`, `ui/<w>-ui.stories.tsx` |
| `headless`          | `index.ts`, `<w>.tsx`, `types.ts`, `hooks/use-<file>-ui-model.ts`; the rendering component is passed as the `UI` prop |

Code names: `<Name>Widget`, `<Name>WidgetProps`, `<Name>WidgetUIProps`, `use<Name>UIModel`. The story title is `Widgets/<Segment>/…`: `Widgets/Admin/Panel/Users` for `admin/panel/users`.

### New UI-kit component

**Prompts**: `Name:`.

**Output** in `react/ui-kit/<name>/`: `index.ts`, `<name>.tsx` with `type <Name>Props = {}` and `const <Name>: FC<<Name>Props>`; with `storybookFramework`, `<name>.stories.tsx` titled `UI-kit/<Name>`.

### New shared hook

**Prompts**: `Name without "use" (e.g. debounce):`. A leading `use-` is removed.

**Output**: `react/hooks/use-<name>.ts` with `const use<Name> = () => ({})`.

### Move or rename page / widget

**Prompts**

| Prompt                              | Default          |
| ----------------------------------- | ---------------- |
| `Page:` / `Widget:`                 |                  |
| `New name (folders split by "/"):`  | The current name |
| `Apply?`                            | Yes              |

**Behavior**

- Lists pages and widgets generated by `df-ps`. Prints `No pages generated by df-ps were found.` (or `widgets`) when there are none.
- A widget moves with its whole folder, assets included. A page moves with the files next to it that share its name, such as `<file>-page.module.css`.
- File names, `<Name>Page`, `<Name>Widget…`, `use<Name>UIModel` and generated story titles follow the new name.
- Imports of the module are updated across the project: relative imports and `tsconfig.json` `paths` aliases such as `@/`. Files importing it through barrels (`export * from`, `export { … } from`) get the renamed names too. Relative imports inside the module are adjusted to its new location.
- The CLI prints the files to move and the files to update, then asks `Apply?`. Folders left empty are removed.
- Entering the current name renames files created before file names used the whole path: `pages/admin/users-page.tsx` becomes `pages/admin/admin-users-page.tsx`.
- Prints `Nothing to change.` when nothing would change. Answering No prints `Cancelled: nothing was written.`

## Integrations

`Add integration` changes project files and prints next steps. No integration installs packages, runs scripts or connects to a database. After the changes are written, the CLI prints install commands under `Run these commands to install the required dependencies:` and other notes under `Additional information:`. Install commands omit version constraints; declared dependencies are kept.

| Item                             | Listed when                                  |
| -------------------------------- | -------------------------------------------- |
| `Storybook (React + Vite)`       | Always                                       |
| `Prisma 8 (PostgreSQL, RC)`      | Always                                       |
| `Vitest`                         | Always                                       |
| `Playwright`                     | Always                                       |
| `OpenAPI`                        | With `handlers-rest`                         |
| `Orval (React Query client)`     | With `handlers-rest` and `useReact`          |
| `Missing domain-first packages`  | Always                                       |

### Storybook (React + Vite)

| Item           | Value                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Prompts        | `Configure React scaffolding with @storybook/react-vite?` (default: No), only when `useReact` is off or another `storybookFramework` is set |
| Files          | `<rootFolder>/presentation/react/.storybook/main.ts`, `preview.ts`                                                                       |
| Configuration  | `useReact: true`, `storybookFramework: "@storybook/react-vite"`                                                                           |
| Scripts        | `storybook`, `build-storybook`                                                                                                            |
| `.gitignore`   | `<rootFolder>/presentation/react/storybook-static`                                                                                        |
| Install        | `--save-dev storybook @storybook/react-vite vite @vitejs/plugin-react` and `react react-dom`, each when missing                           |

```json
{
    "storybook": "storybook dev -p 6006 -c \"src/presentation/react/.storybook\"",
    "build-storybook": "storybook build -c \"src/presentation/react/.storybook\" -o \"src/presentation/react/storybook-static\""
}
```

`main.ts` uses relative story paths and sets the Vite alias `@` to the project root, computed at runtime from the config location. Add project CSS to `preview.ts`.

### Prisma 8 (PostgreSQL, RC)

| Item           | Value                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Prompts        | `Create shared Prisma infrastructure service?` (default: Yes); `Use prisma as the default persistence implementation?` (default: No) |
| Files          | `<rootFolder>/shared/infrastructure/prisma/prisma.config.ts`; `contract.prisma` if missing                |
| Optional files | `<rootFolder>/shared/infrastructure/services/prisma-infrastructure-service.ts`; with `wire`, its factory  |
| Configuration  | `defaultPersistenceLayerImplementation: "prisma"` when confirmed                                         |
| Scripts        | `prisma:emit`, `prisma:migration:plan`, `prisma:migration:apply`                                          |
| Install        | `prisma`, `@prisma/cli-engine`, `@prisma/orm-postgres`, `temporal-polyfill`, `dotenv` when missing        |
| Notes          | Add `!<rootFolder>/shared/infrastructure/prisma` to linter ignores                                        |

| Script                    | Action                                                    |
| ------------------------- | --------------------------------------------------------- |
| `prisma:emit`             | Emit `contract.json` and `contract.d.ts`                   |
| `prisma:migration:plan`   | Emit the contract, then plan a migration                   |
| `prisma:migration:apply`  | Apply migrations and advance the `db` ref                  |

`PrismaInfrastructureService` exposes `orm`, uses the Temporal polyfill and reuses the client across development hot reloads. An existing `contract.prisma` is never replaced. Requirements: `DATABASE_URL`, Node.js 22.18+, TypeScript 5.9+, ESM and JSON imports. Run `prisma:emit` before compiling the service. This is a preset for Prisma 8 RC, not a Prisma 7 migration tool.

### Vitest

| Item           | Value                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| Prompts        | `Replace testing library "<current>" with vitest for generated tests?` (default: No), only when another library is set |
| Files          | `vitest.config.ts` in the project root                                                                           |
| Configuration  | `testingLibrary: "vitest"`                                                                                       |
| Scripts        | `test`, `test:coverage`                                                                                          |
| `.gitignore`   | `/coverage/`                                                                                                     |
| Install        | `vitest`, `@vitest/coverage-v8` when missing                                                                    |

```json
{
    "test": "vitest run --reporter=dot --silent=passed-only",
    "test:coverage": "vitest run --coverage --reporter=dot --silent=passed-only"
}
```

The config uses `resolve.tsconfigPaths` (Vite 8+) and V8 coverage of `<rootFolder>/bounded-contexts` and `<rootFolder>/shared`, excluding specs, infrastructure, REST presentation and wiring. `specs/e2e` is excluded from tests. When `@domain-first/handlers-next` is declared, it is inlined so its `next/headers` import resolves.

### Playwright

| Item           | Value                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Files          | `playwright.config.ts` in the project root; `specs/e2e/home/home.e2e.spec.ts` and `specs/e2e/home/README.MD` if missing |
| Scripts        | `test:e2e`: `playwright test`                                                                                           |
| `.gitignore`   | `/test-results/`, `/playwright-report/`, `/blob-report/`, `/playwright/.cache/`, `/playwright/.auth/`                   |
| Install        | `npm install --save-dev @playwright/test` when missing; `npx playwright install --with-deps`                           |

The config sets `testDir: './specs/e2e'`, an HTML reporter, traces on retry, screenshots and videos on failure, and projects for Chromium, Firefox, WebKit, Mobile Chrome and Mobile Safari. The web server runs `npm run dev` at `http://localhost:3000` and is reused outside CI.

### OpenAPI

Listed with `handlers-rest`.

| Item     | Value                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Prompts  | `Route prefix the REST handlers are served under:` (default `/api`); `OpenAPI document path:` (default `public/openapi.json` when `next` is declared, otherwise `openapi.json`); `Fill operationId, summary and description from the endpoint logic TSDoc?` (default: Yes) |
| Files    | `scripts/generate-openapi.ts`; with TSDoc extraction, `scripts/extract-open-api-data-from-endpoint.ts`                        |
| Scripts  | `openapi`: `tsx --env-file-if-exists=.env scripts/generate-openapi.ts`                                                        |
| Install  | `@domain-first/handlers-rest` and `tsx` when missing; with TSDoc extraction, `ts-morph` and `@microsoft/tsdoc`               |
| Notes    | A reminder when `<rootFolder>/presentation/rest/index.ts` does not exist yet                                                 |

The script passes `restHandlers` from `<rootFolder>/presentation/rest` to `generateOpenAPI`. The document title is the package name in title case followed by `API`. `.env` is loaded because the wiring may read the environment.

With TSDoc extraction, each endpoint's metadata is filled from the class passed as `this.handler` (the first argument of the generator call):

| OpenAPI field  | Source                                                              |
| -------------- | ------------------------------------------------------------------- |
| `operationId`  | The handler class name                                              |
| `summary`      | The TSDoc text before the first block tag                           |
| `description`  | The `@description` block tag                                        |

Metadata set explicitly on an endpoint takes precedence.

### Orval (React Query client)

Listed with `handlers-rest` and `useReact`.

| Item         | Value                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| Prompts      | `OpenAPI document path:`; the default is read from `scripts/generate-openapi.ts`                               |
| Files        | Under `<rootFolder>/presentation/react/data-layer/`: `orval.config.ts`; `api-client/mutator.ts` and `query-provider.tsx` if missing |
| Scripts      | `client:orval`: `orval --config "<rootFolder>/presentation/react/data-layer/orval.config.ts"`                 |
| `.gitignore` | `data-layer/orval/`                                                                                           |
| Install      | `@tanstack/react-query`; `--save-dev orval` when missing                                                      |

| File                  | Content                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `orval.config.ts`     | TanStack Query v5 hooks on `fetch`, split by tags into `data-layer/orval`, schemas in its `model` folder. With `next`, request URLs start with `NEXT_PUBLIC_API_BASE_URL` |
| `api-client/mutator.ts` | `customInstance`, used by every request. Throws `ApiError` with the status and the parsed body on non-2xx responses |
| `query-provider.tsx`  | `QueryProvider` with one `QueryClient` per browser session                                                    |

### Missing domain-first packages

Compares `domainFirstPackages` with `dependencies`, `devDependencies` and `optionalDependencies` of `package.json` and prints one `npm i` command for the missing packages. Prints nothing when none are missing. `node_modules` is not checked, and no files are changed.

### Package scripts

Integrations that add scripts to `package.json` handle conflicts the same way:

- A script with the same name and command is left as is.
- A script with the same name and another command asks `Script "<name>" already exists: <command>` with `Keep existing`, `Replace` and `Use another name`. A new name must be unused and contain only letters, numbers, `:`, `_` and `-`.
- Other scripts and fields of `package.json` and its indentation are preserved.

Generated config files identical to existing ones are skipped. `.gitignore` entries are added only if missing.

## `df-skills`

Copies the agent skills shipped in the package's `skills/` folder.

```bash
npx df-skills [options]
```

| Option         | Effect                                                     |
| -------------- | ---------------------------------------------------------- |
| `--claude`     | Install for Claude Code into `.claude/skills`              |
| `--codex`      | Install for Codex into `.agents/skills`                    |
| `--global`     | Install into the home directory instead of the current one |
| `-h`, `--help` | Print help and exit                                        |

**Behavior**

- Without `--claude` and `--codex`, it asks `Install skills for` (Claude Code is preselected, at least one is required) and, without `--global`, `Install into` (this project or the home directory).
- Every skill folder is replaced as a whole, so files removed upstream disappear. It prints `added` or `updated` per skill.
- Unlike `df-ps`, it uses the current directory, not the project root, and writes immediately.

| Skill                   | Purpose                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `df-ps-plan-feature`    | Turns a feature request into a plan of bounded contexts and components                   |
| `df-ps-scaffold`        | Generates components with `df-ps`                                                         |
| `df-ps-implement`       | Fills in the generated code                                                              |
| `df-ps-project-scripts` | Rules for running project scripts such as Prisma emit and migrations                      |

## Runtime semantics

| Topic             | Behavior                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| One operation     | Each `df-ps` run performs one operation. Run it again for the next one.                                                          |
| Staging           | Files, folders, moves and deletions are staged in memory and written after the operation's last prompt.                          |
| Overwrites        | If staged files would replace existing ones, the CLI lists them and asks `Overwrite them?` (default: No). No discards everything and prints `Cancelled: nothing was written.` |
| Additions         | Lines added to existing barrels, error files, wiring indexes and `.gitignore` are not overwrites and are never duplicated.       |
| Edits             | Constructor and factory edits during dependency selection change existing files without an overwrite question.                  |
| Interruption      | Interrupting at any prompt leaves the project unchanged.                                                                        |
| Folders           | Missing folders are created.                                                                                                     |
| State             | The configuration file is the only state. Bounded contexts, aggregates, error namespaces, controllers, wired modules and React modules are found by scanning the folders on each run. |
| Installation      | No command installs packages or runs project scripts.                                                                            |
