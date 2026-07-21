#!/usr/bin/env node

const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const parseBoolArg = (value, fallback = false) => {
    const raw = String(value ?? '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
};

const isPoint = (point) => (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(Number(point[0])) &&
    Number.isFinite(Number(point[1]))
);

const normalizePoints = (points) => (
    Array.isArray(points)
        ? points.map((point) => (isPoint(point) ? [Number(point[0]), Number(point[1])] : null)).filter(Boolean)
        : []
);

const run = async () => {
    const root = process.cwd();
    const inputPath = path.resolve(root, process.argv[2] || './data/coordinates.json');
    const outputPath = path.resolve(root, process.argv[3] || './data/coordinates.topology.json');
    const angleStep = Number.parseFloat(process.argv[4] || '45') || 45;
    const forceOverwrite = parseBoolArg(process.argv[5], false);

    const data = JSON.parse(await readFile(inputPath, 'utf8'));
    const railwayList = Array.isArray(data?.railways) ? data.railways : [];

    const { transformCoordinatesWithTopologyAdapter } = await import(
        pathToFileURL(path.join(root, 'src/services/topology/octiAdapter.js')).href
    );

    const convertedRailways = [];
    for (const line of railwayList) {
        const sublines = Array.isArray(line?.sublines) ? line.sublines : [];
        const nextSublines = sublines.map((subline = {}) => {
            const input = normalizePoints(subline?.coords);
            const output = input.length >= 2 ? (
                await transformCoordinatesWithTopologyAdapter(input, { angleStepDegrees: angleStep })
            ) : [];
            return {
                ...subline,
                coords: output
            };
        });
        convertedRailways.push({
            ...line,
            sublines: nextSublines
        });
    }

    const result = {
        ...data,
        railways: convertedRailways
    };

    if (!forceOverwrite) {
        const existing = await Promise.resolve().then(async () => {
            try {
                await readFile(outputPath);
                return true;
            } catch {
                return false;
            }
        });
        if (existing) {
            console.warn(`输出文件已存在：${outputPath}`);
            console.warn('如需覆盖，请添加第 5 个参数为 true。');
            process.exitCode = 1;
            return;
        }
    }

    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`拓扑化坐标已写入: ${outputPath}`);
};

run().catch((error) => {
    console.error('convert-coordinates 失败：', error);
    process.exitCode = 1;
});
