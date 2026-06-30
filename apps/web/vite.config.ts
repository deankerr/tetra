import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, mergeConfig } from 'vite'
import type { UserConfig } from 'vite'

// One codebase, two targets. The only discriminator is the Vite mode: `--mode desktop` (baked into the
// `dev:tauri`/`build:tauri` scripts that Tauri's before-commands run) selects the desktop slice; every
// other invocation — `vite dev`, `vite build`, `vite preview`, Vercel — gets the shared base untouched.

// Shared by web and desktop.
const shared: UserConfig = {
  build: { chunkSizeWarningLimit: 2000 },
  // Keep Rust/Tauri errors visible in the terminal during `tauri dev`.
  clearScreen: false,
  plugins: [
    devtools({ consolePiping: { enabled: false } }),
    tailwindcss(),
    tanstackRouter({ autoCodeSplitting: true, target: 'react' }),
    viteReact(),
  ],
  resolve: { tsconfigPaths: true },
  // src-tauri is the Rust shell; nothing the web reload cares about lives there.
  server: { watch: { ignored: ['**/src-tauri/**'] } },
}

// Desktop (Tauri) overrides, merged onto `shared` only under `--mode desktop`.
const desktop: UserConfig = {
  build: {
    // Separate out-dir so `tauri build` can never overwrite the web `dist` (which Vercel deploys).
    // tauri.conf.json `frontendDist` embeds this directory.
    outDir: 'dist-desktop',
    // macOS/Linux render in WebKit; pin a Safari-era target. Add a Windows (chrome105) branch here
    // when we target it — it's the one genuinely per-OS knob.
    target: 'safari13',
  },
  server: {
    // devUrl in tauri.conf.json is fixed at 5299, so pin it: strictPort failing loudly on a collision
    // beats Vite floating to a port Tauri can't reach. Plain `vite dev` (web) stays unpinned and floats.
    port: 5299,
    strictPort: true,
  },
}

export default defineConfig(({ mode }) =>
  mode === 'desktop' ? mergeConfig(shared, desktop) : shared,
)
