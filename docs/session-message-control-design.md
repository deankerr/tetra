# Session Message Control Design

Working design note for the module that will own session, thread, and message control in
Tetra. This is not a schema spec yet. It records decisions we have made, the pressure that
led to them, and the questions that still need concrete scenarios before they earn fields.

## Status

Exploratory, but decision-bearing.

This document should stay close to the implementation as the first vertical slices land.
When a statement becomes false, update it rather than preserving historical drift here.
Use ADRs later only for decisions that are hard to reverse and surprising without context.

## Goals

Build a core `Transcripts` module that controls durable session and message operations without baking in
one chat UI workflow.

The module should support current append-only chat while creating foundations for transcript
editing, regeneration, thread switching, and richer context assembly. It should let `Runs`,
web, CLI, and future tool/sub-agent workflows use the same neutral operations.

## Decided Statements

### IDs Are Not Ordering

Tetra should move away from HLC row ids for sessions and messages. There is no meaningful
advantage to HLC ids if ordering is not derived from the id.

Use alphanumeric nanoid-style ids with readable prefixes such as `msg_`. The exact prefix
vocabulary is still to be chosen, but ids are opaque identity, not sort keys.

Example: a user inserts a message between two old messages. The new message id should not
need to sort between the old ids. Ordering belongs to an explicit ordering mechanism.

### Ordering Must Be Explicit

A simple sequential integer count is not the desired final ordering strategy. It can stand in
temporarily if the first slice keeps all ordering behind the new module API and does not expose
integer semantics as a product promise.

A future ordering strategy must support insertion, deletion, replacement, and thread-local
ordering without renumbering the whole transcript on every edit. Fractional or lexicographic
position strings remain likely, but are not decided.

Example: a user edits an early prompt and asks for a new continuation. The altered path needs
to render in a stable order without rewriting every later row just to create a gap.

### The Module Is Named Transcripts

The core control module is named `Transcripts`.

The name is intentionally broader than messages and narrower than the whole runtime. It owns
durable session, thread, and message control. It does not own model execution, provider
projection, or run lifecycle.

Example: `Transcripts` can create a session and append a message. `Runs` can then target that
message for model output.

### Transcripts Is A Top-Level Core Module

`Transcripts` is constructed beside `Helpers`, `Catalog`, and `Runs`. It is not created by
`Helpers`.

`Helpers` is a misc surface for functions that have not earned a better home yet. Using it to
carry stores, indexes, or transcript control into `Runs` hides the real shape of the core
runtime. Until a shared context type is proven, constructors should name the stores, indexes,
and modules they consume.

Example: `Runs` currently depends on credentials, a model resolver, raw store escape hatches,
typed indexes, typed store, and `Transcripts`. Those dependencies are awkward to pass, but the
awkwardness is useful pressure while the real primitives are still being designed.

### Use Thread, Not Branch

Use `thread` as the working term for an alternate ordered path through a session. Avoid
`branch` for product and domain language because it drags Git-like assumptions into a model
that is deliberately not Git.

A thread is not necessarily a permanent historical object that users manage like a source
control branch. It is a way to talk about one coherent path through conversation state.

Example: after regeneration, the user may see or move along another thread. That does not imply
they expect merge, rebase, checkout, conflict resolution, or a full immutable DAG UI.

### Tetra Is Not Git

Tetra can change history. Full preservation of every previous overall session state is not a
default requirement.

Most message edits are expected to mean "make the transcript say this now", not "create a
named alternate timeline I will revisit later". Undo for message edits matters more than
long-term restoration of every exact session state.

Example: a user corrects a typo in a prompt. They probably want the corrected transcript and
maybe local undo. They probably do not want a durable, visible thread for the misspelled state.

### Message Control Is Role-Neutral

The module must not enforce chat-completion workflow rules like "append a user message, then
create an assistant placeholder". That is a current caller workflow, not a domain invariant.

Messages may carry a role because provider APIs and renderers need role-like labels. The
message-control module should treat that role as caller-authored data, not as authority for
what operations are allowed.

Example: an agent communicating with a sub-agent may write a message that is "user" from the
sub-agent runtime perspective, "tool result" from the parent agent perspective, and neither
from the user's perspective. The storage module must not pretend one role interpretation is
globally true.

### Runs Stay Outside This Module

Runs should remain runtime/lifecycle objects. They can call this module to read transcript
records for context assembly, but they should not create, append, edit, delete, or otherwise
interpret transcript records.

The old `runs.assistantMessageId` language was too specific for the long-term model. A run
targets an output message, not necessarily an assistant-role message. The spike uses
`targetMessageId`.

The runtime entrypoint is `runs.generate({ targetMessageId })`. Callers decide whether that
generation represents submit, continue, regenerate, critique, tool-facing output, or another
workflow. The target message must already exist and currently have empty committed parts.

Example: a completion might produce a tool-facing message, a critic note, a system-authored
patch summary, or a child-agent prompt. The run record should identify the target content
without enforcing that the target role is `assistant`.

### Do Not Add Transcript Items Yet

A separate `transcriptItems` table is not decided. It may become correct, but it has too many
unanswered questions to add before we know what relationship it is preserving.

The first design pressure to prove is whether messages need separate membership/order rows, or
whether a simpler thread-plus-message model is enough for the first real editing/regeneration
flows.

Example: if the same message content must appear in multiple threads with different positions,
a membership row starts to earn its keep. If each edit/regeneration creates new message content
for the altered path, a separate item table may be unnecessary at first.

## Working Vocabulary

### Session

A durable container for one conversation workspace: title, working run config, messages, runs,
and one or more threads.

`activeThreadId` belongs on `sessions` as durable session state, at least for this spike. CLI
and web both need a default path for "continue this session".

### Thread

An ordered path through a session's messages.

A thread should not have a `title` field until a real user scenario proves that users name or
scan threads independently from sessions. "Regeneration created an alternate path" is not
enough pressure by itself to add names.

Candidate fields to pressure test:

- `id`: thread identity, likely `thr_...`.
- `sessionId`: owning session.
- `parentThreadId`: nullable pointer if a thread was created from another thread.
- `forkedAfterMessageId`: nullable pointer to the message after which this thread diverges.
- `createdAt`: useful for inspection and deterministic lists.
- `updatedAt`: useful if thread pickers or cleanup surfaces need recent activity.

Not decided:

- `title`: no proven scenario yet.
- `description`: no proven scenario yet.
- `isArchived`: no proven scenario yet.
- `kind`: avoid until multiple thread kinds exist.

### Message

A durable content record. It contains role-like metadata and AI SDK UI parts, but it should not
own run lifecycle.

Candidate fields to pressure test:

- `id`: message identity, likely `msg_...`.
- `threadId`: owning thread; session ownership is derived through the thread. This spike assumes
  each message belongs to exactly one thread.
- `role`: caller-authored string label; not a workflow guard.
- `parts`: committed content parts.
- `position`: explicit order within its owning thread segment.
- `createdAt`: inspection and stable provenance.
- `updatedAt`: edit/render freshness.
- `editedFromMessageId`: possible foundation for message-level undo, but not yet proven.

Not decided:

- Whether edits mutate a message row or create a replacement message row.
- Whether message edit undo is a separate table, a pointer chain, or a UI-local undo stack.
- How context assembly should project arbitrary stored roles into provider-specific role sets.

### Message Edit

A user or caller operation that changes message content. It does not imply model inference.

Editing and regenerating may both alter what future context sees, but their intent and side
effects differ. Editing is content control. Regeneration is runtime execution that writes a new
or replacement output.

Example: changing "use postgres" to "use sqlite" in a prior prompt is an edit. Asking the model
to answer again from that point is a regeneration or continuation action after the edit.

### Regeneration

A run-oriented operation that produces new content for a target place in a thread.

Regeneration should not be defined as "rerun the last assistant message". That is the current
limited implementation, not the domain model.

Example: regenerating a model-produced critique could target a message with role `critic`.
The operation is still regeneration even though the target is not an assistant message.

## Scenario Pressure Tests

### Current Chat Submit

The web composer appends a human-authored message and starts a run targeting a placeholder for
model output.

This scenario proves the module needs neutral `appendMessage` or `createMessage` operations.
It does not prove role-specific APIs such as `appendUserMessage`.

### Add Without Running

The web composer can add a message without starting inference.

This scenario proves message creation is independent from runs and must remain available to
frontends directly.

### Edit A Prompt Typo

A user fixes an earlier message typo and wants the transcript to read correctly.

This scenario proves message-level edit support and undo matter. It does not prove that Tetra
must preserve a visible alternate thread for the pre-edit transcript.

### Regenerate From A Prior Point

A user dislikes an answer in the middle of a transcript and asks for a new continuation from
that point.

This scenario proves the current tail-only regeneration rule is too narrow. It may prove
threads, but it does not yet prove a separate transcript membership table.

### Parent Agent Spawns Sub-Agent

A parent agent creates or continues a sub-session through a tool.

This scenario proves roles are perspective-dependent. The module stores messages; context
assembly decides how to project those messages into provider-specific roles for a given run.

### Inspect Session JSON

A developer opens a JSON view or exports a session.

This scenario proves ids should be readable enough to debug and fields should have obvious
meaning. It does not prove every possible relationship needs first-class storage.

## Candidate First Vertical Slice

1. Introduce a `Transcripts` module in `packages/core`.
2. Move current session/message helper behavior behind neutral API names.
3. Replace HLC id generation for sessions and messages with prefixed nanoid-style ids.
4. Add explicit message ordering behind the module, even if it begins as a temporary integer.
5. Add one active thread per session and route transcript collection through that thread.
6. Rename run targeting from `assistantMessageId` to `targetMessageId`.
7. Keep web and CLI behavior the same: append current caller message, create current run target,
   generate into that target.

This slice should not add visible thread switching yet. It should create the narrowest API
boundary that lets the next slice change the storage model without touching every caller.

## Open Questions

- Should future messages be shareable across threads, and what precise scenario would prove a
  membership table?
- Should edits mutate message rows, create replacement rows, or use an edit history table?
- What undo depth is worth storing durably during prototype mode?
- What role representation is precise enough without recreating provider-specific role rules?
- What final ordering strategy should replace temporary integer positions?
