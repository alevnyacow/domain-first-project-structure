# Use case

When: one business action a user or system triggers that doesn't fit into a single query or command (`../choosing-components.md`, step 8). **No proxy use cases**: an action that is exactly one query or command gets none, because every query and command is a handler an endpoint can use directly. A use case is also the handler for an action that calls a port: the port has capability methods, not `handle`. A use case whose logic lives in an application service is not a proxy.

## Generate (context only)

Prompts: name → {wire} `Dependencies:` (`../generators.md`; use cases never see use cases by default).

- `<C>/application/use-cases/n-use-case.ts`: {handlers} schemas + `handle = defineHandler(...)`, else an empty class; spec
- {wire} `<C>/wiring/use-cases/wire-n-use-case.ts`

Generate its dependencies (repositories, ports, commands, queries, application services) first, so `Dependencies:` lists them.

## Implement

- {handlers} The member is `handle = defineHandler({ inputSchema, outputSchema, handler })`. Replace the static `{}` schemas with real ones and write the logic in the `handler` callback; dependencies come through the constructor.
- It composes repositories, ports, commands, queries and domain services: loads aggregates, calls their methods, saves them. Reading the time: the `clock` port, then pass the time into commands and queries in their input.
- A rule about a set of aggregates: a repository method that queries it, plus a check and a domain error here.
- **The use case checks that its input makes sense.** The HTTP layer checks the shape of each request part: types, formats, required fields (through the value objects' schemas). Whether the input as a whole makes sense for the scenario ("at least one field to change") is the use case's job. It throws a domain error (`NothingToEdit`), and the endpoint maps it in `errors` (`httpError(NothingToEdit, 400)`). Don't express such conditions with `refine` in the request schema or the use case's `inputSchema`, or with checks in `mapInput`: the client would get a generic `invalid-request`, and other callers of the use case would skip the check. If the endpoint calls a single command or query, such a check is a reason to add a use case: it isn't a proxy.
- Call others' handlers with `x.handle(input)` (returns a result) or `x.handle.unsafe(input)` (throws).

## Test

Extend the generated spec with handler tests via `handle(...)`, wired with test implementations (`NODE_ENV=test`).
