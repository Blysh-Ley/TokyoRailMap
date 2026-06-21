import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/features/print/print.js', 'utf8');

assert.doesNotMatch(source, /basemaps\.cartocdn/);
assert.doesNotMatch(source, /tile\.openstreetmap\.org/);
assert.doesNotMatch(source, /export-raster/);
assert.doesNotMatch(source, /DEFAULT_EXPORT_PMTILES_URL/);
assert.doesNotMatch(source, /normalizePmtilesUrlForExport/);
assert.match(source, /getExportBasemapStyle/);
assert.match(source, /EXPORT_BASEMAP_SOURCE_ID = 'osm-vector-source'/);
assert.match(source, /sources:\s*\{\}/);

console.log('print basemap export style smoke ok');
