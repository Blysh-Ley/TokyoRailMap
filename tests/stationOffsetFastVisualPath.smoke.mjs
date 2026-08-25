import assert from 'node:assert/strict';
import { createLayerFeature } from '../src/features/layer/layerFeature.js';

const createTimerStub = () => {
    let nextId = 1;
    const tasks = new Map();
    return {
        clearTimeoutFn(id) {
            tasks.delete(id);
        },
        pendingCount() {
            return tasks.size;
        },
        pendingDelays() {
            return Array.from(tasks.values()).map(({ delay }) => delay);
        },
        runAll() {
            const pending = Array.from(tasks.values());
            tasks.clear();
            for (const { callback } of pending) callback();
        },
        setTimeoutFn(callback, delay) {
            const id = nextId;
            nextId += 1;
            tasks.set(id, { callback, delay });
            return id;
        }
    };
};

const makeGeoJSON = (zoom) => ({
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        properties: { id: 'S1' },
        geometry: { type: 'Point', coordinates: [zoom, zoom] }
    }]
});

const createFastPathHarness = ({ initialZoom = 12 } = {}) => {
    let zoom = initialZoom;
    let now = 0;
    let transferData = makeGeoJSON(initialZoom);
    let visibleKey = 'same-key';
    const timers = createTimerStub();
    const calls = {
        builds: [],
        circles: [],
        collisions: [],
        labels: [],
        rebuilds: [],
        renders: [],
        scopes: [],
        sources: [],
        transferSyncs: []
    };
    const feature = createLayerFeature({
        baseStationsGeoJSON: makeGeoJSON(initialZoom),
        buildStationOffsetGeoJSONAtZoom: ({ zoom: nextZoom }) => makeGeoJSON(nextZoom),
        buildTransferCapsuleGeoJSON: (data) => {
            calls.builds.push(data.features[0].geometry.coordinates[0]);
            return { type: 'FeatureCollection', features: [] };
        },
        clearTimeoutFn: timers.clearTimeoutFn,
        createCollisionController: () => ({
            scheduleUpdate: (options) => calls.collisions.push(options)
        }),
        getTransferCapsuleStationGroups: () => [],
        getTransferCapsuleStationsData: () => transferData,
        getTransferCapsuleVisibleKey: () => visibleKey,
        getViewportStationIdsForTransferCapsules: () => new Set(['S1']),
        getVisibleStationIdsForTransferCapsules: () => new Set(['S1']),
        getZoom: () => zoom,
        nowFn: () => now,
        renderTransferCapsules: (data) => calls.renders.push(data),
        rebuildStationCoordMap: (data) => calls.rebuilds.push(data),
        setTimeoutFn: timers.setTimeoutFn,
        setTransferCapsuleVisibleKey: (key) => {
            visibleKey = key;
        },
        shouldUseFixedTransferCapsuleConnections: () => false,
        stationOffsetVisualUpdateStrategy: 'circle-fast-path',
        syncTransferCapsuleStationsData: (data) => {
            transferData = data;
            calls.transferSyncs.push(data.features[0].geometry.coordinates[0]);
        },
        toTransferCapsuleVisibleKey: (ids, options = {}) => {
            calls.scopes.push(options.viewportOnly ? 'viewport' : 'final');
            return 'same-key';
        },
        updateStationCircleCoordinates: (data) => calls.circles.push(data),
        updateStationLabelCoordinates: (data) => calls.labels.push(data),
        updateStationsSourceData: (data) => calls.sources.push(data)
    });
    feature.setupCollisionController({ stationLabels: [], stationCircles: [] });
    return {
        calls,
        feature,
        setNow(value) {
            now = value;
        },
        setZoom(value) {
            zoom = value;
        },
        timers
    };
};

{
    const harness = createFastPathHarness();
    const { calls, feature, timers } = harness;

    assert.equal(feature.syncStationOffsetForZoom(12, { phase: 'visual', reason: 'zoom' }), true);
    harness.setNow(32);
    harness.setZoom(12.1);
    feature.syncStationOffsetForZoom(12.1, { phase: 'visual', reason: 'zoom' });
    harness.setNow(64);
    harness.setZoom(12.2);
    feature.syncStationOffsetForZoom(12.2, { phase: 'visual', reason: 'zoom' });

    assert.equal(calls.sources.length, 3);
    assert.equal(calls.circles.length, 3);
    assert.equal(calls.labels.length, 0);
    assert.equal(calls.rebuilds.length, 0);
    assert.equal(calls.collisions.length, 0);
    assert.deepEqual(calls.builds, [12]);
    assert.deepEqual(timers.pendingDelays(), [64]);

    harness.setNow(96);
    timers.runAll();
    assert.deepEqual(calls.builds, [12, 12.2]);
    assert.deepEqual(calls.transferSyncs, [12, 12.2]);

    assert.equal(feature.syncStationOffsetForZoom(12.2, {
        phase: 'final',
        reason: 'zoomend',
        force: true
    }), true);
    assert.equal(calls.sources.length, 3);
    assert.equal(calls.rebuilds.length, 1);
    assert.deepEqual(calls.builds, [12, 12.2, 12.2]);
    assert.equal(calls.labels.length, 0);
    assert.equal(calls.collisions.length, 0);
    assert.equal(timers.pendingCount(), 1);

    timers.runAll();
    assert.equal(calls.labels.length, 1);
    assert.equal(calls.collisions.length, 1);
    feature.destroy();
}

{
    const harness = createFastPathHarness({ initialZoom: 12.9 });
    const { calls, feature, timers } = harness;

    feature.syncStationOffsetForZoom(12.9, { phase: 'visual', reason: 'zoom' });
    assert.deepEqual(calls.scopes, ['final']);

    harness.setNow(10);
    harness.setZoom(13);
    feature.syncStationOffsetForZoom(13, { phase: 'visual', reason: 'zoom' });
    assert.equal(timers.pendingCount(), 1);

    harness.setZoom(13.1);
    feature.syncStationOffsetForZoom(13.1, { phase: 'visual', reason: 'zoom' });
    assert.equal(timers.pendingCount(), 0);
    harness.setZoom(13.2);
    feature.syncStationOffsetForZoom(13.2, { phase: 'visual', reason: 'zoom' });

    assert.deepEqual(calls.scopes, ['final', 'viewport', 'viewport']);
    assert.deepEqual(calls.builds, [12.9, 13.1, 13.2]);

    harness.setNow(20);
    harness.setZoom(12.9);
    feature.syncStationOffsetForZoom(12.9, { phase: 'visual', reason: 'zoom' });
    assert.equal(timers.pendingCount(), 1);
    feature.destroy();
    assert.equal(timers.pendingCount(), 0);
}

{
    const runtimeOptions = [];
    const feature = createLayerFeature({
        createStationOffsetRuntimeController: (options) => {
            runtimeOptions.push(options);
            return { destroy() {}, syncAtCurrentZoom() {} };
        },
        stationOffsetVisualSyncStrategy: 'raf-latest',
        stationOffsetVisualUpdateStrategy: 'circle-fast-path'
    });
    feature.bindStationOffsetRuntime();
    assert.equal(runtimeOptions[0].visualSyncStrategy, 'raf-latest');
    assert.equal(runtimeOptions[0].finalSyncStrategy, 'zoomend-only');
    feature.destroy();
}

console.log('station offset fast visual path smoke ok');
