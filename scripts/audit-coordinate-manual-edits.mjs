#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BASE_PATH = 'data/coordinates.json';
const DEFAULT_CANDIDATE_PATH = 'backups/mini-tokyo-data/coordinates.json';
const DEFAULT_MAX_BLOCKS = 12;
const DEFAULT_MAX_LINES = 200;
const DEFAULT_MAX_POINTS = 2;
const SAME_POINT_TOLERANCE_METERS = 35;

const normalizeText = (value) => String(value ?? '').trim();

const parseArgs = (argv) => {
    const options = {
        basePath: DEFAULT_BASE_PATH,
        candidatePath: DEFAULT_CANDIDATE_PATH,
        format: 'text',
        maxBlocks: DEFAULT_MAX_BLOCKS,
        maxLines: DEFAULT_MAX_LINES,
        maxPoints: DEFAULT_MAX_POINTS
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => argv[++i];
        if (arg === '--base') options.basePath = next();
        else if (arg === '--candidate' || arg === '--modified') options.candidatePath = next();
        else if (arg === '--json') options.format = 'json';
        else if (arg === '--max-blocks') options.maxBlocks = Number(next()) || DEFAULT_MAX_BLOCKS;
        else if (arg === '--max-lines') options.maxLines = Number(next()) || DEFAULT_MAX_LINES;
        else if (arg === '--max-points') options.maxPoints = Number(next()) || DEFAULT_MAX_POINTS;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    return options;
};

const usage = () => `
用法:
  node scripts/audit-coordinate-manual-edits.mjs [选项]

默认比较:
  base      ${DEFAULT_BASE_PATH}
  candidate ${DEFAULT_CANDIDATE_PATH}

选项:
  --base <path>          作为对照的 coordinates.json
  --candidate <path>     作为已修改版本的 coordinates.json
  --json                 输出机器可读 JSON
  --max-blocks <n>       每条线路最多展示的差异块数量
  --max-lines <n>        文本模式最多展示的线路数量
  --max-points <n>       每个差异块每侧最多展示的附近坐标点数量
`;

const readJson = (filePath) => {
    const abs = path.resolve(process.cwd(), filePath);
    const text = fs.readFileSync(abs, 'utf8');
    return JSON.parse(text);
};

const getRailways = (coordinates) => {
    if (Array.isArray(coordinates?.railways)) return coordinates.railways;
    if (Array.isArray(coordinates)) return coordinates;
    return [];
};

const byRailwayId = (railways) => {
    const out = new Map();
    for (const railway of railways) {
        const id = normalizeText(railway?.id);
        if (id) out.set(id, railway);
    }
    return out;
};

const coordToKey = (coord) => {
    if (!Array.isArray(coord) || coord.length < 2) return '';
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return '';
    return `${lng.toFixed(7)},${lat.toFixed(7)}`;
};

const stableJson = (value) => JSON.stringify(value ?? null);

const sublineFullSignature = (subline) => stableJson({
    type: subline?.type ?? null,
    start: subline?.start ?? null,
    end: subline?.end ?? null,
    interpolate: subline?.interpolate ?? null,
    opacity: subline?.opacity ?? null,
    zoom: subline?.zoom ?? null,
    coords: subline?.coords ?? []
});

const endpointSignature = (subline) => {
    const coords = Array.isArray(subline?.coords) ? subline.coords : [];
    return `${coordToKey(coords[0])}->${coordToKey(coords[coords.length - 1])}`;
};

const summarizeReference = (ref) => {
    if (!ref || typeof ref !== 'object') return null;
    const out = {};
    for (const key of ['railway', 'offset', 'zoom', 'altitude']) {
        if (ref[key] != null) out[key] = ref[key];
    }
    return Object.keys(out).length ? out : null;
};

const summarizeSubline = (subline, index) => {
    const coords = Array.isArray(subline?.coords) ? subline.coords : [];
    return {
        index,
        type: normalizeText(subline?.type) || 'main',
        count: coords.length,
        first: coords[0] ?? null,
        last: coords[coords.length - 1] ?? null,
        start: summarizeReference(subline?.start),
        end: summarizeReference(subline?.end),
        interpolate: subline?.interpolate ?? null,
        opacity: subline?.opacity ?? null,
        zoom: subline?.zoom ?? null
    };
};

const approxDistanceMeters = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return Infinity;
    const lng1 = Number(a[0]);
    const lat1 = Number(a[1]);
    const lng2 = Number(b[0]);
    const lat2 = Number(b[1]);
    if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return Infinity;

    const toRad = (x) => (x * Math.PI) / 180;
    const meanLat = toRad((lat1 + lat2) / 2);
    const x = toRad(lng2 - lng1) * Math.cos(meanLat);
    const y = toRad(lat2 - lat1);
    return Math.hypot(x, y) * 6371000;
};

const endpointsClose = (a, b, toleranceMeters = SAME_POINT_TOLERANCE_METERS) => {
    const aCoords = Array.isArray(a?.coords) ? a.coords : [];
    const bCoords = Array.isArray(b?.coords) ? b.coords : [];
    if (!aCoords.length || !bCoords.length) return false;
    return approxDistanceMeters(aCoords[0], bCoords[0]) <= toleranceMeters
        && approxDistanceMeters(aCoords[aCoords.length - 1], bCoords[bCoords.length - 1]) <= toleranceMeters;
};

const blockEndpointsClose = (baseBlock, candidateBlock) => {
    const baseFirst = baseBlock[0];
    const baseLast = baseBlock[baseBlock.length - 1];
    const candFirst = candidateBlock[0];
    const candLast = candidateBlock[candidateBlock.length - 1];
    if (!baseFirst || !baseLast || !candFirst || !candLast) return false;
    const baseStart = baseFirst?.coords?.[0];
    const baseEnd = baseLast?.coords?.[baseLast.coords.length - 1];
    const candStart = candFirst?.coords?.[0];
    const candEnd = candLast?.coords?.[candLast.coords.length - 1];
    return approxDistanceMeters(baseStart, candStart) <= SAME_POINT_TOLERANCE_METERS
        && approxDistanceMeters(baseEnd, candEnd) <= SAME_POINT_TOLERANCE_METERS;
};

const hasReference = (subline) => Boolean(subline?.start?.railway || subline?.end?.railway);

const referenceChanged = (baseSubline, candidateSubline) => (
    stableJson(summarizeReference(baseSubline?.start)) !== stableJson(summarizeReference(candidateSubline?.start))
    || stableJson(summarizeReference(baseSubline?.end)) !== stableJson(summarizeReference(candidateSubline?.end))
);

const fieldsChanged = (baseSubline, candidateSubline) => {
    const fields = [];
    for (const key of ['type', 'interpolate', 'opacity', 'zoom']) {
        if (stableJson(baseSubline?.[key] ?? null) !== stableJson(candidateSubline?.[key] ?? null)) fields.push(key);
    }
    if (referenceChanged(baseSubline, candidateSubline)) fields.push('reference');
    if (stableJson(baseSubline?.coords ?? []) !== stableJson(candidateSubline?.coords ?? [])) fields.push('coords');
    return fields;
};

const lineLengthMeters = (subline) => {
    const coords = Array.isArray(subline?.coords) ? subline.coords : [];
    let sum = 0;
    for (let i = 1; i < coords.length; i += 1) {
        const d = approxDistanceMeters(coords[i - 1], coords[i]);
        if (Number.isFinite(d)) sum += d;
    }
    return sum;
};

const describeBlock = (baseBlock, candidateBlock, baseStartIndex, candidateStartIndex) => {
    const labels = [];
    const baseSummaries = baseBlock.map((subline, offset) => summarizeSubline(subline, baseStartIndex + offset));
    const candidateSummaries = candidateBlock.map((subline, offset) => summarizeSubline(subline, candidateStartIndex + offset));

    if (!baseBlock.length && candidateBlock.length) labels.push('新增 subline');
    if (baseBlock.length && !candidateBlock.length) labels.push('删除 subline');

    if (baseBlock.length > 1 && candidateBlock.length === 1 && blockEndpointsClose(baseBlock, candidateBlock)) {
        labels.push('多段合并为一段');
    }
    if (baseBlock.length === 1 && candidateBlock.length > 1 && blockEndpointsClose(baseBlock, candidateBlock)) {
        labels.push('一段拆分为多段');
    }

    const baseHasRefs = baseBlock.some(hasReference);
    const candidateHasRefs = candidateBlock.some(hasReference);
    const candidateAllMain = candidateBlock.length > 0
        && candidateBlock.every((subline) => (normalizeText(subline?.type) || 'main') === 'main');

    if (baseHasRefs && candidateBlock.length > 0 && !candidateHasRefs) {
        labels.push('移除线路引用，改用显式坐标');
    } else if (
        baseHasRefs
        && candidateBlock.length > 0
        && candidateAllMain
        && candidateBlock.length <= baseBlock.length
        && baseBlock.some((subline) => (normalizeText(subline?.type) || 'main') === 'sub')
    ) {
        labels.push('sub 引用段合并进 main 几何');
    }
    if (!baseHasRefs && candidateHasRefs) labels.push('新增线路引用');

    const pairedCount = Math.min(baseBlock.length, candidateBlock.length);
    let changedReferenceCount = 0;
    let changedTypeCount = 0;
    let changedCoordCount = 0;
    let sameEndpointCoordTuningCount = 0;
    let resampledCount = 0;
    for (let i = 0; i < pairedCount; i += 1) {
        const baseSubline = baseBlock[i];
        const candidateSubline = candidateBlock[i];
        const changed = fieldsChanged(baseSubline, candidateSubline);
        if (changed.includes('reference')) changedReferenceCount += 1;
        if (changed.includes('type')) changedTypeCount += 1;
        if (changed.includes('coords')) {
            changedCoordCount += 1;
            const baseCoords = Array.isArray(baseSubline?.coords) ? baseSubline.coords : [];
            const candidateCoords = Array.isArray(candidateSubline?.coords) ? candidateSubline.coords : [];
            if (baseCoords.length === candidateCoords.length && endpointsClose(baseSubline, candidateSubline)) {
                sameEndpointCoordTuningCount += 1;
            } else if (endpointsClose(baseSubline, candidateSubline)) {
                resampledCount += 1;
            }
        }
    }

    if (changedReferenceCount) labels.push('引用目标或 offset 调整');
    if (changedTypeCount) labels.push('type 调整');
    if (sameEndpointCoordTuningCount) labels.push('坐标微调');
    if (resampledCount) labels.push('同端点重采样/简化');
    if (changedCoordCount && !sameEndpointCoordTuningCount && !resampledCount) labels.push('坐标路径改写');

    if (!labels.length) labels.push('结构差异');

    const baseLength = Math.round(baseBlock.reduce((sum, subline) => sum + lineLengthMeters(subline), 0));
    const candidateLength = Math.round(candidateBlock.reduce((sum, subline) => sum + lineLengthMeters(subline), 0));

    return {
        baseRange: baseBlock.length ? [baseStartIndex, baseStartIndex + baseBlock.length - 1] : null,
        candidateRange: candidateBlock.length ? [candidateStartIndex, candidateStartIndex + candidateBlock.length - 1] : null,
        labels,
        baseSublineCount: baseBlock.length,
        candidateSublineCount: candidateBlock.length,
        baseLengthMeters: baseLength,
        candidateLengthMeters: candidateLength,
        base: baseSummaries,
        candidate: candidateSummaries
    };
};

const diffBlocksByExactSubline = (baseSublines, candidateSublines) => {
    const baseSigs = baseSublines.map(sublineFullSignature);
    const candidateSigs = candidateSublines.map(sublineFullSignature);
    const dp = Array.from({ length: baseSigs.length + 1 }, () => Array(candidateSigs.length + 1).fill(0));

    for (let i = baseSigs.length - 1; i >= 0; i -= 1) {
        for (let j = candidateSigs.length - 1; j >= 0; j -= 1) {
            dp[i][j] = baseSigs[i] === candidateSigs[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    const matches = [];
    let i = 0;
    let j = 0;
    while (i < baseSigs.length && j < candidateSigs.length) {
        if (baseSigs[i] === candidateSigs[j]) {
            matches.push({ baseIndex: i, candidateIndex: j });
            i += 1;
            j += 1;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            i += 1;
        } else {
            j += 1;
        }
    }

    const blocks = [];
    let baseCursor = 0;
    let candidateCursor = 0;
    for (const match of matches) {
        if (match.baseIndex > baseCursor || match.candidateIndex > candidateCursor) {
            blocks.push({
                baseStartIndex: baseCursor,
                candidateStartIndex: candidateCursor,
                baseBlock: baseSublines.slice(baseCursor, match.baseIndex),
                candidateBlock: candidateSublines.slice(candidateCursor, match.candidateIndex)
            });
        }
        baseCursor = match.baseIndex + 1;
        candidateCursor = match.candidateIndex + 1;
    }
    if (baseCursor < baseSublines.length || candidateCursor < candidateSublines.length) {
        blocks.push({
            baseStartIndex: baseCursor,
            candidateStartIndex: candidateCursor,
            baseBlock: baseSublines.slice(baseCursor),
            candidateBlock: candidateSublines.slice(candidateCursor)
        });
    }

    return blocks;
};

const collectLineDiffs = (baseCoordinates, candidateCoordinates) => {
    const baseById = byRailwayId(getRailways(baseCoordinates));
    const candidateById = byRailwayId(getRailways(candidateCoordinates));
    const ids = Array.from(new Set([...baseById.keys(), ...candidateById.keys()])).sort();
    const diffs = [];

    for (const id of ids) {
        const base = baseById.get(id);
        const candidate = candidateById.get(id);

        if (!base) {
            diffs.push({
                id,
                status: 'added-railway',
                summaryLabels: ['新增 railway'],
                baseSublineCount: 0,
                candidateSublineCount: candidate?.sublines?.length ?? 0,
                blocks: []
            });
            continue;
        }
        if (!candidate) {
            diffs.push({
                id,
                status: 'removed-railway',
                summaryLabels: ['删除 railway'],
                baseSublineCount: base?.sublines?.length ?? 0,
                candidateSublineCount: 0,
                blocks: []
            });
            continue;
        }
        if (stableJson(base) === stableJson(candidate)) continue;

        const baseSublines = Array.isArray(base?.sublines) ? base.sublines : [];
        const candidateSublines = Array.isArray(candidate?.sublines) ? candidate.sublines : [];
        const blocks = diffBlocksByExactSubline(baseSublines, candidateSublines)
            .map((block) => describeBlock(
                block.baseBlock,
                block.candidateBlock,
                block.baseStartIndex,
                block.candidateStartIndex
            ));
        const summaryLabels = Array.from(new Set(blocks.flatMap((block) => block.labels)));
        const colorChanged = stableJson(base?.color ?? null) !== stableJson(candidate?.color ?? null);
        if (colorChanged) summaryLabels.push('color 调整');

        diffs.push({
            id,
            status: 'modified',
            summaryLabels,
            baseSublineCount: baseSublines.length,
            candidateSublineCount: candidateSublines.length,
            color: colorChanged ? { base: base?.color ?? null, candidate: candidate?.color ?? null } : null,
            blocks
        });
    }

    return diffs;
};

const formatRange = (range) => {
    if (!range) return '-';
    return range[0] === range[1] ? `${range[0]}` : `${range[0]}-${range[1]}`;
};

const formatSublineBrief = (subline) => {
    const refs = [];
    if (subline.start) refs.push(`start=${stableJson(subline.start)}`);
    if (subline.end) refs.push(`end=${stableJson(subline.end)}`);
    const extras = [];
    if (subline.interpolate != null) extras.push(`interpolate=${subline.interpolate}`);
    if (subline.opacity != null) extras.push(`opacity=${subline.opacity}`);
    return `#${subline.index} ${subline.type} pts=${subline.count} ${refs.concat(extras).join(' ')}`.trim();
};

const coordBrief = (coord) => {
    if (!Array.isArray(coord) || coord.length < 2) return '';
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return '';
    return `[${lng.toFixed(7)}, ${lat.toFixed(7)}]`;
};

const collectNearbyCoords = (sublineSummaries, maxPoints) => {
    const limit = Math.max(1, Number(maxPoints) || DEFAULT_MAX_POINTS);
    const coords = [];
    for (const subline of sublineSummaries) {
        if (subline.first) coords.push(subline.first);
        if (subline.last) coords.push(subline.last);
    }

    const unique = [];
    const seen = new Set();
    for (const coord of coords) {
        const key = coordToKey(coord);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(coord);
    }
    return unique.slice(0, limit).map(coordBrief).filter(Boolean);
};

const printTextReport = (diffs, options) => {
    console.log(`坐标手动修改审计（简表）`);
    console.log(`base:      ${options.basePath}`);
    console.log(`candidate: ${options.candidatePath}`);
    console.log(`modified railways: ${diffs.length}`);
    console.log('');

    const shown = diffs.slice(0, options.maxLines);
    for (const diff of shown) {
        console.log(`- ${diff.id}: ${diff.summaryLabels.join(' / ') || diff.status}`);

        for (const block of diff.blocks.slice(0, options.maxBlocks)) {
            const baseCoords = collectNearbyCoords(block.base, options.maxPoints);
            const candidateCoords = collectNearbyCoords(block.candidate, options.maxPoints);
            const parts = [];
            if (baseCoords.length) parts.push(`base附近 ${baseCoords.join(' ')}`);
            if (candidateCoords.length) parts.push(`candidate附近 ${candidateCoords.join(' ')}`);
            console.log(`  * ${block.labels.join(' / ')}: base[${formatRange(block.baseRange)}] -> candidate[${formatRange(block.candidateRange)}]`);
            if (parts.length) console.log(`    ${parts.join(' -> ')}`);
        }
        if (diff.blocks.length > options.maxBlocks) {
            console.log(`  * ... 还有 ${diff.blocks.length - options.maxBlocks} 个差异块未展示`);
        }
        console.log('');
    }

    if (diffs.length > shown.length) {
        console.log(`还有 ${diffs.length - shown.length} 条线路未展示；可用 --max-lines 调整，或 --json 输出完整结果。`);
    }
};

const main = () => {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log(usage().trim());
        return;
    }

    const base = readJson(options.basePath);
    const candidate = readJson(options.candidatePath);
    const diffs = collectLineDiffs(base, candidate);

    if (options.format === 'json') {
        console.log(JSON.stringify({
            basePath: options.basePath,
            candidatePath: options.candidatePath,
            modifiedRailwayCount: diffs.length,
            railways: diffs
        }, null, 2));
        return;
    }

    printTextReport(diffs, options);
};

try {
    main();
} catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
}
