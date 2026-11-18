# Work plan format

How to write the plan that `SKILL.md`, rule 1, requires. Show it in this format and stop:

```markdown
**Plan: order cancellation**

**Scaffolding**

**sales**

Why here: cancelling changes the order's status; orders belong to sales.

What will be scaffolded:

| Layer | Type | Name | Details | Why |
| --- | --- | --- | --- | --- |
| **domain** | error | order-already-shipped | | shipped orders can't be cancelled |
| **application** | command | cancel-order | prisma, fake in tests | one atomic status change |
| | query | cancellable-orders | prisma | read-only list for the UI |
| **presentation** | endpoint | POST orders/:id/cancel | → cancel-order | UI calls it over HTTP |

**billing**

Why here: refunds are payments; payments belong to billing.

What will be scaffolded:

| Layer | Type | Name | Details | Why |
| --- | --- | --- | --- | --- |
| **application** | port | order-refunds | cross-context, stub in tests | paid amount lives in sales |
| | use case | refund-cancelled-order | deps: OrderRefunds, PaymentGateway | read order, then call provider |

**React**

Why here: the user cancels from the order screen.

What will be scaffolded:

| Layer | Type | Name | Details | Why |
| --- | --- | --- | --- | --- |
| **presentation** | widget | orders/cancel-order | with separated ui | dialog has its own state |
| | page | orders/details | add the widget | button goes on this screen |

**Writing by hand**
- cancel-order: input { orderId }, output { status }
- prisma implementation: update status, throw OrderAlreadyShipped
- endpoint: :id → orderId, OrderAlreadyShipped → 409
- order-refunds adapter: sales:OrderSummaryQuery result → RefundableAmount

**Running**
- after the endpoint: npm run openapi && npm run client:orval

**Question**
1. Refund right on cancel, or after a manager confirms?

Reply "ok" to start.
```

- Write the plan in the user's language (headings and sentences); module names, types, commands and paths stay as in the code. Omit empty sections.
- **Scaffolding** has one block per owner, in run order: new contexts first, marked `(new)` (and `(provisional)` with the reason when ownership is a reversible default), then existing contexts, `shared-kernel`, React last.
- **Why here**: one short sentence on why this owner, not another: the data or rule the context owns; for `shared-kernel`, why several contexts share it; for React, why the UI changes.
- **What will be scaffolded**: one table per owner, one row per `df-scaffold`/`df-react`/`df-svelte` run. Layers in order domain → application → infrastructure → presentation, the layer in bold only on its first row. Repositories go with their aggregate in domain; commands, queries and ports in application (their implementations are Details); endpoints and React modules in presentation.
  - **Type**: the unit: aggregate, entity, value object, error, error namespace, service, port, command, query, use case, implementation, endpoint, wire dependency, move, delete; for React: page, widget, ui-kit component, hook, page move, widget move, ui-kit component move, hook move, page delete, widget delete, ui-kit component delete, hook delete.
  - **Name**: the entered name; for a move `old → new`; for an implementation the contract; for wire dependency the module.
  - **Details**: only what changes behavior: implementation types (`(saved)` when saved for future runs), the test implementation, dependencies (`deps: OrderRepository`), environments, widget type, the endpoint's handler, whether a Next.js route moves (`route moves: /a → /b`). No file paths, no CLI menu paths.
  - **Why**: at most six words: why this kind of module (`choosing-components.md`).
- **Writing by hand**: members, schemas, mappings. Not full code.
- **Running**: every command that generates files (migrations, OpenAPI, API client, other codegen), with what it produces and when. Use the project's own scripts; find them in `package.json` and configs. Their output needs no approval of its own and is never edited; scripts that change a database are run only by the user. Details: the project's scripts skill (`project-scripts`), if there is one.
- **Overwrites**, only when a run would replace existing files (`overwriteRequired` of a `dryRun`): list those files.
- **Exception requests**, only for hand-created files: `<path>` (`SKILL.md`, rule 2, #n) with the reason. Any other file needs its own request with a reason.
- **Question**, only for open decisions that change structure or domain behavior. Open questions block approval: answers first, then the updated plan.
- The last line says what reply starts the work.
