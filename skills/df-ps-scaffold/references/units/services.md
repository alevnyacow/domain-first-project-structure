# Services: domain, application, infrastructure, presentation

When (`../choosing-components.md`, steps 12–15, "Port or service?"):

- **Domain service**: a rule at the junction of several entities / value objects not all belonging to one aggregate, no I/O. It takes the aggregates and values it needs as arguments; loading them is the caller's job. In the Shared Kernel only for junctions of universal types.
- **Application service**: application logic reused by 2+ use cases, with external interaction or storage access delegated to injected ports, commands or queries. A composition needed by one use case stays in it.
- **Infrastructure service**: a technical helper used only by infrastructure code; also the home of a value that isn't a wired module (a database or SDK client, a config value), named after the implementation label (`prisma`, `stripe`).
- **Presentation service**: a helper used only by presentation code.

## Generate (context and Shared Kernel)

Prompts: name → {wire} `Dependencies:` (`../generators.md`). `L` = `domain` | `application` | `infrastructure` | `presentation`.

`… pick:Application "pick:New Service" text:checkout`

- `<C>/L/services/n-L-service.ts` (`class NLService`, e.g. `CheckoutApplicationService`), spec
- {wire} `<C>/wiring/L-services/wire-n-L-service.ts` (`wireClass(X, [])`)

## Implement

- Domain services take and return domain types. Pure: no I/O, ports, or repositories, not even injected ones; they work with the data they are handed. They depend only on other domain services.
- Application services have no `handle`: a use case is how an endpoint reaches their logic. They call injected ports, commands and queries, never external SDKs, HTTP clients, or another context directly.
- Infrastructure services: an external client or config value is created or read by the service itself (`readonly client = new PrismaClient()`), with no constructor parameter for it. Implementations get the service through `df-scaffold`, where it shows up under `Suggested`. Wrap its wire in `memoWire(...)` when one instance must be shared (a connection pool, an in-memory store). No `wireValue(...)`.
- Infrastructure never sees application services. Logic infrastructure needs from one: pure logic without ports → a domain service; logic over ports → call the ports directly; technical (mapping, retries, external API formats) → an infrastructure service.

## Test

Test a service's logic with fake dependencies in its generated spec.
