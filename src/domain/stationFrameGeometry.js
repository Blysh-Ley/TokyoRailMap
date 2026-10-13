import { getLineOffsetPixelsPerUnitAtZoom } from './lineOffsetScale.js';
import { getOffsetPixelsPerUnitAtZoom, projectLngLatToPixelAtZoom12, unprojectPixelToLngLatAtZoom12 } from '../map/offset.js';

const WORLD_AT_ZOOM_12 = 512 * 2 ** 12;

// Pure cached geometry: no source updates, map objects or screen state.
export function buildStationFrameGeometry(baseStationsGeoJSON, context) {
    return (baseStationsGeoJSON?.features || []).filter((f) => f?.geometry?.type === 'Point').map((feature) => {
        const id = String(feature.properties?.id || feature.id || '');
        const info = context?.stationLocalChainsById?.[id];
        const base = projectLngLatToPixelAtZoom12(feature.geometry.coordinates);
        if (!base) return null;
        return { id, feature, base, anchor: info?.anchorPixelAtZoom12 || base,
            direction: info?.offsetDirectionAtZoom12 || { x: 0, y: 0 },
            ...(info?.usesLineOffsetProfile ? { usesLineOffsetProfile: true } : {}), units: Number(info?.units) || 0 };
    }).filter(Boolean);
}

export function createStationFrameProjection(zoom, { mode = 'dynamic', frozenZoom = zoom } = {}) {
    const geometryZoom = mode === 'performance' ? frozenZoom : zoom;
    const magnitude = getOffsetPixelsPerUnitAtZoom(geometryZoom);
    const scale = magnitude * 2 ** (12 - geometryZoom)
        * (geometryZoom < 12 ? 0.85 ** (12 - geometryZoom) : 1);
    const lineMagnitude = getLineOffsetPixelsPerUnitAtZoom(geometryZoom);
    const lineScale = lineMagnitude * 2 ** (12 - geometryZoom);
    return (item) => {
        const itemMagnitude = item.usesLineOffsetProfile ? lineMagnitude : magnitude;
        if (!item.units || !itemMagnitude) return { x: item.base.x / WORLD_AT_ZOOM_12, y: item.base.y / WORLD_AT_ZOOM_12 };
        const amount = item.units * (item.usesLineOffsetProfile ? lineScale : scale);
        return { x: (item.anchor.x + item.direction.x * amount) / WORLD_AT_ZOOM_12,
            y: (item.anchor.y + item.direction.y * amount) / WORLD_AT_ZOOM_12 };
    };
}

export function getStationFrameMercatorPoint(item, zoom, options = {}) {
    return createStationFrameProjection(zoom, options)(item);
}

export function stationFramePointToLngLat(point) {
    return unprojectPixelToLngLatAtZoom12({ x: point.x * WORLD_AT_ZOOM_12, y: point.y * WORLD_AT_ZOOM_12 });
}

// Existing station filters use these property-only expressions. Reject unknown
// operators so a future filter change falls back instead of showing hidden dots.
export function compileStationFrameFilter(expression) {
    if (expression == null) return () => true;
    const compile = (value) => {
        if (!Array.isArray(value)) return () => value;
        const [op, ...args] = value;
        if (op === 'literal') return () => args[0];
        if (op === 'get') return (props) => props[args[0]];
        const children = args.map(compile);
        if (op === 'all') return (p) => children.every((f) => f(p));
        if (op === 'any') return (p) => children.some((f) => f(p));
        if (op === '!') return (p) => !children[0](p);
        if (op === '==') return (p) => children[0](p) === children[1](p);
        if (op === '!=') return (p) => children[0](p) !== children[1](p);
        if (op === 'in') {
            let previous = null;
            let values = null;
            return (p) => {
                const list = children[1](p);
                if (list !== previous) { previous = list; values = new Set(list || []); }
                return values.has(children[0](p));
            };
        }
        throw new Error(`Unsupported station circle filter: ${op}`);
    };
    return compile(expression);
}
