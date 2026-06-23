export const OSM_BASEMAP_PACKAGE_ID = 'kanto';
export const OSM_BASEMAP_PACKAGE_LABEL = 'Kanto OSM PMTiles';
export const DEFAULT_OSM_BASEMAP_PMTILES_URL = './tiles/kanto.pmtiles';
export const OSM_BASEMAP_ATTRIBUTION_ITEMS = Object.freeze([
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
export const OSM_BASEMAP_ATTRIBUTION_TEXT = 'Map: OpenMapTiles, © OpenStreetMap contributors';
export const OSM_BASEMAP_ATTRIBUTION_HTML = OSM_BASEMAP_ATTRIBUTION_ITEMS
    .map((item) => `<a href="${item.href}" target="_blank" rel="noopener noreferrer">&copy; ${item.label}${item.label === 'OpenStreetMap' ? ' contributors' : ''}</a>`)
    .join(' ');
export const PMTILES_MAGIC_NUMBER = 0x4d50;
export const PMTILES_HEADER_RANGE_END = 16383;
export const PMTILES_HEADER_RANGE_LENGTH = PMTILES_HEADER_RANGE_END + 1;

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

export const toPmtilesTileTemplate = (url) => {
    const styleUrl = toPmtilesStyleUrl(url);
    return `${styleUrl}/{z}/{x}/{y}`;
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
