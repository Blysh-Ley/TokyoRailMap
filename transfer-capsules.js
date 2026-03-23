const toText = (v) => String(v ?? '').trim();

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
    const useSingleStationFallbackCircle = options?.singleStationFallbackCircle !== false;
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

        const groupId = pickedIds.slice().sort().join('|');
        const name = pickGroupDisplayName(features) || pickedIds[0];

        const points = features.map((f) => {
            const p = f?.properties || {};
            const stationId = toText(p?.id || f?.id);
            const primaryLineId = getPrimaryLineIdFromStationProps(p);
            const dotColor = toText(resolveLineColor(primaryLineId) || '') || '#666';
            return {
                stationId,
                coordinates: [Number(f.geometry.coordinates[0]), Number(f.geometry.coordinates[1])],
                primaryLineId,
                dotColor,
                feature: f
            };
        }).filter((x) => Number.isFinite(x.coordinates[0]) && Number.isFinite(x.coordinates[1]));

        if (!points.length) continue;

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

        const edges = buildMstEdges(points);
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
        }
    };
}

export function addTransferCapsuleLayers(map, data, options = {}) {
    const ids = {
        lineSourceId: options.lineSourceId || 'transfer-capsule-lines-source',
        centroidSourceId: options.centroidSourceId || 'transfer-capsule-centroids-source',
        slaveOutlineLayerId: options.slaveOutlineLayerId || 'transfer-capsule-outline-layer',
        slaveInnerLayerId: options.slaveInnerLayerId || 'transfer-capsule-inner-layer',
        fallbackCircleOutlineLayerId: options.fallbackCircleOutlineLayerId || 'transfer-capsule-fallback-circle-outline-layer',
        fallbackCircleInnerLayerId: options.fallbackCircleInnerLayerId || 'transfer-capsule-fallback-circle-inner-layer',
        masterLayerId: options.masterLayerId || 'transfer-capsule-master-layer'
    };

    const beforeLayerId = options.beforeLayerId || 'stations-layer';
    const minZoom = Number.isFinite(options.minZoom) ? Number(options.minZoom) : 8;

    // If the requested before layer does not exist yet, avoid passing it to map.addLayer to
    // prevent MapLibre from throwing. We'll add layers at the top-level in that case.
    const insertBefore = map.getLayer(beforeLayerId) ? beforeLayerId : undefined;

    if (!map.getSource(ids.lineSourceId)) {
        map.addSource(ids.lineSourceId, {
            type: 'geojson',
            data: data?.lines || { type: 'FeatureCollection', features: [] },
            tolerance: 0,
            buffer: 0
        });
    } else {
        map.getSource(ids.lineSourceId).setData(data?.lines || { type: 'FeatureCollection', features: [] });
    }

    if (!map.getSource(ids.centroidSourceId)) {
        map.addSource(ids.centroidSourceId, {
            type: 'geojson',
            data: data?.centroids || { type: 'FeatureCollection', features: [] }
        });
    } else {
        map.getSource(ids.centroidSourceId).setData(data?.centroids || { type: 'FeatureCollection', features: [] });
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
        if (map.getLayer(ids.slaveOutlineLayerId)) {
            try { map.setPaintProperty(ids.slaveOutlineLayerId, 'line-color', cols.outline); } catch {}
            try { map.setPaintProperty(ids.slaveOutlineLayerId, 'line-opacity', 1); } catch {}
        }
        if (map.getLayer(ids.slaveInnerLayerId)) {
            try { map.setPaintProperty(ids.slaveInnerLayerId, 'line-color', cols.inner); } catch {}
            try { map.setPaintProperty(ids.slaveInnerLayerId, 'line-opacity', 1); } catch {}
        }
        if (map.getLayer(ids.fallbackCircleOutlineLayerId)) {
            try { map.setPaintProperty(ids.fallbackCircleOutlineLayerId, 'circle-color', cols.outline); } catch {}
            try { map.setPaintProperty(ids.fallbackCircleOutlineLayerId, 'circle-opacity', 1); } catch {}
        }
        if (map.getLayer(ids.fallbackCircleInnerLayerId)) {
            try { map.setPaintProperty(ids.fallbackCircleInnerLayerId, 'circle-color', cols.inner); } catch {}
            try { map.setPaintProperty(ids.fallbackCircleInnerLayerId, 'circle-opacity', 1); } catch {}
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

    if (!map.getLayer(ids.slaveOutlineLayerId)) {
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
                'line-width': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 12,
                    12, 12,
                    16, 24
                ]
            }
        };
        if (insertBefore) map.addLayer(layerDef, insertBefore); else map.addLayer(layerDef);
    } else {
        map.setPaintProperty(ids.slaveOutlineLayerId, 'line-color', getThemeCapsuleColors().outline);
        map.setPaintProperty(ids.slaveOutlineLayerId, 'line-opacity', 1);
        map.setPaintProperty(ids.slaveOutlineLayerId, 'line-width', [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 12,
            12, 12,
            16, 24
        ]);
        map.setFilter(ids.slaveOutlineLayerId, ['!=', ['get', 'fallbackCircle'], 1]);
    }

    if (!map.getLayer(ids.slaveInnerLayerId)) {
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
                'line-width': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 8,
                    12, 8,
                    16, 14
                ]
            }
        };
        if (insertBefore) map.addLayer(layerDef, insertBefore); else map.addLayer(layerDef);
    } else {
        map.setPaintProperty(ids.slaveInnerLayerId, 'line-color', getThemeCapsuleColors().inner);
        map.setPaintProperty(ids.slaveInnerLayerId, 'line-opacity', 1);
        map.setPaintProperty(ids.slaveInnerLayerId, 'line-width', [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 8,
            12, 8,
            16, 14
        ]);
        map.setFilter(ids.slaveInnerLayerId, ['!=', ['get', 'fallbackCircle'], 1]);
    }

    if (!map.getLayer(ids.fallbackCircleOutlineLayerId)) {
        const layerDef = {
            id: ids.fallbackCircleOutlineLayerId,
            type: 'circle',
            source: ids.centroidSourceId,
            minzoom: minZoom,
            filter: ['==', ['get', 'fallbackCircle'], 1],
            paint: {
                'circle-color': getThemeCapsuleColors().outline,
                'circle-opacity': 1,
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 6.8,
                    12, 6.8,
                    16, 11.5
                ]
            }
        };
        if (insertBefore) map.addLayer(layerDef, insertBefore); else map.addLayer(layerDef);
    } else {
        map.setPaintProperty(ids.fallbackCircleOutlineLayerId, 'circle-color', getThemeCapsuleColors().outline);
        map.setPaintProperty(ids.fallbackCircleOutlineLayerId, 'circle-opacity', 1);
        map.setPaintProperty(ids.fallbackCircleOutlineLayerId, 'circle-radius', [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 6.8,
            12, 6.8,
            16, 11.5
        ]);
        map.setFilter(ids.fallbackCircleOutlineLayerId, ['==', ['get', 'fallbackCircle'], 1]);
    }

    if (!map.getLayer(ids.fallbackCircleInnerLayerId)) {
        const layerDef = {
            id: ids.fallbackCircleInnerLayerId,
            type: 'circle',
            source: ids.centroidSourceId,
            minzoom: minZoom,
            filter: ['==', ['get', 'fallbackCircle'], 1],
            paint: {
                'circle-color': getThemeCapsuleColors().inner,
                'circle-opacity': 1,
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 5.0,
                    12, 5.0,
                    16, 8.6
                ]
            }
        };
        if (insertBefore) map.addLayer(layerDef, insertBefore); else map.addLayer(layerDef);
    } else {
        map.setPaintProperty(ids.fallbackCircleInnerLayerId, 'circle-color', getThemeCapsuleColors().inner);
        map.setPaintProperty(ids.fallbackCircleInnerLayerId, 'circle-opacity', 1);
        map.setPaintProperty(ids.fallbackCircleInnerLayerId, 'circle-radius', [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 5.0,
            12, 5.0,
            16, 8.6
        ]);
        map.setFilter(ids.fallbackCircleInnerLayerId, ['==', ['get', 'fallbackCircle'], 1]);
    }

    if (!map.getLayer(ids.masterLayerId)) {
        map.addLayer({
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