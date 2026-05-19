import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/pdd/',
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
      '/images': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
})
