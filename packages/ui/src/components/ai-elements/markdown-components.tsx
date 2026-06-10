"use client";

import { cn } from "#lib/utils";
import type { Components } from "streamdown";

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
