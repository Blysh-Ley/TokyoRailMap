// 在隔离的 Electron 中调用文件页和网页的现有选站流程，与交互算法共用实现。
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const http = require('node:http');
const root = path.dirname(__dirname);
const workDir = process.argv[2];
const sourceUrl = pathToFileURL(path.join(root, 'index.html')).href;
app.setPath('userData', path.join(workDir, 'user-data'));
app.setPath('sessionData', path.join(workDir, 'session-data'));
app.setAppPath(root);
process.chdir(root);
app.whenReady().then(() => session.defaultSession.on('will-download', (event) => event.preventDefault()));

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitUntil = async (test, message) => {
    const started = Date.now();
    while (Date.now() - started < 60000) {
        if (await test()) return;
        await pause(25);
    }
    throw new Error(message);
};

let mainWindow;
app.on('browser-window-created', (_event, window) => {
    if (mainWindow) return;
    mainWindow = window;
    window.webContents.on('did-finish-load', () => {
        window.webContents.executeJavaScript("localStorage.setItem('tokyorail.auto.update.check.enabled','0'); window.TokyoRailElectron?.setAutoUpdateCheckEnabled(false);");
    });
});
require(path.join(root, 'main.js'));

const contentTypes = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.json': 'application/json',
    '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    fs.stat(file, (error, info) => {
        if (error || !info.isFile()) { response.writeHead(404).end(); return; }
        const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        const start = range ? Number(range[1]) : 0;
        const end = range?.[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
        const headers = { 'content-type': contentTypes[path.extname(file)] || 'application/octet-stream',
            'accept-ranges': 'bytes', 'content-length': end - start + 1 };
        if (range) headers['content-range'] = `bytes ${start}-${end}/${info.size}`;
        response.writeHead(range ? 206 : 200, headers);
        fs.createReadStream(file, { start, end }).pipe(response);
    });
});

(async () => {
    await app.whenReady();
    await waitUntil(() => mainWindow && !mainWindow.webContents.isLoadingMainFrame()
        && mainWindow.webContents.getURL().startsWith(sourceUrl), '生成窗口未就绪。');
    await waitUntil(() => mainWindow.webContents.executeJavaScript(
        "window.TokyoRailSearchMapActions?.isReady === true"
    ), '初始选站入口未就绪。');
    const rawPath = path.join(workDir, 'previews.jsonl');
    let count = 0;
    let expected = 0;
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const webUrl = `http://127.0.0.1:${server.address().port}/index.html`;
    for (const [profile, entryUrl] of [['base-groups', sourceUrl], ['merged-groups', webUrl]])
    for (const theme of ['light', 'dark']) for (const serviceDay of ['Weekday', 'SaturdayHoliday']) {
        const preloadModuleUrl = new URL('./src/services/stationPreviewMaterialization.js', entryUrl).href;
        const domainModuleUrl = new URL('./src/domain/stationPreviewMaterialization.js', entryUrl).href;
        await mainWindow.loadURL(`${entryUrl}?generateStationPreviews=1`);
        await waitUntil(() => mainWindow.webContents.executeJavaScript(
            "window.TokyoRailSearchMapActions?.isReady === true && !!window.__TokyoRailMap?.getLayer('station-labels-layer')"
        ), '地图与选站入口未就绪。');
        mainWindow.webContents.closeDevTools();
        const ids = await mainWindow.webContents.executeJavaScript(`(async () => {
            localStorage.setItem('tokyorail.auto.update.check.enabled','0');
            window.TokyoRailElectron?.setAutoUpdateCheckEnabled(false);
            document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
            document.querySelector('button[data-day="${serviceDay}"]').click();
            const { getStationPreviewTargets } = await import(${JSON.stringify(domainModuleUrl)});
            return getStationPreviewTargets(window.__TokyoRailMap.getSource('stations-source')._data.features)
                .map(feature => feature.properties.id);
        })()`);
        console.log(`[站点预览] ${profile} / ${serviceDay} / ${theme}：${ids.length} 个入口`);
        expected += ids.length;
        for (const stationId of ids) {
            await mainWindow.webContents.executeJavaScript(`window.TokyoRailSearchMapActions.commitStation(${JSON.stringify(stationId)}, { skipFit: true })`);
            let record;
            await waitUntil(async () => {
                record = await mainWindow.webContents.executeJavaScript(`(async () => {
                    const { getPreparedStationPreview } = await import(${JSON.stringify(preloadModuleUrl)});
                    const value = getPreparedStationPreview(${JSON.stringify(stationId)}, ${JSON.stringify(serviceDay)}, ${JSON.stringify(theme)});
                    if (!value || document.querySelector('[data-station-timetable-loading]')) return null;
                    return JSON.stringify({ profile: ${JSON.stringify(profile)}, stationId: ${JSON.stringify(stationId)}, serviceDay: ${JSON.stringify(serviceDay)}, theme: ${JSON.stringify(theme)}, ...value },
                        (_key, value) => value instanceof Set ? { $stationPreviewSet: [...value] } : value);
                })()`);
                return !!record;
            }, `未能生成 ${stationId} / ${serviceDay} / ${theme}`);
            fs.appendFileSync(rawPath, record + '\n');
            count += 1;
            console.log(`[站点预览] ${count}：${profile} / ${stationId} / ${serviceDay} / ${theme}`);
        }
    }
    if (count !== expected || count === 0) throw new Error('站点预览覆盖数量不符。');
    app.exit(0);
})().catch((error) => {
    fs.writeFileSync(path.join(workDir, 'error.txt'), String(error.stack || error));
    console.error(error);
    app.exit(1);
});
