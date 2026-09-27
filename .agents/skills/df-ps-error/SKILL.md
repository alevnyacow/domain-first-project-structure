---
name: df-ps-error
description: Generate a domain error or error namespace.
---

# Create an error or namespace

Use this skill for a domain error or error namespace. Read [common-workflow.md](../df-ps-scaffold/references/common-workflow.md).

1. Establish whether the target is an existing bounded context or the shared layer. For a new bounded context, use `$df-ps-bounded-context` first. Check `@domain-first/errors` is configured and installed, then inspect `domain/errors/index.ts` and namespace files. The menu can appear even when error integration is missing; don't proceed with broken prerequisites.
2. Run `df-ps` and navigate to the target → **Domain** → **Errors**. (Shared errors: **Shared Layer** → **Domain** → **Errors**.)
3. Choose one action:
   - **New error without namespace**: enter the error base name. The generator appends an export to `domain/errors/index.ts`.
   - **New error in namespace `<file>`**: select an existing namespace file, then enter the error base name. It appends to that file.
   - **New namespace**: enter a namespace name. The generator writes `<file>.ts` and appends a barrel export in `index.ts`; add the actual error in a separate CLI operation afterward if needed.
4. Use kebab-case base names and check for existing exports first. Error names derive from error + namespace/context labels; the generator does not accept a full code expression.
5. Inspect the changed namespace and barrel for duplicate exports and verify its declarations exist. Report each changed file.

The error generator appends lines without deduplication. See the version notes in [generator-2.6.0.md](../df-ps-scaffold/references/generator-2.6.0.md).
