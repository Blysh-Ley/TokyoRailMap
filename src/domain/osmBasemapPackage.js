export const OSM_BASEMAP_PACKAGE_ID = 'kanto';
export const OSM_BASEMAP_PACKAGE_LABEL = 'Kanto OSM PMTiles';
export const DEFAULT_OSM_BASEMAP_PMTILES_URL = './tiles/kanto.pmtiles';
export const OSM_BASEMAP_ATTRIBUTION_HTML = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">&copy; OpenStreetMap contributors</a>';
export const PMTILES_MAGIC_NUMBER = 0x4d50;

export const normalizeOsmBasemapArchiveUrl = (
    url,
    fallback = DEFAULT_OSM_BASEMAP_PMTILES_URL
) => {
    const value = String(url || '').trim();
    const nextFallback = String(fallback || DEFAULT_OSM_BASEMAP_PMTILES_URL).trim() || DEFAULT_OSM_BASEMAP_PMTILES_URL;
    return value || nextFallback;
};

export const toPmtilesStyleUrl = (url) => {
    const archiveUrl = normalizeOsmBasemapArchiveUrl(url);
    return archiveUrl.startsWith('pmtiles://') ? archiveUrl : `pmtiles://${archiveUrl}`;
};

export const hasPmtilesMagicNumber = (bytes) => {
    if (!bytes || Number(bytes.byteLength) < 2) return false;
    const view = bytes instanceof DataView
        ? bytes
        : new DataView(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength || undefined);
    return view.getUint16(0, true) === PMTILES_MAGIC_NUMBER;
};

export const createOsmBasemapPackage = ({
    id = OSM_BASEMAP_PACKAGE_ID,
    label = OSM_BASEMAP_PACKAGE_LABEL,
    pmtilesUrl = DEFAULT_OSM_BASEMAP_PMTILES_URL,
    downloadUrl,
    attributionHtml = OSM_BASEMAP_ATTRIBUTION_HTML
} = {}) => {
    const archiveUrl = normalizeOsmBasemapArchiveUrl(pmtilesUrl);

    return {
        id,
        label,
        pmtilesUrl: archiveUrl,
        styleUrl: toPmtilesStyleUrl(archiveUrl),
        downloadUrl: normalizeOsmBasemapArchiveUrl(downloadUrl, archiveUrl),
        attributionHtml
    };
};
