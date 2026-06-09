import assert from 'node:assert/strict';

import {
    derivePanelTripDetailBranchRuntime,
    resolvePanelTripDetailBranchRefIds
} from '../src/features/panel/panelTripDetailBranchRuntime.js';

assert.deepEqual(
    await resolvePanelTripDetailBranchRefIds({
        refIds: ['ref-a'],
        token: 1,
        key: 'nt',
        resolveFirstMultiRefsAlongChain: async () => ['ref-a', 'ref-b'],
        isTokenCurrent: () => true
    }),
    ['ref-a', 'ref-b']
);

assert.deepEqual(
    await resolvePanelTripDetailBranchRefIds({
        refIds: ['ref-a'],
        token: 1,
        key: 'nt',
        resolveFirstMultiRefsAlongChain: async () => ['ref-a'],
        isTokenCurrent: () => true
    }),
    ['ref-a']
);

assert.equal(
    await resolvePanelTripDetailBranchRefIds({
        refIds: ['ref-a'],
        token: 1,
        key: 'nt',
        resolveFirstMultiRefsAlongChain: async () => ['ref-a', 'ref-b'],
        isTokenCurrent: () => false
    }),
    null
);

assert.deepEqual(
    derivePanelTripDetailBranchRuntime({
        ntBranchLanes: [{ id: 1 }, { id: 2 }],
        ptBranchLanes: [{ id: 3 }]
    }),
    {
        activeBranchLanes: [{ id: 1 }, { id: 2 }],
        branchCount: 2,
        branchMode: 'split'
    }
);

assert.deepEqual(
    derivePanelTripDetailBranchRuntime({
        ntBranchLanes: [{ id: 1 }],
        ptBranchLanes: [{ id: 2 }, { id: 3 }]
    }),
    {
        activeBranchLanes: [{ id: 2 }, { id: 3 }],
        branchCount: 2,
        branchMode: 'merge'
    }
);

assert.deepEqual(
    derivePanelTripDetailBranchRuntime({
        ntBranchLanes: [{ id: 1 }],
        ptBranchLanes: [{ id: 2 }]
    }),
    {
        activeBranchLanes: [],
        branchCount: 0,
        branchMode: ''
    }
);

console.log('panel trip-detail branch runtime smoke ok');
