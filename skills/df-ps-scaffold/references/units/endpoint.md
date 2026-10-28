# REST endpoint {handlers-rest}

When: an HTTP entry point (`../choosing-components.md`, step 2). It exposes a query, a command or a use case of its context.

## Generate (context only)

Prompts: controller (select: existing | `New controller` → name) → method (`get` `post` `patch` `delete` `put`) → relative path (may be empty: `default`) → {wire} `Handler:` (select: queries, commands, and use cases of `<C>`, grouped; skipped if there are none).

`… pick:Presentation "pick:New Handlers" "pick:New controller" text:orders pick:get text:recent pick:RecentOrdersQuery`
`… pick:Presentation "pick:New Handlers" pick:orders pick:post default pick:PlaceOrder`

For `sales`, `orders`, `get`, `recent`:

- `<C>/presentation/rest/orders/recent/GET.ts`: `class OrdersRecentGetEndpoint(endpointGenerator, handler)`, route `['sales','orders','recent']`. `endpointGenerator: RestEndpointGeneratorPresentationService` (the Shared Kernel generator) and `handler: RecentOrdersQuery` (`never` without a pick), both `import type`. `get handle()` calls `this.endpointGenerator(...)`, which doesn't compile until a generating getter is picked (`this.endpointGenerator.withoutGuards(...)`); that's expected, not a generator bug. Projects without the generator file get `EndpointGenerator` from handlers-rest.
- {wire} `<C>/wiring/presentation/rest/orders/wire-orders-recent-get-endpoint.ts` (`[wireRestEndpointGeneratorPresentationService, wireRecentOrdersQuery]`; `[]` without the generator file) + a line in that folder's `index.ts`
- {wire}, new controller only: `<C>/wiring/presentation/rest/index.ts`, `<rootFolder>/presentation/rest/wires.ts` (lines appended), `<rootFolder>/presentation/rest/index.ts` (`restHandlers`, created once)

The same controller, path, and method replace the existing endpoint (after `Overwrite them?`). Generate the exposed handler first, so `Handler:` lists it. If `handler: never` is left, re-run the endpoint generator once the handler exists, as an approved overwrite; don't replace it by hand.

## Implement

1. Generator: `df-init` (or the `REST endpoint generator` integration) creates `RestEndpointGeneratorPresentationService` in `<rootFolder>/shared-kernel/presentation/services/`; every endpoint uses it. Set the module-level `const adapter` above the class (`undefined` until set) to the HTTP framework's adapter; the class reads it through closure. If the Next adapter was connected, the file already imports `nextAdapter` from `@domain-first/handlers-next` and passes it instead; just make sure that package is installed.
2. Errors: invalid requests (`400`) are answered by `invalidRequest()` of `@domain-first/handlers-rest` in `errors`; don't map `RequestParsingError` / `InputMappingError` by hand, add your own mappings next to it: `errors: [httpError(MyError, 404), invalidRequest()]`. Map domain errors with `httpError(ErrorClass, status, { description, message, details: { schema, map } })` (one class) or `httpStatus(status, { code, match })` (many errors, one code); the first match wins, so put specific mappings first, importing them from the contexts' `domain/errors` (the only thing `shared-kernel/` may import from a context, besides domain models in the in-memory DB).
3. A new kind of endpoint (auth, other context) is a new getter returning `createEndpoint({ context, errors: [..., invalidRequest()] })(adapter) as EndpointGenerator` (`nextAdapter` with the Next adapter), next to `withoutGuards`.
4. Complete `get handle()`: pick the generating getter that fits the endpoint (`this.endpointGenerator.withoutGuards(...)`, or one with the needed guards), then `.input(...)`, `.mapInput(...)`, optional `.output(...)`, `.mapOutput(...)`.
5. Register `restHandlers` from `<rootFolder>/presentation/rest/index.ts` in the server bootstrap (`df-ps-scaffold` `SKILL.md`, rule 2, exception 5). With the Next adapter and wire, `app/api/[...path]/route.ts` (or `src/app/…`) already serves them through `nextEndpoints(restHandlers)`; it compiles once the first endpoint exists.

After new endpoints, regenerate the OpenAPI document and the API client with the project's scripts (tool runs in the plan).
