/**
 * Installs the service worker (public/sw.js, D64) in production builds only: in dev it would
 * cache over Vite's hot updates.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      console.warn('[skyline] service worker not registered', err)
    })
  })
}
