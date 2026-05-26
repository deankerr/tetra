import type { Tool } from 'ai'

import type { ExaClientOptions } from './client.ts'
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
    description: 'Summarize known page URLs using Exa after search has found relevant sources.',
    id: 'exaGetContents',
    label: 'Exa Get Contents',
  },
]
