import { CodeBlock } from '@tetra/ui/components/ai-elements/code-block'
import { Button } from '@tetra/ui/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@tetra/ui/components/ui/sheet'
import { CopyIcon, XIcon } from 'lucide-react'

import { webReact } from '@/store'

const CLOSED_JSON_VIEW = { json: '', title: '' }

export function useJsonViewSheet() {
  const [, setJsonView] = webReact.values.jsonView.useState()

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
  const [jsonView, setJsonView] = webReact.values.jsonView.useState()
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
      <SheetContent className="flex flex-col overflow-hidden data-[side=right]:sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{jsonView.title ?? 'JSON View'}</SheetTitle>
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
        </SheetHeader>

        <CodeBlock
          className="min-h-0 flex-1 rounded-none border-0 **:data-[slot=code-block-body-pre]:whitespace-pre-wrap [&>div]:h-full"
          code={jsonView.json}
          language="json"
          showLineNumbers
        />
      </SheetContent>
    </Sheet>
  )
}
