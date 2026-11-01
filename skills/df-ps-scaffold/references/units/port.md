# Port

When: a capability across this context's boundary: another bounded context, an external system, time or configuration (`../choosing-components.md`, steps 9–10). Own aggregate persistence → repository; atomic operations on this context's own storage → command/query. One method is enough. Wanting to mock a class or imagining multiple implementations does not by itself establish a boundary. The `clock` and `config` ports usually belong in the Shared Kernel.

## Generate (context and Shared Kernel)

Prompts: name → primary adapter select → `With test implementation` → test adapter select if yes → {wire} dependencies per adapter. Both selects show saved port types for their role, active system types and both manual-entry actions (`../generators.md`). The only automatic system choice is `System: cross-context (calls handlers in another bounded context)`, conditional on a neighboring context and unavailable in the Shared Kernel. No `api`, `mock` or `in-memory` presets are inserted for ports. The first saved/system choice is the default; manual input is empty without saved choices. Existing labels are disabled. Saved ordinary port types are isolated from other categories. Save-entry updates `ports` history; run-only entry generates the adapter without updating the catalog.

`… pick:Application "pick:New Port" text:payment-gateway "pick:Enter implementation type and save for future use" text:api yes "pick:Enter implementation type and save for future use" text:mock`
`… pick:Application "pick:New Port" text:billing-gateway "pick:System: cross-context" yes "pick:Enter implementation type for this run only" text:mock`

- `<C>/application/ports/n.ts` (abstract `N`; name it after the capability), spec
- `<C>/infrastructure/application-adapters/I/I-n.ts` per implementation (`class IN extends N`)
- {wire} `<C>/wiring/application-ports/wire-n.ts` (env-branched)

## Implement

- Abstract members in the port, described in the capability's terms (`charge(amount: Money)`), not the provider's.
- For another context, define the port in the consuming context with its own models and errors. A `cross-context` adapter can inject queries, commands and use cases from any neighboring context; choices are labelled `(<context>)` and names get context-qualified aliases. Only this adapter imports neighboring handler types, and only its matching wiring imports their factories. Never import foreign models, errors, repositories, ports, services, infrastructure or barrels.
- Implement the capability's methods by mapping input, invoking injected handlers, and mapping results/errors. The CLI creates the contract, adapters and dependencies; it does not generate methods or delegation. Keep business coordination in the consuming use case.
- One implementation per adapter: `api` performs the real interaction (an SDK or HTTP client, through an [infrastructure service](services.md) for the client); `mock`/`fake` is deterministic.
- Use the Shared Kernel `clock` port instead of `new Date()` / `Date.now()` in domain and application code, and a `config` port instead of `process.env` / `import.meta.env`. Its adapter reads the environment; infrastructure and wiring may read it directly.

## Test

Use a deterministic `mock`/`stub` adapter so tests do not run neighboring contexts. `NODE_ENV=test` wires the test implementation, so the logic that uses the port is tested with it.
