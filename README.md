# @domain-first/project-structure

Stop hand-rolling folders. Scaffold a clean, consistent **Domain-First** architecture — bounded contexts, aggregates, use cases, commands/queries, ports, REST endpoints, React modules — with one command, every time.

```bash
npx df-ps
```

## Why

- **Zero boilerplate** — aggregates, repositories, wiring and tests generated in seconds, correctly named and cross-linked
- **One consistent architecture** — every bounded context, layer and file lands in the same place, no matter who on the team runs it
- **Grows with your stack** — adapts output to whichever `@domain-first` packages (`types`, `errors`, `handlers`, `wire`, `handlers-rest`) you use, or stays framework-free if you don't
- **Interactive, not magic** — a guided CLI menu, not a rigid template you fight against

## Install

```bash
npm i -D @domain-first/project-structure
```

## Quick start

```bash
npx df-ps
```

First run walks you through a short setup (source folder, packages, testing library) and writes a config file. Every run after that opens a menu to scaffold whatever you need next — a new aggregate, use case, endpoint, widget — into your existing structure.

## What gets generated

Pick a piece, get the whole slice — class, tests, infra implementation and wiring, all linked together:

- **Domain** — aggregates, repositories, services, namespaced errors
- **Application** — use cases, commands & queries (execution or orchestration), ports
- **Infrastructure** — adapter implementations per port/repository (e.g. `prisma`, `in-memory`)
- **Presentation** — REST endpoints, React pages/widgets

Everything lands with consistent naming and imports. For example:

```
bounded-contexts/
  order/
    domain/aggregates/order/
    application/use-cases/
    application/commands/
    infrastructure/repositories/
    presentation/rest/
    wiring/
```

## License

MIT
