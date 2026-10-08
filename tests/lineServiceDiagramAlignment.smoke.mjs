import assert from 'node:assert/strict';
import { getServiceBundleShifts } from '../src/ui/lineServiceDiagramAlignment.js';

const bundle = (id, types, lineIds = [id]) => ({
    id, lineIds, edgeIds: [id], types: [...types].map((type) => ({ id: `${id}.${type}.元数据`, name: '相同名称', color: '#888' }))
});
const dataFor = (bundles, edges) => ({ selectedLine: { id: 'main' }, serviceBundles: bundles, topology: { edges } });
const transition = (before, after, branch = false) => {
    const bundles = [bundle('main', before), bundle('next', after)];
    const edges = [{ id: 'main', from: 'A', to: 'B' }, { id: 'next', from: 'B', to: 'C' }];
    if (branch) {
        bundles.push(bundle('branch', 'z'));
        edges.push({ id: 'branch', from: 'B', to: 'D' });
    }
    return getServiceBundleShifts(dataFor(bundles, edges)).get('next');
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
    const shifts = getServiceBundleShifts(dataFor(bundles, edges));
    assert.equal(shifts.get('next'), 0, '未匹配的普通转换仍居中');
    assert.equal(shifts.get('branch'), 0, '居中沿后续整段延续');
}

{
    const bundles = [bundle('main', 'abcdef'), bundle('hokuso', 'acf', ['hokuso', 'skyaccess']), bundle('skyaccess', 'a'), bundle('keisei', 'bcde')];
    const edges = [
        { id: 'main', from: 'A', to: 'KeiseiTakasago' }, { id: 'hokuso', from: 'KeiseiTakasago', to: 'ImbaNihonIdai' },
        { id: 'skyaccess', from: 'ImbaNihonIdai', to: 'D' }, { id: 'keisei', from: 'KeiseiTakasago', to: 'E' }
    ];
    const shifts = getServiceBundleShifts(dataFor(bundles, edges));
    assert.deepEqual([...shifts.values()], [0, 30, 10, 0], '高砂按最右种别对齐，日本医大再独立对齐单一种别');
    assert.deepEqual(bundles[1].types.map((type) => type.id), ['hokuso.a.元数据', 'hokuso.c.元数据', 'hokuso.f.元数据'], '内部种别顺序不变');
}

console.log('种别连续顺序、最右对齐、分叉回退、整段平移和各段独立直通偏移验证通过。');
