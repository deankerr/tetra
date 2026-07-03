# Mergeable delete-vs-update race (ghost rows)

Diagnosed 2026-07-04 while reworking image handling: a synced session appeared in the sidebar that
crashed the whole session list on render. Root cause is a CRDT delete-vs-update race in the
`library` MergeableStore. All claims below were verified the same day by standalone reproduction
against the installed tinybase (8.4.1). **Status: unfixed** — recorded here so it isn't
re-derived, and so a fix can be chosen deliberately.

## TL;DR

- The `library` store is a TinyBase **MergeableStore**: it merges _per cell_ by HLC timestamp,
  last-write-wins, with tombstones for deletions.
- `collection.delete()` uses `store.delRow()`, which tombstones **every** cell of the row.
  `collection.update()` uses per-cell `store.setCell()`, which stamps an HLC on **only** the cells
  in the patch. Every session-config write patches only `config`.
- If one synced peer deletes a session while another peer edits that session's `config` (and the
  edit's HLC is the later of the two), the merge resolves per cell: the `config` write wins on its
  cell and **resurrects it**, while `createdAt` / `title` / `updatedAt` stay tombstoned. The result
  is a `{ config }`-only ghost row.
- Reads break asymmetrically: `hasRow` is `true` (so `require()` and every write-side guard pass),
  but every entity read runs `schema.parse(row)`, which throws on the missing required cells. The
  sidebar maps `parseEntity` over every row, so one ghost throws and takes down the entire
  `SessionGroup`.
- This is a **class of bug, not a sessions-only bug**: `deleteSession` cascades `delRow` over the
  session's runs, steps, and messages — all of which receive per-cell streaming writes — so the
  same race can ghost rows in any of those tables.

## Symptom

Navigating to any session (or just rendering the sidebar) threw:

```
ZodError: [
  { "path": ["createdAt"], "message": "Invalid input: expected number, received undefined" },
  { "path": ["title"],     "message": "Invalid input: expected string, received undefined" },
  { "path": ["updatedAt"], "message": "Invalid input: expected number, received undefined" }
]
  at parseEntity (packages/tinydb/src/collection.ts)
  at useAll     (packages/tinydb/src/react.ts)
  at useSessionIds (apps/web/src/sidebar/session-group.tsx:29)
```

Inspecting the offending row showed a single cell:

```js
store.getRow('sessions', 'sess_nuzT8WHDzFWY') // → { config: {...} }   (hasRow === true)
```

It only surfaced with **sync enabled**, was never seen in normal single-user use, and returned
after being deleted — re-merged from another synced peer that still held it (see
[Where ghosts live](#where-ghosts-live)).

## Root cause

Two facts combine.

**1. The library is a CRDT.** [`apps/web/src/stores/index.ts:90`](../../apps/web/src/stores/index.ts)
builds it with `createMergeableDb(librarySchema)`. A MergeableStore keeps a hybrid-logical-clock
timestamp per _cell_ and merges by taking the higher timestamp per cell. Deleting a row writes a
tombstone (also timestamped) to each existing cell.

**2. delete and update are asymmetric** in
[`packages/tinydb/src/collection.ts`](../../packages/tinydb/src/collection.ts):

```ts
delete(id) {
  store.delRow(tableId, id)          // tombstones EVERY cell of the row, at one HLC
},

update(id, patch) {
  if (!store.hasRow(tableId, id)) throw ...    // existence guard (see below)
  for (const [cellId, value] of Object.entries(patch)) {
    store.setCell(tableId, id, cellId, ...)    // stamps an HLC on ONLY the patched cells
  }
},
```

Every session-config write patches only the `config` cell, so it stamps only that cell:

- [`packages/core/src/run-configs.ts:30`](../../packages/core/src/run-configs.ts) — `RunConfigs.update` → `sessions.update(id, { config })`
- [`packages/core/src/run-configs.ts:55`](../../packages/core/src/run-configs.ts) — `unlinkPrompt` → `sessions.update(id, { config })` (for **every** session referencing the prompt, widening the write surface)
- [`apps/web/src/session/run-config-providers.tsx:34`](../../apps/web/src/session/run-config-providers.tsx) — `PersistedRunConfigProvider.updateConfig` → `sessions.update(id, { config: next })`

Now the race, with each peer acting on its own local view before they next sync:

```
Peer A                         Peer B
------                         ------
(both hold session S, in sync)
delRow(S)                      setCell(S, config, …)   // e.g. a field editor on blur
  → tombstone every cell         → stamps ONLY config, at HLC t_cfg
    at HLC t_del

              …peers sync / merge…

merge picks the higher HLC PER CELL:
  config:    t_cfg > t_del  → config RESURRECTS
  createdAt: only write is the tombstone → stays deleted
  title:     "                          → stays deleted
  updatedAt: "                          → stays deleted

Result on S:  { config }   — hasRow === true, schema.parse() throws
```

**Timing direction matters** (verified): the ghost only forms when the edit's HLC is later than the
delete's. If the delete lands later (`t_del > t_cfg`), its tombstones win every cell and the row
deletes cleanly. This halves the window and is part of why the bug is rare.

### Why the write-side `require()` guards don't help

`RunConfigs.update`, `PersistedRunConfigProvider.updateConfig`, and `collection.update` all check
`hasRow` / `require()` before writing. That check runs against the **writing peer's local view**,
where the row still exists because it hasn't merged the remote delete yet. The guard passes, the
per-cell write proceeds, and the conflict only materializes at merge time. This is the classic
"delete vs. concurrent update" conflict; TinyBase resolves it per cell, so the update wins its cell.

### No upstream fix

Per-cell LWW is inherent to the MergeableStore design. The official TinyBase docs don't address
delete-vs-concurrent-update at all, and there is no delete-wins option. tinybase 9.0 (released;
repo pins 8.4.1) does not change these semantics. This is ours to handle.

## Blast radius

### One ghost crashes the whole list

`hasRow` is true for a row with _any_ surviving cell, so the ghost isn't skipped. But every entity
read funnels through the same strict parse:

```ts
// packages/tinydb/src/collection.ts
export function parseEntity(schema, rowId, row) {
  return { ...schema.parse(row), id: rowId } // throws: createdAt/title/updatedAt missing
}
```

`all()` / `get()` / `require()` and their React counterparts `useAll` / `useGet` / `useRequire`,
plus every per-index query hook (`bySession` etc.), all call `parseEntity`
([`packages/tinydb/src/react.ts:94`](../../packages/tinydb/src/react.ts)). The sidebar's
`useSessionIds` calls `useAll`
([`apps/web/src/sidebar/session-group.tsx:29`](../../apps/web/src/sidebar/session-group.tsx)).
One unparseable row throws for the entire `.map`, so a single ghost takes down the whole
`SessionGroup` (caught by the route error boundary → "Something went wrong").

### Not just sessions

`deleteSession` ([`packages/core/src/transcripts/transcripts.ts:45`](../../packages/core/src/transcripts/transcripts.ts))
cascades `delRow` over every run, step, and message in the session. Meanwhile an active run streams
per-cell updates into those same tables from another peer:

- [`packages/core/src/runtime/run.ts:257`](../../packages/core/src/runtime/run.ts) — `messages.update(targetMessageId, { parts, updatedAt })` on every stream tick
- [`packages/core/src/runtime/runs.ts:189`](../../packages/core/src/runtime/runs.ts) — `runs.update(runId, { status, ... })` transitions
- [`packages/core/src/transcripts/session.ts:122`](../../packages/core/src/transcripts/session.ts) — manual message edits

A peer deleting a session while another peer has an active run in it can ghost message/run/step
rows by exactly the same mechanism — and those tables are read through the `bySession` index hooks,
which crash the same way. Any fix scoped only to the sessions table treats one instance of the
class.

## Where ghosts live

The sync worker is **not** a copy of the data. `RelayDurableObject`
([`apps/worker/src/index.ts`](../../apps/worker/src/index.ts)) does not override
`createPersister()`, and the tinybase base class only creates a server-side store when it does —
so the relay holds no merged state and only forwards frames.

Ghosts persist in each **peer's own store**: the library is OPFS-persisted per device
([`apps/web/src/stores/runtime.ts:46`](../../apps/web/src/stores/runtime.ts)), CRDT metadata
included, so a ghost survives reloads on every peer that merged it. Re-enabling sync resurfaces it
from whichever peer still holds it. Cleanup therefore means converging the peers, not purging the
worker.

## Why it's rare

It needs concurrent activity on the **same** session across synced contexts — one deleting it, one
editing its config — within the window before those contexts sync, _and_ the edit must win the HLC
race against the delete. Normal single-user flow rarely does that. It surfaced here because a fresh
agent browser joined sync while sessions were being created, deleted, and navigated rapidly across
broadcast-synced tabs.

## Reproduction

Two `MergeableStore`s, a delete on one racing a config edit on the other, then a merge. Produces the
exact `{ config }`-only shape. Runs standalone (`bun run <file>` from `apps/web` for tinybase 8.4.1):

```ts
import { createMergeableStore } from 'tinybase/mergeable-store'

const A = createMergeableStore('A')
const B = createMergeableStore('B')

// A full row, converged to both peers.
A.setRow('sessions', 's1', {
  config: '{"modelId":"m"}',
  createdAt: 1,
  title: 'Hello',
  updatedAt: 1,
})
A.merge(B)

// The race: A deletes the whole row; B (hasn't seen the delete) edits only config.
A.delRow('sessions', 's1')
B.setCell('sessions', 's1', 'config', '{"modelId":"m2"}')

// They finally sync.
A.merge(B)

A.getRow('sessions', 's1') // → { config: '{"modelId":"m2"}' }
A.hasRow('sessions', 's1') // → true
```

Extended checks, all verified on 8.4.1:

- **Reverse timing**: edit first, `delRow` later → row deletes cleanly on both peers. No ghost.
- **Soft delete**: a `deletedAt` `setCell` racing a config `setCell` merges to a complete row
  carrying both writes — confirms the prevention approach below.
- **Cleanup**: a fresh `delRow` on the ghost (higher HLC on every cell) sticks on both peers after
  merge — confirms the sweep approach below.

## Fixing it

Independent layers; resilience alone stops the crash, a prevention option removes the cause.

### Resilience (treat the symptom)

A malformed **merged** row should never crash the app. Merge output from other peers is adversarial
input, not this device's own boundary write — and that distinction suggests the scope: leniency is
a property of **mergeable** stores, so it can live in `createMergeableDb` rather than weakening
every store. Make entity reads (`all()` / `useAll` / index hooks) skip rows that fail to parse and
`console.warn` them, rather than throwing for the whole table.

- Pros: tiny change; covers every table and read path at once (all funnel through `parseEntity`);
  keeps "fail fast" strict for local writes and non-mergeable stores.
- Cons: in tension with the repo's "fail fast, fail loudly" default — mitigated by warning, not
  swallowing. Leaves ghost rows lingering (invisible, but present).

### Prevention A: soft delete (treat the cause)

The asymmetry is that `delRow` removes the **required/identity** cells while `update` can re-add a
**non-required** one. Model deletion as a cell instead: add a `deletedAt` cell, filter
`deletedAt != null` on read, and never `delRow`. Then "delete" is a per-cell LWW write like any
other, so a concurrent edit can't strip the identity cells — the row stays complete _and_ marked
deleted (verified by repro).

- Pros: removes the root cause; partial/ghost rows can't form; per-cell merge granularity kept.
- Cons: honest scope is large — because of the cascade, `deletedAt` belongs on **sessions, runs,
  steps, and messages**, every query and index read path must filter it, and tombstoned rows
  accumulate unless swept.

### Prevention B: whole-row updates

Make `collection.update()` write the full row (`setRow`) instead of per-cell `setCell`. Every
update then stamps every cell, so delete-vs-update becomes whole-row-vs-whole-row: the later write
wins entirely. The outcome is either a clean delete or a fully resurrected **complete** row — no
partial ghosts, no schema or query changes.

- Pros: small change confined to `collection.ts`; no read-path or schema work.
- Cons: loses per-cell merge granularity — concurrent edits to _different_ fields of the same row
  (title rename vs. config edit) clobber each other instead of both landing; and "edit resurrects a
  deleted session" is a semantic choice being accepted.

### Cleanup (existing ghosts)

Independently of the above, a sweep (e.g. at startup, on mergeable stores) can `delRow` any row
that fails to parse — re-tombstoning every cell at a fresh, higher HLC. Verified to stick after
merge. It only fully converges once every peer holding the ghost has synced (each has its own OPFS
copy), and a concurrent edit to the ghost re-races it. Manual removal used during diagnosis:

```js
window.__tetra.stores.library.raw.store.delRow('sessions', '<ghost-id>')
```

### Suggested path

Resilience plus the cleanup sweep now — small, stops the app-wide crash for every table, and drains
existing ghosts. Defer the prevention choice: soft delete and whole-row updates pull in opposite
directions on merge granularity and deserve their own decision.

## Related code

| Concern                                                | Location                                                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mergeable library store                                | [`apps/web/src/stores/index.ts:90`](../../apps/web/src/stores/index.ts)                                                                             |
| `delete` (delRow) / `update` (setCell) / `parseEntity` | [`packages/tinydb/src/collection.ts`](../../packages/tinydb/src/collection.ts)                                                                      |
| `useAll` / index hooks (crash sites)                   | [`packages/tinydb/src/react.ts:94`](../../packages/tinydb/src/react.ts)                                                                             |
| Sidebar `useSessionIds`                                | [`apps/web/src/sidebar/session-group.tsx:29`](../../apps/web/src/sidebar/session-group.tsx)                                                         |
| Config-only writers                                    | [`run-configs.ts:30`](../../packages/core/src/run-configs.ts), [`run-config-providers.tsx:34`](../../apps/web/src/session/run-config-providers.tsx) |
| Session delete cascade (delRow)                        | [`transcripts.ts:45`](../../packages/core/src/transcripts/transcripts.ts)                                                                           |
| Streaming per-cell writers                             | [`run.ts:257`](../../packages/core/src/runtime/run.ts), [`runs.ts:189`](../../packages/core/src/runtime/runs.ts)                                    |
| Stateless sync relay                                   | [`apps/worker/src/index.ts`](../../apps/worker/src/index.ts)                                                                                        |
| Library OPFS persistence                               | [`apps/web/src/stores/runtime.ts:46`](../../apps/web/src/stores/runtime.ts)                                                                         |
