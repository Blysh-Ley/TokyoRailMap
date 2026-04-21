const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('TokyoRailElectron', {
    readLocalFile: async (urlOrPath) => {
        return ipcRenderer.invoke('tokyorail:read-local-file', urlOrPath);
    }
});
