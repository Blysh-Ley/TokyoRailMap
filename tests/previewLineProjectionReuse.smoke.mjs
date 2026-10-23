import assert from 'node:assert/strict';
import { createPreviewLineProjector, projectStationToPreviewLineFeature } from '../src/domain/previewLineProjection.js';
import { buildOffsetPolylinePixelsWithMiter, nearestProjectionOnPolylinePixels, projectLngLatToPixelAtZoom12, unprojectPixelToLngLatAtZoom12 } from '../src/map/offset.js';
import { getLineOffsetPixelsPerUnitAtZoom } from '../src/domain/lineOffsetScale.js';
import { buildPreviewVirtualStationInjection, PREVIEW_CAPSULE_MODE_VIRTUAL } from '../src/domain/previewVirtualStations.js';

const baseOptions = { buildOffsetPolylinePixelsWithMiter, nearestProjectionOnPolylinePixels,
    projectLngLatToPixelAtZoom12, unprojectPixelToLngLatAtZoom12, getLineOffsetPixelsPerUnitAtZoom };
const coordinates = [[139.70, 35.68], [139.72, 35.69], [139.75, 35.68], [139.77, 35.70]];
const features = [
    { geometry: { type: 'LineString', coordinates }, properties: { id: '相同标识', line_offset_units: 2 } },
    { geometry: { type: 'LineString', coordinates }, properties: { id: '相同标识', line_offset_units: -1,
        line_offset_profile: [[0, 0], [0.3, 2], [0.6, -1], [1, 1]] } },
    { geometry: { type: 'LineString', coordinates: coordinates.map(([lng, lat]) => [lng + 0.02, lat]) },
        properties: { id: '相同标识', line_offset_profile: '[[0,0],[0.5,2],[1,0]]' } }
];
const original = structuredClone(features);
const stations = [[139.71, 35.685], [139.735, 35.69], [139.76, 35.695]];

for (const zoom of [7, 12, 15, 17]) {
    let builds = 0;
    const projector = createPreviewLineProjector({ ...baseOptions, zoom,
        buildOffsetPolylinePixelsWithMiter: (...args) => {
            builds += 1;
            return buildOffsetPolylinePixelsWithMiter(...args);
        } });
    for (const feature of features) for (const baseCoord of stations) {
        assert.deepEqual(projector({ feature, baseCoord }),
            projectStationToPreviewLineFeature({ ...baseOptions, zoom, feature, baseCoord }));
    }
    const expectedBuilds = getLineOffsetPixelsPerUnitAtZoom(zoom) ? 3 : 2;
    assert.equal(builds, expectedBuilds, '同批次每个需要偏移的线路要素只构建一次折线');
    assert.notDeepEqual(projector({ feature: features[0], baseCoord: stations[0] }),
        projector({ feature: features[2], baseCoord: stations[0] }), '相同线路标识不合并不同几何');
}
assert.deepEqual(features, original, '不修改输入几何或偏移曲线');
const simple = { geometry: { type: 'LineString', coordinates: [[0, 0], [2, 0]] }, properties: {} };
const project = ([x, y]) => ({ x, y });
const unproject = ({ x, y }) => [x, y];
const projector = createPreviewLineProjector({ ...baseOptions, zoom: 12,
    projectLngLatToPixelAtZoom12: project, unprojectPixelToLngLatAtZoom12: unproject });
assert.deepEqual(projector({ feature: simple, baseCoord: [1, 1] }), [1, 0]);
assert.equal(projector({ feature: simple, baseCoord: null }), null);
assert.equal(projector({ baseCoord: [1, 1] }), null);

const stationIds = ['A.X.Station', 'B.Y.Station'];
const injectionOptions = {
    stationsData: { type: 'FeatureCollection', features: stationIds.map((id, i) => ({
        type: 'Feature', properties: { id }, geometry: { type: 'Point', coordinates: [139.7 + i / 1000, 35.6] }
    })) },
    stationGroups: [stationIds.map(id => [id])],
    visibleStationIds: new Set(stationIds),
    tripPreviewSelectionEntries: stationIds.map(id => ({ payload: { virtualTrips: [{
        selectedLineId: id.split('.').slice(0, -1).join('.'), segments: [{ stationIds: [id] }]
    }] } })),
    resolveCapsuleMode: () => PREVIEW_CAPSULE_MODE_VIRTUAL
};
let projected = 0;
const drawn = buildPreviewVirtualStationInjection({ ...injectionOptions,
    resolveStationCoordinate: ({ baseCoord }) => { projected += 1; return [baseCoord[0] + 0.01, baseCoord[1]]; } });
const membership = buildPreviewVirtualStationInjection(injectionOptions);
assert.equal(projected, 2);
assert.equal(membership.virtualStationIds.size, 2);
assert.deepEqual(membership.replacedRealStationIds, drawn.replacedRealStationIds);
assert.deepEqual(membership.visibleStationIds, drawn.visibleStationIds);
assert.deepEqual(membership.virtualGroups, drawn.virtualGroups);
console.log('线路投影批次复用验证通过。');
