const DEGREE_TO_RADIAN = Math.PI / 180;
const RADIAN_TO_DEGREE = 180 / Math.PI;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const normalizeText = (v) => String(v ?? '').trim();

const coordsToLngLat = (pt) => {
    if (!Array.isArray(pt) || pt.length < 2) return null;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
};

const WEB_MERCATOR_ZOOM_BASE = 12;
const WEB_MERCATOR_TILE_SIZE = 512;
const WEB_MERCATOR_MAX_LAT = 85.05112878;

const OFFSET_PIXELS_CONFIG = Object.freeze({
    interpolationBase: 2,
    zoomBase: 12,
    zoomMax: 16,
    lowZoomDampingStart: 12,
    lowZoomDampingMinFactor: 0.45,
    lowZoomDampingInterpolationBase: 2,
    geoJsonLowZoomDampingStart: 12,
    geoJsonLowZoomDampingPerZoom: 0.85,
    zoomCutToZero: 15,
    pixelsPerUnitAtZoomBase: 4,
    stationBaseRadius: 3.5,
    stationBaseRadiusAtMaxZoom: 5
});

const clampLatitudeForMercator = (lat) => clamp(Number(lat) || 0, -WEB_MERCATOR_MAX_LAT, WEB_MERCATOR_MAX_LAT);

export const projectLngLatToPixelAtZoom12 = (lngLat) => {
    const lng = Number(lngLat?.[0]);
    const latRaw = Number(lngLat?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(latRaw)) return null;

    const lat = clampLatitudeForMercator(latRaw);
    const scale = WEB_MERCATOR_TILE_SIZE * Math.pow(2, WEB_MERCATOR_ZOOM_BASE);
    const x = ((lng + 180) / 360) * scale;
    const sinLat = Math.sin(lat * DEGREE_TO_RADIAN);
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
    if (![x, y].every(Number.isFinite)) return null;
    return { x, y };
};

export const unprojectPixelToLngLatAtZoom12 = (xy) => {
    const x = Number(xy?.x);
    const y = Number(xy?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const scale = WEB_MERCATOR_TILE_SIZE * Math.pow(2, WEB_MERCATOR_ZOOM_BASE);
    const lng = (x / scale) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / scale;
    const lat = RADIAN_TO_DEGREE * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    if (![lng, lat].every(Number.isFinite)) return null;
    return [lng, lat];
};

const dedupePixelPointsByDistance = (points, minDistancePx = 0.35) => {
    if (!Array.isArray(points) || points.length === 0) return [];
    const tol2 = Math.pow(Math.max(0, Number(minDistancePx) || 0), 2);
    const out = [];
    for (const p of points) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        if (!out.length) {
            out.push(p);
            continue;
        }
        const prev = out[out.length - 1];
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        if (dx * dx + dy * dy <= tol2) continue;
        out.push(p);
    }
    return out;
};

const getLineIntersectionInPixels = (a1, a2, b1, b2) => {
    const x1 = a1.x, y1 = a1.y;
    const x2 = a2.x, y2 = a2.y;
    const x3 = b1.x, y3 = b1.y;
    const x4 = b2.x, y4 = b2.y;
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) return null;
    const det1 = x1 * y2 - y1 * x2;
    const det2 = x3 * y4 - y3 * x4;
    const px = (det1 * (x3 - x4) - (x1 - x2) * det2) / denom;
    const py = (det1 * (y3 - y4) - (y1 - y2) * det2) / denom;
    if (![px, py].every(Number.isFinite)) return null;
    return { x: px, y: py };
};

export const buildOffsetPolylinePixelsWithMiter = (pixelPoints, offsetPx, options = {}) => {
    const input = dedupePixelPointsByDistance(pixelPoints, 0.35);
    if (input.length < 2) return input;

    const signedOffset = Number(offsetPx) || 0;
    if (!signedOffset) return input;

    const miterLimitRatio = Number.isFinite(options.miterLimitRatio)
        ? Math.max(1, Number(options.miterLimitRatio))
        : 2;

    const segNormals = [];
    for (let i = 0; i < input.length - 1; i++) {
        const a = input[i];
        const b = input[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (!Number.isFinite(len) || len < 1e-8) {
            segNormals.push(null);
            continue;
        }
        segNormals.push({ x: -dy / len, y: dx / len });
    }

    const getPrevNormal = (i) => {
        for (let k = i - 1; k >= 0; k--) {
            if (segNormals[k]) return segNormals[k];
        }
        return null;
    };

    const getNextNormal = (i) => {
        for (let k = i; k < segNormals.length; k++) {
            if (segNormals[k]) return segNormals[k];
        }
        return null;
    };

    const out = [];
    const miterLimit = Math.abs(signedOffset) * miterLimitRatio;

    {
        const p0 = input[0];
        const n0 = getNextNormal(0) || { x: 0, y: 0 };
        out.push({ x: p0.x + n0.x * signedOffset, y: p0.y + n0.y * signedOffset });
    }

    for (let i = 1; i < input.length - 1; i++) {
        const pPrev = input[i - 1];
        const p = input[i];
        const pNext = input[i + 1];
        const nPrev = getPrevNormal(i) || getNextNormal(i) || { x: 0, y: 0 };
        const nNext = getNextNormal(i) || nPrev;

        const miterRaw = { x: nPrev.x + nNext.x, y: nPrev.y + nNext.y };
        const miterLen = Math.hypot(miterRaw.x, miterRaw.y);
        const fallback = { x: p.x + nPrev.x * signedOffset, y: p.y + nPrev.y * signedOffset };

        if (!Number.isFinite(miterLen) || miterLen < 1e-8) {
            out.push(fallback);
            continue;
        }

        const miter = { x: miterRaw.x / miterLen, y: miterRaw.y / miterLen };
        const denom = miter.x * nPrev.x + miter.y * nPrev.y;
        if (!Number.isFinite(denom) || Math.abs(denom) < 1e-6) {
            out.push(fallback);
            continue;
        }

        const miterOffsetLen = signedOffset / denom;
        if (!Number.isFinite(miterOffsetLen) || Math.abs(miterOffsetLen) > miterLimit) {
            out.push(fallback);
            continue;
        }

        const miterPoint = { x: p.x + miter.x * miterOffsetLen, y: p.y + miter.y * miterOffsetLen };

        const a1 = { x: pPrev.x + nPrev.x * signedOffset, y: pPrev.y + nPrev.y * signedOffset };
        const a2 = { x: p.x + nPrev.x * signedOffset, y: p.y + nPrev.y * signedOffset };
        const b1 = { x: p.x + nNext.x * signedOffset, y: p.y + nNext.y * signedOffset };
        const b2 = { x: pNext.x + nNext.x * signedOffset, y: pNext.y + nNext.y * signedOffset };
        const inter = getLineIntersectionInPixels(a1, a2, b1, b2);

        if (inter && Number.isFinite(inter.x) && Number.isFinite(inter.y)) {
            const d = Math.hypot(inter.x - fallback.x, inter.y - fallback.y);
            out.push(d <= miterLimit ? inter : miterPoint);
            continue;
        }

        out.push(miterPoint);
    }

    {
        const pLast = input[input.length - 1];
        const nLast = getPrevNormal(input.length - 1) || { x: 0, y: 0 };
        out.push({ x: pLast.x + nLast.x * signedOffset, y: pLast.y + nLast.y * signedOffset });
    }

    return dedupePixelPointsByDistance(out, 0.25);
};

export const nearestProjectionOnPolylinePixels = (pixelPoints, targetPx) => {
    if (!Array.isArray(pixelPoints) || pixelPoints.length < 2 || !targetPx) return null;
    let best = null;
    for (let i = 0; i < pixelPoints.length - 1; i++) {
        const a = pixelPoints[i];
        const b = pixelPoints[i + 1];
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const wx = targetPx.x - a.x;
        const wy = targetPx.y - a.y;
        const v2 = vx * vx + vy * vy;
        const t = v2 > 0 ? clamp((wx * vx + wy * vy) / v2, 0, 1) : 0;
        const proj = { x: a.x + vx * t, y: a.y + vy * t };
        const dx = targetPx.x - proj.x;
        const dy = targetPx.y - proj.y;
        const d2 = dx * dx + dy * dy;
        if (!best || d2 < best.d2) {
            best = { d2, segmentIndex: i, t, point: proj };
        }
    }
    return best;
};

const nearestProjectionOnPolylinePixelsInSegmentRange = (pixelPoints, targetPx, startSegmentIndex, endSegmentIndex) => {
    if (!Array.isArray(pixelPoints) || pixelPoints.length < 2 || !targetPx) return null;
    const maxSeg = pixelPoints.length - 2;
    const start = clamp(Number(startSegmentIndex) || 0, 0, maxSeg);
    const end = clamp(Number(endSegmentIndex) || maxSeg, 0, maxSeg);
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);

    let best = null;
    for (let i = lo; i <= hi; i++) {
        const a = pixelPoints[i];
        const b = pixelPoints[i + 1];
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const wx = targetPx.x - a.x;
        const wy = targetPx.y - a.y;
        const v2 = vx * vx + vy * vy;
        const t = v2 > 0 ? clamp((wx * vx + wy * vy) / v2, 0, 1) : 0;
        const proj = { x: a.x + vx * t, y: a.y + vy * t };
        const dx = targetPx.x - proj.x;
        const dy = targetPx.y - proj.y;
        const d2 = dx * dx + dy * dy;
        if (!best || d2 < best.d2) {
            best = { d2, segmentIndex: i, t, point: proj };
        }
    }
    return best;
};

const interpolatePixelPointOnPolylineSegment = (pixelPoints, segmentIndex, t) => {
    if (!Array.isArray(pixelPoints) || pixelPoints.length < 2) return null;
    const maxSeg = pixelPoints.length - 2;
    const seg = clamp(Number(segmentIndex) || 0, 0, maxSeg);
    const a = pixelPoints[seg];
    const b = pixelPoints[seg + 1];
    if (!a || !b) return null;
    const ratio = clamp(Number(t) || 0, 0, 1);
    const x = a.x + (b.x - a.x) * ratio;
    const y = a.y + (b.y - a.y) * ratio;
    if (![x, y].every(Number.isFinite)) return null;
    return { x, y };
};

const getSegmentNormalInPixels = (pixelPoints, segmentIndex) => {
    if (!Array.isArray(pixelPoints) || pixelPoints.length < 2) return null;
    const maxSeg = pixelPoints.length - 2;
    const seg = clamp(Number(segmentIndex) || 0, 0, maxSeg);
    const a = pixelPoints[seg];
    const b = pixelPoints[seg + 1];
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len < 1e-8) return null;
    return { x: -dy / len, y: dx / len };
};

const normalizePixelVector = (v) => {
    const x = Number(v?.x);
    const y = Number(v?.y);
    const len = Math.hypot(x, y);
    if (!Number.isFinite(len) || len < 1e-8) return null;
    return { x: x / len, y: y / len };
};

const getFixedOffsetDirectionAtAnchor = (pixelPoints, segmentIndex, t) => {
    const current = getSegmentNormalInPixels(pixelPoints, segmentIndex);
    if (!current) return null;

    const maxSeg = Array.isArray(pixelPoints) ? pixelPoints.length - 2 : 0;
    const seg = clamp(Number(segmentIndex) || 0, 0, maxSeg);
    const ratio = clamp(Number(t) || 0, 0, 1);

    if (ratio <= 1e-4 && seg > 0) {
        const prev = getSegmentNormalInPixels(pixelPoints, seg - 1);
        return normalizePixelVector({ x: (prev?.x || 0) + current.x, y: (prev?.y || 0) + current.y }) || current;
    }

    if (ratio >= 1 - 1e-4 && seg < maxSeg) {
        const next = getSegmentNormalInPixels(pixelPoints, seg + 1);
        return normalizePixelVector({ x: current.x + (next?.x || 0), y: current.y + (next?.y || 0) }) || current;
    }

    return current;
};

const buildRailwayCoordinateChains = (coordDef) => {
    const out = [];
    const sublines = Array.isArray(coordDef?.sublines) ? coordDef.sublines : [];
    for (const sub of sublines) {
        const coords = Array.isArray(sub?.coords)
            ? sub.coords.map(coordsToLngLat).filter(Boolean)
            : [];
        if (coords.length >= 2) out.push(coords);
    }
    return out;
};

const extractLocalPolylineAroundProjection = (chainLngLat, chainPixels, projection, options = {}) => {
    if (!Array.isArray(chainLngLat) || !Array.isArray(chainPixels) || chainLngLat.length !== chainPixels.length) return null;
    if (!projection || chainLngLat.length < 2) return null;

    const windowPx = Number.isFinite(options.windowPx) ? Math.max(24, Number(options.windowPx)) : 64;
    const centerIndex = clamp(Number(projection.segmentIndex) || 0, 0, chainLngLat.length - 2);

    let start = centerIndex;
    let end = centerIndex + 1;

    let backLen = 0;
    while (start > 0 && backLen < windowPx) {
        const a = chainPixels[start];
        const b = chainPixels[start - 1];
        backLen += Math.hypot(a.x - b.x, a.y - b.y);
        start -= 1;
    }

    let forwardLen = 0;
    while (end < chainLngLat.length - 1 && forwardLen < windowPx) {
        const a = chainPixels[end];
        const b = chainPixels[end + 1];
        forwardLen += Math.hypot(a.x - b.x, a.y - b.y);
        end += 1;
    }

    const localChain = chainLngLat.slice(start, end + 1);
    const localPixels = chainPixels.slice(start, end + 1);
    if (localChain.length < 2 || localPixels.length < 2) return null;

    return {
        localChain,
        localPixels,
        localAnchorSegmentIndex: centerIndex - start,
        localAnchorT: clamp(Number(projection.t) || 0, 0, 1)
    };
};

const getRailwayIdFromStationFeature = (feature) => {
    const props = feature?.properties || {};
    const fromPlatform = Array.isArray(props.platform_line_id) ? props.platform_line_id[0] : null;
    const id = normalizeText(fromPlatform);
    if (id) return id;

    const sid = normalizeText(props.id || feature?.id);
    if (!sid) return '';
    const parts = sid.split('.').filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : '';
};

const getExponentialInterpolationT = (progress, base) => {
    const p = clamp(Number(progress) || 0, 0, 1);
    const b = Number(base);
    if (!Number.isFinite(b) || b <= 0 || b === 1) return p;
    return (Math.pow(b, p) - 1) / (b - 1);
};

export const getOffsetPixelsPerUnitAtZoom = (zoom) => {
    const z = Number(zoom);
    if (!Number.isFinite(z)) return 0;

    const base = OFFSET_PIXELS_CONFIG.interpolationBase;
    const zBase = OFFSET_PIXELS_CONFIG.zoomBase;
    const zMax = OFFSET_PIXELS_CONFIG.zoomMax;
    const pxAtBase = OFFSET_PIXELS_CONFIG.pixelsPerUnitAtZoomBase;
    const scaleAtMax = OFFSET_PIXELS_CONFIG.stationBaseRadiusAtMaxZoom / OFFSET_PIXELS_CONFIG.stationBaseRadius;
    const pxAtMax = pxAtBase * scaleAtMax;
    const growthPerZoom = Math.pow(pxAtMax / pxAtBase, 1 / (zMax - zBase));
    const pxAt0 = pxAtBase * Math.pow(growthPerZoom, -zBase);
    const tAt14 = getExponentialInterpolationT((14 - zBase) / (zMax - zBase), base);
    const pxAt14 = pxAtBase + (pxAtMax - pxAtBase) * tAt14;
    const lowZoomDampingStart = Number(OFFSET_PIXELS_CONFIG.lowZoomDampingStart) || 12;
    const lowZoomDampingMinFactor = clamp(Number(OFFSET_PIXELS_CONFIG.lowZoomDampingMinFactor) || 1, 0, 1);
    const lowZoomDampingInterpolationBase = Number(OFFSET_PIXELS_CONFIG.lowZoomDampingInterpolationBase) || base;

    const applyLowZoomDamping = (rawPx) => {
        if (!(Number.isFinite(rawPx) && rawPx > 0)) return 0;
        if (!(lowZoomDampingStart > 0) || z >= lowZoomDampingStart) return rawPx;
        const p = clamp(z / lowZoomDampingStart, 0, 1);
        const t = getExponentialInterpolationT(p, lowZoomDampingInterpolationBase);
        const factor = lowZoomDampingMinFactor + (1 - lowZoomDampingMinFactor) * t;
        return rawPx * factor;
    };

    if (z <= zBase) {
        const t = getExponentialInterpolationT((z - 0) / (zBase - 0), base);
        const raw = pxAt0 + (pxAtBase - pxAt0) * t;
        return applyLowZoomDamping(raw);
    }

    if (z <= 14) {
        const t = getExponentialInterpolationT((z - zBase) / (14 - zBase), base);
        return pxAtBase + (pxAt14 - pxAtBase) * t;
    }

    if (z >= OFFSET_PIXELS_CONFIG.zoomCutToZero) return 0;

    const linearT = (z - 14) / (OFFSET_PIXELS_CONFIG.zoomCutToZero - 14);
    return pxAt14 * (1 - clamp(linearT, 0, 1));
};

export const buildStationOffsetAlgorithmContext = ({ stationFeatures, lineOffsetByRailwayId, lineChainsByRailwayId, options = {} }) => {
    const list = Array.isArray(stationFeatures) ? stationFeatures : [];
    const maxNearestDistancePxAtZoom12 = Number.isFinite(options.maxNearestDistancePxAtZoom12)
        ? Math.max(0, Number(options.maxNearestDistancePxAtZoom12))
        : 24;

    const stationLocalChainsById = {};
    const unresolvedStationIds = [];

    for (const feature of list) {
        const stationId = normalizeText(feature?.properties?.id || feature?.id);
        const railwayId = getRailwayIdFromStationFeature(feature);
        if (!stationId || !railwayId) continue;
        if (!lineOffsetByRailwayId.has(railwayId)) continue;

        const stationLngLat = coordsToLngLat(feature?.geometry?.coordinates);
        if (!stationLngLat) {
            unresolvedStationIds.push(stationId);
            continue;
        }

        const chains = Array.isArray(lineChainsByRailwayId?.get?.(railwayId))
            ? lineChainsByRailwayId.get(railwayId)
            : [];
        if (!chains.length) {
            unresolvedStationIds.push(stationId);
            continue;
        }

        const stationPx = projectLngLatToPixelAtZoom12(stationLngLat);
        if (!stationPx) {
            unresolvedStationIds.push(stationId);
            continue;
        }

        let best = null;
        for (const chain of chains) {
            const chainPx = chain.map(projectLngLatToPixelAtZoom12).filter(Boolean);
            if (chainPx.length !== chain.length || chainPx.length < 2) continue;
            const hit = nearestProjectionOnPolylinePixels(chainPx, stationPx);
            if (!hit || !Number.isFinite(hit.d2)) continue;
            if (!best || hit.d2 < best.hit.d2) {
                best = { chain, chainPx, hit };
            }
        }

        if (!best) {
            unresolvedStationIds.push(stationId);
            continue;
        }

        const nearestDistancePx = Math.sqrt(Math.max(0, Number(best.hit.d2) || 0));
        if (!Number.isFinite(nearestDistancePx) || nearestDistancePx > maxNearestDistancePxAtZoom12) {
            unresolvedStationIds.push(stationId);
            continue;
        }

        const local = extractLocalPolylineAroundProjection(best.chain, best.chainPx, best.hit, { windowPx: 64 });
        if (!local || !Array.isArray(local.localChain) || local.localChain.length < 2 || !Array.isArray(local.localPixels) || local.localPixels.length < 2) {
            unresolvedStationIds.push(stationId);
            continue;
        }

        const localAnchorSegmentIndex = Number(local.localAnchorSegmentIndex) || 0;
        const localAnchorT = clamp(Number(local.localAnchorT) || 0, 0, 1);
        const anchorPixelAtZoom12 = interpolatePixelPointOnPolylineSegment(
            local.localPixels,
            localAnchorSegmentIndex,
            localAnchorT
        );
        const offsetDirectionAtZoom12 = getFixedOffsetDirectionAtAnchor(
            local.localPixels,
            localAnchorSegmentIndex,
            localAnchorT
        );
        if (!anchorPixelAtZoom12 || !offsetDirectionAtZoom12) {
            unresolvedStationIds.push(stationId);
            continue;
        }

        stationLocalChainsById[stationId] = {
            railwayId,
            units: Number(lineOffsetByRailwayId.get(railwayId)) || 0,
            stationLngLat,
            stationPixelAtZoom12: stationPx,
            localLineCoords: local.localChain,
            localLinePixelsAtZoom12: local.localPixels,
            localAnchorSegmentIndex,
            localAnchorT,
            anchorPixelAtZoom12,
            offsetDirectionAtZoom12,
            nearestDistancePx,
            nearestSegmentIndex: Number(best.hit.segmentIndex) || 0
        };
    }

    return {
        status: 'ready_for_runtime_compute',
        projection: {
            kind: 'web_mercator',
            tileSize: WEB_MERCATOR_TILE_SIZE,
            baseZoom: WEB_MERCATOR_ZOOM_BASE
        },
        miterLimitRatio: 2,
        stationLocalChainsById,
        unresolvedStationIds
    };
};

export const buildStationOffsetGeoJSONAtZoom = ({ baseStationsGeoJSON, stationOffsetAlgorithmContext, zoom }) => {
    if (!baseStationsGeoJSON || typeof baseStationsGeoJSON !== 'object') return baseStationsGeoJSON;

    const z = Number(zoom);
    if (!Number.isFinite(z)) return baseStationsGeoJSON;

    const pxPerUnit = getOffsetPixelsPerUnitAtZoom(z);
    if (!pxPerUnit) return baseStationsGeoJSON;

    const stationLocalChainsById = stationOffsetAlgorithmContext?.stationLocalChainsById || {};
    if (!stationLocalChainsById || typeof stationLocalChainsById !== 'object') return baseStationsGeoJSON;

    const scaleFactor = Math.pow(2, WEB_MERCATOR_ZOOM_BASE - z);
    const geoJsonLowZoomDampingStart = Number(OFFSET_PIXELS_CONFIG.geoJsonLowZoomDampingStart) || WEB_MERCATOR_ZOOM_BASE;
    const geoJsonLowZoomDampingPerZoom = clamp(Number(OFFSET_PIXELS_CONFIG.geoJsonLowZoomDampingPerZoom) || 1, 0, 1);
    const geoJsonLowZoomFactor = z < geoJsonLowZoomDampingStart
        ? Math.pow(geoJsonLowZoomDampingPerZoom, geoJsonLowZoomDampingStart - z)
        : 1;
    const stationOffsetCoordsById = {};

    for (const [stationId, info] of Object.entries(stationLocalChainsById)) {
        const units = Number(info?.units) || 0;
        const anchorPx = info?.anchorPixelAtZoom12;
        const offsetDirection = info?.offsetDirectionAtZoom12;
        if (!units || !anchorPx || !offsetDirection) continue;

        const offsetPxAtCurrentZoom = units * pxPerUnit;
        if (!offsetPxAtCurrentZoom) continue;

        // localLinePixelsAtZoom12 lives in zoom=12 pixel space, so convert offset magnitude back to that space.
        const offsetPxAtZoom12 = offsetPxAtCurrentZoom * scaleFactor * geoJsonLowZoomFactor;
        if (!offsetPxAtZoom12) continue;

        const point = {
            x: Number(anchorPx.x) + Number(offsetDirection.x) * offsetPxAtZoom12,
            y: Number(anchorPx.y) + Number(offsetDirection.y) * offsetPxAtZoom12
        };
        if (![point.x, point.y].every(Number.isFinite)) continue;

        const ll = unprojectPixelToLngLatAtZoom12(point);
        if (!Array.isArray(ll) || ll.length < 2) continue;
        stationOffsetCoordsById[stationId] = ll;
    }

    const features = Array.isArray(baseStationsGeoJSON?.features) ? baseStationsGeoJSON.features : [];
    return {
        type: 'FeatureCollection',
        features: features.map((feature) => {
            const sid = normalizeText(feature?.properties?.id || feature?.id);
            const mapped = sid ? stationOffsetCoordsById[sid] : null;
            if (!Array.isArray(mapped) || mapped.length < 2) return feature;

            const lng = Number(mapped[0]);
            const lat = Number(mapped[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return feature;

            return {
                ...feature,
                geometry: {
                    ...(feature?.geometry || {}),
                    type: 'Point',
                    coordinates: [lng, lat]
                }
            };
        })
    };
};
