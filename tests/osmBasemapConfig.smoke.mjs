import assert from 'node:assert/strict';

import { readOsmBasemapRuntimeConfig } from '../src/services/osmBasemapConfig.js';

{
    const config = readOsmBasemapRuntimeConfig({ windowRef: {} });
    assert.equal(config.pmtilesUrl, './tiles/kanto.pmtiles');
    assert.equal(config.basemapPackage.styleUrl, 'pmtiles://./tiles/kanto.pmtiles');
    assert.equal(config.basemapPackage.downloadUrl, './tiles/kanto.pmtiles');
}

{
    const config = readOsmBasemapRuntimeConfig({
        windowRef: {
            TOKYO_RAIL_OSM_BASEMAP_URL: 'https://cdn.example.test/kanto.pmtiles',
            TOKYO_RAIL_OSM_BASEMAP_DOWNLOAD_URL: '/offline/kanto.pmtiles'
        }
    });

    assert.equal(config.pmtilesUrl, 'https://cdn.example.test/kanto.pmtiles');
    assert.equal(config.basemapPackage.styleUrl, 'pmtiles://https://cdn.example.test/kanto.pmtiles');
    assert.equal(config.basemapPackage.downloadUrl, '/offline/kanto.pmtiles');
}

console.log('osm basemap config smoke ok');
