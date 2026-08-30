import {
    ANDROID_GITHUB_LATEST_RELEASE_API,
    ANDROID_STORE_PROVIDERS,
    APP_UPDATE_APP_ID,
    APP_UPDATE_MANIFEST_URL,
    IOS_APP_STORE_LOOKUP_URL,
    buildAndroidStoreCapability,
    formatAndroidStoreUrl,
    resolveAndroidStoreProvider
} from '../config/appUpdateSources.js';
import { compareAppVersions } from '../domain/appVersion.js';
import { resolveGitHubAndroidRelease } from '../domain/githubAndroidRelease.js';
import {
    readAutoUpdateCheckEnabled,
    writeAutoUpdateCheckEnabled
} from './appSettings.js';

const UPDATE_PLUGIN_NAME = 'TokyoRailUpdate';

const toText = (value) => String(value ?? '').trim();

const getCapacitorPlatform = (target = globalThis) => {
    const capacitor = target?.Capacitor;
    try {
        if (typeof capacitor?.getPlatform === 'function') return toText(capacitor.getPlatform()).toLowerCase();
    } catch {
        return '';
    }
    return toText(capacitor?.platform).toLowerCase();
};

const isNativeMobileTarget = (target = globalThis) => {
    const platform = getCapacitorPlatform(target);
    if (platform !== 'ios' && platform !== 'android') return false;
    try {
        if (typeof target?.Capacitor?.isNativePlatform === 'function') {
            return target.Capacitor.isNativePlatform() === true;
        }
    } catch {
        return false;
    }
    return true;
};

const getCapacitorPluginProxy = (target, name) => {
    const capacitor = target?.Capacitor;
    const existing = capacitor?.Plugins?.[name] || capacitor?.[name] || target?.[name] || null;
    if (existing) return existing;
    if (typeof capacitor?.registerPlugin !== 'function') return null;

    try {
        return capacitor.registerPlugin(name);
    } catch {
        return null;
    }
};

const getNativeAppInfo = async (target) => {
    const App = getCapacitorPluginProxy(target, 'App');
    if (typeof App?.getInfo !== 'function') {
        return {
            id: APP_UPDATE_APP_ID,
            version: '',
            build: ''
        };
    }
    const info = await App.getInfo();
    return {
        id: toText(info?.id) || APP_UPDATE_APP_ID,
        name: toText(info?.name),
        version: toText(info?.version),
        build: toText(info?.build)
    };
};

const fetchJson = async (url, target, options = {}) => {
    const value = toText(url);
    if (!value || typeof target?.fetch !== 'function') return null;
    const response = await target.fetch(value, {
        ...options,
        cache: 'no-store'
    });
    if (!response?.ok) return null;
    return response.json();
};

const readManifestUpdate = async ({ platform, target, appInfo }) => {
    const manifest = await fetchJson(APP_UPDATE_MANIFEST_URL, target);
    if (!manifest || typeof manifest !== 'object') return null;

    const platformInfo = manifest[platform] && typeof manifest[platform] === 'object'
        ? manifest[platform]
        : {};
    const latestVersion = toText(platformInfo.version || manifest.version);
    if (!latestVersion || compareAppVersions(latestVersion, appInfo.version) <= 0) {
        return null;
    }

    return {
        available: true,
        latestVersion,
        currentVersion: appInfo.version,
        releaseNotes: toText(platformInfo.releaseNotes || manifest.releaseNotes),
        storeUrl: toText(platformInfo.storeUrl || manifest.storeUrl),
        source: 'manifest'
    };
};

const readIosAppStoreUpdate = async ({ target, appInfo }) => {
    const data = await fetchJson(IOS_APP_STORE_LOOKUP_URL, target);
    const item = Array.isArray(data?.results) ? data.results[0] : null;
    if (!item) {
        return {
            available: false,
            currentVersion: appInfo.version,
            reason: 'app-store-record-not-found'
        };
    }

    const latestVersion = toText(item.version);
    const trackId = toText(item.trackId);
    const storeUrl = trackId
        ? `itms-apps://itunes.apple.com/app/id${trackId}`
        : toText(item.trackViewUrl);

    return {
        available: latestVersion && compareAppVersions(latestVersion, appInfo.version) > 0,
        latestVersion,
        currentVersion: appInfo.version,
        releaseNotes: toText(item.releaseNotes),
        storeUrl,
        source: 'app-store'
    };
};

const readGitHubAndroidUpdate = async ({ target, appInfo }) => {
    const release = await fetchJson(ANDROID_GITHUB_LATEST_RELEASE_API, target, {
        headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });
    return resolveGitHubAndroidRelease({
        release,
        currentVersion: appInfo.version
    });
};

const getAndroidStoreInfo = async ({ target, appInfo }) => {
    const plugin = getCapacitorPluginProxy(target, UPDATE_PLUGIN_NAME);
    if (typeof plugin?.getStoreInfo === 'function') {
        try {
            const info = await plugin.getStoreInfo();
            const provider = resolveAndroidStoreProvider(info?.installerPackageName);
            return {
                packageName: toText(info?.packageName) || appInfo.id || APP_UPDATE_APP_ID,
                installerPackageName: toText(info?.installerPackageName),
                provider,
                capability: buildAndroidStoreCapability(provider)
            };
        } catch {
            // Fall back to a generic market URL.
        }
    }

    return {
        packageName: appInfo.id || APP_UPDATE_APP_ID,
        installerPackageName: '',
        provider: ANDROID_STORE_PROVIDERS.generic_android,
        capability: buildAndroidStoreCapability(ANDROID_STORE_PROVIDERS.generic_android)
    };
};

const checkNativeStoreUpdate = async ({ target }) => {
    const plugin = getCapacitorPluginProxy(target, UPDATE_PLUGIN_NAME);
    if (typeof plugin?.checkStoreUpdate !== 'function') return null;

    try {
        const update = await plugin.checkStoreUpdate();
        return update && typeof update === 'object' ? update : null;
    } catch {
        return null;
    }
};

const chooseNativeStoreUpdateType = (update) => {
    if (update?.flexibleAllowed === true) return 'flexible';
    if (update?.immediateAllowed === true) return 'immediate';
    return '';
};

const startNativeStoreUpdate = async ({ target, updateType }) => {
    const plugin = getCapacitorPluginProxy(target, UPDATE_PLUGIN_NAME);
    if (typeof plugin?.startStoreUpdate !== 'function') return null;

    return plugin.startStoreUpdate({
        updateType: updateType || 'flexible'
    });
};

const completeNativeFlexibleUpdate = async ({ target }) => {
    const plugin = getCapacitorPluginProxy(target, UPDATE_PLUGIN_NAME);
    if (typeof plugin?.completeFlexibleUpdate !== 'function') return null;
    return plugin.completeFlexibleUpdate();
};

const openExternalUrl = async (url, target) => {
    const value = toText(url);
    if (!value) return false;

    try {
        const opened = target?.open?.(value, '_system', 'noopener,noreferrer');
        if (opened) return true;
    } catch {
        // Fall through to location navigation.
    }

    try {
        if (target?.location) {
            target.location.href = value;
            return true;
        }
    } catch {
        // ignore
    }
    return false;
};

const openAndroidStorePage = async ({ target, packageName, provider }) => {
    const plugin = getCapacitorPluginProxy(target, UPDATE_PLUGIN_NAME);
    const marketUri = formatAndroidStoreUrl(provider.marketUri, packageName);
    const fallbackUrl = formatAndroidStoreUrl(provider.webUrl, packageName);
    if (typeof plugin?.openStorePage === 'function') {
        try {
            const result = await plugin.openStorePage({ uri: marketUri, fallbackUrl });
            if (result?.opened !== false) return true;
        } catch {
            // Fall back to browser-level navigation.
        }
    }
    if (await openExternalUrl(marketUri, target)) return true;
    return openExternalUrl(fallbackUrl, target);
};

const promptForUpdate = async ({ target, update, platform, androidStore }) => {
    if (!update?.available) return false;
    const title = `发现新版本：${update.latestVersion}`;
    const current = update.currentVersion ? `当前版本：${update.currentVersion}` : '';
    const notes = update.releaseNotes ? `\n\n${update.releaseNotes}` : '';
    const question = platform === 'android'
        ? `是否打开${androidStore?.provider?.label || '应用商店'}查看更新？`
        : '是否打开 App Store 查看更新？';
    const message = [title, current, question].filter(Boolean).join('\n') + notes;
    const accepted = typeof target?.confirm === 'function' ? target.confirm(message) : true;
    if (!accepted) return false;

    if (platform === 'android') {
        return openAndroidStorePage({
            target,
            packageName: androidStore.packageName,
            provider: androidStore.provider
        });
    }
    return openExternalUrl(update.storeUrl, target);
};

const showManualAndroidStorePrompt = async ({ target, androidStore }) => {
    const message = `将打开${androidStore.provider.label}查看更新。`;
    const accepted = typeof target?.confirm === 'function' ? target.confirm(message) : true;
    if (!accepted) return false;
    return openAndroidStorePage({
        target,
        packageName: androidStore.packageName,
        provider: androidStore.provider
    });
};

const promptForNativeStoreUpdate = async ({ target, update, automatic }) => {
    if (!update?.available) return { opened: false, skipped: true };
    if (update.downloaded === true) {
        const accepted = automatic !== true && typeof target?.confirm === 'function'
            ? target.confirm('更新已下载完成，是否立即重启完成安装？')
            : automatic !== true;
        if (!accepted) return { opened: false, skipped: true };
        const completed = await completeNativeFlexibleUpdate({ target });
        return { opened: completed?.completed === true, completed };
    }

    const updateType = chooseNativeStoreUpdateType(update);
    if (!updateType) return { opened: false, skipped: true, reason: 'no-allowed-update-type' };

    const question = updateType === 'immediate'
        ? 'Google Play 有可用更新，需要打开全屏更新流程。是否继续？'
        : 'Google Play 有可用更新，是否开始后台下载？';
    const accepted = typeof target?.confirm === 'function' ? target.confirm(question) : true;
    if (!accepted) return { opened: false, skipped: true };

    const started = await startNativeStoreUpdate({ target, updateType });
    return {
        opened: started?.started === true,
        updateType,
        started
    };
};

const downloadAndInstallGitHubAndroidUpdate = async ({ target, update }) => {
    const plugin = getCapacitorPluginProxy(target, UPDATE_PLUGIN_NAME);
    if (typeof plugin?.downloadAndInstallApk !== 'function') {
        throw new Error('当前安装包不支持应用内安装，请安装包含 GitHub 更新器的新版本。');
    }

    return plugin.downloadAndInstallApk({
        url: update.downloadUrl,
        fileName: update.assetName,
        expectedSize: update.assetSize || 0,
        expectedSha256: update.assetSha256 || ''
    });
};

const promptForGitHubAndroidUpdate = async ({ target, update }) => {
    if (!update?.available) return { started: false, skipped: true };

    const title = `发现新版本：${update.latestVersion}`;
    const current = update.currentVersion ? `当前版本：${update.currentVersion}` : '';
    const notes = update.releaseNotes ? `\n\n${update.releaseNotes}` : '';
    const question = '是否从 GitHub 下载并安装更新？\n下载完成后将打开 Android 系统安装界面。';
    const message = [title, current, question].filter(Boolean).join('\n') + notes;
    const accepted = typeof target?.confirm === 'function' ? target.confirm(message) : true;
    if (!accepted) return { started: false, skipped: true };

    return downloadAndInstallGitHubAndroidUpdate({ target, update });
};

const showNoUpdatePrompt = ({ target, automatic, message = '已是最新版本' } = {}) => {
    if (automatic) return;
    if (typeof target?.alert === 'function') target.alert(message);
};

const formatUpToDateMessage = (version) => {
    const currentVersion = toText(version);
    return currentVersion
        ? `已是最新版本\n当前版本：v${currentVersion.replace(/^v/i, '')}`
        : '已是最新版本';
};

const checkMobileUpdate = async ({ target, automatic = false } = {}) => {
    const platform = getCapacitorPlatform(target);
    const appInfo = await getNativeAppInfo(target);

    if (platform === 'ios') {
        const manifestUpdate = await readManifestUpdate({ platform, target, appInfo });
        const update = manifestUpdate || await readIosAppStoreUpdate({ target, appInfo });
        const opened = await promptForUpdate({ target, update, platform });
        if (!update?.available) {
            showNoUpdatePrompt({
                target,
                automatic,
                message: update?.reason === 'app-store-record-not-found'
                    ? '暂未在 App Store 查询到该应用版本信息。'
                    : formatUpToDateMessage(appInfo.version)
            });
        }
        return { ok: true, platform, update, opened };
    }

    if (platform === 'android') {
        const update = await readGitHubAndroidUpdate({ target, appInfo });
        if (update.available) {
            try {
                const nativeAction = await promptForGitHubAndroidUpdate({ target, update });
                return {
                    ok: nativeAction?.started !== false || nativeAction?.skipped === true,
                    platform,
                    update,
                    opened: nativeAction?.started === true,
                    nativeAction
                };
            } catch (error) {
                if (!automatic && typeof target?.alert === 'function') {
                    target.alert(`更新下载或安装启动失败：${toText(error?.message) || '请稍后重试'}`);
                }
                return {
                    ok: false,
                    platform,
                    update,
                    opened: false,
                    reason: 'github-apk-install-failed'
                };
            }
        }

        const noUpdateMessage = update.reason === 'github-android-apk-missing'
            ? `GitHub 已发布 ${update.latestVersion}，但暂未找到 Android APK 安装包。`
            : update.reason
                ? '暂时无法从 GitHub 获取更新信息，请稍后重试。'
                : formatUpToDateMessage(appInfo.version);
        showNoUpdatePrompt({ target, automatic, message: noUpdateMessage });
        return {
            ok: !update.reason,
            platform,
            update,
            opened: false
        };
    }

    return { ok: false, platform, reason: 'unsupported-platform' };
};

export const createAppUpdateApi = ({
    target = globalThis,
    electronApi = target?.TokyoRailElectron
} = {}) => {
    if (
        electronApi &&
        typeof electronApi.setAutoUpdateCheckEnabled === 'function' &&
        typeof electronApi.checkForUpdatesNow === 'function'
    ) {
        return electronApi;
    }

    if (!isNativeMobileTarget(target)) return null;

    let autoCheckTimer = null;
    const api = {
        setAutoUpdateCheckEnabled: async (enabled) => {
            const next = writeAutoUpdateCheckEnabled(enabled !== false);
            return { enabled: next };
        },
        checkForUpdatesNow: async (options = {}) => checkMobileUpdate({
            target,
            automatic: options?.automatic === true
        }),
        scheduleAutoCheck: () => {
            if (autoCheckTimer || readAutoUpdateCheckEnabled() !== true) return;
            autoCheckTimer = target.setTimeout?.(() => {
                autoCheckTimer = null;
                api.checkForUpdatesNow({ automatic: true }).catch(() => null);
            }, 3000);
        }
    };

    return api;
};
