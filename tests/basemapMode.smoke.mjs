import assert from 'node:assert/strict';

import {
    DEFAULT_BASEMAP_MODE,
    normalizeBasemapMode
} from '../src/domain/basemapMode.js';

assert.equal(DEFAULT_BASEMAP_MODE, 'osm-white');
assert.equal(normalizeBasemapMode('osm-white'), 'osm-white');
assert.equal(normalizeBasemapMode('osm-detailed'), 'osm-detailed');
assert.equal(normalizeBasemapMode('osm-vector'), 'osm-white');
assert.equal(normalizeBasemapMode('ost'), 'osm-white');
assert.equal(normalizeBasemapMode('OpenStreetMap'), 'osm-white');
assert.equal(normalizeBasemapMode('carto'), 'osm-white');
assert.equal(normalizeBasemapMode('transparent'), 'transparent');
assert.equal(normalizeBasemapMode('missing'), 'osm-white');
assert.equal(normalizeBasemapMode('missing', 'osm-detailed'), 'osm-detailed');

console.log('basemap mode smoke ok');
