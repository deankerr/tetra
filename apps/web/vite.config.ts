import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
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
    tanstackStart({ spa: { enabled: true } }),
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
