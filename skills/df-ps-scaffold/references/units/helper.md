# Infrastructure helper

When (`../choosing-components.md`, step 14): stateless technical code of one implementation type: a mapper between storage and domain, a query builder, an error translator. No class, no wire, no state. If it needs a dependency or several implementation types share it (cursor encoding for `prisma` and `in-memory`, retry for several adapters), it is an infrastructure service (`services.md`). Other layers have no helpers: domain logic belongs in the model, application logic in a use case or application service, presentation logic in a presentation service.

## Generate (context and Shared Kernel)

Prompts: `Name (folders split by "/"):` → `Implementation:` (a type the project already has).

JSON: `{ "operation": "helper", "context": "sales", "name": "mappers/social-network-type", "implementationType": "prisma" }`.

- `<C>/infrastructure/helpers/I/<folders>/I-n.ts` (`export const iN = () => {}`), no spec

A name that already starts with the type (`prisma-errors`) doesn't get the prefix twice. A helper of a type that isn't saved yet can't be generated: add an implementation of that type first, saving the type.

## Implement

Replace the stub. Rename the function and add more next to it freely. Use the helper by importing it directly: it isn't injected or listed under `Dependencies:`.

- Location: always inside the folder of its type, nothing right under `helpers/`.
- Imports: domain models, helpers of its type, and `import type` of query, command and port contracts. No repositories, domain services, services or implementations.
- Used by: implementations of its type and infrastructure services. Never by wiring, application, presentation, or another context; a helper of the Shared Kernel is available to implementations of its type in every context.
- `npx df-lint` checks all of this except that a helper is stateless.

## Move and delete

Helpers are not modules: `Move or rename` and `Delete` don't list them, so edit them by hand.

- A module that uses a helper can't move to another context while the helper stays behind: the CLI refuses and names the imports. Move the helper by hand first, then the module.
- `Delete` of a module refuses while a helper imports it. Delete or change the helper by hand first.
- Renaming a module inside its context leaves the helper's file name as it was: rename it by hand if it no longer fits.
