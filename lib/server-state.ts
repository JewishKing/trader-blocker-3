// Server-side state shared across API routes
// In production, replace with Redis or a database

export interface ServerLockState {
  isLocked: boolean
  unlockExpiresAt: string | null
  unlockDurationMinutes: number
  lastAlertTicker: string | null
  lastAlertMessage: string | null
  lastAlertTime: string | null
  blockedProcesses: string[]
  killLog: Array<{
    process: string
    timestamp: string
  }>
}

const defaultState: ServerLockState = {
  isLocked: true,
  unlockExpiresAt: null,
  unlockDurationMinutes: 30,
  lastAlertTicker: null,
  lastAlertMessage: null,
  lastAlertTime: null,
  blockedProcesses: ['tradingview.exe', 'ctrader.exe', 'cTrader.exe'],
  killLog: [],
}

// Module-level singleton state
let lockState: ServerLockState = { ...defaultState }

export function getLockState(): ServerLockState {
  // Check if unlock has expired
  if (lockState.unlockExpiresAt) {
    const expiresAt = new Date(lockState.unlockExpiresAt).getTime()
    if (Date.now() >= expiresAt) {
      lockState = {
        ...lockState,
        isLocked: true,
        unlockExpiresAt: null,
      }
    }
  }
  return { ...lockState }
}

export function unlockApps(durationMinutes?: number): ServerLockState {
  const duration = durationMinutes || lockState.unlockDurationMinutes
  const expiresAt = new Date(Date.now() + duration * 60 * 1000)
  lockState = {
    ...lockState,
    isLocked: false,
    unlockExpiresAt: expiresAt.toISOString(),
  }
  return { ...lockState }
}

export function forcelock(): ServerLockState {
  lockState = {
    ...lockState,
    isLocked: true,
    unlockExpiresAt: null,
  }
  return { ...lockState }
}

export function setAlertInfo(ticker: string | null, message: string | null): void {
  lockState = {
    ...lockState,
    lastAlertTicker: ticker,
    lastAlertMessage: message,
    lastAlertTime: new Date().toISOString(),
  }
}

export function setUnlockDuration(minutes: number): void {
  lockState = { ...lockState, unlockDurationMinutes: minutes }
}

export function addKillLogEntry(processName: string): void {
  lockState = {
    ...lockState,
    killLog: [
      { process: processName, timestamp: new Date().toISOString() },
      ...lockState.killLog,
    ].slice(0, 100),
  }
}
