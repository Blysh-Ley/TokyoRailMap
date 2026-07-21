#!/usr/bin/env node
import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const basemapPath = join(rootDir, 'tiles', 'kanto.pmtiles');
const PMTILES_MAGIC_NUMBER = 0x4d50;

const readMagicNumber = async (path) => {
    const file = await open(path, 'r');
    try {
        const buffer = Buffer.alloc(2);
        const { bytesRead } = await file.read(buffer, 0, 2, 0);
        if (bytesRead < 2) return null;
        return buffer.readUInt16LE(0);
    } finally {
        await file.close();
    }
};

try {
    const stats = await stat(basemapPath);
    if (!stats.isFile() || stats.size < 2) {
        throw new Error('文件不存在或不是有效文件');
    }
    const magic = await readMagicNumber(basemapPath);
    if (magic !== PMTILES_MAGIC_NUMBER) {
        throw new Error('文件头不是 PMTiles');
    }
    console.log(`[basemap:package] bundled ${basemapPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
} catch (err) {
    console.error('[basemap:package] 缺少可打包的 tiles/kanto.pmtiles。');
    console.error('请先运行 Planetiler 生成底图，或把现有 kanto.pmtiles 放到 tiles/kanto.pmtiles。');
    console.error(`原因: ${err?.message || err}`);
    process.exitCode = 1;
}
