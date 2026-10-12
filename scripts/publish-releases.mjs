import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createAtomGitReleaseClient, verifyReleaseAssetDownload } from './atomgit-release.mjs';
const { load: parseYaml } = createRequire(import.meta.url)('js-yaml');
const githubRepo = 'Blysh-Ley/TokyoRailMap';

const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', ...options });
const gh = (args, options) => run('gh', [...args, '--repo', githubRepo], options);
export const extractReleaseNotes = (changelog, version) => {
    const lines = changelog.split(/\r?\n/);
    const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
    if (start < 0) throw new Error(`更新日志缺少 ${version}`);
    const end = lines.findIndex((line, index) => index > start && line.startsWith('## ['));
    return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
};

export const readReleaseBundle = (root = process.cwd()) => {
    const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const tag = `v${version}`, title = `TokyoRailMap ${tag}`;
    const notes = extractReleaseNotes(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version);
    const directory = join(root, 'dist', 'release-installers', tag);
    const names = [
        `TokyoRailMap-${version}-win-x64.exe`, `TokyoRailMap-${version}-mac-arm64.dmg`,
        `TokyoRailMap-${version}-android.apk`, `TokyoRailMap-${version}-android.aab`, 'latest.yml'
    ];
    const entries = readdirSync(directory);
    if (!names.every((name) => entries.includes(name))) throw new Error('版本目录缺少本次必需安装包或 latest.yml');
    const additional = entries.filter((name) => !names.includes(name));
    const installerExtensions = new Set(['.ipa', '.msi', '.pkg', '.AppImage', '.deb', '.rpm']);
    if (additional.some((name) => !name.startsWith(`TokyoRailMap-${version}-`) || !installerExtensions.has(extname(name)))) {
        throw new Error('版本目录含误收集的旧版本或无关产物，请先核对');
    }
    names.push(...additional);
    const assets = names.map((name) => {
        const path = join(directory, name), size = statSync(path).size;
        if (size <= 0) throw new Error(`发布文件为空：${name}`);
        return { name, path, size };
    });
    const metadata = parseYaml(readFileSync(join(directory, 'latest.yml'), 'utf8'));
    const windowsFile = metadata.files?.find((file) => file.url === names[0]);
    if (metadata.version !== version || !windowsFile?.sha512 || windowsFile.size !== assets[0].size) {
        throw new Error('Windows 更新元数据与本次版本或安装包不一致');
    }
    return { version, tag, title, notes, assets };
};

const verifyGithubRelease = (bundle) => {
    const release = JSON.parse(gh(['release', 'view', bundle.tag, '--json', 'name,body,assets,isDraft,isPrerelease']));
    if (release.name !== bundle.title || release.body.trim() !== bundle.notes.trim()) throw new Error('GitHub 发布标题或说明不一致');
    if (release.assets.length !== bundle.assets.length) throw new Error('GitHub 附件数量与本次产物不一致');
    for (const asset of bundle.assets) {
        const remote = release.assets.find((item) => item.name === asset.name);
        if (!remote || remote.size !== asset.size || remote.state !== 'uploaded') throw new Error(`GitHub 附件不完整：${asset.name}`);
    }
    return release;
};

export const publishReleases = async () => {
    const bundle = readReleaseBundle();
    const token = process.env.ATOMGIT_TOKEN || readFileSync(process.env.ATOMGIT_TOKEN_FILE || join(tmpdir(), 'tokyorailmap-atomgit-token'), 'utf8').trim();
    if (!token) throw new Error('缺少 AtomGit 发布令牌');
    const atomgit = createAtomGitReleaseClient({ token });
    const branch = process.env.RELEASE_BRANCH || run('git', ['branch', '--show-current']).trim();
    const remote = process.env.RELEASE_REMOTE || 'origin';
    const head = run('git', ['rev-parse', 'HEAD']).trim();
    if (run('git', ['rev-parse', `${bundle.tag}^{commit}`]).trim() !== head) throw new Error('版本标签与当前提交不一致');
    const notesFile = join(tmpdir(), `tokyorailmap-release-notes-${bundle.version}.md`);
    writeFileSync(notesFile, `${bundle.notes}\n`);
    run('git', ['push', remote, branch], { stdio: 'inherit' });
    run('git', ['push', remote, bundle.tag], { stdio: 'inherit' });

    const existing = spawnSync('gh', ['release', 'view', bundle.tag, '--repo', githubRepo], { stdio: 'ignore' });
    if (existing.status !== 0) {
        gh(['release', 'create', bundle.tag, '--draft', '--title', bundle.title, '--notes-file', notesFile], { stdio: 'inherit' });
    } else {
        const release = JSON.parse(gh(['release', 'view', bundle.tag, '--json', 'name,body']));
        if (release.name !== bundle.title || release.body.trim() !== bundle.notes.trim()) throw new Error('既有 GitHub Release 标题或说明不同');
    }
    await atomgit.prepareRelease(bundle);
    const uploaded = JSON.parse(gh(['release', 'view', bundle.tag, '--json', 'assets'])).assets;
    const missing = bundle.assets.filter((asset) => !uploaded.some((item) => item.name === asset.name));
    if (missing.length) {
        console.log('GitHub 上传本次安装包和更新元数据');
        gh(['release', 'upload', bundle.tag, ...missing.map((asset) => asset.path)], { stdio: 'inherit' });
    }
    await atomgit.uploadAssets(bundle);
    verifyGithubRelease(bundle);
    await atomgit.verifyRelease(bundle);
    console.log('两个平台核对通过，设为正式最新版本');
    await atomgit.publishRelease(bundle.tag);
    gh(['release', 'edit', bundle.tag, '--draft=false', '--prerelease=false', '--latest'], { stdio: 'inherit' });
    const github = verifyGithubRelease(bundle);
    const mirror = await atomgit.getRelease(bundle.tag);
    if (github.isDraft || github.isPrerelease || mirror.prerelease) throw new Error('两个平台尚未全部完成正式发布');
    for (const asset of bundle.assets) {
        const remoteAsset = github.assets.find((item) => item.name === asset.name);
        await verifyReleaseAssetDownload(asset, remoteAsset.url);
        console.log(`GitHub ${asset.name} 匿名下载及大小核对通过`);
    }
    const latestMirror = await fetch('https://api.atomgit.com/api/v5/repos/blysh1210/TokyoRailMap/releases/latest').then((response) => response.json());
    const latestGithub = JSON.parse(gh(['release', 'view', '--json', 'tagName']));
    if (latestMirror.tag_name !== bundle.tag || latestGithub.tagName !== bundle.tag) throw new Error('两个平台最新版本尚未同步');
    console.log(`同步发布完成：${bundle.title}`);
    console.log(`GitHub：https://github.com/${githubRepo}/releases/tag/${bundle.tag}`);
    console.log(`AtomGit：https://atomgit.com/blysh1210/TokyoRailMap/releases/tag/${bundle.tag}`);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await publishReleases();
}
