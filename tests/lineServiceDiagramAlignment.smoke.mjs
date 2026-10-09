import assert from 'node:assert/strict';
import { getServiceBundleShifts, getServiceEdgeShifts } from '../src/ui/lineServiceDiagramAlignment.js';

const bundle = (id, types, lineIds = [id]) => ({
    id, lineIds, edgeIds: [id], types: [...types].map((type) => ({ id: `${id}.${type}.元数据`, name: '相同名称', color: '#888' }))
});
const dataFor = (bundles, edges) => ({ selectedLine: { id: 'main' }, serviceBundles: bundles, topology: { edges } });
const positions = (ys) => new Map(Object.entries(ys).map(([id, y]) => [id, { y }]));
const transition = (before, after, branch = false) => {
    const bundles = [bundle('main', before), bundle('next', after)];
    const edges = [{ id: 'main', from: 'A', to: 'B' }, { id: 'next', from: 'B', to: 'C' }];
    if (branch) {
        bundles.push(bundle('branch', 'z'));
        edges.push({ id: 'branch', from: 'B', to: 'D' });
    }
    return getServiceBundleShifts(dataFor(bundles, edges), positions({ A: 0, B: 30, C: 60, D: 60 })).get('next');
};

for (const [before, after, shift] of [
    ['bcd', 'abcde', 0], ['abc', 'c', 20], ['abcdef', 'def', 30],
    ['def', 'abcdef', -30], ['abcdef', 'kge', 10],
    ['abcd', 'ac', 0], ['ab', 'acbd', 0], ['abc', 'xy', 0], ['abc', 'bca', 0]
]) assert.equal(transition(before, after), shift, `${before} → ${after} 仅按 ID 第二项和既定顺序整段对齐`);
assert.equal(transition('abc', 'xy', true), 10, '分叉无种别匹配时，较少一侧向右平移半个轨道间距');
assert.equal(transition('xy', 'abc', true), -10, '较多一侧反向平移，保留少的一侧向右的相对位置');
assert.equal(transition('abc', 'c', true), 20, '连续种别对齐优先于分叉回退');
assert.equal(transition('abcdef', 'kge', true), 10, '最右种别对齐优先于分叉回退');

{
    const bundles = [bundle('main', 'abcde'), bundle('next', 'def'), bundle('branch', 'xy')];
    bundles[1].edgeIds.push('continued');
    const edges = [
        { id: 'main', from: 'A', to: 'B' }, { id: 'next', from: 'B', to: 'C' },
        { id: 'continued', from: 'C', to: 'D' }, { id: 'branch', from: 'D', to: 'E' }
    ];
    const shifts = getServiceBundleShifts(dataFor(bundles, edges), positions({ A: 0, B: 30, C: 60, D: 90, E: 120 }));
    assert.equal(shifts.get('next'), 0, '未匹配的普通转换仍居中');
    assert.equal(shifts.get('branch'), 0, '居中沿后续整段延续');
}

{
    const bundles = [bundle('main', 'abcdef'), bundle('hokuso', 'acf', ['hokuso', 'skyaccess']), bundle('skyaccess', 'a'), bundle('keisei', 'bcde')];
    const edges = [
        { id: 'main', from: 'A', to: 'KeiseiTakasago' }, { id: 'hokuso', from: 'KeiseiTakasago', to: 'ImbaNihonIdai' },
        { id: 'skyaccess', from: 'ImbaNihonIdai', to: 'D' }, { id: 'keisei', from: 'KeiseiTakasago', to: 'E' }
    ];
    const shifts = getServiceBundleShifts(dataFor(bundles, edges), positions({ A: 0, KeiseiTakasago: 30, ImbaNihonIdai: 60, D: 90, E: 60 }));
    assert.deepEqual([...shifts.values()], [0, 30, 10, 0], '高砂按最右种别对齐，日本医大再独立对齐单一种别');
    assert.deepEqual(bundles[1].types.map((type) => type.id), ['hokuso.a.元数据', 'hokuso.c.元数据', 'hokuso.f.元数据'], '内部种别顺序不变');
}

for (const [merged, incoming, offset] of [
    ['abcdef', 'def', 30], ['abcdef', 'kge', 10], ['abc', 'xy', 10],
    ['abc', 'bca', 0], ['def', 'abcdef', -30]
]) for (const sign of [1, -1]) for (const selected of ['main', 'merged']) {
    const bundles = [bundle('main', 'z'), bundle('incoming', incoming), bundle('merged', merged)];
    const edges = [
        { id: 'main', from: 'A', to: 'J' }, { id: 'incoming', from: 'B', to: 'J' },
        { id: 'merged', from: 'J', to: 'C' }
    ];
    const data = { ...dataFor(bundles, edges), selectedLine: { id: selected } };
    const points = positions({ A: 0, B: 0, J: sign * 30, C: sign * 60 });
    for (const order of [bundles, bundles.slice().reverse()]) {
        const shifts = getServiceBundleShifts({ ...data, serviceBundles: order }, points);
        assert.equal(shifts.get('incoming') - shifts.get('merged'), offset,
            `${incoming} 接续 ${merged}：分叉与合并复用同一优先级，不受另一支路或选线影响`);
        assert.deepEqual(bundles[1].types.map((type) => type.id.split('.')[1]), [...incoming], '合并对齐只移动整段，不重排内部种别');
    }
}

for (const [merged, incoming, offset] of [
    ['abcdef', 'def', 30], ['abcdef', 'kge', 10], ['abc', 'xy', 10],
    ['abc', 'bca', 0], ['def', 'abcdef', -30]
]) for (const sign of [1, -1]) {
    const bundles = [bundle('main', merged), bundle('incoming', incoming), bundle('sibling', 'z')];
    bundles[1].edgeIds.push('continued');
    const edges = [
        { id: 'main', from: 'J', to: 'C' }, { id: 'incoming', from: 'B', to: 'J' },
        { id: 'continued', from: 'A', to: 'B' }, { id: 'sibling', from: 'S', to: 'J' }
    ];
    const data = dataFor(bundles, edges), points = positions({ A: -60 * sign, B: -30 * sign, S: -30 * sign, J: 0, C: 30 * sign });
    const shifts = new Map([['main', 0], ['incoming', 40], ['sibling', 0]]);
    const bends = new Map([['incoming', { side: sign > 0 ? 'before' : 'after' }]]);
    for (const order of [edges, edges.map((edge) => ({ ...edge, from: edge.to, to: edge.from }))]) {
        const result = getServiceEdgeShifts({ ...data, topology: { edges: order } }, points, bends, shifts);
        const edge = order.find((edge) => edge.id === 'incoming'), ends = result.get(edge.id);
        assert.equal(shifts.get('incoming'), 40, '保留区段在另一端已经确定的整体偏移');
        assert.equal(ends[edge.from === 'J' ? 'from' : 'to'] + shifts.get('incoming'), offset, '接续弯道在合并端补足四级规则要求的偏移');
        assert.equal(ends[edge.from === 'J' ? 'to' : 'from'], 0, '弯道另一端保持连续，正反向均适用');
        assert.ok(!result.has('continued'), '直行区段保持原有位置');
    }
}

console.log('种别对齐、分叉合并优先级、区段整体偏移和接续弯道两端独立对齐验证通过。');
