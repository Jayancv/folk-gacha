import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        react(),
        tailwindcss(),
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
                target: 'http://localhost:8081',
                rewrite: (path) => path.replace(/^\/api/, '')
            }
        }
    }
})
