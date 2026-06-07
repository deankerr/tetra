# Tetra

Tetra's shared product language across apps, packages, and core behavior.

## Language

**Session**:
A transcript workspace that groups messages. A session can be empty; Tetra does not represent session roots with synthetic messages.
_Avoid_: Conversation, chat

**RunConfig**:
A recipe for starting a run: model, system prompt, selected tools, provider-specific options, and message selection. It is shared by app surfaces and core execution rather than owned by one UI.
_Avoid_: Settings, one-off overrides

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

**Thread**:
A focused path view through a session's message tree, formed by choosing a message and walking its parent chain to the root. Tetra threads are not durable entities, subtrees, or Git branches.
_Avoid_: Branch, subtree, durable thread

**Default Thread**:
The thread a surface derives for a session when no caller-owned focus is supplied. It ends at the newest created leaf message, or is empty when the session has no messages.
_Avoid_: Active thread

**Transcripts**:
The core module that owns durable session and message control. It stays neutral about why callers create messages; runs, web, CLI, and tools use it without making it responsible for model execution.
_Avoid_: Chat service, runner
