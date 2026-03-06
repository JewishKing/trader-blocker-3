'use client'

import { useEffect, useState, useRef } from 'react'
import useSWR from 'swr'
import {
  Shield, ShieldOff, Bell, AlertTriangle,
  TrendingUp, LineChart, Zap, BarChart3,
  ArrowUpRight,
} from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

/* ── SVG Countdown Ring ────────────────────────── */
function CountdownRing({
  remaining,
  total,
  size = 200,
  strokeWidth = 5,
  isLocked = false,
}: {
  remaining: number
  total: number
  size?: number
  strokeWidth?: number
  isLocked?: boolean
}) {
  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? remaining / total : 0
  const dashOffset = circumference * (1 - progress)

  return (
    <svg width={size} height={size} className={!isLocked ? 'animate-ring-pulse' : ''}>
      {/* Background glow circle */}
      {!isLocked && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius - 10}
          fill="none"
          stroke="url(#glow-gradient)"
          strokeWidth={20}
          opacity={0.06}
        />
      )}
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="countdown-ring-track"
      />
      {/* Progress */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="countdown-ring-progress"
        stroke={isLocked ? 'rgba(255,255,255,0.04)' : 'url(#ring-gradient)'}
        strokeDasharray={circumference}
        strokeDashoffset={isLocked ? circumference : dashOffset}
      />
      {/* Tick marks */}
      {Array.from({ length: 60 }).map((_, i) => {
        const angle = (i * 6 - 90) * (Math.PI / 180)
        const isMajor = i % 5 === 0
        const innerR = radius - (isMajor ? 10 : 6)
        const outerR = radius - 3
        return (
          <line
            key={i}
            x1={size / 2 + innerR * Math.cos(angle)}
            y1={size / 2 + innerR * Math.sin(angle)}
            x2={size / 2 + outerR * Math.cos(angle)}
            y2={size / 2 + outerR * Math.sin(angle)}
            stroke={isMajor ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'}
            strokeWidth={isMajor ? 1.5 : 0.5}
          />
        )
      })}
      <defs>
        <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
        <radialGradient id="glow-gradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#38d2f8" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#38d2f8" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  )
}

/* ── App Card ──────────────────────────────────── */
function AppCard({
  name,
  icon: Icon,
  configured,
  isLocked,
}: {
  name: string
  icon: React.ElementType
  configured: boolean
  isLocked: boolean
}) {
  return (
    <div className="glass-card-hover rounded-xl p-4 group">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2.5">
          <div className={`
            flex items-center justify-center rounded-lg p-2 transition-colors
            ${!isLocked ? 'bg-primary/10' : 'bg-secondary'}
          `}>
            <Icon className={`h-4 w-4 ${!isLocked ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <span className="text-sm font-semibold">{name}</span>
            <p className="text-xs text-muted-foreground/90">
              {configured ? 'Configured' : 'Not configured'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2.5 w-2.5 rounded-full transition-all ${!isLocked
                ? 'bg-primary shadow-[0_0_8px_rgba(56,210,248,0.5)]'
                : configured
                  ? 'bg-destructive shadow-[0_0_8px_rgba(248,80,56,0.3)]'
                  : 'bg-muted-foreground/20'
              }`}
          />
        </div>
      </div>
      <div className={`
        text-xs px-2.5 py-1 rounded-md font-medium
        ${!isLocked
          ? 'bg-primary/5 text-primary border border-primary/10'
          : configured
            ? 'bg-destructive/5 text-destructive/70 border border-destructive/10'
            : 'bg-muted/50 text-muted-foreground/70 border border-transparent'}
      `}>
        {!isLocked ? '● Running' : configured ? '◼ Blocked' : '○ Inactive'}
      </div>
    </div>
  )
}

/* ── Stat Card ─────────────────────────────────── */
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  glowClass,
}: {
  label: string
  value: number | string
  icon: React.ElementType
  color: string
  glowClass?: string
}) {
  return (
    <div className={`glass-card-hover rounded-xl p-4 text-center ${glowClass || ''}`}>
      <div className={`flex items-center justify-center mx-auto mb-2 rounded-lg p-2 w-fit ${color.replace('text-', 'bg-')}/10`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className={`text-2xl font-mono font-bold stat-value ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground/90 mt-1 uppercase tracking-wider font-medium">{label}</p>
    </div>
  )
}

/* ── Main Component ────────────────────────────── */
export function AppStatus() {
  const { data, error, isLoading } = useSWR('http://localhost:51700/status', fetcher, {
    refreshInterval: 1000,
  })

  const [alertHistory, setAlertHistory] = useState<any[]>([])
  const [alertCount, setAlertCount] = useState(0)
  const previousAlertRef = useRef<string | null>(null)

  useEffect(() => {
    if (!data) return
    const { lastAlertTicker, lastAlertMessage, lastAlertTime } = data
    const alertId = `${lastAlertTicker}|${lastAlertMessage}|${lastAlertTime}`

    if (alertId !== previousAlertRef.current && lastAlertMessage) {
      previousAlertRef.current = alertId
      setAlertCount(prev => prev + 1)
      setAlertHistory(prev =>
        [{
          ticker: lastAlertTicker || 'N/A',
          message: lastAlertMessage,
          time: lastAlertTime,
          id: Date.now().toString(),
        }, ...prev].slice(0, 5)
      )
    }
  }, [data])

  /* ── Error ── */
  if (error) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center animate-fade-in-up">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-destructive/15 blur-2xl scale-150" />
            <div className="relative flex items-center justify-center rounded-2xl bg-destructive/10 p-4 animate-pulse-glow-danger">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <div>
            <h2 className="text-base font-bold text-destructive">Agent Offline</h2>
            <p className="text-sm text-muted-foreground/90 mt-2 max-w-md leading-relaxed">
              Run <code className="font-mono text-sm bg-secondary/80 px-2 py-1 rounded-md border border-border/50">python focusguard_blocker.py</code> as Administrator
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="glass-card rounded-2xl p-10 animate-shimmer">
        <div className="flex items-center justify-center gap-3">
          <Shield className="h-5 w-5 text-muted-foreground/60 animate-breathe" />
          <span className="text-sm text-muted-foreground/70">Connecting to agent...</span>
        </div>
      </div>
    )
  }

  const totalMinutes = data?.unlockMinutes || 30
  const remainingMin = data?.remainingMinutes || 0
  const remainingSec = data?.remainingSeconds || 0
  const isLocked = data?.isLocked ?? true
  const totalSec = totalMinutes * 60
  const remainTotalSec = remainingMin * 60 + remainingSec

  const timerColor = (() => {
    if (isLocked) return 'text-muted-foreground/60'
    if (remainingMin === 0) {
      if (remainingSec <= 10) return 'text-destructive'
      if (remainingSec <= 30) return 'text-orange-400'
      return 'text-amber-400'
    }
    if (remainingMin <= 1) return 'text-orange-400'
    if (remainingMin <= 5) return 'text-amber-400'
    return 'text-primary'
  })()

  return (
    <div className="glass-card rounded-2xl overflow-hidden animate-fade-in-up relative">
      {/* Ambient glow behind the card */}
      <div className={`absolute -top-20 left-1/2 -translate-x-1/2 w-[400px] h-[200px] rounded-full blur-[100px] pointer-events-none ${isLocked ? 'bg-destructive/8' : 'bg-primary/8'
        }`} />

      {/* Gradient accent bar */}
      <div className={`h-[2px] w-full ${isLocked ? 'gradient-danger' : 'gradient-primary'}`} />

      <div className="relative p-8">
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className={`absolute inset-0 rounded-xl blur-xl scale-150 ${isLocked ? 'bg-destructive/15' : 'bg-primary/15'}`} />
              {isLocked ? (
                <div className="relative flex items-center justify-center rounded-xl bg-destructive/10 p-3 border border-destructive/10 animate-pulse-glow-danger">
                  <Shield className="h-6 w-6 text-destructive" />
                </div>
              ) : (
                <div className="relative flex items-center justify-center rounded-xl bg-primary/10 p-3 border border-primary/10 animate-pulse-glow">
                  <ShieldOff className="h-6 w-6 text-primary" />
                </div>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                {isLocked ? 'Trading Apps Blocked' : 'Trading Window Open'}
              </h2>
              <p className="text-sm text-muted-foreground/80 mt-1">
                {isLocked
                  ? 'Waiting for TradingView alert webhook'
                  : `Session expires in ${remainingMin}m ${remainingSec}s`}
              </p>
            </div>
          </div>

          {alertCount > 0 && (
            <div className="flex items-center gap-1.5 glass-inner rounded-full px-3.5 py-1.5">
              <Bell className="h-3 w-3 text-amber-400" />
              <span className="text-sm font-mono font-bold text-amber-400">{alertCount}</span>
            </div>
          )}
        </div>

        {/* ── Countdown Ring ── */}
        <div className="flex justify-center mb-8">
          <div className="relative animate-float">
            <CountdownRing remaining={remainTotalSec} total={totalSec} size={200} isLocked={isLocked} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {isLocked ? (
                <>
                  <Shield className="h-10 w-10 text-muted-foreground/30 mb-1" />
                  <span className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest">
                    Secured
                  </span>
                </>
              ) : (
                <>
                  <span className={`text-4xl font-mono font-bold tracking-tighter stat-value ${timerColor}`}>
                    {remainingMin}:{remainingSec.toString().padStart(2, '0')}
                  </span>
                  <span className="text-xs text-muted-foreground/70 mt-1.5 uppercase tracking-wider font-medium">
                    remaining
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── App Cards ── */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <AppCard
            name="cTrader"
            icon={LineChart}
            configured={!!data?.ctraderPath}
            isLocked={isLocked}
          />
          <AppCard
            name="TradingView"
            icon={TrendingUp}
            configured={!!data?.tradingviewPath}
            isLocked={isLocked}
          />
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Kills" value={data?.killCount || 0} icon={Zap} color="text-destructive" />
          <StatCard label="Launches" value={data?.launchCount || 0} icon={ArrowUpRight} color="text-primary" />
          <StatCard label="Alerts" value={alertCount} icon={Bell} color="text-amber-400" />
        </div>

        {/* ── Recent Alerts Mini Feed ── */}
        {alertHistory.length > 0 && (
          <div className="mt-6 glass-inner rounded-xl p-4">
            <p className="text-xs text-muted-foreground/70 mb-3 uppercase tracking-widest font-semibold">
              Latest Alerts
            </p>
            <div className="flex flex-col gap-2">
              {alertHistory.slice(0, 3).map((alert, i) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between glass-surface rounded-lg px-3.5 py-2.5 animate-slide-in-right"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-mono font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md border border-primary/10">
                      {alert.ticker}
                    </span>
                    <span className="text-sm text-muted-foreground/80 truncate max-w-[180px]">
                      {alert.message}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground/60 shrink-0 ml-3">
                    {alert.time ? new Date(alert.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
