'use client'

import dynamic from 'next/dynamic'
import { Header } from '@/components/header'

const AppStatus = dynamic(() => import('@/components/app-status').then(m => ({ default: m.AppStatus })), { ssr: false })
const ActivityLog = dynamic(() => import('@/components/activity-log').then(m => ({ default: m.ActivityLog })), { ssr: false })
const AlertPanel = dynamic(() => import('@/components/alert-panel').then(m => ({ default: m.AlertPanel })), { ssr: false })
const SettingsPanel = dynamic(() => import('@/components/settings-panel').then(m => ({ default: m.SettingsPanel })), { ssr: false })
const WinrateCalculator = dynamic(() => import('@/components/winrate-calculator').then(m => ({ default: m.WinrateCalculator })), { ssr: false })

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col ambient-bg grid-bg">
      <Header />

      <main className="relative z-10 flex-1 px-4 py-8 md:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl space-y-8 stagger-children">
          {/* Hero Status */}
          <section>
            <AppStatus />
          </section>

          {/* Two-column: Alerts + Settings */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AlertPanel />
            <SettingsPanel />
          </section>

          {/* Win Rate Analyzer */}
          <section>
            <WinrateCalculator />
          </section>

          {/* Activity Log */}
          <section>
            <ActivityLog />
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.03] px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-primary/40" />
            <p className="text-xs text-muted-foreground/70 tracking-wide">
              FocusGuard v{require('../package.json').version}
            </p>
          </div>
          <p className="text-xs text-muted-foreground/60 font-mono">
            localhost:5000
          </p>
        </div>
      </footer>
    </div>
  )
}
