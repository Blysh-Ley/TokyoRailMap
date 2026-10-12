import { createReadStream, openSync, readSync, closeSync } from 'node:fs';
import { Transform } from 'node:stream';
import { releaseRequest } from './release-request.mjs';
import { RELEASE_UPDATE_SOURCES } from '../src/config/releaseUpdateSources.mjs';

const baseUrl = RELEASE_UPDATE_SOURCES.atomgit.apiUrl.replace(/\/latest$/, '');

export const verifyReleaseAssetDownload = async (asset, url, fetchImpl = releaseRequest) => {
    const response = await fetchImpl(url, {
        headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) throw new Error(`${asset.name} 匿名下载失败：HTTP ${response.status}`);
    const range = response.headers.get('content-range');
    const size = range ? Number(range.split('/').pop()) : Number(response.headers.get('content-length'));
    if (size !== asset.size) { await response.body.cancel(); throw new Error(`${asset.name} 文件大小不一致`); }
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    try {
        while (received < Math.min(1024, asset.size)) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(Buffer.from(value)); received += value.length;
        }
    } finally { await reader.cancel(); }
    const prefixLength = Math.min(1024, asset.size);
    const prefix = Buffer.concat(chunks).subarray(0, prefixLength);
    const local = Buffer.alloc(prefixLength);
    const file = openSync(asset.path, 'r');
    try { readSync(file, local, 0, prefixLength, 0); } finally { closeSync(file); }
    if (!prefix.equals(local)) throw new Error(`${asset.name} 文件片段不一致`);
};

export const createAtomGitReleaseClient = ({ token, fetchImpl = releaseRequest, log = console.log }) => {
    const requestJson = async (suffix = '', { method = 'GET', body } = {}) => {
        const response = await fetchImpl(`${baseUrl}${suffix}`, {
            method,
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(60_000)
        });
        if (!response.ok) throw new Error(`AtomGit ${method} 请求失败：HTTP ${response.status}`);
        return response.json();
    };

    const getRelease = (tag) => requestJson(`/tags/${encodeURIComponent(tag)}`);
    const prepareRelease = async ({ tag, title, notes }) => {
        const releases = await requestJson();
        const existing = releases.find((release) => release.tag_name === tag);
        if (existing) {
            if (existing.name !== title || String(existing.body || '').trim() !== notes.trim()) {
                throw new Error(`AtomGit ${tag} 已存在，但标题或更新说明不同`);
            }
            if (existing.release_status !== 'pre' && existing.release_status !== 'latest') {
                return requestJson(`/${encodeURIComponent(tag)}`, { method: 'PATCH', body: { name: title, body: notes, release_status: 'pre' } });
            }
            return existing;
        }
        return requestJson('', { method: 'POST', body: {
            tag_name: tag, target_commitish: 'main', name: title, body: notes, release_status: 'pre'
        } });
    };

    const uploadAssets = async ({ tag, assets }) => {
        const release = await getRelease(tag);
        const uploaded = release.assets || [];
        for (const asset of assets) {
            if (uploaded.some((item) => item.name === asset.name && item.type === 'attach')) continue;
            log(`AtomGit 上传 ${asset.name}`);
            const upload = await requestJson(`/${encodeURIComponent(tag)}/upload_url?file_name=${encodeURIComponent(asset.name)}`);
            let sent = 0, nextReport = 16 * 1024 * 1024;
            const progress = new Transform({ transform(chunk, _encoding, callback) {
                sent += chunk.length;
                if (sent >= nextReport) {
                    log(`AtomGit ${asset.name}：${Math.floor(sent / asset.size * 100)}%`);
                    nextReport = sent + 16 * 1024 * 1024;
                }
                callback(null, chunk);
            } });
            const file = createReadStream(asset.path);
            const body = file.pipe(progress);
            try {
                const response = await fetchImpl(upload.url, {
                    method: 'PUT', headers: { ...upload.headers, 'Content-Length': String(asset.size) },
                    body, duplex: 'half'
                });
                if (!response.ok) throw new Error(`AtomGit ${asset.name} 上传失败：HTTP ${response.status}`);
                await response.arrayBuffer();
            } finally { file.destroy(); body.destroy(); }
            log(`AtomGit ${asset.name} 上传完成`);
        }
    };

    const verifyRelease = async ({ tag, title, notes, assets }) => {
        const release = await getRelease(tag);
        if (release.name !== title || String(release.body || '').trim() !== notes.trim()) throw new Error('AtomGit 发布标题或说明不一致');
        const remoteAssets = (release.assets || []).filter((asset) => asset.type === 'attach');
        if (remoteAssets.length !== assets.length) throw new Error('AtomGit 附件数量与本次产物不一致');
        for (const asset of assets) {
            const remote = remoteAssets.find((item) => item.name === asset.name);
            if (!remote) throw new Error(`AtomGit 缺少附件 ${asset.name}`);
            await verifyReleaseAssetDownload(asset, remote.browser_download_url, fetchImpl);
            log(`AtomGit ${asset.name} 匿名下载及大小核对通过`);
        }
        return release;
    };

    const publishRelease = ({ tag, title, notes }) => requestJson(`/${encodeURIComponent(tag)}`, { method: 'PATCH', body: { name: title, body: notes, release_status: 'latest' } });
    return { prepareRelease, uploadAssets, verifyRelease, publishRelease, getRelease };
};
