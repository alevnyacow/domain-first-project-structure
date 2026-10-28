# Aggregate and repository

When: a thing with identity, lifecycle, and rules about its own state, owned by this context and stored on its own (`../choosing-components.md`, step 4). A rule about its own state is a method on it (step 7), not a new unit. Loading/saving one aggregate is a repository method, not a query or command.

## Generate (context only)

Prompts: name → `With Repository` → if yes: implementation (default = config persistence label) → `Add a test implementation` → if yes: test implementation (default `in-memory`) → {wire} `Dependencies for <Implementation>:` per implementation (`../generators.md`).

`… pick:Domain "pick:New Aggregate" text:order yes default yes default`

- `<C>/domain/aggregates/n/`: `n.aggregate-root.ts` (`class N extends domainType()` {types}), `index.ts`, spec; with repository: `n-repository.ts` (`abstract class NRepository`), spec
- `<C>/infrastructure/repositories/I/I-n-repository.ts` per implementation (`class INRepository implements NRepository`)
- {wire} `<C>/wiring/repositories/wire-n-repository.ts` (env-branched)
- With `withInMemoryDb` in the config, the `in-memory` implementation can keep its section of the DB: `private readonly data: InMemoryDbInfrastructureService['ns']`, set in the constructor from its `inMemoryDbInfrastructureService` parameter; `ns = this.section<N>('NS');` is added to `<rootFolder>/shared-kernel/infrastructure/services/in-memory-db-infrastructure-service.ts` if missing (`N` needs an `id`). Without {wire} this always happens. {wire} `Dependencies for InMemoryNRepository:` lists the DB under `Suggested`, checked: kept, it gets the section and `wireInMemoryDbInfrastructureService` in its `wireClass`; unchecked, the implementation stays empty (`constructor() {}`) and no section is added.

Its entities and value objects come after it: [entity-value-object](entity-value-object.md), picking this aggregate.

## Implement

```ts
export class Order extends domainType(
    z.object({
        id: z.instanceof(OrderId),
        lines: z.array(z.instanceof(OrderLine)),
        status: z.enum(["open", "paid"]),
    }),
) {
    withPayment = () => {
        if (this.status === "paid") {
            throw new AlreadyPaidOrderSalesError({
                id: this.id.snapshot,
            });
        }
        return this.with({ status: "paid" });
    };
}
```

- Use the schema library the project already uses. Methods return new instances. Invalid input throws `TypeParsingError`.
- The aggregate is rich and knows nothing about storage: its rules and factories are methods; no repository calls, persistence fields, or storage mapping.
- Repository contract: abstract members (`abstract findById(id: OrderId): Promise<Order | null>`, `abstract save(order: Order): Promise<void>`). A rule about a set of aggregates (uniqueness, "at most N per day") is a repository method that queries it, checked in the use case.
- Implementations map storage ⇄ aggregates. The in-memory one behaves like the real one for what tests use; with the in-memory DB, it keeps the aggregates in its section (`this.data.save(order)`, `this.data.withId(id)`).
- Refer to other contexts' entities by id only.

## Test

Extend the generated specs in the same files: aggregate rules on the root, the repository contract against the test implementation.
