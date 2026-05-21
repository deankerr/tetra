# web

### shadcn/ui and AI Elements

- ALWAYS activate the `shadcn` skill when authoring, adding, reviewing, or using `shadcn/ui` components.
- ALWAYS activate the `ai-elements` skill when adding, reviewing, or using AI Elements components.
- Install `shadcn/ui` components as needed with `bunx --bun shadcn add -c packages/ui <component>`.
- Never put padding directly on a ScrollArea component.

### Custom Components

- Most components should use the passthrough props style, merging className with the `cn` helper.
- Use component composition over monolithic prop heavy components.

### Custom Theme Tokens

- `text-xxs`: 10px text with an explicit 12px line-height.
