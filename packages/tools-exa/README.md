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

The package exports four AI SDK tool factories:

- `exaSearch` searches the web and returns ranked Exa results.
- `exaGetContents` fetches page content for known URLs.
- `exaFindSimilar` finds pages semantically similar to a URL.
- `exaAnswer` asks Exa for a sourced answer.

The default content mode for search-like tools is `highlights: true`. This keeps
tool results smaller and usually works better for agent loops than returning
full page text on the first call.

## Tool Options

All tool factories require `apiKey` from `ExaClientOptions`. They also accept
the shared client options `baseUrl`, `fetchImpl`, `retry`, and `timeout`.

### `exaSearch(options)`

Factory options:

- `category`: default Exa category when the model does not provide one.
- `contents`: default content extraction config. Defaults to `{ highlights: true }`.
- `numResults`: default result count. Defaults to `5`.
- `type`: default Exa search strategy: `auto`, `deep`, `deep-lite`,
  `deep-reasoning`, `fast`, or `instant`.

Model input:

- `query`: search query.
- `category`: restrict to `company`, `financial report`, `github`, `news`,
  `pdf`, `people`, `personal site`, or `research paper`.
- `includeDomains` / `excludeDomains`: domain filters.
- `startPublishedDate` / `endPublishedDate`: ISO date filters.
- `numResults`: result count, capped at `25`.
- `type`: per-call search strategy.
- `maxAgeHours`: content freshness. `0` live-crawls, `-1` uses cache only.
- `userLocation`: two-letter country code for geo-relevant results.

### `exaGetContents(options)`

Factory options:

- `contents`: default Exa contents config. Defaults to `{ highlights: true }`.

Model input:

- `urls`: URLs to fetch content for.
- `mode`: `highlights`, `summary`, or `text`. Defaults to `highlights`.
- `query`: focus query for highlights or summaries.
- `maxCharacters`: character cap when `mode` is `text`.
- `maxAgeHours`: content freshness. `0` live-crawls, `-1` uses cache only.

`mode` is compiled into mutually exclusive Exa content flags. For example,
`mode: 'summary'` sends summary config and removes text/highlights config.

### `exaFindSimilar(options)`

Factory options:

- `contents`: default content extraction config. Defaults to `{ highlights: true }`.
- `numResults`: default result count. Defaults to `5`.

Model input:

- `url`: source URL.
- `excludeSourceDomain`: exclude pages from the source URL's domain.
- `numResults`: result count, capped at `25`.
- `maxAgeHours`: content freshness. `0` live-crawls, `-1` uses cache only.

### `exaAnswer(options)`

Factory options:

- `includeText`: ask Exa to include source text in citations.

Model input:

- `query`: question to answer.

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

Run a smoke demo for all four tools:

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
