---
name: df-ps-project-scripts
description: Rules for running this project's own scripts (package.json) and handling the files they produce — Prisma contract (`contract.prisma`, `prisma:emit`), database migrations (`prisma:migration:plan`, `prisma:migration:apply`), and other codegen. Use when a change needs new or changed database data (models, fields), when planning or creating a migration, when regenerating contract types, or when the user asks to run any project script that writes files.
---

# Project scripts

The project's scripts live in `package.json`. Run them through `npm run <script>`; never call the underlying CLI with other arguments instead, except the flags listed below.

## Rules

1. **No approval needed.** Files written by the project's own scripts (`prisma:emit`, `prisma:migration:plan`, …) aren't "new files" under `df-ps-scaffold` rule 1: run these scripts yourself when the work needs them. Still list them under "Tool runs" in a work plan so the user sees them coming, and report every run.
2. **The database is changed only by a human.** Never run `prisma:migration:apply` or anything else that touches the database (`prisma db …`). When a migration is ready, give the user the command (`! npm run prisma:migration:apply`) and wait.
3. **Script output is never edited.** Generated migrations, `contract.json`, `contract.d.ts`, and any other output are used as-is: no edits, no deletions, no hand-written copies. Output is wrong → change the source (`contract.prisma`) and run the script again; if that can't fix it (a wrong migration already exists), stop and tell the user.

## Prisma

Config: `shared/infrastructure/prisma/prisma.config.ts`. Source: `shared/infrastructure/prisma/contract.prisma` (edit by hand). Output: `contract.json`, `contract.d.ts` (from `prisma:emit`) and `migrations/` (from `prisma:migration:plan`), all next to it. The client is created in `shared/infrastructure/services/prisma-infrastructure-service.ts`.

| Script                   | Does                                                                      | Who runs it       |
| ------------------------ | ------------------------------------------------------------------------- | ----------------- |
| `prisma:emit`            | Emits contract types from `contract.prisma`. Offline.                     | You               |
| `prisma:migration:plan`  | Emits, then writes a migration package from the contract change. Offline. | You               |
| `prisma:migration:apply` | Applies migrations to the database.                                       | **The user only** |

### When to migrate

Only when domain and application logic are implemented, and implementing an infrastructure module (repository, execution command/query) needs data the database doesn't have yet. Not earlier "just in case", and never as the first step of a feature: the domain decides what's stored, not the schema.

Order: domain → application → `contract.prisma` + migration → user applies it → infrastructure → endpoints → other codegen → React.

### Making a migration

1. Edit `contract.prisma` for **one** logical change (a new model, a new field, a renamed field).
2. Plan it with a name by meaning, kebab-case: `npm run prisma:migration:plan -- --name add-user`. Name what changes (`add-user`, `add-order-status`, `rename-review-text-to-body`), not the feature or the ticket.
3. Several changes → repeat 1–2 once per change, so each migration stays atomic.
4. Data loss: if the plan refuses and lists questions, never pass `--delete` without the user's explicit decision for that subject. Pass `--rename old:new` only when the plan says it's a rename; otherwise ask.
5. Check the output: the planned files only, nothing else changed. Report each migration and ask the user to apply them before implementing the infrastructure that depends on them.

Types only (no storage change, e.g. after pulling someone's contract change): `npm run prisma:emit`.
