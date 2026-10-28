# Move or rename

When: a module's name no longer fits, or it belongs elsewhere: another bounded context, the Shared Kernel (entities, value objects, services, ports only), or in or out of an aggregate. Never move, rename or copy module files by hand, and never rename their classes, wires or parameters by hand: the CLI keeps files, names and imports in sync.

## Generate (context and Shared Kernel)

Prompts: `Module:` (select, grouped by kind; entities and value objects of an aggregate show it: `order-line (order)`) → `Move to:` (`Bounded Context: <current> (stays)`, other contexts, `Shared Kernel` for the kinds it has) → `Aggregate:` (entities and value objects only, when the target context has aggregates: `No aggregate` or one of them) → `New name:` (default: the current one) → `Apply?`.

`… "pick:Move or rename" pick:order "pick:Bounded Context: sales" text:purchase yes`
`… "pick:Move or rename" pick:money "pick:Shared Kernel" default yes`
`… "pick:Move or rename" pick:order-line "pick:Bounded Context: sales" "pick:No aggregate" default yes`

Every file of the module moves (contract, implementations, wire, specs; an aggregate with its whole folder), every import of it follows, and derived names change in the module and its importers: `OrderRepository`, `PrismaOrderRepository`, `wireOrderRepository`, dependents' `orderRepository` parameters, an aggregate's in-memory DB section. An entity leaving its aggregate is no longer re-exported there; its importers import its file.

Before `Apply?` the CLI lists the files to move and to update: check them against the plan. A move that would make a context import another one prints `Nothing was moved: these imports would cross a bounded context boundary.` with the imports: nothing changed. Fix the design instead (`../choosing-components.md`, step 9: the other context gets its own query or command), or move the dependency first.

In the plan, list a move as a run: old → new place and name, the files to move (`→`) and the files whose imports or names change (`~`).

## Implement

Nothing to fill in. Re-read the moved module's files: names inside method bodies that only resemble the old name (local variables, strings, comments) are not renamed. Run `npx df-lint` and the project's tsc/tests.
