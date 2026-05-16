import { defineConfig } from 'oxlint'
import core from 'ultracite/oxlint/core'
import react from 'ultracite/oxlint/react'

export default defineConfig({
  extends: [core, react],
  ignorePatterns: [
    // ── Generated ────────────────────────────────────────────────
    '**/.alchemy/**',
    '**/.conductor/**',
    '**/.context/**',
    '**/.next/**',
    '**/.output/**',
    '**/.turbo/**',
    '**/.vercel/**',
    '**/.vite/**',
    '**/build/**',
    '**/dist/**',
    '**/out/**',
    '**/__root.tsx',
    '**/routeTree.gen.ts',
    '**/next-env.d.ts',
    '**/worker-configuration.d.ts',

    // ── Lock files ────────────────────────────────────────────────────
    '**/bun.lock',
    '**/bun.lockb',
    '**/package-lock.json',
    '**/yarn.lock',
    '**/pnpm-lock.yaml',

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
  },
})
