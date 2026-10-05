import { nearestProjectionOnPolylinePixels } from '../map/offset.js';

export const buildMobileSelectionViewportFit = ({
    width = 0,
    height = 0,
    layoutWidth = width,
    halfDrawerInset = height * 0.44,
    kind = 'line'
} = {}) => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    const split = layoutWidth >= 600;
    const gap = Math.min(32, width * 0.05, height * 0.05);
    // Balance the margins inside the map area above the drawer's half-height snap.
    const top = Math.round(split ? height * 0.1 : gap);
    const drawerInset = Number.isFinite(halfDrawerInset) ? Math.max(0, halfDrawerInset) : height * 0.44;
    const bottom = split ? top : Math.round(Math.min(drawerInset, height - gap * 2) + gap);
    return {
        padding: {
            top,
            bottom,
            left: Math.round(split ? width / 2 + gap : width * 0.1),
            right: Math.round(split ? gap : width * 0.1)
        },
        minTargetZoom: kind === 'station' ? 12 : 10,
        viewportKey: `${width}:${height}:${split ? 'split' : 'phone'}`
    };
};

export const pickSelectionViewportLineAnchor = ({ lineFeatures = [], target, projectCoordinate } = {}) => {
    let best = null;
    for (const feature of lineFeatures) {
        if (feature.properties?.role === 'connector') continue;
        const geometry = feature.geometry;
        const chains = geometry?.type === 'LineString' ? [geometry.coordinates]
            : (geometry?.type === 'MultiLineString' ? geometry.coordinates : []);
        for (const chain of chains) {
            const candidate = nearestProjectionOnPolylinePixels(chain.map(projectCoordinate), target);
            if (candidate && (!best || candidate.d2 < best.d2)) best = candidate;
        }
    }
    return best?.point || null;
};
