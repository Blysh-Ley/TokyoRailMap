import {
    createOsmBasemapPackage,
    DEFAULT_OSM_BASEMAP_PMTILES_URL,
    hasPmtilesMagicNumber
} from '../domain/osmBasemapPackage.js';

const getDefaultWindow = () => (
    typeof window !== 'undefined' ? window : null
);

export const readOsmBasemapRuntimeConfig = ({
    windowRef = getDefaultWindow()
} = {}) => {
    const pmtilesUrl = windowRef?.TOKYO_RAIL_OSM_BASEMAP_URL || DEFAULT_OSM_BASEMAP_PMTILES_URL;
    const downloadUrl = windowRef?.TOKYO_RAIL_OSM_BASEMAP_DOWNLOAD_URL || pmtilesUrl;
    const basemapPackage = createOsmBasemapPackage({
        pmtilesUrl,
        downloadUrl
    });

    return {
        pmtilesUrl: basemapPackage.pmtilesUrl,
        basemapPackage
    };
};

export const verifyOsmBasemapArchive = async ({
    fetchFn = globalThis.fetch,
    pmtilesUrl,
    signal
} = {}) => {
    if (typeof fetchFn !== 'function') return false;
    const url = String(pmtilesUrl || DEFAULT_OSM_BASEMAP_PMTILES_URL).trim() || DEFAULT_OSM_BASEMAP_PMTILES_URL;

    try {
        const headResponse = await fetchFn(url, {
            method: 'HEAD',
            cache: 'no-store',
            signal
        });
        if (headResponse && headResponse.status !== 405) {
            if (!headResponse.ok) return false;
            const contentType = String(headResponse.headers?.get?.('Content-Type') || '').toLowerCase();
            if (contentType.includes('text/html')) return false;
            const headContentLength = Number(headResponse.headers?.get?.('Content-Length') || 0);
            if (headContentLength > 0 && headContentLength < 2) return false;
        }

        const response = await fetchFn(url, {
            cache: 'no-store',
            headers: { Range: 'bytes=0-1' },
            signal
        });
        if (!response?.ok) return false;

        const contentLength = Number(response.headers?.get?.('Content-Length') || 0);
        if (response.status === 200 && contentLength > 2) return false;

        const bytes = await response.arrayBuffer();
        return hasPmtilesMagicNumber(bytes);
    } catch {
        return false;
    }
};
