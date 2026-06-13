import { ELEMENT_UI_CONSTANTS, buildHighlightLineWidthScaledExpr } from './element_ui.js';
import { HIGHLIGHT_STYLE_CONFIG } from './highlight_style_config.js';

const toText = (v) => String(v ?? '').trim();
const TRANSFER_CAPSULE_SIZE = Object.freeze({
    outlineLineWidth: [12, 24],
    innerLineWidth: [8, 14],
    dotRadius: [
        ELEMENT_UI_CONSTANTS.stationBaseRadius,
        ELEMENT_UI_CONSTANTS.stationBaseRadiusAtMaxZoom
    ],
    fallbackOutlineRadius: [6.8, 11.5],
    fallbackInnerRadius: [5.0, 8.6]
});

const getLineBasedSizeScale = (key, fallback) => {
    const value = Number(HIGHLIGHT_STYLE_CONFIG.lineBasedSizes?.[key]);
    return Number.isFinite(value) ? value : fallback;
};

const isMapEngineLike = (value) => Boolean(
    value
    && typeof value.addLayer === 'function'
    && typeof value.addSource === 'function'
    && typeof value.getLayer === 'function'
);

const resolveMapAdapter = (mapOrEngine) => ({
    addLayer: (...args) => mapOrEngine?.addLayer?.(...args),
    addSource: (...args) => mapOrEngine?.addSource?.(...args),
    getLayer: (layerId) => mapOrEngine?.getLayer?.(layerId),
    getSource: (sourceId) => mapOrEngine?.getSource?.(sourceId),
    hasLayer: (layerId) => (
        isMapEngineLike(mapOrEngine) && typeof mapOrEngine.hasLayer === 'function'
            ? mapOrEngine.hasLayer(layerId)
            : Boolean(layerId && mapOrEngine?.getLayer?.(layerId))
    ),
    setFilter: (...args) => mapOrEngine?.setFilter?.(...args),
    setPaintProperty: (...args) => mapOrEngine?.setPaintProperty?.(...args),
    setSourceData: (sourceId, data) => {
        if (typeof mapOrEngine?.setSourceData === 'function') {
            return mapOrEngine.setSourceData(sourceId, data);
        }
        const source = mapOrEngine?.getSource?.(sourceId);
        source?.setData?.(data);
        return source;
    }
});

const buildZoomBasedExponentialSizeExpr = (sizeAtZoom12, sizeAtZoom16, options = {}) => {
    const zBase = Number.isFinite(options.zoomBase) ? Number(options.zoomBase) : 12;
    const zMax = Number.isFinite(options.zoomMax) ? Number(options.zoomMax) : 16;
    const interpBase = Number.isFinite(options.interpolationBase) ? Number(options.interpolationBase) : 2;
    const minScaleAtZoom0 = Number.isFinite(options.minScaleAtZoom0)
        ? Math.max(0, Number(options.minScaleAtZoom0))
        : 1;

    const baseSize = Number(sizeAtZoom12);
    const maxSize = Number(sizeAtZoom16);
    const zoomDelta = zMax - zBase;

    if (!(Number.isFinite(baseSize) && Number.isFinite(maxSize) && baseSize > 0 && maxSize > 0 && Number.isFinite(zoomDelta) && zoomDelta > 0)) {
        return baseSize;
    }

    const growthPerZoom = Math.pow(maxSize / baseSize, 1 / zoomDelta);
    const sizeAtZoom0 = baseSize * Math.pow(growthPerZoom, -zBase) * minScaleAtZoom0;

    return [
        'interpolate',
        ['exponential', interpBase],
        ['zoom'],
        0, sizeAtZoom0,
        zBase, baseSize,
        zMax, maxSize
    ];
};

const normalizeGroupChunks = (group) => {
    if (!Array.isArray(group)) return [];

    const ids = [];
    const seen = new Set();
    for (const chunk of group) {
        if (!Array.isArray(chunk)) continue;
        for (const raw of chunk) {
            const id = toText(raw);
            if (!id || seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
        }
    }
    return ids;
};

const euclideanDistanceSqLngLat = (a, b) => {
    const dx = Number(a?.[0]) - Number(b?.[0]);
    const dy = Number(a?.[1]) - Number(b?.[1]);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return Number.POSITIVE_INFINITY;
    return dx * dx + dy * dy;
};

const buildMstEdges = (points) => {
    const n = Array.isArray(points) ? points.length : 0;
    if (n <= 1) return [];

    const visited = new Set([0]);
    const edges = [];

    while (visited.size < n) {
        let bestFrom = -1;
        let bestTo = -1;
        let bestDist = Number.POSITIVE_INFINITY;

        for (const i of visited) {
            const from = points[i]?.coordinates;
            if (!Array.isArray(from) || from.length < 2) continue;

            for (let j = 0; j < n; j += 1) {
                if (visited.has(j)) continue;
                const to = points[j]?.coordinates;
                if (!Array.isArray(to) || to.length < 2) continue;

                const d = euclideanDistanceSqLngLat(from, to);
                if (d < bestDist) {
                    bestDist = d;
                    bestFrom = i;
                    bestTo = j;
                }
            }
        }

        if (bestFrom < 0 || bestTo < 0) break;
        visited.add(bestTo);
        edges.push([bestFrom, bestTo]);
    }

    return edges;
};

const pickGroupDisplayName = (features) => {
    const count = new Map();
    let fallback = '';

    for (const f of features) {
        const p = f?.properties || {};
        const name = toText(p?.name_zh || p?.name || p?.name_ja || '');
        if (!name) continue;
        if (!fallback) fallback = name;
        count.set(name, (count.get(name) || 0) + 1);
    }

    if (!count.size) return fallback;
    let bestName = fallback;
    let bestCount = -1;
    for (const [name, n] of count.entries()) {
        if (n > bestCount) {
            bestName = name;
            bestCount = n;
        }
    }
    return bestName;
};

const normalizeArrayLike = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        const s = value.trim();
        if (!s) return [];
        if (s.startsWith('[') && s.endsWith(']')) {
            try {
                const parsed = JSON.parse(s);
                return Array.isArray(parsed) ? parsed : [value];
            } catch {
                return [value];
            }
        }
        return [s];
    }
    return value != null ? [value] : [];
};

const getPrimaryLineIdFromStationProps = (props) => {
    const p = props || {};
    const platformIds = normalizeArrayLike(p.platform_line_id).map((x) => toText(x)).filter(Boolean);
    if (platformIds.length) return platformIds[0];
    const servingIds = normalizeArrayLike(p.serving_ids).map((x) => toText(x)).filter(Boolean);
    return servingIds.length ? servingIds[0] : '';
};

export function buildTransferCapsuleConnectionOrder(stationsData, stationGroups) {
    const stationFeatures = Array.isArray(stationsData?.features) ? stationsData.features : [];
    const groups = Array.isArray(stationGroups) ? stationGroups : [];

    const byId = new Map();
    for (const f of stationFeatures) {
        if (f?.geometry?.type !== 'Point') continue;
        const coords = f.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        const p = f?.properties || {};
        const id = toText(p?.id || f?.id);
        if (!id) continue;
        byId.set(id, [lng, lat]);
    }

    const fixedConnectionsByGroupId = {};

    for (const rawGroup of groups) {
        const ids = normalizeGroupChunks(rawGroup);
        if (ids.length < 2) continue;

        const groupId = ids.slice().sort().join('|');
        if (!groupId) continue;

        const points = ids
            .map((stationId) => ({ stationId, coordinates: byId.get(stationId) }))
            .filter((x) => Array.isArray(x.coordinates) && x.coordinates.length >= 2);

        if (points.length < 2) {
            fixedConnectionsByGroupId[groupId] = [];
            continue;
        }

        const mst = buildMstEdges(points);
        fixedConnectionsByGroupId[groupId] = mst
            .map(([i, j]) => {
                const a = points[i]?.stationId;
                const b = points[j]?.stationId;
                if (!a || !b || a === b) return null;
                return [a, b];
            })
            .filter(Boolean);
    }

    return fixedConnectionsByGroupId;
}

export function buildTransferCapsuleGeoJSON(stationsData, stationGroups, options = {}) {
    const stationFeatures = Array.isArray(stationsData?.features) ? stationsData.features : [];
    const groups = Array.isArray(stationGroups) ? stationGroups : [];
    const visibleStationIds = options?.visibleStationIds instanceof Set ? options.visibleStationIds : null;

    const byId = new Map();
    for (const f of stationFeatures) {
        if (f?.geometry?.type !== 'Point') continue;
        const coords = f.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;
        const p = f?.properties || {};
        const id = toText(p?.id || f?.id);
        if (!id) continue;
        byId.set(id, f);
    }

    const lineFeatures = [];
    const centroidFeatures = [];
    const dotFeatures = [];
    const useSingleStationFallbackCircle = options?.singleStationFallbackCircle !== false;
    const fixedConnectionsByGroupId = options?.fixedConnectionsByGroupId && typeof options.fixedConnectionsByGroupId === 'object'
        ? options.fixedConnectionsByGroupId
        : null;
    const resolveLineColor = typeof options.resolveLineColor === 'function'
        ? options.resolveLineColor
        : (() => '');

    for (const rawGroup of groups) {
        const ids = normalizeGroupChunks(rawGroup);
        if (ids.length < 2) continue;

        const pickedIds = visibleStationIds
            ? ids.filter((id) => visibleStationIds.has(id))
            : ids;

        if (!pickedIds.length) continue;

        const features = pickedIds.map((id) => byId.get(id)).filter(Boolean);
        if (!features.length) continue;

        const groupId = ids.slice().sort().join('|');
        const name = pickGroupDisplayName(features) || pickedIds[0];

        const points = features.map((f) => {
            const p = f?.properties || {};
            const stationId = toText(p?.id || f?.id);
            const primaryLineId = getPrimaryLineIdFromStationProps(p);
            const dotColor = toText(p?.color || resolveLineColor(primaryLineId) || '') || '#666';
            return {
                stationId,
                coordinates: [Number(f.geometry.coordinates[0]), Number(f.geometry.coordinates[1])],
                primaryLineId,
                dotColor,
                feature: f
            };
        }).filter((x) => Number.isFinite(x.coordinates[0]) && Number.isFinite(x.coordinates[1]));

        if (!points.length) continue;

        for (const point of points) {
            dotFeatures.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: point.coordinates.slice() },
                properties: {
                    groupId,
                    name,
                    stationId: point.stationId,
                    lineId: point.primaryLineId || '',
                    dotColor: point.dotColor || '#666',
                    transferCapsuleDot: 1
                }
            });
        }

        // 1. 检查当前 group 内的所有点是否在同一个物理坐标上
        let isSameLocation = true;
        if (points.length > 1) {
            const firstCoord = points[0].coordinates;
            for (let i = 1; i < points.length; i++) {
                // 允许极小的浮点数误差，防范精度问题
                if (euclideanDistanceSqLngLat(firstCoord, points[i].coordinates) > 1e-12) {
                    isSameLocation = false;
                    break;
                }
            }
        }

        // 2. 如果只有1个点，或者虽然有多个点但坐标完全重合 -> 触发黑边白圆换乘站样式
        if ((points.length === 1 || isSameLocation) && useSingleStationFallbackCircle) {
            const center = points[0].coordinates;
            centroidFeatures.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: center.slice() },
                properties: {
                    groupId,
                    name,
                    stationCount: points.length, // 保留真实的车站数量
                    fallbackCircle: 1            // 核心：告诉 MapLibre 渲染器画黑边白圆
                }
            });
            continue; // 提前结束当前 group，不再往下画线
        }

        if (points.length < 2) continue;

        let edges = [];
        if (fixedConnectionsByGroupId && Array.isArray(fixedConnectionsByGroupId[groupId])) {
            const indexByStationId = new Map();
            for (let i = 0; i < points.length; i += 1) {
                const stationId = toText(points[i]?.stationId);
                if (!stationId) continue;
                indexByStationId.set(stationId, i);
            }

            const seenPairs = new Set();
            for (const pair of fixedConnectionsByGroupId[groupId]) {
                if (!Array.isArray(pair) || pair.length < 2) continue;
                const aId = toText(pair[0]);
                const bId = toText(pair[1]);
                if (!aId || !bId || aId === bId) continue;
                if (!indexByStationId.has(aId) || !indexByStationId.has(bId)) continue;
                const ia = indexByStationId.get(aId);
                const ib = indexByStationId.get(bId);
                if (!(Number.isInteger(ia) && Number.isInteger(ib)) || ia === ib) continue;
                const key = ia < ib ? `${ia}|${ib}` : `${ib}|${ia}`;
                if (seenPairs.has(key)) continue;
                seenPairs.add(key);
                edges.push([ia, ib]);
            }
        }

        if (!edges.length) {
            edges = buildMstEdges(points);
        }
        if (!edges.length) continue;

        let sumLng = 0;
        let sumLat = 0;
        for (const p of points) {
            sumLng += p.coordinates[0];
            sumLat += p.coordinates[1];
        }

        for (const [i, j] of edges) {
            const a = points[i]?.coordinates;
            const b = points[j]?.coordinates;
            if (!a || !b) continue;
            lineFeatures.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [a.slice(), b.slice()]
                },
                properties: {
                    groupId,
                    name,
                    lineId: points[i]?.primaryLineId || '',
                    edgeColor: points[i]?.dotColor || '#999'
                }
            });
        }

        const centroid = [sumLng / points.length, sumLat / points.length];
        centroidFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: centroid },
            properties: {
                groupId,
                name,
                stationCount: points.length
            }
        });
    }

    return {
        lines: {
            type: 'FeatureCollection',
            features: lineFeatures
        },
        centroids: {
            type: 'FeatureCollection',
            features: centroidFeatures
        },
        dots: {
            type: 'FeatureCollection',
            features: dotFeatures
        }
    };
}

export function addTransferCapsuleLayers(mapOrEngine, data, options = {}) {
    const mapAdapter = resolveMapAdapter(mapOrEngine);
    const ids = {
        lineSourceId: options.lineSourceId || 'transfer-capsule-lines-source',
        centroidSourceId: options.centroidSourceId || 'transfer-capsule-centroids-source',
        dotSourceId: options.dotSourceId || 'transfer-capsule-dots-source',
        slaveOutlineLayerId: options.slaveOutlineLayerId || 'transfer-capsule-outline-layer',
        slaveInnerLayerId: options.slaveInnerLayerId || 'transfer-capsule-inner-layer',
        dotLayerId: options.dotLayerId || 'transfer-capsule-dot-layer',
        fallbackCircleOutlineLayerId: options.fallbackCircleOutlineLayerId || 'transfer-capsule-fallback-circle-outline-layer',
        fallbackCircleInnerLayerId: options.fallbackCircleInnerLayerId || 'transfer-capsule-fallback-circle-inner-layer',
        masterLayerId: options.masterLayerId || 'transfer-capsule-master-layer'
    };

    const beforeLayerId = options.beforeLayerId || 'stations-layer';
    const minZoom = Number.isFinite(options.minZoom) ? Number(options.minZoom) : 8;
    const highlightStyle = options.highlightStyle === true;
    const capsuleOutlineLineWidthExpr = highlightStyle
        ? buildHighlightLineWidthScaledExpr(getLineBasedSizeScale('capsuleOutlineLineWidthScale', 1.8))
        : buildZoomBasedExponentialSizeExpr(...TRANSFER_CAPSULE_SIZE.outlineLineWidth);
    const capsuleInnerLineWidthExpr = highlightStyle
        ? buildHighlightLineWidthScaledExpr(getLineBasedSizeScale('capsuleInnerLineWidthScale', 1.25))
        : buildZoomBasedExponentialSizeExpr(...TRANSFER_CAPSULE_SIZE.innerLineWidth);
    const capsuleDotRadiusExpr = highlightStyle
        ? buildHighlightLineWidthScaledExpr(getLineBasedSizeScale('capsuleDotRadiusScale', 0.5))
        : buildZoomBasedExponentialSizeExpr(...TRANSFER_CAPSULE_SIZE.dotRadius);
    const capsuleFallbackOutlineRadiusExpr = highlightStyle
        ? buildHighlightLineWidthScaledExpr(getLineBasedSizeScale('capsuleFallbackOutlineRadiusScale', 0.75))
        : buildZoomBasedExponentialSizeExpr(...TRANSFER_CAPSULE_SIZE.fallbackOutlineRadius);
    const capsuleFallbackInnerRadiusExpr = highlightStyle
        ? buildHighlightLineWidthScaledExpr(getLineBasedSizeScale('capsuleFallbackInnerRadiusScale', 0.55))
        : buildZoomBasedExponentialSizeExpr(...TRANSFER_CAPSULE_SIZE.fallbackInnerRadius);

    // If the requested before layer does not exist yet, avoid passing it to addLayer to
    // prevent MapLibre from throwing. We'll add layers at the top-level in that case.
    const insertBefore = mapAdapter.hasLayer(beforeLayerId) ? beforeLayerId : undefined;

    if (!mapAdapter.getSource(ids.lineSourceId)) {
        mapAdapter.addSource(ids.lineSourceId, {
            type: 'geojson',
            data: data?.lines || { type: 'FeatureCollection', features: [] },
            tolerance: 0,
            buffer: 0
        });
    } else {
        mapAdapter.setSourceData(ids.lineSourceId, data?.lines || { type: 'FeatureCollection', features: [] });
    }

    if (!mapAdapter.getSource(ids.centroidSourceId)) {
        mapAdapter.addSource(ids.centroidSourceId, {
            type: 'geojson',
            data: data?.centroids || { type: 'FeatureCollection', features: [] }
        });
    } else {
        mapAdapter.setSourceData(ids.centroidSourceId, data?.centroids || { type: 'FeatureCollection', features: [] });
    }

    if (!mapAdapter.getSource(ids.dotSourceId)) {
        mapAdapter.addSource(ids.dotSourceId, {
            type: 'geojson',
            data: data?.dots || { type: 'FeatureCollection', features: [] }
        });
    } else {
        mapAdapter.setSourceData(ids.dotSourceId, data?.dots || { type: 'FeatureCollection', features: [] });
    }

    const getThemeCapsuleColors = () => {
        try {
            const theme = String(document.documentElement.getAttribute('data-theme') || '').trim();
            const isDark = theme === 'dark';
            return {
                outline: isDark ? '#fff' : '#111',
                inner: isDark ? '#111' : '#fff'
            };
        } catch {
            return { outline: '#111', inner: '#fff' };
        }
    };

    const applyCapsulePaintColors = () => {
        const cols = getThemeCapsuleColors();
        if (mapAdapter.hasLayer(ids.slaveOutlineLayerId)) {
            try { mapAdapter.setPaintProperty(ids.slaveOutlineLayerId, 'line-color', cols.outline); } catch {}
            try { mapAdapter.setPaintProperty(ids.slaveOutlineLayerId, 'line-opacity', 1); } catch {}
        }
        if (mapAdapter.hasLayer(ids.slaveInnerLayerId)) {
            try { mapAdapter.setPaintProperty(ids.slaveInnerLayerId, 'line-color', cols.inner); } catch {}
            try { mapAdapter.setPaintProperty(ids.slaveInnerLayerId, 'line-opacity', 1); } catch {}
        }
        if (mapAdapter.hasLayer(ids.fallbackCircleOutlineLayerId)) {
            try { mapAdapter.setPaintProperty(ids.fallbackCircleOutlineLayerId, 'circle-color', cols.outline); } catch {}
            try { mapAdapter.setPaintProperty(ids.fallbackCircleOutlineLayerId, 'circle-opacity', 1); } catch {}
        }
        if (mapAdapter.hasLayer(ids.fallbackCircleInnerLayerId)) {
            try { mapAdapter.setPaintProperty(ids.fallbackCircleInnerLayerId, 'circle-color', cols.inner); } catch {}
            try { mapAdapter.setPaintProperty(ids.fallbackCircleInnerLayerId, 'circle-opacity', 1); } catch {}
        }
    };

    // 监听页面层主题变化（app.js 会触发 __TokyoRailThemeChanged 事件）以更新颜色
    try {
        if (typeof window !== 'undefined' && window && !window.__TokyoRailCapsuleThemeHooked) {
            window.addEventListener('__TokyoRailThemeChanged', () => {
                applyCapsulePaintColors();
            });
            window.__TokyoRailCapsuleThemeHooked = true;
        }
    } catch {
        // ignore
    }

    if (!mapAdapter.hasLayer(ids.slaveOutlineLayerId)) {
        const layerDef = {
            id: ids.slaveOutlineLayerId,
            type: 'line',
            source: ids.lineSourceId,
            minzoom: minZoom,
            filter: ['!=', ['get', 'fallbackCircle'], 1],
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': getThemeCapsuleColors().outline,
                'line-opacity': 1,
                'line-width': capsuleOutlineLineWidthExpr
            }
        };
        if (insertBefore) mapAdapter.addLayer(layerDef, insertBefore); else mapAdapter.addLayer(layerDef);
    } else {
        mapAdapter.setPaintProperty(ids.slaveOutlineLayerId, 'line-color', getThemeCapsuleColors().outline);
        mapAdapter.setPaintProperty(ids.slaveOutlineLayerId, 'line-opacity', 1);
        mapAdapter.setPaintProperty(ids.slaveOutlineLayerId, 'line-width', capsuleOutlineLineWidthExpr);
        mapAdapter.setFilter(ids.slaveOutlineLayerId, ['!=', ['get', 'fallbackCircle'], 1]);
    }

    if (!mapAdapter.hasLayer(ids.slaveInnerLayerId)) {
        const layerDef = {
            id: ids.slaveInnerLayerId,
            type: 'line',
            source: ids.lineSourceId,
            minzoom: minZoom,
            filter: ['!=', ['get', 'fallbackCircle'], 1],
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': getThemeCapsuleColors().inner,
                'line-opacity': 1,
                'line-width': capsuleInnerLineWidthExpr
            }
        };
        if (insertBefore) mapAdapter.addLayer(layerDef, insertBefore); else mapAdapter.addLayer(layerDef);
    } else {
        mapAdapter.setPaintProperty(ids.slaveInnerLayerId, 'line-color', getThemeCapsuleColors().inner);
        mapAdapter.setPaintProperty(ids.slaveInnerLayerId, 'line-opacity', 1);
        mapAdapter.setPaintProperty(ids.slaveInnerLayerId, 'line-width', capsuleInnerLineWidthExpr);
        mapAdapter.setFilter(ids.slaveInnerLayerId, ['!=', ['get', 'fallbackCircle'], 1]);
    }

    if (!mapAdapter.hasLayer(ids.dotLayerId)) {
        const layerDef = {
            id: ids.dotLayerId,
            type: 'circle',
            source: ids.dotSourceId,
            minzoom: minZoom,
            paint: {
                'circle-color': ['coalesce', ['get', 'dotColor'], '#666'],
                'circle-opacity': 1,
                'circle-radius': capsuleDotRadiusExpr,
                'circle-stroke-width': 0
            }
        };
        if (insertBefore) mapAdapter.addLayer(layerDef, insertBefore); else mapAdapter.addLayer(layerDef);
    } else {
        mapAdapter.setPaintProperty(ids.dotLayerId, 'circle-color', ['coalesce', ['get', 'dotColor'], '#666']);
        mapAdapter.setPaintProperty(ids.dotLayerId, 'circle-opacity', 1);
        mapAdapter.setPaintProperty(ids.dotLayerId, 'circle-radius', capsuleDotRadiusExpr);
        mapAdapter.setPaintProperty(ids.dotLayerId, 'circle-stroke-width', 0);
    }

    if (!mapAdapter.hasLayer(ids.fallbackCircleOutlineLayerId)) {
        const layerDef = {
            id: ids.fallbackCircleOutlineLayerId,
            type: 'circle',
            source: ids.centroidSourceId,
            minzoom: minZoom,
            filter: ['==', ['get', 'fallbackCircle'], 1],
            paint: {
                'circle-color': getThemeCapsuleColors().outline,
                'circle-opacity': 1,
                'circle-radius': capsuleFallbackOutlineRadiusExpr
            }
        };
        if (insertBefore) mapAdapter.addLayer(layerDef, insertBefore); else mapAdapter.addLayer(layerDef);
    } else {
        mapAdapter.setPaintProperty(ids.fallbackCircleOutlineLayerId, 'circle-color', getThemeCapsuleColors().outline);
        mapAdapter.setPaintProperty(ids.fallbackCircleOutlineLayerId, 'circle-opacity', 1);
        mapAdapter.setPaintProperty(ids.fallbackCircleOutlineLayerId, 'circle-radius', capsuleFallbackOutlineRadiusExpr);
        mapAdapter.setFilter(ids.fallbackCircleOutlineLayerId, ['==', ['get', 'fallbackCircle'], 1]);
    }

    if (!mapAdapter.hasLayer(ids.fallbackCircleInnerLayerId)) {
        const layerDef = {
            id: ids.fallbackCircleInnerLayerId,
            type: 'circle',
            source: ids.centroidSourceId,
            minzoom: minZoom,
            filter: ['==', ['get', 'fallbackCircle'], 1],
            paint: {
                'circle-color': getThemeCapsuleColors().inner,
                'circle-opacity': 1,
                'circle-radius': capsuleFallbackInnerRadiusExpr
            }
        };
        if (insertBefore) mapAdapter.addLayer(layerDef, insertBefore); else mapAdapter.addLayer(layerDef);
    } else {
        mapAdapter.setPaintProperty(ids.fallbackCircleInnerLayerId, 'circle-color', getThemeCapsuleColors().inner);
        mapAdapter.setPaintProperty(ids.fallbackCircleInnerLayerId, 'circle-opacity', 1);
        mapAdapter.setPaintProperty(ids.fallbackCircleInnerLayerId, 'circle-radius', capsuleFallbackInnerRadiusExpr);
        mapAdapter.setFilter(ids.fallbackCircleInnerLayerId, ['==', ['get', 'fallbackCircle'], 1]);
    }

    if (!mapAdapter.hasLayer(ids.masterLayerId)) {
        mapAdapter.addLayer({
            id: ids.masterLayerId,
            type: 'circle',
            source: ids.centroidSourceId,
            minzoom: minZoom,
            paint: {
                'circle-radius': 1,
                'circle-color': '#000',
                'circle-opacity': 0,
                'circle-stroke-width': 0
            }
        });
    }

    return ids;
}
