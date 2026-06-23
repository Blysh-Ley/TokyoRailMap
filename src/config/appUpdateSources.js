export const APP_UPDATE_APP_ID = 'com.blysh.tokyorailmap';
export const APP_UPDATE_MANIFEST_URL = '';
export const IOS_APP_STORE_LOOKUP_URL = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(APP_UPDATE_APP_ID)}`;

export const ANDROID_STORE_PROVIDERS = Object.freeze({
    google_play: {
        id: 'google_play',
        label: 'Google Play',
        installerPackageNames: ['com.android.vending'],
        marketUri: 'market://details?id={packageName}',
        webUrl: 'https://play.google.com/store/apps/details?id={packageName}'
    },
    huawei_appgallery: {
        id: 'huawei_appgallery',
        label: '华为 AppGallery',
        installerPackageNames: ['com.huawei.appmarket'],
        marketUri: 'appmarket://details?id={packageName}',
        webUrl: 'https://appgallery.huawei.com/app/{packageName}'
    },
    xiaomi_getapps: {
        id: 'xiaomi_getapps',
        label: '小米应用商店',
        installerPackageNames: ['com.xiaomi.market'],
        marketUri: 'mimarket://details?id={packageName}',
        webUrl: 'https://app.mi.com/details?id={packageName}'
    },
    oppo_app_market: {
        id: 'oppo_app_market',
        label: 'OPPO 软件商店',
        installerPackageNames: ['com.oppo.market', 'com.heytap.market'],
        marketUri: 'oppomarket://details?packagename={packageName}',
        webUrl: 'https://store.oppomobile.com/product/{packageName}'
    },
    vivo_app_store: {
        id: 'vivo_app_store',
        label: 'vivo 应用商店',
        installerPackageNames: ['com.bbk.appstore'],
        marketUri: 'vivomarket://details?id={packageName}',
        webUrl: 'https://info.appstore.vivo.com.cn/detail/{packageName}'
    },
    samsung_galaxy_store: {
        id: 'samsung_galaxy_store',
        label: 'Samsung Galaxy Store',
        installerPackageNames: ['com.sec.android.app.samsungapps'],
        marketUri: 'samsungapps://ProductDetail/{packageName}',
        webUrl: 'https://galaxystore.samsung.com/detail/{packageName}'
    },
    generic_android: {
        id: 'generic_android',
        label: '应用商店',
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

