---
name: df-ps-command
description: Generate an application command that changes state.
---

# Create an application command

Use this skill when the user requests a command. Read [common-workflow.md](../df-ps-scaffold/references/common-workflow.md).

1. Confirm target bounded context and inspect neighboring commands, handlers, infrastructure, and naming. Use the command's base name in kebab-case, without `command` suffix.
2. Run `df-ps` → target context → **Application** → **New Command**. Enter the name. If `testingLibrary` is configured, answer the test-file prompt from user preference.
3. Select **Execution** when this command has its own infrastructure implementation; select **Orchestrator** when it coordinates application/domain operations without a command-specific adapter.
4. Execution asks for a primary implementation label (defaults to config's `defaultPersistenceLayerImplementation`) and optionally a test implementation (default `in-memory`). Pick existing project adapter labels and keep them distinct. Orchestration skips these prompts.
5. Execution templates and paths depend on `@domain-first/handlers`; wiring appears only with `@domain-first/wire`. Fill input/output schemas and handler behavior, persistence adapter methods, and wiring dependencies if requested. Inspect actual file layout/imports, especially if handlers is absent; consult version notes for known 2.6.0 mismatches.
6. Review generated specs and report their paths and any placeholders. Test file generation does not run tests.

See [generator-2.6.0.md](../df-ps-scaffold/references/generator-2.6.0.md) for current version caveats.
