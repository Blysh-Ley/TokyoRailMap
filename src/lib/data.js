/**
 * 加载本地（或远程）GeoJSON。
 * 注意：需要通过 HTTP 服务器访问（不能直接双击打开 html）。
 */
import { cachedFetch } from './fetch.js';
import {
    buildStationOffsetAlgorithmContext
} from '../map/offset.js';
import { buildLineNameLabelGeoJSON } from '../domain/lineNameLabels.js';
import { buildAlternateLineMembership } from '../domain/alternateLineMembership.js';

export async function loadGeoJSON(url) {
    const response = await cachedFetch(url);
    if (!response.ok) {
        throw new Error(`加载失败 ${url}: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

let railDataCachePromise = null;

const normalizeText = (v) => String(v ?? '').trim();

const pickI18nTitle = (titleObj) => {
    const t = titleObj || {};
    return (
        normalizeText(t['zh-Hans']) ||
        normalizeText(t.zh) ||
        normalizeText(t['zh']) ||
        normalizeText(t['zh-CN']) ||
        normalizeText(t['zh-cn']) ||
        normalizeText(t['zh-Hant']) ||
        normalizeText(t.ja) ||
        normalizeText(t.en) ||
        ''
    );
};

const getCompanyFromRailwayId = (railwayId) => {
    const id = normalizeText(railwayId);
    if (!id) return '';
    const first = id.split('.')[0];
    return normalizeText(first);
};

const coordsToLngLat = (pt) => {
    if (!Array.isArray(pt) || pt.length < 2) return null;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
};

// 近似距离（米）：足够用于检测“跨区域直线连接”这种超大跳变
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
    const R = 6371000;
    return Math.hypot(x, y) * R;
};

const DEGREE_TO_RADIAN = Math.PI / 180;
const RADIAN_TO_DEGREE = 180 / Math.PI;
const MEAN_EARTH_RADIUS_KM = 6371.0088;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const easeInOutQuad = (t) => {
    const x = clamp(Number(t) || 0, 0, 1);
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};

const bearingDegrees = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return 0;
    const lng1 = Number(a[0]) * DEGREE_TO_RADIAN;
    const lat1 = Number(a[1]) * DEGREE_TO_RADIAN;
    const lng2 = Number(b[0]) * DEGREE_TO_RADIAN;
    const lat2 = Number(b[1]) * DEGREE_TO_RADIAN;
    if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return 0;

    const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
    const brng = Math.atan2(y, x) * RADIAN_TO_DEGREE;
    return (brng + 360) % 360;
};

// distanceKm: 公里；bearing: 度（0=北，90=东）
const destinationLngLat = (origin, distanceKm, bearingDeg) => {
    if (!Array.isArray(origin) || origin.length < 2) return origin;
    const lng1 = Number(origin[0]) * DEGREE_TO_RADIAN;
    const lat1 = Number(origin[1]) * DEGREE_TO_RADIAN;
    const bearing = Number(bearingDeg) * DEGREE_TO_RADIAN;
    const distance = Number(distanceKm);
    if (![lng1, lat1, bearing, distance].every(Number.isFinite)) return origin;

    const radians = distance / MEAN_EARTH_RADIUS_KM;
    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);
    const sinR = Math.sin(radians);
    const cosR = Math.cos(radians);
    const sinB = Math.sin(bearing);
    const cosB = Math.cos(bearing);

    const lat2 = Math.asin(sinLat1 * cosR + cosLat1 * sinR * cosB);
    const lng2 = lng1 + Math.atan2(
        sinB * sinR * cosLat1,
        cosR - sinLat1 * Math.sin(lat2)
    );

    return [
        ((lng2 % (Math.PI * 2)) * RADIAN_TO_DEGREE + 540) % 360 - 180,
        lat2 * RADIAN_TO_DEGREE
    ];
};

const lineLengthKm = (coords) => {
    if (!Array.isArray(coords) || coords.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < coords.length; i++) {
        sum += approxDistanceMeters(coords[i - 1], coords[i]) / 1000;
    }
    return sum;
};

const alongLine = (coords, distanceKm) => {
    if (!Array.isArray(coords) || coords.length === 0) return null;
    if (coords.length === 1) return coords[0];
    const d = Math.max(0, Number(distanceKm) || 0);

    let travelled = 0;
    for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1];
        const b = coords[i];
        const seg = approxDistanceMeters(a, b) / 1000;
        if (seg <= 0) continue;
        if (travelled + seg >= d) {
            const t = (d - travelled) / seg;
            return [
                a[0] + (b[0] - a[0]) * t,
                a[1] + (b[1] - a[1]) * t
            ];
        }
        travelled += seg;
    }
    return coords[coords.length - 1];
};

const lngLatToMetersXY = (lngLat, refLatRad) => {
    const lng = Number(lngLat?.[0]);
    const lat = Number(lngLat?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const lngRad = lng * DEGREE_TO_RADIAN;
    const latRad = lat * DEGREE_TO_RADIAN;
    const cos = Math.cos(refLatRad);
    const x = MEAN_EARTH_RADIUS_KM * 1000 * lngRad * cos;
    const y = MEAN_EARTH_RADIUS_KM * 1000 * latRad;
    return { x, y, lngRad, latRad };
};

const metersXYToLngLat = (xy, refLatRad) => {
    const cos = Math.cos(refLatRad);
    const lngRad = xy.x / (MEAN_EARTH_RADIUS_KM * 1000 * (cos || 1));
    const latRad = xy.y / (MEAN_EARTH_RADIUS_KM * 1000);
    return [lngRad * RADIAN_TO_DEGREE, latRad * RADIAN_TO_DEGREE];
};

// 简化 nearestPointOnLine：返回投影点、所在 segment、沿线位置（km）、与该 segment 的有符号侧向距离（km）
const nearestPointOnLineSimple = (lineCoords, ptLngLat) => {
    if (!Array.isArray(lineCoords) || lineCoords.length < 2 || !ptLngLat) return null;
    const refLatRad = Number(ptLngLat[1]) * DEGREE_TO_RADIAN;
    const p = lngLatToMetersXY(ptLngLat, refLatRad);
    if (!p) return null;

    let best = null;
    let travelledKm = 0;

    for (let i = 0; i < lineCoords.length - 1; i++) {
        const aLL = lineCoords[i];
        const bLL = lineCoords[i + 1];
        const a = lngLatToMetersXY(aLL, refLatRad);
        const b = lngLatToMetersXY(bLL, refLatRad);
        if (!a || !b) continue;

        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const wx = p.x - a.x;
        const wy = p.y - a.y;
        const v2 = vx * vx + vy * vy;
        const t = v2 > 0 ? clamp((wx * vx + wy * vy) / v2, 0, 1) : 0;

        const proj = { x: a.x + vx * t, y: a.y + vy * t };
        const dx = p.x - proj.x;
        const dy = p.y - proj.y;
        const d2 = dx * dx + dy * dy;

        const segLenKm = Math.hypot(vx, vy) / 1000;
        const locationKm = travelledKm + segLenKm * t;

        const cross = vx * (p.y - proj.y) - vy * (p.x - proj.x);
        const sign = cross >= 0 ? 1 : -1;
        const signedDistKm = (Math.sqrt(d2) / 1000) * sign;
        const segBearing = bearingDegrees(aLL, bLL);

        if (!best || d2 < best.d2) {
            best = {
                d2,
                index: i,
                t,
                locationKm,
                signedDistKm,
                segmentBearing: segBearing,
                point: metersXYToLngLat(proj, refLatRad)
            };
        }

        travelledKm += segLenKm;
    }

    return best;
};

const lineSliceBetweenPoints = (refLineCoords, startPt, endPt) => {
    if (!Array.isArray(refLineCoords) || refLineCoords.length < 2) return null;
    const a = nearestPointOnLineSimple(refLineCoords, startPt);
    const b = nearestPointOnLineSimple(refLineCoords, endPt);
    if (!a || !b) return null;

    const totalLen = lineLengthKm(refLineCoords);
    let startLoc = a.locationKm;
    let endLoc = b.locationKm;

    // 保持方向：从 startPt 到 endPt
    let reverse = false;
    if (startLoc > endLoc) {
        reverse = true;
        [startLoc, endLoc] = [endLoc, startLoc];
    }

    startLoc = clamp(startLoc, 0, totalLen);
    endLoc = clamp(endLoc, 0, totalLen);

    const out = [];
    out.push(alongLine(refLineCoords, startLoc));

    // 添加中间原始顶点（用 locationKm 粗略判断）
    let travelled = 0;
    for (let i = 1; i < refLineCoords.length; i++) {
        const seg = approxDistanceMeters(refLineCoords[i - 1], refLineCoords[i]) / 1000;
        if (seg <= 0) continue;
        const nextTravel = travelled + seg;
        if (nextTravel >= startLoc && nextTravel <= endLoc) {
            out.push(refLineCoords[i]);
        }
        travelled = nextTravel;
        if (travelled > endLoc) break;
    }

    out.push(alongLine(refLineCoords, endLoc));

    // 清理重复
    const cleaned = out.filter(Boolean);
    if (cleaned.length >= 2) {
        const deduped = [cleaned[0]];
        for (let i = 1; i < cleaned.length; i++) {
            if (approxDistanceMeters(deduped[deduped.length - 1], cleaned[i]) < 5) continue;
            deduped.push(cleaned[i]);
        }
        if (deduped.length >= 2) {
            if (reverse) deduped.reverse();
            return deduped;
        }
    }
    return null;
};

const alignDirectionToReference = (coords, refCoords) => {
    if (!Array.isArray(coords) || coords.length < 2 || !Array.isArray(refCoords) || refCoords.length < 1) return coords;
    const d1 = approxDistanceMeters(coords[0], refCoords[0]);
    const d2 = approxDistanceMeters(coords[coords.length - 1], refCoords[0]);
    if (d2 < d1) return coords.slice().reverse();
    return coords;
};

const dedupeCoordsByMeters = (coords, tolMeters) => {
    const tol = Number(tolMeters);
    if (!Array.isArray(coords) || coords.length === 0) return [];
    if (!Number.isFinite(tol) || tol <= 0) return coords.slice();
    const out = [coords[0]];
    for (let i = 1; i < coords.length; i++) {
        const prev = out[out.length - 1];
        const cur = coords[i];
        if (!prev || !cur) continue;
        if (approxDistanceMeters(prev, cur) <= tol) continue;
        out.push(cur);
    }
    return out;
};

// 更稳定的几何偏移：在平面（米）上对每段做平移，并在拐点用两条偏移线求交（miter join）。
// 能显著减少“连接处直角拐弯”和“偏移变大出现乱折线”。
const offsetLineCoords = (coords, offsetKm) => {
    if (!Array.isArray(coords) || coords.length < 2) return coords;
    const offsetMetersSigned = (Number(offsetKm) || 0) * 1000;
    if (!offsetMetersSigned) return coords;

    const base = dedupeCoordsByMeters(coords, 0.5);
    if (base.length < 2) return base;

    const meanLat = base.reduce((acc, p) => acc + Number(p?.[1] || 0), 0) / base.length;
    const refLatRad = meanLat * DEGREE_TO_RADIAN;

    const pts = base
        .map((p) => lngLatToMetersXY(p, refLatRad))
        .filter(Boolean)
        .map(({ x, y }) => ({ x, y }));
    if (pts.length < 2) return base;

    const absOffset = Math.abs(offsetMetersSigned);
    const sign = offsetMetersSigned >= 0 ? 1 : -1;

    const segNormals = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (!Number.isFinite(len) || len < 1e-6) {
            segNormals.push(null);
            continue;
        }
        // 左法线 (-dy, dx)
        const nx = (-dy / len) * sign;
        const ny = (dx / len) * sign;
        segNormals.push({ x: nx, y: ny });
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

    const lineIntersection = (p1, p2, p3, p4) => {
        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y;
        const x4 = p4.x, y4 = p4.y;
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) return null;
        const det1 = x1 * y2 - y1 * x2;
        const det2 = x3 * y4 - y3 * x4;
        const px = (det1 * (x3 - x4) - (x1 - x2) * det2) / denom;
        const py = (det1 * (y3 - y4) - (y1 - y2) * det2) / denom;
        if (![px, py].every(Number.isFinite)) return null;
        return { x: px, y: py };
    };

    // miter 太长时回退到平均法线，避免尖刺
    const miterLimit = absOffset * 6;

    const outXY = [];

    // first
    {
        const n0 = getNextNormal(0) || { x: 0, y: 0 };
        outXY.push({ x: pts[0].x + n0.x * absOffset, y: pts[0].y + n0.y * absOffset });
    }

    // middles
    for (let i = 1; i < pts.length - 1; i++) {
        const nPrev = getPrevNormal(i) || getNextNormal(i) || { x: 0, y: 0 };
        const nNext = getNextNormal(i) || nPrev;
        const nSum = { x: nPrev.x + nNext.x, y: nPrev.y + nNext.y };
        const nSumLen = Math.hypot(nSum.x, nSum.y);
        const nAvg = nSumLen > 1e-9 ? { x: nSum.x / nSumLen, y: nSum.y / nSumLen } : nPrev;

        const p = pts[i];
        const pPrev = pts[i - 1];
        const pNext = pts[i + 1];

        const a1 = { x: pPrev.x + nPrev.x * absOffset, y: pPrev.y + nPrev.y * absOffset };
        const a2 = { x: p.x + nPrev.x * absOffset, y: p.y + nPrev.y * absOffset };
        const b1 = { x: p.x + nNext.x * absOffset, y: p.y + nNext.y * absOffset };
        const b2 = { x: pNext.x + nNext.x * absOffset, y: pNext.y + nNext.y * absOffset };

        const inter = lineIntersection(a1, a2, b1, b2);
        const fallback = { x: p.x + nAvg.x * absOffset, y: p.y + nAvg.y * absOffset };
        if (!inter) {
            outXY.push(fallback);
            continue;
        }
        const miterExtra = Math.hypot(inter.x - fallback.x, inter.y - fallback.y);
        outXY.push(miterExtra <= miterLimit ? inter : fallback);
    }

    // last
    {
        const nLast = getPrevNormal(pts.length - 1) || { x: 0, y: 0 };
        outXY.push({ x: pts[pts.length - 1].x + nLast.x * absOffset, y: pts[pts.length - 1].y + nLast.y * absOffset });
    }

    const out = outXY.map((p) => metersXYToLngLat(p, refLatRad));
    return dedupeCoordsByMeters(out, 0.5);
};

// 连接处修正：当两段线在端点附近“应当相接但有小偏差”时，
// 对后一段的前若干个点施加逐渐衰减的平移，让首点对齐上一段末点，减少直角/错位。
const applyJoinTranslationFix = (prevEndLngLat, nextCoords, { minFixMeters = 5, maxFixMeters = 500, blendPoints = 50} = {}) => {
    if (!prevEndLngLat || !Array.isArray(nextCoords) || nextCoords.length < 2) return nextCoords;
    const first = nextCoords[0];
    if (!first) return nextCoords;

    const gap = approxDistanceMeters(prevEndLngLat, first);
    if (!Number.isFinite(gap) || gap < minFixMeters || gap > maxFixMeters) return nextCoords;

    const count = Math.min(Math.max(2, blendPoints | 0), nextCoords.length);
    const sample = [prevEndLngLat, ...nextCoords.slice(0, count)];
    const meanLat = sample.reduce((acc, p) => acc + Number(p?.[1] || 0), 0) / sample.length;
    const refLatRad = meanLat * DEGREE_TO_RADIAN;

    const prevXY = lngLatToMetersXY(prevEndLngLat, refLatRad);
    const firstXY = lngLatToMetersXY(first, refLatRad);
    if (!prevXY || !firstXY) return nextCoords;
    const dx = prevXY.x - firstXY.x;
    const dy = prevXY.y - firstXY.y;
    if (![dx, dy].every(Number.isFinite)) return nextCoords;

    const out = nextCoords.slice();
    const denom = Math.max(1, count - 1);
    for (let i = 0; i < count; i++) {
        const p = nextCoords[i];
        if (!p) continue;
        const xy = lngLatToMetersXY(p, refLatRad);
        if (!xy) continue;
        const t = i / denom; // 0..1
        const w = 1 - t; // 首点全量平移，后续逐渐衰减
        out[i] = metersXYToLngLat({ x: xy.x + dx * w, y: xy.y + dy * w }, refLatRad);
    }
    return out;
};

const splitLineByGaps = (lngLatPoints, { maxGapMeters }) => {
    const ptsArray = Array.isArray(lngLatPoints) ? lngLatPoints : [];
    const validPoints = ptsArray.filter(Boolean);
    const isSmall = validPoints.length > 0 && validPoints.length <= 12;
    const effectiveMaxGap = Number.isFinite(maxGapMeters) && maxGapMeters > 0 ? maxGapMeters : 0;
    const smallMaxGap = 3500;

    // 计算“典型步长”：用相邻点距离的中位数做鲁棒估计
    const distances = [];
    let prevForStats = null;
    for (const p of ptsArray) {
        if (!p) {
            prevForStats = null;
            continue;
        }
        if (prevForStats) {
            const d = approxDistanceMeters(prevForStats, p);
            if (Number.isFinite(d) && d > 0) distances.push(d);
        }
        prevForStats = p;
    }
    distances.sort((a, b) => a - b);
    const median = distances.length
        ? (distances.length % 2
            ? distances[(distances.length - 1) >> 1]
            : (distances[distances.length / 2 - 1] + distances[distances.length / 2]) / 2)
        : 0;

    // 相对跳跃：当某一跳跃显著大于典型步长时，认为中间缺了断点
    const ratioFactor = 18;
    const ratioMinMeters = 2500;

    const out = [];
    let cur = [];
    let prev = null;

    for (const p of ptsArray) {
        if (!p) {
            if (cur.length >= 2) out.push(cur);
            cur = [];
            prev = null;
            continue;
        }

        if (prev) {
            const d = approxDistanceMeters(prev, p);

            const absoluteGap = (isSmall ? smallMaxGap : effectiveMaxGap);
            const overAbs = absoluteGap > 0 && d > absoluteGap;
            const overRatio = median > 0 && d > median * ratioFactor && d > ratioMinMeters;

            if (overAbs || overRatio) {
                if (cur.length >= 2) out.push(cur);
                cur = [];
            }
        }

        cur.push(p);
        prev = p;
    }

    if (cur.length >= 2) out.push(cur);
    return out;
};

const segmentLengthMeters = (seg) => {
    if (!Array.isArray(seg) || seg.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < seg.length; i++) {
        sum += approxDistanceMeters(seg[i - 1], seg[i]);
    }
    return sum;
};

const maxAdjacentJumpMeters = (seg) => {
    if (!Array.isArray(seg) || seg.length < 2) return 0;
    let mx = 0;
    for (let i = 1; i < seg.length; i++) {
        mx = Math.max(mx, approxDistanceMeters(seg[i - 1], seg[i]));
    }
    return mx;
};

const shouldDropCoarseSegment = (seg) => {
    // 典型轨道折线会有较多点；只有 2-6 个点且跨度很大时，通常是“占位连接线/粗略段”。
    const n = Array.isArray(seg) ? seg.length : 0;
    if (n < 2) return true;
    const len = segmentLengthMeters(seg);
    const mx = maxAdjacentJumpMeters(seg);
    if (n <= 4 && mx > 5000) return true;
    if (n <= 6 && len > 9000) return true;
    return false;
};

const nearestIndexOnLine = (line, target) => {
    if (!Array.isArray(line) || line.length === 0 || !target) return null;
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < line.length; i++) {
        const p = line[i];
        if (!p) continue;
        const d = approxDistanceMeters(p, target);
        if (d < bestD) {
            bestD = d;
            bestI = i;
        }
    }
    return { index: bestI, distance: bestD };
};

const extractPathFromBaseSegments = (baseSegments, startPt, endPt) => {
    if (!startPt || !endPt) return null;
    if (!Array.isArray(baseSegments) || baseSegments.length === 0) return null;

    let best = null;

    for (const seg of baseSegments) {
        if (!Array.isArray(seg) || seg.length < 2) continue;
        const a = nearestIndexOnLine(seg, startPt);
        const b = nearestIndexOnLine(seg, endPt);
        if (!a || !b) continue;
        // 要求端点都“足够近”，否则可能选错线路
        if (a.distance > 1200 || b.distance > 1200) continue;

        const score = a.distance + b.distance;
        if (!best || score < best.score) {
            best = { seg, a, b, score };
        }
    }

    if (!best) return null;
    const i1 = best.a.index;
    const i2 = best.b.index;
    if (i1 === i2) return null;

    const forward = i1 < i2;
    const slice = forward ? best.seg.slice(i1, i2 + 1) : best.seg.slice(i2, i1 + 1).slice().reverse();
    return slice.length >= 2 ? slice : null;
};

const getTitleZhHans = (titleObj) => {
    const t = titleObj || {};
    return normalizeText(t['zh-Hans']);
};

const getLineIdFromStationNodeId = (stationNodeId) => {
    const id = normalizeText(stationNodeId);
    if (!id) return '';
    const parts = id.split('.').filter(Boolean);
    if (parts.length < 2) return '';
    return `${parts[0]}.${parts[1]}`;
};

/**
 * 从 /data/ 下的 JSON 数据生成 lines/stations GeoJSON。
 * 数据来源约定（按用户说明）：
 * - data/railways.json：线路元信息（不含坐标）
 * - data/coordinates.json：coordinates.railways 为线路坐标
 * - data/stations.json：站点数据
 * - data/station-groups.json：换乘站分组
 */
export async function loadRailGeoDataFromDataFolder() {
    if (railDataCachePromise) return railDataCachePromise;

    railDataCachePromise = (async () => {
        const [railways, stations, stationGroups, coordinates, lineOffsetConfig] = await Promise.all([
            loadGeoJSON('./data/railways.json'),
            loadGeoJSON('./data/stations.json'),
            loadGeoJSON('./data/station-groups.json'),
            loadGeoJSON('./data/coordinates.json'),
            loadGeoJSON('./data/line-offset.json')
        ]);

        const railwayList = Array.isArray(railways) ? railways : [];
        const stationList = Array.isArray(stations) ? stations : [];
        const groupList = Array.isArray(stationGroups) ? stationGroups : [];

        const railwayById = new Map();
        for (const r of railwayList) {
            const id = normalizeText(r?.id);
            if (!id) continue;
            railwayById.set(id, r);
        }

        const lineOffsetByRailwayId = new Map();
        if (lineOffsetConfig && typeof lineOffsetConfig === 'object' && !Array.isArray(lineOffsetConfig)) {
            for (const [rawId, rawOffset] of Object.entries(lineOffsetConfig)) {
                const id = normalizeText(rawId);
                if (!id) continue;
                const n = Number(rawOffset);
                if (!Number.isFinite(n)) continue;
                lineOffsetByRailwayId.set(id, n);
            }
        }

        const stationById = new Map();
        for (const s of stationList) {
            const id = normalizeText(s?.id);
            if (!id) continue;
            stationById.set(id, s);
        }

        // coordinates.railways: [{ id, sublines:[{type,coords:[ [lng,lat], ... ]}, ...] }, ...]
        const coordsRailways = Array.isArray(coordinates?.railways) ? coordinates.railways : [];
        const coordsByRailwayId = new Map();
        for (const c of coordsRailways) {
            const id = normalizeText(c?.id);
            if (!id) continue;
            coordsByRailwayId.set(id, c);
        }

        const alternateLineMembership = buildAlternateLineMembership({
            railways: railwayList,
            stations: stationList,
            coordinates
        });
        const stationMembershipHiddenIdsByLineId = alternateLineMembership.stationMembershipHiddenIdsByLineId instanceof Map
            ? alternateLineMembership.stationMembershipHiddenIdsByLineId
            : new Map();
        const fullAlternateLineIds = alternateLineMembership.fullAlternateLineIds instanceof Set
            ? alternateLineMembership.fullAlternateLineIds
            : new Set();
        const directHiddenLineIdsByStationId = new Map();
        const hiddenLineIdsByStationId = new Map();
        const addHiddenLineForStation = (target, stationId, lineId) => {
            const sid = normalizeText(stationId);
            const lid = normalizeText(lineId);
            if (!sid || !lid) return;
            if (!target.has(sid)) target.set(sid, new Set());
            target.get(sid).add(lid);
        };
        for (const [lineId, stationIds] of stationMembershipHiddenIdsByLineId.entries()) {
            const ids = stationIds instanceof Set ? Array.from(stationIds) : [];
            for (const stationId of ids) {
                addHiddenLineForStation(directHiddenLineIdsByStationId, stationId, lineId);
                addHiddenLineForStation(hiddenLineIdsByStationId, stationId, lineId);
            }
        }
        for (const group of groupList) {
            if (!Array.isArray(group)) continue;
            const groupStationIds = [];
            for (const chunk of group) {
                if (!Array.isArray(chunk)) continue;
                for (const sid of chunk) {
                    const id = normalizeText(sid);
                    if (id) groupStationIds.push(id);
                }
            }
            if (!groupStationIds.length) continue;

            const groupHiddenLineIds = new Set();
            for (const sid of groupStationIds) {
                const hiddenIds = directHiddenLineIdsByStationId.get(sid);
                if (!(hiddenIds instanceof Set)) continue;
                for (const lineId of hiddenIds) groupHiddenLineIds.add(lineId);
            }
            if (!groupHiddenLineIds.size) continue;

            for (const sid of groupStationIds) {
                for (const lineId of groupHiddenLineIds) {
                    addHiddenLineForStation(hiddenLineIdsByStationId, sid, lineId);
                }
            }
        }
        const isDirectHiddenStationMembership = (stationId, lineId) => {
            const sid = normalizeText(stationId);
            const lid = normalizeText(lineId);
            if (!sid || !lid) return false;
            if (fullAlternateLineIds.has(lid)) return true;
            return directHiddenLineIdsByStationId.get(sid)?.has?.(lid) === true;
        };
        const isHiddenServingMembership = (stationId, lineId) => {
            const sid = normalizeText(stationId);
            const lid = normalizeText(lineId);
            if (!sid || !lid) return false;
            if (fullAlternateLineIds.has(lid)) return true;
            return hiddenLineIdsByStationId.get(sid)?.has?.(lid) === true;
        };
        const filteredStationGroups = groupList.map((group) => {
            if (!Array.isArray(group)) return group;
            const rawIds = [];
            for (const chunk of group) {
                if (!Array.isArray(chunk)) continue;
                for (const sid of chunk) {
                    const id = normalizeText(sid);
                    if (id) rawIds.push(id);
                }
            }
            const rawSet = new Set(rawIds);
            const filtered = group
                .map((chunk) => {
                    if (!Array.isArray(chunk)) return chunk;
                    return chunk.filter((sid) => {
                        const id = normalizeText(sid);
                        const alternate = normalizeText(stationById.get(id)?.alternate);
                        return !(alternate && rawSet.has(alternate));
                    });
                })
                .filter((chunk) => !Array.isArray(chunk) || chunk.length);
            return filtered.length ? filtered : group;
        });

        const railwayNameById = new Map();
        const railwayZhHansById = new Map();
        const railwayColorById = new Map();
        for (const [id, r] of railwayById.entries()) {
            const name = pickI18nTitle(r?.title) || id;
            railwayNameById.set(id, name);
            const zhHans = normalizeText(r?.title?.['zh-Hans']);
            if (zhHans) railwayZhHansById.set(id, zhHans);
            const color = normalizeText(r?.color);
            if (color) railwayColorById.set(id, color);
        }

        // 诊断：检测“大跨度（相邻跳跃距离过大）”的线路
        const LARGE_SPAN_JUMP_METERS = 5000;
        const largeSpanRailways = [];

        // stationId -> Set<railwayId>（由 station-groups 中 stationId 前两段推导）
        const servingRailwayIdsByStationId = new Map();
        for (const group of groupList) {
            if (!Array.isArray(group)) continue;

            const stationIds = [];
            for (const chunk of group) {
                if (!Array.isArray(chunk)) continue;
                for (const sid of chunk) {
                    const id = normalizeText(sid);
                    if (id) stationIds.push(id);
                }
            }

            const railwayIds = new Set();
            for (const sid of stationIds) {
                const rid = getLineIdFromStationNodeId(sid);
                if (rid) railwayIds.add(rid);
            }

            if (!railwayIds.size) continue;
            for (const sid of stationIds) {
                if (!servingRailwayIdsByStationId.has(sid)) {
                    servingRailwayIdsByStationId.set(sid, new Set());
                }
                const set = servingRailwayIdsByStationId.get(sid);
                for (const rid of railwayIds) {
                    if (isHiddenServingMembership(sid, rid)) continue;
                    set.add(rid);
                }
            }
        }


        const nearestIndexOnCoords = (coords, targetLngLat) => {
            if (!Array.isArray(coords) || coords.length < 2 || !targetLngLat) return null;
            let best = null;
            for (let i = 0; i < coords.length; i++) {
                const p = coords[i];
                if (!p) continue;
                const d = approxDistanceMeters(p, targetLngLat);
                if (!Number.isFinite(d)) continue;
                if (!best || d < best.distance) best = { index: i, distance: d };
            }
            return best;
        };

        const minDistanceToRange = (coords, targetLngLat, startIndex, endIndex) => {
            if (!Array.isArray(coords) || coords.length === 0 || !targetLngLat) return Infinity;
            const start = Math.max(0, Math.min(coords.length - 1, startIndex | 0));
            const end = Math.max(0, Math.min(coords.length - 1, endIndex | 0));
            const lo = Math.min(start, end);
            const hi = Math.max(start, end);
            let best = Infinity;
            for (let i = lo; i <= hi; i++) {
                const p = coords[i];
                if (!p) continue;
                const d = approxDistanceMeters(p, targetLngLat);
                if (!Number.isFinite(d)) continue;
                if (d < best) best = d;
            }
            return best;
        };

        const trimLineAtStation = (coordinates, boundaryLngLat, keepSideNearLngLat) => {
            if (!Array.isArray(coordinates) || coordinates.length < 2) return coordinates;
            if (!boundaryLngLat || !keepSideNearLngLat) return coordinates;

            const nearestBoundary = nearestIndexOnCoords(coordinates, boundaryLngLat);
            if (!nearestBoundary) return coordinates;
            // 若边界点离线路太远，认为数据不匹配，不裁剪
            if (nearestBoundary.distance > 1200) return coordinates;

            const idx = nearestBoundary.index;
            const leftMin = minDistanceToRange(coordinates, keepSideNearLngLat, 0, idx);
            const rightMin = minDistanceToRange(coordinates, keepSideNearLngLat, idx, coordinates.length - 1);
            const keepRight = rightMin <= leftMin;

            const sliced = keepRight ? coordinates.slice(idx) : coordinates.slice(0, idx + 1);
            if (sliced.length < 2) return coordinates;

            // 将断开端点钉到站点坐标上，确保两条线在交点处“接上但不连成一条”
            const out = sliced.slice();
            if (approxDistanceMeters(out[0], boundaryLngLat) < 150) {
                out[0] = boundaryLngLat.slice();
            } else if (approxDistanceMeters(out[out.length - 1], boundaryLngLat) < 150) {
                out[out.length - 1] = boundaryLngLat.slice();
            }

            return out;
        };

        const DISPLAY_TRIM_RULES = {
            
        };

        const buildRailwayCoordinatesForZoom = (railwayId, coordDef, zoom, unitKm, featureLookup, options = {}) => {
            const includeOpacityZero = options?.includeOpacityZero === true;
            const onlyOpacityZero = options?.onlyOpacityZero === true;
            const disableFallback = options?.disableFallback === true;
            const disableDisplayTrim = options?.disableDisplayTrim === true;
            const sublines = Array.isArray(coordDef?.sublines) ? coordDef.sublines : [];
            const out = [];

            const smoothCoords = (coordinates, ref, reverse) => {
                const refRailway = normalizeText(ref?.railway);
                if (!refRailway) return;
                const refFeature = featureLookup.get(refRailway);
                const refCoords = refFeature?.geometry?.coordinates;
                if (!Array.isArray(refCoords) || refCoords.length < 2) return;

                const startIndex = !reverse ? 0 : coordinates.length - 1;
                const endIndex = !reverse ? coordinates.length - 1 : 0;
                const step = !reverse ? 1 : -1;

                const nearestRef = nearestPointOnLineSimple(refCoords, coordinates[startIndex]);
                if (!nearestRef) return;

                const desiredOffsetUnits = Number(ref?.offset) || 0;
                const targetOffsetKm = desiredOffsetUnits * unitKm;
                const baseOffsetKm = targetOffsetKm - (Number(nearestRef.signedDistKm) || 0);
                if (!Number.isFinite(baseOffsetKm) || baseOffsetKm === 0) return;

                const baseLenKm = lineLengthKm(coordinates);
                const transitionKm = Math.min(Math.abs(desiredOffsetUnits) * 0.75 + 0.75, baseLenKm);
                if (!transitionKm) return;

                const baseNearest = nearestPointOnLineSimple(coordinates, coordinates[startIndex]);
                const baseLocation = baseNearest?.locationKm ?? (!reverse ? 0 : baseLenKm);

                const normalBearing = Number(nearestRef.segmentBearing) + (baseOffsetKm > 0 ? 90 : -90);
                for (let i = startIndex; i !== endIndex; i += step) {
                    const here = nearestPointOnLineSimple(coordinates, coordinates[i]);
                    const loc = here?.locationKm;
                    if (!Number.isFinite(loc)) break;
                    const dist = Math.abs(loc - baseLocation);
                    if (dist > transitionKm) break;
                    const factor = easeInOutQuad(1 - dist / transitionKm);
                    coordinates[i] = destinationLngLat(coordinates[i], Math.abs(baseOffsetKm) * factor, normalBearing);
                }
            };

            for (let i = 0; i < sublines.length; i++) {
                const subline = sublines[i] || {};
                const typeRaw = normalizeText(subline?.type);
                const type = typeRaw || 'main';
                const coords = Array.isArray(subline?.coords) ? subline.coords : [];
                const refCoords = coords.map((pt) => coordsToLngLat(pt)).filter(Boolean);
                if (refCoords.length < 2) continue;

                const start = subline?.start || null;
                const end = subline?.end || null;
                const opacity = subline?.opacity;

                // mini-tokyo-3d 的 coordinates.json 里存在“辅助段”（用于平滑/过渡/计算）
                // 明确标记 opacity=0 的段不应作为可见线路绘制。
                const isOpacityZero = opacity === 0;
                if (onlyOpacityZero) {
                    if (!isOpacityZero) continue;
                } else if (!includeOpacityZero && isOpacityZero) {
                    continue;
                }

                let coordinates = null;

                const hybridZoom = Number(subline?.zoom);
                if (type === 'main' || (type === 'hybrid' && (!Number.isFinite(hybridZoom) || zoom >= hybridZoom))) {
                    coordinates = refCoords.map((d) => d.slice());
                    const startZoom = Number(start?.zoom);
                    if (start?.railway && Number.isFinite(startZoom) && zoom < startZoom) {
                        smoothCoords(coordinates, start, false);
                    }
                    const endZoom = Number(end?.zoom);
                    if (end?.railway && Number.isFinite(endZoom) && zoom < endZoom) {
                        smoothCoords(coordinates, end, true);
                    }
                } else if (type === 'sub' || type === 'hybrid') {
                    const startRailway = normalizeText(start?.railway);
                    const endRailway = normalizeText(end?.railway);
                    const startOffset = Number(start?.offset) || 0;
                    const endOffset = Number(end?.offset) || 0;

                    if (startRailway && endRailway && startRailway === endRailway && startOffset === endOffset) {
                        const base = featureLookup.get(startRailway);
                        const baseLine = base?.geometry?.coordinates;
                        const sliced = lineSliceBetweenPoints(baseLine, refCoords[0], refCoords[refCoords.length - 1]);
                        if (sliced && sliced.length >= 2) {
                            const offsetKm = startOffset * unitKm;
                            const offsetted = offsetKm ? offsetLineCoords(sliced, offsetKm) : sliced;
                            coordinates = alignDirectionToReference(offsetted, refCoords);
                        }
                    } else if (startRailway && endRailway) {
                        const steps = Math.max(2, Math.floor(Number(subline?.interpolate) || 32));

                        const base1 = featureLookup.get(startRailway);
                        const base2 = featureLookup.get(endRailway);
                        const baseLine1 = base1?.geometry?.coordinates;
                        const baseLine2 = base2?.geometry?.coordinates;

                        const slice1 = lineSliceBetweenPoints(baseLine1, refCoords[0], refCoords[refCoords.length - 1]);
                        const slice2 = lineSliceBetweenPoints(baseLine2, refCoords[0], refCoords[refCoords.length - 1]);

                        if (slice1 && slice2 && slice1.length >= 2 && slice2.length >= 2) {
                            const feature1 = alignDirectionToReference(
                                (startOffset ? offsetLineCoords(slice1, startOffset * unitKm) : slice1),
                                refCoords
                            );
                            const feature2 = alignDirectionToReference(
                                (endOffset ? offsetLineCoords(slice2, endOffset * unitKm) : slice2),
                                refCoords
                            );

                            const len1 = lineLengthKm(feature1);
                            const len2 = lineLengthKm(feature2);
                            coordinates = [];
                            for (let k = 0; k <= steps; k++) {
                                const t = k / steps;
                                const p1 = alongLine(feature1, len1 * t);
                                const p2 = alongLine(feature2, len2 * t);
                                const f = easeInOutQuad(t);
                                coordinates.push([
                                    p1[0] * (1 - f) + p2[0] * f,
                                    p1[1] * (1 - f) + p2[1] * f
                                ]);
                            }
                        }
                    }

                    // 兜底：若引用无法解析，则退回原始 coords
                    if (!coordinates) {
                        coordinates = refCoords.map((d) => d.slice());
                    }
                } else {
                    coordinates = refCoords.map((d) => d.slice());
                }

                // 连接去重：避免 concat 后端点重复导致的“短回折”
                if (Array.isArray(coordinates) && coordinates.length >= 2) {
                    if (out.length) {
                        const last = out[out.length - 1];
                        coordinates = applyJoinTranslationFix(last, coordinates, {
                            minFixMeters: 5,
                            maxFixMeters: 80,
                            blendPoints: 12
                        });

                        const first = coordinates[0];
                        if (approxDistanceMeters(last, first) < 5) {
                            coordinates = coordinates.slice(1);
                        }
                    }
                    out.push(...coordinates);
                }
            }

            // 如果完全没能生成，兜底用 railways.json 的 stations 顺序连线
            if (!disableFallback && out.length < 2) {
                const r = railwayById.get(railwayId);
                if (Array.isArray(r?.stations) && r.stations.length) {
                    const pts = [];
                    for (const sidRaw of r.stations) {
                        const sid = normalizeText(sidRaw);
                        const st = sid ? stationById.get(sid) : null;
                        const c = Array.isArray(st?.coord) ? st.coord : null;
                        const ll = coordsToLngLat(c);
                        if (ll) pts.push(ll);
                    }
                    if (pts.length >= 2) return pts;
                }
            }

            // 直通线路在地图上需要断开显示（仅影响渲染几何）
            const rule = DISPLAY_TRIM_RULES[railwayId];
            if (!disableDisplayTrim && rule && out.length >= 2) {
                const boundaryStation = stationById.get(rule.boundaryStationId);
                const keepStation = stationById.get(rule.keepSideNearStationId);
                const boundaryLL = coordsToLngLat(boundaryStation?.coord);
                const keepLL = coordsToLngLat(keepStation?.coord);
                if (boundaryLL && keepLL) {
                    const trimmed = trimLineAtStation(out, boundaryLL, keepLL);
                    return Array.isArray(trimmed) ? trimmed : out;
                }
            }

            return out;
        };

        // 需求：无视缩放比例，始终使用“最大比例最精细”的线路几何
        // 等价于固定使用 mini-tokyo-3d 的 zoom=18 生成策略。
        const ZOOMS = [18];
        const linesGeoJSONByZoom = {};
        const diagnosticsLargeGaps = [];
        const routingCoordsByRailwayId = new Map();

        for (const zoom of ZOOMS) {
            const unitKm = Math.pow(2, 14 - zoom) * 0.1; // 偏移
            const visibleFeatureLookup = new Map();
            const fullFeatureLookup = new Map();
            const features = [];

            for (const c of coordsRailways) {
                const id = normalizeText(c?.id);
                if (!id) continue;
                const lineOffsetUnits = Number(lineOffsetByRailwayId.get(id)) || 0;

                const meta = railwayById.get(id);
                const name = pickI18nTitle(meta?.title) || id;
                const color = railwayColorById.get(id) || normalizeText(c?.color) || null;
                const company = getCompanyFromRailwayId(id) || '未知公司';

                const coordinatesVisible = buildRailwayCoordinatesForZoom(
                    id,
                    c,
                    zoom,
                    unitKm,
                    visibleFeatureLookup,
                    {
                        includeOpacityZero: false,
                        disableFallback: false,
                        disableDisplayTrim: false
                    }
                );

                const coordinatesAll = buildRailwayCoordinatesForZoom(
                    id,
                    c,
                    zoom,
                    unitKm,
                    fullFeatureLookup,
                    {
                        includeOpacityZero: true,
                        disableFallback: false,
                        disableDisplayTrim: false
                    }
                );

                if (zoom === 18 && Array.isArray(coordinatesAll) && coordinatesAll.length >= 2) {
                    routingCoordsByRailwayId.set(id, coordinatesAll);
                }

                const coordinatesOpacityZero = buildRailwayCoordinatesForZoom(
                    id,
                    c,
                    zoom,
                    unitKm,
                    fullFeatureLookup,
                    {
                        onlyOpacityZero: true,
                        disableFallback: true,
                        disableDisplayTrim: true
                    }
                );

                const feature = {
                    type: 'Feature',
                    id: `${id}.${zoom}`,
                    properties: {
                        id,
                        name,
                        color,
                        company,
                        line_offset_units: lineOffsetUnits,
                        type: 'line',
                        hidden_by_opacity_zero: 0,
                        zoom
                    },
                    geometry: {
                        type: 'LineString',
                        coordinates: Array.isArray(coordinatesVisible) ? coordinatesVisible : []
                    }
                };

                fullFeatureLookup.set(id, {
                    type: 'Feature',
                    id: `${id}.${zoom}.all`,
                    properties: {
                        id,
                        name,
                        color,
                        company,
                        line_offset_units: lineOffsetUnits,
                        type: 'line',
                        hidden_by_opacity_zero: 1,
                        zoom
                    },
                    geometry: {
                        type: 'LineString',
                        coordinates: Array.isArray(coordinatesAll) ? coordinatesAll : []
                    }
                });

                visibleFeatureLookup.set(id, feature);
                if (id.startsWith('Base.')) {
                    continue;
                }

                if (Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length >= 2) {
                    // diagnostics：只在默认 zoom=15 统计一次即可
                    if (zoom === 15) {
                        const mx = maxAdjacentJumpMeters(feature.geometry.coordinates);
                        if (mx > LARGE_SPAN_JUMP_METERS) {
                            diagnosticsLargeGaps.push({
                                id,
                                titleZhHans: railwayZhHansById.get(id) || name,
                                maxJumpMeters: mx
                            });
                        }
                    }
                    features.push(feature);
                }

                if (Array.isArray(coordinatesOpacityZero) && coordinatesOpacityZero.length >= 2) {
                    features.push({
                        type: 'Feature',
                        id: `${id}.${zoom}.opacity0`,
                        properties: {
                            id,
                            name,
                            color,
                            company,
                            line_offset_units: lineOffsetUnits,
                            type: 'line',
                            hidden_by_opacity_zero: 1,
                            zoom
                        },
                        geometry: {
                            type: 'LineString',
                            coordinates: coordinatesOpacityZero
                        }
                    });
                }
            }

            linesGeoJSONByZoom[zoom] = { type: 'FeatureCollection', features };
        }

        // station 坐标“吸附”到所属线路几何上（类似 mini-tokyo-3d 的 nearestPointOnLine 思路）
        // 这样即便 stations.json 中多个同名站坐标相同（如 Tokyo），也会因线路几何不同而分开。
        const lineVisibleChainsByRailwayId = new Map();
        const lineAllChainsByRailwayId = new Map();
        const finestLines = linesGeoJSONByZoom[18];
        for (const f of finestLines?.features || []) {
            const rid = normalizeText(f?.properties?.id);
            const coords = f?.geometry?.coordinates;
            if (!rid || !Array.isArray(coords) || coords.length < 2) continue;
            if (!lineAllChainsByRailwayId.has(rid)) lineAllChainsByRailwayId.set(rid, []);
            lineAllChainsByRailwayId.get(rid).push(coords);

            const isHidden = Number(f?.properties?.hidden_by_opacity_zero) === 1;
            if (!isHidden) {
                if (!lineVisibleChainsByRailwayId.has(rid)) lineVisibleChainsByRailwayId.set(rid, []);
                lineVisibleChainsByRailwayId.get(rid).push(coords);
            }
        }

        const nearestPointOnChains = (chains, point) => {
            if (!Array.isArray(chains) || !chains.length || !point) return null;
            let best = null;
            for (const chain of chains) {
                if (!Array.isArray(chain) || chain.length < 2) continue;
                const hit = nearestPointOnLineSimple(chain, point);
                if (!hit || !Number.isFinite(hit.d2)) continue;
                if (!best || hit.d2 < best.d2) best = hit;
            }
            return best;
        };

        const MAX_STATION_SNAP_METERS = 2500;
        const MAX_STATION_LOAD_DISTANCE_METERS = 500;

        const stationsFeatures = [];
        for (const s of stationList) {
            const id = normalizeText(s?.id);
            const railwayId = normalizeText(s?.railway);
            const coord = Array.isArray(s?.coord) ? s.coord : null;
            const ll = coordsToLngLat(coord);
            if (!id || !railwayId || !ll) continue;

            // 过滤：若站点距“所属线路（railwayId）的任一线段”超过阈值，则不加载该站点。
            // 这样地图渲染与搜索索引都会一起剔除。
            const lineChainsForFilter = lineAllChainsByRailwayId.get(railwayId);
            if (Array.isArray(lineChainsForFilter) && lineChainsForFilter.length) {
                const nearestForFilter = nearestPointOnChains(lineChainsForFilter, ll);
                const d2 = nearestForFilter?.d2;
                if (Number.isFinite(d2)) {
                    const distMeters = Math.sqrt(Math.max(0, d2));
                    if (distMeters > MAX_STATION_LOAD_DISTANCE_METERS) {
                        continue;
                    }
                }
            }

            let snapped = ll;
            const lineChainsAll = lineAllChainsByRailwayId.get(railwayId);
            if (Array.isArray(lineChainsAll) && lineChainsAll.length) {
                const nearest = nearestPointOnChains(lineChainsAll, ll);
                const projected = nearest?.point;
                if (Array.isArray(projected) && projected.length >= 2) {
                    const d = approxDistanceMeters(ll, projected);
                    if (Number.isFinite(d) && d <= MAX_STATION_SNAP_METERS) {
                        snapped = projected;
                    }
                }
            }

            const lineChainsVisible = lineVisibleChainsByRailwayId.get(railwayId);
            let hiddenByOpacityZero = 0;
            if (Array.isArray(lineChainsVisible) && lineChainsVisible.length) {
                const nearestVisible = nearestPointOnChains(lineChainsVisible, ll);
                const d2Visible = nearestVisible?.d2;
                if (Number.isFinite(d2Visible)) {
                    const distVisible = Math.sqrt(Math.max(0, d2Visible));
                    hiddenByOpacityZero = distVisible > MAX_STATION_LOAD_DISTANCE_METERS ? 1 : 0;
                }
            } else {
                hiddenByOpacityZero = 1;
            }

            const title = s?.title || {};
            const nameZh = normalizeText(title['zh-Hans']) || normalizeText(title['zh']) || normalizeText(title.en) || normalizeText(title.ja);
            const nameJa = normalizeText(title.ja);
            const nameEn = normalizeText(title.en);

            const stationLineId = getLineIdFromStationNodeId(id) || railwayId;
            if (isDirectHiddenStationMembership(id, stationLineId)) continue;

            const servingSet = servingRailwayIdsByStationId.get(id);
            const servingIds = (servingSet && servingSet.size ? Array.from(servingSet) : [stationLineId])
                .map((value) => normalizeText(value))
                .filter((lineId) => lineId && !isHiddenServingMembership(id, lineId));
            if (
                stationLineId &&
                !isHiddenServingMembership(id, stationLineId) &&
                !servingIds.includes(stationLineId)
            ) {
                servingIds.push(stationLineId);
            }
            if (!servingIds.length) continue;
            servingIds.sort((a, b) => String(a).localeCompare(String(b)));

            const platformLineName = railwayNameById.get(stationLineId) || railwayNameById.get(railwayId) || stationLineId;
            const platformColor = railwayColorById.get(stationLineId) || railwayColorById.get(railwayId) || null;

            stationsFeatures.push({
                type: 'Feature',
                id,
                properties: {
                    id,
                    name: nameZh || nameJa || nameEn || id,
                    name_ja: nameJa || null,
                    name_zh: nameZh || null,
                    type: 'station',
                    platform_line: [platformLineName],
                    platform_line_id: [stationLineId],
                    serving_ids: servingIds,
                    line_colors: platformColor ? [platformColor] : [],
                    hidden_by_opacity_zero: hiddenByOpacityZero
                },
                geometry: {
                    type: 'Point',
                    coordinates: snapped
                }
            });
        }

        const stationOffsetAlgorithmContext = buildStationOffsetAlgorithmContext({
            stationFeatures: stationsFeatures,
            lineOffsetByRailwayId,
            lineChainsByRailwayId: lineAllChainsByRailwayId,
            options: {
                maxNearestDistancePxAtZoom12: 24
            }
        });

        return {
            // 固定使用 zoom=18 的最精细几何
            linesGeoJSON: linesGeoJSONByZoom[18] || { type: 'FeatureCollection', features: [] },
            linesGeoJSONByZoom,
            lineNameLabelsGeoJSON: buildLineNameLabelGeoJSON(linesGeoJSONByZoom[18]?.features || []),
            lineRoutingCoordsById: Object.fromEntries(Array.from(routingCoordsByRailwayId.entries())),
            stationsGeoJSON: { type: 'FeatureCollection', features: stationsFeatures },
            stationGroups: filteredStationGroups,
            rawRailways: railwayList,
            rawStations: stationList,
            alternateLineMembership,
            stationOffsetAlgorithmContext,
            diagnostics: {
                // 可能包含重复 id；打印时建议按 id 做 max 聚合
                largeGaps: diagnosticsLargeGaps
            }
        };
    })();

    return railDataCachePromise;
}
