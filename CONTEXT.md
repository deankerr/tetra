# Tetra

Tetra's shared product language across apps, packages, and core behavior.

## Language

**Session**:
A transcript workspace that groups messages. A session can be empty; Tetra does not represent session roots with synthetic messages.
_Avoid_: Conversation, chat

**RunConfig**:
A recipe for starting a run: model, system prompt, selected tools, provider-specific options, and message selection. It is shared by app surfaces and core execution rather than owned by one UI.
_Avoid_: Settings, one-off overrides

**RunConfigs**:
The core module that owns the run config lifecycle: session config creation, structured updates, the new-session default, prompt unlinking, and resolving the effective config when a run starts. Typed per-cell writes to a session's config row are part of its interface; RunConfigs owns every merge, multi-cell, or cross-table operation.
_Avoid_: Helpers, settings service

**Message**:
A committed content record with caller-authored role-like metadata and parts, anchored either at the start of a session path or after another message. Core message control must not enforce a "user message in, assistant message out" workflow; provider-specific role projection belongs at run/context assembly boundaries.
_Avoid_: Assistant response, chat turn

**Message Role**:
A caller-authored label stored on a message. It is not a provider contract, workflow guard, or authority for what operations are allowed.
_Avoid_: Chat completion role

**Message Edit**:
An operation that changes an existing message's committed content or caller-authored metadata in place. It does not create a new thread or imply model inference.
_Avoid_: Regeneration

**Regeneration**:
A run-oriented operation that creates a new sibling of an existing message and writes generated output into that new message. It does not copy descendants or mutate the regenerated message.
_Avoid_: Edit, rerun last assistant

**Parent Message**:
The immediate predecessor of a message within the same session's message tree. Root-level messages have no parent.
_Avoid_: Previous message

**Message Tree**:
The full topology of a session's messages, formed by `parentMessageId` links. The tree is durable, but it is not stored as a separate thread or branch entity.
_Avoid_: Branch, conversation

**Message Path**:
An exact root-to-message path through a session's message tree. A message path may end at a non-leaf message; runs use message paths to assemble context before a target message.
_Avoid_: Thread, history

**Leaf Message**:
A message with no children in its session's message tree.
_Avoid_: Final response

**Thread**:
A root-to-leaf message path. A thread can be resolved from any message by treating that message as an anchor and walking to the newest-created descendant leaf. Tetra threads are derived views, not durable entities, subtrees, or Git branches.
_Avoid_: Branch, subtree, durable thread

**Thread Anchor**:
A caller-owned message id used to resolve a thread. A thread anchor may have been a leaf when selected, but later become an ancestor after local append or sync.
_Avoid_: Active thread, default thread

**Fork Point**:
A message with multiple child continuations.
_Avoid_: Branch point

**Fork Choice**:
A surface-visible choice at a fork point, represented by one child message id. Choosing a fork choice selects a thread anchor so the surface resolves a thread through that message and onward to a leaf.
_Avoid_: Active continuation, branch option

**Continuation**:
A child message that continues from a parent message. Multiple continuations from one parent are alternatives at the same fork point.
_Avoid_: Branch, sibling branch

**Transcripts**:
The core module that owns durable session and message control. It stays neutral about why callers create messages; runs, web, CLI, and tools use it without making it responsible for model execution.
_Avoid_: Chat service, runner

**Prompts**:
The core module that owns stored prompt records and resolving a system prompt id to prompt content. Deleting a prompt asks RunConfigs to unlink it from session configs.
_Avoid_: Helpers, prompt library
