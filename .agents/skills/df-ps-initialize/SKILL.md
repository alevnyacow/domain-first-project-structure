---
name: df-ps-initialize
description: Initialize or inspect the df-ps configuration.
---

# Initialize df-ps

Use this skill when a user wants to initialize the scaffolder's project configuration, change its setup, or understand an existing setup. The `df-ps` CLI is interactive; it has no documented flags for supplying these answers non-interactively.

## Locate and inspect the project

1. Start in the project the user intends to configure. `df-ps` identifies the project root as the nearest parent directory containing `package.json`; if none exists, it fails with `No package.json was found`.
2. Look for `domain-first.project-structure.config.json` at that root. Also inspect `package.json`, lockfiles, source directories, and test configuration before proposing answers.
3. If the config exists, read and summarize it. Running the CLI with an existing config opens the scaffold menu; it does not run setup again. For a requested settings change, edit the relevant config fields directly and preserve unrelated values. Do not delete the config to force initialization. Changing `rootFolder` does not move files, and enabling integrations does not backfill their supporting files; inspect the affected structure and complete the changes needed for the user's request.
4. If the config is absent, collect only unresolved choices. Infer a choice from repository evidence when strong; otherwise ask the user. Do not guess framework, persistence technology, or package adoption.

## First-run questions and decision rules

The prompts appear in this order:

1. **Root folder** — default `src`; nested paths are entered with `/` (for example, `packages/api/src`). Match the existing source root. The tool uses this folder for its generated `bounded-contexts`, `shared`, and, where enabled, shared presentation structure.
2. **`@domain-first` packages** — multi-select from the five package names below. Inspect dependencies and select only packages installed or explicitly planned by the user. Do not select a package just because the scaffold can generate integrations for it.
3. **Default persistence implementation** — choose the implementation label used as a default in command/query persistence prompts. Infer it from existing infrastructure (for example, `prisma` only if the project actually uses it); this is a naming default, not package installation or persistence setup.
4. **Use React** — enable only when the target project uses React and the user intends to scaffold React modules.
5. **Scaffold unit tests** — use the user's stated preference; ask once if unresolved. This enables later per-item test prompts, not automatic tests for every item.
6. **Unit testing library** — asked only after answering yes; default is `vitest`. Confirm against dependencies and existing test configuration. This string is used in generated imports, so it must be an importable test package/module name.

Recognized integrations:

| Package | Effect in generated files |
| --- | --- |
| `@domain-first/types` | Aggregates can extend `domainType()`. |
| `@domain-first/errors` | Setup creates a shared error namespace; new bounded contexts get an error namespace; error scaffolding uses this package. |
| `@domain-first/handlers` | Commands, queries, and use cases use handler templates; execution command/query contracts use handler types. |
| `@domain-first/wire` | Scaffolding adds wiring modules; initialization creates the shared environment-branched wire used by several generated bindings. |
| `@domain-first/handlers-rest` | Enables the REST endpoint menu in bounded context presentation. |

The config contains `rootFolder`, `domainFirstPackages`, `defaultPersistenceLayerImplementation`, `useReact`, and optional `testingLibrary`. Do not add undocumented properties or package names.

Use a nonempty project-relative source path. Resolve it against the package root before running; in a monorepo, the nearest package root may differ from the repository root. A path starting with `/` is absolute, not a nested project-relative path. Keep persistence labels in lowercase kebab-case. These labels name generated adapters; they do not configure database connections or install drivers.

Example config for a project that explicitly chose handlers, wire, Prisma, no React, and Vitest (this is not a default to copy into every project):

```json
{
  "rootFolder": "src",
  "domainFirstPackages": ["@domain-first/handlers", "@domain-first/wire"],
  "defaultPersistenceLayerImplementation": "prisma",
  "useReact": false,
  "testingLibrary": "vitest"
}
```

If tests are disabled, omit `testingLibrary`; do not use `null`. Config parsing requires strings for folder and implementation labels, an array of recognized package names, and a boolean for `useReact`.

## Run and report

Prefer the project's installed version. When the local `df-ps` executable from `@domain-first/project-structure` is available, run `npx df-ps`. If the package is absent and fetching it is authorized, use `npm exec --package=@domain-first/project-structure -- df-ps` (pin the version if specified by the user). A bare `npx df-ps` without a local executable can look for a different npm package named `df-ps`. Follow the project's package manager conventions for installation when installation is requested.

When answers are settled, start the command with the working directory set to the intended package root and PTY enabled (`exec_command` with `tty: true`, where available). Keep the returned session ID and use `write_stdin` for subsequent input. Read each prompt before answering: select lists use arrow keys and Enter; checkboxes use arrows, Space to toggle, and Enter to submit; input fields take text and Enter; confirmations take explicit `y` or `n` and Enter. Arrow sequences are `\u001b[A` (up) and `\u001b[B` (down), and Enter is `\r` when sending JSON-encoded terminal input. Check the highlighted/checked choices before submitting. Do not send a whole questionnaire as a blind input stream: conditional prompts change the sequence. Wait for process completion and inspect files, rather than treating submission of the last answer as proof of success.

If interactive input is unavailable, provide the exact command and agreed answers for the user to run. State that generation has not been performed. Do not silently replace the requested CLI workflow with hand-created output.

Initialization is one operation and then exits. To scaffold an item, start the CLI again after initialization and follow `df-ps-scaffold` if that skill is available.

## Interrupted initialization

The config is written before optional shared files. If initialization fails or is cancelled, inspect both the config and supporting files before retrying. Once a config exists, the next run will enter the main menu even if shared setup is incomplete. Preserve existing user code and repair only missing or incomplete output from this operation; do not delete the config and rerun blindly.

After setup, inspect the config and generated files. With wire selected, expect `<rootFolder>/shared/wiring/env-branched-wire.ts`; with errors selected, expect `<rootFolder>/shared/domain/errors/index.ts`. No bounded context is created during setup, and with neither integration selected there may be no source folders yet. Report the package root, chosen values, files, and any incomplete steps. Do not install packages unless installation is within the user's request.
