import assert from 'node:assert/strict';

import {
    ROUTE_MAP_TYPE_PREVIEW_SOURCE,
    buildRouteMapTypePreviewPayload
} from '../src/domain/routeMapTypePreview.js';

const payload = {
    selectedLine: {
        lineId: 'Test.Line',
        lineName: '测试线',
        lineColor: '#123456'
    },
    lineStations: {
        stationIds: ['S1', 'S2', 'S3', 'S4'],
        stationNames: ['一', '二', '三', '四']
    },
    directions: [
        {
            dir: 'Outbound',
            types: [
                {
                    typeId: 'Test.Local',
                    typeName: '普通',
                    color: '#888',
                    totalTrips: 100,
                    pattern: { stopMask: [true, true, true, true] }
                },
                {
                    typeId: 'Test.Rapid',
                    typeName: '快速',
                    color: '#f00',
                    totalTrips: 20,
                    pattern: { stopMask: [true, false, true, true] }
                },
                {
                    typeId: 'Test.Express',
                    typeName: '急行',
                    color: '#0f0',
                    totalTrips: 10,
                    pattern: { stopMask: [true, false, false, true] }
                }
            ]
        },
        {
            dir: 'Inbound',
            types: [
                {
                    typeId: 'Test.AllStop',
                    typeName: '各站停车',
                    color: '#888',
                    totalTrips: 90,
                    pattern: { stopMask: [true, true, true, true] }
                },
                {
                    typeId: 'Test.Rapid',
                    typeName: '快速',
                    color: '#f00',
                    totalTrips: 12,
                    pattern: { stopMask: [true, true, false, true] }
                }
            ]
        }
    ]
};

const preview = buildRouteMapTypePreviewPayload(payload);

assert.ok(preview);
assert.equal(preview.previewSource, ROUTE_MAP_TYPE_PREVIEW_SOURCE);
assert.equal(preview.selectedLineId, 'Test.Line');
assert.equal(preview.mainLineId, 'Test.Line');
assert.equal(preview.fitMode, 'none');
assert.equal(preview.virtualTrips.length, 3);

const [base, rapid, express] = preview.virtualTrips;

assert.equal(base.selectedLineId, 'Test.Line');
assert.equal(base.segments[0].lineId, 'Test.Line');
assert.equal(base.segments[0].r, 'Test.Line');
assert.equal(base.segments[0].lineOffsetUnits, 0);
assert.deepEqual(base.segments[0].stationIds, ['S1', 'S2', 'S3', 'S4']);

assert.match(rapid.selectedLineId, /^TokyoRail\.RouteMapType\.Test\.Line\.1\./);
assert.equal(rapid.segments[0].r, 'Test.Line');
assert.equal(rapid.segments[0].geometryLineId, 'Test.Line');
assert.equal(rapid.segments[0].offsetLineId, 'Test.Line');
assert.equal(rapid.segments[0].lineOffsetUnits, 3);
assert.equal(rapid.segments[0].stationOffsetUnits, 2);
assert.equal(rapid.segments[0].highlightColor, '#f00');
assert.deepEqual(
    rapid.segments[0].stationIds,
    ['S1', 'S2', 'S3', 'S4'],
    'one-direction-only rapid stops should be unioned into ordinary stop treatment'
);

assert.match(express.selectedLineId, /^TokyoRail\.RouteMapType\.Test\.Line\.2\./);
assert.equal(express.segments[0].lineOffsetUnits, 6);
assert.equal(express.segments[0].stationOffsetUnits, 4);
assert.equal(express.segments[0].highlightColor, '#0f0');
assert.deepEqual(express.segments[0].stationIds, ['S1', 'S4']);

const offsetPreview = buildRouteMapTypePreviewPayload(payload, {
    baseLineOffsetUnits: -1
});
assert.equal(offsetPreview.virtualTrips[0].segments[0].lineOffsetUnits, -1);
assert.equal(offsetPreview.virtualTrips[1].segments[0].lineOffsetUnits, 2);
assert.equal(offsetPreview.virtualTrips[1].segments[0].stationOffsetUnits, 1);
assert.equal(offsetPreview.virtualTrips[2].segments[0].lineOffsetUnits, 5);
assert.equal(offsetPreview.virtualTrips[2].segments[0].stationOffsetUnits, 3);

const localOnly = buildRouteMapTypePreviewPayload({
    ...payload,
    directions: [{
        dir: 'Outbound',
        types: [{
            typeId: 'Test.Local',
            typeName: '普通',
            pattern: { stopMask: [true, true, true, true] }
        }]
    }]
});
assert.equal(localOnly, null);

console.log('route map type preview smoke ok');
