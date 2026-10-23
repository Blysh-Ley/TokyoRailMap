import { readLineOffsetProfile } from './lineOffsetProfile.js';
import { buildVariableOffsetPolylinePixels } from './lineOffsetGeometry.js';

const buildPreviewLinePixels = ({
    baseCoord,
    buildOffsetPolylinePixelsWithMiter,
    feature,
    getLineOffsetPixelsPerUnitAtZoom,
    nearestProjectionOnPolylinePixels,
    projectLngLatToPixelAtZoom12,
    unprojectPixelToLngLatAtZoom12,
    zoom
} = {}) => {
    const coords = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
    if (!Array.isArray(baseCoord) || baseCoord.length < 2 || coords.length < 2) return null;
    if (
        typeof projectLngLatToPixelAtZoom12 !== 'function'
        || typeof getLineOffsetPixelsPerUnitAtZoom !== 'function'
        || typeof nearestProjectionOnPolylinePixels !== 'function'
        || typeof unprojectPixelToLngLatAtZoom12 !== 'function'
    ) {
        return null;
    }

    const sourcePixels = coords.map(projectLngLatToPixelAtZoom12).filter(Boolean);
    if (sourcePixels.length < 2) return null;

    const units = Number(feature?.properties?.line_offset_units);
    const resolvedZoom = Number(zoom);
    const offsetPxAtZoom = Number.isFinite(units)
        ? units * getLineOffsetPixelsPerUnitAtZoom(resolvedZoom)
        : 0;
    const scaleToZoom12 = Math.pow(2, 12 - (Number.isFinite(resolvedZoom) ? resolvedZoom : 12));
    const offsetPxAtZoom12 = offsetPxAtZoom * scaleToZoom12;
    const profile = readLineOffsetProfile(feature?.properties);
    return profile && typeof buildOffsetPolylinePixelsWithMiter === 'function'
        ? buildVariableOffsetPolylinePixels(coords, profile, getLineOffsetPixelsPerUnitAtZoom(resolvedZoom) * scaleToZoom12, projectLngLatToPixelAtZoom12, buildOffsetPolylinePixelsWithMiter)
        : (offsetPxAtZoom12 && typeof buildOffsetPolylinePixelsWithMiter === 'function'
            ? buildOffsetPolylinePixelsWithMiter(sourcePixels, offsetPxAtZoom12)
            : sourcePixels);
};

const projectStationToLinePixels = ({ baseCoord, projectLngLatToPixelAtZoom12,
    nearestProjectionOnPolylinePixels, unprojectPixelToLngLatAtZoom12 }, targetPixels) => {
    if (!Array.isArray(targetPixels) || targetPixels.length < 2) return null;
    const basePx = projectLngLatToPixelAtZoom12(baseCoord);
    if (!basePx) return null;
    const hit = nearestProjectionOnPolylinePixels(targetPixels, basePx);
    const lngLat = hit?.point ? unprojectPixelToLngLatAtZoom12(hit.point) : null;
    return Array.isArray(lngLat) && lngLat.length >= 2 ? lngLat : null;
};

export const projectStationToPreviewLineFeature = (options = {}) => (
    projectStationToLinePixels(options, buildPreviewLinePixels(options))
);

// 同一批站点共享线路折线；每批创建独立解析器，缩放或预览变化后自然重算。
export const createPreviewLineProjector = (options = {}) => {
    const pixelsByFeature = new Map();
    return ({ baseCoord, feature } = {}) => {
        if (!Array.isArray(baseCoord) || baseCoord.length < 2) return null;
        const input = { ...options, baseCoord, feature };
        if (!pixelsByFeature.has(feature)) pixelsByFeature.set(feature, buildPreviewLinePixels(input));
        return projectStationToLinePixels(input, pixelsByFeature.get(feature));
    };
};

export const selectNearestProjectedPreviewLineCoordinate = ({
    baseCoord,
    lineFeatures,
    projectLngLatToPixelAtZoom12,
    projectStationToPreviewLine = projectStationToPreviewLineFeature,
    projectionOptions = {}
} = {}) => {
    const candidates = Array.isArray(lineFeatures) ? lineFeatures : [];
    if (!Array.isArray(baseCoord) || baseCoord.length < 2) return null;
    if (typeof projectLngLatToPixelAtZoom12 !== 'function') return null;

    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    const basePx = projectLngLatToPixelAtZoom12(baseCoord);
    if (!basePx) return null;

    for (const feature of candidates) {
        const coord = projectStationToPreviewLine({
            ...projectionOptions,
            baseCoord,
            feature
        });
        const px = projectLngLatToPixelAtZoom12(coord);
        if (!coord || !px) continue;
        const dx = px.x - basePx.x;
        const dy = px.y - basePx.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
            best = coord;
            bestDist = dist;
        }
    }

    return best;
};
