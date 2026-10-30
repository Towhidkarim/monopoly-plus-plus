import { cloudflare } from '@cloudflare/vite-plugin'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { iconFiles } from './src/pwa/icon.ts'

/** PWA icons drawn from code (src/pwa/icon.ts, D64): served in dev, emitted into the client build. */
function pwaIcons(): Plugin {
  let files: Record<string, Uint8Array> | null = null
  const get = () => (files ??= iconFiles())
  return {
    name: 'skyline-pwa-icons',
    // The client only, not the Worker bundle.
    applyToEnvironment: (env) => env.name === 'client',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = get()[(req.url ?? '').split('?')[0]!.slice(1)]
        if (!file) return next()
        res.setHeader('Content-Type', 'image/png')
        res.end(file)
      })
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(get()))
        this.emitFile({ type: 'asset', fileName, source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    pwaIcons(),
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
