import assert from 'node:assert/strict';
import { buildLineServiceDiagramData } from '../src/domain/lineServiceDiagram.js';
import { layoutLineServiceDiagram } from '../src/ui/lineServiceDiagramLayout.js';

const main = 'Main.Main', branch = 'Branch.Main';
const railway = (id, stations, ascending = 'Outbound', descending = 'Inbound') => ({
    id, stations, ascending, descending, title: { 'zh-Hans': id }, color: '#456789'
});
const trip = (id, lineId, typeId, stationIds, direction = 'Outbound') => ({
    id: `${lineId}.${id}.Weekday`, r: lineId, y: typeId, d: direction,
    tt: stationIds.map((s) => ({ s }))
});
const connect = (...trips) => {
    for (let index = 1; index < trips.length; index += 1) {
        trips[index - 1].nt = [trips[index].id];
        trips[index].pt = [trips[index - 1].id];
    }
};
const type = (id, name, color = '#e56332') => ({ id, title: { 'zh-Hans': name, color } });
const build = (railways, rootTrips, trips, trainTypes, stationGroups = []) => buildLineServiceDiagramData({
    lineId: main, railways, rootTrips, trips, trainTypes, stationGroups,
    stations: [...new Set(railways.flatMap((line) => line.stations))].map((id) => ({ id, title: { 'zh-Hans': id.split('.').at(-1) } }))
});
const layout = (data) => layoutLineServiceDiagram(data, new Map(data.topology.stations.map((station) => [station.id, {
    labelWidth: 80, transferWidth: 0, height: 22
}])));
const edge = (data, a, b) => data.topology.edges.find((entry) => [entry.from, entry.to].includes(a) && [entry.from, entry.to].includes(b));
const bundleFor = (data, a, b) => data.serviceBundles.find((bundle) => bundle.edgeIds.includes(edge(data, a, b).id));

{
    const start = `${main}.Start`, junction = `${main}.Junction`;
    const dense = 'Dense.Main', sparse = 'Sparse.Main';
    const full = ['Junction', 'One', 'Two', 'Three', 'End'].map((id) => `${dense}.${id}`);
    const fast = ['Junction', 'End'].map((id) => `${sparse}.${id}`);
    const root = trip('Root', main, 'Main.Rapid', [start, junction]);
    const local = trip('Local', dense, 'Dense.Local', full);
    const express = trip('Express', sparse, 'Sparse.Express', fast);
    root.nt = [local.id, express.id];
    const data = await build([
        railway(main, [start, junction]), railway(dense, full), railway(sparse, fast)
    ], [root], [root, local, express], [type('Main.Rapid', '快速'), type('Dense.Local', '普通'), type('Sparse.Express', '急行')], [
        [[junction, full[0], fast[0]]], [[full.at(-1), fast.at(-1)]]
    ]);
    const logical = edge(data, junction, full.at(-1));
    assert.ok(logical, '原始稀疏线路连边继续保留');
    const projected = data.serviceEdgePaths.find((entry) => entry.edgeId === logical.id);
    const expected = [junction, ...full.slice(1)];
    assert.deepEqual(projected.path, logical.from === junction ? expected : expected.reverse(), '共线稀疏路径沿完整站间区段绘制并保留原边方向');
    const result = layout(data);
    assert.deepEqual(result.serviceTracks.get(logical.id), [], '逻辑捷径不再单独画直线');
    for (let index = 1; index < projected.path.length; index += 1) {
        const tracks = result.serviceTracks.get(edge(data, projected.path[index - 1], projected.path[index]).id);
        assert.deepEqual(new Set(tracks.map((track) => track.type.id)), new Set(['Dense.Local', 'Sparse.Express']));
        assert.deepEqual(tracks.map((track) => track.offset), [-6, 6], '共线种别以十二像素间距统一居中');
    }
    for (const id of full.slice(1, -1)) {
        assert.ok(!result.serviceStops.get(id).some((marker) => marker.sourceTypeIds.includes('Sparse.Express')), '经过中间站不增加停站');
        assert.ok(result.positions.get(id).rightTrackOffset === 6 && result.positions.get(id).leftTrackOffset === -6, '中间站文字也避让整个共线束');
    }
    assert.equal(data.processing.retainedTrips, 1, '一班直通交路仍完整保留');
}

{
    const ids = 'ABCDEFGH'.split('').map((id) => `${main}.${id}`);
    const long = 'Long.Main', short = 'Short.Main';
    const longIds = ['Join', 'One', 'Two', 'Three'].map((id) => `${long}.${id}`);
    const shortIds = ['Join', 'One'].map((id) => `${short}.${id}`);
    const first = trip('First', main, 'Main.Local', ids.slice(0, 2));
    const second = trip('Second', main, 'Main.Local', ids.slice(5, 7));
    const longTrip = trip('Branch', long, 'Long.Local', longIds);
    const shortTrip = trip('Branch', short, 'Short.Local', shortIds);
    connect(first, longTrip); connect(second, shortTrip);
    const data = await build([
        railway(main, ids), railway(long, longIds), railway(short, shortIds)
    ], [first, second], [first, second, longTrip, shortTrip], [
        type('Main.Local', '普通'), type('Long.Local', '普通'), type('Short.Local', '普通')
    ], [[[ids[1], longIds[0]]], [[ids[6], shortIds[0]]]]);
    const sizes = new Map(data.topology.stations.map((station) => [station.id, {
        labelWidth: longIds.includes(station.id) ? 250 : shortIds.includes(station.id) ? 40 : 60,
        transferWidth: 0, height: 22
    }]));
    const result = layoutLineServiceDiagram(data, sizes);
    const baseX = result.positions.get(ids[1]).x;
    const longX = result.positions.get(longIds[1]).x, shortX = result.positions.get(shortIds[1]).x;
    assert.notEqual(longX, shortX, '纵向分离的分支独立选择横坐标');
    assert.ok(Math.abs(shortX - baseX) < Math.abs(longX - baseX), '短支线利用靠近主干的空间，不被另一分支的宽站名撑开');
    assert.ok(longX > baseX || shortX > baseX, '根据占用空间允许向右分叉');
    for (const tracks of result.serviceTracks.values()) for (const track of tracks) assert.doesNotMatch(track.path, /NaN|Infinity|undefined|A-/);
}

console.log('线路图稀疏共线并排、原连边与停站保持、分支独立空间和向右分叉验证通过。');
