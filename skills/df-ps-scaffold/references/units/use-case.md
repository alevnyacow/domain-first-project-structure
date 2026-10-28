# Use case

When: one business action a user or system triggers that doesn't fit into a single query or command (`../choosing-components.md`, step 8). **No proxy use cases**: an action that is exactly one query or command gets none, because every query and command is a handler an endpoint can use directly. A use case whose logic lives in an application service is not a proxy.

## Generate (context only)

Prompts: name → {wire} `Dependencies:` (`../generators.md`; use cases never see use cases by default).

`… pick:Application "pick:New Use Case" text:place-order`

- `<C>/application/use-cases/n-use-case.ts`: {handlers} schemas + `handle = defineHandler(...)`, else an empty class; spec
- {wire} `<C>/wiring/use-cases/wire-n-use-case.ts`

Generate its dependencies (repositories, ports, commands, queries, application services) first, so `Dependencies:` lists them.

## Implement

- {handlers} The member is `handle = defineHandler({ inputSchema, outputSchema, handler })`. Replace the static `{}` schemas with real ones and write the logic in the `handler` callback; dependencies come through the constructor.
- It composes repositories, ports, commands, queries and domain services: loads aggregates, calls their methods, saves them. Reading the time: the `clock` port, then pass the time into commands and queries in their input.
- A rule about a set of aggregates: a repository method that queries it, plus a check and a domain error here.
- Call others' handlers with `x.handle(input)` (returns a result) or `x.handle.unsafe(input)` (throws).

## Test

Extend the generated spec with handler tests via `handle(...)`, wired with test implementations (`NODE_ENV=test`).
