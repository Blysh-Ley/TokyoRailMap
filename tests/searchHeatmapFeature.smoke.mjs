import assert from 'node:assert/strict';

import { createSearchHeatmapFeature } from '../src/features/search/searchHeatmapFeature.js';

const deferred = () => {
    let resolve;
    const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
};

{
    const first = deferred();
    const second = deferred();
    const calls = [];
    const overlays = [];
    const planner = ({ originStationId, signal }) => {
        calls.push({ originStationId, signal });
        return originStationId === 'A' ? first.promise : second.promise;
    };
    const feature = createSearchHeatmapFeature({
        loadReachableStops: async () => planner,
        updateOverlay: async (payload) => overlays.push(payload)
    });

    feature.setMinutes(30);
    const firstDraw = feature.draw({ originStationId: 'A', minutes: 30 });
    await Promise.resolve();
    const secondDraw = feature.draw({ originStationId: 'B', minutes: 30 });
    await Promise.resolve();

    assert.equal(calls.length, 2);
    assert.equal(calls[0].signal.aborted, true);
    assert.equal(calls[1].signal.aborted, false);

    first.resolve({ reachableStops: ['OLD'], remainingMsByStop: new Map() });
    assert.equal(await firstDraw, false);
    assert.equal(overlays.length, 0);

    second.resolve({ reachableStops: ['NEW'], remainingMsByStop: new Map() });
    assert.equal(await secondDraw, true);
    assert.deepEqual(overlays[0].reachableStops, ['NEW']);
    assert.equal(overlays[0].opacity, 0.6);
}

{
    const result = deferred();
    let signal = null;
    let clearCount = 0;
    let overlayCount = 0;
    const feature = createSearchHeatmapFeature({
        clearOverlay: () => { clearCount += 1; },
        loadReachableStops: async () => async (options) => {
            signal = options.signal;
            return result.promise;
        },
        updateOverlay: async () => { overlayCount += 1; }
    });

    feature.setMinutes(15);
    const draw = feature.draw({ originStationId: 'A', minutes: 15 });
    await Promise.resolve();
    feature.clear();
    assert.equal(signal.aborted, true);
    assert.equal(clearCount, 1);
    result.resolve({ reachableStops: ['A'], remainingMsByStop: new Map() });
    assert.equal(await draw, false);
    assert.equal(overlayCount, 0);
}

{
    const calls = [];
    const feature = createSearchHeatmapFeature({
        loadReachableStops: async () => async (options) => {
            calls.push(options);
            return { reachableStops: [], remainingMsByStop: new Map() };
        },
        updateOverlay: async () => {}
    });

    feature.setMinutes(30);
    assert.equal(await feature.draw({ originStationId: 'A', minutes: 30 }), true);
    assert.equal(calls[0].serviceDay, 'Weekday');
    assert.equal(calls[0].minutes, 30);
    assert.equal(calls[0].signal instanceof AbortSignal, true);
}

{
    const oldOverlayStarted = deferred();
    const releaseOldOverlay = deferred();
    let visibleOverlay = '';
    const feature = createSearchHeatmapFeature({
        loadReachableStops: async () => async ({ originStationId }) => ({
            reachableStops: [originStationId],
            remainingMsByStop: new Map()
        }),
        updateOverlay: async ({ reachableStops }) => {
            const stationId = reachableStops[0];
            if (stationId === 'OLD') {
                oldOverlayStarted.resolve();
                await releaseOldOverlay.promise;
            }
            visibleOverlay = stationId;
        }
    });

    feature.setMinutes(30);
    const oldDraw = feature.draw({ originStationId: 'OLD', minutes: 30 });
    await oldOverlayStarted.promise;
    const newDraw = feature.draw({ originStationId: 'NEW', minutes: 30 });
    assert.equal(await newDraw, true);
    assert.equal(visibleOverlay, 'NEW');

    releaseOldOverlay.resolve();
    assert.equal(await oldDraw, false);
    assert.equal(visibleOverlay, 'NEW', 'a stale pending overlay update must not overwrite the latest result');
}

{
    let overlayAttempt = 0;
    const events = [];
    const feature = createSearchHeatmapFeature({
        loadReachableStops: async () => async () => ({
            reachableStops: ['A'],
            remainingMsByStop: new Map()
        }),
        updateOverlay: async () => {
            overlayAttempt += 1;
            return overlayAttempt > 1;
        }
    });
    feature.subscribe((event) => events.push(event));

    feature.setMinutes(30);
    assert.equal(await feature.draw({ originStationId: 'A', minutes: 30 }), false);
    assert.equal(events.some((event) => event.type === 'drawn'), false);
    assert.equal(await feature.draw({ originStationId: 'A', minutes: 30 }), true);
    assert.equal(events.filter((event) => event.type === 'drawn').length, 1);
}

{
    const overlayStarted = deferred();
    const releaseOverlay = deferred();
    let clearAttempt = 0;
    let visibleOverlay = '';
    const feature = createSearchHeatmapFeature({
        clearOverlay: () => {
            clearAttempt += 1;
            if (clearAttempt === 1) return false;
            visibleOverlay = '';
            return true;
        },
        loadReachableStops: async () => async () => ({
            reachableStops: ['OLD'],
            remainingMsByStop: new Map()
        }),
        updateOverlay: async ({ reachableStops }) => {
            overlayStarted.resolve();
            await releaseOverlay.promise;
            visibleOverlay = reachableStops[0];
        }
    });

    feature.setMinutes(30);
    const staleDraw = feature.draw({ originStationId: 'OLD', minutes: 30 });
    await overlayStarted.promise;
    assert.equal(feature.clear(), false);
    releaseOverlay.resolve();
    assert.equal(await staleDraw, false);
    assert.equal(clearAttempt, 2, 'the stale write must retry the desired clear state');
    assert.equal(visibleOverlay, '');
}

console.log('search heatmap feature smoke ok');
