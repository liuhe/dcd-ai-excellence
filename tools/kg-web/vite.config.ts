import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: Vite serves the client on 4730, proxies /api → Express on 4731 (DCDDP block 4730-4733).
// Prod: Express serves the built dist/client + /api.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on all interfaces so mobile on LAN can hit the dev server too
    port: 4730,
    proxy: {
      '/api': {
        target: 'http://localhost:4731',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
})
