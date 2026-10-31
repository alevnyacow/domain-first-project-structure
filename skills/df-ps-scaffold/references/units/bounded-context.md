# Bounded context

When: a concept with its own lifecycle and vocabulary, or a different business owner (`df-ps-plan-feature`, step 3). Never one context per feature.

## Generate

`"pick:Scaffold new bounded context" text:sales` → empty folder `<rootFolder>/bounded-contexts/sales/`. No error namespace until the first error ([errors](errors.md)).

Name: a business area in kebab-case (`sales`, `reviews`), not a feature.

## Implement

Nothing to fill in. Everything inside comes from the other units. Domain and application stay isolated; cross-context port adapters may reach neighboring application handlers through their matching wiring (`df-ps-implement`, "Bounded context isolation").
