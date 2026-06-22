import {
    createOsmBasemapPackage,
    DEFAULT_OSM_BASEMAP_PMTILES_URL,
    hasPmtilesMagicNumber,
    PMTILES_HEADER_RANGE_END,
    PMTILES_HEADER_RANGE_LENGTH
} from '../domain/osmBasemapPackage.js';
import {
    shouldUseAndroidNativePmtiles,
    verifyAndroidPmtilesArchive
} from './androidPmtilesArchiveSource.js';

const getDefaultWindow = () => (
    typeof window !== 'undefined' ? window : null
);

const DEFAULT_OSM_BASEMAP_CACHE_PARAM = 'pmtiles-cache';
const DEFAULT_OSM_BASEMAP_CACHE_VALUE = `header-${PMTILES_HEADER_RANGE_LENGTH}`;

export const appendDefaultOsmBasemapCacheKey = (url) => {
    const value = String(url || DEFAULT_OSM_BASEMAP_PMTILES_URL).trim() || DEFAULT_OSM_BASEMAP_PMTILES_URL;
    if (new RegExp(`[?&]${DEFAULT_OSM_BASEMAP_CACHE_PARAM}=`).test(value)) return value;

    const hashIndex = value.indexOf('#');
    const base = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
    const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}${DEFAULT_OSM_BASEMAP_CACHE_PARAM}=${DEFAULT_OSM_BASEMAP_CACHE_VALUE}${hash}`;
};

export const readOsmBasemapRuntimeConfig = ({
    windowRef = getDefaultWindow()
} = {}) => {
    const customPmtilesUrl = windowRef?.TOKYO_RAIL_OSM_BASEMAP_URL;
    const pmtilesUrl = customPmtilesUrl || appendDefaultOsmBasemapCacheKey(DEFAULT_OSM_BASEMAP_PMTILES_URL);
    const downloadUrl = windowRef?.TOKYO_RAIL_OSM_BASEMAP_DOWNLOAD_URL || customPmtilesUrl || DEFAULT_OSM_BASEMAP_PMTILES_URL;
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
    signal,
    windowRef = getDefaultWindow()
} = {}) => {
    const url = String(pmtilesUrl || DEFAULT_OSM_BASEMAP_PMTILES_URL).trim() || DEFAULT_OSM_BASEMAP_PMTILES_URL;
    if (shouldUseAndroidNativePmtiles({ url, target: windowRef || globalThis })) {
        return verifyAndroidPmtilesArchive({ target: windowRef || globalThis });
    }

    if (typeof fetchFn !== 'function') return false;

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
            headers: { Range: `bytes=0-${PMTILES_HEADER_RANGE_END}` },
            signal
        });
        if (!response?.ok) return false;

        const contentLength = Number(response.headers?.get?.('Content-Length') || 0);
        if (response.status === 200 && (contentLength === 0 || contentLength > PMTILES_HEADER_RANGE_LENGTH)) {
            return false;
        }

        const bytes = await response.arrayBuffer();
        return hasPmtilesMagicNumber(bytes);
    } catch {
        return false;
    }
};
