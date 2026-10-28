# Bounded context

When: a concept with its own lifecycle and vocabulary, or a different business owner (`df-ps-plan-feature`, step 3). Never one context per feature.

## Generate

`"pick:Scaffold new bounded context" text:sales` → empty folder `<rootFolder>/bounded-contexts/sales/`. No error namespace until the first error ([errors](errors.md)).

Name: a business area in kebab-case (`sales`, `reviews`), not a feature.

## Implement

Nothing to fill in. Everything inside comes from the other units. The context imports nothing from other contexts and they import nothing from it (`df-ps-implement`, "Bounded context isolation").
