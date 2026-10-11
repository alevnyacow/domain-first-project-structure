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

The **Shared Layer** menu provides cross-context errors, entities and value objects, application ports, and domain, application, infrastructure, and presentation services under `<rootFolder>/shared`.

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

Implementation names such as `prisma`, `api`, `in-memory`, and `mock` determine names and locations for generated classes. Add the database queries, API calls, or in-memory behavior yourself. As the last step, generators that create a wiring factory offer to pick its dependencies from wired modules of the same bounded context and the Shared Layer. Each selected module is added to the factory's dependency list and to the constructor, for example `private readonly userRepository: UserRepository`. Environment-branched factories (repositories, execution commands and queries, ports) wire each implementation in isolation: you pick dependencies separately for each one, for example for `PrismaUserRepository` and then for `InMemoryUserRepository`. Each list starts with a **Suggested** group when infrastructure modules match the implementation name: `prisma-infrastructure-service` for a `prisma` implementation, or `in-memory-db-infrastructure-service` for an `in-memory` one. To add dependencies to an existing module later, select **Wire dependency** in the bounded context or Shared Layer menu. Environment-branched modules are listed there once per implementation, such as `UserRepository (prisma)` and `UserRepository (in-memory)`, and only the chosen one is changed.

The list depends on the layer of the class being built:

| Layer          | Can depend on                                |
| -------------- | -------------------------------------------- |
| Domain         | Domain                                       |
| Application    | Domain, application                          |
| Infrastructure | Domain, infrastructure                       |
| Presentation   | Application, presentation                    |

Some kinds of modules have narrower rules. From the application layer, application services can use only ports. Use cases can't use other use cases, and repository implementations can't use other repositories. Execution commands and queries can't use other commands or queries. From the application layer, orchestration commands and queries can use only execution commands and queries. Repository, execution command, execution query, and port implementations belong to infrastructure: they implement application modules but can't take them as dependencies. REST endpoints are not offered as dependencies. Their dependencies are chosen when they are generated (see REST endpoints) and are not available in **Wire dependency**.

When `testingLibrary` is configured, supported generators always add `.spec.ts` files. These start with construction or wiring checks; extend them with tests for your business behavior. Repository, command, query, and port test templates reference wiring factories, so use the wiring integration or adapt those tests to your own construction setup.

### REST endpoints

Select an existing controller or create one, choose `get`, `post`, `patch`, `delete`, or `put`, and enter a relative path. For example, context `sales`, controller `orders`, path `recent`, and method `get` produce:

```text
src/bounded-contexts/sales/presentation/rest/orders/recent/GET.ts
```

The route metadata uses `/sales/orders/recent`. With `@domain-first/wire`, the generator then asks for the endpoint generator, picked from presentation services of the bounded context and the Shared Layer (services with `endpoint` in the name are suggested first), and for the handler, picked from queries, commands, and use cases of the bounded context. The endpoint's constructor gets the chosen types, and its wiring factory gets their factories. In `get handle()`, call the generating method of the chosen service yourself, for example `this.endpointGenerator.generate(...)` for `readonly generate = createEndpoint(...)(adapter)`. Without wiring, or when there is nothing to pick, the endpoint keeps the `EndpointGenerator` type and a `never` handler placeholder for you to replace.

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

Page and widget names can include folders split by `/`. For example, a page named `admin/panel/users` is created at `pages/admin/panel/users-page.tsx` as `AdminPanelUsersPage`, and a widget with the same name at `widgets/admin/panel/users/` as `AdminPanelUsersWidget` with the story title `Widgets/Admin/Panel/Users`. File names use only the last segment; code names use the whole path.

### Project integrations

Choose **Add integration → Storybook (React + Vite)** to configure Storybook.
The integration creates `main.ts` and `preview.ts` under
`<rootFolder>/presentation/react/.storybook`, enables React scaffolding and sets
`storybookFramework` to `@storybook/react-vite` for future generated stories.
It uses relative story paths and configures the Vite alias `@` to the absolute
project root (the directory containing `package.json`), computed at runtime
from the config location. Add project CSS to `preview.ts` with relative imports
or `@/` imports. The setup includes `@vitejs/plugin-react`.

It adds these package scripts, with paths adjusted to your `rootFolder`:

```json
{
  "storybook": "storybook dev -p 6006 -c \"src/presentation/react/.storybook\"",
  "build-storybook": "storybook build -c \"src/presentation/react/.storybook\" -o \"src/presentation/react/storybook-static\""
}
```

Existing unrelated scripts and package fields are preserved. If a script name
already has a different command, choose to keep it, replace it, or use another
name. Identical generated configs and scripts are skipped on subsequent runs;
changed config files use the usual overwrite confirmation. Cancelling before
writing leaves all files unchanged.

After writing, the CLI prints npm commands for missing dependencies and the
selected scripts. It does not install packages or execute scripts. Install commands omit version constraints for Storybook, its React + Vite
framework, Vite and the React plugin; existing dependency versions are preserved
and must be compatible with those packages. Generate a
UI-kit component or a widget with separated UI to add your first story. The
static build goes to `<rootFolder>/presentation/react/storybook-static`; the
integration adds this directory to the project `.gitignore` without duplicating
the entry on subsequent runs.

### Missing domain-first packages

Choose **Add integration → Missing domain-first packages** to compare
`domainFirstPackages` in the configuration with `dependencies`, `devDependencies`
and `optionalDependencies` in the project's `package.json`. The CLI prints one
`npm i` command for missing packages, without version constraints. If none are
missing, it reports that all configured packages are already declared. This
checks declared dependencies, not the contents of `node_modules`, and does not
modify files or install packages.

### Prisma 8 (PostgreSQL)

Choose **Add integration → Prisma 8 (PostgreSQL, RC)**. The preset creates
`<rootFolder>/shared/infrastructure/prisma/prisma.config.ts` and a starter
`contract.prisma`. Existing contracts are preserved, including your models.

You can optionally create `PrismaInfrastructureService` in
`shared/infrastructure/services`; it exposes `orm`, uses the Temporal polyfill,
and reuses the client across development hot reloads. When `@domain-first/wire`
is enabled, the integration also creates its wiring factory. A separate prompt
lets you make `prisma` the default persistence implementation.

The integration adds three scripts, all pointing to the generated config:

- `prisma:emit`: emit `contract.json` and `contract.d.ts`.
- `prisma:migration:plan`: emit the contract, then plan a migration.
- `prisma:migration:apply`: apply migrations and advance the `db` ref.

Script conflicts use the same keep/replace/rename flow as Storybook. File changes
are staged until overwrite confirmation; no packages are installed and no
commands connect to the database during scaffolding.

The printed install commands omit version constraints for `prisma`,
`@prisma/cli-engine`, `@prisma/orm-postgres`, `temporal-polyfill`, and `dotenv`. Already declared dependencies are kept. This is a PostgreSQL
preset for Prisma 8 RC, not a Prisma 7 migration tool.

After installing dependencies, configure `DATABASE_URL` (the CLI loads `.env`;
your application must load its runtime environment), add your models to the
contract and run the emit script before compiling or importing the service.
Use Node.js 22.18+, TypeScript 5.9+, ESM and JSON import support. Review planned
migrations before running the apply script. Generated contract files and
migration history are managed by Prisma, not by this scaffolder.

### Vitest

Choose **Add integration → Vitest**. The integration creates `vitest.config.ts`
in the project root (the directory containing `package.json`) with
`resolve.tsconfigPaths` and V8 coverage for `<rootFolder>/bounded-contexts` and
`<rootFolder>/shared`. Specs, infrastructure, REST presentation and wiring are
excluded from coverage. When `@domain-first/handlers-next` is declared, the
config also inlines it so Vitest can resolve its `next/headers` import.

It sets `testingLibrary` to `vitest`, so generators scaffold unit tests; if
another testing library is configured, the CLI asks before replacing it. It also
adds `/coverage/` to the project `.gitignore` and these package scripts:

```json
{
  "test": "vitest run --reporter=dot --silent=passed-only",
  "test:coverage": "vitest run --coverage --reporter=dot --silent=passed-only"
}
```

Script conflicts and overwrite confirmation work as in the other integrations.
The printed install command omits version constraints for `vitest` and
`@vitest/coverage-v8`; already declared dependencies are kept.
`resolve.tsconfigPaths` requires Vite 8+. The config excludes `specs/e2e`, which
belongs to Playwright.

### Playwright

Choose **Add integration → Playwright**. The integration creates
`playwright.config.ts` in the project root with `testDir: './specs/e2e'`, an
HTML reporter, traces on retry, screenshots and videos on failure, and projects
for Chromium, Firefox, WebKit, Mobile Chrome and Mobile Safari, all running on
Playwright's own browser builds.
The web server runs `npm run dev` at `http://localhost:3000` and is reused
outside CI; adjust `baseURL` and `webServer.url` for another port.

A mock example goes to `specs/e2e/home`: `home.e2e.spec.ts` and a `README.MD`
with its user stories. Existing example files are never overwritten. The
integration adds a `test:e2e` script (`playwright test`) and ignores
`/test-results/`, `/playwright-report/`, `/blob-report/`, `/playwright/.cache/`
and `/playwright/.auth/` in `.gitignore`.

After writing, the CLI prints the commands needed to run the specs: installing
`@playwright/test` if it is missing, `npx playwright install --with-deps` for
the browsers and their system dependencies, the `test:e2e` script and
`npx playwright show-report`.

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

Nothing is written until a run finishes. If the run would replace existing files, the CLI lists them and asks `Overwrite them?` (default: No). Answering No, or interrupting the CLI at any prompt, leaves the project unchanged. Lines added to existing barrels, error files, and wiring indexes are not overwrites and are never duplicated. Use a new name for a new component, and review the generated changes before continuing implementation.

## License

[MIT](./LICENSE)
