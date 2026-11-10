# Programming principles

## Naming instead of comments

Code documents itself through names. If something is unclear without a comment, rename or restructure the code first.

Keep a comment only for non-standard behavior the code can't show: a non-obvious decision, a workaround for a library quirk, a security requirement.

```ts
// Bad: the comment restates the name
/** Domain social network → database enum value */
socialNetworkIdToPrisma(x: SocialNetworkId) { … }

// Good: explains a decision the code doesn't show
// Another author's post is reported as missing so we don't reveal that it exists
if (!post || !post.isAuthoredBy(requesterId)) { … }
```

A `TODO(...)` is a task, not an explanation: keep it.

The one exception: modules of the application layer have a required JSDoc block on the class, in the format of the `df-ps-implement` skill.

## Code reads like plain English

Read a line aloud: it should sound like a sentence about the domain, not a puzzle. Spell words out (`requesterId`, not `reqId`; `id` and `url` are fine), name a boolean state with a plain adjective (`enabled`, `published`) and use `has` or `can` where the meaning needs a verb (`hasPosts`, `canEdit`), name functions with verbs, and give a complex condition a name of its own. Prefer a getter for a synchronous check without side effects: `order.hasItems`, not `order.hasItems()`. A check that takes an argument stays a method: `post.hasAuthor(requesterId)`.

```ts
// Bad
if (p.uid === rid && !p.del && p.pubAt) { … }

// Good
if (post.hasAuthor(requesterId) && post.published) { … }
```
