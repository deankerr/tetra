import { defineConfig } from 'oxlint'
import core from 'ultracite/oxlint/core'
import react from 'ultracite/oxlint/react'
import tanstack from 'ultracite/oxlint/tanstack'

export default defineConfig({
  extends: [core, react, tanstack],
  ignorePatterns: [
    // ── Ultracite defaults ────────────────────────────────────────────────
    ...(core.ignorePatterns ?? []),

    // ── Generated ────────────────────────────────────────────────
    '**/.alchemy/**',
    '**/.conductor/**',
    '**/.context/**',
    '**/__root.tsx',
    '**/routeTree.gen.ts',

    // ── Vendored ────────────────────────────────────────────────────
    '.agents/**',
    '.claude/**',
    '**/components/ai-elements/**',
    '**/components/ui/**',
    '**/reference/tinybase/**',
  ],

  rules: {
    // ── preference ────────────────────────────────────────────────────
    'func-style': 'off',
    'no-inline-comments': 'off',
    'no-use-before-define': 'off',
    'no-warning-comments': 'off',
    'unicorn/consistent-function-scoping': 'off',
  },
})
