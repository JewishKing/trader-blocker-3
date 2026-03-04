'use client'

import { useState, useEffect } from 'react'
import { Shield, Activity, Clock, Wifi, WifiOff } from 'lucide-react'
import useSWR from 'swr'

const BLOCKER_URL = 'http://localhost:51700'
const blockerFetcher = (url: string) => fetch(url).then(r => r.json()).catch(() => null)

export function Header() {
  const [mounted, setMounted] = useState(false)
  const [time, setTime] = useState('')

  useEffect(() => {
    setMounted(true)
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const { data } = useSWR(
    mounted ? `${BLOCKER_URL}/status` : null,
    blockerFetcher,
    { refreshInterval: 2000, revalidateOnFocus: false }
  )

  const agentOnline = !!data
  const isLocked = data?.isLocked ?? true

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.04] bg-background/60 backdrop-blur-2xl" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Top accent line - draggable for Electron window */}
      <div className="h-[1px] w-full gradient-primary opacity-30" />

      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3.5 md:px-6 lg:px-10">
        {/* Logo Area */}
        <div className="flex items-center gap-3.5">
          <div className="relative">
            {/* Ambient glow behind icon */}
            <div className="absolute inset-0 rounded-xl bg-primary/20 blur-xl scale-150" />
            <div className={`
              relative flex items-center justify-center rounded-xl p-2.5
              glass-card
              ${isLocked ? 'animate-pulse-glow-danger' : 'animate-pulse-glow'}
            `}>
              <Shield className={`h-5 w-5 ${isLocked ? 'text-destructive' : 'text-primary'}`} />
            </div>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight gradient-text-primary">
              FocusGuard
            </h1>
            <p className="text-[10px] text-muted-foreground/60 leading-none mt-0.5 tracking-wide">
              Trading Discipline System
            </p>
          </div>
        </div>

        {/* Right: Status Indicators */}
        <div className="flex items-center gap-3 md:gap-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Clock */}
          {mounted && (
            <div className="hidden md:flex items-center gap-1.5 glass-inner rounded-lg px-3 py-1.5">
              <Clock className="h-3 w-3 text-muted-foreground/50" />
              <span className="text-[11px] font-mono text-muted-foreground/70 tracking-wider">{time}</span>
            </div>
          )}

          {/* Lock Status Pill */}
          <div
            className={`
              flex items-center gap-2 rounded-full px-3.5 py-1.5
              text-xs font-semibold tracking-wide transition-all duration-500
              ${!isLocked
                ? 'bg-primary/10 text-primary border border-primary/20 animate-glow-border glow-primary'
                : 'bg-destructive/10 text-destructive border border-destructive/20 animate-glow-border-danger'}
            `}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className={`absolute inset-0 rounded-full animate-status-ping ${!isLocked ? 'bg-primary' : 'bg-destructive'}`} />
              <span className={`relative h-1.5 w-1.5 rounded-full ${!isLocked ? 'bg-primary' : 'bg-destructive'}`} />
            </span>
            {!isLocked ? 'Unlocked' : 'Locked'}
          </div>

          {/* Agent Connection */}
          <div className={`
            flex items-center gap-1.5 rounded-full px-2.5 py-1.5
            ${agentOnline ? 'text-primary/80' : 'text-muted-foreground/30'}
          `}>
            {agentOnline ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
            <span className="text-[11px] font-medium hidden sm:inline">
              {agentOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
