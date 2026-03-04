'use client'

import { useState, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Shield, Bell, Lock, Zap, Radio } from 'lucide-react'
import useSWR from 'swr'

const BLOCKER_URL = 'http://localhost:51700'
const blockerFetcher = (url: string) => fetch(url).then(r => r.json()).catch(() => null)

interface BlockerStatus {
  isLocked: boolean
  killLog: Array<{ process: string; timestamp: string }>
  lastAlertTicker: string | null
  lastAlertTime: string | null
  killCount: number
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function ActivityLog() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const { data } = useSWR<BlockerStatus>(
    mounted ? `${BLOCKER_URL}/status` : null,
    blockerFetcher,
    { refreshInterval: 2000, revalidateOnFocus: false }
  )

  const agentOnline = !!data
  const killLog = data?.killLog || []

  return (
    <div className="glass-card rounded-2xl overflow-hidden animate-fade-in-up relative" style={{ animationDelay: '200ms' }}>
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/4 w-48 h-24 bg-destructive/3 rounded-full blur-[60px] pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-48 h-24 bg-primary/3 rounded-full blur-[60px] pointer-events-none" />

      {/* Gradient bar */}
      <div className="h-[2px] w-full bg-gradient-to-r from-destructive/60 via-primary/30 to-transparent" />

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-lg bg-muted/50 p-1.5">
              <Radio className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Live Activity</h3>
              <p className="text-[11px] text-muted-foreground/40 mt-0.5">
                {agentOnline
                  ? `${data?.killCount || 0} processes blocked`
                  : 'Agent not connected'}
              </p>
            </div>
          </div>
          {agentOnline && (
            <div className="flex items-center gap-2 glass-inner rounded-full px-3 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-primary animate-status-ping" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <span className="text-[10px] font-semibold text-primary/80 uppercase tracking-wider">Live</span>
            </div>
          )}
        </div>

        {/* Content */}
        <ScrollArea className="h-[220px]">
          <div className="flex flex-col gap-1.5 pr-3">
            {/* Pinned: Last Alert */}
            {data?.lastAlertTime && mounted && (
              <div className="flex items-start gap-3 glass-surface rounded-xl px-4 py-3 mb-2 animate-slide-in-right border border-primary/10">
                <div className="mt-0.5 flex items-center justify-center rounded-md bg-primary/10 p-1">
                  <Bell className="h-3 w-3 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground/80">
                    Alert: <span className="font-mono font-bold text-primary">{data.lastAlertTicker || 'Unknown'}</span>
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/30">
                  {formatTime(data.lastAlertTime)}
                </span>
              </div>
            )}

            {/* Empty States */}
            {!agentOnline ? (
              <div className="flex flex-col items-center gap-4 py-14 text-center">
                <div className="flex items-center justify-center rounded-2xl glass-inner p-4">
                  <Shield className="h-7 w-7 text-muted-foreground/10" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground/30 font-medium">Not connected</p>
                  <p className="text-[11px] text-muted-foreground/20 mt-1">
                    Start the Python blocker to see events
                  </p>
                </div>
              </div>
            ) : killLog.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-14 text-center">
                <div className="flex items-center justify-center rounded-2xl glass-inner p-4">
                  <Lock className="h-7 w-7 text-muted-foreground/10" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground/30 font-medium">No events yet</p>
                  <p className="text-[11px] text-muted-foreground/20 mt-1">
                    Try opening TradingView or cTrader
                  </p>
                </div>
              </div>
            ) : (
              /* Kill Log Entries */
              killLog.map((entry, i) => (
                <div
                  key={`log-${i}-${entry.timestamp}`}
                  className="group flex items-start gap-3 rounded-xl px-3.5 py-2.5 transition-all duration-200 hover:bg-white/[0.02] animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                >
                  <div className="mt-0.5 flex items-center justify-center rounded-md bg-destructive/8 p-1 group-hover:bg-destructive/12 transition-colors">
                    <Zap className="h-2.5 w-2.5 text-destructive/60 group-hover:text-destructive/80" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">
                      <span className="font-mono font-semibold text-destructive/70">
                        {entry.process}
                      </span>
                      <span className="text-muted-foreground/30"> killed</span>
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground/20 group-hover:text-muted-foreground/40 transition-colors">
                    {mounted ? formatTime(entry.timestamp) : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
