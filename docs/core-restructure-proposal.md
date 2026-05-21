# Core Redesign Position

## Context

This document started as a restructure proposal. It is now a checkpoint for why the redesign exists and how it should keep moving toward integration-style testing.

The goal was not to preserve the first proposed layout. The goal was to make core easier to exercise as a real backend: TinyBase rows and indexes, domain modules, request/run lifecycle, tools, and AI SDK streaming should work together in tests the same way they work in the web app and CLI.

## What Changed

The redesign moved core away from a large runner function and toward a smaller set of explicit runtime objects:

- `Accessors` make TinyBase safe and ergonomic without hiding that TinyBase is the durable store.
- `Sessions`, `Prompts`, and `Transcripts` are synchronous query/mutation modules over domain rows.
- `Catalog` already has a replaceable `CatalogSource`, which makes network-free catalog tests straightforward.
- `Runs` owns user-facing run commands such as `sendMessage`, `regenerate`, `cancel`, and recovery.
- `Run` owns one AI SDK `streamText` execution and exposes live state through public properties plus `EventTarget` events.
- Request rows now represent durable run attempts with `preparing`, `streaming`, terminal statuses, embedded `steps`, and `terminalAt`.

That gives integration tests a much better target than the old `createRunner` shape. Tests can create a real core runtime, call `runs.sendMessage`, watch a live `Run`, and assert durable TinyBase rows.

## Current Shape

The useful boundary is now:

```ts
const core = createCoreModules()
const runs = new Runs(core.accessors, credentials)

const sessionId = core.sessions.create()
const run = runs.sendMessage(sessionId, { content: 'hello' })

await run.done
```

This is close to what we want. It uses the same modules as the apps, with no React and no persister required.

## Remaining Testability Gap

`Run` still constructs the production OpenRouter model internally. That is now the main blocker.

The test should not mock `streamText`, `readUIMessageStream`, `convertToModelMessages`, TinyBase, or our accessors. It should replace only the remote provider/model. The AI SDK supports this with `MockLanguageModelV3` and provider-level stream parts.

So the next core change should be a small model resolution seam, not a generic LLM abstraction.

## Proposed Seam

Add a `LanguageModelResolver` shape near `Run`:

```ts
interface LanguageModelResolver {
  resolve(args: { config: RequestConfig; credentials: CredentialReader }): LanguageModel
}
```

Production resolver:

- reads `OPENROUTER_API_KEY`
- fails fast when it is missing
- creates the OpenRouter provider
- returns `openrouter(config.modelId)`

Test resolver:

- returns an `ai/test` `MockLanguageModelV3`
- lets the test inspect `doStreamCalls`
- emits provider-level stream parts through `simulateReadableStream`

`Run` should still call AI SDK functions directly. The resolver is only about selecting the `LanguageModel`.

## Why This Is Enough

Most other seams already exist naturally:

- TinyBase persistence is optional; tests can use an in-memory `createTetraDb`.
- Query/mutation APIs are synchronous, so setup assertions are simple.
- Catalog already accepts a source.
- Credentials can already be represented by a tiny `CredentialReader`.
- Request recovery is a `Runs` method over durable request rows.
- Live streaming state is on the `Run` instance rather than a separate frontend store.

The design pressure should stay here: make production dependencies swappable at the boundary, while keeping core behavior real.

## Not Goals

- Do not add a separate `steps` table.
- Do not wrap the AI SDK behind a broad custom inference abstraction.
- Do not mock TinyBase or AI SDK orchestration functions.
- Do not introduce migrations or compatibility shims.
- Do not move React hooks or frontend subscription mechanics into core.

## Suggested Next Steps

1. Add the `LanguageModelResolver` seam to `Run` / `Runs`.
2. Add a tiny core test runtime helper that creates `core`, `runs`, a mock model, and a memory credential reader.
3. Write the first request happy-path integration test.
4. Add history reconstruction and request lifecycle tests.
5. Add tool-loop and cancellation tests once the basic stream fixture feels solid.

## Success Criteria

- Tests drive `Runs` and `Run`, not private helpers.
- Tests assert both live `Run` state and durable TinyBase rows.
- Tests use real AI SDK `streamText`, `readUIMessageStream`, `convertToModelMessages`, and tool execution.
- The only replaced production dependency is remote model resolution.
- The same core runtime shape serves web, CLI, and tests.
