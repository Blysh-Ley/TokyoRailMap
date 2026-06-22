import { HIGHLIGHT_STYLE_CONFIG } from '../map/highlight_style_config.js';

const ZOOM_BASE = 12;
const ZOOM_MAX = 16;

const toFiniteNumber = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const clampZoom = (zoom) => {
    const z = Number(zoom);
    return Number.isFinite(z) ? z : ZOOM_BASE;
};

const interpolateLinear = (zoom, stops) => {
    const z = clampZoom(zoom);
    const sorted = stops
        .map(([stopZoom, value]) => [Number(stopZoom), Number(value)])
        .filter(([stopZoom, value]) => Number.isFinite(stopZoom) && Number.isFinite(value))
        .sort((a, b) => a[0] - b[0]);

    if (!sorted.length) return 0;
    if (z <= sorted[0][0]) return sorted[0][1];

    for (let i = 1; i < sorted.length; i += 1) {
        const [prevZoom, prevValue] = sorted[i - 1];
        const [nextZoom, nextValue] = sorted[i];
        if (z > nextZoom) continue;
        if (nextZoom === prevZoom) return nextValue;
        const t = (z - prevZoom) / (nextZoom - prevZoom);
        return prevValue + (nextValue - prevValue) * t;
    }

    return sorted[sorted.length - 1][1];
};

export const getHighlightLineWidthAtZoom = (zoom, options = {}) => {
    const line = HIGHLIGHT_STYLE_CONFIG.line || {};
    const isLowlight = options.isLowlight === true;
    const shrinkStartZoom = toFiniteNumber(line.shrinkStartZoom, 6);
    const min = isLowlight
        ? toFiniteNumber(line.lowlightMinWidthAtLowZoom, 0.3)
        : toFiniteNumber(line.minWidthAtLowZoom, 0.8);
    const base = isLowlight
        ? toFiniteNumber(line.lowlightWidthAtBaseZoom, 1.2)
        : toFiniteNumber(line.widthAtBaseZoom, 4);
    const max = isLowlight
        ? toFiniteNumber(line.lowlightWidthAtMaxZoom, 1.8)
        : toFiniteNumber(line.widthAtMaxZoom, 6);

    return interpolateLinear(zoom, [
        [0, min],
        [shrinkStartZoom, min],
        [ZOOM_BASE, base],
        [ZOOM_MAX, max]
    ]);
};

export const getHighlightLineBasedSizeAtZoom = (zoom, key, fallbackScale) => {
    const sizes = HIGHLIGHT_STYLE_CONFIG.lineBasedSizes || {};
    const scale = toFiniteNumber(sizes[key], fallbackScale);
    return getHighlightLineWidthAtZoom(zoom) * scale;
};

export const getHighlightStationRadiusAtZoom = (zoom) => (
    getHighlightLineBasedSizeAtZoom(zoom, 'stationRadiusScale', 0.5)
);

export const getHighlightStationStrokeWidthAtZoom = (zoom, options = {}) => {
    const servingCount = Math.max(1, Math.round(toFiniteNumber(options.servingCount, 1)));
    if (servingCount > 1) return 0;
    return getHighlightLineBasedSizeAtZoom(zoom, 'stationStrokeWidthScale', 0.25);
};

export const getHighlightTransferCapsuleSizesAtZoom = (zoom) => ({
    outlineLineWidth: getHighlightLineBasedSizeAtZoom(zoom, 'capsuleOutlineLineWidthScale', 1.8),
    innerLineWidth: getHighlightLineBasedSizeAtZoom(zoom, 'capsuleInnerLineWidthScale', 1.25),
    fallbackOutlineRadius: getHighlightLineBasedSizeAtZoom(zoom, 'capsuleFallbackOutlineRadiusScale', 0.75),
    fallbackInnerRadius: getHighlightLineBasedSizeAtZoom(zoom, 'capsuleFallbackInnerRadiusScale', 0.55)
});
