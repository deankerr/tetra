# @tetra/tools-exa

AI SDK tools and a small typed Exa API client for Tetra.

## Goals

- Provide AI SDK `tool()` factories for Exa web search workflows.
- Keep model-facing tool inputs small and hard to misuse.
- Validate Exa request and response boundaries with zod.
- Use `up-fetch` for shared fetch defaults, timeouts, response errors, and
  response schema validation.
- Prefer token-efficient content results by default.

## Tools

The package exports two AI SDK tool factories:

- `exaSearch` searches the web and returns ranked Exa results.
- `exaGetContents` summarizes known URLs after search has found relevant sources.

Search returns token-efficient highlights. Contents returns summaries. The model
does not choose extraction modes.

## Tool Options

All tool factories require `apiKey` from `ExaClientOptions`. They also accept
the shared client options `baseUrl`, `fetchImpl`, `retry`, and `timeout`.

Factory options are policy. If a factory option and model input overlap, the
factory option wins. Operational knobs such as content freshness are configured
through factory options and are not exposed to the model.

### `exaSearch(options)`

Factory options:

- `category`: Exa category restriction. When set, the model cannot override it.
- `contents`: default content extraction config. Defaults to `{ highlights: true }`.
- `numResults`: result count. Defaults to `5`; when set, the model cannot
  override it.
- `type`: Exa search strategy: `auto`, `deep`, `deep-lite`, `deep-reasoning`,
  `fast`, or `instant`. This is factory-only because the labels are not
  meaningful enough for model choice.

Model input:

- `query`: search query.
- `startPublishedDate`: ISO date lower bound. Use only when the user asks for
  recent/current results or names a time window.
- `userLocation`: two-letter ISO country code. Use only when local or
  country-specific results matter and the country is known.

### `exaGetContents(options)`

Factory options:

- `contents`: exact Exa contents config. Defaults to `{ summary: true }`. When
  set, the model cannot override extraction mode, focus query, or freshness.

Model input:

- `urls`: known page URLs to summarize.
- `query`: optional focus query. Use only when the user asks about a specific
  aspect of each page.

## Quick Use

```ts
import { exaSearch } from '@tetra/tools-exa'

const search = exaSearch({
  apiKey: process.env.EXA_API_KEY ?? '',
})
```

Pass the resulting tool to the AI SDK under the tool id you want the model to
use:

```ts
import { streamText } from 'ai'
import { exaSearch } from '@tetra/tools-exa'

const result = streamText({
  model,
  messages,
  tools: {
    exaSearch: exaSearch({
      apiKey: process.env.EXA_API_KEY ?? '',
      numResults: 5,
    }),
  },
})
```

## Demo

Run a smoke demo for both tools:

```bash
bun run --filter @tetra/tools-exa demo
```

The demo reads `EXA_API_KEY` from `packages/tools-exa/.env`, invokes each tool
factory directly, validates the tool output, and prints a compact summary.

## Tetra Registry Use

`exaToolDescriptors` is the registry surface used by `@tetra/core`.

```ts
import { exaToolDescriptors } from '@tetra/tools-exa'

const tools = Object.fromEntries(
  exaToolDescriptors.map((descriptor) => [
    descriptor.id,
    descriptor.createTool({ apiKey: EXA_API_KEY }),
  ]),
)
```

Descriptors intentionally accept shared `ExaClientOptions`. Use the direct
factory exports when a caller needs tool-specific defaults such as `contents`,
`numResults`, `type`, or `includeText`.

## Transport Use

```ts
import { ExaClient, ExaSearchRequestSchema, ExaSearchResponseSchema } from '@tetra/tools-exa'

const exa = new ExaClient({
  apiKey: process.env.EXA_API_KEY ?? '',
})

const response = await exa.post(
  '/search',
  ExaSearchRequestSchema.parse({
    contents: { highlights: true },
    numResults: 5,
    query: 'Tailwind CSS v4 migration guide',
  }),
  ExaSearchResponseSchema,
)
```

## Client Options

`ExaClientOptions`:

- `apiKey`: Exa API key. Required.
- `baseUrl`: Exa API base URL. Defaults to `https://api.exa.ai`.
- `fetchImpl`: fetch implementation override for tests or custom runtimes.
- `retry`: `up-fetch` retry options.
- `timeout`: per-attempt timeout in milliseconds. Defaults to `30000`.
