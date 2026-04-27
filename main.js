const { app, BrowserWindow, ipcMain, Menu, session, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs/promises');
const path = require('node:path');

const OSM_TILE_URL_FILTERS = ['https://*.tile.openstreetmap.org/*'];
const OSM_POLICY_REFERER = 'https://blysh-ley.github.io/TokyoRailMap/';
const OSM_POLICY_USER_AGENT = `TokyoRailMap/${app.getVersion()} (+https://github.com/Blysh-Ley/TokyoRailMap)`;

autoUpdater.autoDownload = false;

const MANUAL_DOWNLOAD_URL = 'https://github.com/Blysh-Ley/TokyoRailMap/releases/latest';
const MANUAL_DOWNLOAD_URL_BAIDU = 'https://pan.baidu.com/s/1AjvtvXRBL6aQj5XvIq7_Fg?pwd=tr54';
const CHANGELOG_FILE = 'CHANGELOG.md';
const DEBUG_FORCE_UPDATE_PROMPT = false;

const MANUAL_DOWNLOAD_SOURCES = [
    { id: 'baiduyun', label: '百度云(国内)', url: MANUAL_DOWNLOAD_URL_BAIDU },
    { id: 'github', label: 'github源(国外)', url: MANUAL_DOWNLOAD_URL }
];

const DEBUG_EXTRA_MANUAL_DOWNLOAD_SOURCES = [
    { id: 'mirror-demo', label: '演示镜像(调试)', url: 'https://example.com/download', debugOnly: true }
];

let isUpdatePromptVisible = false;
let isAutoUpdateCheckEnabled = true;
let pendingUpToDateDialog = false;
let updateCheckInFlight = null;

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

const stripMarkdownInline = (text) => {
    return String(text ?? '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .trim();
};

const formatMarkdownAsDialogText = (markdown) => {
    const lines = String(markdown ?? '').split(/\r?\n/);
    const formatted = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';

        if (/^#{1,6}\s+/.test(trimmed)) {
            return stripMarkdownInline(trimmed.replace(/^#{1,6}\s+/, ''));
        }

        if (/^[-*]\s+/.test(trimmed)) {
            return `• ${stripMarkdownInline(trimmed.replace(/^[-*]\s+/, ''))}`;
        }

        return stripMarkdownInline(trimmed);
    });

    return formatted
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const extractLatestChangelogSection = (markdown) => {
    const lines = String(markdown ?? '').split(/\r?\n/);
    const headingIndexes = [];

    lines.forEach((line, idx) => {
        if (/^##\s+/.test(line.trim())) {
            headingIndexes.push(idx);
        }
    });

    if (!headingIndexes.length) {
        return formatMarkdownAsDialogText(markdown);
    }

    const start = headingIndexes[0];
    const end = headingIndexes[1] ?? lines.length;
    const section = lines.slice(start, end).join('\n').trim();
    return formatMarkdownAsDialogText(section);
};

const formatReleaseNotes = (releaseNotes) => {
    if (!releaseNotes) return '';
    if (typeof releaseNotes === 'string') return releaseNotes;
    if (Array.isArray(releaseNotes)) {
        return releaseNotes
            .map((item) => {
                if (typeof item === 'string') return item;
                if (item && typeof item.note === 'string') return item.note;
                return '';
            })
            .filter(Boolean)
            .join('\n\n');
    }
    return '';
};

const loadChangelog = async () => {
    const changelogPath = path.join(APP_ROOT, CHANGELOG_FILE);
    try {
        return await fs.readFile(changelogPath, 'utf8');
    } catch {
        return '';
    }
};

const resolveUpdateNotes = async (info) => {
    const fromEvent = formatReleaseNotes(info?.releaseNotes);
    if (fromEvent.trim()) return formatMarkdownAsDialogText(fromEvent);

    const fromChangelog = await loadChangelog();
    if (fromChangelog.trim()) return extractLatestChangelogSection(fromChangelog);

    return '本次更新说明暂未提供。';
};

const showUpdatePrompt = async (info) => {
    if (isUpdatePromptVisible) return;
    isUpdatePromptVisible = true;

    try {
        const notes = await resolveUpdateNotes(info);
        const message = `发现新版本：${info?.version || '未知版本'}`;
        const detail = [
            notes,
            '',
            '国内网络请选择手动下载'
        ].join('\n');

        const result = await dialog.showMessageBox({
            type: 'info',
            title: '发现新版本',
            message,
            detail,
            buttons: ['直接下载', '手动下载', '稍后'],
            defaultId: 0,
            cancelId: 2,
            noLink: true
        });

        if (result.response === 0) {
            await autoUpdater.downloadUpdate();
            return;
        }

        if (result.response === 1) {
            await showManualDownloadSourcePrompt();
        }
    } finally {
        isUpdatePromptVisible = false;
    }
};

const showUpToDatePrompt = async () => {
    await dialog.showMessageBox({
        type: 'info',
        title: '版本检查',
        message: '已是最新版本',
        buttons: ['确定'],
        defaultId: 0,
        noLink: true
    });
};

const getManualDownloadSources = () => {
    if (!DEBUG_FORCE_UPDATE_PROMPT) return [...MANUAL_DOWNLOAD_SOURCES];
    return [...MANUAL_DOWNLOAD_SOURCES, ...DEBUG_EXTRA_MANUAL_DOWNLOAD_SOURCES];
};

const showMissingManualDownloadUrlPrompt = async (sourceLabel) => {
    await dialog.showMessageBox({
        type: 'info',
        title: '下载源未配置',
        message: `${sourceLabel}链接尚未填写`,
        detail: '请在 main.js 中补充对应下载链接。',
        buttons: ['确定'],
        defaultId: 0,
        noLink: true
    });
};

const showManualDownloadSourcePrompt = async () => {
    const sources = getManualDownloadSources();
    if (!sources.length) return;

    const result = await dialog.showMessageBox({
        type: 'question',
        title: '手动下载',
        message: '请选择下载源',
        buttons: [...sources.map((x) => x.label), '取消'],
        defaultId: 0,
        cancelId: sources.length,
        noLink: true
    });

    if (result.response < 0 || result.response >= sources.length) return;

    const selected = sources[result.response];
    const url = String(selected?.url || '').trim();
    if (!url) {
        await showMissingManualDownloadUrlPrompt(selected?.label || '该下载源');
        return;
    }

    await shell.openExternal(url);
};

const isGithubConnectivityError = (err) => {
    const msg = String(err?.message || err || '').toLowerCase();
    if (!msg) return false;

    const markers = [
        'github',
        'api.github.com',
        'objects.githubusercontent.com',
        'enotfound',
        'econnrefused',
        'etimedout',
        'eai_again',
        'socket hang up',
        'network'
    ];

    return markers.some((item) => msg.includes(item));
};

const runUpdateCheck = ({ force = false, showUpToDateWhenNoUpdate = false } = {}) => {
    if (!force && !isAutoUpdateCheckEnabled) {
        return Promise.resolve({ skipped: true, reason: 'auto-update-disabled' });
    }

    if (updateCheckInFlight) {
        if (showUpToDateWhenNoUpdate) pendingUpToDateDialog = true;
        return updateCheckInFlight;
    }

    if (DEBUG_FORCE_UPDATE_PROMPT) {
        return showUpdatePrompt({
            version: `${app.getVersion()} (调试弹窗)`
        }).catch((err) => {
            console.error('[autoUpdater] 调试弹窗失败:', err?.message || err);
        });
    }

    pendingUpToDateDialog = showUpToDateWhenNoUpdate === true;
    updateCheckInFlight = autoUpdater.checkForUpdates().catch(async (err) => {
        // 手动检查时如果无法连到 GitHub，则降级为“已是最新版本”的友好提示。
        if (pendingUpToDateDialog && isGithubConnectivityError(err)) {
            pendingUpToDateDialog = false;
            await showUpToDatePrompt();
            return { degraded: true, reason: 'github-unreachable' };
        }

        console.error('[autoUpdater] 启动更新检查失败:', err?.message || err);
        throw err;
    }).finally(() => {
        updateCheckInFlight = null;
    });

    return updateCheckInFlight;
};

const setupAutoUpdate = (win) => {
    autoUpdater.on('update-available', async (info) => {
        pendingUpToDateDialog = false;
        await showUpdatePrompt(info);
    });

    autoUpdater.on('update-not-available', async () => {
        if (!pendingUpToDateDialog) return;
        pendingUpToDateDialog = false;
        await showUpToDatePrompt();
    });

    autoUpdater.on('error', (err) => {
        console.error('[autoUpdater] 更新检查失败:', err?.message || err);
    });

    const scheduleCheck = () => {
        // 放到下一轮事件循环，避免与首屏渲染争抢初始化时机。
        setTimeout(() => {
            runUpdateCheck({ force: false, showUpToDateWhenNoUpdate: false }).catch(() => {
                // ignore
            });
        }, 3000);
    };

    if (win?.webContents) {
        if (win.webContents.isLoading()) {
            win.webContents.once('did-finish-load', scheduleCheck);
        } else {
            scheduleCheck();
        }
        return;
    }

    scheduleCheck();
};

const configureOsmRequestHeaders = () => {
    const ses = session.defaultSession;
    if (!ses?.webRequest?.onBeforeSendHeaders) return;

    // OSM 瓦片策略要求可识别来源，file:// 场景需手动补请求头。
    ses.webRequest.onBeforeSendHeaders({ urls: OSM_TILE_URL_FILTERS }, (details, callback) => {
        const requestHeaders = {
            ...(details.requestHeaders || {}),
            Referer: OSM_POLICY_REFERER
        };

        if (!requestHeaders['User-Agent']) {
            requestHeaders['User-Agent'] = OSM_POLICY_USER_AGENT;
        }

        callback({ requestHeaders });
    });
};

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

    //win.webContents.openDevTools();
    win.setMenuBarVisibility(false);
    win.loadFile('index.html');
    return win;
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

ipcMain.handle('tokyorail:set-auto-update-check-enabled', async (_event, enabled) => {
    isAutoUpdateCheckEnabled = enabled !== false;
    return { enabled: isAutoUpdateCheckEnabled };
});

ipcMain.handle('tokyorail:check-for-updates-now', async () => {
    try {
        await runUpdateCheck({ force: true, showUpToDateWhenNoUpdate: true });
        return { ok: true };
    } catch (err) {
        return {
            ok: false,
            error: err?.message || String(err || 'unknown error')
        };
    }
});

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    configureOsmRequestHeaders();
    const mainWindow = createWindow();
    setupAutoUpdate(mainWindow);

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
