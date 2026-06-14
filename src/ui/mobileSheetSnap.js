export const DEFAULT_MOBILE_SHEET_PEEK_PX = 86;

const toPositiveNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const normalizeMobileSheetState = (state) => {
    if (state === 'half') return 'half';
    if (state === 'collapsed') return 'collapsed';
    return 'expanded';
};

export const getMobileSheetSnapPoints = ({
    height = 0,
    peekPx = DEFAULT_MOBILE_SHEET_PEEK_PX
} = {}) => {
    const h = Math.max(1, Math.round(toPositiveNumber(height, 1)));
    const peek = Math.max(48, Math.min(h, Math.round(toPositiveNumber(peekPx, DEFAULT_MOBILE_SHEET_PEEK_PX))));
    const collapsed = Math.max(0, h - peek);
    return {
        expanded: 0,
        half: Math.max(0, Math.min(collapsed, Math.round(h * 0.5))),
        collapsed
    };
};

export const getMobileSheetOffsetForState = (state, options = {}) => {
    const normalized = normalizeMobileSheetState(state);
    return getMobileSheetSnapPoints(options)[normalized];
};

export const clampMobileSheetOffset = (offset, options = {}) => {
    const points = getMobileSheetSnapPoints(options);
    return Math.max(points.expanded, Math.min(points.collapsed, Number(offset) || 0));
};

export const getNearestMobileSheetStateByOffset = (offset, options = {}) => {
    const points = getMobileSheetSnapPoints(options);
    const value = clampMobileSheetOffset(offset, options);
    return Object.entries(points)
        .map(([state, point]) => ({ state, distance: Math.abs(point - value) }))
        .sort((a, b) => {
            if (a.distance !== b.distance) return a.distance - b.distance;
            return points[a.state] - points[b.state];
        })[0]?.state || 'expanded';
};

