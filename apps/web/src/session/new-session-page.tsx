import { useNavigate } from '@tanstack/react-router'
import { Button } from '@tetra/ui/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@tetra/ui/components/ui/sheet'
import { SidebarTrigger } from '@tetra/ui/components/ui/sidebar'
import { Settings2Icon, XIcon } from 'lucide-react'
import { useCallback, useState } from 'react'

import { MissingOpenRouterApiKeyButton, useRequireOpenRouterApiKey } from '@/api-key-settings'

import { NewSessionComposer } from './composer'
import { DraftRunConfigProvider, useRunConfig } from './run-config-providers'
import { SessionSettings } from './settings'
import { ModelPickerSheet } from './settings/model-picker'
import { PromptEditorSheet } from './settings/prompt-editor-sheet'

export function NewSessionPage() {
  return (
    <DraftRunConfigProvider>
      <NewSessionPageContent />
    </DraftRunConfigProvider>
  )
}

function NewSessionPageContent() {
  const navigate = useNavigate()
  const [detailOpen, setDetailOpen] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const { config, updateConfig } = useRunConfig()
  const [promptSheetOpen, setPromptSheetOpen] = useState(false)
  const requireGenerateReady = useRequireOpenRouterApiKey()

  const openMaterializedSession = useCallback(
    ({ sessionId }: { sessionId: string }) => {
      void navigate({ params: { sessionId }, to: '/sessions/$sessionId' })
    },
    [navigate],
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-2">
        <SidebarTrigger title="Open sidebar" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">New session</span>
        <MissingOpenRouterApiKeyButton />
        <Button
          aria-label="Open new session settings"
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
        <NewSessionComposer
          className="w-full max-w-3xl"
          onSessionMaterialized={openMaterializedSession}
          requireGenerateReady={requireGenerateReady}
        />
      </main>

      {/* Settings sheet */}
      <Sheet onOpenChange={setDetailOpen} open={detailOpen}>
        <SheetContent className="w-80 sm:max-w-80">
          <SheetHeader>
            <SheetTitle>New session settings</SheetTitle>
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
          </SheetHeader>

          <div className="p-4">
            <SessionSettings
              onOpenModelPicker={() => {
                setModelPickerOpen(true)
              }}
              onOpenPromptSheet={() => {
                setPromptSheetOpen(true)
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Prompt sheet */}
      <PromptEditorSheet onOpenChange={setPromptSheetOpen} open={promptSheetOpen} />

      {/* Model sheet */}
      <ModelPickerSheet
        onOpenChange={setModelPickerOpen}
        onValueChange={(nextModelId) => {
          updateConfig({ modelId: nextModelId })
        }}
        open={modelPickerOpen}
        value={config.modelId}
      />
    </div>
  )
}
