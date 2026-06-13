# Tetra

LLM chat app for power users. Use TinyBase as the local-first, reactive data layer for an agent runtime — not just a chat UI, but foundations that grow into a composable collection of systems for prompt management, tool use, sub-agent delegation, etc.

Power users should be able to see and shape the system: models, prompts, tools, credentials, transcripts, and provider options are first-class controls, not hidden implementation details.

Use OpenRouter as the exclusive inference provider. The end user providers their own credentials.

Identify modular components, eagerly extract into packages. Review and refactor frequently.

Treat stored config as user-authored input at execution boundaries.

## State

TinyBase is the local, durable, and reactive state between the frontend and the runtime. Accessing our database is synchronous - no external round-trips.

```
Frontend actions  ──►  Runtime  ──►  Inference
Frontend reads    ◄──  TinyBase  ◄──  Runtime writes
```

Consumers call runtime commands for user intentions and read from TinyBase for reactive state. The runtime has no React dependency. The inference adapter has no TinyBase dependency.

This decoupling strategy natively allows for active requests to survive navigation, unmounts, and remounts.

## Feature Goals

- Chat with OpenRouter's extensive LLM catalog.
- Manual transcript editing.
- Agent/Assistant profiles: named collections of model/parameter/tool/prompt configurations.
- Requests are a first-class, persisted entity, with config snapshots.
- Context Management: selection and assembly of prompt/message request inputs.
- Composable Prompt Management: Reusable prompt fragments, assembly, preview.
- Tool registry, execution loop, result rendering. AI SDK tool calling.
- Sessions spawn sub-sessions via tools. An agent can delegate work to another agent — blocking or async. See `reference/sub-agents.md`.
- Media/file support.
- Slash command/command palette interaction model.
