export interface TrackedApp {
  id: string
  name: string
  processName: string
  icon: string
  isLocked: boolean
  lastUnlockedAt: string | null
}

export interface AlertConfig {
  id: string
  name: string
  ticker: string
  condition: string
  isActive: boolean
  lastTriggeredAt: string | null
  triggerCount: number
}

export interface AppState {
  apps: TrackedApp[]
  alerts: AlertConfig[]
  alertStatus: 'locked' | 'unlocked' | 'cooldown'
  lastAlertTime: string | null
  unlockDurationMinutes: number
  unlockExpiresAt: string | null
  isRunning: boolean
  activityLog: ActivityEntry[]
}

export interface ActivityEntry {
  id: string
  type: 'alert_received' | 'apps_unlocked' | 'apps_locked' | 'alert_expired' | 'system'
  message: string
  timestamp: string
}

export type AlertPayload = {
  ticker?: string
  action?: string
  message?: string
  timestamp?: string
}
