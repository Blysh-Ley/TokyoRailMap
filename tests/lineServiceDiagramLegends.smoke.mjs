import assert from 'node:assert/strict';
import { buildLineServiceDiagramData } from '../src/domain/lineServiceDiagram.js';
import { layoutLineServiceDiagram } from '../src/ui/lineServiceDiagramLayout.js';
import { layoutDiagramLegendRows } from '../src/ui/lineServiceDiagramLegendLayout.js';

const main = 'Main.Main';
const railway = (id, stations) => ({ id, stations, ascending: 'Outbound', descending: 'Inbound', title: { 'zh-Hans': id }, color: '#456789' });
const trip = (id, lineId, typeId, stations, direction = 'Outbound') => ({
    id: `${lineId}.${id}.Weekday`, r: lineId, y: typeId, d: direction, tt: stations.map((s) => ({ s }))
});
const type = (id, name, displayOrder, color = '#e56332') => ({ id, displayOrder, title: { 'zh-Hans': name, color } });
const build = (railways, roots, trips, trainTypes, stationGroups = []) => buildLineServiceDiagramData({
    lineId: main, railways, rootTrips: roots, trips, trainTypes, stationGroups,
    railDirections: [{ id: 'Outbound', title: { 'zh-Hans': '下行' } }, { id: 'Inbound', title: { 'zh-Hans': '上行' } }],
    stations: [...new Set(railways.flatMap((line) => line.stations))].map((id) => ({ id, title: { 'zh-Hans': id.split('.').at(-1) } }))
});
const layout = (data) => layoutLineServiceDiagram(data, new Map(data.topology.stations.map(({ id }) => [id, { labelWidth: 80, transferWidth: 0, height: 22 }])));

{
    const stations = [`${main}.A`, `${main}.B`];
    const root = trip('Local', main, 'Main.Local', stations);
    const data = await build([railway(main, stations)], [root], [root], [type('Main.Local', '普通', 20)]);
    assert.deepEqual(data.companyLegends, [], '无直通线路时不增加公司行');
    assert.deepEqual(layout(data).legendRows.map((row) => row.companyId), ['']);
    assert.deepEqual(data.currentLegend, data.serviceLegend, '首行保留原种别及方向信息');
}

for (const includeExpress of [false, true]) {
    const second = 'Main.Second', a = `${main}.A`, junction = `${main}.Junction`;
    const branchStations = [`${second}.Junction`, `${second}.End`];
    const roots = [trip('Local', main, 'Main.Local', [a, junction])];
    if (includeExpress) roots.push(trip('Express', main, 'Main.Express', [a, junction]));
    const local = trip('Local', second, 'Main.Local', branchStations);
    roots[0].nt = [local.id];
    const data = await build([railway(main, [a, junction]), railway(second, branchStations)], roots, [...roots, local], [
        type('Main.Express', '急行', 10), type('Main.Local', '普通', 20)
    ]);
    assert.deepEqual(data.companyLegends, [], includeExpress ? '同公司直通仅有当前种别子集时隐藏' : '同公司直通种别相同时隐藏');
}

{
    const second = 'Main.Second', third = 'Main.Third';
    const a = `${main}.A`, junction = `${main}.Junction`;
    const secondStations = [`${second}.Junction`, `${second}.Middle`, `${second}.End`];
    const thirdStations = [`${third}.End`, `${third}.Middle`, `${third}.Junction`];
    const root = trip('Root', main, 'Main.Local', [a, junction]);
    const rapid = trip('Rapid', second, 'Main.Rapid', secondStations);
    const local = trip('Local', second, 'Main.Local', secondStations);
    const thirdRapid = trip('Rapid', third, 'Main.Rapid', thirdStations, 'Inbound');
    root.nt = [rapid.id, local.id, thirdRapid.id];
    const metadata = [type('Main.Local', '普通', 30), type('Main.Unused', '未使用', 5), type('Main.Rapid', '快速', 10)];
    const data = await build([railway(main, [a, junction]), railway(second, secondStations), railway(third, thirdStations)], [root], [root, rapid, local, thirdRapid], metadata);
    assert.equal(data.companyLegends.length, 1, '同公司多条直通线路合并为一行');
    const row = data.companyLegends[0];
    assert.deepEqual(row.lineIds, [second, third]);
    assert.deepEqual(row.types.map(({ id }) => id), ['Main.Rapid', 'Main.Local'], '包含全部实际种别并采用固定顺序');
    assert.equal(row.types[0].totalTrips, 2, '相同完整种别 ID 合并班次');
    assert.deepEqual(row.types[0].directions.map(({ ascending, names }) => [ascending, names]), [[true, ['下行']], [false, ['上行']]], '保留各线路实际方向');
    assert.equal(row.types[1].totalTrips, 1, '低频直通种别参与图例');
    assert.deepEqual(layout(data).legendRows.map(({ companyId }) => companyId), ['', 'Main'], '同公司行位于第二行');
    assert.deepEqual(data.currentLegend.map(({ id }) => id), ['Main.Local'], '第一行不加入直通后新增种别');
}

{
    const left = 'Left.First', right = 'Right.First', extra = 'Left.Second';
    const a = `${main}.A`, junction = `${main}.Junction`;
    const leftStations = ['Junction', 'Middle', 'End'].map((id) => `${left}.${id}`);
    const rightStations = ['Junction', 'Middle', 'End'].map((id) => `${right}.${id}`);
    const extraStations = ['Junction', 'End'].map((id) => `${extra}.${id}`);
    const root = trip('Root', main, 'Main.Local', [a, junction]);
    const leftLocal = trip('Local', left, 'Left.Local', leftStations);
    const rightLocal = trip('Local', right, 'Right.Local', rightStations, 'Inbound');
    const leftExpress = trip('Express', left, 'Left.Express', leftStations);
    const rightExpress = trip('Express', right, 'Right.Express', rightStations);
    const extraExpress = trip('Express', extra, 'Left.Express', extraStations);
    root.nt = [leftLocal, rightLocal, leftExpress, rightExpress, extraExpress].map(({ id }) => id);
    const data = await build([
        railway(main, [a, junction]), railway(left, leftStations), railway(right, rightStations), railway(extra, extraStations)
    ], [root], [root, leftLocal, rightLocal, leftExpress, rightExpress, extraExpress], [
        type('Main.Local', '普通', 20), type('Left.Local', '普通', 20), type('Left.Express', '急行', 10, '#f00'),
        type('Right.Local', '各站停车', 20), type('Right.Express', '快速', 10, '#00f')
    ], [
        [[junction, leftStations[0], rightStations[0], extraStations[0]]],
        [[leftStations[1], rightStations[1]]], [[leftStations[2], rightStations[2]]]
    ]);
    const shared = data.serviceBundles.find((bundle) => bundle.lineIds.includes(left) && bundle.lineIds.includes(right));
    assert.equal(shared.types.filter(({ key }) => key === 'Local').length, 1, '共线仍合并绘图种别');
    const leftRow = data.companyLegends.find(({ companyId }) => companyId === 'Left');
    const rightRow = data.companyLegends.find(({ companyId }) => companyId === 'Right');
    assert.deepEqual(leftRow.lineIds, [left, extra], '同一外部公司的多条线路合并');
    assert.deepEqual(leftRow.types.map(({ id, name, color }) => [id, name, color]), [['Left.Express', '急行', '#f00'], ['Left.Local', '普通', '#888']]);
    assert.deepEqual(rightRow.types.map(({ id, name, color }) => [id, name, color]), [['Right.Express', '快速', '#00f'], ['Right.Local', '各站停车', '#888']], '共线种别也保留各公司自己的元数据');
    assert.equal(rightRow.types[1].directions[0].ascending, false, '方向不继承共线另一家公司');
    assert.equal(leftRow.types[0].totalTrips, 2);
    assert.equal(layout(data).legendRows.length, 3, '相同于当前线路的外部公司种别也显示');
}

{
    const group = (companyId, stationIds) => ({ companyId, lineIds: [`${companyId}.Line`], stationIds, edgeIds: [], types: [] });
    const companies = [group('Bottom', ['bottom']), group('Right', ['right']), group('Left', ['left']), group('Top', ['top', 'tail']), group('Main', ['bottom']), group('Tie', ['left'])];
    const data = { selectedLine: { id: main }, currentLegend: [], topology: { edges: [] }, companyLegends: companies };
    const positions = new Map([
        ['bottom', { x: 0, y: 200 }], ['right', { x: 100, y: 100 }], ['left', { x: -100, y: 100 }],
        ['top', { x: 100, y: 0 }], ['tail', { x: 100, y: 300 }]
    ]);
    const before = structuredClone(companies);
    const rows = layoutDiagramLegendRows(data, { positions }, new Map());
    assert.deepEqual(rows.map(({ companyId }) => companyId), ['', 'Main', 'Top', 'Left', 'Tie', 'Right', 'Bottom'], '同公司固定第二行，其他公司按最上端和左侧排序，同位置保持拓扑顺序');
    assert.deepEqual(companies, before, '排序不修改原始公司分组');
}

{
    const edge = { id: 'loop', from: 'a', to: 'b' };
    const data = {
        selectedLine: { id: main }, currentLegend: [], topology: { edges: [edge] },
        companyLegends: [
            { companyId: 'Straight', types: [], stationIds: ['top'], edgeIds: [] },
            { companyId: 'Loop', types: [{ id: 'Loop.Local' }], stationIds: ['a', 'b'], edgeIds: ['loop'] }
        ]
    };
    const geometry = {
        positions: new Map([['a', { x: 100, y: 100 }], ['b', { x: 100, y: 300 }], ['top', { x: 0, y: 0 }]]),
        loops: new Set(['loop']), loopX: -50, bends: new Map([['loop', { radius: 120 }]])
    };
    const tracks = new Map([['loop', [{ type: { sourceTypeIds: ['Loop.Local'] }, offset: 10, shift: 0, endpointOffsets: new Map([['a', 10], ['b', 10]]) }]]]);
    assert.deepEqual(layoutDiagramLegendRows(data, geometry, tracks).map(({ companyId }) => companyId), ['', 'Loop', 'Straight'], '回折曲线顶部超出端点时按实际曲线排序');
}

console.log('线路图公司图例：同公司隐藏、全种别聚合、共线元数据、低频种别、固定排序和区段位置验证通过。');
