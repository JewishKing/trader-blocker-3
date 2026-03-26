'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    isElectron: true,
    // Blocker
    getStatus: () => ipcRenderer.invoke('blocker:status'),
    forceLock: () => ipcRenderer.invoke('blocker:lock'),
    disableBlocker: () => ipcRenderer.invoke('blocker:disable'),
    enableBlocker: () => ipcRenderer.invoke('blocker:enable'),
    // Tunnel
    getTunnelUrl: () => ipcRenderer.invoke('tunnel:url'),
    getSavedToken: () => ipcRenderer.invoke('tunnel:savedToken'),
    startTunnel: (token) => ipcRenderer.invoke('tunnel:start', token),
    stopTunnel: () => ipcRenderer.invoke('tunnel:stop'),
    saveToken: (token) => ipcRenderer.invoke('tunnel:saveToken', token),
    // Sound
    getAlertSound: () => ipcRenderer.invoke('sound:get'),
    setAlertSound: (sound) => ipcRenderer.invoke('sound:set', sound),
    uploadAlertSound: () => ipcRenderer.invoke('sound:upload'),
    // App Paths / Auto-launch
    getSavedPaths: () => ipcRenderer.invoke('blocker:getSavedPaths'),
    updatePaths: (paths) => ipcRenderer.invoke('blocker:updatePaths', paths),
    setAutoLaunch: (enabled) => ipcRenderer.invoke('blocker:setAutoLaunch', enabled),
    // Emergency Codes

    getEmergencyCodes: () => ipcRenderer.invoke('emergency:getCodes'),
    generateEmergencyCodes: () => ipcRenderer.invoke('emergency:generate'),
    useEmergencyCode: (code) => ipcRenderer.invoke('emergency:use', code),
})
