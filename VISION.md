# Tetra

LLM chat app for power users. Local-first, composable, built on TinyBase.

## Purpose

Evaluate and prove TinyBase as the reactive data layer for an agent runtime — not just a chat UI, but foundations that grow into composable prompt management, tool use, and sub-agent delegation.

## Core Principle

TinyBase is the synchronization boundary between the UI and the runtime.

```
React UI  ◄──reads/writes──►  TinyBase Store  ◄──reads/writes──►  Runtime
```

React and the runtime never call each other. Both read from and write to TinyBase. React observes state reactively via hooks. The runtime manages async work independently.

This is a decoupling strategy:

- Streams survive navigation, unmounts, and remounts
- Switching conversations does not kill active requests
- The UI shows whatever state is in the store when it mounts — no handshake needed
- The runtime can move to a service worker or remote server without changing the UI contract

**The key test:** Start a stream in session A. Switch to session B. Switch back. The stream is still running. Cancel it. This works because React never held the stream — TinyBase did.

## Feature Layers

### Layer 0: Data Foundation

Schema, typed data access, codecs, persistence, reactive hooks, indexes.

### Layer 1: Chat Runtime

Session lifecycle, streaming, cancel, retry. Request-based signaling between UI and runtime.

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
/retry            — regenerate last response
/cancel           — abort active request
/model sonnet     — switch model
/agent <name>     — switch agent
/clear            — clear history
/export           — export session/agent
```

Command palette (Cmd+K) surfaces the same actions plus navigation.
