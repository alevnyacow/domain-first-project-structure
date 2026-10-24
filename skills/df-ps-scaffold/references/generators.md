# df-scaffold generators: prompts and output

Notation: `<C>` = `<rootFolder>/bounded-contexts/<context>` or `<rootFolder>/shared`. `n` = the entered kebab-case name, `N` = PascalCase, `v` = camelCase. `I` = implementation label (`prisma` → `Prisma`). Specs are generated without a prompt **only if `testingLibrary` is set**. `{pkg}` = output depends on that `@domain-first/*` package.

Every step list starts with `"pick:Bounded Context: <ctx>"` or `"pick:Shared Layer"`, then the layer, then the operation (abbreviated below as `…`).

Any generator: if the run would replace existing files, the last prompt is the confirm `Overwrite them?` (the files are listed above it). Without it, nothing extra is asked. Added lines (barrels, errors, wiring indexes) never trigger it.

{wire} Generators that create a wire (all below except endpoints, which ask their own two selects) then ask the checkbox `Dependencies:`, before `Overwrite them?`. It lists wired modules of `<C>` and of the Shared Layer (`(shared)` suffix), grouped under headers in this order: Repositories, Domain services, Ports, Application services, Queries, Commands, Use cases, Infrastructure services, Presentation services. Inside a group: by type name, `<C>` first. Headers are not counted: `toggle:<n,..>` numbers only modules, top to bottom. Answer `toggle:<n,..>` or `none`. It is skipped when nothing fits, so check `<C>/wiring/` and `<rootFolder>/shared/wiring/` before counting steps. What fits depends on the layer of the class the wire builds: domain → domain; application → domain, application; infrastructure (repository, command/query, and port implementations, infrastructure services) → domain, application ports (of `<C>` and the Shared Layer; no other application modules), infrastructure; presentation → application, presentation. On top of that, domain services see only domain services (no repositories), application services see only ports, commands and queries from application, use cases never see use cases, repository implementations never see repositories, command/query implementations see only infrastructure services. These are the defaults: `rules.dependencies` in the config changes them per kind (`use-cases`, `queries`, …), so count items from what the project's rules allow. Endpoints are never listed. Each chosen module goes into the wire (`wireClass(X, [wireUserRepository])`) and the constructor (`private readonly userRepository: UserRepository`, with `import type`), in the same order. An env-branched wire (repository, command/query, port) wires each implementation in isolation: instead of `Dependencies:` it asks `Dependencies for <Implementation>:` once per implementation, in the order of the wire (main, then test). Each list leaves out only what that implementation already has, and a list with nothing to choose is skipped. It may start with a `Suggested` group: infrastructure modules whose file name has the implementation label (its folder, e.g. `prisma`, `in-memory`) as whole words, such as `in-memory-db-infrastructure-service` for `in-memory`. They are listed there only, so numbering starts with them, and they are **checked**: `none` keeps them, `toggle:<n>` on one of them unchecks it.

## Bounded context

`"pick:Scaffold new bounded context" text:sales` → folder `<rootFolder>/bounded-contexts/sales/`; {errors} `domain/errors/index.ts` with `SalesErrors = errorNamespace('sales')`.

## Domain → New Aggregate (context only)

Prompts: name → `With Repository` → if yes: implementation (default = config persistence label) → `Add a test implementation` → if yes: test implementation (default `in-memory`).

`… pick:Domain "pick:New Aggregate" text:order yes default yes default`

- `<C>/domain/aggregates/n/`: `n.aggregate-root.ts` (`class N extends domainType()` {types}), `index.ts`, spec; with repository: `n-repository.ts` (`abstract class NRepository`), spec
- `<C>/infrastructure/repositories/I/I-n-repository.ts` per implementation (`class INRepository implements NRepository`)
- {wire} `<C>/wiring/repositories/wire-n-repository.ts` (env-branched)
- With `withInMemoryDb` in the config, the `in-memory` implementation can keep its section of the DB: `private readonly data: InMemoryDbInfrastructureService['ns']`, set in the constructor from its `inMemoryDbInfrastructureService` parameter; `ns = this.section<N>('NS');` is added to `<rootFolder>/shared/infrastructure/services/in-memory-db-infrastructure-service.ts` if missing (`N` needs an `id`). Without {wire} this always happens. {wire} `Dependencies for InMemoryNRepository:` lists the DB under `Suggested`, checked: kept, it gets the section and `wireInMemoryDbInfrastructureService` in its `wireClass`; unchecked, the implementation stays empty (`constructor() {}`) and no section is added.

## Domain → New Entity / New Value Object (context and Shared Layer)

Prompts: name → aggregate (select: existing aggregate folders | `No aggregate`; asked only if `<C>/domain/aggregates/` has aggregates, so never in Shared Layer).

`… pick:Domain "pick:New Entity" text:order-line pick:order`
`… pick:Domain "pick:New Value Object" text:money "pick:No aggregate"`
`"pick:Shared Layer" pick:Domain "pick:New Value Object" text:money`

- In an aggregate: `<C>/domain/aggregates/a/entities/n.entity.ts` or `<C>/domain/aggregates/a/value-objects/n.value-object.ts` (`class N extends domainType()` {types}), spec; `export * from './entities/n.entity'` (or `./value-objects/n.value-object`) appended to the aggregate's `index.ts`
- `No aggregate`: `<C>/domain/entities/n.entity.ts` or `<C>/domain/value-objects/n.value-object.ts`, spec; no barrel

## Domain → Errors (context and Shared Layer)

First prompt (select): `New error without namespace` | `New namespace` | `New error in namespace <ns>`, then a name.

`… pick:Domain pick:Errors "pick:New namespace" text:order`
`… pick:Domain pick:Errors "pick:New error in namespace order" text:not-found`
`… pick:Domain pick:Errors "pick:New error without" text:order-closed`

- Without namespace: appends `export class N extends CtxErrors.define('n') {}` to `<C>/domain/errors/index.ts`
- New namespace: `<C>/domain/errors/ns.ts` (`NsErrors = errorNamespace('ctx').subnamespace('ns')`) + `export * from './ns'` in `index.ts`
- In namespace: appends `export class NsN extends NsErrors.define('n') {}` to `ns.ts` (namespace first), extending the namespace the file exports
- Shared Layer: errors end with `SharedError`, namespaces with `SharedErrors`: `NSharedError`, `NsSharedErrors`, `NsNSharedError`

Re-running is safe: an existing namespace file is kept, and a line already in the file isn't added again.

`Ctx` = PascalCase of the context folder (`Shared` in Shared Layer). Requires `index.ts` with `CtxErrors` {errors}.

## Services: Domain / Application / Infrastructure / Presentation (context and Shared Layer)

Prompts: name. `L` = `domain` | `application` | `infrastructure` | `presentation`.

`… pick:Application "pick:New Service" text:checkout`

- `<C>/L/services/n-L-service.ts` (`class NLService`, e.g. `CheckoutApplicationService`), spec
- {wire} `<C>/wiring/L-services/wire-n-L-service.ts` (`wireClass(X, [])`)

## Application → New Use Case (context only)

Prompts: name. `… pick:Application "pick:New Use Case" text:place-order`

- `<C>/application/use-cases/n-use-case.ts`: {handlers} schemas + `handle = defineHandler(...)`, else an empty class; spec
- {wire} `<C>/wiring/use-cases/wire-n-use-case.ts`

## Application → New Command / New Query (context only)

Prompts: name → implementation (default = config persistence label) → `Add a test implementation` → if yes: test implementation (default `in-memory`).

`… pick:Application "pick:New Command" text:place-order default yes default`
`… pick:Application "pick:New Query" text:order-summary default no`

- `<C>/application/commands/n-command.ts`: abstract `NCommand` ({handlers} schemas + abstract `handle: Handler<…>`), spec
- `<C>/infrastructure/commands/I/I-n-command.ts` per implementation (`extends NCommand`, implements `handle`)
- {wire} `<C>/wiring/commands/wire-n-command.ts` (env-branched)
- With `withInMemoryDb` in the config, the `in-memory` implementation can get the whole DB: `constructor(private readonly inMemoryDbInfrastructureService: InMemoryDbInfrastructureService)`. No section is added. Without {wire} this always happens; {wire} it is the checked `Suggested` choice of `Dependencies for InMemoryN<Suffix>:`, and unchecking it leaves the implementation empty.

Queries: the same with `query` / `queries`.

## Application → New Port (context and Shared Layer)

Prompts: name → adapter implementation (default `api`) → `With test implementation` → if yes: test implementation (default `mock`).

`… pick:Application "pick:New Port" text:payment-gateway default yes default`

- `<C>/application/ports/n.ts` (abstract `N`; name it after the capability), spec
- `<C>/infrastructure/application-adapters/I/I-n.ts` per implementation (`class IN extends N`)
- {wire} `<C>/wiring/application-ports/wire-n.ts` (env-branched)

## Wire dependency (context and Shared Layer, needs wire)

Prompts: module (select: wired modules of `<C>`, grouped as below, endpoints excluded; an env-branched module is listed once per implementation, e.g. `UserRepository (prisma)`, `UserRepository (in-memory)`) → `Dependencies:`, or `Dependencies for <Implementation>:` for the chosen implementation only (as above). Modules already in the wire are not listed. If nothing fits, it prints `No dependencies available for this module.` and changes nothing.

`"pick:Bounded Context: users" "pick:Wire dependency" "pick:UserRepository (prisma)" toggle:1`

Edits the wire and the implementation classes in place; this never triggers `Overwrite them?`.

## Presentation → New Handlers-REST Endpoint (context only, needs handlers-rest)

Prompts: controller (select: existing | `New controller` → name) → method (`get` `post` `patch` `delete` `put`) → relative path (may be empty: `default`) → {wire} `Handler:` (select: queries, commands, and use cases of `<C>`, grouped; skipped if there are none).

`… pick:Presentation "pick:New Handlers" "pick:New controller" text:orders pick:get text:recent pick:RecentOrdersQuery`
`… pick:Presentation "pick:New Handlers" pick:orders pick:post default pick:PlaceOrder`

For `sales`, `orders`, `get`, `recent`:

- `<C>/presentation/rest/orders/recent/GET.ts`: `class OrdersRecentGetEndpoint(endpointGenerator, handler)`, route `['sales','orders','recent']`. `endpointGenerator: RestEndpointGeneratorPresentationService` (the Shared Layer generator from initialization) and `handler: RecentOrdersQuery` (`never` without a pick), both `import type`. `get handle()` calls `this.endpointGenerator(...)`, which doesn't compile until a generating getter is picked (`this.endpointGenerator.withoutGuards(...)`); that's expected, not a generator bug. Projects without the generator file get `EndpointGenerator` from handlers-rest.
- {wire} `<C>/wiring/presentation/rest/orders/wire-orders-recent-get-endpoint.ts` (`[wireRestEndpointGeneratorPresentationService, wireRecentOrdersQuery]`; `[]` without the generator file) + a line in that folder's `index.ts`
- {wire}, new controller only: `<C>/wiring/presentation/rest/index.ts`, `<rootFolder>/presentation/rest/wires.ts` (lines appended), `<rootFolder>/presentation/rest/index.ts` (`restHandlers`, created once)

The same controller, path, and method replace the existing endpoint (after `Overwrite them?`).

## React (needs useReact)

`"pick:Scaffold React module" "pick:New page" text:checkout` → `<rootFolder>/presentation/react/pages/n-page.tsx`

`"pick:Scaffold React module" "pick:New widget" text:cart "pick:with separated ui"` → `…/widgets/n/`:

- `with separated ui` (default): `n-widget.tsx`, `types.ts`, `ui/n-widget-ui.tsx`, `hooks/use-n-ui-model.ts`; with `storybookFramework`: `ui/n-widget-ui.stories.tsx` (CSF3: `meta` with `title: 'Widgets/N'`, `component: NWidgetUI`, story `Default`)
- `headless`: `n-widget.tsx`, `types.ts` (props include `UI`), `hooks/use-n-ui-model.ts`
- `monolithic`: `n-widget.tsx`
- every type: `index.ts` (`export * from './n-widget'`)

Page and widget names may have folders before them: `text:admin/panel/users` → `…/pages/admin/panel/admin-panel-users-page.tsx` and `…/widgets/admin/panel/users/`. The widget folder uses only the last segment; file names use the whole path (`admin-panel-users-page.tsx`, `admin-panel-users-widget.tsx`, `ui/admin-panel-users-widget-ui.tsx`, `hooks/use-admin-panel-users-ui-model.ts`), and so do code names (`AdminPanelUsersPage`, `AdminPanelUsersWidget`, `useAdminPanelUsersUIModel`); the story title follows the folders (`Widgets/Admin/Panel/Users`). `.` and `..` are rejected.

Move or rename a page or a widget only with df-scaffold, never by hand: `"pick:Scaffold React module" "pick:Move or rename widget" "pick:admin/users" text:team/users "yes"` (`Move or rename page` for pages; the list shows nested names, the default new name is the current one). It moves the widget folder (or the page with its `<name>-page.*` files), renames files and `<Name>Widget…` / `use<Name>UIModel` / `<Name>Page…` to the new name, updates a generated story title and every import of the module (relative and `tsconfig` aliases; importers of barrels re-exporting it get the renamed classes), and fixes relative imports inside it. Before `Apply?` it prints the files to move and to update; check them. An existing target or a move into itself is rejected.

`"pick:Scaffold React module" "pick:New UI-kit" text:date-picker` → `…/ui-kit/n/`:

- `n.tsx` (`type NProps`, `const N: FC<NProps>`)
- `index.ts` (`export * from './n'`)
- with `storybookFramework`: `n.stories.tsx` (CSF3: `meta` with `title: 'UI-kit/N'`, story `Default`)

No Storybook prompt: UI-kit and widget UI stories follow the config.

`"pick:Scaffold React module" "pick:New shared hook" text:debounce` → `…/presentation/react/hooks/use-n.ts` (`const useN = () => …`). A leading `use-` in the name is dropped, so `use-debounce` gives the same file.

### Story templates

Only for recreating a **missing** story (rule 2, exception 4).

UI-kit, at `…/ui-kit/n/n.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "<storybookFramework>";
import { N } from "./n";

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

Widget UI (`with separated ui` only), at `…/widgets/n/ui/n-widget-ui.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "<storybookFramework>";
import { NWidgetUI } from "./n-widget-ui";

const meta = {
  title: "Widgets/N",
  component: NWidgetUI,
} satisfies Meta<typeof NWidgetUI>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
```

## Env-branched wiring {wire}

```ts
const wirePrismaImplementation = wireClass(PrismaOrderRepository, []);
const wireInMemoryImplementation = wireClass(InMemoryOrderRepository, []);

export const wireOrderRepository = envBranchedWire({
  test: wireInMemoryImplementation, // primary if there's no test implementation
  development: wirePrismaImplementation,
  production: wirePrismaImplementation,
});
```

## Spec templates

Only for recreating a **missing** spec (rule 2, exception 1). With {wire}:

```ts
import { describe, test, expect, beforeEach } from '<testingLibrary>'
import { type <Type> } from './<file>'
import { wire<Type> } from '<wirePath>'

let <var>: <Type>

beforeEach(() => {
    <var> = wire<Type>()
})

describe('<label>', () => {
    test('can be wired', () => {
        expect(<var>).toBeDefined()
    })
})
```

Without wire: import `<Class>` from `<noWire>`, use `new <Class>()` and the test name `<noWireTest>`. If `<noWire>` is an implementation, add `type <Type> = <Class>`.

| Component            | Spec next to                 | `<Type>` / `<var>`            | `<wirePath>`                                     | `<label>`            | `<Class>` from `<noWire>`, `<noWireTest>`                                                                |
| -------------------- | ---------------------------- | ----------------------------- | ------------------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------- |
| Aggregate root       | `n.aggregate-root.ts`        | `N` / `v`                     | none: `N.of({})` {types} (`can be instantiated via of`), `new N()` otherwise | `n words`            | `N` `./n.aggregate-root`, `can be instantiated via constructor`                                          |
| Repository*          | `n-repository.ts`            | `NRepository` / `vRepository` | `../../../wiring/repositories/wire-n-repository` | `n words repository` | `INRepository` `../../../infrastructure/repositories/I/I-n-repository`, `can be created via constructor` |
| Service              | `n-L-service.ts`             | `NLService` / `vLService`     | `../../wiring/L-services/wire-n-L-service`       | `n words`            | `NLService` `./n-L-service`, `can be created`                                                            |
| Use case             | `n-use-case.ts`              | `NUseCase` / `vUseCase`       | `../../wiring/use-cases/wire-n-use-case`         | `n words use case`   | `NUseCase` `./n-use-case`, `can be created`                                                              |
| Command              | `n-command.ts`               | `NCommand` / `vCommand`       | `../../wiring/commands/wire-n-command`           | `n words command`    | `INCommand` `../../infrastructure/commands/I/I-n-command`, `can be created via constructor`              |
| Port                 | `n.ts`                       | `N` / `v`                     | `../../wiring/application-ports/wire-n`          | `n words`            | `IN` `../../infrastructure/application-adapters/I/I-n`, `can be created via constructor`                 |

Entities and value objects (`n.entity.ts`, `n.value-object.ts`) follow the aggregate root row. `n words` = the name with spaces instead of hyphens. Queries are the same as commands. \*The repository spec imports the wire first, then `import type { NRepository } from './n-repository'`.
