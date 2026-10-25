import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ART } from '@skyline/board'
import './index.css'
import { App } from './App.tsx'
import { applyCursorPref } from './cursors.ts'
import { loadPrefs, syncReducedMotion } from './game/prefs.ts'

applyCursorPref(loadPrefs().cursor ?? 'game')
syncReducedMotion(loadPrefs().reducedMotion ?? false)

// Richer city look draft (DECISIONS.md D31); `?rich=0` shows the flat kit for comparison.
ART.rich = new URLSearchParams(window.location.search).get('rich') !== '0'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
