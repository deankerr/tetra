# Vendored Changes

Local changes made to vendored UI components.

## 2026-05-13

- `src/components/ai-elements/code-block.tsx`: Allow `CodeBlockContent` to receive `null` or `undefined` streaming content and normalize it to an empty string before tokenizing or highlighting. This prevents transient streaming message parts from crashing on `undefined.split(...)`.
