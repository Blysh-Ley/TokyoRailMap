import { createStationFrameProjection, buildStationFrameGeometry, stationFramePointToLngLat } from './stationFrameGeometry.js';
import { selectPreviewLineFeatureCandidates } from './previewLineCandidates.js';
import { selectNearestProjectedPreviewLineCoordinate } from './previewLineProjection.js';
import { projectLngLatToPixelAtZoom12 } from '../map/offset.js';

const WORLD = 512 * 2 ** 12;
const sameCoordinate = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 <= 1e-12;

// The legacy builder chooses a fixed tree when available, otherwise Prim's MST.
// Cache that topology only when membership changes; camera movement never waits
// for GeoJSON geometry. This module is pure and does not access the map or DOM.
const connections = (points, fixed) => {
    const ids = new Set(points.map((p) => p.id));
    const seen = new Set();
    const picked = (fixed || []).filter(([a, b]) => {
        const key = [a, b].sort().join('|');
        if (a === b || !ids.has(a) || !ids.has(b) || seen.has(key)) return false;
        seen.add(key); return true;
    });
    if (picked.length) return picked;
    const visited = new Set([0]);
    const edges = [];
    while (visited.size < points.length) {
        let best = null;
        let distance = Infinity;
        for (const i of visited) for (let j = 0; j < points.length; j++) {
            if (visited.has(j)) continue;
            const a = points[i].feature.geometry.coordinates;
            const b = points[j].feature.geometry.coordinates;
            const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
            if (d < distance) { best = [i, j]; distance = d; }
        }
        if (!best) break;
        visited.add(best[1]); edges.push(best.map((i) => points[i].id));
    }
    return edges;
};

export function buildTransferCapsuleFrameGeometry(data, stationGeometry, {
    stationsData, fixedConnectionsByGroupId, previewLineFeatures = [], previewProjectionOptions = {}
} = {}) {
    const geometryById = new Map(stationGeometry.map((item) => [item.id, item]));
    const featuresById = new Map((stationsData?.features || []).map((f) => [String(f.properties?.id || f.id || ''), f]));
    const groups = new Map();
    for (const dot of data?.dots?.features || []) {
        const id = String(dot.properties.stationId);
        const feature = featuresById.get(id) || { ...dot, properties: { ...dot.properties, id } };
        const geometry = geometryById.get(id) || buildStationFrameGeometry({ features: [feature] }, {})[0];
        if (!geometry) continue;
        const virtual = feature.properties?.virtual_preview_station === 1;
        const real = geometryById.get(String(feature.properties?.realStationId || ''));
        const candidates = virtual ? selectPreviewLineFeatureCandidates({ lineFeatures: previewLineFeatures,
            source: feature.properties.participantSource, lineId: dot.properties.lineId,
            realStationId: feature.properties.realStationId }) : [];
        const point = { id, feature: dot, geometry, virtual, candidates,
            baseGeometry: real || geometry, previewProjectionOptions };
        const key = dot.properties.groupId;
        if (!groups.has(key)) groups.set(key, { properties: { groupId: key, name: dot.properties.name }, points: [] });
        groups.get(key).points.push(point);
    }
    for (const [key, group] of groups) group.edges = connections(group.points, fixedConnectionsByGroupId?.[key]);
    return [...groups.values()];
}

export function projectTransferCapsuleFrameGeometry(groups, zoom, options = {}) {
    const project = createStationFrameProjection(zoom, options);
    const geometryZoom = options.mode === 'performance' ? options.frozenZoom : zoom;
    return groups.map((group) => {
        const points = group.points.map((point) => {
            let mercator = project(point.geometry);
            if (point.virtual && point.candidates.length) {
                const coord = selectNearestProjectedPreviewLineCoordinate({ baseCoord: stationFramePointToLngLat(project(point.baseGeometry)),
                    lineFeatures: point.candidates, projectLngLatToPixelAtZoom12,
                    projectionOptions: { ...point.previewProjectionOptions, zoom: geometryZoom } });
                const pixel = coord && projectLngLatToPixelAtZoom12(coord);
                if (pixel) mercator = { x: pixel.x / WORLD, y: pixel.y / WORLD };
            }
            return { ...point, mercator, coordinates: stationFramePointToLngLat(mercator) };
        });
        const fallback = points.length === 1 || points.every((p) => sameCoordinate(points[0].coordinates, p.coordinates));
        const byId = new Map(points.map((p) => [p.id, p]));
        return { properties: { ...group.properties, stationCount: points.length, ...(fallback ? { fallbackCircle: 1 } : {}) },
            points, fallback, edges: fallback ? [] : group.edges.map(([a, b]) => [byId.get(a), byId.get(b)]) };
    });
}
