'use strict'

const { BrowserWindow, screen, ipcMain, app } = require('electron')
const path = require('path')

let notifWindow = null
let currentOnView = null
let ipcRegistered = false

function destroyNotif() {
    // Use destroy() not close() — close() fires window-all-closed which can quit the app
    if (notifWindow && !notifWindow.isDestroyed()) {
        notifWindow.destroy()
    }
    notifWindow = null
}

function registerIpc() {
    if (ipcRegistered) return
    ipcRegistered = true

    ipcMain.on('notif:view', () => {
        const cb = currentOnView
        currentOnView = null
        destroyNotif()
        if (cb) {
            try { cb() } catch { /* ignore */ }
        }
    })

    ipcMain.on('notif:dismiss', () => {
        currentOnView = null
        destroyNotif()
    })
}

function showAlertNotification({ ticker, message, duration, onView }) {
    // Register IPC listeners once
    registerIpc()

    // Destroy any existing notification window
    destroyNotif()
    currentOnView = onView

    // Read saved sound preference
    let sound = 'bell'
    try {
        const { loadConfig } = require('./tunnel')
        sound = loadConfig().alertSound || 'bell'
    } catch { /* use default */ }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize

    notifWindow = new BrowserWindow({
        width: 400,
        height: 140,
        x: width - 420,
        y: 20,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        show: false,
        focusable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false,
        },
    })

    // When the notification window itself is closed externally (e.g. OS kill),
    // clear refs without triggering the global window-all-closed handler again
    notifWindow.on('closed', () => {
        notifWindow = null
    })

    const htmlPath = path.join(app.getAppPath(), 'public', 'notification.html')
    notifWindow.loadFile(htmlPath)

    notifWindow.once('ready-to-show', () => {
        if (notifWindow && !notifWindow.isDestroyed()) {
            notifWindow.showInactive()

            let finalSound = sound
            if (sound && sound.startsWith('custom:')) {
                const fileName = sound.split(':')[1]
                const fullPath = path.join(app.getPath('userData'), fileName)
                finalSound = 'file://' + fullPath.replace(/\\/g, '/')
            }

            notifWindow.webContents.send('notif:data', {
                ticker: ticker || 'ALERT',
                message: message || 'Trading window is now open',
                duration: duration || 30,
                sound: finalSound,
            })
        }
    })
}

module.exports = { showAlertNotification }
