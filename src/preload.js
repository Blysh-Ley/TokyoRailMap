const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('TokyoRailElectron', {
    readLocalFile: async (urlOrPath, options = {}) => {
        return ipcRenderer.invoke('tokyorail:read-local-file', urlOrPath, options);
    },
    setAutoUpdateCheckEnabled: async (enabled) => {
        return ipcRenderer.invoke('tokyorail:set-auto-update-check-enabled', enabled);
    },
    checkForUpdatesNow: async () => {
        return ipcRenderer.invoke('tokyorail:check-for-updates-now');
    }
});
