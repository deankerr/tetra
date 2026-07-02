# Sync platform: keyed instances, runtime config, and the persistence exit

**Status:** problem-space map with settled directions and marked open questions. Nothing
implemented. Each area is sized to be an individual R&D session; see the session breakdown at the
end.
**Scope:** the worker (multi-instance sync), the client sync lifecycle, config layering across
web/CLI/Tauri, store identity and mixing, the browser persistence exit from localStorage, and
deployment.
**Related:** `apps/web/README.md` (the parked "runtime sync config" item), `apps/worker/src/index.ts`,
`apps/web/src/store.ts`, `apps/cli/src/store.ts`, `VISION.md` (state architecture).

## Why

Today there is exactly one sync instance in the world. The worker hardcodes a single Durable
Object name (`sync`), the clients hardcode the `/sync` path, and both the URL and the enabled
flag are build-time `VITE_` / `SYNC_` env vars. Consequences:

- One shared remote store, open to anyone who reads our GitHub repo closely (nobody does, but
  it's not a real design).
- Sync config is baked at build time — a `tauri build` freezes whatever `.env.local` held, and
  web/desktop deliberately share one env file to stay pointed at the same target.
- Every new dev surface (worktrees, remote agents, agent-driven browser contexts) juggles secret
  env variants. Agents demoing the app in their own browser must hand-set localStorage values
  before anything works.
- No way to have independent instances for experiments, demos, or per-feature test data.

We want many independent instances **without accounts or auth**. A random string key _is_ the
instance id: possession of the key = access. Explicitly not secure — dev data, no users, and we
are not ready to commit to an auth model.

## Design principles

- **Keys, not accounts.** A sync key names an instance and grants access. Keys are user-supplied
  or generated; the server neither issues nor validates them beyond shape.
- **Runtime state over build-time env.** Sync config is user-authored runtime state (like
  credentials). Env vars remain fully capable of configuring everything — they become _seeds_
  for first-run defaults, not the source of truth. Precedence: runtime user state → env seed →
  defaults. This keeps agent/demo/CI flows env-drivable (including "sync hard-disabled" builds).
- **Least written code, first-party parts.** Prefer TinyBase's shipped persisters/synchronizers
  and the officially recommended `reconnecting-websocket`. Bundle size is a non-concern right now.
- **Persistence stays in the browser layer.** Tauri was chosen for packaging a Vite app, nothing
  more. No Rust storage adapters; the desktop app must remain "the web app in a window."
- **Accidental mixing must be structurally impossible.** Two instances' histories, once CRDT-
  merged, cannot be separated. Merging two stores is a deliberate future gesture, never a side
  effect of changing a key.
- **Prototype mode applies.** No back-compat with the `/sync` singleton; break it in one move.

## Evidence

Research findings this design leans on, with sources (TinyBase 8.4.1 dist; docs mirror in
`reference/tinybase-docs`, gitignored).

1. **The server is already multi-instance.** TinyBase's DO fetch derives the instance from the
   URL path: `PATH_REGEX = /\/([^?]*)/` → `idFromName(pathId)`
   (`synchronizers/synchronizer-ws-server-durable-object/index.js:738,850-855`). Distinct paths
   are distinct, lazily created, fully isolated DOs. Our singleton is just two hardcoded strings
   (`apps/worker/src/index.ts` `LIBRARY_DURABLE_OBJECT_NAME`, `apps/web/src/store.ts:141`).
2. **Cloudflare cannot enumerate named DOs.** The REST listing API returns opaque hex ids, not
   names. Instance visibility must be self-tracked. TinyBase provides exactly the hooks:
   `onPathId(pathId, addedOrRemoved)` / `onClientId(pathId, clientId, addedOrRemoved)` fire on
   every connect/disconnect (`...-durable-object/index.js:846-847`).
3. **`createWsSynchronizer` does zero connection management.** It binds `send` to the socket you
   pass and resolves once the socket opens _or errors_ (resolving the synchronizer anyway,
   reporting via `onIgnoredError`) — so booting offline with a reconnecting socket yields a
   working-but-quiet synchronizer. Initial convergence is driven entirely by `startSync()`
   (`load()` broadcasts a `GetContentHashes` request; `save()` announces our hashes). **Nothing
   re-runs either on socket reopen.** `destroy()` closes the socket; `stopSync()` does not.
   (`synchronizers/synchronizer-ws-client/index.js`.)
4. **Docs officially recommend `pladaria/reconnecting-websocket`** and state its API is
   compatible (`createwssynchronizer` article). It re-emits `open`, buffers sends while closed.
   It solves the _socket_; it does not solve the _resync_ (see 3).
5. **The DO's join "hello" is of unclear value.** On accept, the server sends the new client a
   `GetContentHashes` from `'S'` with requestId `null` (`...-durable-object/index.js:791`). The
   client replies with a `Response` keyed `null`, which by our reading the server's synchronizer
   drops (no pending request keyed `null`). The Node `createWsServer` sends no hello at all.
   Unresolved from dist reading — spike S1.
6. **Persister × MergeableStore matrix** (`api/persisters` article): localStorage /
   sessionStorage / **OPFS** / file support MergeableStore; **IndexedDB does not** (hence the
   library's current localStorage home — it was never an accident); SQLite-flavored persisters
   support it in `DpcJson` mode only. The CLI's `createSqliteBunPersister` + `mode: 'json'` is
   already in the supported column.
7. **OPFS persister is ~25 lines, async, main-thread** (`persisters/persister-browser/index.js:
498-523`): whole-file JSON via `handle.getFile()` / `createWritable()`. No worker, no sync
   access handles, no locks. Its change-listener uses `FileSystemObserver` (Chrome-only, absent
   in WebKit) — irrelevant to our load-once + auto-save pattern, where tab convergence comes from
   the BroadcastChannel synchronizer. Caller supplies the file handle, so per-key filenames are
   natural. WebKit gained `createWritable` in late 2024 (Safari 18.2) — spike S2 verifies inside
   Tauri.
8. **The CLI already encodes a complete short-lived sync protocol** (`apps/cli/src/store.ts`):
   connect with timeout → `startSync` → live for command duration → close = `save()` announce +
   1.5s grace + `destroy()`, every step timeout-wrapped and best-effort. This flush dance is
   shared protocol knowledge, currently trapped in one app.
9. **MergeableStore has no identity concept at our level.** `createMergeableStore(uniqueId?)` is
   an HLC tiebreaker documented as testing-only. Store identity is ours to design. The CRDT merge
   is a per-cell HLC last-write-wins union — irreversible once histories touch.

---

## Area A — Worker: keyed instances, Hono shell, instance registry

**Direction (settled):**

- WebSocket route becomes `/sync/:key`; the worker owns the key → DO mapping (we already bypass
  `getWsServerDurableObjectFetch` for reset, so nothing is lost by routing ourselves). Forward
  the request untouched — the DO tags websockets with the full path via its own `getPathId`, so
  path stability matters.
- Adopt **Hono** as the worker shell. First real justification is the registry/admin surface,
  not taste: `GET /api/instances` (list known keys + metadata), `DELETE /api/instances/:key`
  (purge → `storage.deleteAll()`; an idle, empty DO costs nothing and effectively ceases to
  exist).
- **Instance registry**: a singleton directory (its own DO, or KV) recording
  `key → { createdAt, lastSeen, clientCount }`, fed from the `onPathId`/`onClientId` overrides
  (evidence 2). This is the answer to "how do we view and clean up instances" — Cloudflare
  won't tell us; we must write it down ourselves.
- Per-key reset replaces the singleton `/sync/reset`. Day-to-day, **rotating the key is the
  reset gesture** (lazy creation makes fresh instances free); the purge route exists for
  hygiene.
- Key shape: validated loosely (length/charset) at the route, nothing more. Treat as
  user-authored input at the execution boundary (VISION.md).

**Open:**

- Registry storage: directory DO vs KV. (DO keeps everything in one wrangler config and gives
  transactional updates; KV is simpler reads. Lean: directory DO — we already have the DO
  toolchain and types.)
- Does the registry track _sizes_? Would require the library DO to self-report (e.g. on
  `onPathId` teardown). Defer until we miss it.
- Admin route auth: none for now (consistent with the threat model), but shape routes so a
  bearer token can be added in one place later.

## Area B — `@tetra/sync`: the client lifecycle package

**Direction (settled):**

- New package owning everything between "config resolved" and "store converging":
  - URL building (`workerUrl` + key → `wss://…/sync/<key>`), protocol normalization (the
    http→ws dance currently duplicated in web and CLI).
  - Socket construction via `reconnecting-websocket` (evidence 4).
  - **Resync-on-reopen**: on every socket re-`open`, call `synchronizer.load()` then
    `synchronizer.save()` — both public persister methods — forcing bidirectional convergence
    deterministically. This makes correctness independent of the DO hello question (evidence
    3, 5).
  - Lifecycle handle: `{ status, resync(), flush(), close() }`. Key switch = `close()` + new
    handle (destroy closes the socket; there is no in-place re-dial).
  - The CLI's timeout-wrapped connect and flush dance (evidence 8) as first-class modes: the
    web consumer holds the handle open for the page lifetime; the CLI consumer does
    connect → converge → flush → close.
- Status is exposed as plain callbacks/values on the handle; _where_ it lands (a store value for
  reactive UI, stdout for CLI) is the consumer's business. The package has no TinyBase-React,
  no React, no env access.

**Open:**

- Exact status vocabulary (`idle | connecting | live | reconnecting | closed`?) — decide while
  building against the web status UI.
- Whether the package also owns the BroadcastChannel tab synchronizer (it's adjacent lifecycle
  code, but it has no config and never changes — lean: leave it in the web app).
- Name. `@tetra/sync` is the placeholder.

## Area C — Config layering

**Direction (settled):**

- Resolved sync config is `{ enabled, workerUrl, key }`. Precedence: **runtime user state → env
  seed → defaults**.
- `workerUrl` is _provided_ (default baked per-surface, env-overridable), **not user-editable
  UI**. The key is the primary user-facing knob.
- Web: runtime home is credential-style localStorage (synchronous read at boot, durable,
  per-origin — the same profile as `@tetra/credentials`, and sync config is conceptually
  credential-adjacent). Not the `web` store (sessionStorage: per-tab, ephemeral).
- Env vars remain able to express every configuration — `VITE_SYNC_ENABLED=false` builds,
  agent contexts pre-pointed at a shared key, demo instances — by _seeding_ the runtime state on
  first run. A seeded value that the user later edits stays edited; changing the env after first
  run does not silently override user state.
- CLI has no UI: env/flags _are_ its runtime layer (`SYNC_WORKER_URL`, new `SYNC_KEY`,
  `--sync-key`?). The resolution function in `@tetra/sync` must treat this as a first-class
  input path, not a web fallback.

**Open:**

- Seed-once semantics vs env-wins-when-set: seed-once is friendlier to users, env-wins is
  friendlier to agents relaunching browser contexts. May need a marker distinguishing "user
  edited this" from "seeded". Decide in the web R&D session with real agent workflows at hand.
- Does `enabled` even survive as a flag, or is it derived (`enabled = key !== undefined`)?
  Lean: derive it — "Don't Sync State. Derive It!" — with env able to force-disable.

## Area D — Store identity and isolation (the mixing problem)

The doorway this whole design opens: changing your key can point your synchronizer at a store
with a _different history_. A CRDT merge of two histories is an irreversible union (evidence 9).

**Direction (settled):**

- **Bind local persistence identity to the sync key.** The library persists per key —
  `library-<key>` (unkeyed `library` for local-only). Changing key does not repoint the
  synchronizer at existing data; it _switches which local store loads_. Joining a key you've
  never used starts from that instance's state; leaving it leaves it intact; coming back
  resumes it. Mixing then requires a deliberate export/import gesture that does not exist yet
  (and may never).
- Stamp an `instanceId` value into the store at creation. Cheap; enables sanity checks ("this
  cache belongs to key X"), future UI ("viewing instance …"), and a guard if we ever build the
  deliberate-merge gesture.

**Open:**

- What happens to the _current_ unkeyed data when the user first sets a key: adopt (rename the
  local store to the key — the natural upgrade for our own dev data) vs fresh-start (strict
  isolation)? Adopt-once for the migration, strict after, is the likely answer; confirm during
  the web session.
- Retention/pruning of abandoned per-key local stores. Defer — OPFS files are enumerable
  (`getDirectory()` listing), so a cleanup surface is possible later.
- Whether `instanceId` should also live in the worker registry for cross-checking. Cheap, do it
  when the registry exists.

## Area E — Persistence exit: localStorage → OPFS

**Direction (settled):**

- The library store's browser home becomes **OPFS** via the first-party `createOpfsPersister`
  (evidence 6, 7): MergeableStore-compatible, async main-thread API, no worker/wasm/Rust, and
  per-key filenames drop out of Area D for free. Catalog stays in IndexedDB (plain store);
  `web` store stays in sessionStorage.
- Multi-tab risk profile is unchanged from localStorage: whole-value last-write-wins on the
  file, with actual convergence owned by the BroadcastChannel synchronizer, exactly as today.
- If OPFS-in-WebKit disappoints (spike S2), the fallback ladder is: stay on localStorage
  (per-key names still work: `tetra:library:<key>`) → SQLite-WASM (`DpcJson`). The persister
  swap is a handful of lines either way — this is the flexibility we're preserving.

**Open / gated:**

- **S2 (Tauri WebKit)**: does `createWritable` exist and round-trip inside the packaged app?
- **S3 (multi-tab)**: two tabs auto-saving to one OPFS file — confirm no errors/corruption
  (expected fine; verify once).
- localStorage → OPFS data migration: probably "none" (prototype mode; dev data is wiped and
  regenerated), but decide explicitly in the session.

## Area F — React binding strategy

Per-key local stores collide with the module-load store binding: `apps/web/src/store.ts` creates
store instances eagerly and binds the React APIs to those concrete instances
(`store.ts:42-46,181-183`). The key is only known after config resolution.

**Direction (settled, first cut):**

- **Reload-on-key-switch.** Config resolution happens before store creation at boot (it's
  synchronous localStorage — no ordering problem); changing the key writes config and calls
  `location.reload()`. Brutal, correct, ~3 lines, and prototype-appropriate.

**Open (parked, revisit only if reload chafes):**

- TinyBase's `Provider`/context exists precisely to resolve stores by id so instances can swap
  under a stable React API — we dropped it deliberately; per-key stores are the one pressure
  that might argue it (or a tinydb equivalent) back in. Treat as a known trade-off, not a
  to-do. If tinydb ever grows store-swapping, design it there, not in the app.

## Area G — CLI parity

**Direction (settled):**

- CLI adopts `@tetra/sync` for connect/flush (deleting most of `apps/cli/src/store.ts:107-200`)
  and the config resolution from Area C (env/flags layer).
- Per-key locality: the SQLite database (or the library table name) keys by sync key, mirroring
  Area D. Lean: per-key table name in one `tetra.db` (`library_<key>`), since `DATABASE_PATH`
  is already an env concern.
- `tetra sync reset` becomes `tetra sync` subcommands over the Area A admin routes: `list`,
  `purge <key>` — the CLI is the natural first consumer of the registry API.

**Open:**

- Whether CLI key config is env-only or also persisted in the `cli` store (it has one). Lean:
  env-only until it hurts; the CLI is scriptable by nature.

## Area H — Deployment

**Direction (settled):**

- **One worker, manually deployed**, for now. Keys partition state on a single deployment, so
  dev/prod worker splits and localhost workers are no longer load-bearing — a dev machine, a
  remote agent, and the Tauri app can all point at the same deployed worker with different
  keys. (Tauri note: capabilities gate Rust commands, not WebView sockets, and CSP is off — a
  localhost `ws://` likely works anyway, but with one deployed worker we stop caring.)
- CI (auto-deploy on merge, Vercel-coupled) is parked until manual deploys annoy us.

---

## Spikes (verification gates)

| #   | Question                                                                                                   | Method                                                                                           | Gates                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| S1  | Does a reconnecting client converge without our forced resync? (Resolves the DO hello puzzle, evidence 5.) | Local worker + client; mutate server-side while client disconnected; reconnect via RWS; observe. | Nothing — the wrapper's resync-on-reopen makes us correct either way. Informative only. |
| S2  | OPFS `createWritable` inside packaged Tauri WebKit?                                                        | One-line probe + persister round-trip in `tauri dev` and a release build.                        | Area E persister choice.                                                                |
| S3  | Two tabs auto-saving one OPFS file — clean?                                                                | Two tabs, rapid writes, inspect file + console.                                                  | Area E (expected pass).                                                                 |

Housekeeping noticed en route: the workspace resolves four TinyBase versions (8.0.2 → 8.4.1 in
the Bun store). Align on one before touching sync — client↔DO protocol skew is exactly where
this would bite.

## Session breakdown

Each is one R&D session; order respects dependencies but A/E/C are mutually independent starts.

1. **Worker** (Area A): Hono shell, `/sync/:key`, registry DO, admin routes. Independently
   shippable; existing clients break (prototype mode) or temporarily pin `key=sync`.
2. **Spikes S2/S3** (Area E gates): an hour each, no design risk, unblocks the persistence
   session.
3. **`@tetra/sync` + CLI adoption** (Areas B, G): extract the CLI's protocol knowledge, add
   RWS + resync-on-reopen (S1 falls out of building this), config resolution (Area C shape).
4. **Web runtime config + per-key stores** (Areas C, D, E, F): credential-style config store,
   env seeding, OPFS per-key persistence, instanceId stamp, reload-on-switch, sync status +
   key UI.
5. **TinyBase version alignment** (chore): fold into whichever session touches `package.json`
   first.

Deferred beyond all sessions: deliberate store merge/import gesture, registry size reporting,
admin auth token, CI deploys, localStorage cleanup UI.

## Progress log

### 2026-07-02 — OPFS library persister implemented

**Status:** confirmed and implemented for the web client.

- Replaced the web library store's `localStorage` persister with TinyBase's first-party
  `createOpfsPersister` in `apps/web/src/store.ts`.
- The OPFS file is currently the unkeyed local-only library file, `tetra-library.json`. Per-key
  OPFS file naming remains part of the later runtime sync-key work in Areas C/D/F.
- Startup still uses the deliberate one-way persistence lifecycle: `load()` once, then
  `startAutoSave()`. We are not using `startAutoLoad()` or the OPFS `FileSystemObserver` path,
  so tab convergence remains owned by the BroadcastChannel synchronizer.
- Browser verification confirmed that creating library data writes to OPFS, survives reload, and
  does not populate the old `localStorage["tetra:library"]` key.
- Multi-tab verification confirmed that a write in one tab appears in another tab without reload
  via BroadcastChannel, while the OPFS file is also updated.
- Tauri verification confirmed the OPFS persister path works in the desktop WebView as well.
- Added lightweight first-load observability for each browser persister. The library persister log
  includes `storage: "opfs"`, `fileName`, and TinyBase load/save stats after the initial load
  succeeds.
