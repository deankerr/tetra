import {
  Accessors,
  Catalog,
  Prompts,
  Runs,
  Sessions,
  Transcripts,
  createTetraDb,
} from '@tetra/core-redesign'
import { credentialStore } from '@tetra/credentials'

export async function sketchRedesignChatFlow(content: string): Promise<void> {
  // Create the synchronous state surface first; persistence can load/recover before this is used.
  const db = createTetraDb()
  const accessors = new Accessors(db)
  const sessions = new Sessions(accessors)
  const prompts = new Prompts(accessors)
  const transcripts = new Transcripts(accessors)
  const catalog = new Catalog(accessors)

  // Actions/controllers sit beside the state modules and receive their external adapters explicitly.
  const runs = new Runs(accessors, credentialStore)
  runs.recover()
  void catalog.refresh()

  // CLI convenience state is just a TinyBase value; there is no Workspace module in core.
  const sessionId = sessions.create({ title: content.trim().slice(0, 60) || 'Untitled' })
  db.store.setValue('cliActiveSessionId', sessionId)

  // The execute path creates durable rows first, then starts the runner and streams live snapshots.
  let lastLength = 0
  const handle = await runs.execute(sessionId, {
    content,
    onSnapshot: (message) => {
      const text = message.parts
        .filter((part): part is { text: string; type: 'text' } => part.type === 'text')
        .map((part) => part.text)
        .join('')

      process.stdout.write(text.slice(lastLength))
      lastLength = text.length
    },
  })

  // The handle is the CLI's replacement for waitForRequest: it resolves after the request is terminal.
  await handle.done
  console.log()

  // After completion, ordinary synchronous modules/accessors read the durable result.
  const assistant = transcripts.get(handle.assistantMessageId)
  const request = accessors.requests.get(handle.requestId)
  console.log({ assistantParts: assistant.parts.length, requestStatus: request.status })

  // Prompts are included here only to show that the old bootstrap pieces still compose normally.
  console.log({ promptCount: prompts.list().length })
}
