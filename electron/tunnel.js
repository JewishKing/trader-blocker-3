'use strict'

/**
 * Embedded ngrok tunnel manager for FocusGuard
 * Starts a tunnel on the blocker webhook port so TradingView can
 * send alerts to the app from the internet — no external terminals.
 */

let ngrok
try {
    ngrok = require('@ngrok/ngrok')
} catch {
    ngrok = null
}

const path = require('path')
const fs = require('fs')
const os = require('os')

// Persist the auth token between sessions
const CONFIG_PATH = path.join(os.homedir(), '.focusguard', 'config.json')

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
        }
    } catch { /* ignore */ }
    return {}
}

function saveConfig(data) {
    try {
        const dir = path.dirname(CONFIG_PATH)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        const existing = loadConfig()
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...existing, ...data }, null, 2))
    } catch { /* ignore */ }
}

let _listener = null
let _tunnelUrl = null
let _authToken = null

/**
 * Start an ngrok tunnel on the given port.
 * Requires an ngrok auth token (free account at ngrok.com).
 * Returns the public HTTPS URL, or null if no token configured.
 */
async function startTunnel(port, authToken) {
    if (!ngrok) {
        console.log('[FocusGuard] ngrok package not available')
        return null
    }

    const token = authToken || loadConfig().ngrokAuthToken
    if (!token) {
        console.log('[FocusGuard] No ngrok auth token — tunnel not started')
        console.log('[FocusGuard]   Get a free token at https://ngrok.com and set it in the dashboard')
        return null
    }

    // Save the token for future sessions
    if (token !== _authToken) {
        saveConfig({ ngrokAuthToken: token })
        _authToken = token
    }

    try {
        console.log('[FocusGuard] Starting ngrok tunnel...')
        
        const config = loadConfig()
        const options = {
            addr: port,
            authtoken: token,
            proto: 'http',
        }
        if (config.ngrokDomain) {
            options.domain = config.ngrokDomain
        }

        _listener = await ngrok.forward(options)
        _tunnelUrl = _listener.url()
        console.log(`[FocusGuard] ✅ Tunnel active: ${_tunnelUrl}`)
        console.log(`[FocusGuard]    TradingView webhook: ${_tunnelUrl}/alert`)
        return _tunnelUrl
    } catch (err) {
        console.error('[FocusGuard] Tunnel failed:', err.message)
        return null
    }
}

async function stopTunnel() {
    if (_listener) {
        try { await _listener.close() } catch { /* ignore */ }
        _listener = null
        _tunnelUrl = null
        console.log('[FocusGuard] Tunnel closed')
    }
}

function getTunnelUrl() { return _tunnelUrl }
function getSavedToken() { return loadConfig().ngrokAuthToken || null }

module.exports = { startTunnel, stopTunnel, getTunnelUrl, getSavedToken, saveConfig, loadConfig }
