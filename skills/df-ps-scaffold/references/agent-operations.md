# JSON operation catalogue

Read the common protocol in [agent-mode.md](agent-mode.md) first. This catalogue maps every current operation to its fields and gives recipes for cases with extra conditions. The installed `--describe` schema remains authoritative; fields not accepted by that version must not be sent.

One invocation accepts one operation, not an array or a batch. Each invocation saves its own transaction. A successful dry run creates no prerequisites for later requests: dependent operations need their preceding contexts, aggregates, contracts or modules to exist on disk. Run approved prerequisites in plan order and refresh discovery.

## Backend operations: df-scaffold

All operations support `dryRun` and `overwrite`. Except `bounded-context`, they require `context`, using a discovered context name or reserved `shared-kernel`. Names are lowercase kebab-case. The backend must be configured by the owner.

| Operation | Required fields beyond operation/context | Optional fields and conditions |
| --- | --- | --- |
| `bounded-context` | `name`; no `context` | Creates an empty context. `shared-kernel` is a reserved name. |
| `aggregate` | `name` | `withRepository` defaults to false. True requires `implementation`; may also use `testImplementation` and `dependencies`. These repository fields do not apply when `withRepository` is false. Bounded contexts only. |
| `entity` | `name` | `aggregate` selects an existing aggregate in the same context; omitted means a standalone domain entity. |
| `value-object` | `name` | Same aggregate rules as entity. |
| `error` | `name` | `namespace` selects an existing namespace; omitted appends to the context's root error namespace. |
| `error-namespace` | `name` | Creates a namespace, not an error class. Create it before requesting an error in that namespace. |
| `domain-service` | `name` | `dependencies`, when wiring is configured and eligible modules exist. |
| `application-service` | `name` | `dependencies`, with the same conditions. |
| `infrastructure-service` | `name` | `dependencies`, with the same conditions. |
| `presentation-service` | `name` | `dependencies`, with the same conditions. |
| `use-case` | `name` | `dependencies`. Bounded contexts only. |
| `command` | `name`, `implementation` | `testImplementation`, `dependencies`. Bounded contexts only. |
| `query` | `name`, `implementation` | `testImplementation`, `dependencies`. Bounded contexts only. |
| `port` | `name`, `implementation` | `testImplementation`, `dependencies`. `cross-context` is available only with a neighboring context, never in Shared Kernel. |
| `implementation` | `contract`, `implementation` | For a usable branched wire, `environments` is required and nonempty; otherwise omit it. `dependencies` is available for the newly added implementation when wiring applies. |
| `endpoint` | `controller`, `method`, `path` | REST package and generator must exist. With wiring and selectable handlers, provide `handler`. Without selectable handlers, omit it; the generated handler remains `never` and needs a later approved generator rerun. |
| `wire-dependency` | `module`, `dependencies` | `module` is a wiring target ID, not a contract/unit ID. Adds only eligible dependencies not already wired to that implementation. |
| `move` | `module` | `module` is a unit ID. Optional `name`, `targetContext`, `aggregate`; omitted name/context keep the existing ones. A same-owner entity/value-object keeps its aggregate by default. The target aggregate must exist; the target context must be a discovered, allowed destination for that unit kind. Illegal cross-context imports reject the move. |

`implementation` and `testImplementation` contain `type` and optional `save` (default false). Explicit types can be new ordinary names; they need not already be saved. Saving is independent for primary and test roles. The test type must differ from the primary type. Adding a new implementation remembers a saved type according to the selected environments: `test` or primary for other environments. Branches are `backend.envBranches.names` from the config (`test`, `development`, `production` when absent), with `backend.envBranches.test` as the test one; additional names must be offered by the existing branched wire. Custom branches without `test` take no test implementations: omit `testImplementation`. Without usable branching, omit `environments` and follow the returned wiring note.

## Dependency keys and system implementations

The keys in `dependencies` identify concrete classes, while the values identify dependencies by qualified IDs:

| Consumer | Key example |
| --- | --- |
| Repository implementation of aggregate `order` | `PrismaOrderRepository` |
| Query / command implementation | `PrismaOrdersQuery`, `SqlPayCommand` |
| Port adapter | `CrossContextBillingGateway`, `MockBillingGateway` |
| Service | `PricingDomainService`, `PaymentApplicationService`, `PrismaInfrastructureService`, `HttpPresentationService` |
| Use case | `PlaceOrderUseCase` |

For existing modules, copy the class from `modules[].implementations[].className`; for newly generated modules use the unit's naming rules. Never use the abstract contract name as an implementation key.

Omitted groups retain checked suggestions; `[]` explicitly chooses none when that dependency selection applies. With no eligible candidates the generator skips that selection: omit its group, including an empty one. Without `@domain-first/wire`, omit `dependencies` entirely. A group for another class, an already-wired dependency in an add operation, or an inapplicable option produces a failure rather than being silently ignored. An `UNUSED_PARAMETERS` error means the selection did not apply; verify the class and conditions before removing a field.

With the shared in-memory DB enabled and its files ready, the system `in-memory` type receives its DB through the usual suggested wiring. Without wiring the generator passes the DB through its existing constructor logic. Without the ready integration it is an ordinary name and generates no DB behavior. For ports, `in-memory` is always an ordinary label.

Example query with independent primary and test dependencies (assumes the displayed services exist and in-memory DB is active):

```json
{
  "operation": "query",
  "context": "sales",
  "name": "orders",
  "implementation": { "type": "prisma", "save": true },
  "testImplementation": { "type": "in-memory", "save": false },
  "dependencies": {
    "PrismaOrdersQuery": ["shared-kernel:PrismaInfrastructureService"],
    "InMemoryOrdersQuery": ["shared-kernel:InMemoryDbInfrastructureService"]
  }
}
```

Example direct call through a consuming context's port (assumes `billing:InvoiceQuery` exists):

```json
{
  "operation": "port",
  "context": "sales",
  "name": "billing-gateway",
  "implementation": { "type": "cross-context", "save": false },
  "dependencies": {
    "CrossContextBillingGateway": ["billing:InvoiceQuery"]
  }
}
```

This generates the adapter and injection only; define the port's methods and map inputs, outputs and errors as described in [port.md](units/port.md). It does not make foreign models or other module kinds accessible.

Adding a test implementation to an existing contract, then adding a dependency to the primary one are separate operations:

```json
{
  "operation": "implementation",
  "context": "sales",
  "contract": "query:orders",
  "implementation": { "type": "fake", "save": true },
  "environments": ["test"]
}
```

```json
{
  "operation": "wire-dependency",
  "context": "sales",
  "module": "sales:OrdersQuery:PrismaOrdersQuery",
  "dependencies": {
    "PrismaOrdersQuery": ["shared-kernel:ClockInfrastructureService"]
  }
}
```

The latter assumes Clock is eligible and not already wired. Refresh `--describe` first; a dependency forbidden by its rules is not a reason to add it manually.

## React operations: df-react

The owner configures frontend first. React and Next.js use the same operations. Story generation follows `frontend.react.storybookFramework`; there is no Storybook option on individual requests.

| Operation | Required fields | Optional fields and conditions |
| --- | --- | --- |
| `page` | `name` | Names may contain folders, e.g. `admin/orders`. With Next.js, also creates the App Router route `app/admin/orders/page.tsx` unless it exists. |
| `widget` | `name` | Nested names allowed. `widgetType`: `separated` (default), `headless`, `monolithic`; use the JSON value `separated`, not the menu label `with separated ui`. |
| `ui-kit-component` | `name` | Single kebab-case name; stories follow config. |
| `shared-hook` | `name` | Single kebab-case name, preferably without `use-`; a leading `use-` is stripped. |
| `move-page` | `module`, `name` | `module` is the existing nested page name from discovery; `name` is the target nested name. With Next.js and a route at the page path that renders the page, `moveRoute` (default true) moves that route folder's own files to the new path, changing the URL; `false` keeps the route with its import updated. Omit `moveRoute` when there is no such route. |
| `move-widget` | `module`, `name` | Same for widgets. Files, imports, code names and generated story titles follow the move. |

All support `dryRun` and `overwrite`. Use CLI moves even for a rename or folder regrouping; an existing target or a move into itself is rejected.

## Integrations: df-integration

Use `operation: "add"` and a nonempty `integrations` array. Select only IDs marked available by discovery. They run in the fixed order below, regardless of request order, so later integrations see earlier staged changes.

| Integration ID | Relevant fields and conditions |
| --- | --- |
| `storybook` | Shared React + Vite setup. `configureReact` is required when React is absent or another Storybook framework is configured; true aligns it with the shared preset, false skips this setup. |
| `rest-endpoint-generator` | Backend must have `@domain-first/handlers-rest`. `nextAdapter` applies only when `frontend.react.framework` is `next`; omitted means no Next adapter in JSON mode. Existing support files are preserved with a manual connection note as needed. |
| `in-memory-db` | Backend required. Enables the DB flag and restores missing support files while keeping edited files. No extra fields. |
| `prisma` | Backend required. `withService` defaults to true; false skips the infrastructure service and its wire. Registers `prisma` implementation choices. Existing incompatible Prisma setups are rejected rather than upgraded. |
| `vitest` | Backend required. `replaceTestingLibrary` is required if a different testing library is configured; true changes it to Vitest, false skips this setup. |
| `playwright` | No extra integration-specific fields. Adds its config, example and scripts. |
| `testcontainers` | Backend required. No extra fields. Reads staged Prisma/Vitest setup when selected together. Database scripts are generated, not executed. |
| `openapi` | Backend with `handlers-rest`. `routePrefix` defaults to `/api`; `openapiPath` is computed from the project unless supplied. `withExtractor` defaults to true. `swaggerPage` applies only with React configured and defaults to true there; otherwise omit it. |
| `orval` | Requires configured `handlers-rest`. `openapiPath` is read from the staged/existing OpenAPI generator when omitted. With React configured, `targets` can be a nonempty list of `hooks`/`client` and defaults to `hooks`. Without React, omit `targets`: the typed client is generated automatically. |

Fields for integrations not selected, or for conditions that do not apply, must be omitted. For example, `targets` on a non-React project and `nextAdapter` on an explicitly React project are unused parameters. If OpenAPI and Orval are selected together, a supplied `openapiPath` applies to both.

Integration flags may change their own configuration metadata as part of the authorized integration operation. They do not authorize running `df-init` or manually rewriting unrelated project settings. Install commands and notes stay in `nextSteps`; do not assume anything was installed or any project script ran.

Script conflicts require `scriptConflicts` keyed by the **original** script name. Values are `keep`, `replace`, `rename`. With `rename`, also supply `scriptNames` for that original name; the new name must be unused and valid. Supply decisions only for actual conflicts, or they are unused parameters.

```json
{
  "operation": "add",
  "integrations": ["storybook"],
  "scriptConflicts": { "storybook": "rename" },
  "scriptNames": { "storybook": "storybook:domain-first" }
}
```

For replacing generated integration files, review `dryRun: true` and apply the existing overwrite rules. Reapplying an integration may preserve edited support files instead of replacing them; inspect `messages` and `nextSteps` for manual follow-up. Do not hand-write missing integration output as a workaround.
