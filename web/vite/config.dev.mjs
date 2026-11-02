import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { pwa } from './pwa.mjs'

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        react(),
        tailwindcss(),
        // Service worker off in dev (see pwa.mjs); loaded so its register module resolves.
        pwa(),
    ],
    server: {
        port: 8080,
        // Listen on the LAN so you can open the dev server on your phone.
        host: true,
        // Phase 1 fake data reads the generated card season from server/seasons.
        // Only that folder is exposed besides the web app itself (the server is on the LAN).
        fs: {
            allow: ['.', '../server/seasons']
        },
        // Forward /api/* to the Go server so the browser sees one origin.
        proxy: {
            '/api': {
                // API_PROXY_TARGET overrides the Go server address (default :8081).
                target: process.env.API_PROXY_TARGET ?? 'http://localhost:8081',
                rewrite: (path) => path.replace(/^\/api/, ''),
                // The live events socket (/api/ws) goes through too.
                ws: true
            }
        }
    }
})
