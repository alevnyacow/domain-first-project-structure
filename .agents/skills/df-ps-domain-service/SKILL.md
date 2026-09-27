---
name: df-ps-domain-service
description: Generate a domain service.
---

# Create a domain service

Use this skill when the user wants a domain service. Read [common-workflow.md](../df-ps-scaffold/references/common-workflow.md).

1. Confirm the bounded context exists. Inspect its `domain/services` and wiring patterns; choose a kebab-case service base name without the `service` suffix.
2. Run `df-ps` → target context → **Domain** → **New Service**, then enter the name.
3. The CLI creates `domain/services/<name>-service.ts`. When `@domain-first/wire` is configured it also creates `wiring/domain/services/wire-<name>-service.ts`.
4. Implement the requested domain operation, constructor dependencies and wiring entries. The generated class and `wireClass` dependency list are empty. Review imports and name collisions, then report paths and remaining work.
