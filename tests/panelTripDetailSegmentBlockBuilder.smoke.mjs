import assert from 'node:assert/strict';

import { buildPanelTripDetailSegmentBlocks } from '../src/features/panel/panelTripDetailSegmentBlockBuilder.js';

const throughBlocks = buildPanelTripDetailSegmentBlocks({
    segmentsWithPast: [
        { kind: 'main', lineId: 'JR.Yamanote', typeName: 'local', typeColor: '#11aa11' },
        { kind: 'nt', lineId: 'JR.Yamanote', typeName: 'local', typeColor: '#11aa11' }
    ],
    throughCategoryLabel: '直通先',
    throughCategoryColor: '#005aaa',
    currentLineDesc: { color: '#ff0000' },
    buildLineDescriptor: (lineId) => ({ color: lineId === 'JR.Yamanote' ? '#00aa00' : '' }),
    isSameLineName: (left, right) => left === right
});

assert.equal(throughBlocks.length, 1);
assert.equal(throughBlocks[0].descriptor.text, '直通先');
assert.equal(throughBlocks[0].descriptor.color, '#005aaa');
assert.equal(throughBlocks[0].segments.length, 2);

const mergedBlocks = buildPanelTripDetailSegmentBlocks({
    segmentsWithPast: [
        { kind: 'main', lineId: 'JR.Yamanote', typeName: 'local', typeColor: '#11aa11' },
        { kind: 'nt', lineId: 'JR.Yamanote', typeName: '', typeColor: '' },
        { kind: 'pt', lineId: 'JR.Keihin', typeName: 'rapid', typeColor: '#005aaa' }
    ],
    throughCategoryLabel: '',
    currentLineDesc: { color: '#ff0000' },
    buildLineDescriptor: (lineId) => ({ text: lineId, color: lineId === 'JR.Yamanote' ? '#00aa00' : '#005aaa' }),
    isSameLineName: (left, right) => left === right
});

assert.equal(mergedBlocks.length, 2);
assert.equal(mergedBlocks[0].segments.length, 2);
assert.equal(mergedBlocks[0].typeName, 'local');
assert.equal(mergedBlocks[0].typeColor, '#11aa11');
assert.equal(mergedBlocks[1].descriptor.text, 'JR.Keihin');

console.log('panel trip-detail segment block builder smoke ok');
