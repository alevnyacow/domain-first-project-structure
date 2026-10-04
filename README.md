# @domain-first/project-structure

**Spend less time setting up files. Spend more time building your domain.**

An interactive CLI for growing TypeScript applications around business domains. Scaffold bounded contexts, aggregates, use cases, commands, queries, adapters, REST endpoints, and React modules with a consistent structure.

Choose what you need, answer a few prompts, and get the source files, optional test skeletons, and wiring to start implementing the feature.

```bash
npm install --save-dev @domain-first/project-structure
npx df-ps
```

[Quick start](#quick-start) · [Project structure](#project-structure) · [Generators](#generators) · [Configuration](#configuration) · [Example workflow](#example-workflow)

## Why use it?

Adding an aggregate often means adding a repository contract, infrastructure implementations, tests, and dependency wiring too. Repeating that setup by hand takes time and lets conventions drift.

`df-ps` turns those recurring decisions into a guided workflow:

- **Keep the team consistent.** Give each kind of component a predictable home, filename, and class name.
- **Grow feature by feature.** Add a bounded context or a single component as the application evolves.
- **Keep business code organized.** Group code by bounded context, with domain, application, infrastructure, and presentation layers inside it.
- **Prepare for multiple implementations.** Generate primary and test implementations of repositories, execution commands, queries, and application ports.
- **Use the integrations you need.** Enable templates for the `@domain-first` packages in your project and optional React scaffolding.

The generated files belong to your project. Fill in the business rules, schemas, dependencies, and integration code as you would with any other source file.

## Quick start

Run the CLI inside a project that has a `package.json`. For a new project, create one with `npm init -y` first. Use Node.js 22.13+ within the Node 22 release line, or Node.js 24+.

### 1. Install and initialize

```bash
npm install --save-dev @domain-first/project-structure
npx df-ps
```

You can also run it without adding it as a development dependency:

```bash
npm exec --package=@domain-first/project-structure -- df-ps
```

On the first run, the CLI asks for:

| Setting                            | What to enter                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Root folder                        | The source directory, such as `src` or `src/server`. Default: `src`.                                        |
| `@domain-first` packages           | The integrations to use in generated templates.                                                             |
| Default persistence implementation | A label such as `prisma`, used as the suggested implementation for execution commands and queries.          |
| React                              | Whether to show the React module menu.                                                                      |
| Unit tests                         | Whether to generate tests, and which module to import test helpers from. Suggested module: `vitest`.        |

Setup writes `domain-first.project-structure.config.json` beside your `package.json` and creates shared helpers for the selected `wire` and `errors` integrations. That first run then exits.

The CLI uses the nearest `package.json` found by walking up from the current directory. In a monorepo, run it inside the package you want to scaffold.

### 2. Create a bounded context

Run `npx df-ps` again, choose **Scaffold new bounded context**, and enter a name such as `sales`.

### 3. Add a component

Run `npx df-ps`, choose **Bounded Context: sales**, select a layer, and choose a generator. For example:

```text
Bounded Context: sales → Domain → New Aggregate
```

Each invocation performs one scaffolding operation. Run the command again to add the next component. Folders are created as needed.

## Project structure

A bounded context groups a business area and its implementation. Within it, each layer has a specific role:

| Location          | Purpose                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `domain/`         | Aggregates, repository contracts, domain services, and business errors.                               |
| `application/`    | Use cases, commands, queries, ports, and application services.                                        |
| `infrastructure/` | Concrete repositories, adapters, execution handlers, and infrastructure services.                     |
| `presentation/`   | REST endpoints and presentation services.                                                             |
| `wiring/`         | Factories that construct components and select implementations, when `@domain-first/wire` is enabled. |

The **Shared Layer** menu provides cross-context errors, entities and value objects, application ports, and application, infrastructure, and presentation services under `<rootFolder>/shared`.

A project using handler and wiring integrations can grow into this structure:

```text
src/
├── bounded-contexts/
│   └── sales/
│       ├── domain/
│       │   ├── aggregates/order/
│       │   ├── errors/
│       │   └── services/
│       ├── application/
│       │   ├── commands/          # execution/ and orchestration/
│       │   ├── queries/           # execution/ and orchestration/
│       │   ├── ports/
│       │   ├── services/
│       │   └── use-cases/
│       ├── infrastructure/
│       │   ├── application-adapters/
│       │   ├── commands/
│       │   ├── queries/
│       │   ├── repositories/
│       │   └── services/
│       ├── presentation/
│       │   ├── rest/
│       │   └── services/
│       └── wiring/
├── shared/
└── presentation/
    ├── rest/
    └── react/
        ├── pages/
        ├── widgets/
        ├── ui-kit/
        └── hooks/
```

This is an example of the accumulated output; creating a context alone creates its directory and, when enabled, its error namespace.

## Generators

Choose a bounded context, then a layer:

| Layer / menu option                       | Generated output                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain → New Aggregate                    | Aggregate root and barrel export; optional repository contract, primary and test implementations, tests, and repository wiring.                                    |
| Domain → New Entity / New Value Object    | Entity or value object class with tests, in the `entities/` or `value-objects/` folder of a chosen aggregate (exported from its barrel) or of the context's `domain/`. Also in the Shared Layer, under `shared/domain/`. |
| Domain → Errors                           | Errors in the context namespace, nested namespaces, and exports. Uses `@domain-first/errors`.                                                                      |
| Domain → New Service                      | Domain service class, with optional tests and wiring.                                                                                                              |
| Application → New Use Case                | Use case class; handler schemas and `handle` when enabled; optional tests and wiring.                                                                              |
| Application → New Command / New Query     | Execution or orchestration templates, with optional tests and wiring.                                                                                              |
| Application → New Port                    | Abstract port and an adapter implementation, with an optional test adapter, tests, and wiring.                                                                     |
| Application → New Service                 | Application service class, with optional tests and wiring.                                                                                                         |
| Infrastructure → New Service              | Infrastructure service class, with optional tests and wiring.                                                                                                      |
| Presentation → New Service                | Presentation service class, with optional tests and wiring.                                                                                                        |
| Presentation → New Handlers-REST Endpoint | Endpoint class for a controller, method, and relative path; wiring and handler exports when enabled. Requires `@domain-first/handlers-rest` to appear in the menu. |

### Commands and queries

Both generators offer two modes:

- **Execution (with infrastructure implementation):** creates an abstract application contract and a concrete implementation under `infrastructure/commands/<implementation>` or `infrastructure/queries/<implementation>`. You can add a separate implementation for tests.
- **Orchestrator (no infrastructure implementation):** creates an application class under `application/commands/orchestration` or `application/queries/orchestration`, ready for coordinating other operations.

With `@domain-first/handlers`, templates include input/output schemas and a typed handler contract or `defineHandler` implementation. Execution contracts go in the corresponding `execution/` directory; without that integration, they go directly in `application/commands` or `application/queries`.

### Wiring and tests

With `@domain-first/wire`, generators create `wireClass` factories. Repositories, execution commands, queries, and ports use the shared `envBranchedWire` helper to choose an implementation based on `NODE_ENV`:

| Environment   | Implementation                                                               |
| ------------- | ---------------------------------------------------------------------------- |
| `test`        | The test implementation, if requested; otherwise the primary implementation. |
| `development` | The primary implementation. Also used when `NODE_ENV` is unset.              |
| `production`  | The primary implementation.                                                  |

Implementation names such as `prisma`, `api`, `in-memory`, and `mock` determine names and locations for generated classes. Add the database queries, API calls, or in-memory behavior yourself. Fill in the dependency lists in wiring factories as you implement constructors.

When `testingLibrary` is configured, supported generators always add `.spec.ts` files. These start with construction or wiring checks; extend them with tests for your business behavior. Repository, command, query, and port test templates reference wiring factories, so use the wiring integration or adapt those tests to your own construction setup.

### REST endpoints

Select an existing controller or create one, choose `get`, `post`, `patch`, `delete`, or `put`, and enter a relative path. For example, context `sales`, controller `orders`, path `recent`, and method `get` produce:

```text
src/bounded-contexts/sales/presentation/rest/orders/recent/GET.ts
```

The route metadata uses `/sales/orders/recent`. Connect the endpoint to an application handler and provide its `EndpointGenerator`; the generated handler dependency starts as a `never` placeholder.

With wiring enabled, the generator also adds endpoint factories and exports collected as `restHandlers` in `<rootFolder>/presentation/rest/index.ts`. Connect these handlers to your HTTP server.

### React modules

Enable `useReact` and choose **Scaffold React module** from the main menu. Modules are created under `<rootFolder>/presentation/react`.

| Generator                      | Output                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| New page                       | `pages/<name>-page.tsx` with a typed props object and a component.                                         |
| New widget → monolithic        | `widgets/<name>/<name>-widget.tsx` with props and rendering in one file, re-exported from `index.ts`.      |
| New widget → with separated ui | `<name>-widget.tsx`, `types.ts`, `ui/<name>-widget-ui.tsx`, `hooks/use-<name>-ui-model.ts`, and `index.ts`; with `storybookFramework`, also `ui/<name>-widget-ui.stories.tsx`. |
| New widget → headless          | `<name>-widget.tsx`, types, a UI-model hook, and `index.ts`; the rendering component is supplied through the `UI` prop. |
| New UI-kit component           | `ui-kit/<name>/<name>.tsx` with a typed props object and a component, re-exported from `index.ts`; with `storybookFramework`, also `<name>.stories.tsx`. |
| New shared hook                | `hooks/use-<name>.ts` with an app-wide hook, such as `use-debounce`; a leading `use-` in the name is not repeated. |

## Configuration

The project configuration is stored in `domain-first.project-structure.config.json`. Commit it to share generation settings with your team. For example:

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

| Field                                   | Effect                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rootFolder`                            | Base path for generated source, relative to the project root.                                                                                                 |
| `domainFirstPackages`                   | Explicit list of integrations used by templates. An empty array selects basic class templates where supported.                                                |
| `defaultPersistenceLayerImplementation` | Suggested implementation label for execution commands and queries.                                                                                            |
| `useReact`                              | Shows or hides the React module menu.                                                                                                                         |
| `storybookFramework`                    | Storybook framework package imported by generated stories (`Meta`, `StoryObj`), e.g. `@storybook/react-vite`. Omit this field to skip stories for UI-kit components and widget UI. Asked during setup only when React is enabled. |
| `testingLibrary`                        | Module imported by generated tests. Omit this field to disable test generation. Templates expect helpers such as `describe`, `test`, `expect`, and `beforeEach`. |

### Package integrations

| Package                       | What it enables                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `@domain-first/types`         | Aggregate roots extending `domainType()`.                                                                          |
| `@domain-first/errors`        | Context and shared error namespaces initialized during setup/context creation. Error generation uses this package. |
| `@domain-first/handlers`      | Handler contracts, `defineHandler`, and input/output schema placeholders for use cases, commands, and queries.     |
| `@domain-first/wire`          | Construction factories and environment-based implementation selection.                                             |
| `@domain-first/handlers-rest` | The REST endpoint generator using `EndpointGenerator`.                                                             |

Select the packages you intend to use and install them in your application separately. The CLI reads this list from configuration; it does not detect or install dependencies. React and your testing library also need their own project setup.

You can edit the configuration for future runs. Existing files are left as they are when you edit settings; enabling `wire` or `errors` later also requires adding the shared helpers that initial setup would create, plus context error namespaces where needed.

## Example workflow

To start an order feature, enable `@domain-first/wire` during initialization and run `npx df-ps` for each step:

1. Choose **Scaffold new bounded context** and name it `sales`.
2. Choose **Bounded Context: sales → Domain → New Aggregate**, name it `order`, and add a repository with `prisma` and an `in-memory` test implementation.
3. Choose **Application → New Use Case** within `sales` and name it `place-order`.
4. Implement the aggregate's rules, repository operations, and use case; connect their dependencies in the generated wiring files.

The key files from these selections are:

```text
src/bounded-contexts/sales/
├── domain/aggregates/order/
│   ├── index.ts
│   ├── order.aggregate-root.ts
│   └── order-repository.ts
├── application/use-cases/
│   └── place-order-use-case.ts
├── infrastructure/repositories/
│   ├── prisma/prisma-order-repository.ts
│   └── in-memory/in-memory-order-repository.ts
└── wiring/
    ├── repositories/wire-order-repository.ts
    └── use-cases/wire-place-order-use-case.ts
```

Use lowercase kebab-case for entered names, such as `place-order` and `payment-gateway`. Names are used in paths, and class and variable names are derived from their hyphen-separated words: `place-order` becomes `PlaceOrderUseCase` for a use case.

Generation writes files directly and can overwrite matching filenames without confirmation. Use a new name for a new component, and review the generated changes before continuing implementation.

## License

[MIT](./LICENSE)
