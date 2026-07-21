import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const vendorFiles = [
    {
        from: 'node_modules/maplibre-gl/dist/maplibre-gl.js',
        to: 'vendor/maplibre-gl/maplibre-gl.js'
    },
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
