# Core Restructure Proposal

## Context

Tetra's core is intentionally small: TinyBase is the durable state layer, the AI SDK is the inference runtime, and callers issue commands through runtime modules while reading reactive state from TinyBase.

The next integration-test pass should exercise those real modules instead of forcing tests through incidental implementation details. This proposal captures candidate refactors to make that possible before tests harden the current shape.

## Goals

- Keep TinyBase as the only durable store.
- Keep AI SDK types and functions visible in inference code.
- Make OpenRouter replaceable in tests without mocking the AI SDK.
- Give request lifecycle rules one home.
- Keep prototype-mode bias: fewer abstractions, easy deletion, no compatibility shims.

## Non-Goals

- Do not introduce a separate `steps` table. Step accounting stays embedded in `requests.steps`.
- Do not wrap the AI SDK behind a generic LLM abstraction.
- Do not add migrations or compatibility layers for old local data.
- Do not move React concerns into `@tetra/core`.

## Current Friction

`createRunner` currently owns several concerns at once:

- request setup and terminal status writes
- OpenRouter credential validation and model construction
- history assembly through `sessions.gatherModelMessages`
- tool resolution
- AI SDK `streamText` execution
- UI message snapshot assembly
- step accounting writes
- cancellation and recovery

This is workable for the prototype, but awkward for integration tests. The desired tests should use a real TinyBase store, real session APIs, real AI SDK streaming, and a mocked provider model. Today the provider model is constructed inside the runner, so tests either need to fake credentials and network-shaped behavior or edit around the runner.

## Proposed Shape

### 1. Inference Adapter

Add a small inference adapter seam that owns provider-specific model construction.

Production adapter:

- reads `OPENROUTER_API_KEY`
- fails fast if it is missing
- creates the OpenRouter provider
- returns `openrouter(config.modelId)`
- applies OpenRouter-specific `providerOptions` shape

Test adapter:

- returns an `ai/test` `MockLanguageModelV3`
- records provider call inputs through the mock model
- emits `LanguageModelV3StreamPart` streams with `simulateReadableStream`

The runner should still call `streamText`, `readUIMessageStream`, `stepCountIs`, and `toUIMessageStream` directly. The adapter is for provider selection, not for hiding the AI SDK.

### 2. Request Lifecycle Module

Create a module that owns request row transitions.

Candidate operations:

- begin a request from a session, user message, assistant placeholder, and config snapshot
- append a parsed `StepRecord`
- complete a request after final assistant parts are written
- fail or cancel a request
- recover interrupted requests on startup
- read active/latest request helpers if they prove useful outside React

This module should own the invariant that `requests.steps` is embedded accounting only. It should not know how to call the model.

### 3. Runtime Factory

Add a small core runtime factory for the in-memory graph:

- `createTetraStore`
- `createSessions`
- `createPrompts`
- `createWorkspaceState`
- `createCatalog`
- `createRunner`

CLI and web bootstraps would still attach their own persistence and environment-specific behavior. Tests would use the same runtime factory with the test inference adapter.

This is optional for the first pass, but it removes duplicated wiring in the CLI, web app, and future tests.

### 4. Catalog Fetch Adapter

`createCatalog` currently calls global `fetch` and `Date.now()`. If catalog tests become important, pass a tiny environment object into the catalog:

- `fetch`
- `now`

This is less urgent than runner testability because catalog behavior is narrower and can be tested later without affecting inference tests.

## Open Questions

- Should the OpenRouter credential check live in the production inference adapter or stay in runner before adapter selection?
- Should request lifecycle own user/assistant message creation, or should it accept already-created message IDs from `Sessions`?
- Should the runtime factory include catalog refresh behavior, or only object construction?
- Do we want deterministic IDs and clocks in integration tests now, or are structural assertions enough?

## Suggested Order

1. Add the inference adapter seam.
2. Move request lifecycle writes behind a request module.
3. Add the first core integration test using `MockLanguageModelV3`.
4. Add a runtime factory only if test setup or app bootstraps start duplicating too much.
5. Add catalog fetch/clock injection when catalog tests need it.

## Success Criteria

- Production behavior remains unchanged.
- Tests can drive `runner.execute()` with real TinyBase and real AI SDK streaming.
- No test mocks `streamText`, `readUIMessageStream`, `convertToModelMessages`, or TinyBase.
- Request status, assistant parts, and `requests.steps` can be asserted through public core APIs or TinyBase rows.
- The new modules make code easier to delete or move, not harder.
