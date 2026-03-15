# tinybasechat

LLM chat app for power users. Local-first, composable, built on TinyBase.

**Primary goal:** Evaluate TinyBase as the reactive data layer for an agent runtime — not just a chat UI, but foundations that can grow into composable prompt management, tool use, and sub-agent delegation.

**Stack:** TinyBase, AI SDK, OpenRouter, React, TanStack Start, Tailwind, shadcn/ui, AI Elements

## Initial Slice Prototype

The vague parts of this plan are intentional unknowns. The first slice should not try to resolve them upfront in prose; it should build the smallest prototype that produces real data about TinyBase's fit.

### Purpose

Build a local-only prototype that proves or disproves the core loop:

1. User edits data in TinyBase
2. UI writes runtime commands into TinyBase
3. An in-browser runtime reacts to those commands
4. AI SDK streams assistant output back into TinyBase
5. React re-renders from store changes
6. Reloading the app restores enough state to continue inspection and iteration

If this loop feels awkward, fragile, or slow, the architecture should change before adding product surface area.

### Questions This Slice Must Answer

- Can TinyBase comfortably hold chat runtime state and UI state without introducing awkward React integration?
- Is storing whole `UIMessage` objects practical during streaming, or does it create too much render/persistence churn?
- Does the two-store split feel useful in code, or does it add complexity before it pays off?
- Is a command-table runtime simpler than direct UI-to-runtime calls once streaming, cancelation, and reload behavior are included?
- What is the minimum schema needed to support future tools and sub-agents without building them now?

### Success Criteria

The slice is successful if it gives clear answers to the questions above, even if some answers are "no."

- One default agent can drive a real streamed conversation end-to-end
- Sessions and messages survive reload via IndexedDB
- Route navigation does not own the runtime lifecycle
- Streaming updates appear incrementally in the UI
- At least one cancelation and one retry path are exercised
- We can inspect enough runtime state after failures to understand what happened
- The code leaves a clear record of where TinyBase helped and where it added friction

### Non-Goals

Do not expand the prototype to cover these in the first slice:

- Multi-agent UX beyond a single default agent and basic agent record
- Slash commands and command palette
- Tool execution and tool result rendering
- Sub-agents and delegation flows
- Image/file input
- Prompt composition beyond a single system prompt field
- Sharing, import/export, or sync across devices
- Provider abstraction beyond OpenRouter

### Scope

#### Included

- Two TinyBase stores: `config` and `runtime`
- IndexedDB persistence for both stores
- One seeded agent record with editable model + system prompt
- Session list with create/select behavior
- Message timeline for the active session
- Composer with send, cancel, and retry
- In-browser runtime module driven by TinyBase listeners
- AI SDK streaming with OpenRouter
- Minimal status + error surfaces for sessions and commands

#### Excluded

- Rich command parsing
- Multi-pane power-user navigation
- Tool registry
- Import/export flows
- Any UI polish not required to evaluate the architecture

### Prototype Decisions

These are temporary defaults to make the slice executable. They are not long-term commitments.

- Use an explicit per-session `seq` field for message ordering instead of relying on timestamps
- Keep the runtime in-browser and single-client for v1
- Start with whole-message storage, but treat that as a hypothesis under test
- Persist stores normally, but document the write pattern during streaming before optimizing it
- Use one active session view; avoid splitting attention across advanced navigation patterns
- Seed a default agent so the first run works without setup friction

### Runtime Rules For The Slice

The command pattern needs enough discipline to be testable, even in a prototype.

- Commands are append-only rows with `pending`, `processing`, `complete`, or `error` status
- The runtime must claim a command before executing it
- A command should have enough metadata to debug duplicate execution or stalled processing
- Session status should reflect runtime state independently from the UI route
- Failures should be written back into the runtime store, not hidden in console logs

The point is not to perfect the protocol now. The point is to make the behavior inspectable enough to evaluate whether the protocol is worth keeping.

### Deliverables

The initial slice should produce these concrete outputs:

- A working app route that replaces the current demo shell
- TinyBase store setup with typed schemas for the prototype entities
- A runtime module that reacts to store commands and streams responses
- A minimal chat UI wired entirely through TinyBase state
- Short written notes added back to this plan describing what worked, what failed, and what should change next

### Build Sequence

#### Step 1: Store Foundation

- Create `config` and `runtime` stores with the minimum schema needed for one agent, sessions, messages, commands, and UI values
- Add IndexedDB persisters and seed initial data
- Prove reload restores usable state

#### Step 2: Static Chat Shell

- Replace the current demo route with a real app shell
- Render session list, message list, and composer from TinyBase only
- Keep message creation local and non-networked until the reactive UI shape is stable

#### Step 3: Runtime Loop

- Add command rows for `send`, `cancel`, and `retry`
- Run an in-browser runtime that listens for `pending` commands and writes results back to the runtime store
- Stream assistant output into the active message record

#### Step 4: Failure + Recovery Pass

- Test refresh during idle, during streaming, and after error
- Test duplicate command protection assumptions
- Verify cancelation and retry behavior leave inspectable state behind

#### Step 5: Evaluation Write-Up

- Record concrete observations about render behavior, persistence churn, schema ergonomics, and runtime complexity
- Decide whether to keep whole-message storage, keep two stores, and keep the command-table pattern for the next slice

### What We Intentionally Leave Open

These questions should be answered by the prototype, not by pretending certainty now:

- Whether whole-message storage is acceptable during streaming
- Whether the runtime store should remain fully persisted or partially ephemeral
- Whether TinyBase `Values` are the right home for all non-transient UI state
- Whether the command-table pattern is still the cleanest boundary after implementing cancelation and recovery
- Whether relationships and indexes feel useful immediately or should be introduced more gradually

### Implementation Checklist

- [x] Replace the demo route with a prototype app shell
- [x] Create `config` + `runtime` TinyBase stores with typed schemas
- [x] Seed a default agent and first-run session state
- [x] Persist both stores locally and restore them on reload
- [x] Add session ordering and message ordering primitives
- [x] Render session list, active conversation, and composer from TinyBase state
- [x] Implement `send`, `cancel`, and `retry` command creation helpers
- [x] Implement runtime command claiming and status transitions
- [x] Add a server endpoint for OpenRouter-backed streaming
- [x] Stream assistant output back into TinyBase message records
- [x] Surface session state, command state, and runtime errors in the UI
- [x] Exercise refresh, cancel, retry, and duplicate-protection behavior
- [x] Record implementation friction and evaluation notes back into this plan

### Prototype Evaluation Notes

Observed in the working prototype on 2026-03-15:

- The end-to-end loop is working: `send`, `retry`, and `cancel` all run through TinyBase command rows, the runtime claims and updates those rows, OpenRouter streams through the AI SDK route, and reload restores sessions/messages from IndexedDB.
- The two-store split is workable in practice. `config` and `runtime` feel meaningfully different in code and persistence behavior without adding much ceremony at this size.
- Whole-message storage is acceptable for the initial slice. It kept the runtime simple and matched AI SDK message flow cleanly. We do not yet have enough data to say it will remain acceptable for very long streams or tool-heavy conversations.
- TinyBase reactivity is a good fit for the message timeline and side panels. The UI can stay mostly declarative and read directly from store cells, indexes, and values without adding another client-state layer.

Implementation friction worth carrying into the next slice:

- TinyBase index definitions are easy to mis-specify. Using a constant slice ID like `'all'` must be done with a function (`() => 'all'`), not a string literal, or the index silently stays empty. That broke session ordering, command visibility, and runtime command processing until diagnosed.
- Inspecting persisted TinyBase state in IndexedDB is not ergonomic by default. The data is stored in TinyBase's internal object-store shape, which is fine for persistence but makes manual debugging harder. Dev-only inspection helpers would help a lot.
- Cancelation needed explicit post-stream abort handling. Aborting after a request started but before text arrived could otherwise leave an empty assistant placeholder and incorrectly mark the send as complete.
- Retry works better when treated as message replacement rather than append-then-delete. Preserving the original sequence position reduced ordering weirdness and made abort/error restoration more defensible.
- Recovery is intentionally conservative right now: reloading during `processing` marks work as interrupted and inspectable rather than attempting stream resumption. That is acceptable for the prototype, but it means the current runtime is recoverable for debugging, not resumable for production.

Provisional take:

- Keep the command-table runtime for the next slice.
- Keep the two-store split for the next slice.
- Keep whole-message storage for one more slice, but instrument persistence/write behavior before adding tools or longer-lived sessions.
- Add dev-oriented runtime diagnostics before expanding scope.

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
