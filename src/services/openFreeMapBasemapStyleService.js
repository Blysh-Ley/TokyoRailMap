import { normalizeBasemapMode } from '../domain/basemapMode.js';
import {
    ONLINE_BASEMAP_PROVIDER_OPENFREEMAP,
    OPENFREEMAP_GLYPHS_URL,
    selectOpenFreeMapStyleUrl
} from '../domain/openFreeMapBasemap.js';

export const ONLINE_BASEMAP_LAYER_PREFIX = 'online-basemap-layer-';
export const ONLINE_BASEMAP_SOURCE_PREFIX = 'online-basemap-source-';

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

const getBackgroundColor = (styleJson, theme) => {
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

const sanitizeLayer = (layer, sourceIdMap) => {
    const sourceId = layer?.source ? sourceIdMap.get(layer.source) : null;
    if (!layer?.id || layer.type === 'background') return null;
    if (!['fill', 'line', 'symbol'].includes(layer.type)) return null;
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
    }

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
            .map((layer) => sanitizeLayer(layer, sourceIdMap))
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
        backgroundColor: getBackgroundColor(styleJson, nextTheme),
        primarySourceId,
        sourceIds: Object.keys(sources),
        layerIds: layers.map((layer) => layer.id),
        style: {
            version: 8,
            glyphs: OPENFREEMAP_GLYPHS_URL,
            sources,
            layers,
            metadata: {
                tokyoRailBasemap: {
                    provider: ONLINE_BASEMAP_PROVIDER_OPENFREEMAP,
                    sourceKind: 'online-fallback',
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

