import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStationPreviewAtlasBuilder } from '../src/domain/stationPreviewMaterialization.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(root, 'data/station-previews');
const outputPath = join(outputDir, 'atlas.json');
const require = createRequire(import.meta.url);

const listInputs = async (directory) => {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        if (file === outputDir || entry.name === '.DS_Store') continue;
        if (entry.isDirectory()) files.push(...await listInputs(file));
        else if (/\.(?:js|json)$/.test(entry.name)) {
            const info = await stat(file);
            files.push({ file: relative(root, file), size: info.size, modifiedAt: info.mtimeMs });
        }
    }
    return files.sort((left, right) => left.file.localeCompare(right.file));
};

const inputs = [...await listInputs(join(root, 'data')), ...await listInputs(join(root, 'src'))];
if (process.argv.includes('--if-changed')) {
    const previous = await readFile(outputPath, 'utf8').then(JSON.parse).catch(() => null);
    if (previous && JSON.stringify(previous.inputs) === JSON.stringify(inputs)) {
        console.log('站点预览预计算数据未变化。');
        process.exit(0);
    }
}

const workDir = await mkdtemp(join(tmpdir(), 'tokyorailmap-station-previews-'));
const rawPath = join(workDir, 'previews.jsonl');
try {
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [join(root, 'scripts/station-preview-generator-host.cjs'), workDir], {
        cwd: root, env: environment, stdio: ['ignore', 'inherit', 'inherit']
    });
    const code = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
    });
    if (code !== 0) throw new Error(`站点预览生成失败，退出码 ${code}，诊断目录 ${workDir}`);
    const builder = createStationPreviewAtlasBuilder();
    let recordCount = 0;
    for await (const record of createInterface({ input: createReadStream(rawPath), crlfDelay: Infinity })) {
        builder.add(JSON.parse(record));
        recordCount += 1;
    }
    const atlas = { ...builder.build(), inputs };
    const text = JSON.stringify(atlas);
    await mkdir(outputDir, { recursive: true });
    const pendingPath = join(outputDir, 'atlas.pending.json');
    await writeFile(pendingPath, text);
    await rename(pendingPath, outputPath);
    console.log(`已生成 ${recordCount} 份站点/服务日/主题预览，共 ${atlas.geometries.length} 份共享几何，${Buffer.byteLength(text)} 字节。`);
    await rm(workDir, { recursive: true, force: true });
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
