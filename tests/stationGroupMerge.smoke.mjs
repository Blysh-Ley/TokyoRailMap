import assert from 'node:assert/strict';

import { mergeStationGroups } from '../src/domain/stationGroupMerge.js';

const flattenGroup = (group) => Array.from(new Set(group.flat())).sort();

{
    const merged = mergeStationGroups(
        [[['A', 'B', 'C']], [['D', 'E']]],
        [[['C'], ['D']]]
    );
    assert.equal(merged.length, 1, 'conflicting primary and supplemental groups should merge');
    assert.deepEqual(flattenGroup(merged[0]), ['A', 'B', 'C', 'D', 'E']);
}

{
    const merged = mergeStationGroups(
        [[['A', 'B']]],
        [[['C'], ['D']]]
    );
    assert.equal(merged.length, 2, 'non-conflicting supplemental groups should be appended');
    assert.deepEqual(
        merged.map(flattenGroup),
        [['A', 'B'], ['C', 'D']]
    );
}

{
    const merged = mergeStationGroups(
        [[['A', 'A'], ['B']]],
        [[['B'], ['C', 'C']]]
    );
    assert.deepEqual(merged, [[['A'], ['B'], ['C']]], 'duplicate station ids should be removed');
}

{
    const primary = [[['A', 'B']], [['C']]];
    assert.deepEqual(
        mergeStationGroups(primary, []),
        primary,
        'empty supplemental groups should return normalized primary groups'
    );
}

console.log('station group merge smoke ok');
