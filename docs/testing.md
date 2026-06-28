# Testing Strategy

Tetra is still in prototype mode, so tests should protect the parts of the system that are expensive to rediscover, not freeze every temporary UI decision.

## Default Command

Run the project test suite with:

```sh
bun test
```

`bun run fix` remains the formatting and type-aware lint gate. It does not run tests.

## Test Buckets

Use `unit` tests for pure boundary logic: schema conversion, small formatters, request shaping, and data reducers.

Use `module` tests for one package composed with its real in-memory dependencies. Most current `@tetra/core` tests are module tests: they use real TinyBase stores and assert transcript, run config, prompt, and runtime behavior.

Use `integration` tests when multiple app modules are wired like production and external services are mocked at their boundary. `packages/core/src/runtime/run.integration.test.ts` is the current example: real core modules, real TinyBase rows, mocked AI SDK streams.

CLI tests should usually be integration tests. The CLI is already a thin harness over local app state, so prefer running real Commander commands against fresh in-memory TinyBase stores instead of mocking `CliAppContext`.

## Prototype Coverage Line

Prefer tests for stable domain rules:

- TinyBase wrapper behavior, row-shape semantics, and defaults when they affect app behavior.
- Transcript tree invariants.
- Run lifecycle, prompt reconstruction, tool execution, and error states.
- CLI command boundaries that can mutate local data.
- External API request shaping.

Avoid concrete store-definition smoke tests for now. They can be considered later if schema wiring itself becomes a recurring failure point, but today they mostly duplicate `packages/tinybase-schema` and core module coverage.

Skip tests for churn-heavy UI layout or markup until a behavior has become stable or has already regressed once.

## React And Web Tests

There is no web test harness right now. The old `@tetra/web` Vitest script came from the TanStack Start template and did not exercise any app tests.

Do not add React tests by default. When a web behavior clearly deserves coverage, choose the smallest deliberate harness for that behavior:

- Extract pure logic or store-hook policy and test it with `bun:test` when possible.
- Add DOM-level React testing only when the behavior is truly component-owned.
- Use a browser-level test only for flows where route composition, focus, layout, or browser APIs are the thing being protected.

The bar for adding a web test is higher than the bar for adding core/package tests because the web surface is changing quickly.

## Organization

Keep tests next to the feature code they exercise. Avoid a shared test helper until at least two files need the same setup and the duplication is making the tests harder to read.

Use `.integration.test.ts` only when the test composes multiple modules around a realistic runtime boundary. Otherwise, plain `.test.ts` is enough.

## Mocking

Mock mechanisms only at true process or external-service boundaries. Capturing CLI stdout/stderr is fine; replacing TinyBase stores, core modules, session APIs, or `CliAppContext` is usually a sign the test should move up to a command integration test.
