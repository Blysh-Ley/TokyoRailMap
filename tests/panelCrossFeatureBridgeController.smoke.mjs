import assert from 'node:assert/strict';

import { createPanelCrossFeatureBridgeController } from '../src/features/panel/panelCrossFeatureBridgeController.js';

const journeyCalls = [];
const searchCalls = [];
const timePickerState = {};
const timetableEntries = new Map();

const controller = createPanelCrossFeatureBridgeController({
    getJourneyUi: () => ({
        setOriginStation: (stationId, stationName, options) => {
            journeyCalls.push(['origin', stationId, stationName, options]);
        },
        setDestinationStation: (stationId, stationName, options) => {
            journeyCalls.push(['destination', stationId, stationName, options]);
        },
        recompute: () => {
            journeyCalls.push(['recompute']);
        }
    }),
    getSearchMapActions: () => ({
        clearStationSelection: () => {
            searchCalls.push(['clearStationSelection']);
        },
        clearTripPathPreviewBySource: (source) => {
            searchCalls.push(['clearTripPathPreviewBySource', source]);
        }
    }),
    getTimePickerStateTarget: () => timePickerState,
    getTimetableCache: () => ({
        get: (lineId) => timetableEntries.get(lineId) || null,
        preloadByLineIds: async (lineIds) => {
            timetableEntries.set(lineIds[0], { lineId: lineIds[0], loaded: true });
        }
    })
});

assert.equal(controller.setJourneyStation({
    field: 'origin',
    stationId: 'S1',
    stationName: 'Tokyo'
}), true);
assert.equal(controller.setJourneyStation({
    field: 'destination',
    stationId: 'S2',
    stationName: 'Shinjuku'
}), true);
assert.deepEqual(journeyCalls.slice(0, 2), [
    ['origin', 'S1', 'Tokyo', { expand: true, recompute: true }],
    ['destination', 'S2', 'Shinjuku', { expand: true, recompute: true }]
]);

assert.deepEqual(controller.applyStationToJourneyField({
    field: 'origin',
    stationId: 'S3',
    stationName: 'Ueno'
}), {
    appliedJourney: true,
    clearedSelection: true
});
assert.deepEqual(searchCalls[0], ['clearStationSelection']);

assert.equal(controller.clearTripPathPreviewBySource('panel-dir-branch'), true);
assert.deepEqual(searchCalls[1], ['clearTripPathPreviewBySource', 'panel-dir-branch']);

assert.equal(controller.recomputeJourney(), true);
assert.deepEqual(journeyCalls.at(-1), ['recompute']);

assert.equal(controller.setTimePickerOpenState(true), true);
assert.equal(timePickerState.__TokyoRailTimePickerOpen, true);

assert.deepEqual(await controller.loadTimetableForLineId('L1'), { lineId: 'L1', loaded: true });
assert.equal(await controller.loadTimetableForLineId(''), null);

const missingController = createPanelCrossFeatureBridgeController({
    getJourneyUi: () => null,
    getSearchMapActions: () => null,
    getTimePickerStateTarget: () => null,
    getTimetableCache: () => null
});

assert.equal(missingController.setJourneyStation({ field: 'origin' }), false);
assert.deepEqual(missingController.applyStationToJourneyField({ field: 'origin' }), {
    appliedJourney: false,
    clearedSelection: false
});
assert.equal(missingController.clearTripPathPreviewBySource('x'), false);
assert.equal(missingController.recomputeJourney(), false);
assert.equal(missingController.setTimePickerOpenState(false), false);
assert.equal(await missingController.loadTimetableForLineId('L2'), null);

console.log('panel cross-feature bridge controller smoke ok');
