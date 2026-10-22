import assert from 'node:assert/strict';
import { createRouteFeature } from '../src/features/route/routeFeature.js';
import { createRoutePreviewController } from '../src/features/route/routePreviewController.js';

const payload = { selectedLineId: 'line', tripKey: 'station', previewSource: 'station-through-branch', fitMode: 'commit',
    virtualTrips: [{ segments: [{ lineId: 'line', stationIds: ['a', 'b'] }] }] };
const built = { lineFc: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { lineId: 'line' },
    geometry: { type: 'LineString', coordinates: [[139, 35], [140, 36]] } }] },
    stopFc: { type: 'FeatureCollection', features: [] }, lineIds: new Set(['line']), stopIds: new Set(['a', 'b']),
    pastStopIds: new Set(), startStationId: 'a', endStationId: 'b', bbox: { minLng: 139, maxLng: 140 } };
const makeFeature = () => createRouteFeature({ tripPreviewRenderer: {} });
const fresh = makeFeature();
const cached = makeFeature();
const freshFits = [];
const cachedFits = [];
const common = { isMultiSelectModeEnabled: () => true, resolvePayloadSource: (value) => value.previewSource,
    buildSelectionKey: () => 'station-key' };
const original = fresh.previewTripPath({ ...common, payload, buildAggregateFromPayloadList: () => built,
    rebuildMultiTripPreview: (fit) => freshFits.push(fit) });
let clears = 0;
const applied = cached.applyTripPreviewSnapshot({ ...common, snapshot: { source: payload.previewSource, payload, built },
    options: { fitMode: 'commit', clearBefore: true }, clearTripPathPreview: () => { clears += 1; },
    rebuildMultiTripPreview: (fit) => cachedFits.push(fit) });
assert.equal(original.ok, true);
assert.equal(applied.ok, true);
assert.deepEqual(cached.getTripPreviewSelection('station-key'), fresh.getTripPreviewSelection('station-key'));
assert.deepEqual(cachedFits, freshFits);
assert.equal(clears, 0);
cached.toggleTripPreviewSelectionVisibility('station-key');
assert.equal(cached.getTripPreviewSelection('station-key').hidden, true);
cached.applyTripPreviewSnapshot({ ...common, snapshot: { source: payload.previewSource, payload, built },
    options: { fitMode: 'none', preserveViewport: true }, rebuildMultiTripPreview: (fit) => cachedFits.push(fit) });
assert.equal(cached.getTripPreviewSelection('station-key').hidden, false);
assert.equal(cachedFits.at(-1), 'none');
const combinedBounds = { minLng: 130, maxLng: 145 };
const fits = [];
const controller = createRoutePreviewController({ routeFeature: cached, isMultiSelectModeEnabled: () => true,
    buildTripPreviewSelectionKey: () => 'station-key', buildTripPreviewAggregate: () => ({ bbox: combinedBounds }),
    previewFitWithSidePanels: (bbox) => fits.push(bbox) });
assert.equal(controller.fitTripPreviewSnapshot({ source: payload.previewSource, payload, built }), true);
assert.equal(fits[0], combinedBounds);
cached.toggleTripPreviewSelectionVisibility('station-key');
assert.equal(controller.fitTripPreviewSnapshot({ source: payload.previewSource, payload, built }), false);
cached.deleteTripPreviewSelection('station-key');
assert.equal(cached.getTripPreviewSelectionSize(), 0);
console.log('站点物化预览与实时预览的多选记录一致，显示/隐藏/删除与整体定位通过。');
