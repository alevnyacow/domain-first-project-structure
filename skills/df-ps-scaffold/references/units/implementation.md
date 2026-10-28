# Implementation of an existing contract

When: a repository, command, query or port already exists and needs one more implementation, e.g. a third adapter of a port so that test, development and production each use their own. A new contract is its own generator (`aggregate.md`, `command-query.md`, `port.md`); never copy an implementation file by hand.

## Generate (context and Shared Kernel)

Prompts: `Contract:` (select, grouped: Repositories, Commands, Queries, Ports; each with its implementations: `file-storage (in-memory, s3)`) → `Implementation type:` (kebab-case, one the contract doesn't have) → {wire} `Environments:` (checkbox `test`, `development`, `production`, each shown with its current implementation: `development (now: s3)`; at least one) → {wire} `Dependencies for <Implementation>:` for the new implementation only (`../generators.md`).

`… pick:Infrastructure "pick:New Implementation" pick:file-storage text:local toggle:2`

`toggle:` numbers the environments top to bottom: 1 `test`, 2 `development`, 3 `production`.

- `<C>/infrastructure/<kind>/I/I-n….ts` as the contract's generator creates it (in-memory DB included)
- {wire} `~ <C>/wiring/<kind>/wire-n….ts`: import, `const wireIImplementation = wireClass(IN…, [])` before the module's wire, the chosen environments of `envBranchedWire` point at it

An implementation left without environments stays in the wire file; the CLI prints `<Class> is no longer used in any environment.` Specs don't change.

## Implement and test

As the implementations of the contract's unit file. The spec of the contract wires what `NODE_ENV=test` uses: only a new `test` implementation changes what it tests.
