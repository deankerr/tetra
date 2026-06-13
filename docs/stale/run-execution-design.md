# Run Execution Design

## Status

Exploratory. This document records the evolving design for run execution in Tetra's redesigned core.

The goal is not to freeze an API too early. The goal is to keep the important ideas visible while we test names, responsibilities, and boundaries in code.

## Why This Matters

Run execution is the core behavior of the app.

Tetra is a local-first chat app, but the main user experience is not just "store messages." It is:

- collect the current session state
- prepare model input
- execute an AI SDK stream
- expose live assistant state while streaming
- persist durable run/message state
- account for model steps and usage
- support cancellation, recovery, tools, and future customization

If this shape is wrong, everything else bends around it: CLI, web, integration tests, run history, tool configuration, and later transcription/customization flows.

## Current Direction

The working direction is:

- `Runs` is the manager and registry.
- `Run` is the per-run execution object.
- `Run` exists to enhance our use of the AI SDK `streamText` function.
- TinyBase remains the durable source of truth.
- Live run state can exist outside TinyBase while a run is in progress.
- The AI SDK should stay visible. We are not trying to hide it behind a generic LLM abstraction.

This suggests that `Run` should be the centerpiece of run execution, not a thin wrapper hidden behind callbacks.

## Terms

### Run

A single model-producing action applied to a session.

A `Run` should know its run id, assistant message id, abort controller, current status, live parts, final parts, steps, error, and AI SDK stream result.

It is the handle a frontend or CLI can observe, cancel, and await.

### Runs

The manager for active and recovered runs.

`Runs` owns shared dependencies such as accessors, credentials, provider factories, tool registry access, and active run lookup.

It creates `Run` instances and answers questions like:

- which run owns this run id?
- which run owns this assistant message id?
- is there an active run for this session?
- cancel this run
- recover interrupted run rows

### Pre-Run

The preparation phase before streaming starts.

This is expected to become one of the most complex parts of the app. It may include:

- merging session config with execution overrides
- validating credentials
- resolving provider/model
- resolving system prompt
- selecting transcript window
- converting `Rows.Message[]` to AI SDK `ModelMessage[]`
- resolving tools
- applying future transcription or prompt customization
- creating durable user message, assistant placeholder, and run row

Pre-run should be designed as a phase of run execution, not hidden as incidental setup.

### Stream

The phase that calls `streamText`, consumes the AI SDK stream, updates live parts, records steps, and reaches a terminal state.

## What We Tried

### Existing Core: `createRunner`

The existing `@tetra/core` runner works, but it mixes many responsibilities:

- run row creation
- user and assistant message creation
- credential validation
- OpenRouter provider creation
- transcript collection
- system prompt lookup
- tool resolution
- `streamText` execution
- UI message snapshot assembly
- durable assistant message writes
- step accounting
- cancellation
- recovery

This made the first prototype simple, but it makes testing and future customization harder.

### First Redesign Sketch: `Execute` + `Runner` + `Runs`

The first redesign pass split the work into:

- `Execute`: prepare a run
- `Runner`: call `streamText`
- `Runs`: bridge live state, durable writes, cancellation, and active tracking

This was useful because it exposed the phases. It also exposed too many half-concepts:

- `Execute` was mostly a large private function for `Runs`.
- `Runner` did not have enough identity to justify existing.
- `PreparedRun`, `RunnerInput`, `ActiveRun`, and `RunHandle` were different names for pieces of the same thing.
- `finalParts` and the AI SDK result were hidden local variables.

The lesson: the missing concept is not a separate runner function. The missing concept is a real per-run `Run`.

## Important Questions

### Why should `finalParts` be inaccessible?

It probably should not be.

The final assistant parts are one of the main products of a run. In the current sketch, they are a local variable inside stream consumption and only escape through a callback. That is a sign that `Run` is not yet a real object.

A `Run` could expose:

```ts
class Run extends EventTarget {
  parts: UIMessage['parts'] = []
  finalParts: UIMessage['parts'] | null = null
}
```

`parts` is the live current snapshot. `finalParts` becomes non-null when the stream completes.

### Why should the AI SDK result be inaccessible?

It also probably should not be completely inaccessible.

The AI SDK `streamText` result contains useful information:

- `text`
- `content`
- `usage`
- `totalUsage`
- `steps`
- `response`
- `providerMetadata`
- `textStream`
- `fullStream`
- `toUIMessageStream`
- `consumeStream`

However, many of those properties consume the stream. If outside code reads them casually, it can compete with the `Run`'s own stream consumption.

So a public result is reasonable, but with a clear convention:

```ts
class Run extends EventTarget {
  result: StreamTextResult<any, any> | null = null
}
```

`Run` owns stream consumption. The public result exists for advanced inspection and integration tests, not as the normal app rendering surface.

### Should `Run` extend `EventTarget`?

Probably yes, but this should stay open until we try it.

The fit is strong:

- web can subscribe to `snapshot`, `step`, `status`, and `finish`
- CLI can subscribe to `snapshot` and await `done`
- tests can collect lifecycle events
- cancellation already maps naturally to `AbortController`
- `Run` has real mutable lifecycle state

The concern is TypeScript ergonomics. Native `EventTarget` is weakly typed. We may want typed event classes or a small typed helper.

The important distinction: individual `Run` objects emit lifecycle events. `Runs` is a registry, not the main event source.

## Desired Shape

An approximate consumer shape:

```ts
const run = await runs.execute(sessionId, {
  content,
  config,
})

run.addEventListener('snapshot', () => {
  render(run.parts)
})

await run.done
```

CLI could use:

```ts
const run = await runs.execute(sessionId, {
  content,
})

run.addEventListener('snapshot', () => {
  printDelta(run.parts)
})

await run.done
```

Or, if callback ergonomics remain useful:

```ts
const run = await runs.execute(sessionId, {
  content,
  onSnapshot: (message) => printDelta(message.parts),
})

await run.done
```

The callback form should be convenience only. The core shape is that `Run` is observable.

## Candidate API

```ts
class Runs {
  sendMessage(sessionId: string, args: SendMessageArgs): Run
  regenerate(assistantMessageId: string, args?: RegenerateArgs): Run
  start(args: RunStart): Run
  cancel(runId: string): void
  get(runId: string): Run | null
  getByAssistantMessage(messageId: string): Run | null
  getBySession(sessionId: string): Run | null
  recover(): void
}
```

```ts
class Run extends EventTarget {
  readonly runId: string
  readonly assistantMessageId: string
  readonly abortController: AbortController
  readonly done: Promise<void>

  result: StreamTextResult<any, any> | null
  status: 'preparing' | 'streaming' | 'completed' | 'error' | 'cancelled'
  parts: UIMessage['parts']
  finalParts: UIMessage['parts'] | null
  error: unknown

  start(): void
  cancel(): void
}
```

This is only a sketch. The exact status names and promise behavior are still open.

## Lifecycle Sketch

```txt
runs.execute(sessionId, args)
  create Run
  register active Run
  run.start()
  return Run

run.start()
  set status: preparing
  prepare durable state and model input
  set status: streaming
  result = streamText(...)
  consume UI message stream
    update parts
    emit snapshot
    write throttled durable assistant parts
  write final assistant parts
  complete run
  set status: completed
  emit finish
```

Error and cancellation:

```txt
pre-run error
  mark durable run error if run row exists
  set run.error
  set status: error
  reject or resolve done? still undecided

stream error
  mark run error
  set run.error
  set status: error

cancel
  abort controller
  mark run cancelled
  set status: cancelled
```

## Durable State Rules

TinyBase is still the durable state layer.

During a run:

- user message should exist durably before streaming starts
- assistant placeholder should exist durably before streaming starts
- run row should exist durably before streaming starts
- stream-time parts are persisted to the target message row
- completed model-call accounting is persisted to `steps`
- run status determines whether target message parts are provisional or terminal
- run rows stay focused on lifecycle/config/status
- usage totals are derived from step rows at the read sites that need them
- terminal status must always be written for completed, failed, and cancelled runs

Open question: whether the run row should begin as `preparing` instead of `streaming`.

## Watchlist

These are not bugs yet; they are design pressure to revisit when long sessions or richer editing make them visible.

- Streaming snapshots now update the target message row directly. Keep this explicit in UI semantics as editing/retry behavior grows.
- Cancelled/error assistant messages currently keep partial generation content in the transcript.
- Session-level usage currently derives from `stepsBySession`. Add stored summaries only if session sizes make that visibly expensive.

## Failure Boundary

Pre-run is fallible. This must be explicit.

Things that can fail before streaming:

- missing credentials
- invalid config
- missing system prompt
- transcript conversion
- tool resolution
- provider/model construction

The design should avoid stranding durable rows in `streaming`.

Possible approaches:

1. Do all fallible preparation before creating durable rows.
2. Create durable rows early, but have `Run` own failure cleanup immediately after creation.
3. Add run status `preparing`, then transition to `streaming` only once `streamText` starts.

The likely answer is either 2 or 3, because frontends benefit from immediate durable rows.

## Promise Semantics

The old CLI waited for run terminal status and threw on error or cancellation.

A `Run.done` promise could mean one of two things:

1. resolves when the run reaches any terminal state
2. resolves on completion, rejects on error/cancellation

The web app may prefer 1. The CLI may prefer 2.

Possible design:

```ts
run.finished // resolves for any terminal state
run.completed // resolves only on success, rejects otherwise
```

Or keep one `done` promise and make callers inspect `run.status`.

This should be decided deliberately.

## Frontend Implications

The current web app has `StreamingState` because durable writes are throttled but UI wants every snapshot.

With real `Run` objects:

- `StreamingState` may disappear.
- React hooks can overlay `run.parts` onto TinyBase rows while a run is active.
- message components should remain dumb.
- composer should start/cancel runs, not manage assistant snapshot bookkeeping.

Likely web shape:

```txt
composer
  calls runs.execute()
  calls run.cancel() or runs.cancel(runId)

api hooks
  read TinyBase rows
  overlay active Run state when available

message components
  render the best current message
```

## Testing Implications

Integration-style tests should use:

- real TinyBase store
- real accessors/modules
- real AI SDK `streamText`
- mocked provider model
- real `Run` lifecycle

Tests should be able to assert:

- durable user message
- durable assistant placeholder
- live `run.parts`
- final `run.finalParts`
- run status
- step rows
- AI SDK result details where useful
- cancellation and recovery behavior

The design should not require mocking `streamText`.

## Open Design Questions

- How much workflow logic belongs on `Runs` before we split send/regenerate into smaller modules?
- Does `Run.done` reject on error/cancellation?
- How much of the raw AI SDK `StreamTextResult` should be public?
- Should `Run` extend native `EventTarget`, or use a typed event helper?
- Should provider construction live in `Runs`, `Run`, or a small provider factory?
- What is the minimum API that both CLI and web can share without either feeling contorted?

## Near-Term Experiment

Replace the current `Execute` plus `Runner` plus `RunHandle` sketch with:

- `src/runs.ts` for workflow-level send/regenerate/start orchestration
- `src/run.ts` for the per-run `streamText` execution object

Move step parsing to top level until a more durable folder structure emerges.

The code should force these questions into the open:

- what state naturally belongs on `Run`?
- what needs to be durable immediately?
- what should be observable live?
- what does CLI need that web does not?
- what does web need that CLI does not?
