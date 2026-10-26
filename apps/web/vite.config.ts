import { cloudflare } from '@cloudflare/vite-plugin'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    // The Worker (API + room Durable Objects, apps/server) runs inside the dev server and is
    // built and deployed with the app (DECISIONS.md D40, D43). Not in unit tests.
    !process.env.VITEST &&
      cloudflare({
        configPath: '../server/wrangler.jsonc',
        // Dev builds compare view checksums at turn ends.
        config: command === 'serve' ? { vars: { ROOM_CHECKSUMS: '1' } } : {},
      }),
  ],
}))
