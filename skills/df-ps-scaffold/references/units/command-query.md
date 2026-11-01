# Command and query

When (`../choosing-components.md`, step 11): one atomic read/write on this context's own storage that is not "load/save one aggregate" (read model, report, bulk update). Another context or external system is reached through a port (`port.md`).

- One atomic operation of one kind of storage implementation: several statements in one transaction count as one. Several operations, a mix of storages, or logic between steps → several queries/commands, composed in a use case.
- A query only reads: it never changes any state, not even idempotently, and never calls a command. A command returns nothing or the minimum needed to use its result later (e.g. a created ID); read changed data with a query.

## Generate (context only)

Prompts: name → primary implementation select → `Add a test implementation` → test implementation select if yes → {wire} dependencies per implementation. Menus contain saved types from `commands` or `queries` for the selected role, active system types and both manual-entry actions (`../generators.md`). Only `System: in-memory (uses the shared in-memory database)` can be automatic here, when its integration is ready. `api` and `mock` must be saved or entered manually. The first saved/system choice is the default, otherwise manual entry without a suggested name. Saving stages the new ordinary label for that category/role; run-only input leaves the catalog unchanged.

`… pick:Application "pick:New Command" text:place-order "pick:Enter implementation type and save for future use" text:prisma yes "pick:System: in-memory"` (with the shared DB ready).
`… pick:Application "pick:New Query" text:order-summary "pick:Enter implementation type for this run only" text:sql no`

- `<C>/application/commands/n-command.ts`: abstract `NCommand` ({handlers} schemas + abstract `handle: Handler<…>`), spec
- `<C>/infrastructure/commands/I/I-n-command.ts` per implementation (`extends NCommand`, implements `handle`)
- {wire} `<C>/wiring/commands/wire-n-command.ts` (env-branched)
- With `backend.withInMemoryDb` in the config, the `in-memory` implementation can get the whole DB: `constructor(private readonly inMemoryDbInfrastructureService: InMemoryDbInfrastructureService)`. No section is added. Without {wire} this always happens; {wire} it is the checked `Suggested` choice of `Dependencies for InMemoryN<Suffix>:`, and unchecking it leaves the implementation empty.

Queries: the same with `query` / `queries`.

## Implement

- Queries and commands never import neighboring contexts. `cross-context` is reserved for port adapters and is unavailable here, including as a custom label.
- {handlers} The abstract contract holds static schemas and `abstract handle`; replace the `{}` schemas with real ones. Each infrastructure implementation defines `handle` with the contract's schemas and writes its `handler` callback.
- An implementation performs its one operation with no business logic or surrounding steps. Its wired dependencies are infrastructure services (the database client it runs on); repositories, ports, domain services and other queries/commands stay with the consuming use case.
- Input/output use this context's domain models; time comes through input, never through the clock port.
- An `in-memory` implementation works on the in-memory DB when configured; `mock`/`stub` implementations may return fixed data.

## Test

Extend the generated spec: the handler against the test implementation via `handle(...)`.
