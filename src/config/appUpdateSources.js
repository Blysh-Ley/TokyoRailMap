export const APP_UPDATE_APP_ID = 'com.blysh.tokyorailmap';
export const APP_UPDATE_MANIFEST_URL = '';
export const IOS_APP_STORE_LOOKUP_URL = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(APP_UPDATE_APP_ID)}`;

export const ANDROID_STORE_PROVIDERS = Object.freeze({
    google_play: {
        id: 'google_play',
        label: 'Google Play',
        updateMechanism: 'play_core',
        canCheckForUpdates: true,
        canOpenStorePage: true,
        reservedSdk: 'com.google.android.play:app-update',
        installerPackageNames: ['com.android.vending'],
        marketUri: 'market://details?id={packageName}',
        webUrl: 'https://play.google.com/store/apps/details?id={packageName}'
    },
    huawei_appgallery: {
        id: 'huawei_appgallery',
        label: '华为 AppGallery',
        updateMechanism: 'market_uri_or_sdk',
        canCheckForUpdates: false,
        canOpenStorePage: true,
        reservedSdk: 'AppGallery Connect SDK',
        installerPackageNames: ['com.huawei.appmarket'],
        marketUri: 'appmarket://details?id={packageName}',
        webUrl: 'https://appgallery.huawei.com/app/{packageName}'
    },
    xiaomi_getapps: {
        id: 'xiaomi_getapps',
        label: '小米应用商店',
        updateMechanism: 'market_uri_or_sdk',
        canCheckForUpdates: false,
        canOpenStorePage: true,
        reservedSdk: 'Xiaomi GetApps SDK',
        installerPackageNames: ['com.xiaomi.market'],
        marketUri: 'mimarket://details?id={packageName}',
        webUrl: 'https://app.mi.com/details?id={packageName}'
    },
    oppo_app_market: {
        id: 'oppo_app_market',
        label: 'OPPO 软件商店',
        updateMechanism: 'market_uri_or_sdk',
        canCheckForUpdates: false,
        canOpenStorePage: true,
        reservedSdk: 'OPPO App Market SDK',
        installerPackageNames: ['com.oppo.market', 'com.heytap.market'],
        marketUri: 'oppomarket://details?packagename={packageName}',
        webUrl: 'https://store.oppomobile.com/product/{packageName}'
    },
    vivo_app_store: {
        id: 'vivo_app_store',
        label: 'vivo 应用商店',
        updateMechanism: 'market_uri_or_sdk',
        canCheckForUpdates: false,
        canOpenStorePage: true,
        reservedSdk: 'vivo App Store SDK',
        installerPackageNames: ['com.bbk.appstore'],
        marketUri: 'vivomarket://details?id={packageName}',
        webUrl: 'https://info.appstore.vivo.com.cn/detail/{packageName}'
    },
    samsung_galaxy_store: {
        id: 'samsung_galaxy_store',
        label: 'Samsung Galaxy Store',
        updateMechanism: 'market_uri_or_sdk',
        canCheckForUpdates: false,
        canOpenStorePage: true,
        reservedSdk: 'Galaxy Store SDK',
        installerPackageNames: ['com.sec.android.app.samsungapps'],
        marketUri: 'samsungapps://ProductDetail/{packageName}',
        webUrl: 'https://galaxystore.samsung.com/detail/{packageName}'
    },
    generic_android: {
        id: 'generic_android',
        label: '应用商店',
        updateMechanism: 'web_fallback',
        canCheckForUpdates: false,
        canOpenStorePage: true,
        reservedSdk: '',
        installerPackageNames: [],
        marketUri: 'market://details?id={packageName}',
        webUrl: 'https://github.com/Blysh-Ley/TokyoRailMap/releases/latest'
    }
});

export const resolveAndroidStoreProvider = (installerPackageName = '') => {
    const installer = String(installerPackageName || '').trim();
    if (!installer) return ANDROID_STORE_PROVIDERS.generic_android;

    return Object.values(ANDROID_STORE_PROVIDERS)
        .find((provider) => provider.installerPackageNames.includes(installer))
        || ANDROID_STORE_PROVIDERS.generic_android;
};

export const formatAndroidStoreUrl = (template = '', packageName = APP_UPDATE_APP_ID) => (
    String(template || '').replace(/\{packageName\}/g, encodeURIComponent(packageName || APP_UPDATE_APP_ID))
);

export const buildAndroidStoreCapability = (provider = ANDROID_STORE_PROVIDERS.generic_android) => ({
    providerId: provider.id,
    label: provider.label,
    updateMechanism: provider.updateMechanism,
    canCheckForUpdates: provider.canCheckForUpdates === true,
    canOpenStorePage: provider.canOpenStorePage !== false,
    reservedSdk: provider.reservedSdk || ''
});
