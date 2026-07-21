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
    }],
    ['LOOP', {
        title: { en: 'Loop Line' },
        stations: ['A', 'B', 'C', 'A']
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
        r: 'L1',
        geometryLineId: 'L1',
        offsetLineId: 'L1',
        stationIds: ['S1', 'S2', 'S3']
    }]);
    assert.deepEqual(payloads[0].chainLineIds, ['L1']);
    assert.equal(payloads[0].virtualTimetable[0].r, 'L1');

    assert.equal(payloads[1].selectedLineId, 'L2');
    assert.equal(payloads[1].selectedLineName, 'Line 2');
    assert.deepEqual(payloads[1].segments[0].stationIds, ['A', 'B']);
}

{
    const payloads = buildLineHighlightVirtualTripPayloads({
        lineIds: ['LOOP'],
        railwaysIndexById
    });

    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].mainTerminalStationId, 'A');
    assert.deepEqual(payloads[0].segments, [{
        kind: 'main',
        lineId: 'LOOP',
        r: 'LOOP',
        geometryLineId: 'LOOP',
        offsetLineId: 'LOOP',
        stationIds: ['A', 'B', 'C', 'A'],
        d: 'loop'
    }]);
    assert.deepEqual(payloads[0].chainLineIds, ['LOOP']);
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
