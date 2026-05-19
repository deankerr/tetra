import { expect, test } from 'bun:test'

import { CredentialStore } from '@tetra/credentials'

import { createRunner } from '#runner'
import { createSessions } from '#sessions'
import { createTetraStore } from '#store'

test('missing OpenRouter key marks the request as error', async () => {
  // Use an empty credential registry so OPENROUTER_API_KEY resolves to an empty string.
  const tetraStore = createTetraStore()
  const sessions = createSessions(tetraStore)
  const runner = createRunner(tetraStore, sessions, new CredentialStore([]))

  // Execute a request; the runner should fail before constructing the provider.
  const sessionId = sessions.create()
  const { requestId } = runner.execute(sessionId, { content: 'hello' })

  // Let the fire-and-forget async runner write its failure state.
  await Promise.resolve()

  // The request must not look like a successful empty completion.
  expect(tetraStore.store.getCell('requests', requestId, 'status')).toBe('error')
  expect(tetraStore.store.getCell('requests', requestId, 'errorMessage')).toBe(
    'Error: OPENROUTER_API_KEY is required for model inference',
  )
})
