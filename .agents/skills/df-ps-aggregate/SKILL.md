---
name: df-ps-aggregate
description: Generate a domain aggregate and optional repository.
---

# Create an aggregate

Use this skill for a new aggregate, with or without its repository. Read [common-workflow.md](../df-ps-scaffold/references/common-workflow.md).

1. Verify the target bounded context exists. Inspect aggregates and repository conventions. Input only the aggregate's base name, in kebab-case; the generator adds `.aggregate-root.ts` and derives the class name.
2. Run `df-ps` in a PTY and choose the target context → **Domain** → **New Aggregate**.
3. Enter the aggregate name. If `testingLibrary` is configured, answer the unit-test prompt from the user's preference.
4. Answer **With Repository** according to requested persistence needs. If yes, select the primary repository implementation label (prompt default `prisma`) and whether to add a test implementation (default label `in-memory`). These labels create folders/classes; choose actual project conventions. Keep the two labels distinct.
5. Expected files: `domain/aggregates/<name>/<name>.aggregate-root.ts` and `index.ts`; optional aggregate spec, repository abstraction and repository spec; implementation classes under `infrastructure/repositories/<implementation>/`; wire binding under `wiring/repositories/` only if `@domain-first/wire` is configured. With `@domain-first/types`, the aggregate root extends `domainType()`.
6. Fill in aggregate invariants, state/operations, repository methods, adapter persistence, and wire dependencies if the user requested a working feature. Templates are empty stubs. Inspect exports, imports, and collisions; report the generated paths and unfinished parts.

For 2.6.0 path/import inconsistencies, consult [generator-2.6.0.md](../df-ps-scaffold/references/generator-2.6.0.md).
