import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'Weight & Balance H125',
        short_name: 'W&B H125',
        description: 'חישוב משקל ואיזון מסוק H125',
        theme_color: '#1e3a5f',
        background_color: '#1e3a5f',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'he',
        dir: 'rtl',
        start_url: '/H125-Weight-Balance/',
        scope: '/H125-Weight-Balance/',
        icons: [
          { src: '/H125-Weight-Balance/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/H125-Weight-Balance/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  base: '/H125-Weight-Balance/',
})
