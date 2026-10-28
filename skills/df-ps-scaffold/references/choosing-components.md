# Choosing the component for a piece of logic

The only place where these rules live. What each kind of module may depend on is the default; `rules.dependencies` in the project's config can change it (e.g. let use cases call each other), and then the config wins.

Split the request into pieces of logic (one responsibility each). For each piece, go through the steps **in order**: the first "yes" decides. A name the user used ("service", "gateway") is not a decision.

## Procedure

| # | Question | Component |
| --- | --- | --- |
| 1 | A business failure callers must recognize? | **Errors** (Domain → Errors) |
| 2 | An HTTP entry point? | **REST endpoint** (Presentation; needs handlers-rest) |
| 3 | A screen, UI block, or app-wide React hook? | **React page / widget / UI-kit component / shared hook**. Which one: `df-ps-react` |
| 4 | A thing with identity, lifecycle, and rules about its own state, **owned by this context** and stored on its own? | **Aggregate** (+ repository) |
| 5 | An entity or value object used **only inside one** aggregate (an entity inside it, or a value like `order-id` used only by `order`)? | **Entity / value object** (Domain → New Entity / New Value Object, pick that aggregate) |
| 6 | An entity or value object used by **several** aggregates or by a domain service? | **Entity / value object** (Domain → New Entity / New Value Object, `No aggregate`). Universal ones (see "Where it goes") in Shared Kernel |
| 7 | A rule about one aggregate's own state, including the junction of entities / value objects that all belong to it? | **Method on the aggregate**. No new file |
| 8 | One business action a user/system triggers that doesn't fit into a single query or command? (Its I/O is separate pieces.) | **Use case**. An action that is exactly one query or command gets none (see below) |
| 9 | Data or behavior of **another context**? | **Query** (read) / **command** (write) in this context, one per atomic operation (see below) |
| 10 | Leaves this context's code and storage: external system or time? | **Port** (+ adapters) |
| 11 | One atomic read/write on this context's own storage that isn't "load/save one aggregate" (read model, report, bulk update)? | **Command** (write) / **query** (read) |
| 12 | A rule at the junction of several entities / value objects not all belonging to one aggregate (a discount from purchase history and the current discount), no I/O? | **Domain service**, always. It takes the aggregates and values it needs as arguments; loading them is the caller's job (use case, application service) |
| 13 | Application logic reused by 2+ use cases, with any external interaction or storage access delegated to injected ports, commands or queries? | **Application service** |
| 14 | A technical helper used only by infrastructure code? | **Infrastructure service** |
| 15 | A helper used only by presentation code? | **Presentation service** |
| — | None of the above | A method or function in an existing file |

- Entities and value objects are **rich**: rules about their own data, including how they are created, are their methods. They never know about their storage or loading: that's repositories and queries/commands.
- Loading/saving one aggregate = a **repository method**, not a query or command.
- A query or command is **one atomic operation of one kind of implementation**: one database operation (several statements in one transaction count as one), one request to another context's endpoint, one message sent to another context (an external API is never a query or command: it's a port). Its implementations differ only in how they perform that operation (`prisma`, `http`, `in-memory`). Several operations, a mix of storages, or logic between the steps → several queries/commands, composed in the use case that needs them; only when 2+ use cases need the same composition does it move to an application service (step 13).
- **No proxy use cases.** Every query and command is a handler, so an endpoint uses it directly. A use case that only forwards the call to one query or command adds nothing: don't create it. A use case appears only when the action needs several queries, commands or ports, or logic around them. A use case whose logic lives in an application service is not a proxy: an application service has no `handle`, so the use case is how an endpoint reaches that logic.
- A rule about a **set** of aggregates (uniqueness, "at most N per day") = a repository method that queries it, plus a check and a domain error in the use case. No separate component.
- Steps 9–10 beat 11–15. The other-context or external part becomes a query/command or a port. What remains may be a service that **receives it in its constructor**.
- Another context (step 9): input/output are this context's own models, duplicated in its terms, never the other context's. The implementation reaches the other context the simplest available way: a shared database → directly (the persistence label, e.g. `prisma`); otherwise the way chosen by `df-ps-plan-feature` (step 3, rule 4): if the project has several ways to reach a context (REST, message queue, RPC…), ask the user; with REST only, its REST endpoint (`http`). The test implementation returns fixed data. No imports from the other context.
- Another way to perform an **existing** repository, command, query or port (another storage, provider or environment) is a new implementation of it (Infrastructure → New Implementation, `units/implementation.md`), not a new contract.
- Don't create components "just in case": a command only when storage access deserves its own contract, an application service only when reused.

## Port or service?

- A **port** describes a capability at the boundary: an external system or time. Its adapter performs the actual interaction. Own storage still follows the repository / command / query rules above. Another context is not a port: it's a query/command (step 9).
- An **application service** contains reusable application logic and may call injected ports, commands and queries. It does not call external SDKs, HTTP clients, or another context directly. A domain service remains pure: no I/O, ports, or repositories, not even injected ones; it works with the data it is handed.
- Wanting to mock a class or imagining multiple implementations is not enough to make it a port. Identify the boundary capability first. Ports get swappable adapters and a test implementation under `NODE_ENV=test`; test a service's logic with fake dependencies.

Example: `order-confirmation` prepares a message and calls the injected `mailer` port. It stays an application service; the mailer adapter calls the email provider. Tests use a fake mailer and exercise the real service.

## Commonly confused

| Pair | Rule |
| --- | --- |
| Port / repository | Own aggregate's persistence → repository. External system → port. |
| Port / command, query | Own storage or another context → command/query. External system → port. |
| Port with one method / query | Decided by what's on the other side, not by the number of methods: a single read from an external system is still a port. Another context = a folder in `bounded-contexts/` of this project; any other service (another team's API, a SaaS) is an external system → port. |
| Query / command | A query only reads: it never changes any state, not even idempotently (no cache filling, no default settings created if missing), and never calls a command. Any state change → command. A command returns nothing or only the minimum needed to use its result later (the created order's ID), never the changed data: read that with a query. A command or query implementation depends only on infrastructure services (the database client, the HTTP client it runs on) and uses domain models; no repositories, ports, domain services or other commands and queries. Composing them is the job of a use case or an application service. |
| Domain service / entity, value object method | One entity / value object → its method. The junction of several → always a domain service, unless they all belong to one aggregate → a method on that aggregate. |
| Domain / application service | Stated without requests, permissions, responses, scenarios → domain. Otherwise application. |
| Use case / application service | Use case = one action with `handle`, the entry point an endpoint calls. Application service = helper with no `handle`, used by 2+ use cases. A composition of queries/commands needed by one action stays in its use case; the same composition needed by several → application service, called by each of those use cases. |
| Application / infrastructure service | Used by use cases → application. Only by adapters/repositories → infrastructure. |
| Logic infrastructure needs from an application service | Infrastructure never sees application services. Pure logic without ports → domain service. Logic over ports → infrastructure calls the ports directly. Technical (mapping, retries, external API formats) → infrastructure service. |
| Clock | Always a port (`clock`, usually in Shared Kernel). A command or query never uses it: the use case reads the time and passes it in the input. |

## Where it goes

- Default: the context that owns the data and rules (`df-ps-plan-feature`, step 3).
- Shared Kernel: technical, ownerless pieces (`clock`, `mailer` ports, shared HTTP client, errors like `unauthorized`) and **universal** entities / value objects: the same meaning and rules in every context, owned by none (`money`, `email`, `address`). A Shared Kernel domain service holds rules at the junction of these universal types only. Anything with one context's meaning or rules (`order-status`, `customer`) stays in that context, even if other contexts need it; they duplicate it in their own queries/commands.
- Another context's data or behavior → a query/command in the consuming context (step 9).

## Example

*"On order placement, check the promo code (owned by `marketing`) and email a confirmation, also sent on reorder. Discount ≤ 30% of the order. Gold customers get free shipping on orders over 100."*

| Piece | Step | Result (context `sales` unless noted) |
| --- | --- | --- |
| Order, customer | 4 | aggregates `order`, `customer` + repositories |
| Order line | 5 | `order-line.entity.ts` in `order` (used only by `order`) |
| Money | 6 | `domain/value-objects/money.value-object.ts` (used by `order` and `shipping-policy`) |
| "Can't pay twice" | 7 | `Order.pay()` |
| Discount ≤ 30% | 7 | `Order.applyDiscount()`: a rule about one aggregate's state; the use case passes the discount it got from the query |
| Place order, reorder | 8 | use cases `place-order`, `reorder` |
| Promo code check | 9 | query `promo-code-discount`: `prisma` if `marketing` shares the database, otherwise `http` to its endpoint |
| Email, order date | 10 | ports `mailer`, `clock` (Shared Kernel) |
| Free shipping for gold customers | 13 | domain service `shipping-policy`: takes `customer` and `order`, no I/O |
| Confirmation for both use cases | 14 | application service `order-confirmation` (gets `mailer`) |
| Invalid promo code | 1 | error `invalid-promo-code` in namespace `order` |
| `POST /sales/orders` | 2 | endpoint, controller `orders` |
