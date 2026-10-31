/**
 * The card stock grain (`paper` utility in index.css) as a bitmap made once at startup. The CSS
 * default is an SVG `feTurbulence` filter, which the browser re-renders on every repaint of every
 * card (at the start, flip and landing of a deal), a visible hitch on phones (D70). Same look:
 * a warm brown at about 0.25 alpha with fine per-pixel variation.
 */
export function installPaperGrain(size = 160): void {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return // the SVG default stays
  const img = ctx.createImageData(size, size)
  const px = img.data
  for (let i = 0; i < px.length; i += 4) {
    // Triangular noise around 0.25: two uniform samples, like the fractal noise's soft spread.
    const a = 0.25 + (Math.random() + Math.random() - 1) * 0.2 // UI only: decorative grain
    px[i] = 115
    px[i + 1] = 92
    px[i + 2] = 56
    px[i + 3] = Math.round(a * 255)
  }
  ctx.putImageData(img, 0, 0)
  document.documentElement.style.setProperty('--paper-grain', `url(${canvas.toDataURL('image/png')})`)
}
