export const BASEMAP_SOURCE_PMTILES = 'pmtiles';
export const BASEMAP_SOURCE_OPENFREEMAP = 'openfreemap';
export const BASEMAP_SOURCE_NONE = 'none';
export const DEFAULT_BASEMAP_SOURCE = BASEMAP_SOURCE_PMTILES;

export const normalizeBasemapSource = (
    source,
    fallback = DEFAULT_BASEMAP_SOURCE
) => {
    const value = String(source ?? '').trim().toLowerCase();
    if (value === BASEMAP_SOURCE_PMTILES) return BASEMAP_SOURCE_PMTILES;
    if (value === BASEMAP_SOURCE_OPENFREEMAP) return BASEMAP_SOURCE_OPENFREEMAP;
    if (value === BASEMAP_SOURCE_NONE) return BASEMAP_SOURCE_NONE;
    return fallback === BASEMAP_SOURCE_NONE
        ? BASEMAP_SOURCE_NONE
        : DEFAULT_BASEMAP_SOURCE;
};
