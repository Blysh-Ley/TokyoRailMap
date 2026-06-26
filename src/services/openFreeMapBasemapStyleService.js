import { normalizeBasemapMode } from '../domain/basemapMode.js';
import {
    ONLINE_BASEMAP_PROVIDER_OPENFREEMAP,
    selectOpenFreeMapStyleUrl
} from '../domain/openFreeMapBasemap.js';
import { BASEMAP_GLYPHS_URL } from './mapEngine.js';

export const ONLINE_BASEMAP_LAYER_PREFIX = 'online-basemap-layer-';
export const ONLINE_BASEMAP_SOURCE_PREFIX = 'online-basemap-source-';
export const BASEMAP_TEXT_FONT_STACK = Object.freeze(['Open Sans Regular', 'Arial Unicode MS Regular']);

const styleCache = new Map();

const toId = (value) => String(value ?? '').trim();

const deepClone = (value) => {
    if (value == null) return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return null;
    }
};

const createSafeId = (value) => (
    toId(value).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
);

const isDark3dMode = (mode, theme) => (
    normalizeBasemapMode(mode) === 'osm-3d' && theme === 'dark'
);

const getBackgroundColor = (styleJson, theme, mode) => {
    if (isDark3dMode(mode, theme)) return '#101418';

    const backgroundLayer = Array.isArray(styleJson?.layers)
        ? styleJson.layers.find((layer) => layer?.type === 'background')
        : null;
    const color = backgroundLayer?.paint?.['background-color'];
    return typeof color === 'string'
        ? color
        : (theme === 'dark' ? '#101418' : '#f8f7f1');
};

const hasTextField = (layer) => (
    Object.prototype.hasOwnProperty.call(layer?.layout || {}, 'text-field')
);

const applyDark3dPaint = (layer, sourceId) => {
    const id = toId(sourceId).toLowerCase();
    const paint = { ...(layer.paint || {}) };

    if (layer.type === 'fill-extrusion') {
        paint['fill-extrusion-color'] = '#30363c';
        paint['fill-extrusion-opacity'] = 0.86;
    } else if (layer.type === 'fill') {
        if (id.includes('water')) {
            paint['fill-color'] = '#1d3a4a';
        } else if (id.includes('park') || id.includes('wood') || id.includes('grass') || id.includes('wetland')) {
            paint['fill-color'] = '#22362b';
            if (paint['fill-outline-color']) paint['fill-outline-color'] = '#3f5d49';
        } else if (id.includes('building')) {
            paint['fill-color'] = '#2a3036';
            if (paint['fill-outline-color']) paint['fill-outline-color'] = '#3a424a';
        } else if (id.includes('sand') || id.includes('cemetery') || id.includes('pitch') || id.includes('track')) {
            paint['fill-color'] = '#343324';
        } else {
            paint['fill-color'] = '#1b2026';
        }
    } else if (layer.type === 'line') {
        if (id.includes('water')) {
            paint['line-color'] = '#4d7890';
        } else if (id.includes('rail')) {
            paint['line-color'] = '#5a6571';
        } else if (id.includes('boundary')) {
            paint['line-color'] = '#66717e';
        } else if (id.includes('motorway')) {
            paint['line-color'] = id.includes('casing') ? '#40362e' : '#705238';
        } else if (id.includes('trunk') || id.includes('primary') || id.includes('secondary') || id.includes('tertiary')) {
            paint['line-color'] = id.includes('casing') ? '#3b352e' : '#554b3d';
        } else if (id.includes('road') || id.includes('tunnel') || id.includes('bridge')) {
            paint['line-color'] = id.includes('casing') ? '#303740' : '#252c35';
        } else {
            paint['line-color'] = '#343d46';
        }
    } else if (layer.type === 'symbol') {
        if (id.includes('water')) {
            paint['text-color'] = '#88b7d0';
        } else if (id.includes('highway')) {
            paint['text-color'] = '#c7b89f';
        } else if (id.includes('poi') || id.includes('airport')) {
            paint['text-color'] = '#aeb7bf';
        } else {
            paint['text-color'] = '#e3e8ed';
        }
        paint['text-halo-color'] = '#101418';
        paint['text-halo-width'] = Math.max(1, Number(paint['text-halo-width']) || 1);
    }

    layer.paint = paint;
    return layer;
};

const sanitizeLayer = (layer, sourceIdMap, { mode, theme } = {}) => {
    const sourceId = layer?.source ? sourceIdMap.get(layer.source) : null;
    if (!layer?.id || layer.type === 'background') return null;
    if (!['fill', 'line', 'symbol', 'fill-extrusion'].includes(layer.type)) return null;
    if (layer.source && !sourceId) return null;

    const next = deepClone(layer);
    if (!next) return null;
    next.id = `${ONLINE_BASEMAP_LAYER_PREFIX}${createSafeId(layer.id)}`;
    if (sourceId) next.source = sourceId;

    if (next.type === 'symbol') {
        next.layout = { ...(next.layout || {}) };
        delete next.layout['icon-image'];
        delete next.layout['icon-size'];
        delete next.layout['icon-anchor'];
        delete next.layout['icon-offset'];
        delete next.layout['icon-allow-overlap'];
        delete next.layout['icon-ignore-placement'];
        if (!hasTextField(next)) return null;
        next.layout['text-font'] = [...BASEMAP_TEXT_FONT_STACK];
    }

    if (isDark3dMode(mode, theme)) applyDark3dPaint(next, layer.id);

    return next;
};

export const createOpenFreeMapBasemapStyle = ({
    styleJson,
    styleUrl,
    mode = 'osm-white',
    theme = 'light'
} = {}) => {
    const nextMode = normalizeBasemapMode(mode);
    if (nextMode === 'transparent' || !styleJson || typeof styleJson !== 'object') return null;
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    const sourceEntries = Object.entries(styleJson.sources || {});
    const sourceIdMap = new Map(sourceEntries.map(([sourceId]) => [
        sourceId,
        `${ONLINE_BASEMAP_SOURCE_PREFIX}${createSafeId(sourceId)}`
    ]));
    const sources = Object.fromEntries(sourceEntries.map(([sourceId, source]) => [
        sourceIdMap.get(sourceId),
        deepClone(source)
    ]).filter(([, source]) => source));
    const layers = Array.isArray(styleJson.layers)
        ? styleJson.layers
            .map((layer) => sanitizeLayer(layer, sourceIdMap, { mode: nextMode, theme: nextTheme }))
            .filter(Boolean)
        : [];
    const primarySourceId = sourceIdMap.get('openmaptiles')
        || Object.keys(sources).find((sourceId) => sources[sourceId]?.type === 'vector')
        || Object.keys(sources)[0]
        || null;

    return {
        provider: ONLINE_BASEMAP_PROVIDER_OPENFREEMAP,
        styleUrl,
        mode: nextMode,
        theme: nextTheme,
        backgroundColor: getBackgroundColor(styleJson, nextTheme, nextMode),
        primarySourceId,
        sourceIds: Object.keys(sources),
        layerIds: layers.map((layer) => layer.id),
        style: {
            version: 8,
            glyphs: BASEMAP_GLYPHS_URL,
            sources,
            layers,
            metadata: {
                tokyoRailBasemap: {
                    provider: ONLINE_BASEMAP_PROVIDER_OPENFREEMAP,
                    sourceKind: 'openfreemap',
                    primarySourceId,
                    styleUrl,
                    mode: nextMode,
                    theme: nextTheme
                }
            }
        }
    };
};

export const loadOpenFreeMapBasemapStyle = async ({
    fetchFn = globalThis.fetch,
    mode = 'osm-white',
    theme = 'light',
    signal
} = {}) => {
    const styleUrl = selectOpenFreeMapStyleUrl({ mode, theme });
    if (!styleUrl || typeof fetchFn !== 'function') return null;
    if (!styleCache.has(styleUrl)) {
        styleCache.set(styleUrl, Promise.resolve().then(async () => {
            const response = await fetchFn(styleUrl, { cache: 'force-cache', signal });
            if (!response?.ok) {
                throw new Error(`Failed to load OpenFreeMap style: ${response?.status || 'unknown'}`);
            }
            return response.json();
        }).catch((error) => {
            styleCache.delete(styleUrl);
            throw error;
        }));
    }
    const styleJson = await styleCache.get(styleUrl);
    return createOpenFreeMapBasemapStyle({ styleJson, styleUrl, mode, theme });
};
