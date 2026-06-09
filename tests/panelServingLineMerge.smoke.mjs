import assert from 'node:assert/strict';

import {
    buildPanelLineMergeInfo,
    normalizeArrayLike
} from '../src/features/panel/panelServingLineMerge.js';

assert.deepEqual(normalizeArrayLike(['A', 'B']), ['A', 'B']);
assert.deepEqual(normalizeArrayLike('["A","B"]'), ['A', 'B']);
assert.deepEqual(normalizeArrayLike('A'), ['A']);
assert.deepEqual(normalizeArrayLike(''), []);
assert.deepEqual(normalizeArrayLike(null), []);

const getLineMeta = (lineId) => ({
    'JR.Yamanote': { company: 'JR' },
    'JR.YamanoteBranch': { company: 'JR' },
    'Metro.Tozai': { company: 'Metro' }
}[lineId] || null);

const merged = buildPanelLineMergeInfo({
    servingLineIds: ['JR.Yamanote', 'JR.YamanoteBranch', 'Metro.Tozai'],
    getLineMeta
});

assert.deepEqual(merged.displayLineIds, ['JR.Yamanote', 'Metro.Tozai']);
assert.deepEqual(merged.lineGroupByMainId.get('JR.Yamanote'), ['JR.Yamanote', 'JR.YamanoteBranch']);
assert.deepEqual(merged.lineGroupByMainId.get('Metro.Tozai'), ['Metro.Tozai']);

const unmergedAcrossCompany = buildPanelLineMergeInfo({
    servingLineIds: ['Metro.Tozai', 'Metro.TozaiBranch'],
    getLineMeta: (lineId) => ({
        'Metro.Tozai': { company: 'Metro' },
        'Metro.TozaiBranch': { company: 'OtherMetro' }
    }[lineId] || null)
});

assert.deepEqual(unmergedAcrossCompany.displayLineIds, ['Metro.Tozai', 'Metro.TozaiBranch']);
assert.deepEqual(unmergedAcrossCompany.lineGroupByMainId.get('Metro.TozaiBranch'), ['Metro.TozaiBranch']);

console.log('panel serving-line merge smoke ok');
