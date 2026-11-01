# Domain First Project Structure

<p>
    <img src="https://img.shields.io/npm/v/%40domain-first%2Fproject-structure" alt="version">
    <img src="https://img.shields.io/badge/TypeScript-ready-3178C6?logo=typescript&logoColor=white?style=for-the-badge" alt="TypeScript ready">
    <img src="https://img.shields.io/badge/semantic--release-angular-e10079?logo=semantic-release" alt="semver">
    <img src="https://img.shields.io/npm/l/%40domain-first%2Fproject-structure" alt="license">
</p>

Spend less time setting up files. Spend more time building your domain.

## What is it?

In most TypeScript codebases you choose between convenience and architecture. Clear boundaries and roles around the domain mean more files, more contracts and more wiring, so under deadline pressure the logic ends up wherever it is quickest to write it. The boundaries blur one shortcut at a time.

Domain First Project Structure removes that choice: **the cleanest path is also the shortest one**. An interactive CLI asks which bounded context, layer and role a new piece of code has, and generates it in its place, with contracts, implementations, test skeletons and wiring that respect the boundaries. Dependencies are offered only where the dependency rules allow them. Doing it right takes a few prompts; doing it wrong takes extra effort. It knows the `@domain-first` packages: types, errors, handlers, wire and handlers-rest. The generated files belong to your project; you write the business rules.

```
npm i -D @domain-first/project-structure
npx df-init
npx df-scaffold
```

## API

The full technical specification lives in [API.md](./API.md).

## Guide

### Non-interactive mode for agents

`df-scaffold`, `df-react` and `df-integration` accept JSON requests. Humans can keep using the interactive menus. Agents can discover schemas and project IDs first:

```bash
npx df-scaffold --describe
npx df-scaffold --request '{"operation":"query","context":"sales","name":"orders","implementation":{"type":"prisma","save":false},"dependencies":{"PrismaOrdersQuery":["shared-kernel:PrismaInfrastructureService"]}}'
npx df-react --request '{"operation":"widget","name":"admin/orders","widgetType":"separated"}'
npx df-integration --request '{"operation":"add","integrations":["storybook"]}'
```

`--request -` reads JSON from stdin. `dryRun: true` previews changes without writing; `overwrite: true` explicitly allows replacing changed existing generated files. Responses are JSON with file lists, next steps and diagnostics. Errors return `ok: false` and a nonzero exit code without falling back to prompts; invalid requests discard staged changes. Initialization stays with the human through `df-init`.

The [API reference](API.md#non-interactive-json-mode) describes request fields, discovery IDs and result semantics.

### How to initialize a project

Run `df-init` in a project with a `package.json`. Setup visits **Project → Backend → Frontend** in order. Each section asks whether to configure it now: answer No to configure it later. Skipping Project keeps the source folder `src`; skipping Backend or Frontend leaves that section absent.

```bash
npx df-init
# Return to one section later:
npx df-init --section backend
npx df-init --section frontend
```

Project asks for the source folder. Backend asks for the `@domain-first` packages, the [`envBranchedWire` branches](#how-to-switch-implementations) with `wire`, shared in-memory DB and testing library, then adds the required Shared Kernel files. With `@domain-first/handlers-rest`, it adds the [endpoint generator](#how-to-add-a-rest-endpoint). Frontend offers **React** or **Next.js**, then Storybook. Enabling Storybook runs the existing React + Vite integration: it creates `.storybook` configs, package scripts and the build-output `.gitignore` entry. Selecting Next.js with a configured backend asks **Use @domain-first/handlers-next for REST endpoints** once. Yes adds `handlers-rest` to the backend packages if needed, connects `nextAdapter` and creates the catch-all route. This works before `next` is installed. With backend deferred, REST setup waits until backend configuration. Missing packages are printed as an install command; nothing is installed automatically.

All settings and saved implementation types live in `domain-first.project-structure.config.json`:

```json
{
    "project": { "rootFolder": "src" },
    "backend": {
        "domainFirstPackages": ["@domain-first/wire", "@domain-first/handlers"],
        "withInMemoryDb": true,
        "testingLibrary": "vitest",
        "implementations": {
            "repositories": { "primary": ["prisma", "mongo"], "test": ["stub"] },
            "commands": { "primary": ["sql"], "test": [] },
            "queries": { "primary": ["elastic"], "test": ["fake"] },
            "ports": { "primary": ["s3"], "test": [] }
        },
        "rules": {
            "dependencies": {
                "domain-services": ["domain-services"],
                "repositories": ["domain-services", "application-ports", "infrastructure-services"],
                "application-ports": ["repositories", "domain-services", "application-ports", "infrastructure-services"],
                "application-services": ["repositories", "domain-services", "application-ports", "commands", "queries"],
                "use-cases": ["repositories", "domain-services", "application-ports", "application-services", "commands", "queries"],
                "commands": ["infrastructure-services"],
                "queries": ["infrastructure-services"],
                "infrastructure-services": ["repositories", "domain-services", "application-ports", "infrastructure-services"],
                "presentation-services": ["application-ports", "application-services", "use-cases", "commands", "queries", "presentation-services"]
            },
            "lint": {
                "context-isolation": true,
                "shared-kernel": true,
                "layers": true,
                "dependencies": true,
                "react": true,
                "clock": true
            }
        }
    },
    "frontend": {
        "react": { "framework": "react", "storybookFramework": "@storybook/react-vite" }
    }
}
```

Commit the config to share it with your team. Rerunning `df-init` offers **Project**, **Backend**, **Frontend** and **All sections**, using current values as defaults. A single-section update keeps the other sections and saved choices. Backend setup writes all standard dependency lists and enabled lint checks into `backend.rules`, so they can be edited directly. On reconfiguration, only missing rules are filled; existing lists, `add`/`remove` patches and disabled checks are preserved. Backend setup preserves existing support files and restores missing ones. Changing the source folder affects future generation; existing source is not moved. React is enabled by the presence of `frontend.react`; its `framework` is `react` or `next`, so Next.js uses the same React generators. Frontend selection is prefilled from the saved value, falling back to Next.js when `next` is declared in `package.json`. Both choices use `@storybook/react-vite` from the Storybook integration; there is no separate Storybook framework prompt. Framework settings remain grouped under `frontend.<framework>`.

A config of an earlier major version is not read: commands stop and ask you to run [`df-upgrade`](#how-to-upgrade-to-a-new-major-version). An absent backend or React section produces a message pointing to the corresponding `df-init --section` command. Initialization and configuration are performed by the project owner; agent skills only read these settings and ask the owner to configure missing sections.

### Saved implementation types

Repository, command, query and port generators offer a menu of implementation types. **Enter implementation type and save for future use** accepts a new kebab-case name and saves it under `backend.implementations` in the shared config. **Enter implementation type for this run only** generates code without adding a saved choice. Both actions apply to primary and test implementations, including additions to existing contracts.

Each category and its primary/test choices are separate and shared by all contexts in the project. Ordinary types such as `api` and `mock` are not presets: enter them manually or save them for later. Menus contain saved choices, available system implementations and the two manual-entry actions.

System implementations are marked explicitly:

- **System: cross-context (calls handlers in another bounded context)** — port adapters, only when another bounded context exists.
- **System: in-memory (uses the shared in-memory database)** — repositories, commands and queries, only when the shared in-memory DB integration is enabled and its files are ready.

The first available saved type is selected by default, then an available system type; otherwise the save-entry action is selected and its name input is empty. Adding an implementation to an existing contract shows both primary and test choices. With the save action, ordinary types are remembered according to their selected environments; the run-only action never registers them.

Updates to `backend.implementations` preserve all other config sections and are saved together with generated files; cancellation discards both. Prisma integration adds `prisma` to repository, command and query choices. There is no global persistence-default setting.

### How to create a bounded context

Choose **Scaffold new bounded context** and enter a name, such as `sales`. It starts empty: no error namespace until the first error.

Use lowercase kebab-case for every name: `place-order` becomes `PlaceOrderUseCase`.

### How to add an aggregate

Choose **Bounded Context: sales → Domain → New Aggregate**, name it `order`, and add a repository with a `prisma` implementation and an `in-memory` test one.

```text
src/bounded-contexts/sales/
├── domain/aggregates/order/
│   ├── index.ts
│   ├── order.aggregate-root.ts
│   └── order-repository.ts
├── infrastructure/repositories/
│   ├── prisma/prisma-order-repository.ts
│   └── in-memory/in-memory-order-repository.ts
└── wiring/repositories/wire-order-repository.ts
```

Entities and value objects go into an aggregate (**New Entity**, **New Value Object**) or into the context's `domain/`.

### How to add a use case, a command or a query

Choose **Application → New Use Case**, **New Command** or **New Query**. With `@domain-first/handlers`, the class gets schema placeholders and a `handle` built with `defineHandler`.

```ts
export class PlaceOrderUseCase {
    constructor() {}

    static inputSchema = {};
    static outputSchema = {};

    handle = defineHandler({
        inputSchema: PlaceOrderUseCase.inputSchema,
        outputSchema: PlaceOrderUseCase.outputSchema,
        handler: async (input) => {
            return {};
        },
    });
}
```

A command or query creates an abstract contract in `application/` and implementations in `infrastructure/`, like a repository. A query only reads and never changes data; any change is a command.

### How to switch implementations

With `@domain-first/wire`, repositories, commands, queries and ports get one factory per implementation, selected by `NODE_ENV`:

```ts
export const wireOrderRepository = envBranchedWire({
    test: wireInMemoryImplementation,
    development: wirePrismaImplementation,
    production: wirePrismaImplementation,
});
```

Tests get the test implementation, everything else gets the primary one.

Your environments may differ: choose **Custom branches** during backend setup and enter them, e.g. `local, staging, production`, then pick the test branch, let `df-init` add `test`, or go without one: then every branch gets the primary implementation and no test implementations are asked for. Generated wires use these branches. How the current branch is chosen is yours: `env-branched-wire.ts` gets an empty `currentBranch` function that doesn't compile until you write it.

### How to wire dependencies

As the last step, generators with wiring offer the modules the new one may depend on, from the same bounded context and the Shared Kernel. Cross-context port adapters also see the application handlers of neighboring contexts. Each choice is added to the factory and to the constructor:

```ts
export class PlaceOrderUseCase {
    constructor(private readonly orderRepository: OrderRepository) {}
}

export const wirePlaceOrderUseCase = wireClass(PlaceOrderUseCase, [
    wireOrderRepository,
]);
```

Only the dependencies that respect the layers are offered: a use case can't take another use case, the domain can't take the application. To add a dependency later, choose **Wire dependency** in the context menu.

### How to add an implementation

Choose **Infrastructure → New Implementation** to give an existing repository, command, query or port one more implementation, say a `local` adapter of a `FileStorage` port next to `s3` and `in-memory`. With `wire`, pick the environments that use it: `test` stays on `in-memory`, `development` moves to `local`, `production` stays on `s3`.

### How to move or rename a module

Choose **Move or rename** in the context menu: rename an aggregate, entity, value object, service, port, query, command or use case, move it to another bounded context or to the Shared Kernel, or move an entity in or out of an aggregate. Its files, implementations, wire, specs and every import and derived name in the project follow it: `OrderRepository`, `PrismaOrderRepository`, `wireOrderRepository`, the `orderRepository` parameter of a use case, the in-memory DB section. A move that would introduce a forbidden import between contexts is refused, with the list of imports that would cross the boundary.

### How to add errors

Choose **Domain → Errors** to add an error to the context namespace, create a nested namespace, or add an error to it. The context namespace (`SalesErrors = errorNamespace('sales')` in `domain/errors/index.ts`) is created with the first error added without a namespace.

```ts
export class OutOfStock extends SalesErrors.define('out-of-stock') {}
```

Names don't repeat the context: an error of the `payment` namespace in `sales` is `PaymentDeclined`. In the Shared Kernel they end with `SharedKernelError`: `TimeoutSharedKernelError`.

### How to share code between contexts

Keep each context's domain and application models local. For another context's data or behavior, create an **application port** in the consuming context (**Application → New Port**) and choose **System: cross-context (calls handlers in another bounded context)** for its adapter. No transport or endpoint is required.

Port adapter menus contain saved port types and both manual-entry actions, plus **System: cross-context (calls handlers in another bounded context)** when another bounded context exists. There are no automatic `api`, `mock` or `in-memory` port choices. Saved primary and test port types remain separate; adding another adapter shows both lists. Choices from repositories, commands and queries are not added to port menus.

With `wire`, **Dependencies for CrossContext…** and **Wire dependency** offer queries, commands and use cases from every neighboring context, labelled with their context, such as `InvoiceQuery (billing)`. The CLI injects each handler into the adapter and imports its factory in wiring. Names include the context to avoid collisions: `BillingInvoiceQuery`, `wireBillingInvoiceQuery`.

Define the capability's methods in your port and implement them in the adapter: map your input, call the injected handler, and map its result and errors to your own models. Keep a separate `mock` or `stub` test adapter so tests do not run the neighboring context. Without `wire`, inject the handlers through the constructor and compose them in wiring yourself.

Only port adapters under `infrastructure/application-adapters/cross-context/` may import neighboring handlers. Wiring may inject them only into those adapters; query/command implementations and other adapter types remain isolated. The `cross-context` type is unavailable for Shared Kernel ports. Shared universal models, technical ports and services belong in the **Shared Kernel** (`src/shared-kernel`).

### How to add a REST endpoint

With `@domain-first/handlers-rest`, choose **Presentation → New Handlers-REST Endpoint**, pick or create a controller, a method and a relative path. Context `sales`, controller `orders`, path `recent` and `get` give:

```text
src/bounded-contexts/sales/presentation/rest/orders/recent/GET.ts   // GET /sales/orders/recent
```

Every endpoint uses the one endpoint generator of the project, `RestEndpointGeneratorPresentationService` in `src/shared-kernel/presentation/services/`. Initialization scaffolds it as a regular Shared Kernel presentation service (class, spec and wire):

```ts
/**
 * The adapter of your HTTP framework.
 */
const adapter = undefined as unknown as Adapter<any[], any>

export class RestEndpointGeneratorPresentationService {
    get withoutGuards(): EndpointGenerator {
        return createEndpoint({
            errors: [invalidRequest()]
        })(adapter) as EndpointGenerator
    }
}
```

Set the module-level `adapter` constant above the class to the adapter of your HTTP framework; the class uses it through closure. If you connected the Next adapter, the file imports `nextAdapter` from `@domain-first/handlers-next` instead, with nothing to set, and `app/api/[...path]/route.ts` (`src/app/…` when that folder exists) serves the endpoints with `nextEndpoints`. With wiring, the route serves `restHandlers`, so every new endpoint works without touching it; before the first endpoint the route doesn't compile, and the CLI says so. Each generating method is a getter returning `EndpointGenerator`: add one per kind of endpoint (for example `withAuth`, with its `context` and error mappings). Keep `invalidRequest()` of `@domain-first/handlers-rest` there for invalid requests (`400`) and add your own mappings: `errors: [httpError(MyError, 404), invalidRequest()]`. A new endpoint calls `this.endpointGenerator(...)` and doesn't compile on purpose: choose the getter yourself in its `get handle()`, e.g. `this.endpointGenerator.withoutGuards(...)`.

With wiring, the endpoint takes the generator and a handler you pick from the context's queries, commands and use cases, and all endpoints are collected as `restHandlers` in `src/presentation/rest/index.ts`. Connect them to your HTTP server.

### How to scaffold React modules

With `frontend.react` configured, run `npx df-react`: pages, widgets (monolithic, with separated UI, or headless), UI-kit components with Storybook stories, and shared hooks. Names may include folders:

```text
admin/panel/users  →  pages/admin/panel/admin-panel-users-page.tsx  (AdminPanelUsersPage)
```

With Next.js, a new page also gets its App Router route, `app/admin/panel/users/page.tsx`, which renders `AdminPanelUsersPage`. An existing route is never overwritten.

**Move or rename page** and **Move or rename widget** move the files and update every import in the project.

### How to add tooling

Run `npx df-integration` to configure one or several of the REST endpoint generator, the shared in-memory DB, Storybook, Prisma 8, Vitest, Playwright, integration tests on PostgreSQL in Testcontainers, OpenAPI generation or an Orval API client (typed client and React Query hooks). Integrations add config files, package scripts and `.gitignore` entries, then print one install command to copy. Nothing is installed or run for you.

The endpoint generator and the in-memory DB are what `df-init` scaffolds; as integrations they add them later or restore missing files, and never overwrite existing ones.

### How to check the rules

```
npx df-lint
```

It reports what breaks the Domain-First rules: forbidden imports between bounded contexts, imports against the layers, modules using kinds the dependency rules don't allow (in imports and in wiring), React modules importing what they shouldn't, and reading the time without the clock port. It exits with 1 when something is found, so you can run it in CI.

`df-init` scaffolds all standard rules into `backend.rules` during backend setup. Teams can edit these entries directly: what each kind of module may depend on (`backend.rules.dependencies`) and which checks run (`backend.rules.lint`). `df-scaffold` offers dependencies by the same rules. For older or manually shortened configs without `backend.rules`, the defaults apply and every check runs; kinds and checks you don't mention keep their defaults.

- Kinds in `backend.rules.dependencies` (as keys and in lists): `repositories`, `domain-services`, `application-ports`, `application-services`, `use-cases`, `commands`, `queries`, `infrastructure-services`, `presentation-services`.
- A kind's value: a list that replaces its defaults, or `{ "add": [...], "remove": [...] }`.
- Checks in `backend.rules.lint`: `context-isolation`, `shared-kernel`, `layers`, `dependencies`, `react`, `clock`.

Defaults and details: [Dependency rules](API.md#dependency-rules), [`df-lint`](API.md#df-lint).

```json
{
    "backend": {
        "rules": {
            "dependencies": {
                "use-cases": {
                    "add": [
                        "use-cases"
                    ]
                }
            },
            "lint": {
                "clock": false
            }
        }
    }
}
```

### How to upgrade to a new major version

After upgrading the package to a new major version, run:

```bash
npx df-upgrade --dry-run   # review the plan
npx df-upgrade
```

It finds what the project needs, shows every change and applies them together after one confirmation; `--yes` skips the question. Until then, the other commands, `df-lint` included, stop with `run npx df-upgrade`. Running it again prints `Everything is up to date.`

From 7.x it splits the config into `project`, `backend` and `frontend`, records `frontend.react.framework` explicitly (`next` when `next` is in `package.json`, otherwise `react`), and moves `defaultPersistenceLayerImplementation` to the first saved primary type of repositories, commands and queries. Then update the agent skills with `npx df-skills`.

### How to teach your coding agent

The package ships skills that teach coding agents to plan features, scaffold with `df-scaffold`, build the React part with `df-react` and implement the generated code.

```
npx df-skills --claude
```

Run it again after upgrading the package to get the new versions.

## License

MIT
