# Vendored Changes

Local changes made to vendored UI components.

- `src/components/ai-elements/code-block.tsx`: Allow `CodeBlockContent` to receive `null` or `undefined` streaming content and normalize it to an empty string before tokenizing or highlighting. This prevents transient streaming message parts from crashing on `undefined.split(...)`.
- `src/styles/globals.css`: Add the `text-xxs` Tailwind theme token for 10px text with a Tailwind-style 14px line-height.
- `src/lib/utils.ts`: Teach `tailwind-merge` that `text-xxs` is a font-size utility, so it can coexist with text color classes like `text-emerald-100`.
- `src/components/ui/{badge,button,command,dropdown-menu,input-group,toggle}.tsx`: Replace vendored `text-[0.625rem]` utilities with `text-xxs`.
- `src/components/ai-elements/code-block.tsx`: change content `pre`/`code` classes from `text-sm` to `text-xs`
- `src/components/ai-elements/reasoning.tsx`: adjust text/icon/margin size
