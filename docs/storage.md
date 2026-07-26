# Storage

How Tetra stores, synchronizes, and deletes data. This describes the current system; design
history lives in git. Code pointers: `apps/web/src/stores/` (persistence, sync, wipe, runtime),
`apps/worker/src/index.ts`, `apps/cli/src/store.ts`.

## Model

**Local-first, honestly.** Each device owns exactly one library, at rest only on that device.
The sync server is a stateless relay: it stores nothing, so "delete all data" is a local gesture
that actually means what it says, and there is no server copy to leak, restore, or quietly
resurrect deleted data from.

**A sync key names a rendezvous channel, not a hosted instance.** Devices holding the same key
converge directly, live, while simultaneously connected to the relay. No async handoff: if the
other device is offline, nothing happens — and that is legible, not spooky. If deleted data ever
reappears, the explanation is always "your other device still has it," never "the server
remembered."

## Web stores

Six TinyBase stores, created eagerly at module load so the React APIs bind to concrete
instances (`stores/index.ts`); persistence and sync are layered on by the async runtime
(`stores/runtime.ts`).

| Store         | What it is                                                | Home                               |
| ------------- | --------------------------------------------------------- | ---------------------------------- |
| `library`     | Your data: mergeable, durable, syncable across devices    | OPFS (`tetra-library.json`)        |
| `catalog`     | Rebuildable cache of the OpenRouter model catalog         | IndexedDB (`tetra:catalog`)        |
| `desk`        | This tab, right now; cleared when you leave               | sessionStorage (`tetra:desk`)      |
| `prefs`       | Durable device-level preferences, including sync consent  | localStorage (`tetra:prefs`)       |
| `credentials` | API keys: device-local secrets, deliberately never synced | localStorage (`tetra:credentials`) |
| `sync`        | Ephemeral connection state written by the SyncController  | unpersisted (in-memory)            |

The `sync` store is deliberately unpersisted: a rehydrated `status: "live"` from a previous
session would be a lie. The `credentials` store is deliberately outside the library: secrets in
a MergeableStore would survive deletion as tombstones and clock history on every converged
device, and "delete means delete" matters most for keys. `@tetra/credentials` holds only the
registry (which credentials exist) and a `CredentialReader` interface; each surface wraps its
own storage in a reader — the web app this store, the CLI process env.

### Persistence lifecycle

`stores/persistence.ts` holds one small class per browser storage medium — OPFS, IndexedDB,
sessionStorage, localStorage — sharing a `start()` / `halt()` shape. Each `start()` is a plain
recipe: create the persister, load once, log, auto-save from then on. Medium particulars stay
visible in each class rather than behind a generic wrapper (OPFS's async file handles; a note
that the IndexedDB persister opens connections per-operation so it never blocks a wipe;
localStorage's native cross-tab auto-load). Tab convergence is owned by synchronizers, not by
persister auto-load — except `prefs` and `credentials`, where localStorage auto-load _is_ the
cross-tab mechanism.

The library store is a MergeableStore (per-cell HLC last-write-wins CRDT) so the local cache,
tab sync, and remote sync all speak one shape. Consequence worth remembering: its persisted JSON
contains tombstones and clock history — deleting rows is not erasure; deleting the file is.

### Tabs

Every tab is a full peer: its own store instances, persisters, and relay socket. Same-origin
tabs converge over a BroadcastChannel synchronizer (`tetra:library`). Multi-tab writes to one
OPFS file are whole-file last-write-wins; actual convergence is the synchronizer's job, so this
is a non-issue in practice, but it is a distributed-ownership design — see "Possible futures"
for the single-owner alternatives.

## Remote sync

**Key = channel.** Keys are client-generated (32 hex chars via `crypto.randomUUID()`), validated
loosely by shape (`[\w-]{16,64}`) at both ends, and never typed by hand — pasting a key is the
pairing gesture, and its entropy is the mixing protection: two libraries can only meet on a
channel through that deliberate act. Joining a live channel CRDT-merges libraries irreversibly;
the UI says so at the gesture.

**The worker is a stateless relay** (`apps/worker/src/index.ts`): a TinyBase
`WsServerDurableObject` with no `createPersister` override — relay-only is TinyBase's default —
routing `/sync/<key>` so each key lazily gets its own isolated Durable Object. An idle channel
holds no data, costs nothing, and effectively does not exist. There are no admin routes and no
registry; there is no server state to administer. One worker, manually deployed
(`bun run deploy`). Honesty note: this is not E2EE — the relay sees plaintext CRDT frames in
transit. "Nothing at rest" is the claim.

**The SyncController is a runtime in the VISION.md sense** (`stores/sync/controller.ts`):
components call its commands (`setEnabled`, `setKey`, `resync`) and read reactive state from the
TinyBase stores it writes — there is no bespoke snapshot or subscription machinery. Consent and
the channel key live in `prefs` (durable; `syncEnabled` and `syncKey` are independent, so "pause
sync but remember my channel" works); connection status lives in the `sync` store. A
generation-guarded reconcile loop reacts to prefs changes — this tab's commands or another
tab's, via localStorage auto-load — and maintains exactly zero or one connection.

**Resync-on-reopen is load-bearing.** TinyBase's ws synchronizer does no connection management
and nothing re-converges on socket reopen, so the connection (`stores/sync/connection.ts`) wraps
`reconnecting-websocket` and forces `load()` then `save()` on every `open`. This is the one
mechanism that makes reconnects correct.

**Config:** the relay URL comes from `VITE_SYNC_WORKER_URL` (env-provided, not user-edited; a
`prefs` override exists for dev). Everything user-facing is runtime state. There is no
build-time disable — the runtime toggle is the only switch, and an unset worker URL disables
sync structurally.

**Dev seeding:** in dev builds only (`import.meta.env.DEV`, so a production build can never
bake secrets into the bundle), boot fills blank values from env vars: each credential from
`VITE_<id>` (e.g. `VITE_OPENROUTER_API_KEY`), and the sync key + consent from `VITE_SYNC_KEY`.
Seed-if-empty: stored values always win, so agents with fresh browser environments get working
keys while UI edits survive reloads.

## Delete all data

A first-class privacy gesture (`stores/wipe.ts`), in the settings dialog's Data tab. The one
unacceptable outcome is a silent partial wipe — it must not claim success it did not achieve.

Sequence: close the sync socket → destroy the tab synchronizer → halt every persister → erase
every OPFS entry → delete every IndexedDB database → clear localStorage (including API keys) →
clear sessionStorage → reload into first-run.

Guarantees:

- **Whole-origin, not named stores** — the gesture cannot rot as stores are added.
- **Forward-only and best-effort**: every step runs even when earlier ones fail; per-entry
  erasure continues past individual failures; IndexedDB deletes are timeboxed (a `blocked`
  delete becomes a recorded failure, not a hang).
- **The reload is unconditional** (`try/finally`) — you always land in a fresh boot, never a
  zombie tab.
- **Failures survive the reload**: stashed in sessionStorage after it is cleared, consumed by
  the fresh boot, and reported in a persistent toast naming the failed steps. Silence means the
  wipe was complete.
- **The sync key is cleared** — the resurrection guard. A wiped device does not rejoin its old
  channel and pull everything back from a live sibling; rejoining is a fresh deliberate paste.
- **Other tabs are told** (a `tetra:wipe` broadcast) to halt persistence and reload, so their
  in-memory stores cannot rewrite the deleted files.

## Observability

Every important event logs with a greppable `[stores:*]` prefix: persister load/halt (with
stats), tab sync start, runtime ready, sync commands, reconcile decisions (including the
resolved worker URL), socket transitions, resync stats, and every wipe step. Deliberately
verbose while the system is young; thin once confidence is earned.

## CLI

Purely local: one SQLite database (`tetra.db`, `DATABASE_PATH`-overridable), one JSON table per
store (`catalog`, `cli`, `library`), load at startup, save on close. The library store stays
mergeable so its shape matches the web app's synced store, but the CLI currently has no sync —
removed deliberately so its story doesn't shape the user-facing design. Credentials are read
straight from process env (`OPENROUTER_API_KEY`) — no persister, no settings UI.

## Accepted trade-offs

- **No implicit backup, no async handoff.** Durability is the user's: a dead device's data is
  gone unless another device had converged. The explicit export gesture is the intended answer
  (deferred below).
- **Joining a channel is an irreversible merge.** Guarded by key entropy and UI copy, not by
  store isolation — per-key local stores were considered and deliberately rejected (end users
  have one library; a key change that switches to an empty store reads as data loss).
- **Not E2EE.** The relay sees frames in transit.

## Possible futures

Noted, not planned:

- **Presence.** Live-only sync is most satisfying when you can see "2 devices connected," and
  presence answers "why isn't my phone syncing." Only the relay DO knows (`getClientIds`); a
  thin worker endpoint would be the first justified admin surface.
- **Export / import.** With no server backup, an explicit user-owned export is both the
  durability story and the deliberate-merge gesture. Sibling of delete-all in the Data tab.
- **Durable channels as opt-in.** Hosting is literally one `createPersister` override behind a
  flag, but "we never store your data" beats "we store it only if…" — resist until a real need.
- **CLI sync, redesigned.** Likely target: converge with a running web app on the same machine,
  not with a cloud copy.
- **Single-owner tab architecture.** A SharedWorker would make the device one sync client and
  one storage writer (deleting the wipe-broadcast and multi-tab-write classes) and would let
  runs outlive their initiating tab — but tabs still need local mirror stores (synchronous
  reads), localStorage is unavailable in workers (prefs/credentials would rehome), WebKit/Tauri
  support needs a spike, and worker consoles hide our logs. Web Locks leader election buys most
  of the single-writer/single-socket wins with none of the platform risk. Either is a bounded
  change now that ownership is gathered in `stores/runtime.ts`.
- **Synced credentials.** Channel-key entropy makes it thinkable, but rows in the library
  MergeableStore would leave deleted/rotated keys lingering as tombstones in every converged
  device's OPFS file. If ever done: a separate small mergeable store on the same channel (e.g.
  `/sync/<key>/credentials`), independently toggleable, keeping secrets out of the library
  artifact. Dev env seeding removed most of the motivation.
- **E2EE.** Relay-only makes it conceivable; TinyBase's protocol doesn't make it pluggable today.
- **Deployment automation.** Manual `wrangler deploy` until it annoys us.
