'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppState, useAppActions } from '@/lib/store'
import { Slider } from '@/components/ui/slider'
import { Timer, Lock, Shield, Gauge, Check, AlertTriangle, KeyRound, ShieldAlert, RefreshCw } from 'lucide-react'
import useSWR from 'swr'

const formatTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`
}

const BLOCKER_URL = 'http://localhost:51700'
const fetcher = (url: string) => fetch(url).then(r => r.json()).catch(() => null)

const electron = typeof window !== 'undefined' ? (window as any).electronAPI : null

export function SettingsPanel() {
  const { unlockDurationMinutes } = useAppState()
  const { setUnlockDuration } = useAppActions()

  const [isUpdating, setIsUpdating] = useState(false)
  const [localDuration, setLocalDuration] = useState(unlockDurationMinutes)

  // Hard Lock Mode state
  const [hardLockEnabled, setHardLockEnabled] = useState(false)
  const [hardLockToggling, setHardLockToggling] = useState(false)

  // Emergency codes state
  const [codeInfo, setCodeInfo] = useState<{ remaining: number; generated: boolean; cooldownUntil: string | null }>({ remaining: 0, generated: false, cooldownUntil: null })
  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null)
  const [useCodeInput, setUseCodeInput] = useState('')
  const [useCodeError, setUseCodeError] = useState('')
  const [useCodeSuccess, setUseCodeSuccess] = useState(false)
  const [showUseInput, setShowUseInput] = useState(false)

  const { data: blockerData, mutate } = useSWR(
    `${BLOCKER_URL}/status`,
    fetcher,
    {
      refreshInterval: 2000,
      onSuccess: (data) => {
        if (data?.unlockMinutes && data.unlockMinutes !== localDuration) {
          setLocalDuration(data.unlockMinutes)
          setUnlockDuration(data.unlockMinutes)
        }
        if (data?.hardLockMode !== undefined) setHardLockEnabled(!!data.hardLockMode)
      },
    }
  )

  const agentOnline = !!blockerData
  const isLocked = blockerData?.isLocked ?? true
  const isDisabled = blockerData?.disabled ?? false

  // Load emergency code info
  useEffect(() => {
    if (!electron) return
    electron.getEmergencyCodes?.().then((info: any) => { if (info) setCodeInfo(info) })
  }, [])

  useEffect(() => {
    setLocalDuration(unlockDurationMinutes)
  }, [unlockDurationMinutes])

  const handleDurationChange = useCallback(
    async (value: number[]) => {
      const newDuration = value[0]
      setLocalDuration(newDuration)
      if (!agentOnline) return
      try {
        setIsUpdating(true)
        const response = await fetch(`${BLOCKER_URL}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unlockMinutes: newDuration }),
        })
        if (response.ok) {
          setUnlockDuration(newDuration)
          setTimeout(() => mutate(), 500)
        }
      } catch (error) {
        console.error('Failed to update duration:', error)
      } finally {
        setIsUpdating(false)
      }
    },
    [agentOnline, setUnlockDuration, mutate]
  )

  const handleForceLock = useCallback(async () => {
    try {
      const res = await fetch(`${BLOCKER_URL}/lock`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        console.warn(data.error)
      }
      setTimeout(() => mutate(), 500)
    } catch (error) {
      console.error('Failed to force lock:', error)
    }
  }, [mutate])

  const handleToggleBlocker = useCallback(async () => {
    const electron = (window as any).electronAPI
    if (!electron) return
    try {
      if (isDisabled) {
        await electron.enableBlocker()
      } else {
        await electron.disableBlocker()
      }
      setTimeout(() => mutate(), 300)
    } catch (error) {
      console.error('Failed to toggle blocker:', error)
    }
  }, [isDisabled, mutate])

  const handleHardLockToggle = async () => {
    if (!agentOnline) return
    setHardLockToggling(true)
    const newVal = !hardLockEnabled
    try {
      await fetch(`${BLOCKER_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hardLockMode: newVal }),
      })
      setHardLockEnabled(newVal)
      setTimeout(() => mutate(), 300)
    } finally {
      setHardLockToggling(false)
    }
  }

  const handleGenerateCodes = async () => {
    if (!electron) return
    const result = await electron.generateEmergencyCodes?.()
    if (result?.codes) {
      setGeneratedCodes(result.codes)
      setCodeInfo(prev => ({ ...prev, remaining: 5, generated: true }))
    }
  }

  const handleUseCode = async () => {
    if (!electron || !useCodeInput) return
    setUseCodeError('')
    const result = await electron.useEmergencyCode?.(useCodeInput)
    if (result?.ok) {
      setUseCodeSuccess(true)
      setCodeInfo(prev => ({ ...prev, remaining: result.remaining, cooldownUntil: result.cooldownUntil }))
      setShowUseInput(false)
      setUseCodeInput('')
      setTimeout(() => { setUseCodeSuccess(false); mutate() }, 3000)
    } else {
      setUseCodeError(result?.error || 'Invalid code')
    }
  }

  const durationPercent = Math.min((localDuration / 120) * 100, 100)
  const cooldownActive = codeInfo.cooldownUntil && new Date(codeInfo.cooldownUntil) > new Date()

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
      {/* Duration Slider Card */}
      <div className="glass-card rounded-2xl overflow-hidden relative">
        <div className="absolute -top-12 -left-12 w-28 h-28 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="h-[2px] w-full gradient-primary" />
        <div className="relative p-6">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center rounded-lg bg-primary/10 p-1.5">
                <Timer className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-sm font-bold">Unlock Duration</h3>
            </div>
            {isUpdating && (
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-breathe" />
                <span className="text-xs text-primary/60">Saving</span>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground/80 mb-6 pl-8">
            Time apps stay open after an alert
          </p>

          {/* Big Duration Display */}
          <div className="flex justify-center mb-6">
            <div className="glass-inner rounded-2xl w-40 h-40 flex flex-col items-center justify-center relative">
              {/* Arc background */}
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="3" />
                <circle
                  cx="80" cy="80" r="70"
                  fill="none"
                  stroke="url(#duration-grad)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 70}
                  strokeDashoffset={2 * Math.PI * 70 * (1 - durationPercent / 100)}
                  className="transition-all duration-300"
                />
                <defs>
                  <linearGradient id="duration-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#67e8f9" />
                    <stop offset="100%" stopColor="#818cf8" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="text-3xl font-mono font-bold text-primary stat-value">
                {localDuration}
              </span>
              <span className="text-xs text-muted-foreground/70 mt-0.5 uppercase tracking-wider font-medium">
                {localDuration === 1 ? 'minute' : 'minutes'}
              </span>
            </div>
          </div>

          {/* Slider */}
          <div className="px-1">
            <Slider
              value={[localDuration]}
              onValueChange={handleDurationChange}
              min={1}
              max={120}
              step={1}
              className="w-full"
              disabled={!agentOnline || isUpdating}
            />
            <div className="flex justify-between text-[11px] text-muted-foreground/60 mt-2 font-mono">
              <span>1m</span>
              <span>15m</span>
              <span>30m</span>
              <span>1h</span>
              <span>2h</span>
            </div>
          </div>

          {!agentOnline && (
            <p className="text-xs text-destructive/60 mt-3 text-center">
              Agent offline — changes won't apply
            </p>
          )}
        </div>
      </div>

      {/* Emergency Lock */}
      <div className={`
        glass-card rounded-2xl p-6 relative overflow-hidden transition-all duration-500
        ${!isLocked ? 'animate-glow-border-danger' : ''}
      `}>
        {!isLocked && (
          <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-destructive/8 rounded-full blur-2xl pointer-events-none" />
        )}
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className={`flex items-center justify-center rounded-lg p-1.5 ${!isLocked ? 'bg-destructive/10' : 'bg-muted/50'
                }`}>
                <Lock className={`h-4 w-4 ${!isLocked ? 'text-destructive' : 'text-muted-foreground/80'}`} />
              </div>
              <h3 className="text-sm font-bold">Emergency Lock</h3>
            </div>
            <p className="text-xs text-muted-foreground/70 pl-8">
              {!isLocked ? 'Kill apps & re-lock immediately' : 'Apps are already blocked'}
            </p>
          </div>
          <button
            onClick={handleForceLock}
            disabled={isLocked || !agentOnline}
            className={`
              flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold
              transition-all duration-300 shrink-0 cursor-pointer
              disabled:opacity-30 disabled:cursor-not-allowed
              ${!isLocked
                ? 'bg-destructive/15 text-destructive border border-destructive/20 hover:bg-destructive/25 hover:border-destructive/30 hover:shadow-[0_0_20px_-5px_rgba(248,80,56,0.2)]'
                : 'bg-secondary/50 text-muted-foreground/70 border border-border/50'}
            `}
          >
            <Lock className="h-3 w-3" />
            Lock Now
          </button>
        </div>
      </div>

      {/* Stop / Resume Blocker */}
      <div className={`
        glass-card rounded-2xl p-6 relative overflow-hidden transition-all duration-500
        ${isDisabled ? 'border border-emerald-500/30 shadow-[0_0_30px_-8px_rgba(52,211,153,0.2)]' : ''}
      `}>
        {isDisabled && (
          <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-emerald-500/8 rounded-full blur-2xl pointer-events-none" />
        )}
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className={`flex items-center justify-center rounded-lg p-1.5 ${isDisabled ? 'bg-emerald-500/15' : 'bg-muted/50'}`}>
                <ShieldAlert className={`h-4 w-4 ${isDisabled ? 'text-emerald-400' : 'text-muted-foreground/80'}`} />
              </div>
              <h3 className="text-sm font-bold">Blocking Active</h3>
            </div>
            <p className="text-xs text-muted-foreground/70 pl-8">
              {isDisabled ? 'Blocking is OFF — timer will not re-lock' : 'Stop blocking entirely until manually re-enabled'}
            </p>
          </div>
          <button
            onClick={handleToggleBlocker}
            disabled={!agentOnline}
            className={`
              flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold
              transition-all duration-300 shrink-0 cursor-pointer
              disabled:opacity-30 disabled:cursor-not-allowed
              ${isDisabled
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25'
                : 'bg-secondary/80 text-muted-foreground border border-border/50 hover:bg-secondary hover:text-foreground'}
            `}
          >
            <ShieldAlert className="h-3 w-3" />
            {isDisabled ? 'Resume Blocking' : 'Stop Blocking'}
          </button>
        </div>
      </div>

      {/* Hard Lock Mode Card */}
      <div className={`glass-card rounded-2xl p-6 relative overflow-hidden transition-all duration-500 ${hardLockEnabled ? 'border border-red-500/30 shadow-[0_0_30px_-8px_rgba(239,68,68,0.25)]' : ''}`}>
        {hardLockEnabled && (
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
        )}
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className={`flex items-center justify-center rounded-lg p-1.5 ${hardLockEnabled ? 'bg-red-500/15' : 'bg-muted/50'}`}>
                <ShieldAlert className={`h-4 w-4 ${hardLockEnabled ? 'text-red-400' : 'text-muted-foreground/80'}`} />
              </div>
              <h3 className="text-sm font-bold">Hard Lock Mode</h3>
              {hardLockEnabled && (
                <span className="text-[11px] font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5 uppercase tracking-wider">Active</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70 pl-8 leading-relaxed">
              {hardLockEnabled
                ? '🛡 Only a TradingView alert can unlock. Force Lock is disabled.'
                : 'Tamper-proof mode — blocks all manual overrides. Inspired by Brick.'}
            </p>
          </div>
          <button
            onClick={handleHardLockToggle}
            disabled={!agentOnline || hardLockToggling}
            className={`relative shrink-0 w-12 h-6 rounded-full transition-all duration-300 focus:outline-none disabled:opacity-40 cursor-pointer
              ${hardLockEnabled ? 'bg-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.4)]' : 'bg-muted/60'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${hardLockEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {/* Emergency Codes Card */}
      <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -top-8 left-4 w-20 h-20 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="flex items-center justify-center rounded-lg bg-amber-500/10 p-1.5">
              <KeyRound className="h-4 w-4 text-amber-400" />
            </div>
            <h3 className="text-sm font-bold">Emergency Override Codes</h3>
          </div>
          <p className="text-xs text-muted-foreground/70 pl-8 mb-5 leading-relaxed">
            5 one-time codes to bypass Hard Lock. Once used, they're gone. Resets after 24h cooldown.
          </p>

          {/* Code slots */}
          <div className="flex gap-2 mb-5 pl-8">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-bold transition-all duration-300
                  ${i < codeInfo.remaining
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-[0_0_8px_-2px_rgba(245,158,11,0.3)]'
                    : 'bg-muted/20 border border-border/30 text-muted-foreground/50'}`}
              >
                {i < codeInfo.remaining ? '●' : '○'}
              </div>
            ))}
          </div>

          {/* Generated codes display (shown once after generation) */}
          {generatedCodes && (
            <div className="mb-4 pl-8">
              <p className="text-[11px] text-amber-400/70 mb-2 uppercase tracking-wider font-bold">Write these down now — shown only once:</p>
              <div className="grid grid-cols-5 gap-1.5">
                {generatedCodes.map((c, i) => (
                  <div key={i} className="glass-inner rounded-lg px-2 py-1.5 text-center font-mono text-sm font-bold text-amber-300">
                    {c}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setGeneratedCodes(null)}
                className="mt-2 text-[11px] text-muted-foreground/60 hover:text-muted-foreground/80 transition-colors cursor-pointer"
              >
                I've written them down ✓
              </button>
            </div>
          )}

          {/* Use code input */}
          {showUseInput && (
            <div className="mb-4 pl-8">
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={useCodeInput}
                  onChange={e => setUseCodeInput(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 glass-inner rounded-lg px-3 py-2 text-sm font-mono text-center border border-border/30 bg-transparent focus:outline-none focus:border-amber-500/40 transition-colors"
                />
                <button
                  onClick={handleUseCode}
                  disabled={useCodeInput.length !== 6}
                  className="px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-500/25 disabled:opacity-40 transition-all cursor-pointer"
                >
                  Use
                </button>
                <button
                  onClick={() => { setShowUseInput(false); setUseCodeError('') }}
                  className="px-3 py-2 rounded-lg bg-muted/30 text-muted-foreground/80 text-sm hover:bg-muted/50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              {useCodeError && <p className="text-xs text-destructive/70 mt-1.5">{useCodeError}</p>}
            </div>
          )}

          {useCodeSuccess && (
            <div className="mb-4 pl-8 flex items-center gap-2 text-green-400 text-sm">
              <Check className="h-3.5 w-3.5" /> Emergency code accepted — Hard Lock bypassed
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pl-8">
            {!codeInfo.generated || cooldownActive ? (
              <button
                onClick={handleGenerateCodes}
                disabled={!!cooldownActive || !electron}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-semibold hover:bg-amber-500/20 disabled:opacity-40 transition-all cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                {cooldownActive ? 'Cooldown active' : 'Generate 5 Codes'}
              </button>
            ) : (
              <button
                onClick={handleGenerateCodes}
                disabled={!!cooldownActive || !electron}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-muted/20 border border-border/30 text-muted-foreground/70 text-sm hover:bg-muted/40 disabled:opacity-30 transition-all cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" /> Regenerate
              </button>
            )}
            {codeInfo.remaining > 0 && !showUseInput && (
              <button
                onClick={() => setShowUseInput(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-muted/20 border border-border/30 text-muted-foreground/80 text-sm hover:bg-muted/40 transition-all cursor-pointer"
              >
                <KeyRound className="h-3 w-3" /> Use a Code
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Agent Info */}
      <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -top-8 right-4 w-16 h-16 bg-primary/3 rounded-full blur-2xl pointer-events-none" />
        <div className="relative">
          <h3 className="text-xs font-bold text-muted-foreground/70 uppercase tracking-[0.15em] mb-4">
            System Status
          </h3>
          <div className="flex flex-col gap-2">
            <StatusRow
              label="Agent"
              value={agentOnline ? 'Connected' : 'Disconnected'}
              active={agentOnline}
            />
            <StatusRow
              label="State"
              value={isLocked ? 'Locked' : 'Unlocked'}
              active={!isLocked}
              activeColor="text-primary"
              inactiveColor="text-destructive"
            />
            <StatusRow
              label="Duration"
              value={formatTime(blockerData?.unlockMinutes || localDuration)}
            />
            <StatusRow
              label="Launches"
              value={String(blockerData?.launchCount || 0)}
            />
          </div>

          <div className="mt-4 glass-inner rounded-xl p-3">
            <div className="flex items-start gap-2.5">
              <Shield className="h-3.5 w-3.5 text-primary/40 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground/60 leading-relaxed">
                Apps unlock only via TradingView webhook alerts. OS-level enforcement.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusRow({
  label,
  value,
  active,
  activeColor = 'text-primary',
  inactiveColor = 'text-destructive/60',
}: {
  label: string
  value: string
  active?: boolean
  activeColor?: string
  inactiveColor?: string
}) {
  return (
    <div className="flex items-center justify-between glass-inner rounded-lg px-3.5 py-2.5">
      <span className="text-sm text-muted-foreground/70">{label}</span>
      <div className="flex items-center gap-2">
        {active !== undefined && (
          <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-primary shadow-[0_0_6px_rgba(56,210,248,0.4)]' : 'bg-destructive/60'
            }`} />
        )}
        <span className={`text-sm font-mono font-medium ${active === true ? activeColor
          : active === false ? inactiveColor
            : 'text-foreground/70'
          }`}>
          {value}
        </span>
      </div>
    </div>
  )
}
