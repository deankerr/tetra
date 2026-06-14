# Architecture Notes

Scratch notes captured from recent discussion. This is a brain dump, not a plan.

## General Philosophy

- Optimise the core model for future modular features.
- Prefer primitives that stay honest about their responsibilities.
- Avoid overfitting to one workflow before transcript editing, regeneration, branching, and context management settle.
- Keep the runtime core UI-agnostic where possible.
- Use TinyBase as an in-memory local-first store, not as a server database abstraction.
- Prefer direct, durable records for things that matter after a run completes.
- Keep hot streaming state isolated from committed transcript state.
- Avoid storing observability-level data forever in the main TinyBase database.
- Draw a line between actionable app state and deep forensic traces.

## Runs

- A run is a record of an action applied to a session.
- It is like a function run over the session that returns a new session state.
- A run has runtime/lifecycle concerns:
  - target assistant message,
  - status,
  - config snapshot,
  - error/cancel/completion state.
- Runs are historical records, but not perfect replay records.
- We cannot guarantee all original inputs are preserved exactly.
- The run config is actionable history: if config changed across a session, an earlier config can be restored or inspected.
- Full conversation snapshots per run are too much for the main TinyBase store.
- Deep input/output observability belongs in external tools like Langfuse, not the app DB.

## Run Config

- `RunConfig` describes how to start a run.
- It is a recipe for the runtime.
- There is a mutable working config associated with a session.
- The working config reflects the current session UI state.
- The config used by a run is a snapshot of that working config at start time.
- The run snapshot should be immutable once committed.
- The config shape is unstable during development.
- Be tolerant of stored config with older/different shape.
- Strict parsing should happen at the boundary where a run starts.
- Do not require users/callers to specify an entire config every run.
- Avoid a heavy config registry until there is enough shape pressure.
- Future context management will likely replace crude fields like `maxMessages`.

## Session Config / Working Config

- Storing the working config in a table is convenient for TinyBase and React.
- Per-session working config should not be explicitly “committed.”
- Editing config is just editing the current session UI/runtime recipe.
- CLI-provided config flags should update working config, not act as invisible one-off overrides.
- The default config for new sessions can be a loose blob because it is a cold path.

## Messages

- Messages are durable transcript content.
- User and assistant messages should be created outside Runs where appropriate.
- Creating messages outside Runs keeps core runtime responsibilities honest.
- Assistant messages represent outcomes of runs.
- During a run, the target assistant message owns the current streaming parts.
- Run status determines whether those parts are provisional or terminal.
- Future transcript editing is not settled.
- Avoid designing as if transcript order and message IDs are final forever.
- Proper regeneration is probably best expressed as branching.

## Streaming Message Parts

- Streaming parts persist directly to the target message row.
- This keeps crash/tab recovery tied to the durable transcript artifact.
- Updating message parts also updates `messages.updatedAt`.
- Streaming snapshots should not touch `sessions.updatedAt`.
- Run owns lifecycle, status, cancellation, and failure decisions.
- Message rendering stays dumb: render `messages.parts`; use run status for streaming UI.

## Steps / Usage

- Step usage data arrives complete at the end of a model step.
- It does not stream in continuously.
- Once a step is committed, it never changes.
- Steps are immutable metadata/accounting records.
- Step records should be canonical for usage.
- Message/run/session totals can be derived from steps for now.
- Avoid stored summaries unless measured pressure or product needs justify them.
- Current app scale does not require denormalized totals.
- Message components can retrieve their step data and memoize local totals.
- Session-level totals can be derived from all session steps when needed.
- A steps table is useful for grabbing all steps for a session.
- Step records should not store message parts or duplicate conversation content.
- Step records should not depend on ephemeral streaming state IDs.

## Usage Data Shape

- Preserve provider data when returned, especially because upstream schemas change.
- Promote fields to cells only when there is a concrete read/index/render reason.
- Use a single `raw` object for raw finish reason and raw usage.
- `raw` and `warnings` should be present even when empty.
- Warnings are structured SDK diagnostics, not provider raw payload.
- Warnings should be permissive, with required `type` and optional detail/message/feature.
- Be careful with names like input/output because pricing categories may be hidden inside them.
- Cache read/write accounting is provider-dependent.
- OpenRouter reports some cache savings via `usage_cache`, but cache write cost visibility remains an open question.

## TinyBase Schema

- Prefer nullable fields over optional top-level cells.
- Reject optional cells in schema definitions.
- `delCell`/absence behavior is too weird for the core schema model.
- Null is the explicit absence value.
- Raw TinyBase defaults repair invalid writes instead of throwing; typed APIs
  must parse with zod before writing when invalid input should fail loudly.
- Keep less of the massive TinyBase API in play where possible.
- Avoid type-level gymnastics if a runtime guard is enough.

## React / Rendering

- Hot streaming updates should not force the full transcript area to churn.
- Keep render-localized reads where possible.
- Message components should not understand the full run process.
- Usage totals do not need to reactively update everywhere immediately.
- React can “cheat” with imperative/runtime data when it is the simpler boundary.

## Regeneration / Branching

- Current regeneration is a toe-dip.
- Proper regeneration likely means conversation branching.
- Branching is out of scope for this immediate schema work.
- Do not overfit the core model around today’s simplistic regeneration.

## Session Import / Seeds

- Session import/seeds did not provide enough benefit for the maintenance cost.
- Removing that module simplifies core.
- Export may still be useful as a local inspection/debug artifact.

## Open Threads

- Full review of runs/run mechanisms.
- More principled config architecture once current primitives settle.
- Transcript editing story.
- Conversation branching.
- More advanced context management.
- Whether/when to add denormalized usage summaries.
- What belongs in app DB versus external observability.
