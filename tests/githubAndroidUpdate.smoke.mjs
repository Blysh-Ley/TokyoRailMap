import assert from 'node:assert/strict';

import { resolveGitHubAndroidRelease } from '../src/domain/githubAndroidRelease.js';
import { createAppUpdateApi } from '../src/services/appUpdateService.js';

const release = {
    tag_name: 'v1.3.0',
    body: 'Android update notes',
    html_url: 'https://github.com/Blysh-Ley/TokyoRailMap/releases/tag/v1.3.0',
    assets: [
        {
            name: 'TokyoRailMap-1.3.0-android.aab',
            size: 200,
            browser_download_url: 'https://github.com/Blysh-Ley/TokyoRailMap/releases/download/v1.3.0/TokyoRailMap-1.3.0-android.aab'
        },
        {
            name: 'TokyoRailMap-1.3.0-android.apk',
            size: 100,
            digest: `sha256:${'a'.repeat(64)}`,
            browser_download_url: 'https://github.com/Blysh-Ley/TokyoRailMap/releases/download/v1.3.0/TokyoRailMap-1.3.0-android.apk'
        }
    ]
};

{
    const update = resolveGitHubAndroidRelease({ release, currentVersion: '1.2.5' });
    assert.equal(update.available, true);
    assert.equal(update.latestVersion, '1.3.0');
    assert.equal(update.assetName, 'TokyoRailMap-1.3.0-android.apk');
    assert.equal(update.assetSize, 100);
    assert.equal(update.assetSha256, 'a'.repeat(64));
}

{
    const update = resolveGitHubAndroidRelease({ release, currentVersion: '1.3.0' });
    assert.equal(update.available, false);
    assert.equal(update.reason, undefined);
}

{
    const installCalls = [];
    const storeCalls = [];
    const target = {
        confirm: () => true,
        fetch: async () => ({ ok: true, json: async () => release }),
        setTimeout,
        Capacitor: {
            getPlatform: () => 'android',
            isNativePlatform: () => true,
            Plugins: {
                App: {
                    getInfo: async () => ({
                        id: 'com.blysh.tokyorailmap',
                        version: '1.2.5',
                        build: '10205'
                    })
                },
                TokyoRailUpdate: {
                    checkStoreUpdate: async () => storeCalls.push('check'),
                    openStorePage: async () => storeCalls.push('open'),
                    downloadAndInstallApk: async (options) => {
                        installCalls.push(options);
                        return { started: true, downloaded: true };
                    }
                }
            }
        }
    };

    const api = createAppUpdateApi({ target });
    const result = await api.checkForUpdatesNow();
    assert.equal(result.ok, true);
    assert.equal(result.opened, true);
    assert.deepEqual(storeCalls, []);
    assert.deepEqual(installCalls, [{
        url: release.assets[1].browser_download_url,
        fileName: release.assets[1].name,
        expectedSize: 100,
        expectedSha256: 'a'.repeat(64)
    }]);
}

{
    const alerts = [];
    const target = {
        alert: (message) => alerts.push(message),
        fetch: async () => ({ ok: true, json: async () => release }),
        setTimeout,
        Capacitor: {
            getPlatform: () => 'android',
            isNativePlatform: () => true,
            Plugins: {
                App: {
                    getInfo: async () => ({
                        id: 'com.blysh.tokyorailmap',
                        version: '1.3.0',
                        build: '10300'
                    })
                },
                TokyoRailUpdate: {}
            }
        }
    };

    const api = createAppUpdateApi({ target });
    const result = await api.checkForUpdatesNow();
    assert.equal(result.ok, true);
    assert.deepEqual(alerts, ['已是最新版本\n当前版本：v1.3.0']);
}

console.log('github android update smoke ok');
