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
    const localJunction = `${branch}.Junction`, middle = `${branch}.Middle`, change = `${branch}.Change`, end = `${branch}.End`;
    const railways = [railway(main, [start, junction]), railway(branch, [localJunction, middle, change, end])];
    const roots = [1, 2, 3].map((id) => trip(`R${id}`, main, 'Main.Rapid', [start, junction]));
    const local = trip('Local', branch, 'Branch.Local', [localJunction, middle, end]);
    const express = trip('Express', branch, 'Branch.Express', [localJunction, change]);
    const converted = trip('Converted', branch, 'Branch.Local', [change, end]);
    const limited = trip('Limited', branch, 'Branch.LimitedExpress', [localJunction, change]);
    connect(roots[0], local); connect(roots[1], express, converted); connect(roots[2], limited);
    const reverseRoot = trip('Reverse', main, 'Main.Rapid', [junction, start], 'Inbound');
    const reverseLocal = trip('ReverseLocal', branch, 'Branch.Local', [end, change], 'Inbound');
    const reverseExpress = trip('ReverseExpress', branch, 'Branch.Express', [change, middle, localJunction], 'Inbound');
    connect(reverseLocal, reverseExpress, reverseRoot);
    const data = await build(railways, [...roots, reverseRoot], [...roots, local, express, converted, limited, reverseRoot, reverseLocal, reverseExpress], [
        type('Main.Rapid', '快速'), type('Branch.Local', '各站停车'), type('Branch.Express', '急行'), type('Branch.LimitedExpress', '特急')
    ]);
    const before = bundleFor(data, junction, middle), after = bundleFor(data, change, end);
    assert.deepEqual(before.types.map((type) => type.id), ['Branch.LimitedExpress', 'Branch.Express', 'Branch.Local']);
    assert.deepEqual(after.types.map((type) => type.id), ['Branch.Local']);
    assert.equal(data.trainTypes.length, 1, '根线路种别摘要保持独立');
    assert.equal(data.processing.retainedTrips, 4, '低频交路继续完整保留');
    assert.ok(data.serviceLegend.some((type) => type.name === '各站停车'));
    assert.equal(before.types.find((type) => type.id === 'Branch.LimitedExpress').totalTrips, 1, '一班种别也参与绘图');
    const outgoingLocal = after.types[0].directions.find((direction) => direction.ascending);
    assert.ok(!outgoingLocal.stopStationIds.includes(change), '转换后的普通在离站后生效');
    const incomingExpress = before.types.find((type) => type.id === 'Branch.Express');
    assert.ok(incomingExpress.directions.find((direction) => direction.ascending).stopStationIds.includes(change));
    assert.ok(!incomingExpress.directions.find((direction) => !direction.ascending).stopStationIds.includes(change));
    assert.ok(after.types[0].directions.find((direction) => !direction.ascending).stopStationIds.includes(change), '反向转换按反向到站种别归属');
    const result = layout(data);
    assert.deepEqual(result.serviceTracks.get(edge(data, junction, middle).id).map((track) => track.offset), [-20, 0, 20]);
    assert.deepEqual(result.serviceTracks.get(edge(data, change, end).id).map((track) => track.offset), [20], '后续普通整段对齐前段的普通');
    assert.equal(result.positions.get(end).leftTrackOffset, 20, '换乘徽标和换乘线左端跟随整段平移');
    assert.equal(result.positions.get(end).rightTrackOffset, 20, '换乘线右端跟随整段平移');
    assert.equal(result.positions.get(end).labelOffset, 32, '站名与最右轨道的间距保持不变');
    assert.equal(result.serviceStops.get(end)[0].x, result.positions.get(end).x + 20, '停站标记跟随整段平移');
    const stops = result.serviceStops.get(change);
    assert.ok(stops.find((marker) => marker.type.id === 'Branch.Express' && !marker.round));
    assert.ok(stops.find((marker) => marker.type.id === 'Branch.Local' && !marker.round));
    for (const tracks of result.serviceTracks.values()) for (const track of tracks) assert.doesNotMatch(track.path, /NaN|Infinity|undefined/);
}

{
    const start = `${main}.Start`, junction = `${main}.Junction`;
    const left = 'Left.Main', right = 'Right.Main';
    const leftStations = ['Junction', 'Middle', 'End'].map((id) => `${left}.${id}`);
    const rightStations = ['Junction', 'Middle', 'End'].map((id) => `${right}.${id}`);
    const root = trip('Root', main, 'Main.Rapid', [start, junction]);
    const leftLocal = trip('Local', left, 'Left.Local', leftStations, 'Northbound');
    const rightLocal = trip('Local', right, 'Right.Local', rightStations);
    const leftExpress = trip('Express', left, 'Left.Express', leftStations, 'Northbound');
    const rightRapid = trip('Rapid', right, 'Right.Rapid', rightStations);
    root.nt = [leftLocal, rightLocal, leftExpress, rightRapid].map((trip) => trip.id);
    const data = await build([
        railway(main, [start, junction]), railway(left, leftStations, 'Northbound', 'Southbound'), railway(right, rightStations)
    ], [root], [root, leftLocal, rightLocal, leftExpress, rightRapid], [
        type('Main.Rapid', '快速'), type('Left.Local', '普通'), type('Right.Local', '各站停车'),
        type('Left.Express', '急行'), type('Right.Rapid', '急行')
    ], [
        [[junction, leftStations[0], rightStations[0]]],
        [[leftStations[1], rightStations[1]]], [[leftStations[2], rightStations[2]]]
    ]);
    const shared = data.serviceBundles.find((bundle) => bundle.lineIds.includes(left) && bundle.lineIds.includes(right));
    const local = shared.types.find((type) => type.key === 'Local');
    assert.deepEqual(new Set(local.sourceTypeIds), new Set(['Left.Local', 'Right.Local']));
    assert.equal(local.id, 'Left.Local', '元数据采用现有线路顺序中所属运营商的种别');
    assert.equal(local.name, '普通');
    assert.equal(local.totalTrips, 2, '多条直通链中的实际班次去重计数');
    assert.equal(data.serviceBundles.find((bundle) => bundle.lineIds.includes(main)).types[0].totalTrips, 1, '分叉不重复计算根班次');
    assert.equal(local.directions.length, 1, '共线线路不同方向 ID 按各自线路方向归并');
    assert.equal(local.directions[0].ids.length, 2);
    assert.equal(shared.types.length, 3, '中文名称和颜色相同但后缀不同的种别保持独立');
    const result = layout(data);
    const tracks = result.serviceTracks.get(shared.edgeIds[0]);
    assert.deepEqual(tracks.map((track) => track.offset), [-20, 0, 20]);
    assert.equal(tracks.filter((track) => track.type.key === 'Local').length, 1);
}

{
    const stations = ['A', 'B', 'C', 'D', 'E'].map((id) => `${main}.${id}`);
    const roots = [1, 2, 3].map((index) => trip(`A${index}`, main, 'Main.A', [stations[0], stations[index], stations[4]]));
    roots.push(trip('B', main, 'Main.B', [stations[0], stations[1], stations[2], stations[4]]));
    const data = await build([railway(main, stations)], roots, roots, [type('Main.A', '通勤快速A'), type('Main.B', '区间快速B')]);
    assert.deepEqual(data.trainTypes.map((type) => type.id), ['Main.B', 'Main.A'], 'panel 站点信息按停站并集排序：B 有四站，A 有五站');
    const local = data.serviceBundles[0];
    assert.deepEqual(local.types.map((type) => type.id), ['Main.B', 'Main.A']);
    assert.deepEqual(data.serviceLegend.map((type) => type.id), ['Main.B', 'Main.A']);
    const result = layout(data);
    assert.deepEqual(result.serviceTracks.get(local.edgeIds[0]).map((track) => track.offset), [-10, 10], '偶数种别对称居中');
}

{
    const stations = ['A', 'B', 'C'].map((id) => `${main}.${id}`);
    const roots = [trip('A', main, 'Main.A', stations), ...[1, 2, 3].map((id) => trip(`B${id}`, main, 'Main.B', stations))];
    const data = await build([railway(main, stations)], roots, roots, [type('Main.A', '快速A'), type('Main.B', '快速B')]);
    assert.deepEqual(data.trainTypes.map((type) => type.id), ['Main.A', 'Main.B'], '停站并集相同，不按班次数重排');
    assert.deepEqual(data.serviceBundles[0].types.map((type) => type.id), ['Main.A', 'Main.B']);
    assert.deepEqual(data.serviceLegend.map((type) => type.id), ['Main.A', 'Main.B']);
}

{
    const stations = ['A', 'B', 'C'].map((id) => `${main}.${id}`);
    const roots = [
        trip('Commuter', main, 'Main.CommuterLimitedExpress', [stations[0], stations[2]]),
        trip('Limited', main, 'Main.LimitedExpress', stations),
        trip('RapidLimited', main, 'Main.RapidLimitedExpress', stations)
    ];
    const metadata = [
        { ...type('Main.RapidLimitedExpress', '快速特急'), displayOrder: 10 },
        { ...type('Main.LimitedExpress', '特急'), displayOrder: 20 },
        { ...type('Main.CommuterLimitedExpress', '通勤特急'), displayOrder: 30 }
    ];
    const data = await build([railway(main, stations)], roots, roots, metadata);
    const expected = metadata.map((type) => type.id);
    assert.deepEqual(data.trainTypes.map((type) => type.id), expected, '根线路摘要采用公司顺序');
    assert.deepEqual(data.serviceLegend.map((type) => type.id), expected, '总图例采用公司顺序');
    for (const bundle of data.serviceBundles) {
        assert.deepEqual(bundle.types.map((type) => type.id), expected.filter((id) => bundle.types.some((type) => type.id === id)), '每个独立种别束采用公司顺序');
    }
    const result = layout(data);
    for (const tracks of result.serviceTracks.values()) {
        assert.deepEqual(tracks.map((track) => track.type.id), expected, '真实轨迹顺序与图例一致');
    }
}

console.log('线路图真实直通种别、转换站归属、共线合并、公司排序和居中验证通过。');
