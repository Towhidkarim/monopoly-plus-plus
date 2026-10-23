import { useEffect } from 'react'
import { sound } from './engine.ts'

/** A panel's whoosh: the open sound when it mounts, the close sound when it goes away. */
export function usePanelSound(): void {
  useEffect(() => {
    sound.play('ui.open')
    return () => sound.play('ui.close')
  }, [])
}
