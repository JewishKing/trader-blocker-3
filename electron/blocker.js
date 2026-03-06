/**
 * FocusGuard Blocker Service — Node.js
 * =====================================
 * Runs entirely inside the Electron main process.
 * No Python, no external terminals.
 *
 * Responsibilities:
 *  • Scans running Windows processes every 2 seconds
 *  • Kills TradingView / cTrader when locked
 *  • Serves a local HTTP webhook on port 5000
 *  • Exposes state to the Electron IPC layer
 *  • Fires Electron notifications on alert / expiry
 */

'use strict'

const http = require('http')
const { exec, execFile, spawn } = require('child_process')
const EventEmitter = require('events')
const path = require('path')
const fs = require('fs')

// ── Config ──────────────────────────────────────
const BLOCKED_PROCESSES = new Set([
    'tradingview.exe',
    'tradingview',
    'ctrader.exe',
    'ctrader',
])

// Well-known default paths (updated at runtime from settings)
const DEFAULT_CTRADER_PATH =
    `C:\\Users\\${process.env.USERNAME || 'User'}\\AppData\\Local\\Spotware\\cTrader`

const DEFAULT_TV_PATH =
    `C:\\Program Files\\WindowsApps`

const SCAN_INTERVAL_MS = 2000
const PORT = 51700

// ── State ────────────────────────────────────────
class BlockerState extends EventEmitter {
    constructor() {
        super()
        this.isLocked = true
        this.unlockExpiresAt = null
        this.unlockMinutes = 30
        this.killCount = 0
        this.launchCount = 0
        this.killLog = []           // [{ process, timestamp }] most-recent first, max 100
        this.lastAlertTicker = null
        this.lastAlertMessage = null
        this.lastAlertTime = null
        this.autoLaunchEnabled = true
        this.ctraderPath = null     // set after path-detection
        this.tradingviewPath = null
        this._reminderSent = { 5: false, 1: false }
        // Hard Lock Mode — when true, only TradingView alerts can unlock (no manual override)
        this.hardLockMode = false
    }

    /** Unlock for `duration` minutes, optionally launching apps */
    unlock(ticker = '', message = '', durationOverride = null) {
        const duration = durationOverride ?? this.unlockMinutes
        this.isLocked = false
        this.unlockExpiresAt = new Date(Date.now() + duration * 60 * 1000)
        this.lastAlertTicker = ticker || null
        this.lastAlertMessage = message || null
        this.lastAlertTime = new Date().toISOString()
        this._reminderSent = { 5: false, 1: false }

        console.log(`[FocusGuard] ✓ UNLOCKED for ${duration}m | ${ticker} — ${message}`)
        this.emit('unlocked', { ticker, message, duration })

        if (this.autoLaunchEnabled) {
            this._launchAll()
        }
    }

    /** Force re-lock immediately */
    forceLock() {
        this.isLocked = true
        this.unlockExpiresAt = null
        this._reminderSent = { 5: false, 1: false }
        console.log('[FocusGuard] 🔒 Force-locked')
        this.emit('locked', { reason: 'force' })
        return true
    }

    /** Called every scan tick — handles expiry + warnings */
    tickExpiry() {
        if (this.isLocked || !this.unlockExpiresAt) return null
        const now = Date.now()
        const remaining = this.unlockExpiresAt.getTime() - now

        if (remaining <= 0) {
            this.isLocked = true
            this.unlockExpiresAt = null
            this._reminderSent = { 5: false, 1: false }
            console.log('[FocusGuard] ⏰ Unlock window expired. Re-locking.')
            this.emit('locked', { reason: 'expired' })
            return 'expired'
        }

        const remMin = Math.floor(remaining / 60000)
        if (remMin <= 5 && !this._reminderSent[5] && remMin > 1) {
            this._reminderSent[5] = true
            this.emit('warning', { minutes: 5 })
        }
        if (remMin <= 1 && !this._reminderSent[1]) {
            this._reminderSent[1] = true
            this.emit('warning', { minutes: 1 })
        }
        return null
    }

    recordKill(processName) {
        this.killCount++
        this.killLog.unshift({ process: processName, timestamp: new Date().toISOString() })
        if (this.killLog.length > 100) this.killLog.pop()
        this.emit('killed', processName)
    }

    /** Serialise state for /status endpoint and IPC */
    toJSON() {
        let remainingMinutes = 0
        let remainingSeconds = 0
        let warningType = null

        if (!this.isLocked && this.unlockExpiresAt) {
            const delta = Math.max(0, this.unlockExpiresAt.getTime() - Date.now())
            remainingMinutes = Math.floor(delta / 60000)
            remainingSeconds = Math.floor((delta % 60000) / 1000)

            if (remainingMinutes <= 1 && remainingSeconds <= 30) warningType = 'critical'
            else if (remainingMinutes <= 1) warningType = '1min'
            else if (remainingMinutes <= 5) warningType = '5min'
        }

        return {
            isLocked: this.isLocked,
            unlockExpiresAt: this.unlockExpiresAt?.toISOString() ?? null,
            unlockMinutes: this.unlockMinutes,
            remainingMinutes,
            remainingSeconds,
            warningType,
            killCount: this.killCount,
            launchCount: this.launchCount,
            killLog: this.killLog.slice(0, 20),
            lastAlertTicker: this.lastAlertTicker,
            lastAlertMessage: this.lastAlertMessage,
            lastAlertTime: this.lastAlertTime,
            agentConnected: true,
            autoLaunchEnabled: this.autoLaunchEnabled,
            hardLockMode: this.hardLockMode,
            ctraderPath: this.ctraderPath,
            tradingviewPath: this.tradingviewPath,
        }
    }

    // ── App Launching ──────────────────────────────

    _launch(appPath, name) {
        if (!appPath) {
            console.log(`[FocusGuard] ⚠ ${name} path not configured`)
            return
        }
        if (!fs.existsSync(appPath)) {
            console.log(`[FocusGuard] ⚠ ${name} not found at: ${appPath}`)
            return
        }
        try {
            spawn(appPath, [], { detached: true, stdio: 'ignore' }).unref()
            this.launchCount++
            console.log(`[FocusGuard] 🚀 Launched ${name}`)
            this.emit('launched', name)
        } catch (err) {
            // Fallback: use Windows shell
            try {
                exec(`start "" "${appPath}"`)
                this.launchCount++
                console.log(`[FocusGuard] 🚀 Launched ${name} (shell fallback)`)
                this.emit('launched', name)
            } catch (err2) {
                console.error(`[FocusGuard] ✗ Failed to launch ${name}:`, err2.message)
            }
        }
    }

    _launchAll() {
        if (this.ctraderPath) this._launch(this.ctraderPath, 'cTrader')
        if (this.tradingviewPath) this._launch(this.tradingviewPath, 'TradingView')
    }

    updatePaths(ctraderPath, tradingviewPath) {
        if (ctraderPath !== undefined) this.ctraderPath = ctraderPath || null
        if (tradingviewPath !== undefined) this.tradingviewPath = tradingviewPath || null
        this.emit('paths-updated')
    }
}

// ── Process Scanner ───────────────────────────────
/**
 * Uses `tasklist` (built into every Windows version since XP) to enumerate
 * running processes. Kills any that are in BLOCKED_PROCESSES when locked.
 */
function scanAndKill(state) {
    exec('tasklist /fo csv /nh', (err, stdout) => {
        if (err || !stdout) return

        // Each line: "process.exe","PID","session","#","mem"
        const lines = stdout.split('\n')
        for (const line of lines) {
            const match = line.match(/^"([^"]+)","(\d+)"/)
            if (!match) continue
            const [, name, pid] = match
            const nameLower = name.toLowerCase()
            if (!BLOCKED_PROCESSES.has(nameLower)) continue

            // Kill it via taskkill (no psutil needed)
            exec(`taskkill /PID ${pid} /F /T`, (killErr) => {
                if (!killErr) {
                    console.log(`[FocusGuard] ⛔ Killed ${name} (PID ${pid})`)
                    state.recordKill(name)
                }
            })
        }
    })
}

// ── Auto-detect app paths ─────────────────────────
function detectPaths(state) {
    // cTrader: scan AppData\Local\Spotware\cTrader\*\cTrader.exe
    const spotware = path.join(
        process.env.LOCALAPPDATA || `C:\\Users\\${process.env.USERNAME}\\AppData\\Local`,
        'Spotware', 'cTrader'
    )
    if (fs.existsSync(spotware)) {
        try {
            const dirs = fs.readdirSync(spotware)
            for (const d of dirs) {
                const candidate = path.join(spotware, d, 'cTrader.exe')
                if (fs.existsSync(candidate)) {
                    state.ctraderPath = candidate
                    console.log(`[FocusGuard] ✓ cTrader found: ${candidate}`)
                    break
                }
            }
        } catch { /* ignore */ }
    }

    // TradingView Desktop (MS Store): scan WindowsApps for TradingView.exe
    const winApps = path.join('C:\\Program Files', 'WindowsApps')
    if (fs.existsSync(winApps)) {
        try {
            const dirs = fs.readdirSync(winApps).filter(d => d.toLowerCase().startsWith('tradingview'))
            for (const d of dirs) {
                const candidate = path.join(winApps, d, 'TradingView.exe')
                if (fs.existsSync(candidate)) {
                    state.tradingviewPath = candidate
                    console.log(`[FocusGuard] ✓ TradingView found: ${candidate}`)
                    break
                }
            }
        } catch { /* WindowsApps requires admin to list — silently skip */ }
    }

    if (!state.tradingviewPath) {
        console.log('[FocusGuard] ⚠ TradingView path not auto-detected (may need admin)')
    }
    if (!state.ctraderPath) {
        console.log('[FocusGuard] ⚠ cTrader path not auto-detected')
    }
}

// ── Port Cleanup ─────────────────────────────────
/** Kill any process holding PORT so we can always bind cleanly */
function freePort(port) {
    return new Promise((resolve) => {
        exec(`netstat -ano | findstr ":${port} "`, (_err, stdout) => {
            if (!stdout) return resolve()
            const pids = new Set()
            stdout.split('\n').forEach(line => {
                const m = line.match(/\s+(\d+)\s*$/)
                if (m && m[1] !== '0') pids.add(m[1])
            })
            if (pids.size === 0) return resolve()
            let remaining = pids.size
            for (const pid of pids) {
                exec(`taskkill /PID ${pid} /F /T`, () => {
                    if (--remaining === 0) setTimeout(resolve, 300)
                })
            }
        })
    })
}

// ── HTTP Webhook Server ───────────────────────────
function createWebhookServer(state) {
    const server = http.createServer((req, res) => {
        const send = (code, obj) => {
            res.writeHead(code, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            })
            res.end(JSON.stringify(obj))
        }

        if (req.method === 'OPTIONS') return send(200, { ok: true })

        if (req.method === 'GET') {
            if (req.url === '/status' || req.url === '/api/status') {
                return send(200, state.toJSON())
            }
            return send(200, { service: 'FocusGuard', locked: state.isLocked })
        }

        if (req.method === 'POST') {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
                if (req.url === '/alert' || req.url === '/api/alert') {
                    let ticker = '', message = ''
                    try {
                        const data = JSON.parse(body)
                        ticker = data.ticker || data.symbol || ''
                        message = data.message || data.action || ''
                    } catch { message = body.trim() }
                    state.unlock(ticker, message)
                    return send(200, { success: true, unlocked: true, expires_in_minutes: state.unlockMinutes })
                }

                if (req.url === '/lock' || req.url === '/api/lock') {
                    const result = state.forceLock()
                    if (result === false) {
                        return send(403, { success: false, error: 'Hard Lock Mode is active. Only a TradingView alert can unlock.' })
                    }
                    return send(200, { success: true, locked: true })
                }

                if (req.url === '/launch') {
                    state._launchAll()
                    return send(200, { success: true })
                }

                if (req.url === '/settings') {
                    try {
                        const data = JSON.parse(body)
                        if (data.unlockMinutes) state.unlockMinutes = parseInt(data.unlockMinutes, 10)
                        if ('autoLaunch' in data) state.autoLaunchEnabled = !!data.autoLaunch
                        if ('hardLockMode' in data) {
                            state.hardLockMode = !!data.hardLockMode
                            console.log(`[FocusGuard] 🛡 Hard Lock Mode: ${state.hardLockMode ? 'ON' : 'OFF'}`)
                        }
                        if ('ctraderPath' in data || 'tradingviewPath' in data) {
                            state.updatePaths(data.ctraderPath, data.tradingviewPath)
                        }
                    } catch { /* ignore bad JSON */ }
                    return send(200, { success: true, unlockMinutes: state.unlockMinutes, hardLockMode: state.hardLockMode })
                }

                return send(404, { error: 'Not found' })
            })
            return
        }

        send(404, { error: 'Not found' })
    })

    // Robust bind: retry up to 5 times, re-killing port holder each time
    function tryListen(attempt = 1) {
        server.listen(PORT, '127.0.0.1', () => {
            console.log(`[FocusGuard] 🌐 Webhook server ready on http://localhost:${PORT}`)
        })
    }

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
            const attempt = server._bindAttempt = (server._bindAttempt || 0) + 1
            if (attempt > 5) {
                console.error(`[FocusGuard] ✗ Could not bind port ${PORT} after 5 attempts`)
                return
            }
            console.warn(`[FocusGuard] ⚠ Port ${PORT} busy (attempt ${attempt}/5). Freeing and retrying in 1s...`)
            // Kill holder and retry with a fresh call
            freePort(PORT).then(() => {
                setTimeout(() => {
                    server.close()
                    server.listen(PORT, '127.0.0.1', () => {
                        console.log(`[FocusGuard] 🌐 Webhook server ready on http://localhost:${PORT} (retry ${attempt})`)
                    })
                }, 500)
            })
        } else {
            console.error('[FocusGuard] Server error:', err)
        }
    })

    tryListen()
    return server
}

// ── Public API ────────────────────────────────────
let _state = null
let _server = null
let _scanTimer = null
let _expiryTimer = null

/**
 * Start the blocker service.
 * Call once from electron/main.js in app.whenReady().
 * Returns the shared BlockerState instance.
 */
async function startBlocker(options = {}) {
    if (_state) return _state  // already running

    _state = new BlockerState()

    // Apply options
    if (options.unlockMinutes) _state.unlockMinutes = options.unlockMinutes
    if (options.autoLaunch === false) _state.autoLaunchEnabled = false
    if (options.ctraderPath) _state.ctraderPath = options.ctraderPath
    if (options.tradingviewPath) _state.tradingviewPath = options.tradingviewPath

    // Auto-detect paths we don't have yet
    detectPaths(_state)

    // Free port before starting server (handles leftover Python/old sessions)
    await freePort(PORT)

    // Start webhook server
    _server = createWebhookServer(_state)

    // Expiry checker (every second)
    _expiryTimer = setInterval(() => { _state.tickExpiry() }, 1000)

    // Process scanner (every 2 seconds)
    _scanTimer = setInterval(() => {
        if (_state.isLocked) scanAndKill(_state)
    }, SCAN_INTERVAL_MS)

    console.log('[FocusGuard] ✅ Blocker service started')
    console.log(`[FocusGuard]    isLocked:      ${_state.isLocked}`)
    console.log(`[FocusGuard]    unlockMinutes: ${_state.unlockMinutes}`)
    console.log(`[FocusGuard]    autoLaunch:    ${_state.autoLaunchEnabled}`)

    return _state
}

/** Stop the blocker service cleanly */
function stopBlocker() {
    if (_scanTimer) { clearInterval(_scanTimer); _scanTimer = null }
    if (_expiryTimer) { clearInterval(_expiryTimer); _expiryTimer = null }
    if (_server) { _server.close(); _server = null }
    _state = null
    console.log('[FocusGuard] Blocker service stopped')
}

/** Access the running state (returns null if not started) */
function getState() { return _state }

module.exports = { startBlocker, stopBlocker, getState }
