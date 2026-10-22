import assert from 'node:assert/strict';
import { createStationPreviewAtlasBuilder, createStationPreviewAtlasReader, getStationPreviewTargets }
    from '../src/domain/stationPreviewMaterialization.js';

const station = (id, count) => ({ properties: { id, serving_ids: Array.from({ length: count }, (_, i) => `line-${i}`) } });
assert.deepEqual(getStationPreviewTargets([station('five', 5), station('six', 6), station('seven', 7)])
    .map((feature) => feature.properties.id), ['six', 'seven']);
assert.equal(getStationPreviewTargets([{ properties: { id: 'duplicates', serving_ids: ['a', 'a', 'b', 'c', 'd', 'e'] } }]).length, 0);
assert.equal(getStationPreviewTargets([{ properties: { id: 'serialized', serving_ids: JSON.stringify(station('six', 6).properties.serving_ids) } }]).length, 1);

const line = { type: 'Feature', properties: { color: '#ff0000', line_offset_profile: '[[0,1],[1,2]]' },
    geometry: { type: 'LineString', coordinates: [[139, 35], [139.1, 35.1]] } };
const stop = { type: 'Feature', properties: { id: 'stop' }, geometry: { type: 'Point', coordinates: [139, 35] } };
const snapshot = { source: 'station-through-branch',
    payload: { selectedLineId: 'line', originStationIds: ['a'], terminalStationIds: ['b'], endpointLabelCounts: [],
        virtualTrips: [{ segments: [{ lineId: 'line', stationIds: ['a', 'b'] }] }] },
    built: { lineFc: { type: 'FeatureCollection', features: [line, line] },
        stopFc: { type: 'FeatureCollection', features: [stop] }, lineIds: new Set(['line']), stopIds: new Set(['stop']),
        pastStopIds: new Set(), endpointStationIds: new Set(['stop']), bbox: { minLng: 139, maxLng: 139.1 } } };
const builder = createStationPreviewAtlasBuilder();
const signature = (stationId, serviceDay) => JSON.stringify([{ lineId: stationId, serviceDay, targetTripKeys: ['trip-a', 'trip-b'] }]);
for (const profile of ['base-groups', 'merged-groups'])
for (const stationId of ['six', 'seven']) for (const serviceDay of ['Weekday', 'SaturdayHoliday']) for (const theme of ['light', 'dark']) {
    builder.add({ stationId, serviceDay, theme, profile, requestsSignature: signature(stationId, serviceDay), snapshot });
}
const atlas = JSON.parse(JSON.stringify(builder.build()));
assert.equal(atlas.geometries.length, 1);
assert.equal(atlas.lines.length, 1);
assert.equal(atlas.stops.length, 1);
assert.equal(atlas.trips.length, 1);
assert.equal(atlas.signatures.length, 4);
assert.equal(atlas.builds.length, 1);
assert.equal(atlas.tripKeys.length, 2);
const reader = createStationPreviewAtlasReader(atlas);
for (const profile of ['base-groups', 'merged-groups'])
for (const stationId of ['six', 'seven']) for (const serviceDay of ['Weekday', 'SaturdayHoliday']) for (const theme of ['light', 'dark']) {
    const result = reader.get(stationId, serviceDay, theme, profile);
    assert.deepEqual(result.snapshot, snapshot);
    assert.equal(result.requestsSignature, signature(stationId, serviceDay));
    assert.equal(reader.get(stationId, serviceDay, theme, profile), result);
}
assert.equal(reader.get('five', 'Weekday', 'light'), null);
assert.deepEqual(snapshot.built.lineFc.features, [line, line]);
console.log('站点预览物化：线路门槛、共享数据、服务日/主题与完整快照往返通过。');
