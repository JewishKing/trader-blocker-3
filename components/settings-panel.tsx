'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppState, useAppActions } from '@/lib/store'
import { Slider } from '@/components/ui/slider'
import { Timer, Lock, Shield, Gauge, Check } from 'lucide-react'
import useSWR from 'swr'

const formatTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`
}

const BLOCKER_URL = 'http://localhost:51700'
const fetcher = (url: string) => fetch(url).then(r => r.json()).catch(() => null)

export function SettingsPanel() {
  const { unlockDurationMinutes } = useAppState()
  const { setUnlockDuration } = useAppActions()

  const [isUpdating, setIsUpdating] = useState(false)
  const [localDuration, setLocalDuration] = useState(unlockDurationMinutes)

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
      },
    }
  )

  const agentOnline = !!blockerData
  const isLocked = blockerData?.isLocked ?? true

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
      await fetch(`${BLOCKER_URL}/lock`, { method: 'POST' })
      setTimeout(() => mutate(), 500)
    } catch (error) {
      console.error('Failed to force lock:', error)
    }
  }, [mutate])

  // Duration display: ring arc
  const durationPercent = Math.min((localDuration / 120) * 100, 100)

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
                <span className="text-[10px] text-primary/60">Saving</span>
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground/50 mb-6 pl-8">
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
              <span className="text-[10px] text-muted-foreground/40 mt-0.5 uppercase tracking-wider font-medium">
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
            <div className="flex justify-between text-[9px] text-muted-foreground/30 mt-2 font-mono">
              <span>1m</span>
              <span>15m</span>
              <span>30m</span>
              <span>1h</span>
              <span>2h</span>
            </div>
          </div>

          {!agentOnline && (
            <p className="text-[10px] text-destructive/60 mt-3 text-center">
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
                <Lock className={`h-4 w-4 ${!isLocked ? 'text-destructive' : 'text-muted-foreground/50'}`} />
              </div>
              <h3 className="text-sm font-bold">Emergency Lock</h3>
            </div>
            <p className="text-[10px] text-muted-foreground/40 pl-8">
              {!isLocked ? 'Kill apps & re-lock immediately' : 'Apps are already blocked'}
            </p>
          </div>
          <button
            onClick={handleForceLock}
            disabled={isLocked || !agentOnline}
            className={`
              flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold
              transition-all duration-300 shrink-0 cursor-pointer
              disabled:opacity-30 disabled:cursor-not-allowed
              ${!isLocked
                ? 'bg-destructive/15 text-destructive border border-destructive/20 hover:bg-destructive/25 hover:border-destructive/30 hover:shadow-[0_0_20px_-5px_rgba(248,80,56,0.2)]'
                : 'bg-secondary/50 text-muted-foreground/40 border border-border/50'}
            `}
          >
            <Lock className="h-3 w-3" />
            Lock Now
          </button>
        </div>
      </div>

      {/* Agent Info */}
      <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -top-8 right-4 w-16 h-16 bg-primary/3 rounded-full blur-2xl pointer-events-none" />
        <div className="relative">
          <h3 className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-[0.15em] mb-4">
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
              <p className="text-[10px] text-muted-foreground/30 leading-relaxed">
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
      <span className="text-[11px] text-muted-foreground/40">{label}</span>
      <div className="flex items-center gap-2">
        {active !== undefined && (
          <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-primary shadow-[0_0_6px_rgba(56,210,248,0.4)]' : 'bg-destructive/60'
            }`} />
        )}
        <span className={`text-[11px] font-mono font-medium ${active === true ? activeColor
            : active === false ? inactiveColor
              : 'text-foreground/70'
          }`}>
          {value}
        </span>
      </div>
    </div>
  )
}
