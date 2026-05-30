import assert from 'node:assert/strict';

import { registerDebugZoomTools } from '../src/app/debugZoomTools.js';
import { registerTokyoRailMapRuntime } from '../src/app/runtimeFacade.js';

const createStorage = () => {
    const data = new Map();
    return {
        getItem: (key) => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, value),
        removeItem: (key) => data.delete(key)
    };
};

{
    const target = {};
    const map = { id: 'map' };
    const mapEngine = { id: 'engine' };

    assert.equal(registerTokyoRailMapRuntime({ map, mapEngine, target }), true);
    assert.equal(target.__TokyoRailMap, map);
    assert.equal(target.TokyoRailMapRuntime.getBaseMap(), map);
    assert.equal(target.TokyoRailMapRuntime.getMapEngine(), mapEngine);
}

{
    const target = {};
    const storage = createStorage();
    const calls = [];
    const map = { id: 'map' };
    const mapEngine = {
        getZoom: () => 12.345,
        getCenter: () => ({ lng: 139.7, lat: 35.6 }),
        getPitch: () => 30,
        getBearing: () => 5,
        flyTo: (options) => calls.push(options)
    };

    assert.equal(registerDebugZoomTools({ map, mapEngine, target, storage }), true);
    assert.equal(typeof target.getZoomInfo, 'function');
    assert.equal(typeof target.saveZoom, 'function');
    assert.equal(typeof target.showZoomRecords, 'function');
    assert.equal(typeof target.clearZoomRecords, 'function');
    assert.equal(typeof target.setZoom, 'function');

    const originalLog = console.log;
    const originalTable = console.table;
    console.log = () => {};
    console.table = () => {};
    try {
        target.saveZoom();
        target.setZoom('u1');
        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0], {
            zoom: 12.345,
            center: { lng: 139.7, lat: 35.6 },
            pitch: 30,
            bearing: 5,
            essential: true
        });

        target.clearZoomRecords();
        target.setZoom('u1');
        assert.equal(calls.length, 1);
    } finally {
        console.log = originalLog;
        console.table = originalTable;
    }
}

console.log('app runtime helpers smoke ok');
