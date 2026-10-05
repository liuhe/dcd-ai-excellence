import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Dev: Vite serves the client on 4732; /api (incl. /api/files) is proxied to the studio server (:4733). DCDDP block 4730-4733.
// Prod: `vite build` emits dist/client, which server/index.ts hosts alongside the API.
export default defineConfig({
  base: './',
  build: { outDir: 'dist/client' },
  plugins: [react()],
  server: {
    proxy: { '/api': { target: `http://localhost:${process.env.STUDIO_PORT ?? 4733}`, changeOrigin: true } },
  },
  resolve: {
    alias: {
      // @dcddp/core's barrel pulls in node-only modules; the browser never calls them.
      'node:fs/promises': resolve(__dirname, 'src/stubs/fs-promises.ts'),
      'node:fs': resolve(__dirname, 'src/stubs/fs.ts'),
      'node:path': resolve(__dirname, 'src/stubs/path.ts'),
    },
  },
})
