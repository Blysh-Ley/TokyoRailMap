import assert from 'node:assert/strict';

import { buildPanelStationRenderInputs } from '../src/features/panel/panelStationRenderInputs.js';

const inputs = await buildPanelStationRenderInputs({
    stationId: 'station-a',
    stationNameZh: 'Station A',
    displayServingIds: ['JR.Main', 'JR.Main.Temp'],
    buildPanelLineMergeInfo: ({ servingLineIds }) => ({
        displayLineIds: ['JR.Main.Temp'],
        lineGroupByMainId: new Map([['JR.Main.Temp', servingLineIds]])
    }),
    applyTemporarySourceLineOverrides: ({ lineGroupByMainId }) => {
        const next = new Map(lineGroupByMainId);
        next.set('JR.Main.Temp', ['JR.Main', 'JR.Main.Branch']);
        return next;
    },
    buildTransferLineStationNameMap: async ({ stationId, servingLineIds, lineGroupByMainId }) => {
        assert.equal(stationId, 'station-a');
        assert.deepEqual(servingLineIds, ['JR.Main.Temp']);
        assert.deepEqual(lineGroupByMainId.get('JR.Main.Temp'), ['JR.Main', 'JR.Main.Branch']);
        return new Map([['JR.Main.Temp', { stationId: 'JR.Main.station-a', name: 'Station A JR' }]]);
    }
});

assert.deepEqual(inputs.displayServingIds, ['JR.Main.Temp']);
assert.deepEqual(inputs.lineGroupByMainId.get('JR.Main.Temp'), ['JR.Main', 'JR.Main.Branch']);
assert.deepEqual(inputs.lineStationNameByLineId.get('JR.Main.Temp'), { stationId: 'JR.Main.station-a', name: 'Station A JR' });

console.log('panel station render inputs smoke ok');
