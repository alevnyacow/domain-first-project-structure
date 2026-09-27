---
name: generate-new-source-file
description: Plan new source files as df-ps scaffold items and get the user's approval before generating them.
---

# Generate new source files through df-ps

Use this skill when a request requires creating source files. Every new source file must come from an operation supported by `@domain-first/project-structure`; do not create new source files directly with file tools or by hand. You may edit scaffold-generated files afterward to implement the requested behavior, but do not add extra source files outside the scaffolder's output.

## 1. Inspect and translate the request

Before writing files, inspect the target project read-only: identify its package root and `domain-first.project-structure.config.json`, source root, bounded contexts, existing source conventions, dependencies, and any target names or paths that already exist. In a monorepo, confirm the intended package. Read the item skills relevant to the request and the shared df-ps workflow.

Break the requested outcome into the source files that should exist. For each, identify the matching scaffold operation and focused skill. Use the actual generator output to determine paths: the scaffold operation may create several related files (tests, adapters, wiring, exports), so include all of those in the plan. Do not assume every desired file is generated unless its operation, config, and prompt choices produce it.

Use the following routing:

| Needed item                       | Focused skill             |
| --------------------------------- | ------------------------- |
| Bounded context                   | `$df-ps-bounded-context`  |
| Aggregate and optional repository | `$df-ps-aggregate`        |
| Domain error or namespace         | `$df-ps-error`            |
| Domain service                    | `$df-ps-domain-service`   |
| Application command               | `$df-ps-command`          |
| Application query                 | `$df-ps-query`            |
| Application port and adapters     | `$df-ps-application-port` |
| Application use case              | `$df-ps-use-case`         |
| REST endpoint                     | `$df-ps-rest-endpoint`    |
| React page                        | `$df-ps-react-page`       |
| React widget                      | `$df-ps-react-widget`     |

For missing setup, use `$df-ps-initialize`. Use `$df-ps-scaffold` to route an item if its type is unclear. Do not force arbitrary files such as a new configuration file, utility module, or migration into a vaguely similar item type. If the scaffolder has no matching operation, identify the exact file and explain (a) which scaffold operation is missing, (b) why this file is necessary for the requested outcome, and (c) why no supported scaffold item can produce it. Then explicitly ask the user to approve creating that specific file manually. Include the file path, purpose, and reason in the approval plan. Do not create it before the user explicitly approves the manual creation. If approval is declined, continue only with the approved scaffoldable items and state what requirement remains unmet.

## 2. Prepare a concrete approval plan

Resolve choices that change output before asking for approval. Infer them from the request and project where reliable; ask about unresolved choices such as target context, item type, execution vs orchestration, React page vs widget, widget shape, repository/adapter needs, or test generation. Check for name/path collisions and note any scaffolder limitations or dependency mismatches.

Show the user a concise but complete plan containing:

- The requested behavior and target package/source root.
- Each item in dependency order: item type and name, target context, focused skill, relevant prompt selections, and expected generated paths.
- All secondary files each operation will generate, including tests, adapters, wiring files, barrels, or shared registration.
- Any scaffold stubs that will need implementation after generation.
- Each requested source file the scaffolder cannot generate, with its exact path, why no supported scaffold operation can create it, why it is needed, and an explicit request for approval to create it manually.

Use exact paths when they can be derived from the repository and chosen names. Label uncertain paths or conditional outputs and state what choice controls them. Keep the plan scoped to the user's request; do not add convenient extra source files.

Then ask the user to approve that specific plan before any scaffold operation runs. Approval applies only to the listed items and choices. If the user changes the requirements, update the plan and obtain approval for the revised set. A general initial request to create a feature is not approval of the detailed file plan.

## 3. Generate only after approval

After approval, invoke the matching focused item skills and follow their instructions. Treat approval for manual creation as file-specific: approval of the scaffold plan alone does not authorize a manual file unless the user's approval clearly includes that exception. Run CLI operations sequentially in dependency order. For example, create a bounded context before its aggregate; create a new error namespace before adding an error to it; create an application handler before wiring a REST endpoint to it. Inspect each operation before starting the next.

Use the interactive df-ps CLI, not direct file creation, for every new source file. Stay within the approved plan. If the CLI would create an unlisted file, overwrite an existing file, or requires a new unresolved choice, stop before that operation, show the changed plan, and get approval for the change. If interrupted, inspect partial output before retrying.

After scaffold generation, edit the generated files to complete the requested behavior when in scope. For each explicitly approved manual-file exception, create only the approved path and purpose, then report it as manually created with the reason. Do not add other new files manually to fill gaps; explain the need and request approval first. Report generated paths, manually created exceptions, edits to scaffold output, remaining placeholders, and checks actually performed.
