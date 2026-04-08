import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/ws':  { target: 'ws://localhost:5000', ws: true },
      '/mobile': 'http://localhost:5000',
    }
  }
})
