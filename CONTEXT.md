# Tetra

Tetra's shared product language across apps, packages, and core behavior.

## Language

**RunConfig**:
A recipe for starting a run: model, system prompt, selected tools, provider-specific options, and message selection. It is shared by app surfaces and core execution rather than owned by one UI.
_Avoid_: Settings, one-off overrides

**Message**:
A committed content record with caller-authored role-like metadata and parts. Core message control must not enforce a "user message in, assistant message out" workflow; provider-specific role projection belongs at run/context assembly boundaries.
_Avoid_: Assistant response, chat turn

**Thread**:
The working term for an ordered path through a session. Tetra threads are not Git branches: history can be changed, and full preservation of every previous overall state is not a default requirement.
_Avoid_: Branch

**Transcripts**:
The core module that owns durable session, thread, and message control. It stays neutral about why callers create messages; runs, web, CLI, and tools use it without making it responsible for model execution.
_Avoid_: Chat service, runner
