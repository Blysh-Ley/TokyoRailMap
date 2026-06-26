export const DEFAULT_BASEMAP_MODE = 'osm-white';

export const BASEMAP_MODES = Object.freeze([
    'osm-white',
    'osm-detailed',
    'osm-3d',
    'transparent'
]);

export const BASEMAP_MODE_OSM_WHITE = 'osm-white';
export const BASEMAP_MODE_OSM_DETAILED = 'osm-detailed';
export const BASEMAP_MODE_OSM_3D = 'osm-3d';
export const BASEMAP_MODE_TRANSPARENT = 'transparent';

const LEGACY_OSM_VALUES = new Set([
    // 仅迁移旧本地设置值，不继续暴露旧底图模式。
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

export const basemapModeUsesOnlineEnhancement = (mode) => {
    const nextMode = normalizeBasemapMode(mode);
    return nextMode === BASEMAP_MODE_OSM_DETAILED || nextMode === BASEMAP_MODE_OSM_3D;
};

export const basemapModeUses3dCamera = (mode) => (
    normalizeBasemapMode(mode) === BASEMAP_MODE_OSM_3D
);
