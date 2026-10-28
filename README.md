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

### How to initialize a project

Run `df-init` in a project with a `package.json`. It asks for the source folder, the `@domain-first` packages you use, the default persistence implementation, whether to scaffold a shared in-memory DB for test implementations, React, Storybook and the testing library, then writes `domain-first.project-structure.config.json` and the Shared Kernel files these answers need. With `@domain-first/handlers-rest`, it also scaffolds the [endpoint generator](#how-to-add-a-rest-endpoint); if `next` is among your dependencies, it offers to connect `nextAdapter` from `@domain-first/handlers-next` right away and adds the catch-all route `app/api/[...path]/route.ts`. Finally it prints one command that installs the missing packages.

```
npx df-init
```

```json
{
    "rootFolder": "src",
    "domainFirstPackages": [
        "@domain-first/types",
        "@domain-first/errors",
        "@domain-first/handlers",
        "@domain-first/wire"
    ],
    "defaultPersistenceLayerImplementation": "prisma",
    "withInMemoryDb": true,
    "useReact": false,
    "testingLibrary": "vitest"
}
```

Commit the config to share it with your team. `df-init` runs once: with a config in place it exits with an error. Change the config by hand; add the endpoint generator or the in-memory DB later with [`df-integration`](#how-to-add-tooling). The other commands need the config and point to `df-init` without it. Every `df-scaffold` run performs one operation from the menu.

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

### How to wire dependencies

As the last step, generators with wiring offer the modules the new one may depend on, from the same bounded context and the Shared Kernel. Each choice is added to the factory and to the constructor:

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

Choose **Move or rename** in the context menu: rename an aggregate, entity, value object, service, port, query, command or use case, move it to another bounded context or to the Shared Kernel, or move an entity in or out of an aggregate. Its files, implementations, wire, specs and every import and derived name in the project follow it: `OrderRepository`, `PrismaOrderRepository`, `wireOrderRepository`, the `orderRepository` parameter of a use case, the in-memory DB section. A move that would make one context import another is refused, with the list of imports that would cross the boundary.

### How to add errors

Choose **Domain → Errors** to add an error to the context namespace, create a nested namespace, or add an error to it. The context namespace (`SalesErrors = errorNamespace('sales')` in `domain/errors/index.ts`) is created with the first error added without a namespace.

```ts
export class OutOfStock extends SalesErrors.define('out-of-stock') {}
```

Names don't repeat the context: an error of the `payment` namespace in `sales` is `PaymentDeclined`. In the Shared Kernel they end with `SharedKernelError`: `TimeoutSharedKernelError`.

### How to share code between contexts

Bounded contexts don't import each other. Put cross-context errors, entities, value objects, ports and services into the **Shared Kernel** (`src/shared-kernel`). Its modules are offered as dependencies in every context.

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

With `useReact`, run `npx df-react`: pages, widgets (monolithic, with separated UI, or headless), UI-kit components with Storybook stories, and shared hooks. Names may include folders:

```text
admin/panel/users  →  pages/admin/panel/admin-panel-users-page.tsx  (AdminPanelUsersPage)
```

**Move or rename page** and **Move or rename widget** move the files and update every import in the project.

### How to add tooling

Run `npx df-integration` to configure one or several of the REST endpoint generator, the shared in-memory DB, Storybook, Prisma 8, Vitest, Playwright, integration tests on PostgreSQL in Testcontainers, OpenAPI generation or an Orval API client (typed client and React Query hooks). Integrations add config files, package scripts and `.gitignore` entries, then print one install command to copy. Nothing is installed or run for you.

The endpoint generator and the in-memory DB are what `df-init` scaffolds; as integrations they add them later or restore missing files, and never overwrite existing ones.

### How to check the rules

```
npx df-lint
```

It reports what breaks the Domain-First rules: imports between bounded contexts, imports against the layers, modules using kinds the dependency rules don't allow (in imports and in wiring), React modules importing what they shouldn't, and reading the time without the clock port. It exits with 1 when something is found, so you can run it in CI.

The rules are a default. Teams that work differently change them in the config: what each kind of module may depend on (`rules.dependencies`) and which checks run (`rules.lint`). `df-scaffold` offers dependencies by the same rules. Without `rules`, the defaults apply and every check runs; kinds and checks you don't mention keep their defaults.

- Kinds in `rules.dependencies` (as keys and in lists): `repositories`, `domain-services`, `application-ports`, `application-services`, `use-cases`, `commands`, `queries`, `infrastructure-services`, `presentation-services`.
- A kind's value: a list that replaces its defaults, or `{ "add": [...], "remove": [...] }`.
- Checks in `rules.lint`: `context-isolation`, `shared-kernel`, `layers`, `dependencies`, `react`, `clock`.

Defaults and details: [Dependency rules](API.md#dependency-rules), [`df-lint`](API.md#df-lint).

```json
{
    "rules": {
        "dependencies": { "use-cases": { "add": ["use-cases"] } },
        "lint": { "clock": false }
    }
}
```

### How to teach your coding agent

The package ships skills that teach coding agents to plan features, scaffold with `df-scaffold`, build the React part with `df-react` and implement the generated code.

```
npx df-skills --claude
```

Run it again after upgrading the package to get the new versions.

## License

MIT
