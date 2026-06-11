import { useNavigate } from '@tanstack/react-router'
import { Button } from '@tetra/ui/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@tetra/ui/components/ui/sheet'
import { SidebarTrigger } from '@tetra/ui/components/ui/sidebar'
import { toast } from '@tetra/ui/components/ui/sonner'
import { KeyRoundIcon, Settings2Icon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { WEB_UI_STORE_ID, tinybase, typedTinybase, webUiTinybase } from '@/lib/tinybase'
import { useTetra } from '@/tetra-context'
import { useCredential } from '@/use-credential'

import { Composer } from './composer'
import { SessionSettings } from './settings'
import { ModelPickerSheet } from './settings/model-picker'
import { PromptEditorSheet } from './settings/prompt-editor-sheet'

export function NewSessionPage() {
  const navigate = useNavigate()
  const draftSessionId = useDraftSessionId()
  const [detailOpen, setDetailOpen] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelId, setModelId] = typedTinybase.useCellState(
    'sessionRunConfigs',
    draftSessionId ?? '',
    'modelId',
  )
  const [promptSheetOpen, setPromptSheetOpen] = useState(false)
  const [openrouterApiKey] = useCredential('OPENROUTER_API_KEY')
  const [, setSettingsOpen] = webUiTinybase.useValueState('settingsOpen', WEB_UI_STORE_ID)
  const { typedStore } = useTetra()
  const apiKeyConfigured = openrouterApiKey.trim() !== ''

  const openSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [setSettingsOpen])

  const materializeDraftSession = useCallback(() => {
    if (draftSessionId === null) {
      return
    }

    // Clearing the pointer makes this session normal history before routing to it.
    typedStore.tables.draftSessions.deleteRow('current')
    void navigate({ params: { sessionId: draftSessionId }, to: '/sessions/$sessionId' })
  }, [draftSessionId, typedStore, navigate])

  const requireGenerateReady = useCallback(() => {
    if (apiKeyConfigured) {
      return
    }

    // New-session owns credential recovery so the composer can stay session-focused.
    toast.error('OpenRouter API key required', {
      description: 'Add an OpenRouter API key before running model inference.',
    })
    openSettings()
    throw new Error('OpenRouter API key required')
  }, [apiKeyConfigured, openSettings])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-2">
        <SidebarTrigger title="Open sidebar" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">New session</span>
        <ApiKeyButton configured={apiKeyConfigured} onClick={openSettings} />
        <Button
          aria-label="Open new session settings"
          disabled={draftSessionId === null}
          onClick={() => {
            setDetailOpen(true)
          }}
          size="icon-sm"
          title="Open new session settings"
          type="button"
          variant="ghost"
        >
          <Settings2Icon />
        </Button>
      </header>

      {/* Composer */}
      <main className="flex min-h-0 flex-1 items-center justify-center px-4 py-8">
        {draftSessionId === null ? null : (
          <Composer
            className="w-full max-w-3xl"
            onSessionMaterialized={materializeDraftSession}
            requireGenerateReady={requireGenerateReady}
            sessionId={draftSessionId}
          />
        )}
      </main>

      {/* Settings sheet */}
      {draftSessionId === null ? null : (
        <Sheet onOpenChange={setDetailOpen} open={detailOpen}>
          <SheetContent className="w-80 sm:max-w-80" showCloseButton={false}>
            <div className="flex h-(--header-height) shrink-0 items-center justify-between border-b px-2">
              <SheetTitle className="px-2 text-xs font-medium">New session settings</SheetTitle>
              <SheetClose
                render={
                  <Button
                    aria-label="Close new session settings"
                    size="icon-sm"
                    title="Close new session settings"
                    variant="ghost"
                  />
                }
              >
                <XIcon />
              </SheetClose>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <SessionSettings
                modelId={modelId ?? ''}
                onOpenModelPicker={() => {
                  setModelPickerOpen(true)
                }}
                onOpenPromptSheet={() => {
                  setPromptSheetOpen(true)
                }}
                sessionId={draftSessionId}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Prompt sheet */}
      {draftSessionId === null ? null : (
        <PromptEditorSheet
          onOpenChange={setPromptSheetOpen}
          open={promptSheetOpen}
          sessionId={draftSessionId}
        />
      )}

      {/* Model sheet */}
      <ModelPickerSheet
        onOpenChange={setModelPickerOpen}
        onValueChange={(nextModelId) => {
          setModelId(nextModelId)
        }}
        open={modelPickerOpen}
        value={modelId ?? ''}
      />
    </div>
  )
}

function useDraftSessionId(): string | null {
  const { transcripts, typedStore } = useTetra()
  const persister = tinybase.usePersister()
  const synchronizer = tinybase.useSynchronizer()
  const draftSessionPointer = typedTinybase.useEntity('draftSessions', 'current')
  const draftSessionId = draftSessionPointer?.sessionId ?? ''
  const draftSession = typedTinybase.useEntity('sessions', draftSessionId)
  const creatingDraftSession = useRef(false)
  const storeReady = persister !== undefined || synchronizer !== undefined

  useEffect(() => {
    if (!storeReady) {
      return
    }

    if (draftSessionId !== '' && draftSession === null) {
      typedStore.tables.draftSessions.deleteRow('current')
      creatingDraftSession.current = false
      return
    }

    if (draftSessionId !== '') {
      creatingDraftSession.current = false
      return
    }

    if (creatingDraftSession.current) {
      return
    }

    // A draft starts life as an ordinary session row hidden only by this pointer.
    creatingDraftSession.current = true
    transcripts.createSession({
      onCreate(sessionId) {
        typedStore.tables.draftSessions.setRow('current', { sessionId })
      },
    })
  }, [draftSession, draftSessionId, storeReady, transcripts, typedStore])

  if (!storeReady || draftSessionId === '' || draftSession === null) {
    return null
  }

  return draftSessionId
}

function ApiKeyButton({ configured, onClick }: { configured: boolean; onClick: () => void }) {
  return (
    <Button
      aria-label={configured ? 'API key configured' : 'Add API key'}
      onClick={onClick}
      size="sm"
      title={configured ? 'API key configured' : 'Add API key'}
      type="button"
      variant={configured ? 'ghost' : 'outline'}
    >
      <KeyRoundIcon />
      {configured ? 'API key' : 'Add key'}
    </Button>
  )
}
