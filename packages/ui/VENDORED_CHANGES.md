# Vendored Changes

Local changes made to vendored UI components.

- `src/components/ai-elements/code-block.tsx`: Allow `CodeBlockContent` to receive `null` or `undefined` streaming content and normalize it to an empty string before tokenizing or highlighting. This prevents transient streaming message parts from crashing on `undefined.split(...)`.
- `src/styles/globals.css`: Add the `text-xxs` Tailwind theme token for 10px text with a Tailwind-style 14px line-height.
- `src/lib/utils.ts`: Teach `tailwind-merge` that `text-xxs` is a font-size utility, so it can coexist with text color classes like `text-emerald-100`.
- `src/components/ui/{badge,button,command,dropdown-menu,input-group,toggle}.tsx`: Replace vendored `text-[0.625rem]` utilities with `text-xxs`.
- `src/components/ai-elements/code-block.tsx`: change content `pre`/`code` classes from `text-sm` to `text-xs`
- `src/components/ai-elements/reasoning.tsx`: adjust text/icon/margin size
- `src/components/ai-elements/markdown-components.tsx`: set fenced code block body background to the `canvas` token (`bg-canvas`) so the code content area is lifted off the near-black floor (the `code-block` container stays `mist-900`).
- `src/components/ui/sheet.tsx`: change `SheetContent` background from `bg-background` (mist-950) to the `canvas` token (`bg-canvas`); the near-black overlay resets elevation, so the sheet sits a step above the canvas floor.
- `src/components/ui/sheet.tsx`: application-style refactor. Remove the floating close button and `showCloseButton` prop entirely (sheets add a `SheetClose` to the header instead). `SheetContent` is the scroll container (`overflow-y-auto`, no forced `flex flex-col`); sheets that fill with a self-scrolling child opt out via `overflow-hidden`/`flex flex-col` in `className`. `SheetHeader` becomes the fixed-height (`--header-height`) sticky app bar (title left, actions right, `bg-inherit`). `SheetTitle` restyled to the compact `text-xs` header style.
- `src/components/ui/sidebar.tsx`: restore the mobile sidebar sheet to the full-height flex layout by opting out of `SheetContent` scrolling and explicitly clearing the new sticky/header-height `SheetHeader` defaults from the hidden accessibility header.
