# Generator 2.6.0: observed limitations

These notes describe the source in `@domain-first/project-structure` version 2.6.0, inspected in this repository. They are not architecture rules and do not establish behavior for later releases. Check the installed version and actual generated files before applying a repair. Fix the requested output within scope; changes to the scaffolder itself are a separate task.

## Application port wiring and tests

`src/use-cases/scaffold-new-application-port.ts` writes wire files to `wiring/appication-ports/` (the spelling in the generator), while generated specs import from `wiring/ports/`. The spec also imports and calls `define` for its suite instead of `describe`. Check the chosen test library's exports and align the spec and binding with the target project's directory convention. Do not reproduce the typo as a new general naming rule or rename unrelated existing bindings.

## Execution command/query without handlers

In `src/use-cases/scaffold-new-command.ts` and `scaffold-new-query.ts`, when `@domain-first/handlers` is absent, execution contracts are generated at `application/commands/<name>-command.ts` or `application/queries/<name>-query.ts`. Infrastructure templates instead import from `domain/commands/` or `domain/queries/`, which does not match those generated contracts.

Optional specs are written under the `execution/` subdirectory and use a sibling import, also inconsistent with the contract location. Align imports with the actual contract or move newly generated files consistently with the project's convention. Orchestrator templates use `orchestration/` in both modes.

## Generated specs without wire

Repository, command, query, and application port specs reference wire factories regardless of whether `@domain-first/wire` was selected. The factories themselves are generated only when that integration is selected. If tests are requested without wire, adapt their setup to the project's actual construction/dependency injection approach; do not enable or install wire merely to satisfy a generated test.

## Error namespace prerequisites

The `Errors` menu is visible even when `@domain-first/errors` is not selected. Root namespace declarations are generated during initialization for shared errors and during bounded-context creation for context errors only when that package is selected. The error operation assumes those declarations exist. Inspect `domain/errors/index.ts` before appending errors, especially after a later config change.

## Names and default implementations

`src/unknown-format-naming.ts` returns the original input for `fileName`; it is not a general case converter. It lowercases hyphen-separated words when constructing class/variable names, so `placeOrder` becomes `Placeorder`, while `place-order` becomes `PlaceOrder`. Empty hyphen segments can cause an exception. Prefer simple lowercase kebab-case input.

`defaultPersistenceLayerImplementation` supplies defaults for execution commands and queries. Aggregate repository prompts use `prisma` directly, and application port prompts use `api`; those prompts do not inherit the config's persistence default.

## Wiring placeholders and registration

Generated `wireClass` calls start with empty dependency lists. Adding constructor dependencies requires updating the bindings. `envBranchedWire` routes `test` to the optional test implementation and `development`/`production` to the primary implementation; inspect the generated mapping rather than assuming tests exercise the production adapter.

REST endpoints contain `handler: never` while accessing `handler.handle`, so generation alone does not produce a complete, type-correct endpoint. Supply a real handler type and binding. The new-controller branch adds exports to context wiring and `<rootFolder>/presentation/rest/wires.ts`, and creates shared REST `index.ts` if absent. Existing-controller selection does not recreate missing shared registration; inspect those exports when wiring appears incomplete.

## Writes are immediate and non-idempotent

`src/file-system.ts` uses `writeFileSync` for creation, which overwrites an existing file. `addLine` appends without detecting duplicates. Several operations write files before all prompts finish; no transaction or rollback exists. Inspect partial results before retrying and preserve the user's pre-existing work.
