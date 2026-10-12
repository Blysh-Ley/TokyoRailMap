import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readReleaseBundle, extractReleaseNotes } from '../scripts/publish-releases.mjs';
import { createAtomGitReleaseClient } from '../scripts/atomgit-release.mjs';

assert.equal(extractReleaseNotes('# 日志\n## [2.0.1] - 2026-10-12\n新版本说明\n## [2.0.0]\n旧说明', '2.0.1'), '新版本说明');
assert.throws(() => extractReleaseNotes('# 日志', '2.0.1'), /缺少/);
const root = mkdtempSync(join(tmpdir(), 'tokyorail-release-test-'));
try {
    const directory = join(root, 'dist', 'release-installers', 'v2.0.1');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '2.0.1' }));
    writeFileSync(join(root, 'CHANGELOG.md'), '## [2.0.1]\n更新说明');
    const installerNames = ['win-x64.exe', 'mac-arm64.dmg', 'android.apk', 'android.aab'].map((suffix) => `TokyoRailMap-2.0.1-${suffix}`);
    for (const name of installerNames) writeFileSync(join(directory, name), '安装包样本');
    assert.throws(() => readReleaseBundle(root), /版本目录/);
    const metadata = 'version: 2.0.1\nfiles:\n  - url: TokyoRailMap-2.0.1-win-x64.exe\n    sha512: existing-builder-checksum\n    size: 15\n';
    writeFileSync(join(directory, 'latest.yml'), metadata);
    const bundle = readReleaseBundle(root);
    assert.equal(bundle.assets.length, 5);
    assert.equal(bundle.notes, '更新说明');
    writeFileSync(join(directory, 'latest.yml'), metadata.replace('version: 2.0.1', 'version: 2.0.0'));
    assert.throws(() => readReleaseBundle(root), /元数据/);
    writeFileSync(join(directory, 'latest.yml'), metadata);
    writeFileSync(join(directory, 'TokyoRailMap-2.0.0-win-x64.exe'), '旧版本');
    assert.throws(() => readReleaseBundle(root), /误收集/);
    rmSync(join(directory, 'TokyoRailMap-2.0.0-win-x64.exe'));

    const calls = [];
    const publicRelease = { tag_name: bundle.tag, name: bundle.title, body: bundle.notes, prerelease: true, assets: bundle.assets.map((asset) => ({ name: asset.name, type: 'attach', browser_download_url: `https://atomgit.com/test/${asset.name}` })) };
    const client = createAtomGitReleaseClient({ token: '测试令牌', log() {}, fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (url.includes('api.atomgit.com')) {
            assert.equal(options.headers.Authorization, 'Bearer 测试令牌');
            if (options.method === 'POST') {
                assert.equal(JSON.parse(options.body).release_status, 'pre');
                return { ok: true, json: async () => publicRelease };
            }
            if (options.method === 'PATCH') return { ok: true, json: async () => ({ ...publicRelease, prerelease: false }) };
            return { ok: true, json: async () => url.endsWith('/releases') ? [] : publicRelease };
        }
        assert.equal(options.headers.Authorization, undefined);
        const asset = bundle.assets.find((item) => url.endsWith(item.name));
        const bytes = readFileSync(asset.path);
        return new Response(bytes, { status: 206, headers: { 'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}` } });
    } });
    await client.prepareRelease(bundle);
    assert.equal(calls[1].options.method, 'POST');
    await client.verifyRelease(bundle);
    assert.equal(calls.filter((item) => !item.url.includes('api.atomgit.com')).length, 5);
    await client.publishRelease(bundle);
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), { name: bundle.title, body: bundle.notes, release_status: 'latest' });
    assert.equal(calls.at(-1).options.method, 'PATCH');
    const failed = createAtomGitReleaseClient({ token: '测试令牌', fetchImpl: async () => ({ ok: false, status: 401 }) });
    await assert.rejects(failed.prepareRelease(bundle), /HTTP 401/);
} finally { rmSync(root, { recursive: true }); }
console.log('双平台发布产物、版本元数据及 AtomGit 暂存/核对/正式发布回归通过');
