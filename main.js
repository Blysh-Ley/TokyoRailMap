const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const MIME_BY_EXT = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.csv': 'text/csv; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
};

const APP_ROOT = app.getAppPath();

const resolveLocalPath = (rawInput) => {
    let input = String(rawInput ?? '').trim();
    if (!input) return '';

    // 忽略远端资源，交给浏览器原生 fetch。
    if (/^(https?:|data:|blob:|ws:|wss:)/i.test(input)) return '';

    if (input.startsWith('file://')) {
        try {
            const asUrl = new URL(input);
            input = decodeURIComponent(asUrl.pathname || '');
        } catch {
            // ignore
        }
    }

    if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(input)) {
        input = input.slice(1);
    }

    // '/' 开头在 file:// 场景不再代表磁盘根，而是项目根。
    input = input.replace(/^\/+/, '');

    const decoded = decodeURIComponent(input);
    const resolved = path.resolve(APP_ROOT, decoded);
    const rootWithSep = APP_ROOT.endsWith(path.sep) ? APP_ROOT : `${APP_ROOT}${path.sep}`;

    if (resolved === APP_ROOT || resolved.startsWith(rootWithSep)) {
        return resolved;
    }
    return '';
};

const getContentType = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_BY_EXT[ext] || 'application/octet-stream';
};

const toBase64 = (data) => Buffer.from(data).toString('base64');

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    win.setMenuBarVisibility(false);
    win.loadFile('index.html');
};

ipcMain.handle('tokyorail:read-local-file', async (_event, rawInput) => {
    const resolved = resolveLocalPath(rawInput);
    if (!resolved) {
        return {
            status: 400,
            statusText: 'Bad Request',
            headers: [['content-type', 'text/plain; charset=utf-8']],
            bodyBase64: ''
        };
    }

    try {
        const buf = await fs.readFile(resolved);
        return {
            status: 200,
            statusText: 'OK',
            headers: [['content-type', getContentType(resolved)]],
            bodyBase64: toBase64(buf)
        };
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            return {
                status: 404,
                statusText: 'Not Found',
                headers: [['content-type', 'text/plain; charset=utf-8']],
                bodyBase64: ''
            };
        }
        return {
            status: 500,
            statusText: 'Internal Server Error',
            headers: [['content-type', 'text/plain; charset=utf-8']],
            bodyBase64: ''
        };
    }
});

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 按需求在 macOS / Windows 上都随窗口关闭退出。
app.on('window-all-closed', () => {
    app.quit();
});
