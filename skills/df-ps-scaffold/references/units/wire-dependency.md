# Wire dependency {wire}

When: an existing wired module needs a new dependency (`df-ps-scaffold` `SKILL.md`, rule 3). New modules get theirs in the generator's `Dependencies:` step instead.

## Generate (context and Shared Kernel)

Prompts: module (select: wired modules of `<C>`, grouped as in `Dependencies:`, endpoints excluded; an env-branched module is listed once per implementation, e.g. `UserRepository (prisma)`, `UserRepository (in-memory)`) → `Dependencies:`, or `Dependencies for <Implementation>:` for the chosen implementation only (`../generators.md`). Modules already in the wire are not listed. If nothing fits, it prints `No dependencies available for this module.` and changes nothing.

`"pick:Bounded Context: users" "pick:Wire dependency" "pick:UserRepository (prisma)" toggle:1`

Edits the wire and the implementation classes in place; this never triggers `Overwrite them?`. List it in the plan as a run for the existing module.

## Implement

Use the injected dependency in the class body. Don't edit the constructor parameters or the wire list by hand. A dependency the CLI doesn't offer is forbidden by the dependency rules or by context isolation: change the design instead (a port, a query or command, an infrastructure service).
