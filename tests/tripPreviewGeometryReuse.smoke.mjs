import assert from 'node:assert/strict';
import {
    aggregateTripPreviewLineFeatureItems,
    applyTripPreviewCollisionLaneOffsets,
    buildLineCoordsCanonicalKey,
    buildTripPreviewAggregateFromPayloadList,
    buildTripPreviewLineFeatureDedupKey
} from '../src/domain/routePreviewSelection.js';
import { createTripPreviewBuilder } from '../src/features/route/tripPreviewBuilder.js';

const lineFeature = (coordinates, color, units = 4) => ({
    type: 'Feature',
    properties: { role: 'line', lineId: 'L', color, line_offset_units: units },
    geometry: { type: 'LineString', coordinates }
});

{
    const coordinates = [[139.00000011, 35.00000011], [140.00000011, 36.00000011]];
    const items = [
        { feature: lineFeature(coordinates, '#100000'), source: 'rw-menu-through:a' },
        { feature: lineFeature(coordinates, '#200000'), source: 'rw-menu-through:b' },
        { feature: lineFeature(coordinates, '#300000'), source: 'rw-menu-through:a' }
    ];
    const calls = [];
    const expected = aggregateTripPreviewLineFeatureItems({
        items,
        buildLineFeatureDedupKey(...args) {
            calls.push(args);
            return buildTripPreviewLineFeatureDedupKey(args[0]);
        }
    });
    const actual = aggregateTripPreviewLineFeatureItems({ items });
    assert.deepEqual(actual, expected, '默认去重与自定义包装回调保留相同结果');
    assert.deepEqual(calls.map((args) => args[0]), items.map((item) => item.feature), '自定义回调按原顺序调用');
    assert.ok(calls.every((args) => args.length === 1), '不向自定义回调传入缓存参数');
    assert.deepEqual(actual.map((feature) => feature.properties.color), ['#300000', '#200000']);
    assert.deepEqual(actual.map((feature) => feature.properties.line_offset_units), [0, 1]);
    assert.equal(actual.then, undefined, '聚合继续同步返回');

    const filtered = aggregateTripPreviewLineFeatureItems({
        items,
        buildLineFeatureDedupKey: (feature) => feature.properties.color === '#200000'
            ? '' : buildTripPreviewLineFeatureDedupKey(feature)
    });
    assert.deepEqual(filtered.map((feature) => feature.properties.color), ['#300000'], '保留自定义回调排除要素的语义');

    const separateCoordinates = coordinates.map((point) => point.slice());
    const features = [lineFeature(coordinates, '#100000', 4), lineFeature(separateCoordinates, '#200000', 7)];
    assert.deepEqual(applyTripPreviewCollisionLaneOffsets(features).map((feature) => feature.properties.line_offset_units), [0, 1]);
    assert.deepEqual(applyTripPreviewCollisionLaneOffsets(features, null), applyTripPreviewCollisionLaneOffsets(features), 'null options 保持默认碰撞通道行为');
    separateCoordinates[1][0] += 1;
    assert.deepEqual(applyTripPreviewCollisionLaneOffsets(features).map((feature) => feature.properties.line_offset_units), [4, 7], '新一轮计算不复用旧坐标键');
    assert.equal(buildLineCoordsCanonicalKey(coordinates), '139.000000,35.000000>140.000000,36.000000', '标准坐标键保持六位小数');
}

const extendBBox = (bbox, lng, lat) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return bbox;
    if (!bbox) return { minLng: lng, minLat: lat, maxLng: lng, maxLat: lat };
    if (lng < bbox.minLng) bbox.minLng = lng;
    if (lat < bbox.minLat) bbox.minLat = lat;
    if (lng > bbox.maxLng) bbox.maxLng = lng;
    if (lat > bbox.maxLat) bbox.maxLat = lat;
    return bbox;
};
const coordinates = [[139, 35], [138, 34.7], [139.2, 35.8], [139.1, 35.1]];
const otherCoordinates = [[150, 40], [151, 41]];
const stationCoordByIdBase = new Map([
    ['A', coordinates[0]], ['B', coordinates.at(-1)],
    ['C', otherCoordinates[0]], ['D', otherCoordinates[1]]
]);
const builder = createTripPreviewBuilder({
    stationCoordByIdBase,
    lineColorById: new Map([['L', '#123456']]),
    extractLineSegment: (_lineId, from) => from === coordinates[0] ? coordinates : otherCoordinates,
    getLineOffsetProfile: () => [[0, 1], [1, 1]],
    extendBBox
});
const payload = (stationIds) => ({
    previewSource: 'station-through-branch',
    segments: [{ lineId: 'L', stationIds }]
});
const repeatedPayload = payload(['A', 'B']);
const expectedBBox = { minLng: 138, minLat: 34.7, maxLng: 139.2, maxLat: 35.8 };
const perPayloadResults = [];
const aggregate = buildTripPreviewAggregateFromPayloadList({
    payloadList: [repeatedPayload, repeatedPayload, payload(['C', 'D']), repeatedPayload],
    buildTripPreviewFeatures: (trip, context) => {
        const built = builder.buildTripPreviewFeatures(trip, context);
        perPayloadResults.push(built);
        return built;
    }
});
assert.equal(perPayloadResults[1].lineFc.features.length, 0, '重复线路要素保持已有去重行为');
for (const index of [0, 1, 3]) {
    assert.deepEqual(perPayloadResults[index].bbox, expectedBBox, '重复要素与跨班次合并不能丢失或污染各自边界框');
    assert.deepEqual(perPayloadResults[index].stopIds, new Set(['A', 'B']));
    assert.equal(perPayloadResults[index].startStationId, 'A');
    assert.equal(perPayloadResults[index].endStationId, 'B');
}
assert.deepEqual(aggregate.bbox, { minLng: 138, minLat: 34.7, maxLng: 151, maxLat: 41 });
assert.deepEqual(aggregate.stopIds, new Set(['A', 'B', 'C', 'D']));
assert.equal(aggregate.then, undefined);

coordinates[1][0] = 137;
assert.deepEqual(builder.buildTripPreviewFeatures(repeatedPayload).bbox, { ...expectedBBox, minLng: 137 }, '独立构建读取新坐标');

{
    const preciseA = [[139.00000011, 35], [140.00000011, 36]];
    const preciseB = [[139.00000021, 35], [140.00000021, 36]];
    assert.equal(buildLineCoordsCanonicalKey(preciseA), buildLineCoordsCanonicalKey(preciseB));
    const preciseBuilder = createTripPreviewBuilder({
        stationCoordByIdBase: new Map([['A', preciseA[0]], ['B', preciseA[1]], ['C', preciseB[0]], ['D', preciseB[1]]]),
        extractLineSegment: (_lineId, from) => from === preciseA[0] ? preciseA : preciseB,
        extendBBox
    });
    const context = { lineFeatureCache: new Map(), lineGeometryCache: new Map() };
    const first = preciseBuilder.buildTripPreviewFeatures(payload(['A', 'B']), context);
    const second = preciseBuilder.buildTripPreviewFeatures(payload(['C', 'D']), context);
    assert.equal(first.lineFc.features.length, 1);
    assert.equal(second.lineFc.features.length, 1, '原始几何键不能改为六位小数标准键');
    assert.deepEqual(second.lineFc.features[0].geometry.coordinates, preciseB);
}

console.log('班次预览几何复用回归通过');
