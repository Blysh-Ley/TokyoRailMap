const toText = (v) => String(v ?? '').trim();

export const ELEMENT_UI_CONSTANTS = Object.freeze({
    lineBaseWidth: 4,
    lineLowlightWidth: 1.2,
    lineLowlightColor: '#999',
    lineBaseWidthAtMaxZoom: 6,       
    lineLowlightWidthAtMaxZoom: 1.8, 

    stationBaseRadius: 3.5,
    stationSingleStrokeWidth: 2,
    stationTransferStrokeWidth: 0,
    stationZoomBase: 12,
    stationZoomMax: 16,
    stationBaseRadiusAtMaxZoom: 5,
    stationSingleStrokeWidthAtMaxZoom: 2.8,
    zoomScaleInterpolationBase: 2,
    tripPreviewFallbackColor: '#0a84ff'
});

const buildZoomBasedExponentialSizeExpr = (sizeAtBaseZoom, sizeAtMaxZoom) => {
    const zBase = ELEMENT_UI_CONSTANTS.stationZoomBase;
    const zMax = ELEMENT_UI_CONSTANTS.stationZoomMax;
    const interpBase = ELEMENT_UI_CONSTANTS.zoomScaleInterpolationBase;

    const baseSize = Number(sizeAtBaseZoom);
    const maxSize = Number(sizeAtMaxZoom);
    const zoomDelta = zMax - zBase;

    if (!(Number.isFinite(baseSize) && Number.isFinite(maxSize) && baseSize > 0 && maxSize > 0 && Number.isFinite(zoomDelta) && zoomDelta > 0)) {
        return baseSize;
    }

    const growthPerZoom = Math.pow(maxSize / baseSize, 1 / zoomDelta);
    const sizeAtZoom0 = baseSize * Math.pow(growthPerZoom, -zBase);

    return [
        'interpolate',
        ['exponential', interpBase],
        ['zoom'],
        0, sizeAtZoom0,
        zBase, baseSize,
        zMax, maxSize
    ];
};

const lineWidthScaleAtMaxZoom = ELEMENT_UI_CONSTANTS.stationBaseRadiusAtMaxZoom / ELEMENT_UI_CONSTANTS.stationBaseRadius;
const lineBaseWidthAtMaxZoom = ELEMENT_UI_CONSTANTS.lineBaseWidth * lineWidthScaleAtMaxZoom;
const lineLowlightWidthAtMaxZoom = ELEMENT_UI_CONSTANTS.lineLowlightWidth * lineWidthScaleAtMaxZoom;

const baseLineWidthExpr = () => buildZoomBasedExponentialSizeExpr(
    ELEMENT_UI_CONSTANTS.lineBaseWidth,
    lineBaseWidthAtMaxZoom
);

const lowlightLineWidthExpr = () => buildZoomBasedExponentialSizeExpr(
    ELEMENT_UI_CONSTANTS.lineLowlightWidth,
    lineLowlightWidthAtMaxZoom
);

const getExponentialInterpolationT = (progress, base) => {
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    const b = Number(base);
    if (!Number.isFinite(b) || b <= 0 || b === 1) return p;
    return (Math.pow(b, p) - 1) / (b - 1);
};

const buildLineOffsetPixelStops = () => {
    const lowZoomOffsetPxPerUnit = 4;
    const zBase = ELEMENT_UI_CONSTANTS.stationZoomBase;
    const zMax = ELEMENT_UI_CONSTANTS.stationZoomMax;
    const interpBase = ELEMENT_UI_CONSTANTS.zoomScaleInterpolationBase;
    const widthScaleAtMaxZoom = ELEMENT_UI_CONSTANTS.stationBaseRadiusAtMaxZoom / ELEMENT_UI_CONSTANTS.stationBaseRadius;
    const offsetPxPerUnitAtMaxZoom = lowZoomOffsetPxPerUnit * widthScaleAtMaxZoom;
    const growthPerZoom = Math.pow(offsetPxPerUnitAtMaxZoom / lowZoomOffsetPxPerUnit, 1 / (zMax - zBase));
    const offsetPxPerUnitAtZoom0 = lowZoomOffsetPxPerUnit * Math.pow(growthPerZoom, -zBase);
    const zoom14T = getExponentialInterpolationT((14 - zBase) / (zMax - zBase), interpBase);
    const offsetPxPerUnitAtZoom14 = lowZoomOffsetPxPerUnit + (offsetPxPerUnitAtMaxZoom - lowZoomOffsetPxPerUnit) * zoom14T;

    return {
        interpBase,
        lowZoomOffsetPxPerUnit,
        offsetPxPerUnitAtZoom0,
        offsetPxPerUnitAtZoom14,
        zBase
    };
};

export const getLineOffsetPixelsPerUnitAtZoom = (zoom) => {
    const z = Number(zoom);
    if (!Number.isFinite(z)) return 0;

    const {
        interpBase,
        lowZoomOffsetPxPerUnit,
        offsetPxPerUnitAtZoom0,
        offsetPxPerUnitAtZoom14,
        zBase
    } = buildLineOffsetPixelStops();

    if (z <= 0) return offsetPxPerUnitAtZoom0;
    if (z <= zBase) {
        const t = getExponentialInterpolationT(z / zBase, interpBase);
        return offsetPxPerUnitAtZoom0 + (lowZoomOffsetPxPerUnit - offsetPxPerUnitAtZoom0) * t;
    }
    if (z <= 14) {
        const t = getExponentialInterpolationT((z - zBase) / (14 - zBase), interpBase);
        return lowZoomOffsetPxPerUnit + (offsetPxPerUnitAtZoom14 - lowZoomOffsetPxPerUnit) * t;
    }
    if (z >= 14.01) return 0;
    if (z <= 14.01) {
        const t = getExponentialInterpolationT((z - 14) / 0.01, interpBase);
        return offsetPxPerUnitAtZoom14 * (1 - t);
    }
    return 0;
};

export const buildLineOffsetPaintExpr = () => {
    const {
        interpBase,
        lowZoomOffsetPxPerUnit,
        offsetPxPerUnitAtZoom0,
        offsetPxPerUnitAtZoom14,
        zBase
    } = buildLineOffsetPixelStops();

    return [
        'interpolate',
        ['exponential', interpBase],
        ['zoom'],
        0,
        ['*', ['coalesce', ['get', 'line_offset_units'], 0], offsetPxPerUnitAtZoom0],
        zBase,
        ['*', ['coalesce', ['get', 'line_offset_units'], 0], lowZoomOffsetPxPerUnit],
        14,
        ['*', ['coalesce', ['get', 'line_offset_units'], 0], offsetPxPerUnitAtZoom14],
        14.01,
        0,
        22,
        0
    ];
};

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

// 重写：动态计算线宽的插值表达式（支持传入 focusExpr 解决 MapLibre 嵌套限制）
export const buildDynamicLineWidthExpr = (options = {}) => {
    const { isLowlight = false, focusExpr = null } = options;

    const z0 = 0;
    const zShrinkStart = 6;
    const z1 = ELEMENT_UI_CONSTANTS.stationZoomBase; // 12
    const z2 = ELEMENT_UI_CONSTANTS.stationZoomMax;  // 16

    const wBaseMin = 0.8;
    const wBaseMid = ELEMENT_UI_CONSTANTS.lineBaseWidth;
    const wBaseMax = ELEMENT_UI_CONSTANTS.lineBaseWidthAtMaxZoom;

    const wLowMin = 0.3;
    const wLowMid = ELEMENT_UI_CONSTANTS.lineLowlightWidth;
    const wLowMax = ELEMENT_UI_CONSTANTS.lineLowlightWidthAtMaxZoom;

    // 1. 如果有 focus 表达式，必须把 case 写在 interpolate 内部的每一个 zoom 节点上
    if (focusExpr) {
        return ['interpolate', ['linear'], ['zoom'],
            z0, ['case', focusExpr, wBaseMin, wLowMin],
            zShrinkStart, ['case', focusExpr, wBaseMin, wLowMin],
            z1, ['case', focusExpr, wBaseMid, wLowMid],
            z2, ['case', focusExpr, wBaseMax, wLowMax]
        ];
    }

    // 2. 如果明确是全局低亮模式
    if (isLowlight) {
        return ['interpolate', ['linear'], ['zoom'],
            z0, wLowMin,
            zShrinkStart, wLowMin,
            z1, wLowMid,
            z2, wLowMax
        ];
    }

    // 3. 默认的基础宽度模式
    return ['interpolate', ['linear'], ['zoom'],
        z0, wBaseMin,
        zShrinkStart, wBaseMin,
        z1, wBaseMid,
        z2, wBaseMax
    ];
};

export const buildFocusedLinePaint = (options = {}) => {
    const baseColorExpr = options.baseColorExpr || buildBaseLineColorExpr(options);
    const focusExpr = options.focusExpr || null;
    const dimOpacity = Number.isFinite(options.dimOpacity) ? options.dimOpacity : 0.6;

    if (!focusExpr) {
        return {
            'line-color': baseColorExpr,
            'line-width': baseLineWidthExpr(),
            'line-opacity': 1
        };
    }

    const z0 = 0;
    const z1 = ELEMENT_UI_CONSTANTS.stationZoomBase;
    const z2 = ELEMENT_UI_CONSTANTS.stationZoomMax;
    const baseWidthAtZ0 = baseLineWidthExpr()[4];
    const lowlightWidthAtZ0 = lowlightLineWidthExpr()[4];

    return {
        'line-color': ['case', focusExpr, baseColorExpr, ELEMENT_UI_CONSTANTS.lineLowlightColor],
        'line-width': ['interpolate', ['exponential', ELEMENT_UI_CONSTANTS.zoomScaleInterpolationBase], ['zoom'],
            z0, ['case', focusExpr, baseWidthAtZ0, lowlightWidthAtZ0],
            z1, ['case', focusExpr, ELEMENT_UI_CONSTANTS.lineBaseWidth, ELEMENT_UI_CONSTANTS.lineLowlightWidth],
            z2, ['case', focusExpr, lineBaseWidthAtMaxZoom, lineLowlightWidthAtMaxZoom]
        ],
        'line-opacity': ['case', focusExpr, 1, dimOpacity]
    };
};

export const buildLowlightLinePaint = (options = {}) => {
    const dimOpacity = Number.isFinite(options.dimOpacity) ? options.dimOpacity : 0.45;
    return {
        'line-color': ELEMENT_UI_CONSTANTS.lineLowlightColor,
        'line-width': lowlightLineWidthExpr(),
        'line-opacity': dimOpacity
    };
};



export const baseStationCircleRadiusExpr = () => {
    const r1 = ELEMENT_UI_CONSTANTS.stationBaseRadius;
    const r2 = ELEMENT_UI_CONSTANTS.stationBaseRadiusAtMaxZoom;
    return buildZoomBasedExponentialSizeExpr(r1, r2);
};

export const baseStationCircleStrokeWidthExpr = () => {
    const z0 = 0;
    const z1 = ELEMENT_UI_CONSTANTS.stationZoomBase;
    const z2 = ELEMENT_UI_CONSTANTS.stationZoomMax;
    const w1 = ELEMENT_UI_CONSTANTS.stationSingleStrokeWidth;
    const w2 = ELEMENT_UI_CONSTANTS.stationSingleStrokeWidthAtMaxZoom;
    const w0 = buildZoomBasedExponentialSizeExpr(w1, w2)[4];
    const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['literal', []]];
    // Produce a single top-level interpolate where each zoom stop contains a case deciding
    // whether the station is a single-served station (has single stroke) or a transfer (use
    // transfer stroke width). This avoids nesting a zoom-expression inside a case.
    const isSingleExpr = ['==', ['length', servingIdsExpr], 1];
    return ['interpolate', ['exponential', ELEMENT_UI_CONSTANTS.zoomScaleInterpolationBase], ['zoom'],
        z0, ['case', isSingleExpr, w0, ELEMENT_UI_CONSTANTS.stationTransferStrokeWidth],
        z1, ['case', isSingleExpr, w1, ELEMENT_UI_CONSTANTS.stationTransferStrokeWidth],
        z2, ['case', isSingleExpr, w2, ELEMENT_UI_CONSTANTS.stationTransferStrokeWidth]
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
    const overrideColorByStationId = options.overrideColorByStationId instanceof Map
        ? options.overrideColorByStationId
        : null;

    if (overrideColorByStationId && overrideColorByStationId.size) {
        const matchExpr = ['match', ['get', 'id']];
        let hasAny = false;
        for (const [stationId, rawColor] of overrideColorByStationId.entries()) {
            const id = toText(stationId);
            const color = toText(rawColor);
            if (!id || !color) continue;
            matchExpr.push(id, color);
            hasAny = true;
        }
        matchExpr.push(baseExpr);
        if (hasAny) return matchExpr;
    }

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

    // Construct a single zoom-interpolate expression for stroke-width that encodes selection
    // per-stop. This prevents nesting a zoom expression inside a case (which MapLibre forbids).
    const z0 = 0;
    const z1 = ELEMENT_UI_CONSTANTS.stationZoomBase;
    const z2 = ELEMENT_UI_CONSTANTS.stationZoomMax;
    const w1 = ELEMENT_UI_CONSTANTS.stationSingleStrokeWidth;
    const w2 = ELEMENT_UI_CONSTANTS.stationSingleStrokeWidthAtMaxZoom;
    const w0 = buildZoomBasedExponentialSizeExpr(w1, w2)[4];
    const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['literal', []]];
    const isSingleExpr = ['==', ['length', servingIdsExpr], 1];

    const strokeAtZ0 = ['case', isSingleExpr, w0, ELEMENT_UI_CONSTANTS.stationTransferStrokeWidth];
    const strokeAtZ1 = ['case', isSingleExpr, w1, ELEMENT_UI_CONSTANTS.stationTransferStrokeWidth];
    const strokeAtZ2 = ['case', isSingleExpr, w2, ELEMENT_UI_CONSTANTS.stationTransferStrokeWidth];

    const strokeWidthExpr = ['interpolate', ['exponential', ELEMENT_UI_CONSTANTS.zoomScaleInterpolationBase], ['zoom'],
        z0, ['case', isSelectedExpr, strokeAtZ0, 0],
        z1, ['case', isSelectedExpr, strokeAtZ1, 0],
        z2, ['case', isSelectedExpr, strokeAtZ2, 0]
    ];

    return {
        'circle-radius': baseStationCircleRadiusExpr(),
        'circle-stroke-width': strokeWidthExpr,
        'circle-opacity': hideOthers ? ['case', isSelectedExpr, 1, 0] : 1,
        'circle-stroke-opacity': hideOthers ? ['case', isSelectedExpr, 1, 0] : 1
    };
};

export const tripPreviewLineLayerPaint = () => ({
    'line-color': ['coalesce', ['get', 'color'], ELEMENT_UI_CONSTANTS.tripPreviewFallbackColor],
    'line-width': baseLineWidthExpr(),
    'line-opacity': 1,
    'line-offset': buildLineOffsetPaintExpr()
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
