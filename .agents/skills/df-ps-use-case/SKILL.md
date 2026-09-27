---
name: df-ps-use-case
description: Generate an application use case for coordinating application logic.
---

# Create an application use case

Use this skill when the user asks for a use case as a distinct application item. Read [common-workflow.md](../df-ps-scaffold/references/common-workflow.md).

1. Confirm target bounded context and inspect existing use cases and application conventions. Choose a kebab-case verb phrase without `use-case` suffix (for example, `place-order`).
2. Run `df-ps` → target context → **Application** → **New Use Case**, enter the name, and wait for completion.
3. No test, execution/orchestration, or adapter prompts are offered for use cases. The file is `application/use-cases/<name>-use-case.ts`.
4. With `@domain-first/handlers`, the template has empty input/output schemas and a handler returning `{}`; without it, it is an empty class. With `@domain-first/wire`, a binding is created under `wiring/use-cases/` with an empty dependency list.
5. Implement the requested behavior, input/output contract, and dependencies in the class and wire. Inspect imports and report placeholders and file paths.
