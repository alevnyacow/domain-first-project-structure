# Non-interactive operations for agents

Prefer the JSON interface for `df-scaffold`, `df-react` and `df-integration`. Use the interactive driver only with older CLI versions that lack this interface. Initialization (`df-init`) remains a human task. The same plan, file creation and dependency rules apply to both interfaces.

For the complete operation map, conditional integration fields and recipes, read [agent-operations.md](agent-operations.md) for the work at hand.

## Discover before constructing requests

```bash
npx df-scaffold --describe
npx df-react --describe
npx df-integration --describe
```

Each command returns one JSON document with `schemaVersion: 1`, `requestSchema` and the project inventory. Use the schema from the installed version instead of guessing fields. Read `--describe` first; a valid JSON error is not a reason to fall back to the driver. Use the legacy driver only if that installed CLI does not support the flags or opens an interactive menu instead of returning JSON. Stop that discovery process before retrying with the driver; do not automatically upgrade the project package to change interfaces. Without a config it still describes the protocol; ask the owner to initialize missing sections.

- `project.contexts[].name`: a bounded context or the reserved `shared-kernel` context.
- `modules[].id`: qualified dependency ID, e.g. `shared-kernel:PrismaInfrastructureService` or `billing:InvoiceQuery`.
- `modules[].implementations[].target`: wiring target including its implementation class, e.g. `sales:OrdersQuery:PrismaOrdersQuery`.
- `modules[].implementations[].dependencies`: currently available dependencies to add to that implementation, filtered by the same rules as the interactive menu. Already-wired dependencies are excluded.
- `units[].id` and `contracts[].id`: IDs for moves and new implementations, e.g. `query:orders`, `aggregate:order`, `entity:order/line`.
- `implementationTypes`: saved primary/test labels and available system types per contract category. Do not put the UI's `System:` prefix into a request.
- `project.integrations`: stable integration IDs and availability; `project.reactModules`: current page/widget names.

Refresh discovery after operations that change selectable modules or dependencies. Do not substitute list indexes, display labels or guessed file paths for IDs.

## Execute or preview

```bash
npx df-scaffold --request '{"operation":"query","context":"sales","name":"orders","implementation":{"type":"prisma","save":false},"dependencies":{"PrismaOrdersQuery":["shared-kernel:PrismaInfrastructureService"]}}'
npx df-react --request '{"operation":"widget","name":"admin/orders","widgetType":"separated"}'
npx df-integration --request '{"operation":"add","integrations":["storybook"]}'
```

`--request` takes literal JSON, or `-` to read one JSON document from stdin. No request file needs to be created. When constructing invocations programmatically, pass JSON as an argument or stdin through a subprocess API; avoid interpolating values into shell code.

- `dryRun: true` returns the proposed changes without writing anything. Discovery and dry runs are read-only and can be used while preparing a plan.
- `overwrite: true` explicitly permits replacing changed existing generated files. Use it only for overwrites covered by the approved plan. Never add it merely to bypass an `OVERWRITE_REQUIRED` error; inspect the listed paths first. Identical generated file contents need no overwrite flag.
- `implementation` / `testImplementation`: `{ "type": "prisma", "save": false }`. `save` defaults to false; true remembers an ordinary type in the appropriate backend implementation choices. A missing `testImplementation` means no separate test implementation.
- `dependencies`: implementation/class name → array of qualified module IDs. Omitted entries keep the generator's checked suggestions; `[]` explicitly selects none when that selection applies. When wiring is off or no candidates exist, omit the group; see the [dependency conditions](agent-operations.md#dependency-keys-and-system-implementations). Every supplied dependency group must apply to the operation. Different primary/test implementations have independent lists.
- Aggregate repositories require `withRepository: true` and an `implementation`. Without it, aggregate creation makes no repository.
- New implementations use a `contract` ID and, with a branched wire, an explicit `environments` array. Moves use a `module` unit ID and optional `targetContext`, `aggregate` and `name`. `wire-dependency` uses a wiring target ID in `module` plus its `dependencies` entry.
- Endpoints use `controller`, lowercase `method`, relative `path` and a qualified `handler` ID when a wired handler is available. A new controller is created when its name does not exist.
- Integration-specific fields and script conflict decisions are in the integration request schema. Conflicts require explicit decisions, e.g. `"scriptConflicts": { "storybook": "keep" }`. Configuration changes that require confirmation interactively also require their explicit request field.

## Check the result

Success is one JSON document with `ok: true`, exit code 0, and:

- `files.created`, `files.updated`, `files.deleted`: project-relative file paths.
- `directories`: new directories; `overwriteRequired`: changed files requiring permission to replace (useful for dry runs).
- `nextSteps`: install commands and follow-up notes; commands are not executed.
- `messages`: generator diagnostics.
- `dryRun`: whether the plan was only previewed.

Compare the reported changes with the approved plan, then implement the generated code. A nonzero exit code or `ok: false` is failure. Errors include a stable `error.code`, a message and, when applicable, `error.details` identifying fields or available choices. Invalid requests, unavailable dependencies and refused overwrites discard all staged source/config/history changes. The command never falls back to a prompt. Correct the request within its approved scope and retry; do not hand-write the generator's output.

## Recover from an error

| Error codes | Next action |
| --- | --- |
| `PROJECT_NOT_FOUND`, `CONFIG_NOT_FOUND`, `BACKEND_NOT_CONFIGURED`, `FRONTEND_NOT_CONFIGURED`, `INVALID_CONFIG` | Check project location and required config section. Ask the owner to initialize or repair settings; continue independent work only where its required sections are ready. |
| `CONFIG_OUTDATED` | The config has the format of an earlier major version. Stop and ask the user to run `npx df-upgrade`; never run it or edit the config yourself. `--describe` reports it as `project.configStatus: "outdated"`. |
| `INVALID_JSON`, `INVALID_REQUEST`, `MISSING_PARAMETER`, `INVALID_PARAMETER`, `INVALID_ARGUMENTS` | Fix the request against the installed schema and error details. Check JSON syntax, required fields, naming and mutually exclusive CLI flags. |
| `INVALID_CHOICE`, `INVALID_IMPLEMENTATION` | Refresh discovery and check eligibility, disabled/duplicate types and cross-context restrictions. Do not bypass rules with manual wiring/imports. |
| `UNUSED_PARAMETERS` | Check the class key, wiring availability and integration conditions. Omit genuinely inapplicable fields; do not drop an intended dependency merely to make a request pass. |
| `CONTEXT_NOT_FOUND`, `TARGET_NOT_FOUND`, `REST_NOT_CONFIGURED` | Create the required context, aggregate, namespace, contract, handler or integration first if that work is authorized; otherwise report the missing prerequisite. A dry run of a prerequisite does not create it. |
| `OVERWRITE_REQUIRED` | Preview and inspect the listed paths. Use `overwrite: true` only for replacements already within the approved plan; obtain any required plan change first. |
| `MOVE_NOT_ALLOWED` | Review the boundary violations and change the design or move prerequisites first. Do not perform the move by hand. |
| `CANCELLED`, `OPERATION_FAILED`, `UNSUPPORTED_PROMPT` | Inspect the message and report the failed operation or unsupported CLI path. Do not treat this as permission to switch to interactive execution or write output by hand. |

Failures discard the operation's staged changes. Success can still have follow-up notes: inspect `messages`/`nextSteps` for manual adapter connection, integration installation, custom wiring or an implementation no longer selected by any environment. Check the actual generated files before implementing business logic.
