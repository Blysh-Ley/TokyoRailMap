import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceIcon = join(rootDir, 'icons', 'icon.png');
const iconDir = join(rootDir, 'icons');
const androidResDir = join(rootDir, 'android', 'app', 'src', 'main', 'res');
const iosAppIconDir = join(rootDir, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
const androidSafeSourceIcon = join(iconDir, 'icon-android.png');
const androidAdaptiveCanvasSize = 1024;
// Android adaptive icon layers are 108dp; keep the source art inside the 66dp safe zone.
// The logo still looks clipped on some launchers, so keep an extra 20% visual padding.
const androidAdaptiveContentScale = 0.62;
const androidAdaptivePadColor = 'F6F7FA';

const desktopIcoSizes = [16, 32, 48, 64, 128, 256];
const macIconsetEntries = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024]
];

const androidDensities = [
    ['mipmap-mdpi', 48, 108],
    ['mipmap-hdpi', 72, 162],
    ['mipmap-xhdpi', 96, 216],
    ['mipmap-xxhdpi', 144, 324],
    ['mipmap-xxxhdpi', 192, 432]
];

const iosAppIconEntries = [
    { idiom: 'iphone', size: '20x20', scale: '2x', pixels: 40 },
    { idiom: 'iphone', size: '20x20', scale: '3x', pixels: 60 },
    { idiom: 'iphone', size: '29x29', scale: '2x', pixels: 58 },
    { idiom: 'iphone', size: '29x29', scale: '3x', pixels: 87 },
    { idiom: 'iphone', size: '40x40', scale: '2x', pixels: 80 },
    { idiom: 'iphone', size: '40x40', scale: '3x', pixels: 120 },
    { idiom: 'iphone', size: '60x60', scale: '2x', pixels: 120 },
    { idiom: 'iphone', size: '60x60', scale: '3x', pixels: 180 },
    { idiom: 'ipad', size: '20x20', scale: '1x', pixels: 20 },
    { idiom: 'ipad', size: '20x20', scale: '2x', pixels: 40 },
    { idiom: 'ipad', size: '29x29', scale: '1x', pixels: 29 },
    { idiom: 'ipad', size: '29x29', scale: '2x', pixels: 58 },
    { idiom: 'ipad', size: '40x40', scale: '1x', pixels: 40 },
    { idiom: 'ipad', size: '40x40', scale: '2x', pixels: 80 },
    { idiom: 'ipad', size: '76x76', scale: '1x', pixels: 76 },
    { idiom: 'ipad', size: '76x76', scale: '2x', pixels: 152 },
    { idiom: 'ipad', size: '83.5x83.5', scale: '2x', pixels: 167 },
    { idiom: 'ios-marketing', size: '1024x1024', scale: '1x', pixels: 1024 }
];

function run(command, args, options = {}) {
    execFileSync(command, args, { stdio: options.stdio ?? 'ignore' });
}

async function resizePngFrom(inputPath, outputPath, size) {
    run('sips', [
        '-s',
        'format',
        'png',
        '-z',
        String(size),
        String(size),
        inputPath,
        '--out',
        outputPath
    ]);
}

async function resizePng(outputPath, size) {
    await resizePngFrom(sourceIcon, outputPath, size);
}

async function buildAndroidSafeSource(tempDir) {
    const contentSize = Math.round(androidAdaptiveCanvasSize * androidAdaptiveContentScale);
    const resizedPath = join(tempDir, 'icon-android-content.png');

    await resizePngFrom(sourceIcon, resizedPath, contentSize);

    run('sips', [
        '--padToHeightWidth',
        String(androidAdaptiveCanvasSize),
        String(androidAdaptiveCanvasSize),
        '--padColor',
        androidAdaptivePadColor,
        resizedPath,
        '--out',
        androidSafeSourceIcon
    ]);
}

async function buildIco(tempDir) {
    const pngEntries = [];

    for (const size of desktopIcoSizes) {
        const pngPath = join(tempDir, `icon-${size}.png`);
        await resizePng(pngPath, size);
        pngEntries.push([size, await readFile(pngPath)]);
    }

    const headerSize = 6 + pngEntries.length * 16;
    const buffers = [Buffer.alloc(headerSize)];
    buffers[0].writeUInt16LE(0, 0);
    buffers[0].writeUInt16LE(1, 2);
    buffers[0].writeUInt16LE(pngEntries.length, 4);

    let offset = headerSize;
    pngEntries.forEach(([size, pngBuffer], index) => {
        const entryOffset = 6 + index * 16;
        buffers[0].writeUInt8(size === 256 ? 0 : size, entryOffset);
        buffers[0].writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
        buffers[0].writeUInt8(0, entryOffset + 2);
        buffers[0].writeUInt8(0, entryOffset + 3);
        buffers[0].writeUInt16LE(1, entryOffset + 4);
        buffers[0].writeUInt16LE(32, entryOffset + 6);
        buffers[0].writeUInt32LE(pngBuffer.length, entryOffset + 8);
        buffers[0].writeUInt32LE(offset, entryOffset + 12);
        offset += pngBuffer.length;
        buffers.push(pngBuffer);
    });

    await writeFile(join(iconDir, 'icon.ico'), Buffer.concat(buffers));
}

async function buildIcns(tempDir) {
    const iconsetDir = join(tempDir, 'icon.iconset');
    await mkdir(iconsetDir, { recursive: true });

    for (const [fileName, size] of macIconsetEntries) {
        const iconPath = join(iconsetDir, fileName);
        await resizePng(iconPath, size);
    }

    try {
        run('iconutil', ['-c', 'icns', iconsetDir, '-o', join(iconDir, 'icon.icns')], { stdio: 'inherit' });
    } catch {
        console.warn('warning: iconutil rejected the generated macOS iconset; kept existing icons/icon.icns');
    }
}

async function buildAndroidIcons(tempDir) {
    if (!existsSync(androidResDir)) {
        console.log('android resources not found, skipped launcher icon generation');
        return;
    }

    await buildAndroidSafeSource(tempDir);

    const valuesDir = join(androidResDir, 'values');
    await mkdir(valuesDir, { recursive: true });
    await writeFile(
        join(valuesDir, 'ic_launcher_background.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#${androidAdaptivePadColor}</color>\n</resources>\n`
    );

    for (const [density, legacySize, foregroundSize] of androidDensities) {
        const densityDir = join(androidResDir, density);
        await mkdir(densityDir, { recursive: true });

        await resizePngFrom(androidSafeSourceIcon, join(densityDir, 'ic_launcher.png'), legacySize);
        await resizePngFrom(androidSafeSourceIcon, join(densityDir, 'ic_launcher_round.png'), legacySize);
        await resizePngFrom(androidSafeSourceIcon, join(densityDir, 'ic_launcher_foreground.png'), foregroundSize);
    }
}

async function buildIosAppIcons() {
    if (!existsSync(iosAppIconDir)) {
        console.log('ios AppIcon asset catalog not found, skipped iOS app icon generation');
        return;
    }

    await mkdir(iosAppIconDir, { recursive: true });
    for (const fileName of await readdir(iosAppIconDir)) {
        if (fileName.endsWith('.png')) {
            await rm(join(iosAppIconDir, fileName), { force: true });
        }
    }

    const images = [];
    for (const entry of iosAppIconEntries) {
        const fileName = `AppIcon-${entry.idiom}-${entry.size.replace('.', '_')}@${entry.scale}.png`;
        await resizePng(join(iosAppIconDir, fileName), entry.pixels);
        images.push({
            filename: fileName,
            idiom: entry.idiom,
            scale: entry.scale,
            size: entry.size
        });
    }

    await writeFile(
        join(iosAppIconDir, 'Contents.json'),
        `${JSON.stringify({
            images,
            info: {
                author: 'xcode',
                version: 1
            }
        }, null, 2)}\n`
    );
}

if (!existsSync(sourceIcon)) {
    throw new Error(`Missing source icon: ${sourceIcon}`);
}

await mkdir(iconDir, { recursive: true });

const tempDir = await mkdtemp(join(tmpdir(), 'tokyorailmap-icons-'));

try {
    await buildIco(tempDir);
    await buildIcns(tempDir);
    await buildAndroidIcons(tempDir);
    await buildIosAppIcons(tempDir);
    console.log('generated icons from icons/icon.png');
} finally {
    if (process.env.KEEP_ICON_TEMP === '1') {
        console.log(`kept temporary icon files at ${tempDir}`);
    } else {
        await rm(tempDir, { recursive: true, force: true });
    }
}
