# tinybasechat

LLM chat app for power users. Local-first, composable, built on TinyBase.

**Primary goal:** Evaluate TinyBase as the reactive data layer for an agent runtime — not just a chat UI, but foundations that can grow into composable prompt management, tool use, and sub-agent delegation.

**Stack:** TinyBase, AI SDK, OpenRouter, React, TanStack Start, Tailwind, shadcn/ui, AI Elements

## Architecture

Two-store design with a decoupled runtime. TinyBase sits between React and the agent runtime as a synchronization layer.

```
┌─────────────┐         ┌──────────────┐
│   React UI  │◄───────►│ Config Store  │
│             │◄───────►│ Runtime Store │◄────► Agent Runtime
└─────────────┘         └──────────────┘
```

- **UI** reads both stores reactively. Writes to config store (editing agents). Dispatches commands to runtime store (send message, cancel, retry). Never imports AI SDK or manages requests directly.
- **Runtime** watches the runtime store for new commands, reads config store to resolve agent config, executes AI SDK calls, writes results back to runtime store. Not tied to React lifecycle.
- The contract between UI and runtime is the store schema — not function calls, not imports. Navigating between conversations does not terminate active requests.

### Config Store

Static data edited by the user. Persisted to IndexedDB.

- Agents (model config, name, prompts)
- Shareable agent configurations (future)
- Tool definitions (future)

### Runtime Store

Dynamic data written by the agent runtime. Separate IndexedDB persister, higher write volume.

- Commands (pending actions: send message, cancel, retry)
- Sessions (agent ref, status, timestamps)
- Messages (full UIMessage objects per session)

### Why Two Stores

- Different write patterns: config is user-edited and low-frequency; runtime is machine-written and high-frequency during streaming
- Different persistence needs: config could sync across devices; runtime is local ephemeral state
- Clean boundary for future extraction: if the runtime moves off-device (service worker, remote server), only the runtime store needs a sync strategy
- TinyBase supports this natively via `storesById` on the Provider

## Data Model

### Messages

Store entire `UIMessage` objects as TinyBase `object` cells. TinyBase v8+ supports native object/array cell types with transparent JSON serialization.

```
messages table:
  id          (string)   — message ID
  sessionId   (string)   — FK to session
  role        (string)   — system | user | assistant
  message     (object)   — full UIMessage including parts[]
  createdAt   (number)   — timestamp
```

**Why whole-message storage over normalized parts:**
- Simpler schema, less assembly code
- Matches how AI SDK produces and consumes messages — direct round-trip
- Avoids premature normalization before we know if granular reactivity matters
- If streaming reactivity becomes a problem, normalize into a `message_parts` table later

**UIMessage.parts** contains heterogeneous content: text, reasoning, tool calls, tool results, files, step markers. Each part has a `type` and `state` field. Tool calls link to tool results via `toolCallId`.

### Sessions

```
sessions table:
  id          (string)   — session ID
  agentId     (string)   — FK to agent used
  title       (string)   — conversation title
  status      (string)   — idle | streaming | tool-calling | error
  createdAt   (number)
  updatedAt   (number)
```

**Snapshot vs live link:** Sessions reference their agent by ID. Prompt config is resolved at send time from current agent state. A future "pin config" feature could snapshot the resolved prompt if reproducibility matters.

### Agents

```
agents table:
  id          (string)   — agent ID
  name        (string)
  model       (string)   — model identifier (e.g. openrouter/anthropic/claude-sonnet-4)
  provider    (string)   — provider key (openrouter, etc.)
  systemPrompt (string)  — system prompt
  temperature (number)
  maxTokens   (number)
```

Agents start simple — model config + system prompt. Composable prompt management can layer on top later without schema rewrites.

## Feature Layers

### Layer 0: Data Foundation

The TinyBase evaluation layer. Everything here tests whether TinyBase's primitives map cleanly to an agent runtime's data needs.

- Two-store setup with separate IndexedDB persisters
- Agent, session, message schemas with relationships and indexes
- Reactive UI hooks — components re-render when store data changes
- Session index by recency, message index by sessionId
- Import/export of agent configs as JSON

**TinyBase features under evaluation:**

| Feature | What We Learn |
|---|---|
| Schema + typed cells | Enforcing entity model without fighting types |
| Object/array cells | Storing complex AI SDK messages without normalization |
| Relationships | Agent→session, session→messages graph navigation |
| Indexes | Message-by-session, session-by-recency queries |
| Reactivity (ui-react) | Does reactive message list work during streaming? Over-rendering? |
| Multiple stores | Config vs runtime separation via storesById |
| Values (key-value) | UI state without React context — ergonomics and re-render behavior |
| Row listeners | Command dispatch — does the runtime react fast enough to feel instant? |
| Persisters | IndexedDB reliability at chat-scale data volumes |

### Layer 1: Chat Runtime

Minimum viable chat exercising the data model end-to-end.

- Session lifecycle: create from agent config, maintain message history
- Command-driven: UI writes `send` command → runtime picks up → streams response → writes messages to store → UI reflects reactively
- AI SDK `streamText` with OpenRouter provider
- Streaming state tracked in runtime store — UI observes, doesn't control
- Cancel via `cancel` command, not React-managed AbortControllers

### Layer 2: Agent Configuration & Interaction

Richer agent profiles and a command-driven interaction model.

- Multiple agents with different model configs and prompts
- Agent selector per session (or globally with per-session override)
- Agent sharing: export/import as JSON
- Command palette and slash commands as primary interaction surface (see below)

### Layer 3: Composable Prompt Management

Structured prompt composition beyond a single system prompt field. The exact primitives (blocks, templates, presets) are explored in the context management prototype — this layer integrates those concepts when ready.

- Reusable prompt fragments assignable to agents with ordering and placement
- Prompt assembly: composing fragments → ordered messages → provider-formatted request
- Live preview of assembled prompt before sending
- Shareable, remixable agent configurations

This layer is the bridge from "chat app" to "context engineering tool." The data model from Layer 0 should accommodate this without schema rewrites.

### Layer 4: Tool System

Where chat becomes agent runtime. Data model supports this from the start even if UI is minimal.

- Tool registry: tools as entities in config store, assignable to agents
- Built-in tools: web search/fetch via external service
- Tool execution loop: AI SDK tool calling → execute → feed result → continue
- Tool result rendering: structured display in chat UI using AI Elements components
- Tool state tracked per-message-part (input-streaming → input-done → output-available)

### Layer 5: Sub-Agents & Delegation

Not building now, but the data model must not prevent this. Sub-agents are not a separate system — they emerge naturally from sessions, commands, and tools being generic primitives. An agent calls a tool, the tool creates a sub-session with a different agent config, the runtime processes it like any other session. See [reference/sub-agents.md](reference/sub-agents.md) for detailed examples (vision, async research) and mechanics.

### Layer 6: Image/File Support

- Image input: paste/upload images as user message parts
- File input: attach files, stored as base64 or external refs
- Image output: render generated images in assistant messages
- Storage strategy TBD: inline base64 for small files, external refs for large ones

## Interaction Model

Power-user-first. The command table is already the interface for actions, so the input bar and command palette are thin shells that parse text into command rows. Everything funnels through the same path — there's no distinction between "clicking a button" and "typing a slash command."

### Slash Commands

The input bar doubles as a command line. Prefix with `/` to dispatch actions instead of chat messages.

```
/new                      → create new session
/retry                    → regenerate last response
/cancel                   → abort active request
/model sonnet             → switch model
/model.temperature 0.5    → adjust parameter
/agent <name>             → switch agent
/clear                    → clear session history
/export                   → export session/agent as JSON
```

Commands are extensible — agents can define their own slash commands (e.g. `/summarize`, `/explain`). The parser maps input to a command row in TinyBase; the runtime handles it from there.

### Command Palette

A searchable overlay (Cmd+K) surfacing the same actions available via slash commands, plus navigation (switch session, switch agent, search messages). No separate button UIs needed for common actions.

### UI State in TinyBase

TinyBase `Values` (flat key-value store, not tabular) for ephemeral app state. Components subscribe to individual values — no context providers, no prop drilling, no re-render cascades.

```
values:
  activeSessionId    (string)   — currently viewed session
  sidebarOpen        (boolean)  — sidebar visibility
  inputDraft:{id}    (string)   — per-session draft text (future)
```

**Why push UI state into TinyBase:**
- Components read what they need via `useValue()` — surgical re-renders, no provider wrappers
- State survives across navigations without lifting into React context
- Same reactive model as everything else — no mixing useState/useContext/zustand/TinyBase
- Persisting UI state (last active session, sidebar preference) comes free with the persister

**What stays in React:** Truly transient interaction state — hover, focus, animation, controlled input value mid-keystroke. If it matters after a re-mount, it goes in TinyBase. If it doesn't, it stays local.

## Command Pattern

The UI never calls the runtime directly. All communication flows through TinyBase.

### How It Works

1. **UI writes a command** — e.g. user hits send → UI writes user message to `messages` table, writes a `send` command to `commands` table with the session ID
2. **Runtime reacts** — runtime watches `commands` table via TinyBase listener, picks up new commands
3. **Runtime executes** — reads agent config from config store, assembles prompt, calls AI SDK, streams response
4. **Runtime writes results** — assistant message built up in `messages` table, session status updated, command marked complete or errored
5. **UI reflects** — React components re-render reactively as store data changes. No callbacks, no promises, no shared state.

```
commands table:
  id          (string)   — command ID
  sessionId   (string)   — target session (nullable for global commands)
  type        (string)   — send | cancel | retry | new-session | set-model | ...
  status      (string)   — pending | processing | complete | error
  payload     (object)   — command-specific data (message content, parameter values, etc.)
  createdAt   (number)
```

### Why Commands Over Direct Calls

- **UI stays pure** — React components only read TinyBase and write commands. No AI SDK imports, no AbortControllers, no streaming callbacks.
- **Runtime is a black box** — the UI doesn't know or care how inference happens. Same command schema works whether the runtime is an in-browser module, a service worker, or a remote server.
- **Testable** — write a command row, assert on resulting message rows. No mocking network calls.
- **Concurrency for free** — multiple sessions can have active commands simultaneously. The runtime processes them independently. The UI just watches each session's state.
- **Audit trail** — the commands table is a log of every action taken. Useful for debugging and replay.

### Runtime Implementation

**v1:** In-browser module. Subscribes to `commands` table via TinyBase row listener. Processes commands sequentially per session, concurrently across sessions. Manages AbortControllers internally.

**Future:** Service worker (BroadcastChannel synchronizer) or remote server (WebSocket synchronizer via MergeableStore). The migration only changes where the runtime runs and how the stores sync — the command schema and UI code don't change.

## Open Questions

- **Message ordering** — TinyBase rows are unordered. Use `createdAt` index, or maintain an explicit order field? Timestamps might collide during tool call loops.
- **Streaming granularity** — Whole-message object cells mean every token update replaces the entire message object in the store. Need to measure if this causes performance issues with TinyBase's reactivity. If so, split to normalized parts table.
- **Large conversations** — At what point does a single session's message volume stress TinyBase or IndexedDB? Need to test with realistic conversation lengths (hundreds of messages with tool calls).
- **Config store schema evolution** — How does TinyBase handle schema changes across app versions? Need a migration strategy before persisting real user data.
- **Provider abstraction depth** — OpenRouter handles multi-provider routing. Do we also need provider-specific prompt formatting (system message consolidation for Claude vs ChatML for others), or does AI SDK abstract this sufficiently?
