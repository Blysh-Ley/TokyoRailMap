import assert from 'node:assert/strict';
import { createTripPreviewBuilder, TRIP_PREVIEW_PAST_COLOR } from '../src/features/route/tripPreviewBuilder.js';

const stationCoordByIdBase = new Map([
    ['A', [139.0, 35.0]],
    ['B', [139.1, 35.0]],
    ['C', [139.2, 35.0]],
    ['D', [139.3, 35.0]]
]);

const extractedLineIds = [];
const extractedOptions = [];

const { buildTripPreviewFeatures } = createTripPreviewBuilder({
    stationCoordByIdBase,
    stationCoordById: new Map(),
    stationServingCountById: new Map(),
    lineColorById: new Map([
        ['L1', '#111111'],
        ['L2', '#222222'],
        ['SRC', '#ff6600'],
        ['ALT', '#0066cc']
    ]),
    alternateLineMembership: {
        highlightHiddenIdsByLineId: new Map([
            ['SRC', new Set(['A', 'B'])]
        ]),
        highlightAlternateLineIdByLineStationId: new Map([
            ['SRC\u0000A', 'ALT'],
            ['SRC\u0000B', 'ALT']
        ])
    },
    resolveRailColorForTheme: (color) => color,
    isLineTerminalStation: () => true,
    isSamePhysicalStation: () => false,
    isLoopDirection: () => false,
    extractLineSegment: (lineId, from, to, options = {}) => {
        extractedLineIds.push(lineId);
        extractedOptions.push(options);
        if (lineId === 'L1') return null;
        return [from, to];
    },
    nearestBridgeBetweenLines: () => ({
        a: [139.1, 35.0],
        b: [139.2, 35.0],
        dist: 50
    }),
    distMeters: () => 100,
    extendBBox: (bbox, lng, lat) => ({
        minLng: bbox ? Math.min(bbox.minLng, lng) : lng,
        minLat: bbox ? Math.min(bbox.minLat, lat) : lat,
        maxLng: bbox ? Math.max(bbox.maxLng, lng) : lng,
        maxLat: bbox ? Math.max(bbox.maxLat, lat) : lat
    }),
    getLineOffsetUnits: (lineId) => (lineId === 'L1' ? 2 : (lineId === 'L2' ? -1 : 0))
});

const built = buildTripPreviewFeatures({
    mainLineId: 'L1',
    segments: [
        { lineId: 'L1', stationIds: ['A', 'B'] },
        { lineId: 'L2', stationIds: ['C', 'D'] }
    ]
});

const lineFeatures = built.lineFc.features;

const sameLineFallback = lineFeatures.find((feature) => (
    feature.properties.role === 'connector'
    && feature.properties.lineId === 'L1'
));
assert.equal(sameLineFallback.properties.line_offset_units, 2);

const bridgeConnector = lineFeatures.find((feature) => (
    feature.properties.role === 'connector'
    && feature.properties.lineId === 'L2'
));
assert.equal(bridgeConnector.properties.line_offset_units, 0);

const l2Line = lineFeatures.find((feature) => (
    feature.properties.role === 'line'
    && feature.properties.lineId === 'L2'
));
assert.equal(l2Line.properties.line_offset_units, -1);
assert.equal(l2Line.properties.geometry_line_id, 'L2');
assert.equal(l2Line.properties.line_offset_id, 'L2');

extractedLineIds.length = 0;
extractedOptions.length = 0;
const virtualBuilt = buildTripPreviewFeatures({
    mainLineId: 'virtual-main',
    segments: [
        {
            lineId: 'virtual-main',
            r: 'L2',
            stationIds: ['A', 'B']
        }
    ]
});
const virtualLine = virtualBuilt.lineFc.features.find((feature) => (
    feature.properties.role === 'line'
    && feature.properties.lineId === 'virtual-main'
));
assert.equal(virtualLine.properties.r, 'L2');
assert.equal(virtualLine.properties.geometry_line_id, 'L2');
assert.equal(virtualLine.properties.line_offset_id, 'L2');
assert.equal(virtualLine.properties.line_offset_units, -1);
assert.deepEqual(extractedLineIds, ['L2']);
assert.equal(extractedOptions[0]?.preserveLineDirection, true);

extractedLineIds.length = 0;
extractedOptions.length = 0;
const explicitOffsetBuilt = buildTripPreviewFeatures({
    mainLineId: 'virtual-main',
    segments: [
        {
            lineId: 'virtual-exp',
            r: 'L2',
            geometryLineId: 'L2',
            offsetLineId: 'L2',
            lineOffsetUnits: -3,
            highlightColor: '#00aa00',
            stationIds: ['A', 'B']
        }
    ]
});
const explicitOffsetLine = explicitOffsetBuilt.lineFc.features.find((feature) => (
    feature.properties.role === 'line'
    && feature.properties.lineId === 'virtual-exp'
));
assert.equal(explicitOffsetLine.properties.r, 'L2');
assert.equal(explicitOffsetLine.properties.geometry_line_id, 'L2');
assert.equal(explicitOffsetLine.properties.line_offset_id, 'L2');
assert.equal(explicitOffsetLine.properties.line_offset_units, -3);
assert.equal(explicitOffsetLine.properties.color, '#00aa00');

extractedLineIds.length = 0;
extractedOptions.length = 0;
const alternateColorBuilt = buildTripPreviewFeatures({
    mainLineId: 'SRC',
    previewSource: 'panel-trip',
    segments: [
        {
            kind: 'main',
            lineId: 'SRC',
            r: 'SRC',
            geometryLineId: 'SRC',
            offsetLineId: 'SRC',
            stationIds: ['A', 'B', 'C']
        }
    ]
});
const alternateColorLines = alternateColorBuilt.lineFc.features.filter((feature) => (
    feature.properties.role === 'line'
));
assert.equal(alternateColorLines.length, 2);
assert.deepEqual(
    alternateColorLines.map((feature) => ({
        lineId: feature.properties.lineId,
        r: feature.properties.r,
        geometryLineId: feature.properties.geometry_line_id,
        offsetLineId: feature.properties.line_offset_id,
        color: feature.properties.color
    })),
    [
        {
            lineId: 'SRC',
            r: 'SRC',
            geometryLineId: 'SRC',
            offsetLineId: 'SRC',
            color: '#0066cc'
        },
        {
            lineId: 'SRC',
            r: 'SRC',
            geometryLineId: 'SRC',
            offsetLineId: 'SRC',
            color: '#ff6600'
        }
    ],
    'alternate membership should only recolor concrete trip preview pairs without rewriting line identity'
);
assert.deepEqual(
    Array.from(alternateColorBuilt.stopIds).sort(),
    ['A', 'B', 'C'],
    'concrete trip preview stops should keep the original station sequence'
);

const pastPreviewBuilt = buildTripPreviewFeatures({
    mainLineId: 'L2',
    previewSource: 'panel-trip',
    segments: [{
        kind: 'main',
        lineId: 'L2',
        stationIds: ['A', 'B', 'C'],
        pastStationIds: ['A', 'B']
    }]
});
const pastLineFeatures = pastPreviewBuilt.lineFc.features.filter((feature) => feature.properties.role === 'line');
assert.equal(pastLineFeatures[0].properties.color, TRIP_PREVIEW_PAST_COLOR);
assert.equal(pastLineFeatures[0].properties.isPast, true);
assert.notEqual(pastLineFeatures[1].properties.color, TRIP_PREVIEW_PAST_COLOR);
assert.equal(pastLineFeatures[1].properties.isPast, false);
assert.deepEqual(Array.from(pastPreviewBuilt.pastStopIds).sort(), ['A', 'B']);
assert.deepEqual(
    pastPreviewBuilt.stopFc.features
        .filter((feature) => feature.properties.isPast === true)
        .map((feature) => feature.properties.id)
        .sort(),
    ['A', 'B']
);

{
    const skippedBoundaryBuilder = createTripPreviewBuilder({
        stationCoordByIdBase: new Map([
            ['ALT.A', [139.0, 35.0]],
            ['X', [139.1, 35.0]],
            ['D', [139.2, 35.0]]
        ]),
        stationCoordById: new Map(),
        stationServingCountById: new Map(),
        lineColorById: new Map([
            ['SRC', '#ff6600'],
            ['ALT', '#0066cc']
        ]),
        alternateLineMembership: {
            alternateStationIdByLineStationId: new Map([
                ['SRC\u0000A', 'ALT.A']
            ]),
            alternateLineIdByLineStationId: new Map([
                ['SRC\u0000A', 'ALT']
            ]),
            highlightAlternateLineIdByLineStationId: new Map([
                ['SRC\u0000A', 'ALT'],
                ['SRC\u0000X', 'ALT']
            ]),
            rangeRules: [{
                lineId: 'SRC',
                stationMembershipStationIds: ['A'],
                boundaryExpansionStationIds: ['X']
            }]
        },
        resolveRailColorForTheme: (color) => color,
        isLineTerminalStation: () => true,
        isSamePhysicalStation: () => false,
        isLoopDirection: () => false,
        extractLineSegment: () => [[139.0, 35.0], [139.1, 35.0], [139.2, 35.0]],
        nearestBridgeBetweenLines: () => null,
        distMeters: (a, b) => {
            const dx = Number(a?.[0]) - Number(b?.[0]);
            const dy = Number(a?.[1]) - Number(b?.[1]);
            return Math.sqrt(dx * dx + dy * dy) * 100000;
        },
        extendBBox: (bbox, lng, lat) => ({
            minLng: bbox ? Math.min(bbox.minLng, lng) : lng,
            minLat: bbox ? Math.min(bbox.minLat, lat) : lat,
            maxLng: bbox ? Math.max(bbox.maxLng, lng) : lng,
            maxLat: bbox ? Math.max(bbox.maxLat, lat) : lat
        })
    });
    const panelSkippedBoundaryBuilt = skippedBoundaryBuilder.buildTripPreviewFeatures({
        mainLineId: 'SRC',
        previewSource: 'panel-trip',
        segments: [{
            kind: 'main',
            lineId: 'SRC',
            r: 'SRC',
            geometryLineId: 'SRC',
            offsetLineId: 'SRC',
            stationIds: ['A', 'D']
        }]
    });
    const lines = panelSkippedBoundaryBuilt.lineFc.features.filter((feature) => feature.properties.role === 'line');
    assert.deepEqual(
        lines.map((feature) => ({
            lineId: feature.properties.lineId,
            r: feature.properties.r,
            geometryLineId: feature.properties.geometry_line_id,
            offsetLineId: feature.properties.line_offset_id,
            color: feature.properties.color,
            coords: feature.geometry.coordinates
        })),
        [
            {
                lineId: 'SRC',
                r: 'SRC',
                geometryLineId: 'SRC',
                offsetLineId: 'SRC',
                color: '#0066cc',
                coords: [[139.0, 35.0], [139.1, 35.0]]
            },
            {
                lineId: 'SRC',
                r: 'SRC',
                geometryLineId: 'SRC',
                offsetLineId: 'SRC',
                color: '#ff6600',
                coords: [[139.1, 35.0], [139.2, 35.0]]
            }
        ],
        'skipped alternate boundary should split only color while preserving source line identity'
    );
    assert.deepEqual(
        panelSkippedBoundaryBuilt.stopFc.features.map((feature) => ({
            id: feature.properties.id,
            coords: feature.geometry.coordinates
        })),
        [
            { id: 'ALT.A', coords: [139.0, 35.0] },
            { id: 'D', coords: [139.2, 35.0] }
        ],
        'hidden alternate trip stop should use the visible alternate station id'
    );
    const nonPanelBuilt = skippedBoundaryBuilder.buildTripPreviewFeatures({
        mainLineId: 'SRC',
        segments: [{
            kind: 'main',
            lineId: 'SRC',
            r: 'SRC',
            geometryLineId: 'SRC',
            offsetLineId: 'SRC',
            stationIds: ['A', 'D']
        }]
    });
    assert.equal(
        nonPanelBuilt.lineFc.features.length,
        0,
        'alternate coordinate/color fallback should not apply outside panel concrete trip previews'
    );
}

console.log('trip preview builder offset smoke ok');
