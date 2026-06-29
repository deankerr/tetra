# db migration — deferred consumer cleanups

Observations from converting `core`/`cli` to `@tetra/tinydb`. **Not acted on yet** — the
priority is proving the whole system end-to-end (web included) before massaging consumers.
Revisit during a dedicated cleanup pass.

## Smells worth addressing

- **CLI write-path inconsistency.** Reads-direct is by design, but some _mutations_ bypass
  core: `sessions rename` and `prompts update` write `library.*.update(...)` directly, while
  create/delete go through core modules. Core owns create/delete invariants but not edits, and
  the CLI re-implements "touch `updatedAt` on edit" itself (which `session.ts editMessage`
  already encapsulates for messages). Decide: add `renameSession`/`updatePrompt` to core, or
  bless invariant-free edits as a direct path.
- **`unlinkPrompt` is an O(sessions) scan** on every prompt delete (`run-configs.ts`). No
  "sessions referencing prompt X" index. Fine at prototype scale.

## Neutral / dormant

- **`update`-is-field-patch skips object-level zod refinements** — now live in `editMessage` and
  CLI edits, but inert (no table has such a refinement yet). See `packages/tinydb/README.md`.

## Web layer (from the web/worker conversion)

### Architectural watch-item

- **Eager module-level store instances changed the SSR profile.** To make the React
  singletons instance-bound (no Provider), `web/store.ts` hoists the three `createDb` calls
  to module scope — so stores are now instantiated at module load, **including server-side
  during SSR** (previously they were created lazily in a client-only async runtime).
  Harmless today (in-memory, unused server-side; persisters/sync stay client-only), but the
  old lazy approach was SSR-safe by construction and this one is not: a browser-only call
  added to the eager module path would break SSR silently. Consider a comment/guard there.

### API-ergonomics smells the new hooks exposed

- **Subscription-for-side-effect.** `message/fork-control.tsx` calls
  `libraryReact.messages.useBySession(...)` purely to trigger re-renders, then reads the
  actual data imperatively via `transcripts.getSession().listContinuations()`. Subscription
  and read are decoupled across two mechanisms — fragile, since the "unused" hook call looks
  deletable but isn't. Predates the migration; the new query hook makes it look more like
  dead code.
- **Read-only field via a two-way hook.** `run-config-providers.tsx` reads a cell with
  `const [storedConfig] = useFieldState(id, 'config')`, discarding the setter (and its
  `useCallback`). Read-only single-field reads are common enough that a read-only `useField`
  hook in tinydb may be worth adding (the design doc mapped `useCell → useFieldState` only).

### Coverage gap

- **The web React layer (17 files) has no automated tests** — only manual smoke testing.
  Deleting `tinybase-schema` also removed its React hook tests; tinydb's `react.test.ts`
  covers the hook factory in isolation but nothing exercises the app's real usage. The web
  layer is the least-protected part of the migration; a component-hook regression would only
  surface by hand.
