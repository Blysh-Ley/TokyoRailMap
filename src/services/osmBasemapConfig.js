import {
    createOsmBasemapPackage,
    DEFAULT_OSM_BASEMAP_PMTILES_URL
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
