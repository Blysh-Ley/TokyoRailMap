import assert from 'node:assert/strict';
import { createLayerFeature } from '../src/features/layer/layerFeature.js';

const immediateFrame = (callback) => {
    callback();
    return 1;
};

const stationData = { type: 'FeatureCollection', features: [{ properties: { id: 'S1' } }] };
const stationGroups = [{ id: 'G1', stationIds: ['S1'] }];

{
    const rendered = [];
    let visibleKey = '__init__';
    let collisionResolved = null;
    const feature = createLayerFeature({
        buildTransferCapsuleGeoJSON: () => ({ type: 'FeatureCollection', features: [{ id: 'capsule' }] }),
        createCollisionController: (labels, circles, options) => {
            collisionResolved = options.onCircleCollisionResolved;
            return {};
        },
        getTransferCapsuleStationsData: () => stationData,
        getTransferCapsuleStationGroups: () => stationGroups,
        getTransferCapsuleVisibleKey: () => visibleKey,
        getVisibleStationIdsForTransferCapsules: () => new Set(['S1']),
        renderTransferCapsules: (data) => rendered.push(data),
        requestFrame: immediateFrame,
        resolveTransferCapsuleLineColor: () => '#000',
        setTransferCapsuleVisibleKey: (nextKey) => {
            visibleKey = nextKey;
        },
        shouldUseFixedTransferCapsuleConnections: () => false,
        toTransferCapsuleVisibleKey: (ids) => `auto:${Array.from(ids || []).join('|')}`
    });

    feature.setupCollisionController({ stationLabels: [], stationCircles: [] });
    assert.equal(rendered.length, 0);

    feature.requestTransferCapsuleRefreshAfterCollision('__selection__');
    assert.equal(visibleKey, '__selection__');
    assert.equal(rendered.length, 0);

    collisionResolved({ visibleStationIds: new Set(['S1']) });
    assert.equal(visibleKey, 'auto:S1');
    assert.equal(rendered.length, 1);

    collisionResolved({ visibleStationIds: new Set(['S1']) });
    assert.equal(rendered.length, 1);
}

{
    const scheduled = [];
    const runtimeCalls = [];
    const feature = createLayerFeature({
        createCollisionController: (labels, circles, options) => ({
            options,
            scheduleUpdate: () => scheduled.push('collision')
        }),
        createStationOffsetRuntimeController: (options) => {
            runtimeCalls.push(['create', options.initialMode]);
            return {
                destroy: () => runtimeCalls.push(['destroy']),
                setMode: (mode) => {
                    runtimeCalls.push(['set-mode', mode]);
                    return mode;
                },
                syncAtCurrentZoom: () => runtimeCalls.push(['sync'])
            };
        },
        getTripPreviewActive: () => false,
        getZoom: () => 13,
        initialStationOffsetMode: 'dynamic',
        syncTransferCapsuleStationsData: () => {}
    });

    feature.setupCollisionController({ stationLabels: [], stationCircles: [] });
    feature.scheduleCollisionLayerRefresh();
    assert.deepEqual(scheduled, ['collision']);

    feature.bindStationOffsetRuntime({ initialMode: 'performance' });
    assert.deepEqual(runtimeCalls, [
        ['create', 'performance'],
        ['sync']
    ]);

    assert.equal(feature.setStationOffsetMode('dynamic'), 'dynamic');
    assert.deepEqual(runtimeCalls, [
        ['create', 'performance'],
        ['sync'],
        ['set-mode', 'dynamic']
    ]);
}

{
    const built = [];
    const sourceUpdates = [];
    const labelUpdates = [];
    const circleUpdates = [];
    const rebuilds = [];
    const transferSyncs = [];
    const invalidations = [];
    const collisionSchedules = [];

    const feature = createLayerFeature({
        baseStationsGeoJSON: stationData,
        buildStationOffsetGeoJSONAtZoom: ({ zoom }) => {
            const z = Number(zoom);
            built.push(Number(z.toFixed(3)));
            return {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    properties: { id: 'S1' },
                    geometry: { type: 'Point', coordinates: [z, z] }
                }]
            };
        },
        createCollisionController: () => ({
            scheduleUpdate: () => collisionSchedules.push('collision')
        }),
        getTransferCapsuleStationsData: () => stationData,
        getTransferCapsuleStationGroups: () => [],
        getZoom: () => 12.123,
        invalidateTransferCapsuleData: (key) => invalidations.push(key),
        rebuildStationCoordMap: (data) => rebuilds.push(data),
        requestFrame: immediateFrame,
        syncTransferCapsuleStationsData: (data) => transferSyncs.push(data),
        updateStationCircleCoordinates: (data) => circleUpdates.push(data),
        updateStationLabelCoordinates: (data) => labelUpdates.push(data),
        updateStationsSourceData: (data) => sourceUpdates.push(data)
    });

    feature.setupCollisionController({ stationLabels: [], stationCircles: [] });

    assert.equal(feature.syncStationOffsetForZoom(12.123, { phase: 'visual', reason: 'zoom' }), true);
    assert.deepEqual(built, [12.123]);
    assert.equal(sourceUpdates.length, 1);
    assert.equal(labelUpdates.length, 1);
    assert.equal(circleUpdates.length, 1);
    assert.equal(rebuilds.length, 0);
    assert.equal(transferSyncs.length, 0);
    assert.equal(invalidations.length, 0);
    assert.equal(collisionSchedules.length, 0);

    assert.equal(feature.syncStationOffsetForZoom(12.123, { phase: 'final', reason: 'settling' }), true);
    assert.deepEqual(built, [12.123]);
    assert.equal(sourceUpdates.length, 1);
    assert.equal(labelUpdates.length, 1);
    assert.equal(circleUpdates.length, 1);
    assert.equal(rebuilds.length, 1);
    assert.equal(transferSyncs.length, 1);
    assert.deepEqual(invalidations, ['offset-zoom:12.123']);
    assert.deepEqual(collisionSchedules, ['collision']);

    assert.equal(feature.syncStationOffsetForZoom(12.123, { phase: 'final', reason: 'zoomend' }), false);
    assert.equal(sourceUpdates.length, 1);
    assert.equal(rebuilds.length, 1);

    assert.equal(feature.syncStationOffsetForZoom(12.5, { phase: 'final', reason: 'zoomend' }), true);
    assert.deepEqual(built, [12.123, 12.5]);
    assert.equal(sourceUpdates.length, 2);
    assert.equal(rebuilds.length, 2);
}

console.log('layer feature transfer capsule scheduling smoke ok');
