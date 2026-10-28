# Port

When: something that leaves this context's code and storage: an external system or time (`../choosing-components.md`, step 10, "Port or service?"). Own storage → repository, command or query; another context → a query or command, never a port. One method is enough: a single read from an external system is still a port. Another context is only a folder in `bounded-contexts/`; any other service (another team's API, a SaaS) is external. Wanting to mock a class or imagining multiple implementations is not enough. The `clock` port is always a port, usually in the Shared Kernel.

## Generate (context and Shared Kernel)

Prompts: name → adapter implementation (default `api`) → `With test implementation` → if yes: test implementation (default `mock`) → {wire} `Dependencies for <Implementation>:` per implementation (`../generators.md`).

`… pick:Application "pick:New Port" text:payment-gateway default yes default`

- `<C>/application/ports/n.ts` (abstract `N`; name it after the capability), spec
- `<C>/infrastructure/application-adapters/I/I-n.ts` per implementation (`class IN extends N`)
- {wire} `<C>/wiring/application-ports/wire-n.ts` (env-branched)

## Implement

- Abstract members in the port, described in the capability's terms (`charge(amount: Money)`), not the provider's.
- One implementation per adapter: `api` performs the real interaction (an SDK or HTTP client, through an [infrastructure service](services.md) for the client); `mock`/`fake` is deterministic.
- Use the Shared Kernel `clock` port instead of `new Date()` / `Date.now()` in domain and application code.

## Test

`NODE_ENV=test` wires the test implementation, so the logic that uses the port is tested with it.
