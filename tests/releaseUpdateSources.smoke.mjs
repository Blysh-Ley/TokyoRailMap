import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { GOOGLE_UPDATE_PROBE_URL, RELEASE_UPDATE_SOURCES } from '../src/config/releaseUpdateSources.mjs';
import { selectReleaseUpdateSource, readLatestRelease } from '../src/services/releaseUpdateService.mjs';
import { resolveDesktopRelease } from '../src/domain/desktopRelease.mjs';
import { createAppUpdateApi } from '../src/services/appUpdateService.js';
const { ReleaseUpdateProvider } = createRequire(import.meta.url)('../src/services/releaseUpdateProvider.cjs');

const github = RELEASE_UPDATE_SOURCES.github;
const atomgit = RELEASE_UPDATE_SOURCES.atomgit;
assert.equal((await selectReleaseUpdateSource({ fetchImpl: async (url, options) => {
    assert.equal(url, GOOGLE_UPDATE_PROBE_URL);
    assert.equal(options.redirect, 'error');
    return { status: 204 };
} })).id, 'github');
for (const status of [200, 302, 403, 500]) {
    assert.equal((await selectReleaseUpdateSource({ fetchImpl: async () => ({ status }) })).id, 'atomgit');
}
assert.equal((await selectReleaseUpdateSource({ fetchImpl: async () => { throw new Error('网络不可达'); } })).id, 'atomgit');
let aborted = false;
assert.equal((await selectReleaseUpdateSource({ timeoutMs: 10, fetchImpl: (_url, options) => {
    options.signal.addEventListener('abort', () => { aborted = true; });
    return new Promise(() => {});
} })).id, 'atomgit');
assert.equal(aborted, true);
assert.equal((await selectReleaseUpdateSource({ timeoutMs: 10, probeGoogleHttps: () => new Promise(() => {}) })).id, 'atomgit');

const makeRelease = (source, version = '2.1.0') => ({
    tag_name: `v${version}`, body: `${source.label} 更新说明`,
    assets: [
        { name: `TokyoRailMap-${version}-android.aab`, browser_download_url: `${source.releasesUrl}/download/v${version}/bundle.aab` },
        ...['android.apk', 'win-x64.exe', 'mac-arm64.dmg'].map((suffix) => ({
            name: `TokyoRailMap-${version}-${suffix}`,
            browser_download_url: `${source.releasesUrl}/download/v${version}/TokyoRailMap-${version}-${suffix}`
        })),
        { name: 'latest.yml', browser_download_url: `${source.releasesUrl}/download/v${version}/latest.yml` }
    ]
});

for (const source of [github, atomgit]) {
    const release = makeRelease(source);
    for (const [platform, arch, suffix] of [['win32', 'x64', 'win-x64.exe'], ['darwin', 'arm64', 'mac-arm64.dmg']]) {
        const info = resolveDesktopRelease({ release, source, platform, arch, currentVersion: '2.0.0' });
        assert.equal(info.available, true);
        assert.equal(info.downloadUrl, `${source.releasesUrl}/download/v2.1.0/TokyoRailMap-2.1.0-${suffix}`);
        assert.equal(info.releaseUrl, `${source.releasesUrl}/tag/v2.1.0`);
        assert.equal(info.releaseNotes, release.body);
    }
    assert.equal(resolveDesktopRelease({ release, source, currentVersion: '2.1.0', platform: 'win32', arch: 'x64' }).available, false);
    assert.throws(() => resolveDesktopRelease({ release: { ...release, assets: [] }, source, currentVersion: '2.0.0', platform: 'win32', arch: 'x64' }), /未找到/);

    for (const automatic of [false, true]) {
        const queried = [], installed = [], messages = [], progress = [];
        let cancelled = false, listenerRemoved = false;
        const plugin = {
            probeGoogleHttps: async () => ({ reachable: source.id === 'github' }),
            getLatestRelease: async ({ url }) => { queried.push(url); return release; },
            addListener: async (event, listener) => {
                assert.equal(event, 'apkDownloadProgress');
                listener({ downloadedBytes: 20, totalBytes: 100 });
                return { remove: () => { listenerRemoved = true; } };
            },
            downloadAndInstallApk: async (options) => { installed.push(options); return { started: true }; }
        };
        const target = {
            fetch: () => { throw new Error('原生环境不应使用 WebView 请求'); },
            Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true,
                Plugins: { App: { getInfo: async () => ({ version: '2.0.0' }) }, TokyoRailUpdate: plugin } }
        };
        const dialogs = { confirm: (message) => { messages.push(message); return true; },
            showDownloadProgress: () => ({ update: (value) => progress.push(value), close: () => {} }) };
        const api = createAppUpdateApi({ target, dialogs });
        const result = await api.checkForUpdatesNow({ automatic });
        assert.equal(result.ok, true);
        assert.equal(result.update.source, `${source.id}-release`);
        assert.deepEqual(queried, [source.apiUrl]);
        assert.equal(installed[0].url, release.assets[1].browser_download_url);
        assert.equal(installed[0].expectedSize, 0);
        assert.ok(messages[0].includes(`从 ${source.label} 下载`));
        assert.ok(progress.some((value) => value.downloadedBytes === 20));
        assert.equal(listenerRemoved, true);

        installed.length = 0;
        plugin.getLatestRelease = async ({ url }) => { assert.equal(url, source.apiUrl); throw new Error('失败'); };
        dialogs.alert = (message) => messages.push(message);
        const failed = await api.checkForUpdatesNow({ automatic });
        assert.equal(failed.ok, false);
        assert.deepEqual(installed, []);
        if (!automatic) assert.ok(messages.at(-1).includes(`从 ${source.label} 获取更新信息`));

        plugin.getLatestRelease = async () => makeRelease(source, '2.0.0');
        const latest = await api.checkForUpdatesNow({ automatic });
        assert.equal(latest.ok, true);
        assert.equal(latest.update.available, false);
        if (!automatic) assert.equal(messages.at(-1), '已是最新版本\n当前版本：v2.0.0');

        plugin.getLatestRelease = async () => ({ ...release, assets: [] });
        const missing = await api.checkForUpdatesNow({ automatic });
        assert.equal(missing.ok, false);
        assert.equal(missing.update.reason, `${source.id}-android-apk-missing`);

        plugin.getLatestRelease = async () => release;
        plugin.cancelApkDownload = async () => { cancelled = true; return { cancelled: true }; };
        dialogs.showDownloadProgress = ({ onCancel }) => {
            plugin.downloadAndInstallApk = async () => { await onCancel(); throw { code: 'APK_DOWNLOAD_CANCELLED' }; };
            return { update() {}, close() {} };
        };
        assert.equal((await api.checkForUpdatesNow({ automatic })).nativeAction.cancelled, true);
        assert.equal(cancelled, true);
    }

    const info = { ...resolveDesktopRelease({ release, source, currentVersion: '2.0.0', platform: 'win32', arch: 'x64' }), assets: release.assets };
    let requested = '';
    const provider = new ReleaseUpdateProvider({ releaseInfo: info, fetchImpl: async (url) => {
        requested = url;
        return { ok: true, text: async () => `version: 2.1.0\nfiles:\n  - url: ${info.assetName}\n    sha512: existing-builder-checksum\n` };
    } }, {}, { platform: 'win32' });
    const metadata = await provider.getLatestVersion();
    assert.equal(requested, release.assets.at(-1).browser_download_url);
    assert.equal(new URL(requested).search, '');
    assert.equal(provider.resolveFiles(metadata)[0].url.href, info.downloadUrl);
    assert.equal(provider.resolveFiles(metadata)[0].info.sha512, 'existing-builder-checksum');
    assert.equal(provider.isUseMultipleRangeRequest, false);
    provider.releaseInfo = { ...info, assets: [] };
    await assert.rejects(provider.getLatestVersion(), /缺少 Windows 更新元数据/);
    provider.releaseInfo = info;
    provider.fetchImpl = async () => ({ ok: true, text: async () => 'version: 2.0.0' });
    await assert.rejects(provider.getLatestVersion(), /版本不一致/);
    provider.fetchImpl = async () => ({ ok: true, text: async () => `version: 2.1.0\nfiles:\n  - url: ${info.assetName}\n` });
    await assert.rejects(provider.getLatestVersion(), /缺少安装包/);
}

const requested = [];
await assert.rejects(readLatestRelease({ source: atomgit, fetchImpl: async (url) => {
    requested.push(url); return { ok: false, status: 503 };
} }), /AtomGit/);
assert.deepEqual(requested, [atomgit.apiUrl]);
console.log('更新选源、两源 Android 自动/手动更新及桌面元数据回归通过');
