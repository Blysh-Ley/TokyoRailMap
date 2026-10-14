import assert from 'node:assert/strict';
import { sliceLineOffsetProfile } from '../src/domain/lineOffsetGeometry.js';
import { evaluateLineOffsetProfile } from '../src/domain/lineOffsetProfile.js';

// 环线首尾重叠但并非同一点；起点投影到末尾，后续点投影到开头。
const overlappingLine = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0.001], [0.4, 0.001]];
const profile = [[0, 2.4], [0.25, 2.4], [0.35, 1.2], [0.45, 1.2], [0.55, 2.4], [1, 2.4]];
const segment = [[0.2, 0.001], [0.8, 0], [1, 0]];
for (const [coordinates, expected] of [[segment, 2.4], [segment.slice().reverse(), -2.4]]) {
    const sliced = sliceLineOffsetProfile(overlappingLine, profile, coordinates);
    for (const progress of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        assert.ok(Math.abs(evaluateLineOffsetProfile(sliced, progress) - expected) < 1e-9,
            '重叠处应按片段实际走向偏移，不误采样环线远处的过渡');
    }
}

const ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
const crossing = [[0, 0.5], [0, 0], [0.5, 0]];
for (const [coordinates, expected] of [[crossing, 2.4], [crossing.slice().reverse(), -2.4]]) {
    const sliced = sliceLineOffsetProfile(ring, profile, coordinates);
    assert.equal(sliced[0][1], expected, '跨闭合点的偏移方向正确');
    assert.equal(sliced.at(-1)[1], expected, '跨闭合点的偏移连续');
}

const openLine = [[0, 0], [1, 0], [2, 0], [3, 0]];
const transition = [[0, 0], [1, 3]];
for (const coordinates of [openLine.slice(1), openLine.slice(1).reverse()]) {
    const direction = coordinates[0][0] < coordinates.at(-1)[0] ? 1 : -1;
    const sliced = sliceLineOffsetProfile(openLine, transition, coordinates);
    for (const [progress, value] of sliced) {
        const position = (coordinates[0][0] + (coordinates.at(-1)[0] - coordinates[0][0]) * progress) / 3;
        assert.ok(Math.abs(value - evaluateLineOffsetProfile(transition, position) * direction) < 1e-9,
            '普通开口线路仍沿用原有偏移曲线');
    }
}
// 反向片段的终点恰好是折点，方向判断仍使用片段内部的线路切向。
const corner = [[0, 0], [1, 0], [1, 1], [2, 1]];
const reverseCorner = sliceLineOffsetProfile(corner, [[0, 2.4], [1, 2.4]], [[1, 1], [1, 0]]);
assert.ok(reverseCorner.every(([, value]) => value === -2.4));
assert.equal(sliceLineOffsetProfile(openLine, transition, openLine), transition);
console.log('线路偏移切段几何回归通过');
