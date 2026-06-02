import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { registerDebugZoomTools } from '../src/app/debugZoomTools.js';
import { registerTokyoRailMapRuntime } from '../src/app/runtimeFacade.js';
import { getLineOffsetPixelsPerUnitAtZoom } from '../src/map/element_ui.js';

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
    const buildOffsetPolylinePixelsWithMiter = () => [];
    const getStationOffsetGeoJSONAtZoom = () => ({ type: 'FeatureCollection', features: [] });

    assert.equal(registerTokyoRailMapRuntime({
        map,
        mapEngine,
        buildOffsetPolylinePixelsWithMiter,
        getLineOffsetPixelsPerUnitAtZoom,
        getStationOffsetGeoJSONAtZoom,
        target
    }), true);
    assert.equal(target.__TokyoRailMap, map);
    assert.equal(target.TokyoRailMapRuntime.getBaseMap(), map);
    assert.equal(target.TokyoRailMapRuntime.getMapEngine(), mapEngine);
    assert.equal(target.TokyoRailMapRuntime.buildOffsetPolylinePixelsWithMiter, buildOffsetPolylinePixelsWithMiter);
    assert.equal(target.TokyoRailMapRuntime.getLineOffsetPixelsPerUnitAtZoom(12), 4);
    assert.equal(target.TokyoRailMapRuntime.getLineOffsetPixelsPerUnitAtZoom(14.01), 0);
    assert.deepEqual(target.TokyoRailMapRuntime.getStationOffsetGeoJSONAtZoom(12), {
        type: 'FeatureCollection',
        features: []
    });
}

{
    const appSource = readFileSync('src/app.js', 'utf8');
    const fetchSource = readFileSync('src/lib/fetch.js', 'utf8');

    assert.match(appSource, /preloadAllDataAssets\(\{\s*includeTimetables:\s*false\s*\}\)/);
    assert.doesNotMatch(appSource, /preloadAllDataAssets\(\{\s*includeTimetables:\s*true/);
    assert.match(fetchSource, /preloadAllDataAssets = async \(\{\s*includeTimetables = false/);
    assert.match(fetchSource, /shouldBypassResponseCache[\s\S]*\/data\/train-timetables\//);
    assert.match(fetchSource, /fetchWithoutResponseCache/);
    assert.match(fetchSource, /if \(shouldBypassResponseCache\(url\)\)/);
    assert.match(fetchSource, /if \(shouldBypassResponseCache\(abs\)\)/);
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
