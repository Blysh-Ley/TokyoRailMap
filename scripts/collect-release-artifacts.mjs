import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;
const outputDir = join(rootDir, 'dist', 'release-installers', `v${version}`);
const copied = [];

mkdirSync(outputDir, { recursive: true });

const artifactExtensions = new Set(['.dmg', '.exe', '.msi', '.pkg', '.AppImage', '.deb', '.rpm', '.apk', '.aab', '.ipa']);
const ignoredFragments = [
    join('dist', 'release-installers'),
    join('dist', 'mac'),
    join('dist', 'mac-arm64'),
    join('dist', 'win-unpacked'),
    join('dist', 'linux-unpacked')
];

function hasArtifactExtension(filePath) {
    return Array.from(artifactExtensions).some((extension) => filePath.endsWith(extension));
}

function shouldIgnore(filePath) {
    const relativePath = relative(rootDir, filePath);
    return ignoredFragments.some((fragment) => relativePath.startsWith(fragment));
}

function walk(dir) {
    if (!existsSync(dir)) {
        return [];
    }

    return readdirSync(dir).flatMap((entry) => {
        const fullPath = join(dir, entry);
        if (shouldIgnore(fullPath)) {
            return [];
        }

        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
            return walk(fullPath);
        }
        return stats.isFile() && hasArtifactExtension(fullPath) ? [fullPath] : [];
    });
}

function getCollectedName(filePath) {
    const relativePath = relative(rootDir, filePath);
    const extension = extname(filePath);

    if (relativePath.startsWith(join('android', 'app', 'build', 'outputs', 'apk', 'release'))) {
        return `TokyoRailMap-${version}-android${extension}`;
    }

    if (relativePath.startsWith(join('android', 'app', 'build', 'outputs', 'bundle', 'release'))) {
        return `TokyoRailMap-${version}-android${extension}`;
    }

    if (
        extension === '.ipa'
        && (
            relativePath.startsWith(join('dist', 'ios-release', 'export'))
            || relativePath.startsWith(join('ios', 'App', 'build'))
        )
    ) {
        return `TokyoRailMap-${version}-ios${extension}`;
    }

    return basename(filePath);
}

function cleanNativeCollectedArtifacts() {
    for (const entry of readdirSync(outputDir)) {
        if (
            /^app-release(-unsigned)?\.(apk|aab)$/.test(entry)
            || /^App\.ipa$/.test(entry)
            || new RegExp(`^TokyoRailMap-${version}-(android|ios)\\.(apk|aab|ipa)$`).test(entry)
        ) {
            unlinkSync(join(outputDir, entry));
        }
    }
}

const candidates = Array.from(new Set([
    ...walk(join(rootDir, 'dist')),
    ...walk(join(rootDir, 'android/app/build/outputs/apk/release')),
    ...walk(join(rootDir, 'android/app/build/outputs/bundle/release')),
    ...walk(join(rootDir, 'ios/App/build')),
    ...walk(join(rootDir, 'dist/ios-release/export'))
]));

cleanNativeCollectedArtifacts();

for (const candidate of candidates) {
    const targetPath = join(outputDir, getCollectedName(candidate));
    if (candidate === targetPath) {
        continue;
    }
    copyFileSync(candidate, targetPath);
    copied.push(relative(rootDir, targetPath));
}

if (!copied.length) {
    console.warn(`[release:collect] No installer artifacts found for v${version}.`);
} else {
    console.log(`[release:collect] Copied ${copied.length} installer artifact(s) into ${relative(rootDir, outputDir)}:`);
    for (const item of copied) {
        console.log(`- ${item}`);
    }
}
