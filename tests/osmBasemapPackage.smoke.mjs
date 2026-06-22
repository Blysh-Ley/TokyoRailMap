import assert from 'node:assert/strict';

import {
    createOsmBasemapPackage,
    DEFAULT_OSM_BASEMAP_PMTILES_URL,
    hasPmtilesMagicNumber,
    normalizeOsmBasemapArchiveUrl,
    PMTILES_HEADER_RANGE_END,
    PMTILES_HEADER_RANGE_LENGTH,
    toPmtilesStyleUrl,
    toPmtilesTileTemplate
} from '../src/domain/osmBasemapPackage.js';

assert.equal(DEFAULT_OSM_BASEMAP_PMTILES_URL, './tiles/kanto.pmtiles');
assert.equal(PMTILES_HEADER_RANGE_END, 16383);
assert.equal(PMTILES_HEADER_RANGE_LENGTH, 16384);
assert.equal(normalizeOsmBasemapArchiveUrl(''), './tiles/kanto.pmtiles');
assert.equal(normalizeOsmBasemapArchiveUrl('  /offline/kanto.pmtiles  '), '/offline/kanto.pmtiles');
assert.equal(toPmtilesStyleUrl('./tiles/kanto.pmtiles'), 'pmtiles://./tiles/kanto.pmtiles');
assert.equal(toPmtilesStyleUrl('pmtiles://./tiles/kanto.pmtiles'), 'pmtiles://./tiles/kanto.pmtiles');
assert.equal(toPmtilesTileTemplate('./tiles/kanto.pmtiles'), 'pmtiles://./tiles/kanto.pmtiles/{z}/{x}/{y}');
assert.equal(hasPmtilesMagicNumber(new Uint8Array([0x50, 0x4d])), true);
assert.equal(hasPmtilesMagicNumber(new TextEncoder().encode('<!doctype html>')), false);

const basemapPackage = createOsmBasemapPackage({
    pmtilesUrl: 'https://example.test/kanto.pmtiles',
    downloadUrl: 'https://example.test/download/kanto.pmtiles'
});

assert.equal(basemapPackage.id, 'kanto');
assert.equal(basemapPackage.pmtilesUrl, 'https://example.test/kanto.pmtiles');
assert.equal(basemapPackage.styleUrl, 'pmtiles://https://example.test/kanto.pmtiles');
assert.equal(toPmtilesTileTemplate(basemapPackage.pmtilesUrl), 'pmtiles://https://example.test/kanto.pmtiles/{z}/{x}/{y}');
assert.equal(basemapPackage.downloadUrl, 'https://example.test/download/kanto.pmtiles');
assert.match(basemapPackage.attributionHtml, /OpenMapTiles/);
assert.match(basemapPackage.attributionHtml, /OpenStreetMap contributors/);

console.log('osm basemap package smoke ok');
