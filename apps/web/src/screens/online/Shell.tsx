import type { ReactNode } from 'react'
import { SetupBackdrop } from '../SetupBackdrop.tsx'

const PANEL_WIDTH = 580

/** The setup screen's layout: the city behind, one panel on the left (or centered on phones). */
export function OnlineShell({ citySeed, children }: { citySeed: number; children: ReactNode }) {
  return (
    <div className="relative h-full bg-table">
      <SetupBackdrop citySeed={citySeed} panelWidth={PANEL_WIDTH} />
      <div className="relative flex h-full justify-center overflow-y-auto p-3 sm:p-6 lg:w-[580px] lg:justify-start lg:overflow-visible lg:p-8">
        <section className="my-auto flex max-h-full w-full max-w-xl animate-rise flex-col gap-4 overflow-y-auto rounded-[28px] border border-line bg-panel p-5 shadow-panel-lg sm:p-7 lg:my-0 lg:h-full lg:max-w-none">
          {children}
        </section>
      </div>
    </div>
  )
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-display text-[34px] leading-tight font-bold">{children}</h1>
      {sub && <p className="text-[15px] text-ink-muted">{sub}</p>}
    </div>
  )
}

/** A dismissible-looking note: errors in the alert tone, otherwise muted. */
export function Note({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'alert' }) {
  return (
    <p
      role={tone === 'alert' ? 'alert' : undefined}
      className={`rounded-xl px-3 py-2 text-sm ${tone === 'alert' ? 'bg-alert/15 text-alert' : 'bg-white/5 text-ink-muted'}`}
    >
      {children}
    </p>
  )
}
