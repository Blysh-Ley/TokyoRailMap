#!/usr/bin/env node
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultDownloadUrl = 'https://download.geofabrik.de/asia/japan/kanto-latest.osm.pbf';
const defaultOsmPath = join(rootDir, 'tiles', 'kanto-latest.osm.pbf');
const defaultOutput = join(rootDir, 'tiles', 'kanto.pmtiles');

const parseArgs = (argv) => {
    const out = {};
    for (const arg of argv) {
        const match = String(arg).match(/^--([^=]+)=(.*)$/);
        if (match) out[match[1]] = match[2];
        else if (arg === '--download') out.download = true;
        else if (arg === '--only-download') out.onlyDownload = true;
    }
    return out;
};

const fileExists = async (path) => {
    try {
        const stats = await stat(path);
        return stats.isFile();
    } catch {
        return false;
    }
};

const downloadFile = async (url, outputPath) => {
    await mkdir(dirname(outputPath), { recursive: true });
    const response = await fetch(url);
    if (!response.ok || !response.body) {
        throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }

    await new Promise((resolvePromise, rejectPromise) => {
        const stream = createWriteStream(outputPath);
        response.body.pipeTo(new WritableStream({
            write(chunk) {
                stream.write(Buffer.from(chunk));
            },
            close() {
                stream.end(resolvePromise);
            },
            abort(err) {
                stream.destroy(err);
                rejectPromise(err);
            }
        })).catch((err) => {
            stream.destroy(err);
            rejectPromise(err);
        });
    });
};

const run = async () => {
    const args = parseArgs(process.argv.slice(2));
    const planetilerJar = resolve(args['planetiler-jar'] || process.env.PLANETILER_JAR || '');
    if (!planetilerJar || planetilerJar === process.cwd()) {
        throw new Error('缺少 --planetiler-jar=/path/to/planetiler.jar 或 PLANETILER_JAR');
    }
    if (!await fileExists(planetilerJar)) {
        throw new Error(`找不到 Planetiler jar: ${planetilerJar}`);
    }

    const output = resolve(args.output || defaultOutput);
    const osmPath = resolve(args['osm-path'] || defaultOsmPath);
    const downloadUrl = args['download-url'] || defaultDownloadUrl;

    if (!await fileExists(osmPath)) {
        if (!args.download) {
            throw new Error(`找不到 OSM PBF: ${osmPath}。请加 --download，或传入 --osm-path=/path/to/file.osm.pbf`);
        }
        console.log(`下载 Kanto OSM PBF: ${downloadUrl}`);
        await downloadFile(downloadUrl, osmPath);
    }

    if (args.onlyDownload) {
        console.log(`已准备 OSM PBF: ${osmPath}`);
        return;
    }

    await mkdir(dirname(output), { recursive: true });

    const javaArgs = [
        '-jar',
        planetilerJar,
        '--download',
        `--osm-path=${osmPath}`,
        `--output=${output}`,
        '--force'
    ];

    console.log(`运行 Planetiler: java ${javaArgs.join(' ')}`);
    const child = spawn('java', javaArgs, {
        cwd: rootDir,
        stdio: 'inherit'
    });

    const code = await new Promise((resolvePromise) => {
        child.on('close', resolvePromise);
    });
    if (code !== 0) throw new Error(`Planetiler 退出码: ${code}`);
    console.log(`已生成 PMTiles: ${output}`);
};

run().catch((err) => {
    console.error(err?.message || err);
    process.exitCode = 1;
});
