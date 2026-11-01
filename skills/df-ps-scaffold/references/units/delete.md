# Delete

When: a module is no longer needed. Never delete module files by hand: the CLI removes every file of the module and what the generators added for it elsewhere, and refuses while anything still uses it.

## Generate (context and Shared Kernel)

Prompts: `Module to delete:` (select, grouped by kind as in Move or rename) → `Delete?` (default No).

`… "pick:Delete" pick:orders yes`

JSON: `{ "operation": "delete", "context": "sales", "module": "query:orders" }`.

Deleted: the files of the unit, as Move or rename moves them (an aggregate with its whole folder, entities and value objects inside included). Cleaned up: an entity's or value object's `export *` in its aggregate's `index.ts`, and an aggregate's in-memory DB section with its import.

Refused while other files import the module: other modules, their wires and specs, or importers of the aggregate barrel that name an entity or value object. The CLI prints `Nothing was deleted: these files still use it.` with each `file → import` (JSON: `DELETE_NOT_ALLOWED` with `details.usedBy`) and changes nothing. Remove the uses first: delete the dependent module first, or remove the dependency from its wire and constructor together, which needs the approved plan (rule 3 exception).

## In the plan

A delete is a row of its owner: Type `delete`, Name the module, Why the reason it goes. List the uses that have to go first under Writing by hand.
