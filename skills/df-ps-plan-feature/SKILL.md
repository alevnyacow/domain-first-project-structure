---
name: df-ps-plan-feature
description: Turn an abstract feature request into a Domain-First plan for a project using `df-ps` (@domain-first/project-structure) — decide which bounded contexts own what and which components are needed, then get the user's approval before generating anything. Use when the project has domain-first.project-structure.config.json and the user describes a feature ("add product reviews", "let users cancel orders") without naming bounded contexts or exact components.
---

# Plan a feature

Understand → decompose → assign → get approval → hand off. A feature creates files, so nothing is generated or written before approval (`df-ps-scaffold`, rule 1).

## 1. Understand what exists

Read the config, then build an overview of the contexts and `shared/` from existing architecture docs and a file inventory:

```bash
rg --files <rootFolder>/bounded-contexts <rootFolder>/shared
```

Use the overview to identify likely owners and related contexts. Search for the feature's domain terms and synonyms; don't infer ownership from folder names alone.

Read the relevant code in the affected contexts: aggregates and their rules, use cases, commands/queries, ports, and behavior tests. Follow their dependencies into adapters, wiring, relevant `shared/` components, and the REST endpoints of any providing context. Note how contexts can reach each other: which database each one uses, and any message queue, RPC, or event setup. Expand the search when ownership or a dependency remains unclear; unrelated implementations do not need a full read.

For each affected context, note what it owns, what it does, its language, and the ports and other-context queries/commands involved in the feature. Stop expanding when you can justify ownership, identify reusable components, and verify both sides of each required cross-context interaction. Mark unresolved assumptions in the plan. If there are no contexts yet, propose an initial split in step 3.

## 2. Decompose

Split the request into pieces of logic and choose each piece's component with `df-ps-scaffold/references/choosing-components.md`. Record the deciding step for the "Why" in the plan: `choosing-components, step N` for a component, `step 3, rule N` (below) for a placement.

## 3. Assign to contexts

1. A component goes where the data and rules it depends on live.
2. Extend an existing context when the concept fits its language and lifecycle (the normal case).
3. Create a new context only for a concept with its own lifecycle and vocabulary, or a different business owner. Never one context per feature.
4. Contexts are fully isolated and never import each other, so each can become its own service. Every need for another context's data or behavior is a **query or command** in the consuming context, with its own duplicated models, implemented the simplest available way. Find it in the code:
   - Both contexts use the same database → query it directly (the persistence label, e.g. `prisma`).
   - Otherwise, look for the ways the project already reaches a context besides its REST endpoints: message queue, RPC, events, generated API clients. Several options (REST counts) → ask the user which one in "Decisions for you", with a recommendation. Never pick silently.
   - Nothing besides REST → the providing context's REST endpoint (`http`).

   Unless it's the database, plan **both sides**: check that the providing context exposes what the call needs (endpoint, queue consumer…). If not, add it (and the handler behind it: a query or command, or a use case only when one query or command isn't enough) to the plan.
5. `shared/` holds technical, ownerless pieces and universal entities / value objects (`money`, `email`): the same meaning in every context, owned by none. Never a concept with one context's meaning or rules.
6. Names: kebab-case, in the context's language. Contexts are business areas (`sales`, `reviews`), not features.

If two placements are plausible, ask the user and give your recommendation.

### When ownership is unclear

Find out why, then act:

- **You don't understand the domain** (unknown term, unclear who changes the data). Ask business questions, not "which context?": Who changes it, and when? What rule does it protect? What changes together with it? Who decides when the rule changes? The answers point to the owner. Check whether the code already has the concept under another name.
- **The logic spans several contexts** (e.g. "cancel only if not shipped and refunded"). It's a process: each context owns its part, and the initiating context gets the coordinating use case and reaches the others through its own queries and commands.
- **Nobody knows, including the user.** Pick a reversible default: the initiating or closest context, other contexts behind its own queries and commands, and mark it **(provisional)** with the reason.

Never: pick silently, put one context's domain logic in `shared/`, create a catch-all context (`common`, `core`, `misc`), or split arbitrarily.

## 4. Present the plan

One message: the architectural part plus the work plan in the `df-ps-scaffold` rule 1 format. Then stop.

```markdown
**Feature:** product reviews
**Contexts:** `reviews` (new): reviews and their moderation. `sales`: unchanged; `reviews` reads purchases from the shared database.

**Work plan**
(df-ps-scaffold format: new contexts first; mark (new) and (provisional))

**Why:** own lifecycle and vocabulary → own context (step 3, rule 3); review → aggregate (choosing-components, step 4). "Only buyers" needs `sales` data → query `customer-purchase` in `reviews` with its own models, implementation `prisma`: same database, so no `sales` endpoint is needed (choosing-components, step 9; step 3, rule 4).

**Decisions for you:**
1. Separate `reviews` context (recommended) or part of `catalog`?
2. Must reviews be moderated before publishing?
```

- Ask only what changes structure or domain behavior. Decide names and details yourself.
- Open questions block approval: answers first, then the updated plan, then approval.

## 5. Hand off

After explicit approval, continue from step 6 of the `df-ps-scaffold` workflow: generate, implement, check isolation, report.
