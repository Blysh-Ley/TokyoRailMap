import { compareAppVersions } from './appVersion.js';

export const resolveDesktopRelease = ({ release, source, currentVersion, platform, arch, variant = '' }) => {
    const version = String(release?.tag_name || '').replace(/^v/i, '').trim();
    if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9a-z.-]+)?$/i.test(version)) {
        throw new Error(`${source.label} 未提供有效版本信息`);
    }
    const releaseUrl = String(release.html_url || `${source.releasesUrl}/tag/${encodeURIComponent(release.tag_name)}`);
    const info = { version, releaseNotes: String(release.body || ''), source, releaseUrl };
    if (compareAppVersions(version, currentVersion) <= 0) return { ...info, available: false };

    const extension = platform === 'darwin' ? 'dmg' : 'exe';
    const os = platform === 'darwin' ? 'mac' : 'win';
    const base = `TokyoRailMap-${version}-${os}-${arch}`;
    const names = variant ? [`${base}-${variant}.${extension}`, `${base}.${extension}`] : [`${base}.${extension}`];
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = names.map((name) => assets.find((item) => item.name === name && item.browser_download_url)).find(Boolean);
    if (!asset) throw new Error(`${source.label} 已发布 ${version}，但未找到当前平台安装包`);
    return { ...info, available: true, assetName: asset.name, downloadUrl: asset.browser_download_url };
};
