import type { LibraryEntities } from '@tetra/schemas/library'
import { Button } from '@tetra/ui/components/ui/button'
import { ButtonGroup, ButtonGroupText } from '@tetra/ui/components/ui/button-group'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

import { useApp } from '@/app'
import { libraryReact } from '@/store'

import { useSessionThreadSelection } from '../thread-view'

export function MessageForkControl({ message }: { message: LibraryEntities['messages'] }) {
  const { selectThreadFromMessage } = useSessionThreadSelection(message.sessionId)
  const forkChoices = useForkChoices(message)
  const currentIndex = forkChoices.findIndex((forkChoice) => forkChoice.id === message.id)

  if (forkChoices.length <= 1 || currentIndex === -1) {
    return null
  }

  const previousIndex = currentIndex === 0 ? forkChoices.length - 1 : currentIndex - 1
  const nextIndex = currentIndex === forkChoices.length - 1 ? 0 : currentIndex + 1
  const previousForkChoice = forkChoices[previousIndex]
  const nextForkChoice = forkChoices[nextIndex]

  if (previousForkChoice === undefined || nextForkChoice === undefined) {
    throw new Error(`Fork control could not resolve choices for ${message.id}`)
  }

  return (
    <ButtonGroup className="[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md">
      <Button
        aria-label="Previous fork choice"
        onClick={() => {
          selectThreadFromMessage(previousForkChoice.id)
        }}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronLeftIcon />
      </Button>
      <ButtonGroupText className="text-muted-foreground rounded-md! border-l! bg-transparent px-2 shadow-none">
        {currentIndex + 1} of {forkChoices.length}
      </ButtonGroupText>
      <Button
        aria-label="Next fork choice"
        onClick={() => {
          selectThreadFromMessage(nextForkChoice.id)
        }}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronRightIcon />
      </Button>
    </ButtonGroup>
  )
}

function useForkChoices(message: LibraryEntities['messages']): LibraryEntities['messages'][] {
  const { transcripts } = useApp()
  // Subscribe to the session's messages so fork choices re-render on transcript changes.
  libraryReact.messages.useBySession(message.sessionId)

  // Fork choices are ordinary child messages of the current message's parent.
  return transcripts.getSession(message.sessionId).listContinuations(message.parentMessageId)
}
