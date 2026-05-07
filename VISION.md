# Tetra

LLM chat app for power users. Local-first, composable, built on TinyBase.

## Purpose

Evaluate and prove TinyBase as the reactive data layer for an agent runtime — not just a chat UI, but foundations that grow into composable prompt management, tool use, and sub-agent delegation.

## Core Principle

TinyBase is the durable reactive state between consumers and the runtime.

```
Consumer actions  ──►  Runtime  ──►  Inference
Consumer reads    ◄──  TinyBase  ◄──  Runtime writes
```

Consumers call runtime commands for user intentions and read from TinyBase for reactive state. The runtime has no React dependency. The inference adapter has no TinyBase dependency. The web app persists the core store to OPFS.

This is a decoupling strategy:

- Streams survive navigation, unmounts, and remounts
- Switching conversations does not kill active requests
- The consumer shows whatever state is in the store when it reads — no handshake needed
- Inference remains outside the React lifecycle

**The key test:** Start a stream in session A. Switch to session B. Switch back. The stream is still running. This works because the consumer never held the stream — TinyBase did.

## Feature Layers

### Layer 0: Data Foundation

Schema, typed data access, codecs, persistence, reactive hooks, indexes.

### Layer 1: Chat Runtime

Session lifecycle, streaming, and manual transcript editing. A session is an editable conversation record, not only the byproduct of provider calls. Users can add or adjust messages without starting inference, preserving the distinction between transcript state and AI execution.

### Layer 2: Agent Configuration

Multiple agents with independent lifecycle. Agent CRUD, custom inference parameters, agent selection at session creation. Requests snapshot agent config for historical comparison.

### Layer 3: Composable Prompt Management

Reusable prompt fragments, assembly, preview. Bridge from chat app to context engineering tool.

### Layer 4: Tool System

Tool registry, execution loop, result rendering. AI SDK tool calling.

### Layer 5: Sub-Agents

Sessions spawn sub-sessions via tools. An agent can delegate work to another agent — blocking or async. No new infrastructure required: it falls out naturally from sessions, agents, and tools as generic primitives. See `reference/sub-agents.md`.

### Layer 6: Image/File Support

Image/file input and output.

## Interaction Model

Power-user-first. Slash commands and command palette as primary interaction surfaces.

```
/new              — create session
/model sonnet     — switch model
/agent <name>     — switch agent
/clear            — clear history
/export           — export session/agent
```

Command palette (Cmd+K) surfaces the same actions plus navigation.
