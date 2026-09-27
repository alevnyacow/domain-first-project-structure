---
name: df-ps-react-page
description: Generate a React page.
---

# Create a React page

Use this skill for a page (not a reusable widget). Read [common-workflow.md](../df-ps-scaffold/references/common-workflow.md).

1. Confirm the project uses React and `useReact` is true in the df-ps config. The CLI hides React modules otherwise. Inspect existing page naming, props, routing, and imports.
2. Run `df-ps` → **Scaffold React module** → **New page**. Enter the kebab-case page base name, without `page` suffix.
3. The CLI creates `<rootFolder>/presentation/react/pages/<name>-page.tsx`, exporting `<PascalName>Page` and an empty props type. Implement the requested UI and props, then connect it to the project's routing conventions if included in scope.
4. Inspect imports, type/style conventions, and collisions. Report the path and any remaining integration work.
