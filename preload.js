const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('TokyoRailElectron', {
    readLocalFile: async (urlOrPath) => {
        return ipcRenderer.invoke('tokyorail:read-local-file', urlOrPath);
    },
    setAutoUpdateCheckEnabled: async (enabled) => {
        return ipcRenderer.invoke('tokyorail:set-auto-update-check-enabled', enabled);
    },
    checkForUpdatesNow: async () => {
        return ipcRenderer.invoke('tokyorail:check-for-updates-now');
    }
});
