import assert from 'node:assert/strict';
import { createTripPreviewBuilder } from '../src/features/route/tripPreviewBuilder.js';

const stationCoordByIdBase = new Map([
    ['A', [139.0, 35.0]],
    ['B', [139.1, 35.0]],
    ['C', [139.2, 35.0]],
    ['D', [139.3, 35.0]]
]);

const { buildTripPreviewFeatures } = createTripPreviewBuilder({
    stationCoordByIdBase,
    stationCoordById: new Map(),
    stationServingCountById: new Map(),
    lineColorById: new Map([
        ['L1', '#111111'],
        ['L2', '#222222']
    ]),
    resolveRailColorForTheme: (color) => color,
    isLineTerminalStation: () => true,
    isSamePhysicalStation: () => false,
    isLoopDirection: () => false,
    extractLineSegment: (lineId, from, to) => {
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

console.log('trip preview builder offset smoke ok');
