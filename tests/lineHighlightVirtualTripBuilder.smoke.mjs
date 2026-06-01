import assert from 'node:assert/strict';
import { buildLineHighlightVirtualTripPayloads } from '../src/domain/lineHighlightVirtualTripBuilder.js';

const railwaysIndexById = new Map([
    ['L1', {
        title: { 'zh-Hans': '一号线', en: 'Line 1' },
        stations: ['S1', 'S2', 'S3']
    }],
    ['L2', {
        title: { en: 'Line 2' },
        stationIds: ['A', 'B']
    }],
    ['SHORT', {
        title: { en: 'Too Short' },
        stations: ['ONLY']
    }]
]);

{
    const payloads = buildLineHighlightVirtualTripPayloads({
        lineIds: ['L1', 'L2', 'L1', '', 'MISSING', 'SHORT'],
        railwaysIndexById,
        getLineName: (lineId) => `fallback:${lineId}`,
        previewSource: 'base-line',
        fitMode: 'none'
    });

    assert.equal(payloads.length, 2);
    assert.equal(payloads[0].selectedLineId, 'L1');
    assert.equal(payloads[0].selectedLineName, '一号线');
    assert.equal(payloads[0].tripKey, 'L1');
    assert.equal(payloads[0].previewSource, 'base-line');
    assert.deepEqual(payloads[0].segments, [{
        kind: 'main',
        lineId: 'L1',
        stationIds: ['S1', 'S2', 'S3']
    }]);

    assert.equal(payloads[1].selectedLineId, 'L2');
    assert.equal(payloads[1].selectedLineName, 'Line 2');
    assert.deepEqual(payloads[1].segments[0].stationIds, ['A', 'B']);
}

{
    const payloads = buildLineHighlightVirtualTripPayloads({
        lineIds: new Set(['OBJ']),
        railwaysIndexById: {
            OBJ: {
                stations: ['O1', 'O2']
            }
        },
        getLineName: (lineId) => `Name ${lineId}`
    });

    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].selectedLineName, 'Name OBJ');
    assert.equal(payloads[0].previewSource, 'virtual');
}

{
    assert.deepEqual(buildLineHighlightVirtualTripPayloads(), []);
    assert.deepEqual(buildLineHighlightVirtualTripPayloads({ lineIds: [' '] }), []);
}

console.log('line highlight virtual trip builder smoke ok');
