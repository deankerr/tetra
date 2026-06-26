import { CodeBlock } from '@tetra/ui/components/ai-elements/code-block'
import { Button } from '@tetra/ui/components/ui/button'
import { Sheet, SheetClose, SheetContent } from '@tetra/ui/components/ui/sheet'
import { CopyIcon, XIcon } from 'lucide-react'

import { webTinybase } from '@/store'

const CLOSED_JSON_VIEW = { json: '', title: '' }

export function useJsonViewSheet() {
  const [, setJsonView] = webTinybase.useValueState('jsonView')

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
  const [jsonView, setJsonView] = webTinybase.useValueState('jsonView')
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
        className="grid grid-rows-[var(--header-height)_1fr] data-[side=right]:sm:max-w-2xl"
        showCloseButton={false}
      >
        <div className="flex items-center justify-between border-b px-2">
          <span className="truncate px-2 text-xs font-medium">{jsonView.title ?? 'JSON View'}</span>
          <div className="flex items-center gap-1">
            <Button
              aria-label="Copy JSON"
              onClick={() => void navigator.clipboard.writeText(jsonView.json)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <CopyIcon />
            </Button>
            <SheetClose
              render={<Button aria-label="Close JSON view" size="icon-sm" variant="ghost" />}
            >
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
