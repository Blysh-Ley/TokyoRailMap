#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUT = 'renders/loom/tokyo-loom-input.geojson';
const DEFAULT_SIMPLIFY_METERS = 250;
const DEFAULT_MAX_EDGE_SHAPE_POINTS = 10;
const EARTH_RADIUS_M = 6371000;

const args = process.argv.slice(2);

const getArg = (name, fallback = '') => {
    const prefix = `${name}=`;
    const hit = args.find((arg) => arg === name || arg.startsWith(prefix));
    if (!hit) return fallback;
    if (hit === name) return 'true';
    return hit.slice(prefix.length);
};

const hasArg = (name) => args.includes(name);

const outPath = getArg('--out', DEFAULT_OUT);
const coordinatesPath = getArg('--coordinates', getArg('--coordinates-file', 'data/coordinates.json'));
const svgOutPath = getArg('--svg-out', '');
const svgWidth = Number.parseInt(getArg('--svg-width', '2200'), 10);
const svgHeight = Number.parseInt(getArg('--svg-height', '1600'), 10);
const svgPadding = Number.parseInt(getArg('--svg-padding', '60'), 10);
const renderSvgLabels = hasArg('--svg-labels');
const includeLineIds = new Set(
    args
        .filter((arg) => arg.startsWith('--line='))
        .map((arg) => normalizeText(arg.slice('--line='.length)))
        .filter(Boolean)
);
const maxLinesRaw = getArg('--max-lines', '');
const maxLines = maxLinesRaw ? Number.parseInt(maxLinesRaw, 10) : 0;
const simplifyMeters = hasArg('--full-geometry')
    ? 0
    : Number(getArg('--simplify-meters', String(DEFAULT_SIMPLIFY_METERS)));
const maxEdgeShapePoints = hasArg('--full-geometry')
    ? 0
    : Number.parseInt(getArg('--max-edge-shape-points', String(DEFAULT_MAX_EDGE_SHAPE_POINTS)), 10);
const strict = hasArg('--strict');

function normalizeText(value) {
    return String(value ?? '').trim();
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pickTitle(titleObj) {
    const t = titleObj || {};
    return (
        normalizeText(t['zh-Hans'])
        || normalizeText(t.zh)
        || normalizeText(t['zh-CN'])
        || normalizeText(t['zh-Hant'])
        || normalizeText(t.ja)
        || normalizeText(t.en)
        || ''
    );
}

function coordsToLngLat(value) {
    if (!Array.isArray(value) || value.length < 2) return null;
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
}

function distanceMeters(a, b) {
    if (!a || !b) return Number.POSITIVE_INFINITY;
    const lng1 = Number(a[0]);
    const lat1 = Number(a[1]);
    const lng2 = Number(b[0]);
    const lat2 = Number(b[1]);
    if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) {
        return Number.POSITIVE_INFINITY;
    }
    const toRad = (n) => (n * Math.PI) / 180;
    const meanLat = toRad((lat1 + lat2) / 2);
    const x = toRad(lng2 - lng1) * Math.cos(meanLat);
    const y = toRad(lat2 - lat1);
    return Math.hypot(x, y) * EARTH_RADIUS_M;
}

function toLocalMeters(point, refLatRad) {
    const lng = Number(point?.[0]);
    const lat = Number(point?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const lngRad = (lng * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;
    return {
        x: EARTH_RADIUS_M * lngRad * Math.cos(refLatRad),
        y: EARTH_RADIUS_M * latRad
    };
}

function pointSegmentDistanceMeters(point, a, b, refLatRad) {
    const p = toLocalMeters(point, refLatRad);
    const p1 = toLocalMeters(a, refLatRad);
    const p2 = toLocalMeters(b, refLatRad);
    if (!p || !p1 || !p2) return Number.POSITIVE_INFINITY;
    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    const wx = p.x - p1.x;
    const wy = p.y - p1.y;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
    const x = p1.x + vx * t;
    const y = p1.y + vy * t;
    return Math.hypot(p.x - x, p.y - y);
}

function simplifyRdp(coords, toleranceMeters) {
    if (!Array.isArray(coords) || coords.length <= 2 || !(toleranceMeters > 0)) return coords;
    const refLat = coords.reduce((sum, point) => sum + Number(point?.[1] || 0), 0) / coords.length;
    const refLatRad = (refLat * Math.PI) / 180;
    const keep = new Array(coords.length).fill(false);
    keep[0] = true;
    keep[coords.length - 1] = true;
    const stack = [[0, coords.length - 1]];
    while (stack.length) {
        const [start, end] = stack.pop();
        let bestIndex = -1;
        let bestDistance = -1;
        for (let i = start + 1; i < end; i++) {
            const d = pointSegmentDistanceMeters(coords[i], coords[start], coords[end], refLatRad);
            if (d > bestDistance) {
                bestDistance = d;
                bestIndex = i;
            }
        }
        if (bestIndex > -1 && bestDistance > toleranceMeters) {
            keep[bestIndex] = true;
            stack.push([start, bestIndex], [bestIndex, end]);
        }
    }
    return coords.filter((_, index) => keep[index]);
}

function limitShapePoints(coords, maxPoints) {
    if (!Array.isArray(coords) || coords.length <= 2 || !(maxPoints > 1) || coords.length <= maxPoints) {
        return coords;
    }
    const out = [];
    for (let i = 0; i < maxPoints; i++) {
        const index = Math.round((i * (coords.length - 1)) / (maxPoints - 1));
        const point = coords[index];
        const prev = out[out.length - 1];
        if (!prev || distanceMeters(prev, point) > 1) out.push(point);
    }
    if (out.length < 2) return [coords[0], coords[coords.length - 1]];
    out[0] = coords[0];
    out[out.length - 1] = coords[coords.length - 1];
    return out;
}

function simplifyEdgeGeometry(coords) {
    let out = simplifyRdp(coords, simplifyMeters);
    out = limitShapePoints(out, maxEdgeShapePoints);
    return out;
}

function nearestIndex(coords, target, startIndex = 0, endIndex = coords.length - 1) {
    if (!Array.isArray(coords) || !coords.length || !target) return null;
    const start = Math.max(0, Math.min(coords.length - 1, startIndex));
    const end = Math.max(0, Math.min(coords.length - 1, endIndex));
    const step = start <= end ? 1 : -1;
    let best = null;
    for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
        const d = distanceMeters(coords[i], target);
        if (!Number.isFinite(d)) continue;
        if (!best || d < best.distance) best = { index: i, distance: d };
    }
    return best;
}

function appendCoords(out, coords) {
    for (const point of coords) {
        const lngLat = coordsToLngLat(point);
        if (!lngLat) continue;
        const prev = out[out.length - 1];
        if (prev && distanceMeters(prev, lngLat) < 1) continue;
        out.push(lngLat);
    }
}

function flattenRailwayCoords(coordDef) {
    const out = [];
    const sublines = Array.isArray(coordDef?.sublines) ? coordDef.sublines : [];
    for (const subline of sublines) {
        if (subline?.opacity === 0) continue;
        const coords = Array.isArray(subline?.coords) ? subline.coords : [];
        appendCoords(out, coords);
    }
    return out;
}

function orientCoordsForStations(coords, stationIds, stationById) {
    const firstStation = stationById.get(stationIds[0]);
    const lastStation = stationById.get(stationIds[stationIds.length - 1]);
    const firstCoord = coordsToLngLat(firstStation?.coord);
    const lastCoord = coordsToLngLat(lastStation?.coord);
    if (!firstCoord || !lastCoord || stationIds[0] === stationIds[stationIds.length - 1]) {
        return coords;
    }

    const firstIdx = nearestIndex(coords, firstCoord);
    const lastIdx = nearestIndex(coords, lastCoord);
    if (firstIdx && lastIdx && lastIdx.index < firstIdx.index) {
        return coords.slice().reverse();
    }
    return coords;
}

function buildStationPositions(stationIds, coords, stationById) {
    const positions = [];
    let prevIndex = 0;
    const firstStationId = stationIds[0];
    for (let i = 0; i < stationIds.length; i++) {
        const stationId = stationIds[i];
        const station = stationById.get(stationId);
        const stationCoord = coordsToLngLat(station?.coord);
        if (!stationCoord) {
            positions.push(null);
            continue;
        }

        let match = null;
        if (i > 0 && i === stationIds.length - 1 && stationId === firstStationId) {
            match = nearestIndex(coords, stationCoord, coords.length - 1, 0);
        } else {
            match = nearestIndex(coords, stationCoord, prevIndex, coords.length - 1);
            const globalMatch = nearestIndex(coords, stationCoord);
            if (!match || (globalMatch && globalMatch.distance + 500 < match.distance)) {
                match = globalMatch;
            }
        }

        if (!match) {
            positions.push({ stationId, coord: stationCoord, index: prevIndex, distance: Infinity });
            continue;
        }

        prevIndex = Math.max(prevIndex, match.index);
        positions.push({
            stationId,
            coord: stationCoord,
            index: match.index,
            distance: match.distance
        });
    }
    return positions;
}

function edgeCoordinates(coords, fromPos, toPos) {
    if (!fromPos || !toPos) return null;
    const fromIndex = fromPos.index;
    const toIndex = toPos.index;
    let segment = [];
    if (Number.isInteger(fromIndex) && Number.isInteger(toIndex) && fromIndex !== toIndex) {
        const lo = Math.min(fromIndex, toIndex);
        const hi = Math.max(fromIndex, toIndex);
        segment = coords.slice(lo, hi + 1);
        if (fromIndex > toIndex) segment.reverse();
    }
    if (segment.length < 2) {
        segment = [fromPos.coord, toPos.coord];
    }
    segment = segment.map((pt) => pt.slice());
    segment[0] = fromPos.coord.slice();
    segment[segment.length - 1] = toPos.coord.slice();
    return segment;
}

function makeFeatureId(prefix, value) {
    return `${prefix}:${normalizeText(value).replace(/[^A-Za-z0-9_.:-]+/g, '_')}`;
}

function sanitizeAttr(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function buildTopologyBounds(featureCollection) {
    let minLng = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;

    for (const feature of featureCollection.features) {
        const geometry = feature?.geometry;
        if (!geometry || !Array.isArray(geometry.coordinates)) continue;
        const coords = geometry.type === 'Point'
            ? [geometry.coordinates]
            : geometry.type === 'LineString'
                ? geometry.coordinates
                : [];
        for (const point of coords) {
            const lng = Number(point?.[0]);
            const lat = Number(point?.[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
        }
    }

    if (!Number.isFinite(minLng) || !Number.isFinite(maxLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) {
        return null;
    }

    return { minLng, maxLng, minLat, maxLat };
}

function toSvgPoint(lng, lat, bounds, width, height, padding) {
    const xSpan = bounds.maxLng - bounds.minLng || 1;
    const ySpan = bounds.maxLat - bounds.minLat || 1;
    const x = padding + ((lng - bounds.minLng) / xSpan) * (width - padding * 2);
    const y = padding + ((bounds.maxLat - lat) / ySpan) * (height - padding * 2);
    return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

function buildTopologySvg(featureCollection) {
    const bounds = buildTopologyBounds(featureCollection);
    if (!bounds) {
        return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="2200" height="1600"><text x="20" y="40" fill="red">No valid geometry</text></svg>\n';
    }

    const svgCanvasWidth = Number.isFinite(svgWidth) && svgWidth > 0 ? svgWidth : 2200;
    const svgCanvasHeight = Number.isFinite(svgHeight) && svgHeight > 0 ? svgHeight : 1600;
    const padding = Number.isFinite(svgPadding) && svgPadding >= 0 ? svgPadding : 60;

    const lineParts = [];
    const stationParts = [];
    const labelParts = [];
    const usedStations = new Set();

    for (const feature of featureCollection.features) {
        const geometry = feature?.geometry;
        if (!geometry || !Array.isArray(geometry.coordinates)) continue;
        if (geometry.type === 'LineString') {
            const points = geometry.coordinates
                .map((pt) => {
                    const lng = Number(pt?.[0]);
                    const lat = Number(pt?.[1]);
                    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
                    return toSvgPoint(lng, lat, bounds, svgCanvasWidth, svgCanvasHeight, padding);
                })
                .filter(Boolean);
            if (points.length < 2) continue;
            const d = points.map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
            const colorRaw = feature?.properties?.lines?.[0]?.color;
            const stroke = colorRaw && /^#?[0-9a-fA-F]{3,8}$/.test(colorRaw)
                ? (colorRaw.startsWith('#') ? colorRaw : `#${colorRaw}`)
                : '#777777';
            const strokeWidth = 1.8;
            lineParts.push(
                `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`
            );
        } else if (geometry.type === 'Point' && feature?.properties?.station_id) {
            const lng = Number(geometry.coordinates?.[0]);
            const lat = Number(geometry.coordinates?.[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
            const stationId = sanitizeAttr(feature.properties.station_id);
            if (usedStations.has(stationId)) continue;
            usedStations.add(stationId);
            const point = toSvgPoint(lng, lat, bounds, svgCanvasWidth, svgCanvasHeight, padding);
            stationParts.push(
                `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="2.4" fill="#ffffff" stroke="#333333" stroke-width="1.2" />`
            );
            if (renderSvgLabels) {
                const label = sanitizeAttr(feature?.properties?.station_label || stationId);
                labelParts.push(
                    `<text x="${(point.x + 3).toFixed(2)}" y="${(point.y - 4).toFixed(2)}" font-size="10" fill="#111111" font-family="Arial, sans-serif">${label}</text>`
                );
            }
        }
    }

    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${svgCanvasWidth}" height="${svgCanvasHeight}" viewBox="0 0 ${svgCanvasWidth} ${svgCanvasHeight}">\n  <rect width="100%" height="100%" fill="#ffffff"/>\n  <g>\n${lineParts.map((line) => `    ${line}`).join('\n')}\n${stationParts.map((station) => `    ${station}`).join('\n')}\n${labelParts.map((label) => `    ${label}`).join('\n')}\n  </g>\n</svg>\n`;
}

const railways = readJson('data/railways.json');
const stations = readJson('data/stations.json');
const coordinates = readJson(coordinatesPath);

const stationById = new Map();
for (const station of Array.isArray(stations) ? stations : []) {
    const id = normalizeText(station?.id);
    if (id) stationById.set(id, station);
}

const coordsByRailwayId = new Map();
for (const coordDef of Array.isArray(coordinates?.railways) ? coordinates.railways : []) {
    const id = normalizeText(coordDef?.id);
    if (id) coordsByRailwayId.set(id, coordDef);
}

const features = [];
const emittedStations = new Set();
const warnings = [];
let exportedLines = 0;
let exportedEdges = 0;

const railwayList = Array.isArray(railways) ? railways : [];
for (const railway of railwayList) {
    const railwayId = normalizeText(railway?.id);
    if (!railwayId) continue;
    if (includeLineIds.size && !includeLineIds.has(railwayId)) continue;
    if (maxLines > 0 && exportedLines >= maxLines) break;

    const stationIds = (Array.isArray(railway?.stations) ? railway.stations : [])
        .map(normalizeText)
        .filter(Boolean);
    if (stationIds.length < 2) continue;

    const coordDef = coordsByRailwayId.get(railwayId);
    let coords = flattenRailwayCoords(coordDef);
    if (coords.length < 2) {
        coords = stationIds
            .map((stationId) => coordsToLngLat(stationById.get(stationId)?.coord))
            .filter(Boolean);
        warnings.push(`${railwayId}: missing coordinate geometry; fell back to station straight lines`);
    }
    if (coords.length < 2) continue;

    coords = orientCoordsForStations(coords, stationIds, stationById);
    const positions = buildStationPositions(stationIds, coords, stationById);
    const lineName = pickTitle(railway?.title) || railwayId;
    const color = normalizeText(railway?.color).replace(/^#/, '') || '999999';
    const lineRef = { id: railwayId, label: lineName, color };

    for (let i = 0; i < stationIds.length; i++) {
        const stationId = stationIds[i];
        const station = stationById.get(stationId);
        const stationCoord = coordsToLngLat(station?.coord);
        if (!stationCoord || emittedStations.has(stationId)) continue;
        emittedStations.add(stationId);
        features.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: stationCoord
            },
            properties: {
                id: makeFeatureId('station', stationId),
                station_id: stationId,
                station_label: pickTitle(station?.title) || stationId
            }
        });
    }

    for (let i = 0; i < stationIds.length - 1; i++) {
        const fromStationId = stationIds[i];
        const toStationId = stationIds[i + 1];
        const fromPos = positions[i];
        const toPos = positions[i + 1];
        let lineCoords = edgeCoordinates(coords, fromPos, toPos);
        if (!lineCoords || lineCoords.length < 2) {
            warnings.push(`${railwayId}: skipped edge ${fromStationId} -> ${toStationId}`);
            continue;
        }
        lineCoords = simplifyEdgeGeometry(lineCoords);
        features.push({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: lineCoords
            },
            properties: {
                id: makeFeatureId('edge', `${railwayId}:${i}`),
                from: makeFeatureId('station', fromStationId),
                to: makeFeatureId('station', toStationId),
                lines: [lineRef],
                dbg_lines: lineName
            }
        });
        exportedEdges++;
    }
    exportedLines++;
}

if (strict && warnings.length) {
    for (const warning of warnings) console.error(`warning: ${warning}`);
    process.exit(1);
}

const collection = {
    type: 'FeatureCollection',
    properties: {
        generator: 'scripts/export-loom-geojson.mjs',
        source: 'TokyoRailMap data/*.json',
        coordinates: coordinatesPath,
        exportedLines,
        exportedStations: emittedStations.size,
        exportedEdges,
        simplifyMeters: Number.isFinite(simplifyMeters) ? simplifyMeters : 0,
        maxEdgeShapePoints: Number.isFinite(maxEdgeShapePoints) ? maxEdgeShapePoints : 0,
        warningCount: warnings.length
    },
    features
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(collection)}\n`);
if (svgOutPath) {
    const svgOut = path.resolve(process.cwd(), svgOutPath);
    fs.mkdirSync(path.dirname(svgOut), { recursive: true });
    fs.writeFileSync(svgOut, buildTopologySvg(collection));
    console.error(`wrote ${svgOut}`);
}

console.error(`wrote ${outPath}`);
console.error(`lines=${exportedLines} stations=${emittedStations.size} edges=${exportedEdges} warnings=${warnings.length}`);
for (const warning of warnings.slice(0, 20)) {
    console.error(`warning: ${warning}`);
}
if (warnings.length > 20) {
    console.error(`warning: ... ${warnings.length - 20} more`);
}
