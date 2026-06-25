# Session Message Renderer

`MessageView` is the entry point for rendering one transcript message. Callers pass a
`messageId` plus thread-derived display facts such as whether this is the rendered
leaf; nested slices can read TinyBase directly when they need lightweight, reactive
state.

The first implementation preserves the existing message surface while replacing the
old Step/Block renderer with ai-elements primitives:

- `Message`, `MessageContent`, `MessageResponse`, `MessageActions`, and
  `MessageToolbar` provide the outer message structure, markdown, and controls.
- `Reasoning` renders reasoning parts as collapsible model thinking.
- `Tool` renders AI SDK tool parts without Tetra-specific tool chrome.

The message surface intentionally keeps run accounting quiet. The header shows the
run model id from the run config snapshot with coarse run status; step metadata,
token counts, and detailed usage live in the run details sheet.

Composition stays explicit. Major behavior slices live in separate files, but their
sub-components remain local unless another slice needs them. TinyBase remains the
state boundary, so we are not adding a message-level React context until repeated
cross-slice prop pressure proves that it pays for itself.

Thread view focus belongs outside the message component itself. The surrounding
session surface stores a local thread anchor in the unsynced `web` store, while
message controls pass selected messages to core transcript APIs so fork-point
choices resolve to complete root-to-leaf threads.

Current slices:

- `view.tsx` owns the TinyBase message/run lookup, the outer ai-elements
  `Message` frame, the ai-elements `MessageContent` frame, and run error display.
- `header.tsx` owns the combined model and coarse run status badge.
- `parts.tsx` owns UIMessage part rendering; `view.tsx` passes the current message
  parts plus the run-derived streaming flag.
- `fork-control.tsx` owns local fork-choice navigation for regenerated messages
  and other fork-point alternatives.
- `actions.tsx` owns the message toolbar, metadata, run details sheet trigger, and
  transcript mutations.
- `data.ts` owns the narrow run helpers and shared part type alias.
- `../thread-view.ts` owns the session-level thread anchor and resolved-thread
  state used by the conversation pane, composer, and message controls.

## Branching Assessment

The included ai-elements `MessageBranch` components are a useful visual primitive,
but they are not enough to own Tetra thread navigation directly. They track a local
branch index and discover branch content from React children; Tetra needs navigation
to derive from message ids, parent links, and TinyBase rows. If we use them later,
they should sit behind a Tetra wrapper that maps fork-choice message ids to the
selector and persists no synchronized focus state.
