import { useState } from 'react'
import { tokenColors } from '@skyline/board'
import { normalizeRoomCode, type CreateRoomResponse } from '@skyline/protocol'
import { citySeedOf } from '../../net/connection.ts'
import { defaultProfile, loadProfile, saveProfile, tokenStore, type Profile } from '../../net/session.ts'
import { cssHex } from '../../spaceInfo.ts'
import { Btn, Eyebrow } from '../game/ui.tsx'
import { Note, OnlineShell, Title } from './Shell.tsx'

/** Name and token color, remembered by this browser. */
export function ProfileFields({ profile, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>You</Eyebrow>
      <div className="flex items-center gap-3">
        <input
          value={profile.name}
          onChange={(e) => onChange({ ...profile, name: e.target.value.slice(0, 20) })}
          placeholder="Your name"
          aria-label="Your name"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-table px-3 text-[15px] font-semibold text-ink outline-none focus:border-accent/60"
        />
        <fieldset className="flex gap-1.5">
          <legend className="sr-only">Token color</legend>
          {tokenColors.map((c) => (
            <label
              key={c}
              className="size-7 cursor-pointer rounded-full outline-offset-2 transition-[scale,box-shadow] duration-200 ease-spring hover:scale-110 has-checked:scale-110 has-checked:ring-2 has-checked:ring-ink has-checked:ring-offset-2 has-checked:ring-offset-panel has-focus-visible:outline-2 has-focus-visible:outline-accent"
              style={{ background: cssHex(c) }}
            >
              <input
                type="radio"
                name="token-color"
                checked={profile.color === c}
                onChange={() => onChange({ ...profile, color: c })}
                aria-label={`Color ${cssHex(c)}`}
                className="sr-only"
              />
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  )
}

/** Play online: create a room, or join one by its code. */
export function OnlineMenu({ onBack, onRoom }: { onBack: () => void; onRoom: (code: string) => void }) {
  const [profile, setProfile] = useState<Profile>(() => loadProfile() ?? defaultProfile())
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const named = profile.name.trim().length > 0

  const go = async (work: () => Promise<string | null>) => {
    setBusy(true)
    setError(null)
    try {
      const room = await work()
      if (room) {
        saveProfile({ ...profile, name: profile.name.trim() })
        onRoom(room)
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const create = () =>
    go(async () => {
      const res = await fetch('/api/rooms', { method: 'POST' })
      const body: unknown = await res.json()
      if (!res.ok || !isCreated(body)) {
        setError(
          res.status === 429 ? 'Too many new rooms. Try again in a minute.' : 'Could not create a room.',
        )
        return null
      }
      tokenStore().set(body.code, body.token)
      return body.code
    })

  const join = () =>
    go(async () => {
      const room = normalizeRoomCode(code)
      if (!room) {
        setError('Room codes are five letters and digits.')
        return null
      }
      const res = await fetch(`/api/rooms/${room}`)
      if (res.status === 404) {
        setError(`No room ${room}. Check the code with your host.`)
        return null
      }
      return room
    })

  return (
    <OnlineShell citySeed={citySeedOf(code || 'SKYLINE')}>
      <Title sub="Play with friends: one of you creates a room and shares its code.">Play online</Title>
      <ProfileFields profile={profile} onChange={setProfile} />

      <div className="flex flex-col gap-2">
        <Eyebrow>New room</Eyebrow>
        <Btn
          kind="primary"
          disabled={!named || busy}
          onClick={() => void create()}
          className="h-14 rounded-[16px] text-lg"
        >
          Create room
        </Btn>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void join()
        }}
      >
        <Eyebrow>Have a code?</Eyebrow>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 7))}
            placeholder="ABCDE"
            aria-label="Room code"
            autoComplete="off"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-table px-3 text-center font-mono text-xl font-bold tracking-[0.3em] text-ink outline-none focus:border-accent/60"
          />
          <button
            type="submit"
            disabled={!named || busy || code.trim().length === 0}
            className="rounded-xl border border-line px-5 text-sm font-extrabold text-ink transition-colors enabled:hover:bg-white/5 disabled:opacity-40"
          >
            Join
          </button>
        </div>
      </form>

      {!named && <Note>Pick a name first; the other players see it.</Note>}
      {error && <Note tone="alert">{error}</Note>}

      <Btn kind="ghost" onClick={onBack} className="mt-auto self-start">
        ← Back
      </Btn>
    </OnlineShell>
  )
}

function isCreated(body: unknown): body is CreateRoomResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    'token' in body &&
    typeof body.code === 'string' &&
    typeof body.token === 'string'
  )
}
