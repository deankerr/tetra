import { defineConfig } from 'oxfmt'
import ultracite from 'ultracite/oxfmt'

export default defineConfig({
  ignorePatterns: [
    // ── Ultracite defaults ────────────────────────────────────────────────
    ...(ultracite.ignorePatterns ?? []),

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

  semi: false,
  singleQuote: true,
  sortImports: {},
  sortPackageJson: { sortScripts: true },
  sortTailwindcss: {
    functions: ['cn', 'clsx', 'twMerge'],
    // stylesheet: 'apps/web/app/globals.css' // (monorepo)
  },
})
