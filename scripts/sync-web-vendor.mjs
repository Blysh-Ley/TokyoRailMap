import { execFileSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const vendorFiles = [
    {
        from: 'node_modules/maplibre-gl/dist/maplibre-gl.css',
        to: 'vendor/maplibre-gl/maplibre-gl.css'
    },
    {
        from: 'node_modules/pmtiles/dist/pmtiles.js',
        to: 'vendor/pmtiles/pmtiles.js'
    },
    {
        from: 'node_modules/pmtiles/dist/pmtiles.js.map',
        to: 'vendor/pmtiles/pmtiles.js.map'
    },
    {
        from: 'node_modules/japanese-holidays/lib/japanese-holidays.min.js',
        to: 'vendor/japanese-holidays/japanese-holidays.min.js'
    },
    {
        from: 'node_modules/jszip/dist/jszip.min.js',
        to: 'vendor/jszip/jszip.min.js'
    }
];

for (const file of vendorFiles) {
    const fromPath = join(rootDir, file.from);
    const toPath = join(rootDir, file.to);
    await mkdir(dirname(toPath), { recursive: true });
    await copyFile(fromPath, toPath);
    console.log(`synced ${file.to}`);
}

// 每次资源同步都从原始依赖应用源码补丁，避免平台打包覆盖分段偏移能力。
execFileSync(process.execPath, [join(rootDir, 'experiments/maplibre-variable-offset/build.mjs'), '--vendor'], { cwd: rootDir, stdio: 'inherit' });
