---
name: df-ps-bounded-context
description: Generate a bounded context.
---

# Create a bounded context

Use this skill when the user requests a new bounded context. Read [common-workflow.md](../df-ps-scaffold/references/common-workflow.md) first.

1. Confirm project root, config, and source root. Inspect existing bounded context names and resolve the intended context name. Use lowercase kebab-case and avoid an existing directory.
2. Run the configured local `df-ps` interactively from that project root. Choose **Scaffold new bounded context**, enter the name, and wait for the process to exit.
3. The generator creates `<rootFolder>/bounded-contexts/<name>`. When `@domain-first/errors` is configured it also creates `domain/errors/index.ts` and a context namespace; otherwise it only ensures the context folder exists.
4. Inspect the new path and any pre-existing files. Report the context path and whether its error namespace was generated.

This creates a context shell only. If the user asks for domain/application components too, continue with their focused item skills after inspecting the context.
