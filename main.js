const { app, BrowserWindow, ipcMain, Menu, session, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs/promises');
const path = require('node:path');

const isDev = !app.isPackaged;
const OSM_TILE_URL_FILTERS = ['https://*.tile.openstreetmap.org/*'];
const OSM_POLICY_REFERER = 'https://blysh-ley.github.io/TokyoRailMap/';
const OSM_POLICY_USER_AGENT = `TokyoRailMap/${app.getVersion()} (+https://github.com/Blysh-Ley/TokyoRailMap)`;

autoUpdater.autoDownload = false;

const MANUAL_DOWNLOAD_URL = 'https://github.com/Blysh-Ley/TokyoRailMap/releases/latest';
const MANUAL_DOWNLOAD_URL_BAIDU = 'https://pan.baidu.com/s/1AjvtvXRBL6aQj5XvIq7_Fg?pwd=tr54';
const CHANGELOG_FILE = 'CHANGELOG.md';
const DEBUG_FORCE_UPDATE_PROMPT = isDev && false;
const GITHUB_LATEST_RELEASE_API = 'https://api.github.com/repos/Blysh-Ley/TokyoRailMap/releases/latest';

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
let progressWindow = null; // 用于保存进度条窗口实例

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
    '.pmtiles': 'application/octet-stream',
    '.csv': 'text/csv; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
};

const APP_ROOT = app.getAppPath();
const BUNDLED_PMTILES_RELATIVE_PATH = path.join('tiles', 'kanto.pmtiles');

const getPackagedVariantId = () => {
    try {
        const metadata = require(path.join(APP_ROOT, 'package.json'));
        const value = String(metadata?.tokyoRailVariant || '').trim().toLowerCase();
        return value === 'online' ? 'online' : 'offline';
    } catch {
        return 'offline';
    }
};

const getReleaseArtifactSuffix = () => getPackagedVariantId();

const getReleaseDmgName = (version) => (
    `TokyoRailMap-${version}-mac-arm64-${getReleaseArtifactSuffix()}.dmg`
);

const stripQueryAndHash = (value) => String(value ?? '').split(/[?#]/)[0] || '';

const getBundledPmtilesPath = () => (
    app.isPackaged
        ? path.join(`${APP_ROOT}.unpacked`, BUNDLED_PMTILES_RELATIVE_PATH)
        : path.join(APP_ROOT, BUNDLED_PMTILES_RELATIVE_PATH)
);

const normalizeLocalReadHeaders = (headers = {}) => {
    if (!headers || typeof headers !== 'object') return {};
    if (Array.isArray(headers)) {
        return Object.fromEntries(headers.map(([key, value]) => [String(key).toLowerCase(), String(value)]));
    }
    return Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), String(value)])
    );
};

const getLocalReadRangeHeader = (options = {}) => {
    const direct = String(options?.range || '').trim();
    if (direct) return direct;
    const headers = normalizeLocalReadHeaders(options?.headers);
    return String(headers.range || '').trim();
};

const parseByteRange = (rangeHeader, size) => {
    const header = String(rangeHeader || '').trim();
    if (!header) return null;
    const match = header.match(/^bytes=(\d*)-(\d*)$/i);
    if (!match) return { invalid: true };

    const [, startText, endText] = match;
    if (!startText && !endText) return { invalid: true };

    let start;
    let end;
    if (!startText) {
        const suffixLength = Number(endText);
        if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { invalid: true };
        start = Math.max(0, size - suffixLength);
        end = size - 1;
    } else {
        start = Number(startText);
        end = endText ? Number(endText) : size - 1;
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
        return { unsatisfied: true };
    }
    return { start, end: Math.min(end, size - 1) };
};

// =============== 进度条窗口管理 ===============
const createProgressWindow = () => {
    if (progressWindow) return progressWindow;
    progressWindow = new BrowserWindow({
        width: 400,
        height: 150,
        resizable: false,
        center: true,
        autoHideMenuBar: true,
        title: '正在下载更新',
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    progressWindow.setMenu(null);
    
    // 用纯 HTML 渲染一个简单的进度条界面
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <body style="font-family: system-ui, sans-serif; padding: 20px; background: #f5f5f5; color: #333;">
            <div style="margin-bottom: 10px; font-weight: bold;" id="status">准备下载...</div>
            <div style="width: 100%; background: #ddd; height: 20px; border-radius: 10px; overflow: hidden;">
                <div id="bar" style="width: 0%; background: #0078d7; height: 100%; transition: width 0.2s;"></div>
            </div>
            <div style="margin-top: 10px; font-size: 12px; color: #666;" id="percent">0%</div>
        </body>
        </html>
    `;
    progressWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
    
    progressWindow.on('closed', () => { progressWindow = null; });
    return progressWindow;
};

const updateProgressUI = (percent, textInfo) => {
    if (!progressWindow) return;
    const p = Math.min(100, Math.max(0, percent)).toFixed(1);
    const script = `
        document.getElementById('bar').style.width = '${p}%';
        document.getElementById('percent').innerText = '${p}%' + ('${textInfo}' ? ' - ${textInfo}' : '');
    `;
    progressWindow.webContents.executeJavaScript(script).catch(() => {});
};

const closeProgressWindow = () => {
    if (progressWindow) {
        progressWindow.destroy();
        progressWindow = null;
    }
};
// ============================================

const resolveLocalPath = (rawInput) => {
    let input = String(rawInput ?? '').trim();
    if (!input) return '';
    if (/^(https?:|data:|blob:|ws:|wss:)/i.test(input)) return '';
    if (input.startsWith('file://')) {
        try {
            const asUrl = new URL(input);
            input = decodeURIComponent(asUrl.pathname || '');
        } catch { }
    }
    if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(input)) {
        input = input.slice(1);
    }
    const decoded = decodeURIComponent(stripQueryAndHash(input));
    const resolved = path.isAbsolute(decoded)
        ? path.resolve(decoded)
        : path.resolve(APP_ROOT, decoded.replace(/^\/+/, ''));
    const rootWithSep = APP_ROOT.endsWith(path.sep) ? APP_ROOT : `${APP_ROOT}${path.sep}`;
    if (resolved === APP_ROOT || resolved.startsWith(rootWithSep)) {
        const relativePath = path.relative(APP_ROOT, resolved);
        if (relativePath === BUNDLED_PMTILES_RELATIVE_PATH) return getBundledPmtilesPath();
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

const compareVersions = (v1, v2) => {
    const parts1 = String(v1 ?? '').split('.').map(x => parseInt(x, 10) || 0);
    const parts2 = String(v2 ?? '').split('.').map(x => parseInt(x, 10) || 0);
    const maxLen = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < maxLen; i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 < p2) return -1;
        if (p1 > p2) return 1;
    }
    return 0;
};

const formatMarkdownAsDialogText = (markdown) => {
    const lines = String(markdown ?? '').split(/\r?\n/);
    const formatted = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        if (/^#{1,6}\s+/.test(trimmed)) return stripMarkdownInline(trimmed.replace(/^#{1,6}\s+/, ''));
        if (/^[-*]\s+/.test(trimmed)) return `• ${stripMarkdownInline(trimmed.replace(/^[-*]\s+/, ''))}`;
        return stripMarkdownInline(trimmed);
    });
    return formatted.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const extractLatestChangelogSection = (markdown, currentVersion = '') => {
    const lines = String(markdown ?? '').split(/\r?\n/);
    const headingIndexes = [];
    const versionMatches = [];

    lines.forEach((line, idx) => {
        if (/^##\s+/.test(line.trim())) {
            headingIndexes.push(idx);
            const versionMatch = line.match(/##\s+\[?v?([0-9]+\.[0-9]+\.[0-9]+)\]?/);
            if (versionMatch && versionMatch[1]) {
                versionMatches.push({ idx, version: versionMatch[1] });
            }
        }
    });

    if (!headingIndexes.length) return formatMarkdownAsDialogText(markdown);

    if (currentVersion) {
        const newerVersions = versionMatches.filter(
            item => compareVersions(item.version, currentVersion) > 0
        );

        if (newerVersions.length > 0) {
            const firstNewIdx = newerVersions[0].idx;
            const lastNewerVersionIdx = newerVersions[newerVersions.length - 1].idx;
            const headingPos = headingIndexes.indexOf(lastNewerVersionIdx);
            const endIdx = headingIndexes[headingPos + 1] ?? lines.length;
            
            const section = lines.slice(firstNewIdx, endIdx).join('\n').trim();
            return formatMarkdownAsDialogText(section);
        }
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

const truncateToFirstLines = (text, maxLines = 15) => {
    const lines = String(text ?? '').split(/\r?\n/);
    if (lines.length <= maxLines) return lines.join('\n').trim();
    return `${lines.slice(0, maxLines).join('\n').trim()}\n...`;
};

const loadChangelog = async () => {
    const changelogPath = path.join(APP_ROOT, CHANGELOG_FILE);
    try {
        return await fs.readFile(changelogPath, 'utf8');
    } catch {
        return '';
    }
};

const loadLatestReleaseInfoFromGithub = async () => {
    try {
        const response = await fetch(GITHUB_LATEST_RELEASE_API, {
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': OSM_POLICY_USER_AGENT
            }
        });
        if (!response.ok) return null;
        const data = await response.json();
        const version = String(data?.tag_name || '').replace(/^v/i, '').trim();
        const releaseNotes = String(data?.body || '').trim();
        if (!version && !releaseNotes) return null;
        return {
            version: version || '未知版本',
            releaseNotes,
            isDebugTest: true,
            debugUseRealNotes: true
        };
    } catch (err) {
        console.error('[debug-update] 拉取 GitHub 最新发布信息失败:', err?.message || err);
        return null;
    }
};

const resolveUpdateNotes = async (info, currentVersion = '') => {
    const fromEvent = formatReleaseNotes(info?.releaseNotes);
    if (fromEvent.trim()) {
        const filtered = extractLatestChangelogSection(fromEvent, currentVersion);
        return truncateToFirstLines(filtered, 15);
    }
    const fromChangelog = await loadChangelog();
    if (fromChangelog.trim()) {
        const filtered = extractLatestChangelogSection(fromChangelog, currentVersion);
        return truncateToFirstLines(filtered, 15);
    }
    return '本次更新说明暂未提供。';
};

const showUpdatePrompt = async (info) => {
    if (isUpdatePromptVisible) return;
    isUpdatePromptVisible = true;

    try {
        const currentVersion = app.getVersion();
        
        const actualNewVersion = info?.version || '未知版本';
        const displayNewVersion = info?.isDebugTest ? `${actualNewVersion} (测试模式)` : actualNewVersion;
        
        const resolvedNotes = await resolveUpdateNotes(info, currentVersion);
        const notes = info?.isDebugTest
            ? [
                '【测试环境】当前内容来自 GitHub latest release，用于验证线上更新说明展示。',
                '',
                resolvedNotes
            ].join('\n')
            : resolvedNotes;

        const message = [
            `发现新版本：${displayNewVersion}`,
            `当前版本：${currentVersion}`
        ].join('\n');
        
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
            
            if (process.platform === 'darwin') {
                // macOS: 手动接管下载，保存并打开安装包
                const dmgName = getReleaseDmgName(actualNewVersion);
                const downloadUrl = `https://github.com/Blysh-Ley/TokyoRailMap/releases/download/v${actualNewVersion}/${dmgName}`;
                
                const saveDialogResult = await dialog.showSaveDialog({
                    title: '保存安装包',
                    defaultPath: path.join(app.getPath('downloads'), dmgName),
                    filters: [{ name: 'Mac Disk Image', extensions: ['dmg'] }]
                });

                if (saveDialogResult.canceled || !saveDialogResult.filePath) {
                    return; 
                }

                const savePath = saveDialogResult.filePath;
                createProgressWindow();

                session.defaultSession.once('will-download', (event, item, webContents) => {
                    item.setSavePath(savePath);
                    
                    item.on('updated', (event, state) => {
                        if (state === 'interrupted') {
                            updateProgressUI(0, '下载已中断');
                        } else if (state === 'progressing') {
                            if (item.isPaused()) {
                                updateProgressUI(0, '已暂停');
                            } else {
                                const received = item.getReceivedBytes();
                                const total = item.getTotalBytes();
                                const percent = total > 0 ? (received / total) * 100 : 0;
                                const mbReceived = (received / 1024 / 1024).toFixed(2);
                                const mbTotal = (total / 1024 / 1024).toFixed(2);
                                updateProgressUI(percent, `${mbReceived} MB / ${mbTotal} MB`);
                            }
                        }
                    });
                    
                    item.once('done', (event, state) => {
                        closeProgressWindow();
                        if (state === 'completed') {
                            // 下载完成，打开 DMG 并关闭程序
                            shell.openPath(savePath).then((error) => {
                                if (!error) {
                                    app.quit();
                                } else {
                                    dialog.showErrorBox('挂载失败', `无法打开安装包: ${error}`);
                                }
                            });
                        } else {
                            dialog.showErrorBox('下载失败', `下载未成功完成。状态: ${state}`);
                        }
                    });
                });

                const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
                if (win) {
                    win.webContents.downloadURL(downloadUrl);
                }

            } else {
                // Windows: 使用 autoUpdater，展示并更新进度条
                createProgressWindow();
                if (info?.isDebugTest) {
                    // autoUpdater 在没有真实收到服务器新版本事件时调用 downloadUpdate() 可能会报错。
                    // 若要在测试模式下也真实测试 Windows 的下载，由于它归 electron-updater 管，这里建议仅观察 UI。
                    // 真实环境中 autoUpdater 会自动接管下载。
                    updateProgressUI(100, '测试模式下 Windows autoUpdater 拦截真实下载');
                    setTimeout(() => closeProgressWindow(), 2000);
                } else {
                    await autoUpdater.downloadUpdate();
                }
            }
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
    const currentVersion = app.getVersion();
    await dialog.showMessageBox({
        type: 'info',
        title: '版本检查',
        message: `已是最新版本\n当前版本：v${currentVersion}`,
        buttons: ['确定'],
        defaultId: 0,
        noLink: true
    });
};

const showDevSkippedUpdateCheckPrompt = async () => {
    const latestInfo = await loadLatestReleaseInfoFromGithub();
    if (latestInfo?.version && compareVersions(latestInfo.version, app.getVersion()) > 0) {
        await showUpdatePrompt(latestInfo);
        return;
    }
    await showUpToDatePrompt();
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

    const markers = ['github', 'api.github.com', 'objects.githubusercontent.com', 'enotfound', 'econnrefused', 'etimedout', 'eai_again', 'socket hang up', 'network'];
    return markers.some((item) => msg.includes(item));
};

const runUpdateCheck = ({ force = false, showUpToDateWhenNoUpdate = false } = {}) => {
    if (!force && !isAutoUpdateCheckEnabled) return Promise.resolve({ skipped: true, reason: 'auto-update-disabled' });
    if (updateCheckInFlight) {
        if (showUpToDateWhenNoUpdate) pendingUpToDateDialog = true;
        return updateCheckInFlight;
    }

    if (DEBUG_FORCE_UPDATE_PROMPT) {
        return loadLatestReleaseInfoFromGithub()
            .then((debugInfo) => showUpdatePrompt(debugInfo || {
                version: app.getVersion(),
                isDebugTest: true
            }))
            .catch(err => console.error(err));
    }

    pendingUpToDateDialog = showUpToDateWhenNoUpdate === true;
    updateCheckInFlight = autoUpdater.checkForUpdates().then(async (result) => {
        if (pendingUpToDateDialog && result == null) {
            pendingUpToDateDialog = false;
            await showDevSkippedUpdateCheckPrompt();
        }
        return result;
    }).catch(async (err) => {
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

    // 接收 Windows 端的下载进度并更新窗口
    autoUpdater.on('download-progress', (progressObj) => {
        if (progressWindow) {
            const speed = (progressObj.bytesPerSecond / 1024 / 1024).toFixed(2) + ' MB/s';
            updateProgressUI(progressObj.percent, speed);
        }
    });

    // Windows 端下载完成后自动重启安装
    autoUpdater.on('update-downloaded', (info) => {
        closeProgressWindow();
        autoUpdater.quitAndInstall();
    });

    const scheduleCheck = () => {
        setTimeout(() => {
            runUpdateCheck({ force: false, showUpToDateWhenNoUpdate: false }).catch(() => {});
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
    ses.webRequest.onBeforeSendHeaders({ urls: OSM_TILE_URL_FILTERS }, (details, callback) => {
        const requestHeaders = { ...(details.requestHeaders || {}), Referer: OSM_POLICY_REFERER };
        if (!requestHeaders['User-Agent']) requestHeaders['User-Agent'] = OSM_POLICY_USER_AGENT;
        callback({ requestHeaders });
    });
};

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'src', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    if (!app.isPackaged) {
        win.webContents.openDevTools({ mode: 'detach' }); // 'detach' 表示在独立窗口打开，不占用主窗口空间
    }

    win.setMenuBarVisibility(false);
    win.loadFile('index.html');
    return win;
};

ipcMain.handle('tokyorail:read-local-file', async (_event, rawInput, options = {}) => {
    const resolved = resolveLocalPath(rawInput);
    if (!resolved) return { status: 400, statusText: 'Bad Request', headers: [['content-type', 'text/plain; charset=utf-8']], bodyBase64: '' };
    try {
        const stats = await fs.stat(resolved);
        const range = parseByteRange(getLocalReadRangeHeader(options), stats.size);
        const baseHeaders = [
            ['content-type', getContentType(resolved)],
            ['accept-ranges', 'bytes']
        ];
        if (range?.invalid || range?.unsatisfied) {
            return {
                status: 416,
                statusText: 'Range Not Satisfiable',
                headers: [
                    ...baseHeaders,
                    ['content-range', `bytes */${stats.size}`],
                    ['content-length', '0']
                ],
                bodyBase64: ''
            };
        }
        if (range) {
            const length = range.end - range.start + 1;
            const file = await fs.open(resolved, 'r');
            try {
                const buffer = Buffer.alloc(length);
                const { bytesRead } = await file.read(buffer, 0, length, range.start);
                const body = bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
                return {
                    status: 206,
                    statusText: 'Partial Content',
                    headers: [
                        ...baseHeaders,
                        ['content-range', `bytes ${range.start}-${range.start + bytesRead - 1}/${stats.size}`],
                        ['content-length', String(bytesRead)]
                    ],
                    bodyBase64: toBase64(body)
                };
            } finally {
                await file.close();
            }
        }
        const buf = await fs.readFile(resolved);
        return {
            status: 200,
            statusText: 'OK',
            headers: [
                ...baseHeaders,
                ['content-length', String(buf.byteLength)]
            ],
            bodyBase64: toBase64(buf)
        };
    } catch (err) {
        if (err && err.code === 'ENOENT') return { status: 404, statusText: 'Not Found', headers: [['content-type', 'text/plain; charset=utf-8']], bodyBase64: '' };
        return { status: 500, statusText: 'Internal Server Error', headers: [['content-type', 'text/plain; charset=utf-8']], bodyBase64: '' };
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
        return { ok: false, error: err?.message || String(err || 'unknown error') };
    }
});

app.whenReady().then(async () => {
    // 1. 获取操作系统的代理设置
    const proxyConfig = await session.defaultSession.resolveProxy('https://github.com');
    
    // proxyConfig 的格式通常是 "PROXY 127.0.0.1:7890" 或 "DIRECT"
    if (proxyConfig !== 'DIRECT') {
        const proxyUrl = proxyConfig.replace('PROXY ', 'http://');
        // 2. 将代理设置给 Node.js 的环境变量
        process.env.HTTP_PROXY = proxyUrl;
        process.env.HTTPS_PROXY = proxyUrl;
        process.env.http_proxy = proxyUrl;
        process.env.https_proxy = proxyUrl;
        console.log('[Proxy] Node.js 环境变量代理已设置为:', proxyUrl);
    }

    Menu.setApplicationMenu(null);
    configureOsmRequestHeaders();
    const mainWindow = createWindow();
    setupAutoUpdate(mainWindow);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    app.quit();
});
