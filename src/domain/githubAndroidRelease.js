import { compareAppVersions } from './appVersion.js';

const toText = (value) => String(value ?? '').trim();

const extractVersion = (release = {}) => {
    const candidates = [release.tag_name, release.name];
    for (const candidate of candidates) {
        const match = toText(candidate).match(/(?:^|\s|v)(\d+(?:\.\d+){1,3}(?:[-+][0-9a-z.-]+)?)/i);
        if (match?.[1]) return match[1];
    }
    return '';
};

const getAssetScore = (asset, latestVersion) => {
    const name = toText(asset?.name);
    const lowerName = name.toLowerCase();
    if (!lowerName.endsWith('.apk')) return -1;
    if (/debug|unsigned|unaligned/.test(lowerName)) return -1;

    const exactName = `tokyorailmap-${latestVersion}-android.apk`.toLowerCase();
    if (lowerName === exactName) return 100;
    if (/^tokyorailmap-.+-android\.apk$/.test(lowerName)) return 80;
    if (lowerName.includes('android')) return 60;
    return 10;
};

const readSha256 = (asset = {}) => {
    const digest = toText(asset.digest);
    const match = digest.match(/^sha256:([0-9a-f]{64})$/i);
    return match?.[1]?.toLowerCase() || '';
};

export const resolveGitHubAndroidRelease = ({ release, currentVersion = '' } = {}) => {
    if (!release || typeof release !== 'object') {
        return {
            available: false,
            currentVersion: toText(currentVersion),
            reason: 'github-release-unavailable',
            source: 'github-release'
        };
    }

    const latestVersion = extractVersion(release);
    if (!latestVersion) {
        return {
            available: false,
            currentVersion: toText(currentVersion),
            reason: 'github-release-version-missing',
            source: 'github-release'
        };
    }

    if (compareAppVersions(latestVersion, currentVersion) <= 0) {
        return {
            available: false,
            latestVersion,
            currentVersion: toText(currentVersion),
            source: 'github-release'
        };
    }

    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = assets
        .map((item) => ({ item, score: getAssetScore(item, latestVersion) }))
        .filter(({ item, score }) => score >= 0 && toText(item?.browser_download_url))
        .sort((left, right) => right.score - left.score)[0]?.item;

    if (!asset) {
        return {
            available: false,
            latestVersion,
            currentVersion: toText(currentVersion),
            reason: 'github-android-apk-missing',
            source: 'github-release'
        };
    }

    const assetSize = Number(asset.size);
    return {
        available: true,
        latestVersion,
        currentVersion: toText(currentVersion),
        releaseNotes: toText(release.body),
        releaseUrl: toText(release.html_url),
        downloadUrl: toText(asset.browser_download_url),
        assetName: toText(asset.name),
        assetSize: Number.isSafeInteger(assetSize) && assetSize > 0 ? assetSize : 0,
        assetSha256: readSha256(asset),
        source: 'github-release'
    };
};
