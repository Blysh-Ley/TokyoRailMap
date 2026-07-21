import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { createRuntimeVariantScript, STANDARD_RELEASE_VARIANT } from './release-variants.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const readArg = (name, fallback = '') => {
    const prefix = `--${name}=`;
    const inline = args.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const index = args.indexOf(`--${name}`);
    if (index >= 0) return args[index + 1] || fallback;
    return fallback;
};

const outputDir = readArg('out', process.env.TOKYO_RAIL_WEB_DIR || 'www');
const webDir = join(rootDir, outputDir);
const bundledBasemapFiles = [['tiles/kanto.pmtiles', 'tiles/kanto.pmtiles']];

const copyEntries = [
    'index.html',
    'privacy-policy.html',
    'src',
    'data',
    'vendor'
];
const assetCopyEntries = [
    ['assets/icons', 'assets/icons'],
    ['assets/company-logos', 'assets/company-logos']
];

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

for (const entry of copyEntries) {
    await cp(join(rootDir, entry), join(webDir, entry), {
        recursive: true,
        force: true,
        filter: (source) => !source.endsWith('.DS_Store')
    });
    console.log(`copied ${entry}`);
}

for (const [source, target] of assetCopyEntries) {
    await mkdir(dirname(join(webDir, target)), { recursive: true });
    await cp(join(rootDir, source), join(webDir, target), {
        recursive: true,
        force: true,
        filter: (path) => !path.endsWith('.DS_Store')
    });
    console.log(`copied ${source}`);
}

for (const [source, target] of bundledBasemapFiles) {
    await mkdir(dirname(join(webDir, target)), { recursive: true });
    await cp(join(rootDir, source), join(webDir, target), {
        force: true,
        filter: (path) => !path.endsWith('.DS_Store')
    });
    console.log(`copied ${source}`);
}

await mkdir(join(webDir, 'src', 'config'), { recursive: true });
await writeFile(
    join(webDir, 'src', 'config', 'runtimeVariant.js'),
    createRuntimeVariantScript(STANDARD_RELEASE_VARIANT),
    'utf8'
);
console.log(`wrote runtime variant ${STANDARD_RELEASE_VARIANT.id} to ${outputDir}`);
