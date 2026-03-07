'use client'

import { useState, useEffect, useCallback } from 'react'
import { Play, Lock, Webhook, Copy, Check, Zap, Sparkles, Globe, Key, ChevronDown, ChevronUp, Loader2, Bell, Clock, Volume2 } from 'lucide-react'
import useSWR from 'swr'

const LOCAL_URL = 'http://localhost:51700'
const fetcher = (url: string) => fetch(url).then(r => r.json())

// Check if running inside Electron
const electron = typeof window !== 'undefined' ? (window as any).electronAPI : null

// ── Sound presets (synced with notification.html) ─────────────────────────────
const SOUND_PRESETS = [
  { id: 'bell', emoji: '🔔', name: 'Bell', desc: 'Rich harmonic chord' },
  { id: 'trumpet', emoji: '🎺', name: 'Trumpet', desc: 'Sharp sawtooth fanfare' },
  { id: 'chime', emoji: '✨', name: 'Chime', desc: 'Ascending crystal notes' },
  { id: 'alarm', emoji: '🚨', name: 'Alarm', desc: 'Urgent double beep' },
  { id: 'horn', emoji: '📯', name: 'Horn', desc: 'Deep dramatic blast' },
  { id: 'ping', emoji: '💫', name: 'Ping', desc: 'Clean single tone' },
]

type SoundId = 'bell' | 'trumpet' | 'chime' | 'alarm' | 'horn' | 'ping'

// Web Audio preview — mirrors the sounds in notification.html
function previewSound(name: SoundId) {
  try {
    const ctx = new AudioContext()
    const t = ctx.currentTime
    if (name === 'bell') {
      [[880, .35, 1.8], [1320, .20, 1.2], [1760, .12, .8], [2200, .06, .5]].forEach(([f, g, d]) => {
        const o = ctx.createOscillator(), gn = ctx.createGain()
        o.connect(gn); gn.connect(ctx.destination); o.type = 'sine'; o.frequency.value = f
        gn.gain.setValueAtTime(0, t + .1); gn.gain.linearRampToValueAtTime(g, t + .13); gn.gain.exponentialRampToValueAtTime(.001, t + d); o.start(t + .1); o.stop(t + d + .05)
      })
    } else if (name === 'trumpet') {
      const o = ctx.createOscillator(), gn = ctx.createGain(), filt = ctx.createBiquadFilter()
      o.connect(filt); filt.connect(gn); gn.connect(ctx.destination); o.type = 'sawtooth'; filt.type = 'lowpass'
      o.frequency.setValueAtTime(587, t); o.frequency.linearRampToValueAtTime(880, t + .08)
      filt.frequency.setValueAtTime(800, t); filt.frequency.exponentialRampToValueAtTime(3200, t + .12)
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(.3, t + .06); gn.gain.setValueAtTime(.3, t + .3); gn.gain.exponentialRampToValueAtTime(.001, t + .9)
      o.start(t); o.stop(t + 1)
    } else if (name === 'chime') {
      [1047, 1319, 1568, 2093].forEach((f, i) => {
        const o = ctx.createOscillator(), gn = ctx.createGain(); o.connect(gn); gn.connect(ctx.destination); o.type = 'sine'; o.frequency.value = f
        const s = t + i * .13; gn.gain.setValueAtTime(0, s); gn.gain.linearRampToValueAtTime(.28, s + .02); gn.gain.exponentialRampToValueAtTime(.001, s + 1.2); o.start(s); o.stop(s + 1.3)
      })
    } else if (name === 'alarm') {
      [[0, .32], [.22, .1]].forEach(([delay, off]) => {
        const o = ctx.createOscillator(), gn = ctx.createGain(); o.connect(gn); gn.connect(ctx.destination)
        o.type = 'square'; o.frequency.value = 1047; const s = t + delay
        gn.gain.setValueAtTime(.25, s); gn.gain.setValueAtTime(0, s + .18 - off); o.start(s); o.stop(s + .2)
      })
    } else if (name === 'horn') {
      const o = ctx.createOscillator(), gn = ctx.createGain(), filt = ctx.createBiquadFilter()
      o.connect(filt); filt.connect(gn); gn.connect(ctx.destination); o.type = 'sawtooth'; filt.type = 'lowpass'; filt.frequency.value = 600; o.frequency.value = 220
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(.4, t + .1); gn.gain.setValueAtTime(.4, t + .5); gn.gain.exponentialRampToValueAtTime(.001, t + 1.2); o.start(t); o.stop(t + 1.3)
    } else if (name === 'ping') {
      const o = ctx.createOscillator(), gn = ctx.createGain(); o.connect(gn); gn.connect(ctx.destination); o.type = 'sine'; o.frequency.value = 1760
      gn.gain.setValueAtTime(.5, t); gn.gain.exponentialRampToValueAtTime(.001, t + .8); o.start(t); o.stop(t + .85)
    }
  } catch { /* ignore */ }
}

function SoundPicker() {
  const [selected, setSelected] = useState<SoundId>('bell')

  useEffect(() => {
    if (!electron) return
    electron.getAlertSound?.().then((s: SoundId) => { if (s) setSelected(s) })
  }, [])

  const handleSelect = async (id: SoundId) => {
    setSelected(id)
    previewSound(id)
    if (electron) await electron.setAlertSound?.(id)
  }

  return (
    <div className="glass-card rounded-2xl p-5 relative overflow-hidden">
      <div className="absolute -top-8 -right-8 w-20 h-20 bg-amber-400/4 rounded-full blur-2xl pointer-events-none" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center rounded-lg bg-amber-400/10 p-1.5">
            <Volume2 className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <h3 className="text-sm font-bold">Alert Sound</h3>
          <span className="ml-auto text-[10px] text-muted-foreground/40">click to preview</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SOUND_PRESETS.map(({ id, emoji, name, desc }) => {
            const active = selected === id
            return (
              <button
                key={id}
                onClick={() => handleSelect(id as SoundId)}
                className={`flex flex-col items-center gap-1.5 rounded-xl p-3 border transition-all duration-200 cursor-pointer text-center ${active
                  ? 'bg-amber-400/10 border-amber-400/30 shadow-[0_0_14px_-4px_rgba(251,191,36,0.25)]'
                  : 'bg-secondary/30 border-border/20 hover:border-border/50 hover:bg-secondary/50'
                  }`}
              >
                <span className="text-xl">{emoji}</span>
                <span className={`text-[11px] font-bold ${active ? 'text-amber-400' : 'text-foreground/80'}`}>{name}</span>
                <span className="text-[9.5px] text-muted-foreground/40 leading-tight">{desc}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function AlertPanel() {
  const [isSimulating, setIsSimulating] = useState(false)
  const [isLocking, setIsLocking] = useState(false)
  const [simSuccess, setSimSuccess] = useState(false)
  const [lockSuccess, setLockSuccess] = useState(false)
  const [copiedLocal, setCopiedLocal] = useState(false)
  const [copiedTunnel, setCopiedTunnel] = useState(false)

  // ngrok tunnel state
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null)
  const [tunnelLoading, setTunnelLoading] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [tokenSaved, setTokenSaved] = useState(false)

  // Load saved token and existing tunnel URL on mount
  useEffect(() => {
    if (!electron) return
    electron.getTunnelUrl().then((url: string | null) => {
      if (url) setTunnelUrl(url)
    })
    electron.getSavedToken().then((token: string | null) => {
      if (token) {
        setTokenInput(token)
        setTokenSaved(true)
      }
    })
  }, [])

  const simulateAlert = async () => {
    setIsSimulating(true)
    try {
      await fetch(`${LOCAL_URL}/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: 'SIMULATED', message: 'Test alert from dashboard' }),
      })
      setSimSuccess(true)
      setTimeout(() => setSimSuccess(false), 2500)
    } catch (e) {
      console.error(e)
    } finally {
      setIsSimulating(false)
    }
  }

  const forceLock = async () => {
    setIsLocking(true)
    try {
      await fetch(`${LOCAL_URL}/lock`, { method: 'POST' })
      setLockSuccess(true)
      setTimeout(() => setLockSuccess(false), 2500)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLocking(false)
    }
  }

  const copyUrl = (url: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(url).then(() => {
      setter(true)
      setTimeout(() => setter(false), 2000)
    })
  }

  const handleStartTunnel = useCallback(async () => {
    if (!electron) return
    setTunnelLoading(true)
    try {
      const token = tokenInput.trim()
      if (token && token !== (await electron.getSavedToken())) {
        await electron.saveToken(token)
        setTokenSaved(true)
      }
      const result = await electron.startTunnel(token || null)
      if (result?.url) {
        setTunnelUrl(result.url)
        setShowTokenInput(false)
      }
    } finally {
      setTunnelLoading(false)
    }
  }, [tokenInput])

  const handleStopTunnel = async () => {
    if (!electron) return
    await electron.stopTunnel()
    setTunnelUrl(null)
  }

  const { data: status } = useSWR(`${LOCAL_URL}/status`, fetcher, { refreshInterval: 3000 })

  const webhookUrl = tunnelUrl ? `${tunnelUrl}/alert` : `${LOCAL_URL}/alert`
  const isExternal = !!tunnelUrl

  const lastTicker = status?.lastAlertTicker
  const lastMessage = status?.lastAlertMessage
  const lastTime = status?.lastAlertTime
    ? new Date(status.lastAlertTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up">

      {/* ── Last Alert Received Banner ── */}
      <div className="glass-card rounded-2xl overflow-hidden relative">
        <div className="absolute -top-10 -left-10 w-24 h-24 bg-amber-400/5 rounded-full blur-2xl pointer-events-none" />
        <div className="h-[2px] w-full bg-gradient-to-r from-amber-400/60 via-amber-300/30 to-transparent" />
        <div className="relative p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center rounded-lg bg-amber-400/10 p-1.5">
              <Bell className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">Last Alert Received</span>
          </div>

          {lastTicker ? (
            <div className="glass-inner rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0 text-xs font-mono font-bold text-primary bg-primary/10 border border-primary/15 px-2.5 py-1 rounded-md">
                  {lastTicker}
                </span>
                <span className="text-xs text-muted-foreground/60 truncate">{lastMessage}</span>
              </div>
              {lastTime && (
                <div className="flex items-center gap-1 shrink-0">
                  <Clock className="h-3 w-3 text-muted-foreground/30" />
                  <span className="text-[10px] font-mono text-muted-foreground/40">{lastTime}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-inner rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400/40" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400/60" />
              </span>
              <span className="text-xs text-muted-foreground/35 italic">Waiting for TradingView alert...</span>
            </div>
          )}
        </div>
      </div>

      {/* Sound Picker */}
      <SoundPicker />

      {/* Quick Actions */}
      <div className="glass-card rounded-2xl overflow-hidden relative">
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="h-[2px] w-full gradient-primary" />
        <div className="relative p-6">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="flex items-center justify-center rounded-lg bg-primary/10 p-1.5">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-bold">Quick Actions</h3>
          </div>
          <p className="text-[11px] text-muted-foreground/50 mb-5 pl-8">
            Test your FocusGuard system in one click
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={simulateAlert}
              disabled={isSimulating || status?.hardLockMode}
              className={`group relative w-full flex items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${simSuccess
                ? 'bg-primary/15 text-primary border border-primary/25 glow-primary'
                : 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary border border-primary/15 hover:border-primary/30 hover:from-primary/15 hover:to-primary/10 hover:shadow-[0_0_20px_-5px_rgba(56,210,248,0.2)]'
                }`}
            >
              {simSuccess ? <><Sparkles className="h-4 w-4" />Alert Sent!</> : <><Play className="h-3.5 w-3.5" />{status?.hardLockMode ? 'Disabled in Hard Lock' : isSimulating ? 'Sending...' : 'Simulate Alert'}</>}
            </button>
            <button
              onClick={forceLock}
              disabled={isLocking}
              className={`group relative w-full flex items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${lockSuccess
                ? 'bg-destructive/15 text-destructive border border-destructive/25 glow-danger'
                : 'bg-gradient-to-r from-destructive/10 to-destructive/5 text-destructive border border-destructive/15 hover:border-destructive/30 hover:from-destructive/15 hover:to-destructive/10'
                }`}
            >
              {lockSuccess ? <><Check className="h-4 w-4" />Apps Locked!</> : <><Lock className="h-3.5 w-3.5" />{isLocking ? 'Locking...' : 'Force Lock All Apps'}</>}
            </button>
          </div>
        </div>
      </div>

      {/* Webhook URL Card */}
      <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center rounded-lg bg-muted/50 p-1.5">
                <Webhook className="h-4 w-4 text-muted-foreground/70" />
              </div>
              <h3 className="text-sm font-bold">Webhook Endpoint</h3>
            </div>
            <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${isExternal
              ? 'bg-primary/10 text-primary border border-primary/15'
              : 'bg-muted/50 text-muted-foreground/50 border border-border/30'
              }`}>
              <Globe className="h-2.5 w-2.5" />
              {isExternal ? 'Public' : 'Local only'}
            </div>
          </div>

          {/* URL Display */}
          <div className="glass-inner rounded-xl p-0.5 mb-3">
            <div className="flex items-center justify-between bg-background/40 rounded-[10px] pl-4 pr-1.5 py-1.5">
              <code className="text-xs font-mono text-primary/80 truncate">
                {webhookUrl}
              </code>
              <button
                onClick={() => copyUrl(webhookUrl, isExternal ? setCopiedTunnel : setCopiedLocal)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 shrink-0 cursor-pointer"
              >
                {(isExternal ? copiedTunnel : copiedLocal) ? (
                  <><Check className="h-3 w-3 text-primary" /><span className="text-primary">Copied</span></>
                ) : (
                  <><Copy className="h-3 w-3" /><span>Copy</span></>
                )}
              </button>
            </div>
          </div>

          {/* ngrok Tunnel Controls */}
          {electron && (
            <div className="mt-3">
              {!tunnelUrl ? (
                <>
                  <button
                    onClick={() => setShowTokenInput(v => !v)}
                    className="w-full flex items-center justify-between glass-inner rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground/60 hover:text-foreground/80 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5" />
                      <span>Make public for TradingView</span>
                    </div>
                    {showTokenInput ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>

                  {showTokenInput && (
                    <div className="mt-2 flex flex-col gap-2 animate-fade-in-up">
                      <div className="flex items-center gap-2 glass-inner rounded-xl p-0.5">
                        <div className="flex-1 flex items-center gap-2 bg-background/40 rounded-[10px] pl-3 pr-2 py-2">
                          <Key className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                          <input
                            type="password"
                            value={tokenInput}
                            onChange={e => setTokenInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleStartTunnel()}
                            placeholder="ngrok auth token..."
                            className="flex-1 bg-transparent text-xs font-mono text-foreground/80 placeholder:text-muted-foreground/30 outline-none min-w-0"
                          />
                        </div>
                        <button
                          onClick={handleStartTunnel}
                          disabled={tunnelLoading || !tokenInput.trim()}
                          className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold bg-primary/15 text-primary border border-primary/20 hover:bg-primary/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {tunnelLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
                          {tunnelLoading ? 'Starting...' : 'Connect'}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground/30 px-1">
                        Free token at <span className="text-primary/60">ngrok.com</span>{tokenSaved ? ' · Token saved ✓' : ''}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between glass-inner rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(56,210,248,0.5)]" />
                    <span className="text-[11px] text-primary/80 font-medium">Tunnel active — TradingView can reach you</span>
                  </div>
                  <button
                    onClick={handleStopTunnel}
                    className="text-[10px] text-muted-foreground/40 hover:text-destructive/60 transition-colors cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          )}

          {!electron && (
            <p className="text-[10px] text-muted-foreground/30 mt-2">
              Use <code className="font-mono bg-secondary/50 px-1.5 rounded text-muted-foreground/50">ngrok http 51700</code> for external access
            </p>
          )}
        </div>
      </div>

      {/* How It Works */}
      <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-20 h-20 bg-primary/3 rounded-full blur-2xl pointer-events-none" />
        <div className="relative">
          <h3 className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-[0.15em] mb-4">How It Works</h3>
          <div className="flex flex-col gap-3">
            {[
              { icon: '🎯', text: 'Set TradingView alert → paste the webhook URL above' },
              { icon: '⚡', text: 'Alert fires → apps unlock & auto-launch' },
              { icon: '🔒', text: 'Timer expires → apps killed & re-locked' },
            ].map(({ icon, text }, i) => (
              <div key={i} className="flex items-center gap-3 group">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg glass-inner text-sm shrink-0 group-hover:scale-110 transition-transform">{icon}</div>
                <span className="text-xs text-muted-foreground/60 group-hover:text-muted-foreground/80 transition-colors">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
