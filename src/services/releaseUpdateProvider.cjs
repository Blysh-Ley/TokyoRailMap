const { Provider, parseUpdateInfo } = require('electron-updater/out/providers/Provider');

// 通过所选 Release 的原始附件地址请求元数据，保留 electron-updater 的完整校验与安装流程。
class ReleaseUpdateProvider extends Provider {
    constructor(options, updater, runtimeOptions) {
        super({ ...runtimeOptions, isUseMultipleRangeRequest: false });
        this.releaseInfo = options.releaseInfo;
        this.fetchImpl = options.fetchImpl;
    }

    async getLatestVersion() {
        const info = this.releaseInfo;
        const metadata = info.assets.find((asset) => asset.name === 'latest.yml' && asset.browser_download_url);
        if (!metadata) throw new Error(`${info.source.label} 缺少 Windows 更新元数据 latest.yml`);
        const response = await this.fetchImpl(metadata.browser_download_url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`${info.source.label} 更新元数据下载失败（HTTP ${response.status}）`);
        const update = parseUpdateInfo(await response.text(), metadata.name, metadata.browser_download_url);
        if (update.version !== info.version) throw new Error('更新元数据与 Release 版本不一致');
        const file = update.files?.find((item) => decodeURIComponent(String(item.url).split('/').pop()) === info.assetName);
        if (!file?.sha512) throw new Error('更新元数据缺少安装包的 SHA-512 校验信息');
        return { ...update, files: [file], releaseNotes: info.releaseNotes };
    }

    resolveFiles(updateInfo) {
        return updateInfo.files.map((info) => ({ url: new URL(this.releaseInfo.downloadUrl), info }));
    }
}

module.exports = { ReleaseUpdateProvider };
