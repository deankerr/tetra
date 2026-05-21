# Integration Testing Strategy

## Context

Tetra's highest-value behavior is the integration between TinyBase rows, synchronous modules, request lifecycle, tools, and AI SDK streaming.

The redesigned core puts us in a good position: tests can use the same `Accessors`, modules, `Runs`, and `Run` objects as the web app and CLI. We should replace only remote provider/model resolution, then let the rest of the system run for real.

## Test Boundary

Use the real pieces:

- `createTetraDb`
- `createCoreModules`
- `Accessors`
- `Sessions`, `Prompts`, `Transcripts`, and `Catalog` where relevant
- `Runs` and live `Run` instances
- TinyBase rows, values, and indexes
- AI SDK `streamText`
- AI SDK `readUIMessageStream`
- AI SDK `convertToModelMessages`
- AI SDK `tool`

Replace only model resolution:

- `MockLanguageModelV3` from `ai/test`
- optionally `MockProviderV3` from `ai/test`
- `simulateReadableStream` from `ai`

This is the line that keeps the tests integration-style without making network calls.

## Test Runtime Helper

After the model resolver seam exists, add a small test helper in `packages/core-redesign`.

It should create:

- an in-memory `createTetraDb`
- `createCoreModules(db)`
- a `MockLanguageModelV3`
- a `Runs` instance wired to the mock model resolver
- a memory `CredentialReader`

It may expose convenience helpers like `waitForRun(run)`, but it should not hide assertions. Tests should still read rows through accessors or TinyBase where that makes the contract clearer.

## Stream Fixtures

Use AI SDK provider-level stream parts, not UI message chunks.

Simple text response:

```ts
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'

const model = new MockLanguageModelV3({
  doStream: {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'hello' },
        { type: 'text-delta', id: 'text-1', delta: ' world' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: {
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
          },
        },
      ],
      chunkDelayInMs: null,
      initialDelayInMs: null,
    }),
  },
})
```

Tool calls should use provider-level tool-call parts with stringified JSON input. The AI SDK should execute the real `tool()` definitions and feed results into the next model step.

## Known MockLanguageModelV3 Gotchas

### Array form has an off-by-one

When `doStream` is an array, `MockLanguageModelV3` indexes it with `this.doStreamCalls.length` **after** pushing the current call, so the first call returns `doStream[1]` (not `doStream[0]`), and index 0 is never returned.

Always use the function form for multi-step scenarios (tool loops, error recovery):

```ts
let callCount = 0
const model = new MockLanguageModelV3({
  doStream: async () => {
    const call = callCount
    callCount += 1
    return { stream: simulateReadableStream({ chunks: call === 0 ? firstChunks : secondChunks }) }
  },
})
```

### `require-await` lint conflict

`doStream` must return `PromiseLike<LanguageModelV3StreamResult>`, so the function must be `async`. When the body has no `await` (just a synchronous return or throw), oxlint raises `require-await`. Suppress it inline with the reason:

```ts
// eslint-disable-next-line require-await -- async required to satisfy PromiseLike<LanguageModelV3StreamResult> return type
doStream: async () => { ... }
```

### Error propagation requires `terminateOnError`

`readUIMessageStream` silently swallows stream errors by default — it calls `onError` but does not throw, so `for await` exits normally and `complete()` is called instead of `fail()`. Pass `terminateOnError: true` in `run.ts` to make the async iterator throw on error parts, which falls into the outer `catch` → `fail()` path.

## First Test Cases

### Request Happy Path

Exercise:

- create a session
- call `runs.sendMessage`
- stream a simple assistant response
- wait for `run.done`

Assert:

- user message row exists with the submitted text part
- assistant message row exists with final text parts
- request status moves through `preparing` / `streaming` / `completed`
- request config is the run snapshot
- `run.finalParts` matches the durable assistant message parts
- mock model received converted model messages

### Pre-Run Invariants

Exercise:

- configure a session with a missing `systemPromptId`
- call `runs.sendMessage`

Assert:

- the call throws before creating user, assistant, or request rows
- the session is not touched as a side effect of the failed run

### History Reconstruction

Exercise:

- create prior user and assistant messages
- call `runs.sendMessage` again

Assert:

- mock model prompt includes prior durable messages
- current assistant placeholder is excluded
- `maxMessages` limits history at the execution boundary

### Regenerate

Exercise:

- create or import a completed assistant message
- call `runs.regenerate(assistantMessageId)`

Assert:

- no new user message is created
- target assistant message is cleared before streaming
- request row points at the same assistant message
- final parts replace the previous assistant parts

### Tool Loop

Exercise:

- enable a real tool
- first model step emits a tool call
- second model step emits final text

Assert:

- tool output appears in final assistant parts
- mock model was streamed more than once as required by the AI SDK tool loop
- later model input includes the assistant tool call and tool result
- request status is `completed`

### Step Accounting

Exercise:

- stream provider usage and OpenRouter-shaped raw usage

Assert:

- `requests.steps` has one entry per completed model step
- token fields are parsed from normalized SDK usage
- cost fields are parsed from raw provider usage
- no separate steps table exists

### Error Path

Exercise:

- provider stream throws

Assert:

- request status is `error`
- `errorMessage` is stored
- `run.error` is set
- later requests can still run

### Cancellation

Exercise:

- stream slowly with `simulateReadableStream`
- call `runs.cancel(requestId)` while streaming

Assert:

- request status is `cancelled`
- request has `terminalAt`
- `run.status` is `cancelled`
- no stale live overlay remains after the run becomes terminal

### Recovery

Exercise:

- create request rows with `preparing` and `streaming`
- call `runs.recover()`

Assert:

- interrupted requests become terminal errors
- error text explains interruption or restart
- completed requests are untouched

## React Scope

React should stay thin.

Core tests prove run behavior, durable rows, snapshots, cancellation, and recovery. Later frontend tests can check that hooks subscribe to `Run` events and fall back to TinyBase rows once terminal, but they should not retest AI SDK streaming.

## What Not To Mock

- Do not mock TinyBase.
- Do not mock `streamText`.
- Do not mock `readUIMessageStream`.
- Do not mock `convertToModelMessages`.
- Do not mock `tool()` execution.
- Do not mock accessors or modules.

Mocking those would make tests cheaper, but it would erase the behavior we are trying to trust.

## Check Command

Use the repository check path after implementation:

```bash
bun run fix
```

Focused Bun test commands are fine during iteration, but `bun run fix` remains the project-level gate.
