import assert from 'node:assert/strict';

import { registerTokyoRailMapRuntime } from '../src/app/runtimeFacade.js';

const basemapPackage = { id: 'kanto', pmtilesUrl: './tiles/kanto.pmtiles' };
const target = {};

assert.equal(registerTokyoRailMapRuntime({
    map: { id: 'map' },
    mapEngine: { id: 'engine' },
    basemapThemeRuntime: {
        getExportStyle: () => ({ version: 8, sources: {}, layers: [] }),
        getMode: () => 'osm-white',
        getPackage: () => basemapPackage,
        getPmtilesAvailable: () => false,
        getMapAttributionItems: () => [{ label: 'OpenStreetMap' }]
    },
    target
}), true);

assert.equal(target.TokyoRailMapRuntime.getBasemapMode(), 'osm-white');
assert.equal(target.TokyoRailMapRuntime.getBasemapPackage(), basemapPackage);
assert.equal(target.TokyoRailMapRuntime.getPmtilesAvailable(), false);
assert.deepEqual(target.TokyoRailMapRuntime.getMapAttributionItems(), [{ label: 'OpenStreetMap' }]);
assert.deepEqual(target.TokyoRailMapRuntime.getExportBasemapStyle(), {
    version: 8,
    sources: {},
    layers: []
});

console.log('basemap runtime facade smoke ok');
