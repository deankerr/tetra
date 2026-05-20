# Integration Testing Strategy

## Context

Tetra's most valuable behavior lives in the integration between TinyBase, sessions, requests, tools, and AI SDK streams. Unit tests around isolated helpers would miss the bugs most likely to matter: bad history reconstruction, wrong request state transitions, dropped tool results, and mismatch between live snapshots and persisted assistant parts.

The strategy is to test core behavior through actual public modules while replacing only the remote provider.

## Test Boundary

Use the real pieces:

- `createTetraStore`
- `createSessions`
- `createRunner`
- TinyBase indexes and rows
- AI SDK `streamText`
- AI SDK `readUIMessageStream`
- AI SDK `convertToModelMessages`
- AI SDK `tool`

Replace only the provider adapter:

- `MockLanguageModelV3` from `ai/test`
- `simulateReadableStream` from `ai`
- optional `MockProviderV3` when model lookup behavior matters

This keeps tests integration-style without network calls.

## Test Runtime

Create a small test runtime helper after the core structure settles.

It should:

- create an in-memory Tetra store
- create sessions/prompts/workspace modules
- create a runner with the test inference adapter
- expose the mock language model for inspecting provider calls
- expose a helper that waits for a request to leave `streaming`

The helper should not hide assertions. Tests should still read rows and messages directly enough to document the contract.

## Stream Fixtures

Use AI SDK provider-level stream parts, not UI message chunks.

Simple text response:

```ts
simulateReadableStream({
  chunks: [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'hello' },
    { type: 'text-delta', id: 'text-1', delta: ' world' },
    { type: 'text-end', id: 'text-1' },
    {
      type: 'finish',
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    },
  ],
})
```

Tool calls should use provider-level `tool-call` parts with stringified JSON input. The AI SDK will execute the real `tool()` definition and feed the tool result into the next model step.

## First Test Cases

### Request Happy Path

Exercise:

- create a session
- execute a request
- stream a simple assistant response
- wait for terminal request status

Assert:

- user message row exists with text part
- assistant message row exists with final text part
- request status is `completed`
- request config is the execution snapshot
- mock model received the converted user message

### History Reconstruction

Exercise:

- import or create prior user/assistant messages
- execute another request

Assert:

- mock model prompt includes prior durable `UIMessage` parts converted to model messages
- current assistant placeholder is excluded
- `maxMessages` limits history at the execution boundary

### Tool Loop

Exercise:

- enable a real tool
- first model step emits a tool call
- second model step emits final text

Assert:

- tool output appears in final assistant parts
- mock model was called twice
- second prompt contains the assistant tool call and tool result
- request status is `completed`

### Step Accounting

Exercise:

- stream provider usage and OpenRouter-shaped raw usage

Assert:

- `requests.steps` has one entry per completed model step
- token fields are parsed from normalised SDK usage
- cost fields are parsed from raw provider usage
- no separate steps table is involved

### Error Path

Exercise:

- provider stream emits or throws an error

Assert:

- request status is `error`
- error message is stored
- controller is cleaned up enough that later requests can run

### Cancellation

Exercise:

- stream slowly with `simulateReadableStream`
- call `runner.cancel(requestId)` while streaming

Assert:

- request status is `cancelled`
- terminal row has `completedAt`
- no further snapshots are applied after cancellation

### Recovery

Exercise:

- create a request row with status `streaming`
- call `runner.recover()`

Assert:

- interrupted request is marked `error`
- error text explains process restart

## React Scope

React is secondary for now. Core tests should prove that persisted rows and live snapshots are correct. Later UI tests can be thin:

- composer calls `runner.execute`
- live `StreamingState` snapshots render before persistence
- clearing `StreamingState` falls back to TinyBase message parts
- cancel button calls `runner.cancel`

These should not retest the AI SDK stream loop.

## What Not To Mock

- Do not mock TinyBase.
- Do not mock `streamText`.
- Do not mock `readUIMessageStream`.
- Do not mock `convertToModelMessages`.
- Do not mock `tool()` execution.

Mocking those would make tests cheaper but would also remove the behavior we most need to trust.

## Check Command

Use the repository check path after implementation:

```bash
bun run fix
```

For focused iteration, individual Bun tests are fine while developing, but `bun run fix` is the project-level gate.
