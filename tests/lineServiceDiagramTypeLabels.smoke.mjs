import assert from 'node:assert/strict';
import { buildServiceLabelSections } from '../src/domain/lineServiceDiagram/typeLabels.js';
import { buildLineServiceDiagramData } from '../src/domain/lineServiceDiagram.js';
import { layoutLineServiceDiagram } from '../src/ui/lineServiceDiagramLayout.js';
import { planDiagramTypeLabels } from '../src/ui/lineServiceDiagramTypeLabels.js';
import { measureTypeLabel, splitTypeHeadTextChunks } from '../src/lib/typeLabelText.js';

const type = (key, name = key, color = '#e56332', company = 'Main') => ({ key, id: `${company}.${key}`, name, color });
const local = type('Local', '普通'), rapid = type('Rapid', '快速');
const sections = (rows, stationOrder = ['A', 'B']) => {
    const edges = rows.map(([from, to], index) => ({ id: `edge-${index}`, from, to }));
    const data = { selectedLine: { id: 'Main.Main', stationOrder }, topology: {
        edges, stations: [...new Set(rows.flatMap(([a, b]) => [a, b]))].map((id) => ({ id }))
    }, serviceBundles: rows.map(([, , types, current], index) => ({ id: `bundle-${index}`,
        lineIds: current ? ['Main.Main'] : ['Other.Main'], edgeIds: [`edge-${index}`], types })) };
    return buildServiceLabelSections(data);
};

{
    const labels = sections([['A', 'B', [rapid, local], true], ['B', 'C', [rapid, local]], ['C', 'D', [rapid, local]]]);
    assert.equal(labels.length, 1, '完全一致的连续直通只保留当前线路首次标注');
    assert.equal(labels[0].primary, true);
    assert.deepEqual(labels[0].types.map((entry) => entry.key), ['Rapid', 'Local']);
}
for (const changed of [[local, rapid], [rapid, type('Local', '普通', '#456')], [rapid, local, type('Express', '急行')]]) {
    const labels = sections([['A', 'B', [rapid, local], true], ['B', 'C', changed]]);
    assert.equal(labels.length, 2, '顺序、颜色或部分种别变化均触发整组重标');
    assert.deepEqual(labels[1].types, changed);
}
{
    const labels = sections([['A', 'B', [local], true], ['B', 'C', [local]], ['B', 'D', [local]]]);
    assert.equal(labels.length, 1, '完全一致的分叉同样省略');
    const changed = sections([['A', 'B', [rapid, local], true], ['B', 'C', [local]], ['B', 'D', [local]]]);
    assert.equal(changed.length, 3, '两条不同支路各自相对主干判断，不能互相去重');
    const repeated = sections([['A', 'B', [local], true], ['B', 'C', [rapid]], ['C', 'D', [local]]]);
    assert.equal(repeated.length, 3, '经过其他种别后恢复的区段要重新标注');
}
{
    const labels = sections([['A', 'B', [rapid, local], true], ['B', 'C', [local], true]], ['A', 'B', 'C']);
    assert.equal(labels[0].anchorId, 'C');
    assert.equal(labels.length, 2, '起始段缺席的当前线路种别在其实际运行区段补齐');
}
{
    const measured = measureTypeLabel('Access特急', (text) => text.length * 7);
    assert.deepEqual(measured.runs.map(({ text, rotate }) => [text, rotate]), [['Access', true], ['特', false], ['急', false]]);
    assert.equal(measured.height, 42 + 28, '英文整体旋转后按其横向测量宽度占用高度');
    assert.deepEqual(splitTypeHeadTextChunks('S-TRAIN 特急').map(({ text, kind }) => [text, kind]), [['S-TRAIN ', 'en'], ['特', 'other'], ['急', 'other']]);
    assert.equal(measureTypeLabel('普通').height, 28);
}

{
    const blue = type('CommuterLimitedExpress', '通勤特急', '#1EB0E6');
    const data = { topology: { edges: [{ id: 'straight', from: 'S', to: 'T' }, { id: 'curve', from: 'U', to: 'V' }] },
        serviceLabelSections: [{ edgeIds: ['straight'], types: [blue], anchorId: 'S', isCurrent: false, primary: false }] };
    const positions = new Map([['S', { x: 0, y: 0 }], ['T', { x: 0, y: 100 }], ['U', { x: 50, y: 20 }], ['V', { x: -50, y: 120 }]]);
    const sizes = new Map([...positions.keys()].map((id) => [id, { height: 22 }]));
    const tracks = new Map([['straight', [{ type: blue, shift: 0, path: 'M0,0L0,100' }]], ['curve', []]]);
    const geometry = { positions, loops: new Set(), bends: new Map([['curve', {}]]) };
    const before = planDiagramTypeLabels(data, geometry, { serviceTracks: tracks }, sizes, new Map());
    assert.equal(before.edgeGaps.get('straight'), 100, '单纯的直线长度足够时不增加高度');
    tracks.set('curve', [{ type: rapid, shift: 0, path: 'M50,20A100,100 0 0 0 -50,120' }]);
    const after = planDiagramTypeLabels(data, geometry, { serviceTracks: tracks }, sizes, new Map());
    assert.ok(after.edgeGaps.get('straight') > 100, '相邻圆弧占用色带时必须为完整文字另留空间');
}

{
    const name = type('Local', '各站停车');
    const data = { topology: { edges: [{ id: 'straight', from: 'S', to: 'T' }, { id: 'curve', from: 'S', to: 'U' }] },
        serviceLabelSections: [{ edgeIds: ['curve'], types: [name], anchorId: 'S', isCurrent: false, primary: false }] };
    const positions = new Map([['S', { x: 0, y: 0 }], ['T', { x: 60, y: 100 }], ['U', { x: 120, y: 100 }]]);
    const sizes = new Map([...positions.keys()].map((id) => [id, { height: 22 }]));
    const straight = { type: rapid, shift: 0, path: 'M60,0L60,100', endpointOffsets: new Map([['S', 60], ['T', 0]]) };
    const curve = { type: name, shift: 0, path: 'M0,0L0,20A10,10 0 0 0 10,30L110,30A10,10 0 0 1 120,40L120,100',
        endpointOffsets: new Map([['S', 0], ['U', 0]]) };
    const tracks = new Map([['straight', [straight]], ['curve', [curve]]]);
    const geometry = { positions, loops: new Set(), bends: new Map([['curve', { side: 'after' }]]) };
    const result = planDiagramTypeLabels(data, geometry, { serviceTracks: tracks }, sizes, new Map());
    assert.ok(result.horizontalWidths.get('curve') > 100, '先绘制的主干仍通过接点遮罩透出，文字必须避开遮罩断口');
}

const main = 'Main.Main', upper = 'Upper.Main';
const railway = (id, ids) => ({ id, stations: ids, ascending: 'Outbound', descending: 'Inbound', title: { 'zh-Hans': id }, color: '#345' });
const trip = (id, lineId, typeId, ids) => ({ id: `${lineId}.${id}.Weekday`, r: lineId, y: typeId, d: 'Outbound', tt: ids.map((s) => ({ s })) });
const metadata = (id, name) => ({ id, title: { 'zh-Hans': name, color: '#e56332' } });
const build = (railways, roots, trips, trainTypes, stationGroups = []) => buildLineServiceDiagramData({
    lineId: main, railways, rootTrips: roots, trips, trainTypes, stationGroups,
    stations: [...new Set(railways.flatMap((line) => line.stations))].map((id) => ({ id, title: { 'zh-Hans': id.split('.').at(-1) } }))
});
const layout = (data, names = new Map()) => layoutLineServiceDiagram(data,
    new Map(data.topology.stations.map(({ id }) => [id, { labelWidth: 80, transferWidth: 0, height: 22 }])), new Map(), names);
const ids = ['Start', 'Middle', 'End'].map((name) => `${main}.${name}`);
{
    const root = trip('Root', main, 'Main.Local', ids);
    const data = await build([railway(main, ids)], [root], [root], [metadata('Main.Local', '普通')]);
    const result = layout(data), point = result.positions.get(ids.at(-1));
    assert.equal(result.typeLabelExtensions.length, 1, '没有上方直通时添加装饰性轨道延伸');
    assert.equal(data.topology.stations.length, 3, '延伸不增加虚构站点');
    const label = result.typeLabels[0];
    assert.ok(label.y + label.metrics.height / 2 + 6 <= point.y - 8, '文字与首站胶囊区域保留净距');
    assert.ok(result.mainBounds.top <= label.y - label.metrics.height / 2, '初始视野包括起始标注');
}
{
    const top = [`${upper}.Join`, `${upper}.Next`, `${upper}.End`];
    const root = trip('Root', main, 'Main.Rapid', ids), through = trip('Through', upper, 'Upper.Rapid', top);
    root.nt = [through.id]; through.pt = [root.id];
    const name = 'Access特急';
    const data = await build([railway(main, ids), railway(upper, top)], [root], [root, through],
        [metadata('Main.Rapid', name), metadata('Upper.Rapid', name)], [[[ids.at(-1), top[0]]]]);
    const result = layout(data, new Map([[name, measureTypeLabel(name, (text) => text.length * 7)]]));
    assert.equal(result.typeLabelExtensions.length, 0, '上方已有直通时不另造起始延伸');
    assert.equal(result.typeLabels.length, 1, '相同直通段只承担当前线路首次标注');
    const label = result.typeLabels[0], a = result.positions.get(ids.at(-1)), b = result.positions.get(top[1]);
    assert.ok(label.y > b.y && label.y < a.y, '首次标注放在起始站与上方相邻接续站之间');
    assert.ok(a.y - b.y >= label.metrics.height + 12 + 22, '短站间增加高度，后期压紧不能吃掉文字空间');
}
{
    const mainIds = 'ABCDEFGH'.split('').map((id) => `${main}.${id}`);
    const branchIds = ['Join', 'Middle', 'End'].map((id) => `${upper}.${id}`);
    const full = trip('Full', main, 'Main.Local', mainIds);
    const connecting = trip('Connecting', main, 'Main.Local', mainIds.slice(0, 4));
    const branch = trip('Branch', upper, 'Upper.Express', branchIds);
    connecting.nt = [branch.id]; branch.pt = [connecting.id];
    const name = 'Very Long Airport Express';
    const data = await build([railway(main, mainIds), railway(upper, branchIds)], [full, connecting], [full, connecting, branch],
        [metadata('Main.Local', '普通'), metadata('Upper.Express', name)], [[[mainIds[3], branchIds[0]]]]);
    const result = layout(data, new Map([[name, measureTypeLabel(name, (text) => text.length * 12)]]));
    const label = result.typeLabels.find((entry) => entry.type.id === 'Upper.Express');
    assert.equal(label.orientation, 'horizontal', '分叉在横段横写');
    const edge = data.topology.edges.find((edge) => edge.id === label.edgeId);
    const a = result.positions.get(edge.from), b = result.positions.get(edge.to), radius = result.bends.get(edge.id).radius;
    assert.ok(Math.abs(b.x - a.x) - radius * 2 >= label.metrics.width + 12, '长英文通过加长横段容纳，不缩小字号');
}
console.log('线路图轨道内种别：首次优先、相邻去重、变化整组重标、混合竖排、首站延伸及站间与横段留白验证通过。');
