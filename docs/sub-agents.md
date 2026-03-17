# Sub-Agents

Sub-agents are not a separate system. They're an emergent capability of sessions, commands, and tools — the same primitives used for user conversations.

## Core Idea

An agent can spawn another agent by calling a tool. The tool handler creates a sub-session with a different agent config. The runtime processes it identically to a user-initiated session. The result flows back as a tool result.

The existing analog: Claude Code's `Agent` tool. It spawns a sub-agent with a prompt, runs it in its own context, returns the result. The `run_in_background` parameter controls blocking vs async. Tetra's version is the same pattern over the session/command infrastructure.

## Example: Seer (Vision)

Not all LLMs support images. A user sends an image with a question to ChatAgent (running a text-only model). ChatAgent can't see the image, but it has a `spawn_agent` tool.

1. ChatAgent calls `spawn_agent(type='seer', prompt='Describe this diagram...', image='...', blocking=true)`
2. Tool handler writes a `new-session` command with SeerAgent config (a multimodal model like Gemini) and the prompt as the initial "user" message
3. Runtime picks up the command, creates a sub-session, runs inference
4. SeerAgent responds with a description
5. Runtime writes the response as the tool result for ChatAgent's pending tool call
6. ChatAgent uses the description to answer the user's question

**Follow-ups reuse the session.** If ChatAgent needs clarification, it calls `spawn_agent` targeting the existing sub-session. SeerAgent has full context of prior exchanges — no rebuilding. The user can also view this conversation directly.

SeerAgent is just another agent with a narrow purpose and a prepared system prompt. No extra tools or data it doesn't need.

## Example: Research (Async)

A ResearchAgent has web search/fetch tools and can perform long-running research.

1. ChatAgent calls `spawn_agent(type='researcher', prompt='Find recent benchmarks for...', blocking=false)`
2. Tool handler creates the sub-session and returns a handle ID immediately
3. ChatAgent tells the user "I've started researching, I'll let you know when it's done" and continues the conversation
4. ResearchAgent runs independently — searching, fetching, synthesizing — potentially for minutes
5. When the sub-session completes (status → `idle`), the runtime notifies ChatAgent's session
6. ChatAgent receives the results and presents them to the user

ChatAgent is free to talk to the user or do other work while waiting. The runtime already handles concurrent sessions.

## Mechanics

**`spawn_agent` tool shape:**
```
spawn_agent(
  type: string,        — agent config to use (e.g. 'seer', 'researcher')
  prompt: string,      — initial message to the sub-agent
  blocking: boolean,   — wait for result vs return handle
  ...args              — tool-specific data (images, files, etc.)
)
```

**Session linkage:** Sub-sessions have a `parentSessionId` field. Null = user-initiated, non-null = sub-session. UI filters on this to keep the conversation list clean.

**Result flow:** Sub-session completion triggers a write to the parent session's pending tool call. For blocking calls, the parent waits. For non-blocking, the result is injected when ready.

**No new infrastructure.** The runtime already manages concurrent sessions, processes commands reactively, and tracks session status. The only additions are:
- A `spawn_agent` tool handler that writes commands
- A `parentSessionId` field on sessions
- A listener that bridges sub-session completion → parent tool result

## Why This Matters for Design

This pattern doesn't require advance planning in the data model — it falls out naturally from keeping sessions, commands, and tools as generic primitives. A system designed around "user sends message, LLM responds" would need significant rework to support this. A system designed around "sessions have agents, agents have tools, tools can create sessions" supports it as an extension.

The key design constraints this implies:
- Sessions are not coupled to "a user is chatting" — they're a context for an agent to operate in
- The runtime doesn't assume one active session — it manages many concurrently
- Tool execution is not synchronous-only — tools can create long-lived work
- Commands are the universal dispatch mechanism — UI and tools use the same interface
