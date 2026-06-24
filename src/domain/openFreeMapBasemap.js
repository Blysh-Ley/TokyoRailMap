import { normalizeBasemapMode } from './basemapMode.js';

export const ONLINE_BASEMAP_PROVIDER_OPENFREEMAP = 'openfreemap';
export const ONLINE_BASEMAP_PROVIDER_NONE = 'none';
export const DEFAULT_ONLINE_BASEMAP_PROVIDER = ONLINE_BASEMAP_PROVIDER_OPENFREEMAP;

export const OPENFREEMAP_GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export const OPENFREEMAP_STYLE_URLS = Object.freeze({
    light: Object.freeze({
        'osm-white': 'https://tiles.openfreemap.org/styles/positron',
        'osm-detailed': 'https://tiles.openfreemap.org/styles/bright'
    }),
    dark: Object.freeze({
        'osm-white': 'https://tiles.openfreemap.org/styles/dark',
        'osm-detailed': 'https://tiles.openfreemap.org/styles/fiord'
    })
});

export const OPENFREEMAP_ATTRIBUTION_ITEMS = Object.freeze([
    {
        group: 'map',
        label: 'OpenFreeMap',
        href: 'https://openfreemap.org/'
    },
    {
        group: 'map',
        label: 'OpenMapTiles',
        href: 'https://www.openmaptiles.org/'
    },
    {
        group: 'map',
        label: 'OpenStreetMap',
        href: 'https://www.openstreetmap.org/copyright'
    }
]);

export const normalizeOnlineBasemapProvider = (
    provider,
    fallback = DEFAULT_ONLINE_BASEMAP_PROVIDER
) => {
    const value = String(provider ?? '').trim().toLowerCase();
    if (value === ONLINE_BASEMAP_PROVIDER_OPENFREEMAP) return ONLINE_BASEMAP_PROVIDER_OPENFREEMAP;
    if (value === ONLINE_BASEMAP_PROVIDER_NONE) return ONLINE_BASEMAP_PROVIDER_NONE;
    return fallback === ONLINE_BASEMAP_PROVIDER_NONE
        ? ONLINE_BASEMAP_PROVIDER_NONE
        : DEFAULT_ONLINE_BASEMAP_PROVIDER;
};

export const selectOpenFreeMapStyleUrl = ({
    mode = 'osm-white',
    theme = 'light'
} = {}) => {
    const nextMode = normalizeBasemapMode(mode);
    if (nextMode === 'transparent') return null;
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    return OPENFREEMAP_STYLE_URLS[nextTheme]?.[nextMode] || null;
};

