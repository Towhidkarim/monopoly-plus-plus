import { BoardCanvas } from './BoardCanvas.tsx'

export function App() {
  return (
    <div className="flex h-full">
      <BoardCanvas />
      <aside className="w-80 shrink-0 border-l border-line bg-panel p-5">
        <h1 className="mb-2 text-2xl font-semibold text-accent">Skyline</h1>
        <p className="leading-relaxed text-ink-muted">
          Board world renders on the left (Pixi). This panel is the React shell.
        </p>
      </aside>
    </div>
  )
}
