import type { Tool, ToolExecutionOptions } from 'ai'

import {
  ExaContentsResponseSchema,
  ExaSearchResponseSchema,
  exaGetContents,
  exaSearch,
} from './index.ts'

// Keep the demo credential lookup explicit so missing .env setup fails loudly.
const apiKey = process.env.EXA_API_KEY
if (apiKey === undefined || apiKey === '') {
  throw new Error('EXA_API_KEY is required. Add it to packages/tools-exa/.env.')
}

// Reuse the same AI SDK execution context for each direct tool invocation.
const toolExecutionOptions = {
  messages: [],
  toolCallId: 'tools-exa-demo',
} satisfies ToolExecutionOptions

// Run an AI SDK tool directly and keep the return type at the validation boundary.
async function executeTool(toolInstance: Tool, input: unknown): Promise<unknown> {
  if (toolInstance.execute === undefined) {
    throw new Error('Demo tool is missing an execute function.')
  }

  return await toolInstance.execute(input, toolExecutionOptions)
}

// Render one result without dumping full extracted page contents.
function summarizeResult(result: { title?: string | null; url: string }): string {
  return `${result.title ?? 'Untitled'} — ${result.url}`
}

// Exercise each exported tool factory with small, stable inputs.
const search = ExaSearchResponseSchema.parse(
  await executeTool(
    exaSearch({
      apiKey,
      numResults: 2,
    }),
    {
      query: 'Exa API documentation',
    },
  ),
)

const firstUrl = search.results[0]?.url ?? 'https://docs.exa.ai'

console.log('exaSearch')
console.log(`- results: ${search.results.length}`)
console.log(
  `- first: ${search.results[0] === undefined ? 'none' : summarizeResult(search.results[0])}`,
)

const contents = ExaContentsResponseSchema.parse(
  await executeTool(
    exaGetContents({
      apiKey,
    }),
    {
      query: 'What is this page about?',
      urls: [firstUrl],
    },
  ),
)

console.log('exaGetContents')
console.log(`- results: ${contents.results.length}`)
console.log(
  `- first: ${contents.results[0] === undefined ? 'none' : summarizeResult(contents.results[0])}`,
)
console.log(`- summary type: ${typeof contents.results[0]?.summary}`)
