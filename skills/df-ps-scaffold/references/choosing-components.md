# Choosing the component for a piece of logic

The only place where these rules live.

Split the request into pieces of logic (one responsibility each). For each piece, go through the steps **in order**: the first "yes" decides. A name the user used ("service", "gateway") is not a decision.

## Procedure

| # | Question | Component |
| --- | --- | --- |
| 1 | A business failure callers must recognize? | **Errors** (Domain → Errors) |
| 2 | An HTTP entry point? | **REST endpoint** (Presentation; needs handlers-rest) |
| 3 | A screen, UI block, or app-wide React hook? | **React page / widget / UI-kit component / shared hook**. Which one and widget type: below |
| 4 | A thing with identity, lifecycle, and rules about its own state, **owned by this context** and stored on its own? | **Aggregate** (+ repository) |
| 5 | An entity or value object used **only inside one** aggregate (an entity inside it, or a value like `order-id` used only by `order`)? | **Entity / value object** (Domain → New Entity / New Value Object, pick that aggregate) |
| 6 | An entity or value object used by **several** aggregates or by a domain service? | **Entity / value object** (Domain → New Entity / New Value Object, `No aggregate`). Universal ones (see "Where it goes") in Shared Layer |
| 7 | A rule about one aggregate's own state, including the junction of entities / value objects that all belong to it? | **Method on the aggregate**. No new file |
| 8 | One business action a user/system triggers? (Its I/O is separate pieces.) | **Use case** |
| 9 | Data or behavior of **another context**? | **Execution query** (read) / **execution command** (write) in this context (see below) |
| 10 | Leaves this context's code and storage: external system or time? | **Port** (+ adapters) |
| 11 | One read/write on this context's own storage that isn't "load/save one aggregate" (read model, report, bulk update)? | **Execution command** (write) / **query** (read) |
| 12 | A reusable read/write composed of other commands/queries/ports? | **Orchestrator command / query** |
| 13 | A rule at the junction of several entities / value objects not all belonging to one aggregate (a discount from purchase history and the current discount), no I/O? | **Domain service**, always |
| 14 | Application logic reused by 2+ use cases, with any external interaction delegated to injected ports? | **Application service** |
| 15 | A technical helper used only by infrastructure code? | **Infrastructure service** |
| 16 | A helper used only by presentation code? | **Presentation service** |
| — | None of the above | A method or function in an existing file |

- Entities and value objects are **rich**: rules about their own data, including how they are created, are their methods. They never know about their storage or loading: that's repositories and execution queries/commands.
- Loading/saving one aggregate = a **repository method**, not a query or command.
- A rule about a **set** of aggregates (uniqueness, "at most N per day") = a repository method that queries it, plus a check and a domain error in the use case. No separate component.
- Steps 9–10 beat 11–16. The other-context or external part becomes an execution query/command or a port. What remains may be a service that **receives it in its constructor**.
- Another context (step 9): input/output are this context's own models, duplicated in its terms, never the other context's. The implementation reaches the other context the simplest available way: a shared database → directly (the persistence label, e.g. `prisma`); otherwise the way chosen by `df-ps-plan-feature` (step 3, rule 4): if the project has several ways to reach a context (REST, message queue, RPC…), ask the user; with REST only, its REST endpoint (`http`). The test implementation returns fixed data. No imports from the other context.
- Don't create components "just in case": a command only when storage access deserves its own contract, an application service only when reused.

## Port or service?

- A **port** describes a capability at the boundary: an external system or time. Its adapter performs the actual interaction. Own storage still follows the repository / execution command / query rules above. Another context is not a port: it's an execution query/command (step 9).
- An **application service** contains reusable application logic and may call injected ports. It does not call external SDKs, HTTP clients, or another context directly. A domain service remains pure: no I/O, ports, or repositories.
- Wanting to mock a class or imagining multiple implementations is not enough to make it a port. Identify the boundary capability first. Ports get swappable adapters and a test implementation under `NODE_ENV=test`; test a service's logic with fake dependencies.

Example: `order-confirmation` prepares a message and calls the injected `mailer` port. It stays an application service; the mailer adapter calls the email provider. Tests use a fake mailer and exercise the real service.

## Commonly confused

| Pair | Rule |
| --- | --- |
| Port / repository | Own aggregate's persistence → repository. External system → port. |
| Port / execution command, query | Own storage or another context → command/query. External system → port. |
| Query / command | A query reads; it may have side effects, but only idempotent ones: repeating it changes nothing further (filling a cache, creating default settings if missing). Any other state change → command. A command may return data (the created order, the new balance). |
| Domain service / entity, value object method | One entity / value object → its method. The junction of several → always a domain service, unless they all belong to one aggregate → a method on that aggregate. |
| Domain / application service | Stated without requests, permissions, responses, scenarios → domain. Otherwise application. |
| Use case / application service | Use case = one action with `handle`. Application service = helper used by use cases. |
| Use case / orchestrator | Use case = action exposed outside. Orchestrator = reusable operation called by use cases. |
| Application / infrastructure service | Used by use cases → application. Only by adapters/repositories → infrastructure. |
| Clock | Always a port (`clock`, usually in Shared Layer). |

## React page, widget, UI-kit component or shared hook

| Piece | Component |
| --- | --- |
| A route / whole screen | **Page** |
| A block with business meaning or backend data (`cart`, `order-summary`) | **Widget** |
| A generic element with no business meaning, driven only by props (`button`, `date-picker`, `modal`) | **UI-kit component** |
| A business element that several widgets repeat whole, with the same meaning (`product-card`) | **UI-kit component** (domain) |
| Generic app-wide logic without markup and business meaning (`debounce`, `media-query`, `local-storage`) | **Shared hook** |

A UI-kit component or shared hook that starts needing data (API client, loading, backend state) becomes a widget that uses it. A widget's own state goes in its `hooks/`, not in a shared hook.

A business element goes to UI-kit only when several widgets contain the same element, repeated whole and with the same meaning (a product card shown in a catalog, a cart and recommendations). It stays presentational: business data comes in through props, actions go out through callbacks; no API client, no data loading, no imports from widgets, pages or bounded contexts. Its props describe what it shows (`title`, `price`), not domain types. One widget needing it, or several widgets sharing only a piece of markup, is not a reason: keep it in the widget, or extract the generic piece as a generic UI-kit component.

**Widgets never import each other.** Not a widget, not its `ui/`, `hooks/` or `types.ts`. What two widgets share goes to UI-kit (an element, by the rules above) or a shared hook (logic without markup); combining widgets is the page's job.

Nest a page or widget name in folders (`admin/users`) when it belongs to an area of the UI with several pages or widgets: a route group (`/admin/*`) or one section of a screen. Pages follow the route path; a widget goes under the area it serves. Otherwise keep the name flat (`order-summary`); one page or widget is no reason to start a folder. The whole path becomes the code name, so it must read as the component's name: `admin/users/list` (`AdminUsersListWidget`), not `admin/lists/user` (`AdminListsUserWidget`). Not for UI-kit components or shared hooks: they are generic and have no area. When a second page or widget joins an area, move the existing flat one into its folder with `Move or rename page` / `Move or rename widget` (`users` → `admin/users`).

## React widget type

Default **`with separated ui`**. Use `headless` only when consumers must supply different visuals for the same behavior, or the user asks. Use `monolithic` only on explicit request. "It's small" and "other widgets use another type" are not reasons. State any deviation in the plan.

## Where it goes

- Default: the context that owns the data and rules (`df-ps-plan-feature`, step 3).
- Shared Layer: technical, ownerless pieces (`clock`, `mailer` ports, shared HTTP client, errors like `unauthorized`) and **universal** entities / value objects: the same meaning and rules in every context, owned by none (`money`, `email`, `address`). A Shared Layer domain service holds rules at the junction of these universal types only. Anything with one context's meaning or rules (`order-status`, `customer`) stays in that context, even if other contexts need it; they duplicate it in their own execution queries/commands.
- Another context's data or behavior → an execution query/command in the consuming context (step 9).

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
| Promo code check | 9 | execution query `promo-code-discount`: `prisma` if `marketing` shares the database, otherwise `http` to its endpoint |
| Email, order date | 10 | ports `mailer`, `clock` (Shared Layer) |
| Free shipping for gold customers | 13 | domain service `shipping-policy`: takes `customer` and `order`, no I/O |
| Confirmation for both use cases | 14 | application service `order-confirmation` (gets `mailer`) |
| Invalid promo code | 1 | error `invalid-promo-code` in namespace `order` |
| `POST /sales/orders` | 2 | endpoint, controller `orders` |
