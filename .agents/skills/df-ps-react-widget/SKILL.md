---
name: df-ps-react-widget
description: Generate a React widget.
---

# Create a React widget

Use this skill for a reusable widget. Read [common-workflow.md](../df-ps-scaffold/references/common-workflow.md).

1. Confirm React is used and `useReact` is true. Inspect neighboring widgets and decide whether the user wants a simple single component, a UI/model split, or caller-supplied presentation.
2. Run `df-ps` → **Scaffold React module** → **New widget**. Enter the kebab-case widget name without `widget` suffix. Choose one of the exact types:
   - `monolithic`: one `index.tsx` with props and component.
   - `with separated ui`: `types.ts`, component entry, `ui/index.tsx`, and `hooks/use-ui-model.ts`.
   - `headless`: `types.ts`, entry and UI model hook; caller supplies an `UI` component.
3. Files are under `<rootFolder>/presentation/react/widgets/<name>/`. Fill component props, UI, hook mapping, and runtime behavior as requested; templates return empty fragments or empty objects.
4. Check imports, type-only imports, component naming, and collisions. Report the selected shape, paths, and any remaining work.
