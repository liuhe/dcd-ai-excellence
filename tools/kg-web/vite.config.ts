import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: Vite serves the client on 5173, proxies /api → Express on 3000.
// Prod: Express serves the built dist/client + /api.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on all interfaces so mobile on LAN can hit the dev server too
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
})
