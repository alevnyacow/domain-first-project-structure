# df-scaffold generators: common parts

Use the JSON interface described in [agent-mode.md](agent-mode.md), with the complete operation map in [agent-operations.md](agent-operations.md). Prompts below are what a generator asks interactively; JSON requests carry the same answers as fields. Generated files and implementation rules are the same.

What every generator shares: notation, the `Dependencies:` step, env-branched wiring and spec templates. Prompts and output of each generator are in `units/<unit>.md`.

Config paths: `project.rootFolder`, `backend.domainFirstPackages`, `backend.testingLibrary`, `backend.withInMemoryDb`, and `frontend.react.storybookFramework`. Initialization/reconfiguration is performed by the user, not the agent.

Notation: `<C>` = `<rootFolder>/bounded-contexts/<context>` or `<rootFolder>/shared-kernel`. `n` = the entered kebab-case name, `N` = PascalCase, `v` = camelCase. `I` = implementation label (`prisma` → `Prisma`). Specs are generated without a prompt **only if `backend.testingLibrary` is set**. `{pkg}` = output depends on that `@domain-first/*` package.

In interactive mode, if the run would replace existing files, the last prompt is the confirm `Overwrite them?` (the files are listed above it). Without it, nothing extra is asked. Added lines (barrels, errors, wiring indexes) never trigger it.

{wire} Generators that create a wire (all except endpoints, which ask their own two selects) then ask for dependencies, before `Overwrite them?`: the checkbox `Dependencies:` interactively, the `dependencies` field in JSON ([agent operations](agent-operations.md#dependency-keys-and-system-implementations)).

The list holds wired modules of `<C>` and of the Shared Kernel (`(shared-kernel)` suffix), grouped in this order: Repositories, Domain services, Ports, Application services, Queries, Commands, Use cases, Infrastructure services, Presentation services. Inside a group: by type name, `<C>` first. Endpoints are never listed. The step is skipped when nothing fits: check `<C>/wiring/`, `<rootFolder>/shared-kernel/wiring/` and neighboring contexts' `wiring/`.

What fits depends on the layer of the class the wire builds:

- domain → domain
- application → domain, application
- infrastructure (repository, command/query, and port implementations, infrastructure services) → domain, application ports (of `<C>` and the Shared Kernel; no other application modules), infrastructure
- presentation → application, presentation

On top of that:

- Domain services see only domain services (no repositories).
- Application services see only ports, commands and queries from application.
- Use cases never see use cases.
- Repository implementations never see repositories.
- Command/query implementations see only infrastructure services, locally and in the Shared Kernel.
- Only port adapters under `infrastructure/application-adapters/cross-context/` also see neighboring queries, commands and use cases labelled `(<context>)`. Imports and constructor names get context-qualified aliases. Query/command implementations have no cross-context exception. This exception is fixed and doesn't expose foreign models, infrastructure or other kinds; other labels keep context isolation. The wire checks each implementation separately, even when several types share its imports. Leave test implementations independent.
- These are the defaults: `backend.rules.dependencies` in the config changes them per kind (`use-cases`, `queries`, …), so go by what the project's rules allow.

Each chosen module goes into the wire (`wireClass(X, [wireUserRepository])`) and the constructor (`private readonly userRepository: UserRepository`, with `import type`), in the same order.

An env-branched wire (repository, command/query, port) wires each implementation in isolation: it asks `Dependencies for <Implementation>:` once per implementation, in the order of the wire (main, then test). Each list leaves out only what that implementation already has, and a list with nothing to choose is skipped.

It may start with a `Suggested` group, which holds only the system service of the implementation: `prisma-infrastructure-service` for `prisma`, `in-memory-db-infrastructure-service` for `in-memory`. It is listed there only and is **checked**: omitting the implementation's group in JSON keeps it, `[]` selects none. Any other service is an ordinary unchecked item in `Infrastructure services`, whatever its name, so select it explicitly.

## Remembered and system implementation types

In interactive mode, implementation prompts are selects. JSON requests use explicit `implementation` / `testImplementation` objects, each with `type` and optional `save`. Read the shared config’s `backend.implementations` section. Categories (`repositories`, `commands`, `queries`, `ports`) and `primary`/`test` lists are independent. Menus contain the relevant saved list, active system implementations and both manual-entry actions. There are no ordinary `api` or `mock` presets. Saved types display their exact name; the first available one is the default, then an available system type, otherwise the save-entry action with an empty input.

Active system choices are explicitly labelled:

- `System: cross-context (calls handlers in another bounded context)` — only port adapters with at least one neighboring context, never Shared Kernel ports.
- `System: in-memory (uses the shared in-memory database)` — only repositories, commands and queries when `backend.withInMemoryDb` is enabled and its service and required wire exist. The DB is still a suggested dependency with wiring. Inactive `in-memory` and port adapters named `in-memory` are ordinary types, not automatic choices.

Saved system labels retain the marker and are not duplicated. **New Implementation** merges primary/test history and available system choices, without introducing ordinary presets.

The two manual actions are `Enter implementation type and save for future use` and `Enter implementation type for this run only`, each followed by a separate text input. Saving stages a new ordinary label in the config’s `backend.implementations` section; run-only entry leaves it unchanged. Both generate source files. This distinction also applies to **New Implementation** after environments are selected. Include the JSON file in generated-file lists when saving a new type; cancellation discards its update too.

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

Without wire: import `<Class>` from `<noWire>`, use `new <Class>()` and the test name `<noWireTest>`.

Only modules without infrastructure have specs. Repositories, commands, queries, ports, infrastructure services and helpers get none: don't create one for them.

| Component            | Spec next to                 | `<Type>` / `<var>`            | `<wirePath>`                                     | `<label>`            | `<Class>` from `<noWire>`, `<noWireTest>`                                                                |
| -------------------- | ---------------------------- | ----------------------------- | ------------------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------- |
| Aggregate root       | `n.aggregate-root.ts`        | `N` / `v`                     | none: `N.of({})` {types} (`can be instantiated via of`), `new N()` otherwise | `n words`            | `N` `./n.aggregate-root`, `can be instantiated via constructor`                                          |
| Service (not infrastructure) | `n-L-service.ts`             | `NLService` / `vLService`     | `../../wiring/L-services/wire-n-L-service`       | `n words`            | `NLService` `./n-L-service`, `can be created`                                                            |
| Use case             | `n-use-case.ts`              | `NUseCase` / `vUseCase`       | `../../wiring/use-cases/wire-n-use-case`         | `n words use case`   | `NUseCase` `./n-use-case`, `can be created`                                                              |

Entities and value objects (`n.entity.ts`, `n.value-object.ts`) follow the aggregate root row. `n words` = the name with spaces instead of hyphens.
