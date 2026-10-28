# Command and query

When (`../choosing-components.md`, steps 9 and 11): data or behavior of **another context**, or one atomic read/write on this context's own storage that isn't "load/save one aggregate" (read model, report, bulk update). A query reads, a command writes.

- **One atomic operation of one kind of implementation**: one database operation (several statements in one transaction count as one), one request to another context's endpoint, one message sent to another context (an external API is never a query or command: it's a port). Several operations, a mix of storages, or logic between the steps → several queries/commands, composed in a use case.
- A query only reads: it never changes any state, not even idempotently (no cache filling, no default settings created if missing), and never calls a command. A command returns nothing or only the minimum needed to use its result later (the created order's ID), never the changed data: read that with a query.
- Another context: input/output are this context's own models, duplicated in its terms. The implementation reaches it the simplest available way: a shared database → directly (the persistence label, e.g. `prisma`); otherwise the way chosen in the plan (`df-ps-plan-feature`, step 3, rule 4), by default its REST endpoint (`http`). No imports from the other context.

## Generate (context only)

Prompts: name → implementation (default = config persistence label) → `Add a test implementation` → if yes: test implementation (default `in-memory`) → {wire} `Dependencies for <Implementation>:` per implementation (`../generators.md`).

`… pick:Application "pick:New Command" text:place-order default yes default`
`… pick:Application "pick:New Query" text:order-summary default no`

- `<C>/application/commands/n-command.ts`: abstract `NCommand` ({handlers} schemas + abstract `handle: Handler<…>`), spec
- `<C>/infrastructure/commands/I/I-n-command.ts` per implementation (`extends NCommand`, implements `handle`)
- {wire} `<C>/wiring/commands/wire-n-command.ts` (env-branched)
- With `withInMemoryDb` in the config, the `in-memory` implementation can get the whole DB: `constructor(private readonly inMemoryDbInfrastructureService: InMemoryDbInfrastructureService)`. No section is added. Without {wire} this always happens; {wire} it is the checked `Suggested` choice of `Dependencies for InMemoryN<Suffix>:`, and unchecking it leaves the implementation empty.

Queries: the same with `query` / `queries`.

## Implement

- {handlers} The abstract contract holds the static schemas and `abstract handle`; replace the `{}` schemas with real ones. Each infrastructure implementation defines `handle` with the contract's schemas and writes only its `handler` callback.
- An implementation performs its one operation: no business logic, no steps around it. Its only wired dependencies are infrastructure services (the client it runs on); repositories, ports, domain services and other commands and queries stay with the use case. Needing more → it's several commands/queries.
- It uses domain models in its input/output; the time comes in the input, never from the `clock` port.
- The test implementation returns fixed data (another context) or works on the in-memory DB (own storage), so tests never run another context.

## Test

Extend the generated spec: the handler against the test implementation via `handle(...)`.
