import { defineConfig } from 'oxfmt'

export default defineConfig({
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

  semi: false,
  singleQuote: true,
  sortImports: {},
  sortPackageJson: { sortScripts: true },
  sortTailwindcss: {
    functions: ['cn', 'clsx', 'twMerge'],
    // stylesheet: 'apps/web/app/globals.css' // (monorepo)
  },
})
