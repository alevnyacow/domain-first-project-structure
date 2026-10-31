# Implementation of an existing contract

When: a repository, command, query or port already exists and needs one more implementation, e.g. a third adapter of a port so that test, development and production each use their own. A new contract is its own generator (`aggregate.md`, `command-query.md`, `port.md`); never copy an implementation file by hand.

## Generate (context and Shared Kernel)

Prompts: `Contract:` → `Implementation type:` → {wire} `Environments:` (at least one) → {wire} dependencies for the new implementation. The type menu merges the category's primary/test history with active system choices and both manual-entry actions (`../generators.md`); it has no ordinary `api`, `mock` or `in-memory` presets. System choices are explicitly marked and conditional: cross-context for ports with a neighbor, shared in-memory DB for repositories/commands/queries with that integration ready. Existing types are disabled. Saving a new ordinary label registers it under `test` and/or `primary` according to selected environments (primary without usable wiring). The run-only action registers nothing.

`… pick:Infrastructure "pick:New Implementation" pick:file-storage "pick:Enter implementation type and save for future use" text:local toggle:2`

`toggle:` numbers the environments top to bottom: 1 `test`, 2 `development`, 3 `production`.

- `<C>/infrastructure/<kind>/I/I-n….ts` as the contract's generator creates it (in-memory DB included)
- {wire} `~ <C>/wiring/<kind>/wire-n….ts`: import, `const wireIImplementation = wireClass(IN…, [])` before the module's wire, the chosen environments of `envBranchedWire` point at it

An implementation left without environments stays in the wire file; the CLI prints `<Class> is no longer used in any environment.` Specs don't change.

## Implement and test

As the implementations of the contract's unit file. The spec of the contract wires what `NODE_ENV=test` uses: only a new `test` implementation changes what it tests.
