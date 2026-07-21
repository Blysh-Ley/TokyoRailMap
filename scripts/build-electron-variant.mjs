import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createRuntimeVariantScript,
    STANDARD_RELEASE_VARIANT
} from './release-variants.mjs';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const variant = STANDARD_RELEASE_VARIANT;
const builderArgs = process.argv.slice(2);
const generatedRoot = join(rootDir, 'dist', 'variant-config', 'electron-standard');
const generatedRuntimePath = join(generatedRoot, 'src', 'config', 'runtimeVariant.js');
const generatedConfigPath = join(rootDir, 'dist', 'variant-config', `electron-builder-${variant.id}.json`);

const baseBuild = packageJson.build || {};
const baseFiles = Array.isArray(baseBuild.files) ? baseBuild.files : [];
const files = [
    ...baseFiles.filter((entry) => entry !== 'tiles/kanto.pmtiles'),
    '!src/config/runtimeVariant.js',
    'tiles/kanto.pmtiles',
    {
        from: generatedRoot,
        to: '.',
        filter: ['src/config/runtimeVariant.js']
    }
];

const buildConfig = {
    ...baseBuild,
    appId: variant.appId,
    productName: variant.displayName,
    artifactName: 'TokyoRailMap-${version}-${os}-${arch}.${ext}',
    asarUnpack: ['tiles/kanto.pmtiles'],
    extraMetadata: {
        ...(baseBuild.extraMetadata || {}),
        tokyoRailVariant: variant.id,
        tokyoRailBasemapSource: variant.basemapSource
    },
    files,
    nsis: {
        ...(baseBuild.nsis || {}),
        shortcutName: variant.displayName,
        uninstallDisplayName: `卸载${variant.displayName}`
    }
};

await mkdir(dirname(generatedRuntimePath), { recursive: true });
await writeFile(generatedRuntimePath, createRuntimeVariantScript(variant), 'utf8');
await writeFile(generatedConfigPath, JSON.stringify(buildConfig, null, 2), 'utf8');

const args = [
    'electron-builder',
    '--config',
    generatedConfigPath,
    ...(builderArgs.length ? builderArgs : ['--win', '--mac', '-p', 'never'])
];
console.log(`[electron:${variant.id}] ${args.join(' ')}`);
const result = spawnSync('npx', args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false
});

process.exit(result.status ?? 1);
