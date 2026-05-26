import { CodeBlock } from '@tetra/ui/components/ai-elements/code-block'
import { Button } from '@tetra/ui/components/ui/button'
import { Sheet, SheetClose, SheetContent } from '@tetra/ui/components/ui/sheet'
import { CopyIcon, XIcon } from 'lucide-react'

import { WEB_UI_STORE_ID, webUiTinybase } from '@/lib/tinybase'

const CLOSED_JSON_VIEW = { json: '', title: '' }

export function useJsonViewSheet() {
  const [, setJsonView] = webUiTinybase.useValueState('jsonView', WEB_UI_STORE_ID)

  return {
    openJsonView: (payload: { title: string; value: unknown }) => {
      setJsonView({
        json: JSON.stringify(payload.value, null, 2) ?? 'undefined',
        title: payload.title,
      })
    },
  }
}

export function JsonViewSheet() {
  const [jsonView, setJsonView] = webUiTinybase.useValueState('jsonView', WEB_UI_STORE_ID)
  const open = jsonView.title !== ''

  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setJsonView(CLOSED_JSON_VIEW)
        }
      }}
      open={open}
    >
      <SheetContent
        className="grid grid-rows-[var(--header-height)_1fr]"
        showCloseButton={false}
        style={{ maxWidth: 'none', width: 'min(90vw, 1120px)' }}
      >
        <div className="flex items-center justify-between border-b px-2">
          <span className="truncate px-2 text-xs font-medium">{jsonView.title || 'JSON View'}</span>
          <div className="flex items-center gap-1">
            <Button
              onClick={() => void navigator.clipboard.writeText(jsonView.json)}
              size="icon-sm"
              type="button"
              variant="ghost"
              aria-label="Copy JSON"
            >
              <CopyIcon />
            </Button>
            <SheetClose render={<Button size="icon-sm" variant="ghost" />}>
              <XIcon />
            </SheetClose>
          </div>
        </div>

        <CodeBlock
          className="rounded-none border-0 **:data-[slot=code-block-body-pre]:whitespace-pre-wrap [&>div]:h-full"
          code={jsonView.json}
          language="json"
          showLineNumbers
        />
      </SheetContent>
    </Sheet>
  )
}
