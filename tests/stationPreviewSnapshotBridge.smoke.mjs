import assert from 'node:assert/strict';
import { createRoutePreviewController } from '../src/features/route/routePreviewController.js';
import { createRoutePreviewBridgeApi } from '../src/features/route/routePreviewBridgeApi.js';
import { createSearchMapBridge } from '../src/features/search/searchMapBridge.js';
import { createPanelCrossFeatureBridgeController } from '../src/features/panel/panelInteractionCore.js';
import { createRouteFeature } from '../src/features/route/routeFeature.js';
import { getPreparedStationPreview, preloadPreparedStationPreviews, rememberPreparedStationPreview }
    from '../src/services/stationPreviewMaterialization.js';

const snapshot = { source: 'station-through-branch', payload: { previewSource: 'station-through-branch' },
    built: { bbox: { minLng: 1, maxLng: 2 } } };
let activeSource = snapshot.source;
const fits = [];
const actions = [];
let received;
const controller = createRoutePreviewController({
    routeFeature: { applyTripPreviewSnapshot: (input) => { received = input; return { ok: true }; } },
    store: { dispatch: (action) => actions.push(action) },
    resolveTripPreviewPayloadSource: (payload) => payload.previewSource,
    resolveTripPreviewStationOverrideColor: () => '#123456',
    updateTripEndpointPopups: () => 'updated',
    previewFitWithSidePanels: (bbox, options) => fits.push({ bbox, options }),
    getTripPreviewActiveSource: () => activeSource
});
let mobile = false;
const routeApi = createRoutePreviewBridgeApi({
    applyTripPreviewSnapshot: controller.applyTripPreviewSnapshot,
    fitTripPreviewSnapshot: controller.fitTripPreviewSnapshot,
    shouldPreserveStationViewport: () => mobile
});
const searchActions = createSearchMapBridge({ routePreviewApi: routeApi });
const panelBridge = createPanelCrossFeatureBridgeController({ getSearchMapActions: () => searchActions });
assert.deepEqual(panelBridge.applyTripPreviewSnapshot(snapshot, { fitMode: 'none', preserveViewport: true }), { ok: true });
assert.equal(received.snapshot, snapshot);
assert.equal(received.options.preserveViewport, true);
assert.equal(received.resolveStationOverrideColor(), '#123456');
const stopIds = new Set(['a']);
assert.equal(received.resolveVirtualTripStationIds({ aggregate: { stopIds } }), stopIds);
assert.equal(received.updateEndpointPopups(), 'updated');
assert.equal(actions.length, 1);
assert.equal(panelBridge.fitTripPreviewSnapshot(snapshot, { duration: 200 }), true);
assert.deepEqual(fits[0], { bbox: snapshot.built.bbox, options: { duration: 200 } });
activeSource = 'panel-trip';
assert.equal(panelBridge.fitTripPreviewSnapshot(snapshot), false);
assert.equal(fits.length, 1);
mobile = true;
assert.equal(panelBridge.fitTripPreviewSnapshot(snapshot), true);
assert.equal(fits.length, 1);
panelBridge.applyTripPreviewSnapshot(snapshot, { fitMode: 'commit' });
assert.equal(received.options.fitMode, 'none');
assert.equal(received.options.preserveViewport, true);

await preloadPreparedStationPreviews({ enabled: false, profile: 'base-groups', stationFeatures: [
    { properties: { id: 'hub', serving_ids: ['a', 'b', 'c', 'd', 'e', 'f'] } },
    { properties: { id: 'ordinary', serving_ids: ['a'] } }
] });
rememberPreparedStationPreview({ stationId: 'hub', serviceDay: 'Weekday', theme: 'light', requestsSignature: 'default', snapshot });
assert.equal(getPreparedStationPreview('hub', 'Weekday', 'light').snapshot, snapshot);
assert.equal(getPreparedStationPreview('hub', 'SaturdayHoliday', 'light'), null);
assert.equal(getPreparedStationPreview('hub', 'Weekday', 'dark'), null);
rememberPreparedStationPreview({ stationId: 'ordinary', serviceDay: 'Weekday', theme: 'light', requestsSignature: 'default', snapshot });
assert.equal(getPreparedStationPreview('ordinary', 'Weekday', 'light'), null);
await preloadPreparedStationPreviews({ enabled: false, profile: 'merged-groups', stationFeatures: [
    { properties: { id: 'hub', serving_ids: ['a', 'b', 'c', 'd', 'e', 'f'] } }
] });
assert.equal(getPreparedStationPreview('hub', 'Weekday', 'light'), null);

const queued = [];
const emitted = [];
const previousFrame = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = (callback) => queued.push(callback);
try {
    const feature = createRouteFeature({ tripPreviewRenderer: { ensureLayers() {}, setData() {} },
        emitTripPreviewUpdated: ({ payload }) => emitted.push(payload.tripKey) });
    const previewBuilt = { lineFc: { type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: [[1, 1], [2, 2]] } }] },
        stopFc: { type: 'FeatureCollection', features: [] }, lineIds: new Set(['line']), stopIds: new Set(), pastStopIds: new Set() };
    const previewPayload = { previewSource: snapshot.source, virtualTrips: [{ segments: [{ lineId: 'line', stationIds: ['a', 'b'] }] }] };
    feature.previewTripPath({ payload: { ...previewPayload, tripKey: 'old' }, buildAggregateFromPayloadList: () => previewBuilt,
        resolvePayloadSource: () => snapshot.source });
    assert.equal(queued.length, 1);
    feature.applyTripPreviewSnapshot({ snapshot: { source: snapshot.source, payload: { ...previewPayload, tripKey: 'new' }, built: previewBuilt },
        resolvePayloadSource: () => snapshot.source });
    queued[0]();
    assert.deepEqual(emitted, ['new']);
} finally {
    globalThis.requestAnimationFrame = previousFrame;
}
console.log('完整快照跨层应用、延后定位、移动端视野与物化内容范围通过。');
