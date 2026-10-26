import { useState, useSyncExternalStore } from 'react'
import { PERSONALITIES } from '@skyline/bots'
import { MIN_SEATS, type ErrorCode, type LobbyInfo, type SeatInfo } from '@skyline/protocol'
import { citySeedOf, type RoomConnection, type RoomView } from '../../net/connection.ts'
import {
  defaultProfile,
  leaveRoom,
  loadProfile,
  roomConnection,
  saveProfile,
  type Profile,
} from '../../net/session.ts'
import { cssHex } from '../../spaceInfo.ts'
import { GameScreen } from '../GameScreen.tsx'
import { Btn, Eyebrow } from '../game/ui.tsx'
import { ProfileFields } from './OnlineMenu.tsx'
import { Note, OnlineShell, Title } from './Shell.tsx'

const MODES = [
  { preset: 'standard', label: 'Standard' },
  { preset: 'turbo', label: 'Turbo' },
  { preset: 'classic', label: 'Classic' },
] as const

const TIMERS = [
  { seconds: 0, label: 'No timer' },
  { seconds: 30, label: '30 s a move' },
  { seconds: 60, label: '1 min a move' },
  { seconds: 120, label: '2 min a move' },
] as const

const BOTS = Object.entries(PERSONALITIES).map(([key, p]) => ({ key, name: p.name }))

/** Why we are not (or no longer) in the room, in words. */
const FAREWELL: Partial<Record<ErrorCode | 'not_found', string>> = {
  room_full: 'This room is full.',
  room_locked: 'The host locked this room.',
  game_running: 'This game has already started.',
  bad_token: 'Your seat in this game is gone.',
  kicked: 'The host removed you from the room.',
  replaced: 'You opened this room in another tab.',
  version_mismatch: 'A newer version of the game is out. Reload the page.',
  not_found: 'This room does not exist. Rooms close after a day without play.',
}

/** `/r/<code>`: asks for a name if needed, then the lobby, then the game. */
export function RoomScreen({ code, onExit }: { code: string; onExit: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(loadProfile)
  if (!profile?.name) return <NameGate code={code} onDone={setProfile} onExit={onExit} />
  return <Room code={code} profile={profile} onExit={onExit} />
}

function Room({ code, profile, onExit }: { code: string; profile: Profile; onExit: () => void }) {
  const conn = roomConnection(code, profile)
  const view = useSyncExternalStore(conn.subscribe, conn.getSnapshot)
  const leave = () => {
    leaveRoom()
    onExit()
  }

  if (view.store && view.lobby && view.lobby.phase !== 'lobby')
    return (
      <>
        <GameScreen key={code} store={view.store} onQuit={leave} onRestart={leave} />
        {view.status !== 'open' && <ConnectionBanner view={view} onExit={leave} />}
      </>
    )

  return (
    <OnlineShell citySeed={citySeedOf(code)}>
      {view.lobby && view.seat !== null ? (
        <Lobby conn={conn} lobby={view.lobby} seat={view.seat} view={view} onLeave={leave} />
      ) : (
        <Waiting view={view} code={code} onExit={leave} />
      )}
    </OnlineShell>
  )
}

function NameGate({
  code,
  onDone,
  onExit,
}: {
  code: string
  onDone: (p: Profile) => void
  onExit: () => void
}) {
  const [profile, setProfile] = useState<Profile>(() => loadProfile() ?? defaultProfile())
  const ok = profile.name.trim().length > 0
  const done = () => {
    const p = { ...profile, name: profile.name.trim() }
    saveProfile(p)
    onDone(p)
  }
  return (
    <OnlineShell citySeed={citySeedOf(code)}>
      <Title sub={`You're joining room ${code}.`}>Join the game</Title>
      <ProfileFields profile={profile} onChange={setProfile} />
      <Btn kind="primary" disabled={!ok} onClick={done} className="h-14 rounded-[16px] text-lg">
        Join room
      </Btn>
      <Btn kind="ghost" onClick={onExit} className="mt-auto self-start">
        ← Back
      </Btn>
    </OnlineShell>
  )
}

function Waiting({ view, code, onExit }: { view: RoomView; code: string; onExit: () => void }) {
  const gone = view.status === 'closed' || (view.error !== null && view.lobby === null)
  return (
    <>
      <Title sub={gone ? undefined : 'Connecting…'}>Room {code}</Title>
      {gone && (
        <Note tone="alert">{(view.error && FAREWELL[view.error.code]) ?? 'Could not join this room.'}</Note>
      )}
      {view.status === 'reconnecting' && <Note>Connection lost. Reconnecting…</Note>}
      <Btn kind="ghost" onClick={onExit} className="mt-auto self-start">
        ← Back
      </Btn>
    </>
  )
}

/** Over the game: reconnecting, or why the game ended for us. */
function ConnectionBanner({ view, onExit }: { view: RoomView; onExit: () => void }) {
  const closed = view.status === 'closed'
  return (
    <div className="pointer-events-auto fixed top-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-panel px-5 py-2.5 text-sm font-semibold shadow-panel">
      <span className={`size-2 rounded-full ${closed ? 'bg-alert' : 'animate-pulse bg-accent'}`} />
      {closed
        ? ((view.error && FAREWELL[view.error.code]) ?? 'Disconnected from the room.')
        : 'Reconnecting…'}
      {closed && (
        <Btn kind="secondary" onClick={onExit} className="py-1">
          Leave
        </Btn>
      )}
    </div>
  )
}

function Lobby({
  conn,
  lobby,
  seat,
  view,
  onLeave,
}: {
  conn: RoomConnection
  lobby: LobbyInfo
  seat: number
  view: RoomView
  onLeave: () => void
}) {
  const me = lobby.seats[seat]!
  const host = me.host
  const filled = lobby.seats.filter((s) => s.kind !== 'empty')
  const waitingFor = filled.filter((s) => s.kind === 'human' && !s.ready)
  const canStart = filled.length >= MIN_SEATS && waitingFor.length === 0
  const settings = lobby.settings
  const setSettings = (patch: Partial<typeof settings>) =>
    conn.send({ type: 'settings', settings: { ...settings, ...patch } })

  return (
    <>
      <InviteCard code={lobby.code} />

      <div className="flex flex-col gap-2">
        <Eyebrow>
          Players · {filled.length} of {lobby.seats.length}
        </Eyebrow>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {lobby.seats.map((s) => (
            <SeatCard key={s.seat} s={s} me={s.seat === seat} host={host} conn={conn} />
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <Eyebrow>Rules {host ? '' : '· set by the host'}</Eyebrow>
        <div className="flex flex-wrap items-center gap-2">
          {MODES.map((m) => (
            <button
              key={m.preset}
              type="button"
              disabled={!host}
              aria-pressed={settings.preset === m.preset}
              onClick={() => setSettings({ preset: m.preset })}
              className={`rounded-full px-3.5 py-1.5 text-sm font-extrabold transition-colors disabled:cursor-default ${
                settings.preset === m.preset
                  ? 'bg-card text-card-ink'
                  : 'border border-line text-ink-muted enabled:hover:bg-white/5'
              }`}
            >
              {m.label}
            </button>
          ))}
          <select
            value={settings.turnSeconds}
            disabled={!host}
            onChange={(e) => setSettings({ turnSeconds: Number(e.target.value) })}
            aria-label="Turn timer"
            className="h-9 rounded-full border border-line bg-table px-3 text-sm font-semibold text-ink outline-none disabled:opacity-70"
          >
            {TIMERS.map((t) => (
              <option key={t.seconds} value={t.seconds} className="bg-panel">
                {t.label}
              </option>
            ))}
          </select>
          {host && (
            <label className="ml-auto flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={lobby.locked}
                onChange={(e) => conn.send({ type: 'lock', locked: e.target.checked })}
                className="size-4 accent-[var(--color-accent)]"
              />
              Lock room
            </label>
          )}
        </div>
      </div>

      {view.status === 'reconnecting' && <Note>Connection lost. Reconnecting…</Note>}
      {view.error && <Note tone="alert">{FAREWELL[view.error.code] ?? view.error.message}</Note>}

      <div className="sticky -bottom-5 z-10 mt-auto -mr-5 -mb-5 -ml-5 flex flex-col gap-3 rounded-b-[28px] border-t border-line bg-panel px-5 pt-3 pb-5 sm:-bottom-7 sm:-mr-7 sm:-mb-7 sm:-ml-7 sm:px-7 sm:pb-7">
        <div className="flex gap-2">
          <Btn
            kind={me.ready ? 'secondary' : 'primary'}
            onClick={() => conn.send({ type: 'ready', ready: !me.ready })}
            className="h-14 flex-1 rounded-[16px] text-lg"
          >
            {me.ready ? 'Not ready' : "I'm ready"}
          </Btn>
          {host && (
            <Btn
              kind="primary"
              disabled={!canStart}
              onClick={() => conn.send({ type: 'start' })}
              className="h-14 flex-1 rounded-[16px] text-lg shadow-gold-lg"
            >
              Start game
            </Btn>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
          <span>
            {filled.length < MIN_SEATS
              ? 'Invite a friend or add a bot to start.'
              : waitingFor.length > 0
                ? `Waiting for ${waitingFor.map((s) => s.name).join(', ')} to be ready.`
                : host
                  ? 'Everyone is ready.'
                  : 'Everyone is ready. The host starts the game.'}
          </span>
          <Btn kind="ghost" onClick={onLeave} className="py-1">
            Leave room
          </Btn>
        </div>
      </div>
    </>
  )
}

/** The room code, big, with the invite link to copy (or share on phones). */
function InviteCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/r/${code}`
  const share = async () => {
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches)
        await navigator.share({ title: 'Join my Skyline game', url: link })
      else {
        await navigator.clipboard.writeText(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }
    } catch {
      // Share sheet dismissed or clipboard blocked: the code is on screen anyway.
    }
  }
  return (
    <div className="flex items-center gap-4 rounded-[18px] bg-card p-4 text-card-ink shadow-card">
      <div className="flex flex-col">
        <span className="text-xs font-bold tracking-wide text-card-muted uppercase">Room code</span>
        <span className="font-mono text-[40px] leading-none font-black tracking-[0.18em]">{code}</span>
      </div>
      <button
        type="button"
        onClick={() => void share()}
        className="ml-auto rounded-xl bg-[#1f2a3d] px-4 py-3 text-sm font-extrabold text-white transition-[scale,filter] duration-200 ease-spring hover:brightness-110 active:scale-[0.97]"
      >
        {copied ? 'Link copied!' : 'Copy invite link'}
      </button>
    </div>
  )
}

function SeatCard({ s, me, host, conn }: { s: SeatInfo; me: boolean; host: boolean; conn: RoomConnection }) {
  const [bot, setBot] = useState('balanced')
  if (s.kind === 'empty')
    return (
      <li className="flex h-16 items-center gap-2 rounded-2xl border border-dashed border-line px-3 text-sm text-ink-muted">
        {host ? (
          <>
            <select
              value={bot}
              onChange={(e) => setBot(e.target.value)}
              aria-label={`Bot for seat ${s.seat + 1}`}
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-table px-2 text-sm text-ink outline-none"
            >
              {BOTS.map((b) => (
                <option key={b.key} value={b.key} className="bg-panel">
                  {b.name} bot
                </option>
              ))}
            </select>
            <Btn
              kind="secondary"
              onClick={() => conn.send({ type: 'set_bot', seat: s.seat, personality: bot })}
              className="px-3"
            >
              Add
            </Btn>
          </>
        ) : (
          'Open seat'
        )}
      </li>
    )
  const status = s.kind === 'bot' ? 'Bot' : !s.connected ? 'Away' : s.ready ? 'Ready' : 'Not ready'
  return (
    <li
      className={`flex h-16 items-center gap-3 rounded-2xl border px-3 ${me ? 'border-accent/60 bg-accent/5' : 'border-line bg-white/[0.03]'}`}
    >
      <span
        className="size-8 shrink-0 rounded-full shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]"
        style={{ background: cssHex(s.color) }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-bold">
          {s.name}
          {me && <span className="text-ink-muted"> (you)</span>}
        </span>
        <span className={`text-xs ${s.ready || s.kind === 'bot' ? 'text-emerald-300' : 'text-ink-muted'}`}>
          {s.host ? 'Host · ' : ''}
          {status}
        </span>
      </span>
      {host && !me && (
        <button
          type="button"
          onClick={() =>
            conn.send(
              s.kind === 'bot'
                ? { type: 'set_bot', seat: s.seat, personality: null }
                : { type: 'kick', seat: s.seat },
            )
          }
          aria-label={s.kind === 'bot' ? `Remove ${s.name}` : `Remove ${s.name} from the room`}
          className="rounded-lg px-2 py-1 text-xs font-bold text-ink-muted transition-colors hover:bg-white/5 hover:text-alert"
        >
          Remove
        </button>
      )}
    </li>
  )
}
