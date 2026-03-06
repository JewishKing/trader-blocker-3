'use strict'

const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain, shell } = require('electron')
const http = require('http')
const path = require('path')
const fs = require('fs')

// ── Embedded services ────────────────────────────
const { startBlocker, stopBlocker, getState } = require('./blocker')
const { startTunnel, stopTunnel, getTunnelUrl, getSavedToken, saveConfig } = require('./tunnel')
const { showAlertNotification } = require('./notification')

// ── Auto Updater (production only) ───────────────
let autoUpdater = null
if (!process.argv.includes('--dev') && process.env.NODE_ENV !== 'development') {
    try { autoUpdater = require('electron-updater').autoUpdater } catch { /* ignore in dev */ }
}

const BLOCKER_PORT = 51700   // Must match blocker.js
const UI_PORT = 51701         // Static file server for packaged build

let mainWindow = null
let tray = null
let uiServer = null
let isQuitting = false

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')

// ── Single instance ──────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit(); process.exit(0) }

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
    }
})

// ── Static file server (production only) ─────────
// Serves the Next.js out/ directory via http so that /_next/static/ paths resolve correctly.
// file:// protocol cannot resolve these root-relative paths.
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json',
}

function createStaticServer(outDir) {
    const server = http.createServer((req, res) => {
        let urlPath = req.url.split('?')[0]   // strip query string
        if (urlPath === '/') urlPath = '/index.html'

        let filePath = path.join(outDir, urlPath)

        // Next.js with trailingSlash generates dir/index.html for each route
        if (!fs.existsSync(filePath)) {
            const withIndex = path.join(filePath, 'index.html')
            if (fs.existsSync(withIndex)) {
                filePath = withIndex
            } else {
                const with404 = path.join(outDir, '404.html')
                if (fs.existsSync(with404)) {
                    res.writeHead(404, { 'Content-Type': 'text/html' })
                    fs.createReadStream(with404).pipe(res)
                } else {
                    res.writeHead(404)
                    res.end('Not found')
                }
                return
            }
        }

        const ext = path.extname(filePath).toLowerCase()
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            // Allow the React app to fetch from localhost:51700 (the blocker API)
            'Access-Control-Allow-Origin': '*',
        })
        fs.createReadStream(filePath).pipe(res)
    })

    server.listen(UI_PORT, '127.0.0.1', () => {
        console.log(`[FocusGuard] 🖥️  UI server ready on http://localhost:${UI_PORT}`)
    })

    server.on('error', (err) => {
        console.error('[FocusGuard] UI server error:', err.message)
    })

    return server
}

// ── Window ───────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 860,
        minWidth: 900,
        minHeight: 650,
        title: 'FocusGuard',
        icon: getIconPath('icon.png'),
        frame: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#12121a',
            symbolColor: '#64748b',
            height: 40,
        },
        backgroundColor: '#0f0f17',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    // Dev: Next.js dev server | Prod: our embedded static file server
    const url = isDev
        ? 'http://localhost:3000'
        : `http://localhost:${UI_PORT}`

    mainWindow.loadURL(url)

    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
    })

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault()
            mainWindow.hide()
            if (tray) {
                tray.displayBalloon({
                    iconType: 'info',
                    title: 'FocusGuard',
                    content: 'Running in system tray. Right-click the tray icon to quit.',
                })
            }
        }
    })

    mainWindow.on('closed', () => { mainWindow = null })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http') && !url.startsWith(`http://localhost:${UI_PORT}`)) {
            shell.openExternal(url)
        }
        return { action: 'deny' }
    })
}

// ── Tray ─────────────────────────────────────────
function createTray() {
    const iconPath = getIconPath('tray-icon.png')
    let icon
    try { icon = nativeImage.createFromPath(iconPath) } catch { icon = nativeImage.createEmpty() }
    if (icon.isEmpty()) {
        icon = nativeImage.createFromDataURL(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        )
    }
    tray = new Tray(icon.resize({ width: 16, height: 16 }))
    tray.setToolTip('FocusGuard — Trading Discipline')
    updateTrayMenu()
    tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } })
}

function updateTrayMenu() {
    if (!tray) return
    const state = getState()
    const locked = state ? state.isLocked : true
    const tunnelUrl = getTunnelUrl()

    const menu = Menu.buildFromTemplate([
        { label: 'FocusGuard v2', enabled: false },
        { type: 'separator' },
        { label: locked ? '🔒 LOCKED' : '🔓 UNLOCKED', enabled: false },
        ...(tunnelUrl ? [{ label: `🌐 ${tunnelUrl.replace('https://', '')}`, enabled: false }] : []),
        { type: 'separator' },
        { label: 'Open Dashboard', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } } },
        { label: 'Force Lock Now', click: () => { const s = getState(); if (s) s.forceLock() } },
        { type: 'separator' },
        { label: 'Quit FocusGuard', click: () => { isQuitting = true; app.quit() } },
    ])
    tray.setContextMenu(menu)
}

// ── Notifications ─────────────────────────────────
function registerNotifications(state) {
    state.on('unlocked', ({ ticker, message, duration }) => {
        updateTrayMenu()

        // Custom glassmorphism overlay notification with alert sound
        showAlertNotification({
            ticker,
            message,
            duration,
            onView: () => {
                if (mainWindow) { mainWindow.show(); mainWindow.focus() }
            },
        })

        // Also fire native Windows notification as backup
        if (Notification.isSupported()) {
            new Notification({
                title: `FocusGuard — ${ticker || 'Alert'}`,
                body: `${message || 'Trading window open'} · ${duration}m`,
                icon: getIconPath('icon.png'),
            }).show()
        }
    })

    state.on('locked', ({ reason }) => {
        updateTrayMenu()
        if (Notification.isSupported() && reason === 'expired') {
            new Notification({
                title: 'FocusGuard — Session Expired',
                body: 'TradingView & cTrader have been re-locked.',
                icon: getIconPath('icon.png'),
            }).show()
        }
    })

    state.on('warning', ({ minutes }) => {
        if (Notification.isSupported()) {
            new Notification({
                title: `FocusGuard — ${minutes}m left`,
                body: 'Your trading window is about to expire.',
                icon: getIconPath('icon.png'),
            }).show()
        }
    })
}

// ── IPC ───────────────────────────────────────────
ipcMain.handle('blocker:status', () => {
    const s = getState(); return s ? s.toJSON() : null
})
ipcMain.handle('blocker:lock', () => {
    const s = getState(); if (s) s.forceLock(); return { ok: true }
})
ipcMain.handle('tunnel:url', () => getTunnelUrl())
ipcMain.handle('tunnel:savedToken', () => getSavedToken())
ipcMain.handle('tunnel:start', async (_e, token) => {
    const url = await startTunnel(BLOCKER_PORT, token)
    updateTrayMenu()
    return { url }
})
ipcMain.handle('tunnel:stop', async () => {
    await stopTunnel(); updateTrayMenu(); return { ok: true }
})
ipcMain.handle('tunnel:saveToken', (_e, token) => {
    saveConfig({ ngrokAuthToken: token }); return { ok: true }
})
ipcMain.handle('sound:get', () => {
    const { loadConfig } = require('./tunnel')
    return loadConfig().alertSound || 'bell'
})
ipcMain.handle('sound:set', (_e, sound) => {
    saveConfig({ alertSound: sound }); return { ok: true }
})
ipcMain.handle('blocker:updatePaths', (_e, { ctraderPath, tradingviewPath }) => {
    const s = getState()
    if (s) {
        s.updatePaths(ctraderPath, tradingviewPath)
        saveConfig({ ctraderPath, tradingviewPath })
        console.log('[FocusGuard] Paths updated:', { ctraderPath, tradingviewPath })
    }
    return { ok: true }
})
ipcMain.handle('blocker:setAutoLaunch', (_e, enabled) => {
    const s = getState()
    if (s) s.autoLaunchEnabled = enabled
    return { ok: true }
})
ipcMain.handle('blocker:getSavedPaths', () => {
    const { loadConfig } = require('./tunnel')
    const cfg = loadConfig()
    return { ctraderPath: cfg.ctraderPath || null, tradingviewPath: cfg.tradingviewPath || null }
})

// ── Emergency Codes ────────────────────────────────
const crypto = require('crypto')
function hashCode(code) { return crypto.createHash('sha256').update(code).digest('hex') }

ipcMain.handle('emergency:getCodes', () => {
    const { loadConfig } = require('./tunnel')
    const cfg = loadConfig()
    return {
        remaining: (cfg.emergencyCodes || []).length,
        generated: !!(cfg.emergencyCodes),
        cooldownUntil: cfg.emergencyCodesCooldown || null,
    }
})

ipcMain.handle('emergency:generate', () => {
    const { loadConfig } = require('./tunnel')
    const cfg = loadConfig()
    // Enforce cooldown
    if (cfg.emergencyCodesCooldown && new Date(cfg.emergencyCodesCooldown) > new Date()) {
        return { error: 'Cooldown active', cooldownUntil: cfg.emergencyCodesCooldown }
    }
    // Generate 5 random 6-digit codes
    const codes = Array.from({ length: 5 }, () => String(Math.floor(100000 + Math.random() * 900000)))
    const hashed = codes.map(hashCode)
    saveConfig({ emergencyCodes: hashed, emergencyCodesCooldown: null })
    console.log('[FocusGuard] 🆘 Emergency codes generated (5 codes)')
    return { codes } // return plaintext ONCE so user can write them down
})

ipcMain.handle('emergency:use', (_e, code) => {
    const { loadConfig } = require('./tunnel')
    const cfg = loadConfig()
    const stored = cfg.emergencyCodes || []
    if (stored.length === 0) return { error: 'No codes remaining' }

    const hash = hashCode(String(code).trim())
    const idx = stored.indexOf(hash)
    if (idx === -1) return { error: 'Invalid code' }

    // Remove the used code
    stored.splice(idx, 1)
    // If last code used, set 24h cooldown before new codes can be generated
    const cooldownUntil = stored.length === 0
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null
    saveConfig({ emergencyCodes: stored, emergencyCodesCooldown: cooldownUntil })

    // Apply emergency override — bypass and unlock
    const s = getState()
    if (s) s.unlock('EMERGENCY', 'Override Code Used')

    console.log(`[FocusGuard] 🆘 Emergency code used. ${stored.length} remaining.`)
    return { ok: true, remaining: stored.length, cooldownUntil }
})

// ── Helper ────────────────────────────────────────
function getIconPath(filename) {
    const base = app.isPackaged
        ? path.join(process.resourcesPath, 'app', 'public')
        : path.join(__dirname, '../public')
    return path.join(base, filename)
}

// ── App Lifecycle ─────────────────────────────────
app.whenReady().then(async () => {
    // 1. Start embedded blocker
    const state = await startBlocker()
    registerNotifications(state)

    // Restore saved app paths from config so auto-launch works immediately
    try {
        const { loadConfig } = require('./tunnel')
        const cfg = loadConfig()
        if (cfg.ctraderPath || cfg.tradingviewPath) {
            state.updatePaths(cfg.ctraderPath || null, cfg.tradingviewPath || null)
            console.log('[FocusGuard] ✓ Restored saved app paths:', cfg.ctraderPath, cfg.tradingviewPath)
        }
    } catch { /* ignore */ }

    // 2. In production, start the static file UI server
    if (!isDev) {
        const outDir = path.join(app.getAppPath(), 'out')
        console.log(`[FocusGuard] Serving UI from: ${outDir}`)
        uiServer = createStaticServer(outDir)
        // Wait briefly for the server to bind before opening the window
        await new Promise(resolve => setTimeout(resolve, 300))
    }

    // 3. Auto-reconnect ngrok if token was saved
    const savedToken = getSavedToken()
    if (savedToken) {
        startTunnel(BLOCKER_PORT, savedToken).then(url => { if (url) updateTrayMenu() })
    }

    // 4. Create window + tray
    createWindow()
    createTray()
    setInterval(updateTrayMenu, 5000)

    // 5. Auto-updater (production only)
    if (autoUpdater) {
        autoUpdater.logger = console
        autoUpdater.autoDownload = true
        autoUpdater.autoInstallOnAppQuit = true

        autoUpdater.on('update-available', (info) => {
            console.log(`[FocusGuard] 🆕 Update available: v${info.version}`)
            if (tray) tray.displayBalloon({
                iconType: 'info',
                title: 'FocusGuard Update',
                content: `v${info.version} is downloading in the background...`,
            })
        })

        autoUpdater.on('update-downloaded', (info) => {
            console.log(`[FocusGuard] ✅ Update downloaded: v${info.version}`)
            if (tray) tray.displayBalloon({
                iconType: 'info',
                title: 'FocusGuard — Update Ready',
                content: `v${info.version} is ready. It will install when you quit.`,
            })
            updateTrayMenu()
        })

        autoUpdater.on('error', (err) => {
            console.error('[FocusGuard] Update error:', err.message)
        })

        // Check on startup (delay slightly so app is fully loaded)
        setTimeout(() => autoUpdater.checkForUpdates().catch(() => { }), 5000)
        // Check every hour
        setInterval(() => autoUpdater.checkForUpdates().catch(() => { }), 60 * 60 * 1000)
    }
})

// Prevent the app from quitting when all windows are closed (especially when notification closes)
app.on('window-all-closed', () => {
    // Simply do nothing; by not calling app.quit(), we keep the process alive for the tray icon
    console.log('[FocusGuard] All windows closed, staying in tray...')
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', async () => {
    console.log('[FocusGuard] App is quitting...')
    isQuitting = true
    if (uiServer) uiServer.close()
    await stopTunnel()
    stopBlocker()
})

process.on('uncaughtException', (error) => {
    console.error('[FocusGuard] CRITICAL: Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
    console.error('[FocusGuard] CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason)
})
