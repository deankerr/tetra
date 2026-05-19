import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { App } from '@/app'

const searchSchema = z.object({
  sessions: z.array(z.string()).optional(),
})

export const Route = createFileRoute('/')({
  component: App,
  validateSearch: searchSchema,
})
