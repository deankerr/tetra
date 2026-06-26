"use client";

import { cn } from "#lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2Icon,
  Maximize2Icon,
  RotateCcwIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import type { Components, IconMap, PluginConfig } from "streamdown";

export const customMarkdownComponents = {
  h1: ({ className, node: _node, ...props }) => (
    <h1
      className={cn("mt-[1.5em] mb-[0.5em] text-[1.18em] font-semibold", className)}
      data-streamdown="heading-1"
      {...props}
    />
  ),
  h2: ({ className, node: _node, ...props }) => (
    <h2
      className={cn("mt-[1.4em] mb-[0.5em] text-[1.12em] font-semibold", className)}
      data-streamdown="heading-2"
      {...props}
    />
  ),
  h3: ({ className, node: _node, ...props }) => (
    <h3
      className={cn("mt-[1.25em] mb-[0.4em] text-[1.06em] font-medium", className)}
      data-streamdown="heading-3"
      {...props}
    />
  ),
  h4: ({ className, node: _node, ...props }) => (
    <h4
      className={cn("mt-[1.2em] mb-[0.35em] text-[1em] font-medium", className)}
      data-streamdown="heading-4"
      {...props}
    />
  ),
  h5: ({ className, node: _node, ...props }) => (
    <h5
      className={cn("mt-[1.15em] mb-[0.35em] text-[1em] font-medium", className)}
      data-streamdown="heading-5"
      {...props}
    />
  ),
  h6: ({ className, node: _node, ...props }) => (
    <h6
      className={cn("mt-[1.1em] mb-[0.35em] text-[1em] font-normal", className)}
      data-streamdown="heading-6"
      {...props}
    />
  ),
  inlineCode: ({ className, node: _node, ...props }) => (
    <code
      className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-[1em]", className)}
      data-streamdown="inline-code"
      {...props}
    />
  ),
} satisfies Components;

export const streamdownPlugins = { cjk, code, math, mermaid } satisfies PluginConfig;

// Streamdown controls accept an icon map, so route them through the app's lucide set.
export const streamdownIcons = {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2Icon,
  Maximize2Icon,
  RotateCcwIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} satisfies Partial<IconMap>;

// Streamdown owns fenced code markup; these selectors keep that generated UI compact.
export const streamdownClassName = cn(
  "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_[data-streamdown=code-block]]:my-3 [&_[data-streamdown=code-block]]:gap-1 [&_[data-streamdown=code-block]]:rounded-md [&_[data-streamdown=code-block]]:p-1.5",
  "[&_[data-streamdown=code-block-header]]:h-6 [&_[data-streamdown=code-block-header]]:text-xxs",
  "[&_[data-streamdown=code-block]>div:has([data-streamdown=code-block-actions])]:-mt-7 [&_[data-streamdown=code-block]>div:has([data-streamdown=code-block-actions])]:h-6 [&_[data-streamdown=code-block]>div:has([data-streamdown=code-block-actions])]:top-1.5",
  "[&_[data-streamdown=code-block-actions]]:gap-1 [&_[data-streamdown=code-block-actions]]:border-transparent [&_[data-streamdown=code-block-actions]]:bg-transparent [&_[data-streamdown=code-block-actions]]:p-0",
  "[&_[data-streamdown=code-block-actions]_button]:size-5 [&_[data-streamdown=code-block-actions]_button]:rounded-sm [&_[data-streamdown=code-block-actions]_button]:p-0 [&_[data-streamdown=code-block-actions]_button:hover]:bg-muted [&_[data-streamdown=code-block-actions]_button:hover]:text-foreground [&_[data-streamdown=code-block-actions]_svg]:size-3",
  "[&_[data-streamdown=code-block-body]]:p-3 [&_[data-streamdown=code-block-body]]:text-xs/relaxed [&_[data-streamdown=code-block-body]_span]:before:text-xs/relaxed"
);
