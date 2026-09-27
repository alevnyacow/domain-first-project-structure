---
name: df-ps-query
description: Generate an application query that reads data.
---

# Create an application query

Use this skill when the user requests a query. Read [common-workflow.md](../df-ps-scaffold/references/common-workflow.md).

1. Confirm target bounded context and inspect neighboring queries, handlers, infrastructure, and naming. Use the query's base name in kebab-case, without `query` suffix.
2. Run `df-ps` → target context → **Application** → **New Query**. Enter the name. If `testingLibrary` is configured, answer the test-file prompt from user preference.
3. Select **Execution** when the query has its own infrastructure implementation; select **Orchestrator** when it coordinates calls without a query-specific adapter.
4. Execution asks for a primary implementation label (defaults to config's `defaultPersistenceLayerImplementation`) and optionally a test implementation (default `in-memory`). Match existing adapters and use distinct labels. Orchestration skips these prompts.
5. Execution templates and paths depend on `@domain-first/handlers`; wiring appears only with `@domain-first/wire`. Fill schemas, actual read logic/return values, adapter behavior, and wiring dependencies if requested. Inspect generated imports/layout, especially without handlers.
6. Review specs and report paths and placeholders. Generated specs are smoke-test stubs and have not been executed.

See [generator-2.6.0.md](../df-ps-scaffold/references/generator-2.6.0.md) for version-specific mismatches.
