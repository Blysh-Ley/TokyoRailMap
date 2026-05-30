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

console.log('layer feature transfer capsule scheduling smoke ok');
