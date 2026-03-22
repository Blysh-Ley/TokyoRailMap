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
    const resolveLineColor = typeof options.resolveLineColor === 'function'
        ? options.resolveLineColor
        : (() => '');

    for (const rawGroup of groups) {
        const ids = normalizeGroupChunks(rawGroup);
        if (ids.length < 2) continue;

        const pickedIds = visibleStationIds
            ? ids.filter((id) => visibleStationIds.has(id))
            : ids;

        if (pickedIds.length < 2) continue;

        const features = pickedIds.map((id) => byId.get(id)).filter(Boolean);
        if (features.length < 2) continue;

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
        masterLayerId: options.masterLayerId || 'transfer-capsule-master-layer'
    };

    const beforeLayerId = options.beforeLayerId || 'stations-layer';
    const minZoom = Number.isFinite(options.minZoom) ? Number(options.minZoom) : 8;

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

    if (!map.getLayer(ids.slaveOutlineLayerId)) {
        map.addLayer({
            id: ids.slaveOutlineLayerId,
            type: 'line',
            source: ids.lineSourceId,
            minzoom: minZoom,
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#111',
                'line-opacity': 1,
                'line-width': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    12, 12,
                    16, 24
                ]
            }
        }, beforeLayerId);
    } else {
        map.setPaintProperty(ids.slaveOutlineLayerId, 'line-color', '#111');
        map.setPaintProperty(ids.slaveOutlineLayerId, 'line-opacity', 1);
        map.setPaintProperty(ids.slaveOutlineLayerId, 'line-width', [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 12,
            16, 24
        ]);
    }

    if (!map.getLayer(ids.slaveInnerLayerId)) {
        map.addLayer({
            id: ids.slaveInnerLayerId,
            type: 'line',
            source: ids.lineSourceId,
            minzoom: minZoom,
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#fff',
                'line-opacity': 1,
                'line-width': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    12, 8,
                    16, 14
                ]
            }
        }, beforeLayerId);
    } else {
        map.setPaintProperty(ids.slaveInnerLayerId, 'line-color', '#fff');
        map.setPaintProperty(ids.slaveInnerLayerId, 'line-opacity', 1);
        map.setPaintProperty(ids.slaveInnerLayerId, 'line-width', [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 8,
            16, 14
        ]);
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