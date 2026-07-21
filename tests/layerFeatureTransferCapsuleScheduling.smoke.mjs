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
    const capsuleBuilds = [];
    const capsuleRenders = [];
    let capsuleVisibleKey = '__init__';
    const augmentCalls = [];
    let transferData = stationData;

    const feature = createLayerFeature({
        baseStationsGeoJSON: stationData,
        augmentStationLayerGeoJSON: (data) => {
            augmentCalls.push(data);
            return {
                ...data,
                features: [
                    ...(Array.isArray(data?.features) ? data.features : []),
                    {
                        type: 'Feature',
                        properties: { id: '__preview_virtual__:base-line:L1:S1' },
                        geometry: { type: 'Point', coordinates: [99, 99] }
                    }
                ]
            };
        },
        buildTransferCapsuleGeoJSON: (data, groups, options = {}) => {
            capsuleBuilds.push({
                stationCount: data?.features?.length || 0,
                visibleIds: options.visibleStationIds instanceof Set
                    ? Array.from(options.visibleStationIds).sort()
                    : null
            });
            return { lines: { type: 'FeatureCollection', features: [] }, centroids: { type: 'FeatureCollection', features: [] } };
        },
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
        getTransferCapsuleVisibleKey: () => capsuleVisibleKey,
        getTransferCapsuleStationsData: () => transferData,
        getTransferCapsuleStationGroups: () => [],
        getVisibleStationIdsForTransferCapsules: () => new Set(['S1']),
        getZoom: () => 12.123,
        getViewportStationIdsForTransferCapsules: () => new Set(['S1']),
        invalidateTransferCapsuleData: (key) => {
            invalidations.push(key);
            capsuleVisibleKey = key;
        },
        renderTransferCapsules: (data) => capsuleRenders.push(data),
        rebuildStationCoordMap: (data) => rebuilds.push(data),
        requestFrame: immediateFrame,
        setTransferCapsuleVisibleKey: (key) => {
            capsuleVisibleKey = key;
        },
        syncTransferCapsuleStationsData: (data) => {
            transferData = data;
            transferSyncs.push(data);
        },
        toTransferCapsuleVisibleKey: (ids, options = {}) => {
            const scope = options.viewportOnly ? 'viewport' : 'final';
            return `${scope}:${ids instanceof Set ? Array.from(ids).sort().join('|') : '*'}`;
        },
        updateStationCircleCoordinates: (data) => circleUpdates.push(data),
        updateStationLabelCoordinates: (data) => labelUpdates.push(data),
        updateStationsSourceData: (data) => sourceUpdates.push(data)
    });

    feature.setupCollisionController({ stationLabels: [], stationCircles: [] });

    assert.equal(feature.syncStationOffsetForZoom(12.123, { phase: 'visual', reason: 'zoom' }), true);
    assert.deepEqual(built, [12.123]);
    assert.equal(sourceUpdates.length, 1);
    assert.equal(sourceUpdates[0].features.length, 2);
    assert.equal(labelUpdates.length, 0);
    assert.equal(circleUpdates.length, 1);
    assert.equal(rebuilds.length, 0);
    assert.equal(transferSyncs.length, 1);
    assert.equal(transferSyncs[0].features.length, 2);
    assert.equal(augmentCalls.length, 1);
    assert.deepEqual(capsuleBuilds, [{ stationCount: 2, visibleIds: ['S1'] }]);
    assert.equal(capsuleRenders.length, 1);
    assert.equal(invalidations.length, 0);
    assert.equal(collisionSchedules.length, 0);

    assert.equal(feature.syncStationOffsetForZoom(12.123, { phase: 'final', reason: 'settling' }), true);
    assert.deepEqual(built, [12.123]);
    assert.equal(sourceUpdates.length, 1);
    assert.equal(labelUpdates.length, 1);
    assert.equal(labelUpdates[0].features.length, 1);
    assert.equal(circleUpdates.length, 1);
    assert.equal(rebuilds.length, 1);
    assert.equal(transferSyncs.length, 2);
    assert.deepEqual(invalidations, ['offset-zoom:12.123']);
    assert.deepEqual(capsuleBuilds, [
        { stationCount: 2, visibleIds: ['S1'] },
        { stationCount: 2, visibleIds: ['S1'] }
    ]);
    assert.equal(capsuleRenders.length, 2);
    assert.deepEqual(collisionSchedules, ['collision']);

    assert.equal(feature.syncStationOffsetForZoom(12.123, { phase: 'final', reason: 'zoomend' }), false);
    assert.equal(sourceUpdates.length, 1);
    assert.equal(rebuilds.length, 1);

    assert.equal(feature.syncStationOffsetForZoom(12.5, { phase: 'final', reason: 'zoomend' }), true);
    assert.deepEqual(built, [12.123, 12.5]);
    assert.equal(sourceUpdates.length, 2);
    assert.equal(sourceUpdates[1].features.length, 2);
    assert.equal(rebuilds.length, 2);
}

{
    const baseStations = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: { id: 'S1' },
            geometry: { type: 'Point', coordinates: [0, 0] }
        }]
    };
    const built = [];
    const sourceUpdates = [];
    const nativePreviews = [];
    const nativeClears = [];
    const feature = createLayerFeature({
        baseStationsGeoJSON: baseStations,
        buildStationNativeOffsetPreviewBuckets: ({ fromStationsGeoJSON, toStationsGeoJSON }) => {
            nativePreviews.push({
                from: fromStationsGeoJSON.features[0].geometry.coordinates,
                to: toStationsGeoJSON.features[0].geometry.coordinates
            });
            return {
                status: 'ready',
                buckets: [{ dx: 2, dy: 3, stationIds: ['S1'] }]
            };
        },
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
        applyNativeStationOffsetPreview: ({ buckets }) => {
            nativePreviews[nativePreviews.length - 1].buckets = buckets;
            return true;
        },
        clearNativeStationOffsetPreview: () => nativeClears.push('clear'),
        getZoom: () => 12.25,
        projectLngLatForStationOffsetPreview: ([lng, lat]) => ({ x: lng, y: lat }),
        rebuildStationCoordMap: () => {},
        syncTransferCapsuleStationsData: () => {},
        updateStationsSourceData: (data) => sourceUpdates.push(data)
    });

    assert.equal(feature.syncStationOffsetForZoom(12.25, { phase: 'visual', reason: 'zoom' }), true);
    assert.deepEqual(built, [12.25]);
    assert.equal(sourceUpdates.length, 0);
    assert.equal(nativePreviews.length, 1);
    assert.deepEqual(nativePreviews[0].from, [0, 0]);
    assert.deepEqual(nativePreviews[0].to, [12.25, 12.25]);
    assert.deepEqual(nativePreviews[0].buckets, [{ dx: 2, dy: 3, stationIds: ['S1'] }]);

    assert.equal(feature.syncStationOffsetForZoom(12.25, { phase: 'final', reason: 'zoomend' }), true);
    assert.equal(sourceUpdates.length, 1);
    assert.deepEqual(sourceUpdates[0].features[0].geometry.coordinates, [12.25, 12.25]);
    assert.deepEqual(nativeClears, ['clear']);
}

console.log('layer feature transfer capsule scheduling smoke ok');
