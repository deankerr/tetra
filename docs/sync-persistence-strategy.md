# Sync And Persistence Strategy

Status: working notes, pre-decision.

This document frames the sync and persistence problem space before a formal decision process. It is not an ADR, implementation plan, or debugging report. The goal is to make the system pressures explicit enough that later decisions can be smaller and sharper.

## Context

Tetra is a local-first app with two durable surfaces: the web app and the CLI. That dual surface is not temporary. The sync and persistence strategy needs to support both without letting each surface invent subtly different semantics for the same app state.

The current sync backend is a single TinyBase `MergeableStore` hosted by a Cloudflare Durable Object at `/tetra`. The web app can run in local IndexedDB mode or sync mode. The CLI can run in local SQLite mode or sync mode, and sync mode also keeps a local SQLite cache.

TinyBase is doing two jobs at once:

- It is the in-memory reactive app store.
- It is the serialized persistence and sync shape.

That coupling is useful while prototyping, but it means every table, value, and row must be classified carefully. A row may be visible in React, durable on disk, synced across clients, and replayed through a CRDT merge. Those are different responsibilities.

## Current Shape

The Tetra store schema currently includes durable tables for sessions, messages, session run configs, runs, steps, prompts, model data, favorites, and draft-session state. It also includes values such as `cliActiveSessionId`, `defaultRunConfig`, and `catalogLastRefreshed`.

The web app has a separate `webUi` TinyBase store for tab-local state such as JSON sheet state, settings dialog state, and session thread anchors. That store is intentionally not persisted or synced.

The CLI stores `cliActiveSessionId` in the main Tetra store. In sync mode, that makes the CLI's selected session part of the synced app store rather than client-local state.

The web sync provider creates a `MergeableStore`, starts a WebSocket synchronizer, and does not add a local persister in sync mode. The CLI sync path creates a `MergeableStore`, loads a local SQLite cache, starts WebSocket sync, and saves the local cache on close.

The Worker owns one `MergeableStore` for all synced Tetra data. It persists through TinyBase's Durable Object SQL storage persister. The reset endpoint deletes all tables and values and saves the cleared store.

## Run Ownership

A `Run` object is the best indicator that a run is actually alive. It exists only in the client process that started model execution. The synced `runs` row is a durable record of the action, but it is not itself the running computation.

Tetra currently does not recover interrupted runs. The previous global recovery hook treated persisted run state as if the current process owned every interrupted run, failing every non-terminal (`active`) row it could see.

That behavior was plausible for a single local process after a crash. It is wrong for a shared sync store. In sync mode, another client may still own the live `Run` object. A recovery sweep from the web app or CLI can finalize a run it did not start.

Removing the hook avoids cross-client damage, but it also means interrupted synced runs can remain visibly stuck until an ownership-safe reconciliation path exists.

The core issue is not just recovery code. It is that run liveness is currently encoded as ordinary synced state without an ownership or lease model.

## Streaming Message Content

Streaming output now persists directly to the target `messages.parts` cell. The message row carries the current generated content, while the corresponding `runs.status` says whether that content is still provisional or terminal.

This removes a separate cleanup axis, but it does not remove the ownership problem. The target message row now has two roles during a run:

- It protects local work in progress from being lost during a crash.
- It exposes provisional output to any synced client reading the same store.

Those roles imply different interpretation rules. A local owner can keep updating the message while the `Run` object is alive. A remote observer can render the latest parts, but it should not assume that seeing provisional content gives it authority to finalize the run.

If provisional output remains synced, run rows need enough lifecycle metadata for other clients to distinguish "live elsewhere" from "abandoned". If provisional output becomes client-local, cross-client live viewing becomes less important but recovery becomes simpler.

## Client Identity

The current synced store does not have a coherent client identity concept. TinyBase has internal merge client ids, but those are implementation metadata, not app-level responsibility ids.

A cohesive strategy probably needs a client id that is persisted locally but not itself synced as mutable client state. Synced rows can refer to that id when the row needs an owner, but the client's own identity should belong to the client.

Client identity would clarify several boundaries:

- Which client owns an in-progress run.
- Which client should recover its own abandoned local work.
- Which state is selected or focused only in this client.
- Which sync writes came from a known app client when debugging.

This does not require a user/account model. A prototype-safe client id can be a locally generated stable id stored beside the web or CLI persistence layer.

## Heartbeats And Leases

A heartbeat or lease is the smallest ownership mechanism that might contain run complexity without making the whole store process-aware.

For runs, the responsible client would write an owner id and periodic heartbeat or lease expiry while the `Run` object is alive. Other clients would treat the run as live until the lease expires. After expiry, cleanup can be explicit and bounded.

The important distinction is that the `Run` object remains the source of truth for the responsible client. The heartbeat is not a second runtime. It is only a synced signal that lets other clients avoid premature recovery and eventually surface or clean up abandoned work.

Open design questions:

- Should stale cleanup happen automatically, manually, or only when opening the affected session?
- Should cleanup mark the run `error`, `cancelled`, or a distinct stale/interrupted status?
- Should cleanup keep partial message content, clear it, or mark it as interrupted with an error record?
- What timeout is appropriate for slow model streams, long tool loops, and sleeping laptops?
- Is one heartbeat field on `runs` enough, or should ownership live in a separate table?

## New Session State

The current new-session page creates a real session row and hides it from history through `draftSessions/current`. Materializing the draft deletes the pointer and routes to the session.

This works as a local UI trick, but its sync semantics are underdefined. A draft session is currently an ordinary durable session plus a synced pointer unless the surrounding store is local-only.

That raises several questions:

- Is a draft session local to one client or shared across all synced clients?
- Should a draft exist in the synced store before the first message is sent?
- Should new-session config edits sync before the session exists in history?
- What happens when one client materializes a draft while another client still has `/` open?
- Should each client have its own draft, keyed by client id?

A simpler default may be to keep drafts client-local and only create a durable synced session at materialization. That would make "new session" a local workflow until the user creates durable transcript content. If draft config needs persistence, it can live in client-local persisted state rather than the shared store.

## Local, Synced, And Observed State

The strategy should classify state before choosing mechanisms.

Synced app state is durable state that should converge across web and CLI clients. Sessions, messages, run records, steps, prompts, and session run configs are likely in this category. If provisional message snapshots stay synced, readers must interpret them together with run status.

Client-local persisted state is durable for one client but should not sync. Candidate examples include client id, selected session, draft composer state, draft session config, local cache metadata, and recovery bookkeeping for work the client owns.

Tab-local runtime state is not durable and should not sync. Current web sheet state and thread anchors already follow this shape through the separate `webUi` store.

Hot runtime state is live process state first and persisted state second. The `Run` object belongs here. Synced run rows and provisional message snapshots should be observations or leases, not replacements for the live object.

Observability data explains what happened after the fact. It should not be jammed into the main Tetra store just because the store is convenient.

## Web And CLI Parity

The web and CLI paths currently create raw stores, bind typed APIs, start persisters, and start synchronizers in different places.

That makes behavior drift likely:

- CLI sync has a local cache; web sync does not.
- CLI selected session is a main-store value; web selection and thread anchors are local UI state.

The two surfaces should continue to differ at the interaction layer. They should not differ accidentally at the persistence lifecycle layer.

A shared persistence/sync module should own the common sequence:

- Create the raw store and indexes.
- Attach local persistence when the selected mode requires it.
- Attach sync when the selected mode requires it.
- Bind typed APIs and core modules at the correct readiness point.
- Run ownership-safe recovery or stale cleanup only after the ownership contract exists.
- Expose inspection/reset hooks consistently.

This shared module does not need to be a large abstraction. It needs to remove duplicated lifecycle decisions.

## Store Topology

The main topology question is whether synced state should stay in one Durable Object-backed store or move toward a session index plus per-session stores. That should be decided after state classification.

A single synced store is simplest while the app is personal and small. It makes sidebar state and session content converge together. It also means every client syncs every message, reasoning trace, step, provisional snapshot, and tombstone.

Per-session stores reduce blast radius and wake cost, but they require a separate session index. They also force a clearer materialization story for new sessions, because creating a session means creating or addressing a session-specific sync target.

The formal decision should avoid choosing topology just to compensate for unclear local-vs-synced semantics. First decide what belongs in shared durable state. Then decide whether that shared state should be one store or several.

## MergeableStore Forensics

Raw TinyBase `MergeableStore` content can reveal tombstones, table stamps, cell HLCs, and hashes. It does not retain old cell values after deletion. A tombstoned message row can prove something was deleted, but it cannot recover the old message parts.

That means the main sync store is not an observability system. It can support limited diagnosis of current state and merge residue, but it cannot explain many classes of corruption after the fact.

The recent corrupted-session investigation should be treated as a signal, not as the source of the strategy. The durable lesson is that our current model makes it too easy to confuse synced app state with process ownership and too hard to explain what happened later.

## Observability Boundary

Observability is adjacent to this strategy, not part of the core sync decision.

The sync/persistence strategy should include enough operational metadata for correct behavior: owner ids, heartbeats, timestamps, terminal statuses, and maybe explicit stale cleanup records.

It should not turn the Tetra store into a forensic log. Deep traces, provider request/response records, sync events, client lifecycle events, and corruption investigation data should live in a separate observability path.

Keeping observability separate matters because the main store is user-facing app state. Debug traces need different retention, volume, privacy, and reset rules.

## Candidate Strategy Shape

The following shape is not yet a decision. It is a starting point for the formal process.

Classify every table and value as one of:

- synced app state,
- client-local persisted state,
- tab-local runtime state,
- hot runtime state,
- observability data.

Introduce a locally persisted app client id for web and CLI. Let synced rows refer to it only when ownership or provenance matters.

Add ownership-safe reconciliation:

- The responsible client can finalize or recover runs it owns.
- Other clients can display live, stale, or abandoned state without immediately mutating it.
- Stale cleanup follows an explicit timeout or user action.

Keep new-session drafts client-local until materialization, unless a later collaborative requirement says drafts should sync.

Unify web and CLI persistence lifecycle code around shared store-mode setup rather than duplicating bootstrap behavior.

Treat observability as a separate follow-up decision after the sync/persistence state model is clearer.

## Questions For The Decision Process

Which rows must converge across web and CLI?

Which rows are allowed to be different per client?

Should in-progress run state and provisional message snapshots be synced for live viewing, or only terminal run records and terminal message content?

If in-progress runs sync, what is the owner/heartbeat/stale contract?

What should another client be allowed to do when it sees a stale run it does not own?

If provisional message snapshots sync, how should readers, exports, and recovery paths distinguish them from terminal assistant content?

Should draft sessions exist in the synced store before first durable message content?

Where should selected session, draft composer state, and CLI active session live?

Should web sync mode have a local cache analogous to the CLI sync cache?

Should the single Durable Object store remain for now, or should a session index plus per-session stores be part of the same decision?

What minimum observability is needed to debug sync incidents without coupling traces to app state?

## Near-Term Documentation Follow-Ups

Turn this document into a structured decision prompt once the candidate strategies are concrete enough to compare.

Create or update a current architecture note after the formal decision if the chosen strategy needs a durable implementation reference.

Create an ADR only for the durable hard-to-reverse choice, such as state classification boundaries, store topology, or run ownership semantics.

## Stepping Stones

Two directions converged out of the discussion above as distinct, independently actionable stepping stones. They do not resolve the whole story, but they are worth doing before any ADR. The first (run status) has since been implemented; the second (multi-store) is still an agreed direction, not a formal decision.

### Run Status As A Non-Authoritative Claim

Status: implemented.

True multiplayer is not a goal. We do not need run ownership, leases, heartbeats, or a synced client identity to make runs safe.

The synced `runs` row stays. We explicitly accept that an `active` row may never reach a terminal status. A stale `active` row is a benign claim, not corruption.

The run lifecycle was also simplified while making this change. The prior `preparing` and `streaming` statuses carried no distinction any consumer used, so they collapsed into a single non-terminal `active` status. A run is therefore `active` until it reaches one of the terminal statuses (`completed`, `error`, `cancelled`). With one non-terminal status, "is this a live claim" is just `status === 'active'`, so no terminal/non-terminal partition helper is needed.

The real defect was never the stored state, it is how we consume it. Two read sites used to treat the non-terminal `runs.status` as ground truth for liveness:

- `composer.tsx`, where the active-status check drove the input lock and stop control.
- `session/message/data.ts`, where the non-terminal status derived the per-message running flag (and through it, action availability and the streaming affordance).

These produced the "broken" state, where the indicated running state was not actually true.

The posture now in place:

- The only authority on whether a run is live is the client holding the live `Run` object. `wait-run.ts` already modelled this correctly by awaiting `run.done` rather than reading a row, and `Runs` keeps the live set in `active` (`getBySession`, `getByTargetMessage`).
- Liveness-derived UI gates the row claim with the live `Run`: a read site treats a run as live only when the row is `active` and a live `Run` backs it in this client. The terminal-status short-circuit keeps this reactive and race-free.
- The owning client uses its own live `Run` objects for liveness-dependent behavior, including preventing a second run on the same session if it chooses to.
- Any other client, and the same client after a restart, treats an `active` row as a claim that something was running. It may render a soft in-progress affordance, but must not build correctness on it: no permanent composer lock, no hidden actions, no recovery sweep. The message-header badge only spins and reads "active" when a live `Run` backs the row; otherwise it shows a static "inactive" badge.
- Aggregations over status (counts of active runs, global indicators) inherit this staleness and must be framed as "claimed active".

This intentionally supersedes the "Heartbeats And Leases" mechanism and most of the "Client Identity" motivation for the run case. A locally persisted client id may still be introduced later for other reasons, but it is not required to make runs safe.

We deliberately left undefined space: a stale `active` row is inert rather than cleaned up, there is no interrupted-status vocabulary, and cross-client live viewing has no shimmer or lock. If a client interacts with a run it does not own during an `active` window, we accept whatever the TinyBase merge produces for now.

### Multi-Store Backbone

The remaining issues (drafts, `cliActiveSessionId`, `webUi`, provisional versus durable content, observability) all point at the same structural answer: many stores. We know we need them, so we should organize the app for many stores now rather than treating a single store as the default.

The unifying idea is that the persistence class is the store boundary. The categories in "Local, Synced, And Observed State" are not per-row annotations, they are store identities. A store is the natural unit of durability policy, sync policy, persister, and lifecycle. "Classify every table" then becomes "assign every entity to a store", and the store carries the policy.

The current `webUi` store is the accidental first instance of this pattern, bolted on through `storesById`. The backbone makes it a deliberate, first-class citizen rather than a one-off.

Indicative store map under this lens:

- A synced durable store: sessions, messages, `sessionRunConfigs`, runs, steps, prompts, model favorites.
- A regenerable catalog store: `languageModels` and `catalogLastRefreshed`, separable because it is a refetchable cache that otherwise bloats every client's sync.
- A client-local persisted store: client id when needed, `cliActiveSessionId`, draft sessions, possibly `defaultRunConfig`.
- A tab-local store: today's `webUi`.
- Observability: not a TinyBase store at all, a separate path.

The no-migrations policy makes relocating an entity between stores cheap, but only for standalone entities. TinyBase indexes and relationships are within-store only. The current index definitions (`messagesBySession`, `runsBySessionNewestFirst`, `runsByTargetMessageNewestFirst`, `stepsByRun`, `stepsByMessage`, `stepsBySession`) weld sessions, messages, runs, steps, and session run configs into a single store that moves as a unit or not at all. That welded cluster is also why per-session stores are genuinely expensive: it means giving up global cross-session indexes and building a session-index store to replace them, which is the one topology choice that is not cheap to reverse.

The free-floating, index-free entities (prompts, model favorites, `languageModels`, draft sessions, `cliActiveSessionId`, `defaultRunConfig`) can be placed by best guess now and relocated later with no ceremony.

The backbone itself is a store manifest plus a shared host. Each manifest entry declares its id, schema, index definitions, and a policy (tab-local, local-persist, synced, or synced-plus-cached). The host walks the manifest for the active mode, attaches the right persister and synchronizer per policy, binds typed APIs and indexes, and exposes them. This collapses the two near-duplicate CLI `bootstrap` branches and the two parallel web providers into manifest-driven instantiation, and gives any future run reconciliation a single obvious home.
