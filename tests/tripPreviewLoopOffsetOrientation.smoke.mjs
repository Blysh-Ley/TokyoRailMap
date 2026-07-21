import assert from 'node:assert/strict';
import { extractShortestLoopSegmentByIndex } from '../src/lib/trip-preview.js';

const ring = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [3, 1],
    [0, 1],
    [0, 0]
];

const innerTravel = extractShortestLoopSegmentByIndex(ring, [2, 0], [1, 0], {
    direction: 'InnerLoop',
    maxSnapMeters: 1,
    preserveLineDirection: false
});
assert.deepEqual(innerTravel, [[2, 0], [1, 0]]);

const innerPaint = extractShortestLoopSegmentByIndex(ring, [2, 0], [1, 0], {
    direction: 'InnerLoop',
    maxSnapMeters: 1,
    preserveLineDirection: true
});
assert.deepEqual(innerPaint, [[1, 0], [2, 0]]);

const outerPaint = extractShortestLoopSegmentByIndex(ring, [1, 0], [2, 0], {
    direction: 'OuterLoop',
    maxSnapMeters: 1,
    preserveLineDirection: true
});
assert.deepEqual(outerPaint, [[1, 0], [2, 0]]);

console.log('trip preview loop offset orientation smoke ok');
