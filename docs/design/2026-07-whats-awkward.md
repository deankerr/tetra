# What Currently Feels Awkward — July 2026

A whole-project review answering one question: _what feels awkward right now_ — in code, in
architecture, in concepts? Written to inform the build-more vs. refine balance, not as a bug
list. Known issues (OpenRouter feature gaps, the mergeable delete-update race, and the items
already in `docs/design/db-migration-followups.md`) are excluded except where they've grown.

Ordering is roughly by how much the awkwardness will compound if built on top of.

---

## 1. RunConfig states and write ownership — resolved

The review found two durable session-config update implementations and schemas named by
location rather than meaning. It also found one loose JSON schema serving two unrelated
roles: historical run snapshots and partial defaults for future sessions.

The cleanup now gives each durable state the schema matching its invariant:

- `RunConfigSchema` is the complete executable recipe and the run-row snapshot shape.
- `SessionRunConfigSchema` supplies built-in defaults for the durable session cell.
- `RunConfigDefaultsSchema` validates the partial template used for new sessions.
- `ProviderOptionsSchema` remains the deliberately open field inside all three.

The persisted web provider delegates patches to `RunConfigs.update`; the draft provider
continues to merge transient React state but validates the result as a complete RunConfig.
Live execution no longer re-parses the already-resolved config, and snapshot readers consume
the typed row directly. `CONTEXT.md` names Session RunConfig, RunConfig Default, RunConfig
Snapshot, and RunConfig Draft so their different lifecycles are part of the shared language.

## 2. Run liveness has two authorities and no recovery story

A run's `status: 'active'` row is, per the code comments, "only a claim" — the in-memory
`Runs` map is the authority (`apps/web/src/session/message/data.ts:19`,
`apps/web/src/session/composer.tsx:307`). This is a sound local-first instinct (a synced
'active' row from another device must not lock this device's UI), but the consequences are
spread out and unfinished:

- **Nothing ever reconciles stale claims.** A crashed tab, killed CLI process, or reload
  mid-stream leaves the run row `active` forever. `packages/core/CONTEXT.md` and the root
  context map both name _recovery_ as core behavior; no recovery code exists anywhere
  (`grep recover packages/core/src` → nothing). Every read surface instead defends
  individually: `useActiveRun`, `useMessageRunActive`, and `waitForRun` each re-derive
  "actually live" from row + map. Each new surface (sub-agents, a run list view, a second
  device) has to remember the same two-step check. A boot-time sweep — "any `active` run row
  with no live Run object becomes `error: interrupted`" — would collapse the pattern back to
  one authority and make run rows trustworthy for the sync/multi-device story you're heading
  toward.
- **The liveness signal is reactively accidental.** `tetra.runs.getBySession()` is read
  during render with no subscription; it only _looks_ reactive because the 500ms durable
  snapshot writes (`run.ts:17`) happen to dirty the store and re-render the component. If
  the snapshot cadence changed or a run produced no parts, the UI would go stale. The
  coupling is invisible at the call sites.
- **Concurrency policy is undeclared.** The composer blocks on "newest run row in session is
  active", but message-level Regenerate only checks _that message's_ run — you can start a
  second concurrent run in one session from an older message. Meanwhile
  `Runs.getBySession` returns "first match" as if one-per-session were an invariant
  (`packages/core/src/runtime/runs.ts:74`). Either concurrent runs per session are allowed
  (then `getBySession` returning a single Run is wrong) or they aren't (then `generate`
  should enforce it). Right now the answer lives in UI incidentals.

## 3. The transcript layer and React reactivity meet at an awkward seam

Core's transcript API is deliberately imperative and synchronous — handle objects
(`TranscriptSession`, `TranscriptMessagePath`, `TranscriptThread`, `TranscriptMessageTree`)
that re-read the store on every call. That's clean on its own. The awkwardness is at the
join with React, where derived views (threads, forks, newest-leaf) aren't reactive, so the
web layer glues them on manually:

- **Subscription-for-side-effect** is now a load-bearing idiom, not a one-off.
  `fork-control.tsx:63` calls `useBySession()` and discards the result purely to subscribe,
  then reads via `transcripts.getSession().listContinuations()`. `thread-view.ts` does the
  same dance with extra steps. The db-migration doc flagged one instance; it has become the
  standard way to make any core derivation reactive. Every instance looks like deletable
  dead code and isn't.
- **The thread anchor is synced state that's constantly re-derived and written back.**
  `useResolvedSessionThread` derives the effective anchor each render, then a `useEffect`
  writes it back into the desk store when they disagree (`thread-view.ts:58-62`). This is
  the "don't sync state, derive it" rule inverted: the stored anchor is a cache of a
  derivation, kept fresh by an effect. It works, but it's the kind of loop that grows
  mysterious extra conditions over time.
- **Validation calls that look like dead code.** `selectThreadFromMessage` calls
  `resolveThread()` and discards the result — it's there to throw on invalid ids
  (`thread-view.ts:29,66`). Same hook also exists twice in the file with identical bodies
  (`useSessionThreadSelection` vs. the one inside `useResolvedSessionThread`).

The underlying question is architectural: **should thread resolution be a tinydb-level
reactive query instead of an imperative core walk?** The pieces exist — tinydb already
generates reactive index hooks. A `useThread(sessionId, anchorId)` that owns
subscribe+derive in one place would delete the idiom everywhere. This seam is worth settling
before sub-sessions/sub-agents multiply the number of surfaces walking trees.

## 4. Run-time role projection contradicts the role ADR

ADR-0006 and `CONTEXT.md` are emphatic: message roles are caller-authored labels, "not a
provider contract, workflow guard, or authority." But `toAiSdkUiMessageRole` hard-throws on
anything except `user | assistant | system` (`packages/core/src/runtime/run.ts:274`). So the
moment a transcript contains one message with a custom role, _every future run through that
path crashes_ — and manual transcript editing is a stated feature goal, and the web edit UI
writes arbitrary role strings. The ADR says provider projection belongs at the run boundary,
which is where this lives — but "belongs at the boundary" should mean a _policy_ (map
unknown roles to user? skip? annotate?), not a landmine. Right now the docs promise freedom
the runtime doesn't honor. Small fix, but it's a conceptual contract violation, which is the
kind you asked about.

## 5. Cascading deletes are hand-rolled and will grow with every table

`Transcripts.deleteSession` manually deletes runs → steps → messages → session
(`transcripts.ts:45`); `TranscriptSession.deleteMessage` manually deletes runs-by-target →
steps-by-run → steps-by-message → message (`session.ts:70`). Both are correct today, but the
ownership graph lives only in these two method bodies. The roadmap adds media/files,
sub-sessions, and prompt fragments — each new session-owned table needs someone to remember
both cascade sites (and the wipe path, and the export path in `session.ts:127`, which also
hand-enumerates tables). This smells like the first genuinely justified tinydb feature:
a declarative "owned by" relation on the schema (even just metadata that a helper walks),
so cascade/export/wipe derive from one declaration. Notably `defineSchema` already knows
about relations implicitly through indexes (`on: 'sessionId'`) — the cascade could ride the
same declaration.

## 6. Mergeable-store granularity: two watch items

The mergeable library store merges at _cell_ granularity, and two schema choices work
against that:

- **`sessions.config` is one object cell.** Every field edit replaces the whole config
  (`run-configs.ts:30`). Two devices editing _different_ config fields concurrently will
  last-write-wins the entire object — a silent lost update that cell-level CRDT was supposed
  to prevent. If session config is meant to be collaborative across devices, the fields want
  to be individual cells (or a config sidecar table); if LWW-whole-config is acceptable,
  worth writing down as a decision.
- **`messages.parts` is one array cell rewritten every 500ms during streaming.** Locally
  this is fine. Over the sync socket, each snapshot ships the entire accumulated parts array
  — a long reasoning+tool run re-transmits its own history dozens of times, and the
  MergeableStore keeps HLC metadata churning for each rewrite. Not urgent, but it's the
  main sync-traffic amplifier in the design and worth remembering when sub-agent sessions
  (many concurrent streams) arrive.

Both are instances of the same question the schema/storage boundary should answer:
_what changes together vs. what merges independently_. `docs/storage.md` documents store
ownership and lifecycle, but these merge-granularity decisions remain implicit in whatever
shape the zod schema happened to take. Record them there or in an ADR when they become
intentional decisions.

## 7. The Run object is a grab-bag handle

`Run` is an `EventTarget` with ~10 public mutable fields (`parts`, `finalParts`, `model`,
`modelMessages`, `result`, `status`, `error`, `tools`…) and payload-less string events
(`'snapshot'`, `'finish'`, `'status'`, `'step'`) — consumers listen, then reach back into
mutable state (`run.ts:37-70`). The CLI has to diff text growth manually across snapshots
(`chat.ts:52-59`). It works, and "explicit handles for long-running work" is the right
claim, but the interface is wide and untyped for what consumers actually do with it
(read parts, know when it's done). Two small things would deepen the module without a
rewrite: a typed event map (or async-iterable of snapshots), and demoting the debug fields
(`model`, `modelMessages`, `result`) out of the public surface.

Also hiding in there: `stopWhen: stepCountIs(6)` is a hard-coded magic constant
(`run.ts:209`) — the one run-behavior knob that isn't in RunConfig.

## 8. Empty-string sentinels are the de-facto null

`modelId: ''`, `systemPromptId: ''`, `title: ''`, `provider: ''` — absence is the empty
string across the schema, and each read site re-implements the check
(`prompts.resolveContent`, `printRunConfig`, `unlinkPrompt`, title fallbacks in three
components). This is partly a TinyBase constraint (cells can't be undefined), but tinydb
supports `nullable()` and the schema already uses it elsewhere (`parentMessageId`,
`defaultRunConfig`). The half-and-half means readers must know per-field which absence
convention applies. Notably `modelId: ''` passes strict `RunConfigSchema.parse` at run
start and fails later inside the provider call — the one field where a sentinel check
would be a better user error.

## 9. Smaller code-level friction (quick hits)

- **Catalog refresh dirties every row hourly.** `refresh()` writes `updatedAt: now` on all
  ~400 models even when nothing changed (`catalog.ts:62`), so every row listener fires and
  the whole catalog re-persists to IndexedDB each hour, and `updatedAt` means "last refresh"
  rather than "changed". Skipping unchanged records would fix both.
- **Loose `MessagePartSchema`.** `z.custom<UIMessage['parts'][number]>` checks only
  "object with a `type`" (`schema.ts:5`) — the single most important stored shape has the
  weakest boundary in the schema. Probably pragmatic (AI SDK part types are a moving
  union), but worth an explicit note since everything downstream trusts it.
- **`AppContextValue` flattens core into the context** (`app.tsx:9`) while reactive reads
  come from module imports (`libraryReact`). Two access idioms per component — documented
  and deliberate, but new component code visibly hesitates between them.
- **`docs/design/db-migration-followups.md` items are aging in.** The CLI write-path
  inconsistency it describes still exists (`sessions rename` now goes through core, but
  `prompts update` still writes direct). The analogous web config path from §1 has now
  moved behind its core module. The doc said "revisit during a dedicated cleanup pass";
  the remaining paths still need that pass.
- **`apps/cli` parity is drifting.** No tools display, no fork/thread control, no usage
  meter, no provider options — AGENTS.md says the CLI "should always track the feature set
  of the web frontend (within reason)". It's currently more of a scripting harness than a
  chat surface. Either is fine, but the stated goal and the artifact disagree.

## 10. Test coverage is shaped like the old architecture

Core is well-tested (810-line runtime integration test, transcripts, configs, steps), tinydb
is tested, and the CLI has an integration test. The web layer — 40+ files and still the seam
where §3's domain logic accumulates — has zero tests. This is the known coverage gap from
the migration doc, but the shape matters more than the number: **the untested layer is the
one currently accumulating behavior.** Either behavior moves down into tested core, as the
§1 cleanup did, or the web layer needs its own harness. The former is cheaper and matches
the stated architecture.

## 11. Conceptual: the vision's next features all press on the same three joints

Reading VISION.md against the code, the undercooked-but-planned features (agent profiles,
prompt fragments/composition, sub-sessions, context assembly) all land on joints this doc
already flagged:

- **Profiles** are "named RunConfigs" — they now have the typed states and single update
  seam established by the §1 cleanup, but will still add another lifecycle to that model.
- **Prompt composition** replaces the `systemPromptId: ''` sentinel and single-blob prompts
  — it inherits the unlink-scan and the sentinel conventions of §8.
- **Sub-sessions** multiply concurrent runs (§2's undeclared policy), tree-walking surfaces
  (§3's seam), and cascade edges (§5).
- **Context assembly** replaces `maxMessages` + `.slice(-n)` (`runs.ts:132`) — which today
  can slice a transcript mid-tool-call and ship an orphaned tool result to the provider.

None of these require pausing feature work for a refactor era. The §1 cleanup is complete;
§2–§3 remain much cheaper before sub-agents and composition are built on top of them.

---

## Suggested balance

The first recommended refinement — unifying the RunConfig write path and naming its states
(§1) — is complete. The remaining priorities are:

1. **Add the boot-time run reconciliation sweep** (§2) — makes run rows trustworthy,
   deletes the scattered two-authority checks, and is a prerequisite for honest
   multi-device and sub-agent status UI.
2. **Settle the reactive-derivation seam** (§3) — one blessed way to get a reactive thread/
   fork view, killing the subscription-for-side-effect idiom.

Cheap hygiene to fold into any passing commit: the role-projection policy (§4),
`stepCountIs(6)` → config (§7), and catalog refresh no-op writes (§9).

Fine to leave until it hurts: cascade declarations (§5 — do it when the next owned table
appears), mergeable granularity (§6 — decide when multi-device editing is real), Run handle
API (§7), empty-string sentinels (§8).
