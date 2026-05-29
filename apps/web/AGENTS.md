# web

### Prototype Mode

- Don't clutter our components with `useCallback` or `useMemo` unless absolutely necessary.

### shadcn/ui and AI Elements

- ALWAYS activate the `shadcn` skill when authoring, adding, reviewing, or using `shadcn/ui` components.
- ALWAYS activate the `ai-elements` skill when adding, reviewing, or using AI Elements components.
- Install `shadcn/ui` components as needed with `bunx --bun shadcn add -c packages/ui <component>`.
- Never put padding directly on a ScrollArea component.

### Custom Components

- Swallow the Tailwind, not the content: display components should own layout, spacing, typography, and state classes while accepting `children` for the actual rendered content.
- Most custom components should use the passthrough props style, merging `className` with the `cn` helper like the shadcn `Button` component.
- Prefer small reusable display shells over prop-heavy components. Keep labels, icons, values, and mapped data at the call site unless a prop encodes behavior.
- Avoid dedicated per-item display components when a shared compositional component can express the same structure with children.

### Custom Theme Tokens

- `text-xxs`: 10px text with an explicit 12px line-height.
