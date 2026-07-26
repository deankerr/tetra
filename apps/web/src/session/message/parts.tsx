import { MessageResponse } from '@tetra/ui/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@tetra/ui/components/ai-elements/reasoning'
import { Badge } from '@tetra/ui/components/ui/badge'
import { Button } from '@tetra/ui/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@tetra/ui/components/ui/dialog'
import { cn } from '@tetra/ui/lib/utils'
import { CheckIcon, CopyIcon, DownloadIcon } from 'lucide-react'
import { useState } from 'react'

import type { MessagePart, MessageRole } from './data'

export function MessageParts(props: {
  isStreaming: boolean
  messageId: string
  parts: MessagePart[]
  role: MessageRole
}) {
  return (
    <PartList
      isStreaming={props.isStreaming}
      messageId={props.messageId}
      parts={props.parts}
      role={props.role}
    />
  )
}

function PartList({
  isStreaming,
  messageId,
  parts,
  role,
}: {
  isStreaming: boolean
  messageId: string
  parts: MessagePart[]
  role: MessageRole
}) {
  const latestContentPartIndex = parts.findLastIndex((part) => part.type !== 'step-start')

  return (
    <div className="flex flex-col gap-3">
      {parts.map((part, partIndex) => {
        const partKey = `${messageId}-part-${partIndex}`

        if (part.type === 'step-start') {
          return null
        }

        if (part.type === 'reasoning') {
          // Merge only consecutive reasoning parts, rendered in place. Later parts of a run fold
          // into the block opened by its first part.
          if (parts[partIndex - 1]?.type === 'reasoning') {
            return null
          }

          const runParts = collectReasoningRun(parts, partIndex)
          const runEndIndex = partIndex + runParts.length - 1

          return (
            <ReasoningPart
              isStreaming={isStreaming && latestContentPartIndex === runEndIndex}
              key={partKey}
              parts={runParts}
            />
          )
        }

        if (part.type === 'text') {
          return <TextPart key={partKey} part={part} />
        }

        if (part.type === 'file') {
          // Group consecutive images so a run renders as one unit. User attachments become a
          // compact thumbnail grid; assistant images are generated output, shown large at their
          // true aspect ratio. Non-image files keep the file-card chrome (nothing to preview).
          // Later images in a run fold into the first's block.
          if (isImagePart(part)) {
            if (isImagePart(parts[partIndex - 1])) {
              return null
            }
            const runParts = collectImageRun(parts, partIndex)
            return role === 'user' ? (
              <ImageGridPart
                key={partKey}
                messageId={messageId}
                parts={runParts}
                startIndex={partIndex}
              />
            ) : (
              <GeneratedImagePart
                key={partKey}
                messageId={messageId}
                parts={runParts}
                startIndex={partIndex}
              />
            )
          }
          return <FilePart index={partIndex} key={partKey} messageId={messageId} part={part} />
        }

        if (part.type === 'reasoning-file') {
          return <FilePart index={partIndex} key={partKey} messageId={messageId} part={part} />
        }

        return <UnsupportedPart key={partKey} part={part} />
      })}
    </div>
  )
}

function TextPart({ part }: { part: Extract<MessagePart, { type: 'text' }> }) {
  if (part.text === '') {
    return null
  }

  return <MessageResponse>{part.text}</MessageResponse>
}

function ReasoningPart({
  isStreaming,
  parts,
}: {
  isStreaming: boolean
  parts: Extract<MessagePart, { type: 'reasoning' }>[]
}) {
  const text = parts.map((part) => part.text).join('\n\n')
  if (text === '') {
    return null
  }

  // Sum the measured per-part durations; 0 means unmeasured (live stream or older message), so we
  // pass undefined and let the component fall back to its own timer / "a few seconds" label.
  const totalMs = parts.reduce((sum, part) => sum + getReasoningDurationMs(part), 0)
  const seconds = Math.ceil(totalMs / 1000)

  return (
    <Reasoning
      className="mt-1"
      isStreaming={isStreaming}
      {...(seconds > 0 && { duration: seconds })}
    >
      <ReasoningTrigger />
      <ReasoningContent>{text}</ReasoningContent>
    </Reasoning>
  )
}

function getReasoningDurationMs(part: Extract<MessagePart, { type: 'reasoning' }>): number {
  const value = part.providerMetadata?.tetra?.durationMs
  return typeof value === 'number' ? value : 0
}

function collectReasoningRun(
  parts: MessagePart[],
  startIndex: number,
): Extract<MessagePart, { type: 'reasoning' }>[] {
  const run: Extract<MessagePart, { type: 'reasoning' }>[] = []
  for (const part of parts.slice(startIndex)) {
    if (part.type !== 'reasoning') {
      break
    }
    run.push(part)
  }
  return run
}

type FilePartType = Extract<MessagePart, { type: 'file' }>
type ReasoningFilePartType = Extract<MessagePart, { type: 'reasoning-file' }>
type DownloadableFilePart = FilePartType | ReasoningFilePartType

// User attachments: a compact grid of uniform square thumbnails. Actions live in the lightbox,
// which the tiles are too small to host.
function ImageGridPart({
  messageId,
  parts,
  startIndex,
}: {
  messageId: string
  parts: FilePartType[]
  startIndex: number
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {parts.map((part, index) => {
        const filename = attachmentFilename(part, messageId, startIndex + index)
        return (
          <ImageLightbox
            className="bg-muted size-24 shrink-0"
            filename={filename}
            key={index}
            url={part.url}
          >
            <img alt={filename} className="size-full object-cover" src={part.url} />
          </ImageLightbox>
        )
      })}
    </div>
  )
}

// Assistant output: generated images shown large at their true aspect ratio. Multiple is rare and
// same-size, so a wrapping row keeps them tidy without forcing a shape on them. Copy/download
// actions reveal on hover, and also live in the lightbox.
function GeneratedImagePart({
  messageId,
  parts,
  startIndex,
}: {
  messageId: string
  parts: FilePartType[]
  startIndex: number
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {parts.map((part, index) => {
        const filename = attachmentFilename(part, messageId, startIndex + index)
        return (
          <div className="group relative w-fit max-w-full" key={index}>
            <ImageLightbox className="block max-w-full" filename={filename} url={part.url}>
              <img alt={filename} className="max-h-[512px] max-w-full" src={part.url} />
            </ImageLightbox>
            <ImageActions
              className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
              filename={filename}
              url={part.url}
            />
          </div>
        )
      })}
    </div>
  )
}

// Shared shell: the trigger renders the passed thumbnail, clicking opens the full-size image in a
// lightbox. A plain link can't do this — browsers block top-level navigation to the data: URLs
// these images are stored as. DialogTrigger renders the button itself (base-ui), so style it via
// className rather than nesting a button inside. The lightbox holds the image at up to viewport
// size so it is never smaller than the on-page copy at wide widths.
function ImageLightbox({
  children,
  className,
  filename,
  url,
}: {
  children: React.ReactNode
  className?: string
  filename: string
  url: string
}) {
  return (
    <Dialog>
      <DialogTrigger
        className={cn('border-border cursor-zoom-in overflow-hidden rounded-lg border', className)}
        title={filename}
      >
        {children}
      </DialogTrigger>
      <DialogContent
        className="block w-fit max-w-[95vw] border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-[95vw]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{filename}</DialogTitle>
        <div className="relative w-fit">
          {/* Cap against the viewport, not the container: the shrink-to-fit dialog would otherwise
              feed back into max-w-full and collapse the image below its on-page size. */}
          <img alt={filename} className="max-h-[90vh] max-w-[95vw] rounded-md" src={url} />
          <ImageActions className="absolute top-2 right-2" filename={filename} url={url} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Copy the image to the clipboard or download it with a stable, unique filename. Clipboard writes
// only reliably accept PNG, so non-PNG sources are re-encoded first.
function ImageActions({
  className,
  filename,
  url,
}: {
  className?: string
  filename: string
  url: string
}) {
  const [copied, setCopied] = useState(false)

  async function copyWithFeedback() {
    try {
      await copyImageToClipboard(url)
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
      }, 1500)
    } catch (error) {
      console.error('[image] copy to clipboard failed', error)
    }
  }

  return (
    <div className={cn('flex gap-1', className)}>
      <Button
        aria-label="Copy image"
        className="bg-background/70 hover:bg-background size-7 backdrop-blur-sm"
        onClick={() => {
          void copyWithFeedback()
        }}
        size="icon"
        title="Copy image"
        type="button"
        variant="secondary"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
      <Button
        aria-label="Download image"
        className="bg-background/70 hover:bg-background size-7 backdrop-blur-sm"
        onClick={() => {
          downloadAttachment(url, filename)
        }}
        size="icon"
        title="Download image"
        type="button"
        variant="secondary"
      >
        <DownloadIcon />
      </Button>
    </div>
  )
}

// Non-image files have nothing to preview, so the card just labels them and offers a download.
// (Copy is image-only: browsers can't write arbitrary file bytes to the clipboard.)
function FilePart({
  index,
  messageId,
  part,
}: {
  index: number
  messageId: string
  part: DownloadableFilePart
}) {
  const filename = 'filename' in part ? part.filename : undefined
  const label = [part.mediaType, filename].filter(Boolean).join(' · ')

  return (
    <div className="text-muted-foreground text-xxs flex w-fit items-center gap-2 rounded-md border p-2">
      <Badge className="rounded-xs" variant="secondary">
        {part.type === 'reasoning-file' ? 'reasoning file' : 'file'}
      </Badge>
      <span>{label}</span>
      <Button
        aria-label="Download file"
        className="size-6 [&>svg]:size-3"
        onClick={() => {
          downloadAttachment(part.url, attachmentFilename(part, messageId, index))
        }}
        size="icon"
        title="Download file"
        type="button"
        variant="ghost"
      >
        <DownloadIcon />
      </Button>
    </div>
  )
}

function UnsupportedPart({ part }: { part: MessagePart }) {
  return (
    <div className="text-muted-foreground text-xxs rounded-md border border-dashed p-2">
      Unsupported message part: <span className="font-mono">{part.type}</span>
    </div>
  )
}

function isImagePart(part: MessagePart | undefined): part is FilePartType {
  return part?.type === 'file' && part.mediaType.startsWith('image/')
}

function collectImageRun(parts: MessagePart[], startIndex: number): FilePartType[] {
  const run: FilePartType[] = []
  for (const part of parts.slice(startIndex)) {
    if (!isImagePart(part)) {
      break
    }
    run.push(part)
  }
  return run
}

// Prefer the part's own filename (user uploads carry the original); otherwise mint a unique name
// from the owning message and part index so generated images never collapse to "download.png".
function attachmentFilename(part: DownloadableFilePart, messageId: string, index: number): string {
  const provided = 'filename' in part ? part.filename?.trim() : undefined
  if (provided !== undefined && provided !== '') {
    return provided
  }
  return `${messageId}-${index}.${mediaExtension(part.mediaType)}`
}

function mediaExtension(mediaType: string): string {
  // Take the subtype, drop any structured-syntax suffix (image/svg+xml → svg), normalize jpeg.
  const [subtype = 'bin'] = (mediaType.split('/')[1] ?? 'bin').split('+')
  return subtype === 'jpeg' ? 'jpg' : subtype
}

function downloadAttachment(url: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

async function copyImageToClipboard(url: string): Promise<void> {
  // Pass a Promise to ClipboardItem so the async re-encode still counts under the click gesture.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': imagePngBlob(url) })])
}

async function imagePngBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  const blob = await response.blob()
  if (blob.type === 'image/png') {
    return blob
  }

  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('Could not get a 2d canvas context to re-encode image')
  }
  context.drawImage(bitmap, 0, 0)

  // toDataURL is synchronous, so re-fetching it as a blob avoids the callback-based toBlob.
  const pngResponse = await fetch(canvas.toDataURL('image/png'))
  return await pngResponse.blob()
}
