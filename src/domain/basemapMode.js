export const DEFAULT_BASEMAP_MODE = 'osm-white';

export const BASEMAP_MODES = Object.freeze([
    'osm-white',
    'osm-detailed',
    'transparent'
]);

const LEGACY_OSM_VALUES = new Set([
    'ost',
    'osm',
    'openstreetmap',
    'osm-vector'
]);

export const normalizeBasemapMode = (mode, fallback = DEFAULT_BASEMAP_MODE) => {
    const normalizedFallback = BASEMAP_MODES.includes(fallback)
        ? fallback
        : DEFAULT_BASEMAP_MODE;
    const value = String(mode ?? '').trim().toLowerCase();

    if (BASEMAP_MODES.includes(value)) return value;
    if (LEGACY_OSM_VALUES.has(value)) return DEFAULT_BASEMAP_MODE;
    if (value === 'carto') return DEFAULT_BASEMAP_MODE;
    return normalizedFallback;
};
