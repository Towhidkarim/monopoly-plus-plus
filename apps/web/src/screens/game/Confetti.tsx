import { useEffect, useRef } from 'react'

const COLORS = ['#f5b54a', '#fb7185', '#5eead4', '#7dd3fc', '#a78bfa', '#fbf8f1']
const COUNT = 44
const LIFE = 3600

/**
 * One burst of confetti that falls, fades and is gone (no loop). Transform and opacity only,
 * driven by the Web Animations API; a timer removes the pieces so the end state is right even
 * if no frame ever runs (throttled tab). Render nothing under reduced motion.
 */
export function Confetti() {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el || typeof el.animate !== 'function') return
    const h = el.clientHeight || 800
    const w = el.clientWidth || 1200
    const pieces: HTMLElement[] = []
    const anims: Animation[] = []
    for (let i = 0; i < COUNT; i++) {
      const p = document.createElement('span')
      const pw = 6 + Math.round(Math.random() * 6)
      Object.assign(p.style, {
        position: 'absolute',
        left: `${Math.round(Math.random() * w)}px`,
        top: '-24px',
        width: `${pw}px`,
        height: `${pw + 5}px`,
        borderRadius: '2px',
        background: COLORS[i % COLORS.length]!,
        opacity: '0',
      })
      el.append(p)
      pieces.push(p)
      const drift = Math.round((Math.random() - 0.5) * 220)
      const spin = Math.round((Math.random() - 0.5) * 900)
      const fall = h * (0.55 + Math.random() * 0.5)
      anims.push(
        p.animate(
          [
            { transform: 'translate(0, 0) rotate(0deg)', opacity: 0.9 },
            {
              transform: `translate(${drift * 0.6}px, ${fall * 0.7}px) rotate(${spin * 0.7}deg)`,
              opacity: 0.9,
              offset: 0.7,
            },
            { transform: `translate(${drift}px, ${fall}px) rotate(${spin}deg)`, opacity: 0 },
          ],
          {
            duration: 2200 + Math.random() * 1200,
            delay: Math.random() * 500,
            easing: 'cubic-bezier(0.3, 0.1, 0.5, 1)',
          },
        ),
      )
    }
    const done = window.setTimeout(() => pieces.forEach((p) => p.remove()), LIFE + 600)
    return () => {
      clearTimeout(done)
      anims.forEach((a) => a.cancel())
      pieces.forEach((p) => p.remove())
    }
  }, [])
  return (
    <div ref={host} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" />
  )
}
