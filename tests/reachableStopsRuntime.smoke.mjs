import assert from 'node:assert/strict';

import {
    buildReachableStopsOverlayGeoJSON,
    createTravelSearchMapRuntime,
    getReachableStopsExtremeLabelIdSet,
    getReachableStopsLabelIdSet,
    reachableStopsCircleRadiusMeters
} from '../src/features/search/reachableStopsRuntime.js';

{
    assert.equal(reachableStopsCircleRadiusMeters(60_000), 250);
    assert.equal(reachableStopsCircleRadiusMeters(20 * 60_000), 1000);
    assert.equal(reachableStopsCircleRadiusMeters(60 * 60_000), 1000);
}

{
    const remainingMsByStop = new Map([
        ['A', [{ remainMs: 600_000, count: 5 }, { remainMs: 300_000, count: 10 }]],
        ['B', [{ remainMs: 600_000, count: 2 }]]
    ]);
    const built = buildReachableStopsOverlayGeoJSON({
        payload: { reachableStops: ['A', 'B'], remainingMsByStop },
        getStationCoord: (stationId) => ({ A: [139.7, 35.6], B: [139.8, 35.7] })[stationId]
    });

    assert.equal(built.geojson.features.length, 3);
    assert.deepEqual(
        built.geojson.features.map((feature) => feature.properties.shiftCount),
        [2, 5, 10]
    );
    assert.deepEqual([...getReachableStopsLabelIdSet(built.geojson)].sort(), ['A', 'B']);
    assert.deepEqual([...getReachableStopsExtremeLabelIdSet(built.geojson)].sort(), ['A', 'B']);
    assert.equal(built.dynamicColorExpression[0], 'interpolate');
}

{
    const rendererCalls = [];
    const overlayRenderer = {
        clear: () => rendererCalls.push(['clear']),
        ensureLayers: (color, opacity) => rendererCalls.push(['ensure', color, opacity]),
        fitToBounds: (geojson) => rendererCalls.push(['fit', geojson.features.length]),
        setData: (geojson) => rendererCalls.push(['setData', geojson.features.length])
    };
    const stationLabels = [{ stationId: 'A' }, { stationId: 'B' }];
    let collisionRefreshCount = 0;
    const runtime = createTravelSearchMapRuntime({
        overlayRenderer,
        getStationCoord: (stationId) => ({ A: [139.7, 35.6], B: [139.8, 35.7] })[stationId],
        getStationLabels: () => stationLabels,
        scheduleCollisionLayerRefresh: () => { collisionRefreshCount += 1; }
    });

    await runtime.updateReachableStopsOverlay({
        reachableStops: ['A', 'B'],
        remainingMsByStop: new Map([
            ['A', [{ remainMs: 600_000, count: 1 }]],
            ['B', [{ remainMs: 600_000, count: 3 }]]
        ]),
        opacity: 0.2
    });

    assert.equal(runtime.getReachableStopsLabelIds().size, 2);
    assert.equal(rendererCalls[0][0], 'ensure');
    assert.equal(rendererCalls[1][0], 'setData');
    assert.equal(rendererCalls[2][0], 'fit');
    assert.equal(collisionRefreshCount, 1);
    assert.equal(stationLabels.some((item) => item.collisionPriorityBoost === 1), true);

    runtime.clearReachableStopsOverlay();
    assert.equal(runtime.getReachableStopsLabelIds(), null);
    assert.deepEqual(rendererCalls.at(-1), ['clear']);
}

{
    const removed = [];
    const markers = [];
    const pinStationChanges = [];
    const stationCoords = new Map([['S1', [139.75, 35.65]]]);
    const mapEngine = {
        createMarker: ({ element, anchor, offset }) => ({
            element,
            anchor,
            offset,
            lngLat: null,
            setLngLat(coord) {
                this.lngLat = coord;
                return this;
            },
            remove() {
                removed.push(this);
            }
        }),
        addMarker: (marker) => markers.push(marker)
    };
    const runtime = createTravelSearchMapRuntime({
        mapEngine,
        getStationCoord: (stationId) => stationCoords.get(stationId),
        createJourneyPickPinElement: async ({ type }) => ({ type }),
        onJourneyPickPinStationIdsChange: (ids) => pinStationChanges.push(ids)
    });

    await runtime.showJourneyPickPin({ stationId: 'S1', type: 'origin' });
    assert.deepEqual(markers[0].lngLat, [139.75, 35.65]);
    assert.equal(markers[0].element.type, 'origin');
    assert.deepEqual(pinStationChanges.at(-1), { origin: 'S1', destination: '' });

    stationCoords.set('S1', [139.8, 35.7]);
    runtime.syncJourneyPickPinsToStations();
    assert.deepEqual(markers[0].lngLat, [139.8, 35.7]);

    await runtime.showJourneyPickPin({ lngLat: { lng: 140, lat: 36 }, type: 'origin' });
    assert.equal(removed.length, 1);
    assert.deepEqual(markers[1].lngLat, [140, 36]);
    assert.deepEqual(pinStationChanges.at(-1), { origin: '', destination: '' });
}
