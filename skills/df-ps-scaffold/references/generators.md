# df-scaffold generators: common parts

What every generator shares: notation, the `Dependencies:` step, env-branched wiring and spec templates. Prompts and output of each generator are in `units/<unit>.md`.

Notation: `<C>` = `<rootFolder>/bounded-contexts/<context>` or `<rootFolder>/shared-kernel`. `n` = the entered kebab-case name, `N` = PascalCase, `v` = camelCase. `I` = implementation label (`prisma` → `Prisma`). Specs are generated without a prompt **only if `testingLibrary` is set**. `{pkg}` = output depends on that `@domain-first/*` package.

Every step list starts with `"pick:Bounded Context: <ctx>"` or `"pick:Shared Kernel"`, then the layer, then the operation (abbreviated below as `…`).

Any generator: if the run would replace existing files, the last prompt is the confirm `Overwrite them?` (the files are listed above it). Without it, nothing extra is asked. Added lines (barrels, errors, wiring indexes) never trigger it.

{wire} Generators that create a wire (all except endpoints, which ask their own two selects) then ask the checkbox `Dependencies:`, before `Overwrite them?`. It lists wired modules of `<C>` and of the Shared Kernel (`(shared-kernel)` suffix), grouped under headers in this order: Repositories, Domain services, Ports, Application services, Queries, Commands, Use cases, Infrastructure services, Presentation services. Inside a group: by type name, `<C>` first. Headers are not counted: `toggle:<n,..>` numbers only modules, top to bottom. Answer `toggle:<n,..>` or `none`. It is skipped when nothing fits, so check `<C>/wiring/` and `<rootFolder>/shared-kernel/wiring/` before counting steps. What fits depends on the layer of the class the wire builds: domain → domain; application → domain, application; infrastructure (repository, command/query, and port implementations, infrastructure services) → domain, application ports (of `<C>` and the Shared Kernel; no other application modules), infrastructure; presentation → application, presentation. On top of that, domain services see only domain services (no repositories), application services see only ports, commands and queries from application, use cases never see use cases, repository implementations never see repositories, command/query implementations see only infrastructure services. These are the defaults: `rules.dependencies` in the config changes them per kind (`use-cases`, `queries`, …), so count items from what the project's rules allow. Endpoints are never listed. Each chosen module goes into the wire (`wireClass(X, [wireUserRepository])`) and the constructor (`private readonly userRepository: UserRepository`, with `import type`), in the same order. An env-branched wire (repository, command/query, port) wires each implementation in isolation: instead of `Dependencies:` it asks `Dependencies for <Implementation>:` once per implementation, in the order of the wire (main, then test). Each list leaves out only what that implementation already has, and a list with nothing to choose is skipped. It may start with a `Suggested` group: infrastructure modules whose file name has the implementation label (its folder, e.g. `prisma`, `in-memory`) as whole words, such as `in-memory-db-infrastructure-service` for `in-memory`. They are listed there only, so numbering starts with them, and they are **checked**: `none` keeps them, `toggle:<n>` on one of them unchecks it.

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
