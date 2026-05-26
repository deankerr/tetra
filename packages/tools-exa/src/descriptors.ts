import type { Tool } from 'ai'

import type { ExaClientOptions } from './client.ts'
import { exaAnswer } from './tools/answer.ts'
import { exaFindSimilar } from './tools/find-similar.ts'
import { exaGetContents } from './tools/get-contents.ts'
import { exaSearch } from './tools/search.ts'

export interface ExaToolDescriptor {
  createTool: (options: ExaClientOptions) => Tool
  description: string
  id: string
  label: string
}

export const exaToolDescriptors: ExaToolDescriptor[] = [
  {
    createTool: exaSearch,
    description: 'Search the web using Exa neural search and return highlights.',
    id: 'exaSearch',
    label: 'Exa Web Search',
  },
  {
    createTool: exaGetContents,
    description: 'Retrieve cleaned page text, highlights, and summaries for URLs using Exa.',
    id: 'exaGetContents',
    label: 'Exa Get Contents',
  },
  {
    createTool: exaFindSimilar,
    description: 'Find web pages semantically similar to a given URL using Exa.',
    id: 'exaFindSimilar',
    label: 'Exa Find Similar',
  },
  {
    createTool: exaAnswer,
    description: 'Ask Exa a question and get a sourced answer with citations.',
    id: 'exaAnswer',
    label: 'Exa Answer',
  },
]
