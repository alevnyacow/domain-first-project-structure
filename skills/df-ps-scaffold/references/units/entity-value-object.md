# Entity and value object

When (`../choosing-components.md`, steps 5–6): used only inside one aggregate → in that aggregate; used by several aggregates or a domain service → `No aggregate`; universal, with the same meaning in every context (`money`, `email`, `address`) → Shared Kernel.

## Generate (context and Shared Kernel)

Prompts: name → aggregate (select: existing aggregate folders | `No aggregate`; asked only if `<C>/domain/aggregates/` has aggregates, so never in Shared Kernel).

`… pick:Domain "pick:New Entity" text:order-line pick:order`
`… pick:Domain "pick:New Value Object" text:money "pick:No aggregate"`
`"pick:Shared Kernel" pick:Domain "pick:New Value Object" text:money`

- In an aggregate: `<C>/domain/aggregates/a/entities/n.entity.ts` or `<C>/domain/aggregates/a/value-objects/n.value-object.ts` (`class N extends domainType()` {types}), spec; `export * from './entities/n.entity'` (or `./value-objects/n.value-object`) appended to the aggregate's `index.ts`
- `No aggregate`: `<C>/domain/entities/n.entity.ts` or `<C>/domain/value-objects/n.value-object.ts`, spec; no barrel

Generate the aggregate first ([aggregate](aggregate.md)).

## Implement

- `domainType(...)` classes like the aggregate root: use the schema library the project already uses; methods return new instances; invalid input throws `TypeParsingError`.
- Rich, with no knowledge of storage: their rules and factories are their methods, using the standard library where it suffices. No repository calls, persistence fields, or storage mapping.
- A rule about one entity / value object → its method. The junction of several → a [domain service](services.md), unless they all belong to one aggregate → a method on that aggregate.
- Inside an aggregate they are exported from its `index.ts`; import them from there.

## Test

Extend the generated `<name>.entity.spec.ts` / `<name>.value-object.spec.ts` with their rules (e.g. rating is 1–5).
