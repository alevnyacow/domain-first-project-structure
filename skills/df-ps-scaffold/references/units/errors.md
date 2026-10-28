# Errors {errors}

When: a business failure callers must recognize (`../choosing-components.md`, step 1). Technical, ownerless ones (`unauthorized`) go to the Shared Kernel.

## Generate (context and Shared Kernel)

First prompt (select): `New error without namespace` | `New namespace` | `New error in namespace <ns>`, then a name.

`… pick:Domain pick:Errors "pick:New namespace" text:order`
`… pick:Domain pick:Errors "pick:New error in namespace order" text:not-found`
`… pick:Domain pick:Errors "pick:New error without" text:order-closed`

- Without namespace: appends `export class N extends CtxErrors.define('n') {}` to `<C>/domain/errors/index.ts`; the first one also puts `CtxErrors = errorNamespace('ctx')` (with its import) at the top of `index.ts`
- New namespace: `<C>/domain/errors/ns.ts` (`NsErrors = errorNamespace('ctx').subnamespace('ns')`) + `export * from './ns'` in `index.ts`
- In namespace: appends `export class NsN extends NsErrors.define('n') {}` to `ns.ts` (namespace first), extending the namespace the file exports
- Shared Kernel: errors end with `SharedKernelError`, namespaces with `SharedKernelErrors`: `NSharedKernelError`, `NsSharedKernelErrors`, `NsNSharedKernelError`

`Ctx` = PascalCase of the context folder (`SharedKernel` in Shared Kernel). Contexts start without errors: `index.ts` appears with the first error or namespace. Re-running is safe: an existing namespace file is kept, and a line already in the file isn't added again.

A namespace groups the errors of one area (`order`, `payment`); `New error in namespace` is listed only once the namespace exists, so plan `New namespace` first.

## Implement

- Details: `.define<{ orderId: string }>('not-found')`.
- Throw `new XError({...})`; recognize with `XError.is(e)`, or `XError.matchesCode(data)` after serialization.
- Import a context's errors from its `domain/errors`. Only `shared-kernel/` may import another context's errors, e.g. to map them to HTTP statuses in the endpoint generator ([endpoint](endpoint.md)).
