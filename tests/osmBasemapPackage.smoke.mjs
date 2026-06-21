import assert from 'node:assert/strict';

import {
    createOsmBasemapPackage,
    DEFAULT_OSM_BASEMAP_PMTILES_URL,
    hasPmtilesMagicNumber,
    normalizeOsmBasemapArchiveUrl,
    toPmtilesStyleUrl
} from '../src/domain/osmBasemapPackage.js';

assert.equal(DEFAULT_OSM_BASEMAP_PMTILES_URL, './tiles/kanto.pmtiles');
assert.equal(normalizeOsmBasemapArchiveUrl(''), './tiles/kanto.pmtiles');
assert.equal(normalizeOsmBasemapArchiveUrl('  /offline/kanto.pmtiles  '), '/offline/kanto.pmtiles');
assert.equal(toPmtilesStyleUrl('./tiles/kanto.pmtiles'), 'pmtiles://./tiles/kanto.pmtiles');
assert.equal(toPmtilesStyleUrl('pmtiles://./tiles/kanto.pmtiles'), 'pmtiles://./tiles/kanto.pmtiles');
assert.equal(hasPmtilesMagicNumber(new Uint8Array([0x50, 0x4d])), true);
assert.equal(hasPmtilesMagicNumber(new TextEncoder().encode('<!doctype html>')), false);

const basemapPackage = createOsmBasemapPackage({
    pmtilesUrl: 'https://example.test/kanto.pmtiles',
    downloadUrl: 'https://example.test/download/kanto.pmtiles'
});

assert.equal(basemapPackage.id, 'kanto');
assert.equal(basemapPackage.pmtilesUrl, 'https://example.test/kanto.pmtiles');
assert.equal(basemapPackage.styleUrl, 'pmtiles://https://example.test/kanto.pmtiles');
assert.equal(basemapPackage.downloadUrl, 'https://example.test/download/kanto.pmtiles');
assert.match(basemapPackage.attributionHtml, /OpenStreetMap contributors/);

console.log('osm basemap package smoke ok');
