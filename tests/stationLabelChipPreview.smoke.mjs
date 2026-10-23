import assert from 'node:assert/strict';
import { buildStationLabelPreviewIndex, selectStationLabelPreviewSegments } from '../src/domain/stationLabelChipPreview.js';

const groups = new Map([
    ['A', new Set(['A', 'B'])], ['B', new Set(['A', 'B'])],
    ['C', new Set(['B', 'C'])]
]);
const selections = [
    { payload: { typeColor: '#red', segments: [{ lineId: 'L2', stationIds: ['C', 'B', 'C'] },
        { lineId: 'L1', stationIds: ['A'], typeColor: '#blue' }],
        virtualTrips: [{ segments: [{ r: 'L2', stationIds: ['C'], typeColor: '#red' }] }] } },
    { hidden: true, payload: { segments: [{ lineId: '隐藏', stationIds: ['A'] }] } },
    { payload: { segments: [{ lineId: '独立', stationIds: ['D'] }, { lineId: '无站', stationIds: [] }] } }
];
const index = buildStationLabelPreviewIndex({ visibleTripSelections: selections, getTransferStationIds: id => groups.get(id) });
const models = ids => selectStationLabelPreviewSegments(index, ids).map(({ lineId, typeColor }) => ({ lineId, typeColor }));
assert.deepEqual(models(['A', 'B']), [
    { lineId: 'L2', typeColor: '#red' }, { lineId: 'L1', typeColor: '#blue' }, { lineId: 'L2', typeColor: '#red' }
]);
assert.deepEqual(models(['D']), [{ lineId: '独立', typeColor: '' }]);
assert.deepEqual(models(['未知']), []);
assert.deepEqual(models(['A']), [{ lineId: 'L2', typeColor: '#red' }, { lineId: 'L1', typeColor: '#blue' }]);
assert.deepEqual(models(['C']), [{ lineId: 'L2', typeColor: '#red' }, { lineId: 'L2', typeColor: '#red' }]);
console.log('站名班次路段索引验证通过。');
