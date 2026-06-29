import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const config = defineConfig({
  build: {
    chunkSizeWarningLimit: 2000,
  },
  plugins: [
    devtools({
      consolePiping: { enabled: false },
    }),
    tailwindcss(),
    tanstackRouter({ autoCodeSplitting: true, target: 'react' }),
    viteReact(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    forwardConsole: false,
  },
})

export default config
