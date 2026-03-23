const toText = (v) => String(v ?? '').trim();

export const ELEMENT_UI_CONSTANTS = Object.freeze({
    lineBaseWidth: 4,
    lineLowlightWidth: 1.2,
    lineLowlightColor: '#999',
    stationBaseRadius: 3.5,
    stationSingleStrokeWidth: 2,
    stationTransferStrokeWidth: 0,
    tripPreviewFallbackColor: '#0a84ff'
});

export const isDarkThemeActive = () => document.documentElement.getAttribute('data-theme') === 'dark';

const parseCssColorToRgb = (input) => {
    const s = toText(input);
    if (!s) return null;

    const hex = s.match(/^#([0-9a-fA-F]{3,8})$/);
    if (hex) {
        const raw = hex[1];
        if (raw.length === 3 || raw.length === 4) {
            const r = parseInt(raw[0] + raw[0], 16);
            const g = parseInt(raw[1] + raw[1], 16);
            const b = parseInt(raw[2] + raw[2], 16);
            return { r, g, b };
        }
        if (raw.length === 6 || raw.length === 8) {
            const r = parseInt(raw.slice(0, 2), 16);
            const g = parseInt(raw.slice(2, 4), 16);
            const b = parseInt(raw.slice(4, 6), 16);
            return { r, g, b };
        }
    }

    const rgb = s.match(/^rgba?\(\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)(?:\s*,\s*([0-9]+(?:\.[0-9]+)?))?\s*\)$/i);
    if (rgb) {
        const r = Math.max(0, Math.min(255, Math.round(Number(rgb[1]))));
        const g = Math.max(0, Math.min(255, Math.round(Number(rgb[2]))));
        const b = Math.max(0, Math.min(255, Math.round(Number(rgb[3]))));
        return { r, g, b };
    }

    return null;
};

const rgbToHex = ({ r, g, b }) => {
    const to2 = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).padStart(2, '0');
    return `#${to2(r)}${to2(g)}${to2(b)}`;
};

const relativeLuminance = ({ r, g, b }) => {
    const toLinear = (v) => {
        const x = Math.max(0, Math.min(255, Number(v) || 0)) / 255;
        return x <= 0.03928 ? (x / 12.92) : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

const DARK_INVERT_TRIGGER_LUMINANCE = (() => {
    const ref = parseCssColorToRgb('#005AAA');
    return ref ? relativeLuminance(ref) : 0.102;
})();

const adjustColorForDarkThemeIfNeeded = (color) => {
    const parsed = parseCssColorToRgb(color);
    if (!parsed) return String(color || '');

    const lum = relativeLuminance(parsed);
    if (!(lum < DARK_INVERT_TRIGGER_LUMINANCE)) return String(color || '');

    const inverted = {
        r: 255 - parsed.r,
        g: 255 - parsed.g,
        b: 255 - parsed.b
    };
    return rgbToHex(inverted);
};

export const resolveRailColorForTheme = (color, options = {}) => {
    const raw = toText(color);
    if (!raw) return raw;
    const dark = options.isDarkThemeActive === true || (options.isDarkThemeActive == null && isDarkThemeActive());
    if (!dark) return raw;
    return adjustColorForDarkThemeIfNeeded(raw);
};

export const buildBaseLineColorExpr = (options = {}) => {
    const dark = options.isDarkThemeActive === true;
    return dark
        ? ['coalesce', ['get', '_dark_color'], ['get', 'color'], '#555']
        : ['coalesce', ['get', 'color'], '#555'];
};

export const buildFocusedLinePaint = (options = {}) => {
    const baseColorExpr = options.baseColorExpr || buildBaseLineColorExpr(options);
    const focusExpr = options.focusExpr || null;
    const dimOpacity = Number.isFinite(options.dimOpacity) ? options.dimOpacity : 0.6;

    if (!focusExpr) {
        return {
            'line-color': baseColorExpr,
            'line-width': ELEMENT_UI_CONSTANTS.lineBaseWidth,
            'line-opacity': 1
        };
    }

    return {
        'line-color': ['case', focusExpr, baseColorExpr, ELEMENT_UI_CONSTANTS.lineLowlightColor],
        'line-width': ['case', focusExpr, ELEMENT_UI_CONSTANTS.lineBaseWidth, ELEMENT_UI_CONSTANTS.lineLowlightWidth],
        'line-opacity': ['case', focusExpr, 1, dimOpacity]
    };
};

export const buildLowlightLinePaint = (options = {}) => {
    const dimOpacity = Number.isFinite(options.dimOpacity) ? options.dimOpacity : 0.45;
    return {
        'line-color': ELEMENT_UI_CONSTANTS.lineLowlightColor,
        'line-width': ELEMENT_UI_CONSTANTS.lineLowlightWidth,
        'line-opacity': dimOpacity
    };
};

export const baseStationCircleRadiusExpr = () => {
    const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['literal', []]];
    return ['case', ['==', ['length', servingIdsExpr], 1], ELEMENT_UI_CONSTANTS.stationBaseRadius, ELEMENT_UI_CONSTANTS.stationBaseRadius];
};

export const baseStationCircleStrokeWidthExpr = () => {
    const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['literal', []]];
    return [
        'case',
        ['==', ['length', servingIdsExpr], 1],
        ELEMENT_UI_CONSTANTS.stationSingleStrokeWidth,
        ELEMENT_UI_CONSTANTS.stationTransferStrokeWidth
    ];
};

export const buildPrimaryLineColorExpr = (options = {}) => {
    const fallback = toText(options.defaultColor || '#fff') || '#fff';
    const lineIdsExpr = ['coalesce', ['get', 'platform_line_id'], ['get', 'serving_ids'], ['literal', []]];
    const primaryLineIdExpr = ['coalesce', ['at', 0, lineIdsExpr], ''];
    const matchExpr = ['match', primaryLineIdExpr];

    let hasAny = false;
    const lineColorById = options.lineColorById instanceof Map ? options.lineColorById : new Map();
    const dark = options.isDarkThemeActive === true;

    for (const [lineId, rawColor] of lineColorById.entries()) {
        const id = toText(lineId);
        const color = resolveRailColorForTheme(toText(rawColor), { isDarkThemeActive: dark }) || '';
        if (!id || !color) continue;
        matchExpr.push(id, color);
        hasAny = true;
    }

    matchExpr.push(fallback);
    return hasAny ? matchExpr : fallback;
};

export const stationCircleStrokeColorPaint = (options = {}) => (options.isDarkThemeActive ? '#111' : '#fff');

export const buildStationCircleColorPaintExpr = (options = {}) => {
    const dark = options.isDarkThemeActive === true;
    const lineColorById = options.lineColorById instanceof Map ? options.lineColorById : new Map();
    const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['literal', []]];
    const isTransferExpr = ['>', ['length', servingIdsExpr], 1];
    const baseNonTransferColor = dark ? '#8e95a1' : '#fff';
    const transferLineColorExpr = buildPrimaryLineColorExpr({ lineColorById, isDarkThemeActive: dark, defaultColor: baseNonTransferColor });
    const nonTransferLineColorExpr = buildPrimaryLineColorExpr({ lineColorById, isDarkThemeActive: dark, defaultColor: baseNonTransferColor });
    const baseExpr = ['case', isTransferExpr, transferLineColorExpr, nonTransferLineColorExpr];

    const overrideColor = toText(options.overrideColor);
    const overrideIds = Array.isArray(options.overrideStationIds)
        ? options.overrideStationIds.map((x) => toText(x)).filter(Boolean)
        : [];

    if (!(overrideColor && overrideIds.length)) return baseExpr;

    const isPreviewStationExpr = overrideIds.length === 1
        ? ['==', ['get', 'id'], overrideIds[0]]
        : ['in', ['get', 'id'], ['literal', overrideIds]];

    return ['case', isPreviewStationExpr, overrideColor, baseExpr];
};

export const buildStationSelectionPaint = (options = {}) => {
    const isSelectedExpr = options.isSelectedExpr || null;
    const hideOthers = options.hideOthers === true;

    if (!isSelectedExpr) {
        return {
            'circle-radius': baseStationCircleRadiusExpr(),
            'circle-stroke-width': baseStationCircleStrokeWidthExpr(),
            'circle-opacity': 1,
            'circle-stroke-opacity': 1
        };
    }

    return {
        'circle-radius': baseStationCircleRadiusExpr(),
        'circle-stroke-width': ['case', isSelectedExpr, baseStationCircleStrokeWidthExpr(), 0],
        'circle-opacity': hideOthers ? ['case', isSelectedExpr, 1, 0] : 1,
        'circle-stroke-opacity': hideOthers ? ['case', isSelectedExpr, 1, 0] : 1
    };
};

export const tripPreviewLineLayerPaint = () => ({
    'line-color': ['coalesce', ['get', 'color'], ELEMENT_UI_CONSTANTS.tripPreviewFallbackColor],
    'line-width': ELEMENT_UI_CONSTANTS.lineBaseWidth,
    'line-opacity': 1
});

export const tripPreviewStopLayerPaint = (options = {}) => ({
    'circle-radius': baseStationCircleRadiusExpr(),
    'circle-color': buildStationCircleColorPaintExpr({
        isDarkThemeActive: options.isDarkThemeActive === true,
        lineColorById: options.lineColorById
    }),
    'circle-stroke-width': 0,
    'circle-stroke-color': stationCircleStrokeColorPaint({ isDarkThemeActive: options.isDarkThemeActive === true }),
    // 由 stations-layer 统一承载线路色站点，trip-preview stops 不单独显示。
    'circle-opacity': 0,
    'circle-stroke-opacity': 0
});
