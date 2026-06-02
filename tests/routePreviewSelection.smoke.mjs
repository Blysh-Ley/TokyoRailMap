import assert from 'node:assert/strict';

import {
    buildEndpointStationIdSetFromPayloadList,
    buildLineCoordsCanonicalKey,
    buildTripPreviewAggregateFromPayloadList,
    buildTripPreviewLineFeatureDedupKey,
    buildTripPreviewSegmentsKey,
    buildTripPreviewSelectionKey,
    buildTripPreviewVirtualTripsKey,
    mergeTripPreviewBBox,
    normalizeDirPreviewPayload,
    normalizeTripPreviewSegment,
    normalizeTripPreviewSegments,
    normalizeTripPreviewVirtualTrips,
    resolveTripPreviewPayloadSource,
    toCoordKey
} from '../src/domain/routePreviewSelection.js';

const lineFeature = (lineId, coords, role = 'line') => ({
    type: 'Feature',
    properties: { lineId, role },
    geometry: { type: 'LineString', coordinates: coords }
});

const stopFeature = (id) => ({
    type: 'Feature',
    properties: { id },
    geometry: { type: 'Point', coordinates: [0, 0] }
});

const testSelectionKey = () => {
    assert.equal(resolveTripPreviewPayloadSource({ __previewSource: ' legacy ' }), 'legacy');
    assert.equal(resolveTripPreviewPayloadSource({ previewSource: '', source: 'fallback' }), 'fallback');

    assert.equal(
        buildTripPreviewSelectionKey({
            __previewSource: 'journey',
            selectedLineId: 'L1',
            tripKey: 'T1'
        }),
        'journey||L1||T1'
    );

    assert.equal(
        buildTripPreviewSelectionKey({
            previewSource: 'panel-dir-branch',
            previewKey: 'branch-1',
            selectedLineId: 'L2'
        }),
        'panel-dir-branch||preview||branch-1'
    );

    assert.equal(
        buildTripPreviewSelectionKey({
            source: 'segments',
            segments: [
                { lineId: 'L3', stationIds: ['S1', 'S2', 'S3'] }
            ]
        }),
        'segments||L3||L3:S1>S2>S3'
    );

    assert.equal(
        buildTripPreviewSelectionKey({
            source: 'virtual',
            virtualTrips: [
                { segments: [{ lineId: 'virtual-L4', r: 'L4', stationIds: ['S1', 'S2'] }] },
                { segments: [{ lineId: 'L5', stationIds: ['S2', 'S3'] }] }
            ]
        }),
        'virtual||unknown-line||L4:S1>S2~~~L5:S2>S3'
    );

    assert.equal(buildTripPreviewSelectionKey({ source: 'empty', segments: [] }), '');
};

const testSegmentNormalization = () => {
    assert.deepEqual(
        normalizeTripPreviewSegment({
            lineId: ' Display ',
            r: ' L0 ',
            geometryLineId: ' L1 ',
            offsetLineId: ' L2 ',
            stationIds: [' S1 ', '', null, 'S2']
        }),
        { lineId: 'Display', r: 'L0', geometryLineId: 'L1', offsetLineId: 'L2', stationIds: ['S1', 'S2'] }
    );

    assert.deepEqual(normalizeTripPreviewSegments(null), []);
    assert.deepEqual(
        normalizeTripPreviewVirtualTrips({
            virtualTrips: [
                { id: 'A', segments: [{ lineId: ' Display ', r: ' L2 ', stationIds: ['S1', ' S2 '] }] }
            ]
        }),
        [{ id: 'A', segments: [{ lineId: 'Display', r: 'L2', stationIds: ['S1', 'S2'] }] }]
    );

    assert.equal(
        buildTripPreviewSegmentsKey([
            { lineId: 'L1', stationIds: ['S1'] },
            { lineId: '', stationIds: ['S1', 'S2'] },
            { lineId: 'virtual-L2', r: 'L2', stationIds: ['S2', 'S3'] }
        ]),
        'L2:S2>S3'
    );

    assert.equal(
        buildTripPreviewVirtualTripsKey({
            virtualTrips: [
                { segments: [{ lineId: 'L1', stationIds: ['S1', 'S2'] }] },
                { segments: [{ lineId: 'L2', stationIds: ['S2'] }] }
            ]
        }),
        'L1:S1>S2'
    );
};

const testLineFeatureDedupKey = () => {
    assert.equal(toCoordKey([139.1234567, 35.9876543]), '139.123457,35.987654');
    assert.equal(toCoordKey(['bad', 35]), '');
    assert.equal(buildLineCoordsCanonicalKey([[1, 1]]), '');
    assert.equal(
        buildLineCoordsCanonicalKey([[1, 1], [2, 2]]),
        buildLineCoordsCanonicalKey([[2, 2], [1, 1]])
    );
    assert.equal(
        buildTripPreviewLineFeatureDedupKey(lineFeature('L1', [[1, 1], [2, 2]])),
        buildTripPreviewLineFeatureDedupKey(lineFeature('L1', [[2, 2], [1, 1]]))
    );
    assert.equal(buildTripPreviewLineFeatureDedupKey({ geometry: { type: 'Point' } }), '');
};

const testAggregate = () => {
    assert.deepEqual(
        buildTripPreviewAggregateFromPayloadList(),
        {
            lineFc: { type: 'FeatureCollection', features: [] },
            stopFc: { type: 'FeatureCollection', features: [] },
            lineIds: new Set(),
            stopIds: new Set(),
            startStationId: '',
            endStationId: '',
            bbox: null
        }
    );

    const payloads = [{ id: 'a' }, { id: 'b' }];
    const aggregate = buildTripPreviewAggregateFromPayloadList({
        payloadList: payloads,
        buildTripPreviewFeatures: (payload) => {
            if (payload.id === 'a') {
                return {
                    lineFc: {
                        type: 'FeatureCollection',
                        features: [
                            lineFeature('L1', [[1, 1], [2, 2]]),
                            lineFeature('L1', [[2, 2], [1, 1]])
                        ]
                    },
                    stopFc: {
                        type: 'FeatureCollection',
                        features: [stopFeature('S1'), stopFeature('S2')]
                    },
                    lineIds: new Set(['L1']),
                    stopIds: new Set(['S1', 'S2']),
                    startStationId: 'S1',
                    endStationId: 'S2',
                    bbox: { minLng: 1, minLat: 1, maxLng: 2, maxLat: 2 }
                };
            }
            return {
                lineFc: {
                    type: 'FeatureCollection',
                    features: [lineFeature('L2', [[3, 3], [4, 4]])]
                },
                stopFc: {
                    type: 'FeatureCollection',
                    features: [stopFeature('S2'), stopFeature('S3')]
                },
                lineIds: new Set(['L2']),
                stopIds: new Set(['S2', 'S3']),
                startStationId: 'S2',
                endStationId: 'S3',
                bbox: { minLng: 3, minLat: 0, maxLng: 4, maxLat: 4 }
            };
        }
    });

    assert.equal(aggregate.lineFc.features.length, 2);
    assert.equal(aggregate.stopFc.features.length, 3);
    assert.deepEqual(Array.from(aggregate.lineIds), ['L1', 'L2']);
    assert.deepEqual(Array.from(aggregate.stopIds), ['S1', 'S2', 'S3']);
    assert.equal(aggregate.startStationId, 'S1');
    assert.equal(aggregate.endStationId, 'S3');
    assert.deepEqual(aggregate.bbox, { minLng: 1, minLat: 0, maxLng: 4, maxLat: 4 });

    assert.deepEqual(
        mergeTripPreviewBBox(
            { minLng: 0, minLat: 2, maxLng: 3, maxLat: 4 },
            { minLng: -1, minLat: 3, maxLng: 2, maxLat: 5 }
        ),
        { minLng: -1, minLat: 2, maxLng: 3, maxLat: 5 }
    );

    assert.deepEqual(mergeTripPreviewBBox(null, { minLng: 1, minLat: 2, maxLng: 3, maxLat: 4 }), {
        minLng: 1,
        minLat: 2,
        maxLng: 3,
        maxLat: 4
    });
    assert.equal(mergeTripPreviewBBox(null, { minLng: 1, minLat: NaN, maxLng: 3, maxLat: 4 }), null);
};

const testEndpointAndDirPreviewHelpers = () => {
    assert.deepEqual(
        Array.from(buildEndpointStationIdSetFromPayloadList([
            {
                segments: [
                    { lineId: 'L1', stationIds: [' S1 ', 'S2'] },
                    { lineId: 'L2', stationIds: ['S2', ' S3 '] }
                ]
            },
            {
                segments: [
                    { lineId: 'L3', stationIds: ['', null] },
                    { lineId: 'L4', stationIds: ['S4', 'S5'] }
                ]
            }
        ])),
        ['S1', 'S3', 'S4', 'S5']
    );

    const normalized = normalizeDirPreviewPayload({
        lineId: ' L1 ',
        fitMode: '',
        originStationIds: [' O1 ', ''],
        terminalStationIds: ['T1', null],
        currentStationIds: ['C1', ' O1 '],
        sourceLineIds: [' L1 ', 'L2']
    });

    assert.equal(normalized.lineId, 'L1');
    assert.equal(normalized.fitMode, 'preview');
    assert.deepEqual(normalized.originIds, ['O1']);
    assert.deepEqual(normalized.terminalIds, ['T1']);
    assert.deepEqual(normalized.currentIds, ['C1', 'O1']);
    assert.deepEqual(normalized.sourceLineIds, ['L1', 'L2']);
    assert.deepEqual(Array.from(normalized.stationIds), ['O1', 'T1', 'C1']);
};

testSegmentNormalization();
testSelectionKey();
testLineFeatureDedupKey();
testAggregate();
testEndpointAndDirPreviewHelpers();

console.log('route preview selection smoke ok');
