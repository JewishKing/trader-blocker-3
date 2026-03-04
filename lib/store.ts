import { useSyncExternalStore, useCallback } from 'react'
import type { AppState, AlertConfig, ActivityEntry } from './types'

const initialState: AppState = {
  apps: [
    {
      id: 'tradingview',
      name: 'TradingView',
      processName: 'tradingview.exe',
      icon: 'TrendingUp',
      isLocked: true,
      lastUnlockedAt: null,
    },
    {
      id: 'ctrader',
      name: 'cTrader',
      processName: 'cTrader.exe',
      icon: 'LineChart',
      isLocked: true,
      lastUnlockedAt: null,
    },
  ],
  alerts: [
    {
      id: '1',
      name: 'BTC/USD MA Crossover',
      ticker: 'BTCUSD',
      condition: 'Moving Average Crossover',
      isActive: true,
      lastTriggeredAt: null,
      triggerCount: 0,
    },
    {
      id: '2',
      name: 'EUR/USD RSI Oversold',
      ticker: 'EURUSD',
      condition: 'RSI below 30',
      isActive: true,
      lastTriggeredAt: null,
      triggerCount: 0,
    },
  ],
  alertStatus: 'locked',
  lastAlertTime: null,
  unlockDurationMinutes: 30,
  unlockExpiresAt: null,
  isRunning: true,
  activityLog: [],
}

let state = { ...initialState }
const listeners = new Set<() => void>()

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function getSnapshot(): AppState {
  return state
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function addLogEntry(type: ActivityEntry['type'], message: string) {
  const entry: ActivityEntry = {
    id: Date.now().toString(),
    type,
    message,
    timestamp: new Date().toISOString(),
  }
  state = {
    ...state,
    activityLog: [entry, ...state.activityLog].slice(0, 50),
  }
}

export function useAppActions() {
  const setUnlockDuration = useCallback((minutes: number) => {
    state = { ...state, unlockDurationMinutes: minutes }
    emitChange()
  }, [])

  const triggerAlert = useCallback((alertName?: string) => {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + state.unlockDurationMinutes * 60 * 1000)
    state = {
      ...state,
      alertStatus: 'unlocked',
      lastAlertTime: now.toISOString(),
      unlockExpiresAt: expiresAt.toISOString(),
      apps: state.apps.map((app) => ({
        ...app,
        isLocked: false,
        lastUnlockedAt: now.toISOString(),
      })),
    }
    addLogEntry('alert_received', `Alert triggered${alertName ? `: ${alertName}` : ''}`)
    addLogEntry('apps_unlocked', `TradingView & cTrader unlocked for ${state.unlockDurationMinutes}m`)
    emitChange()
  }, [])

  const lockApps = useCallback(() => {
    state = {
      ...state,
      alertStatus: 'locked',
      unlockExpiresAt: null,
      apps: state.apps.map((app) => ({ ...app, isLocked: true })),
    }
    addLogEntry('apps_locked', 'TradingView & cTrader re-locked')
    emitChange()
  }, [])

  const expireUnlock = useCallback(() => {
    state = {
      ...state,
      alertStatus: 'locked',
      unlockExpiresAt: null,
      apps: state.apps.map((app) => ({ ...app, isLocked: true })),
    }
    addLogEntry('alert_expired', 'Unlock period expired')
    addLogEntry('apps_locked', 'TradingView & cTrader re-locked')
    emitChange()
  }, [])

  const toggleRunning = useCallback(() => {
    state = { ...state, isRunning: !state.isRunning }
    addLogEntry('system', state.isRunning ? 'Monitoring resumed' : 'Monitoring paused')
    emitChange()
  }, [])

  const addAlert = useCallback((alert: Omit<AlertConfig, 'id' | 'lastTriggeredAt' | 'triggerCount'>) => {
    const newAlert: AlertConfig = {
      ...alert,
      id: Date.now().toString(),
      lastTriggeredAt: null,
      triggerCount: 0,
    }
    state = {
      ...state,
      alerts: [...state.alerts, newAlert],
    }
    emitChange()
  }, [])

  const removeAlert = useCallback((alertId: string) => {
    state = {
      ...state,
      alerts: state.alerts.filter((a) => a.id !== alertId),
    }
    emitChange()
  }, [])

  const toggleAlert = useCallback((alertId: string) => {
    state = {
      ...state,
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, isActive: !a.isActive } : a
      ),
    }
    emitChange()
  }, [])

  return {
    setUnlockDuration,
    triggerAlert,
    lockApps,
    expireUnlock,
    toggleRunning,
    addAlert,
    removeAlert,
    toggleAlert,
  }
}
