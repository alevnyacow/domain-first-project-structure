---
name: df-ps-application-port
description: Generate an application port and its adapter.
---

# Create an application port

Use this skill for an application port/adapter. It can target a bounded context or shared layer. Read [common-workflow.md](../df-ps-scaffold/references/common-workflow.md).

1. Inspect target port and adapter conventions. Choose a base name in kebab-case (for example, `payment-gateway`); no `Port` suffix is added to the class name.
2. Run `df-ps` → target context or **Shared Layer** → **Application** → **New Port**. Enter the name. If `testingLibrary` is configured, answer the test prompt according to user preference.
3. Enter the primary adapter label (prompt default `api`), then whether to add a test adapter (default label `mock`). Use project conventions, and unique labels.
4. The port class is under `application/ports/`; adapters are under `infrastructure/application-adapters/<implementation>/`. Wiring is conditional on `@domain-first/wire`. Add actual abstract method signatures, adapter behavior, dependencies, and tests when requested.
5. Inspect test imports and wiring paths before concluding. Version 2.6.0 has a known spelling/path mismatch (`appication-ports` vs `ports`) and generated spec issues; consult [generator-2.6.0.md](../df-ps-scaffold/references/generator-2.6.0.md). Report any repairs and file paths.
