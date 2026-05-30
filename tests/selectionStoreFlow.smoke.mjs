import assert from 'node:assert/strict';
import { createSearchFeature } from '../src/features/search/searchFeature.js';
import { createStore } from '../src/store/appStore.js';
import { selectionClear } from '../src/store/actions.js';

const toArray = (value) => Array.isArray(value) ? value : [];

const store = createStore();
const seen = [];
store.subscribe((state, action) => {
    seen.push({
        type: action.type,
        selectedCompany: state.selectedCompany,
        selectedLineId: state.selectedLineId,
        selectedStationLineIds: state.selectedStationLineIds,
        selectedStationId: state.selectedStationId,
        selectedServiceMode: state.selectedServiceMode
    });
});

const searchFeature = createSearchFeature({
    store,
    resolveLineSelection: (lineId) => {
        if (lineId === 'THROUGH') {
            return {
                mainLineId: 'MAIN',
                mergedLineIds: ['MAIN', 'BRANCH']
            };
        }
        return null;
    }
});

{
    const payload = searchFeature.commitLine('THROUGH');
    assert.deepEqual(payload, {
        selectedLineId: 'MAIN',
        selectedCompany: null,
        selectedStationLineIds: ['MAIN', 'BRANCH'],
        selectedStationId: null,
        selectedServiceMode: 'all',
        mergedLineIds: ['MAIN', 'BRANCH']
    });

    const state = store.getState();
    assert.equal(state.selectedLineId, 'MAIN');
    assert.deepEqual(state.selectedStationLineIds, ['MAIN', 'BRANCH']);
    assert.equal(state.selectedCompany, null);
    assert.equal(state.selectedStationId, null);
}

{
    const payload = searchFeature.selectStationLines({
        stationId: 'ST-01',
        lineIds: ['MAIN', '', null, 'BRANCH', 'MAIN']
    });

    assert.deepEqual(payload, {
        selectedCompany: null,
        selectedLineId: null,
        selectedStationLineIds: ['MAIN', 'BRANCH'],
        selectedStationId: 'ST-01',
        selectedServiceMode: 'all'
    });

    const state = store.getState();
    assert.equal(state.selectedLineId, null);
    assert.equal(state.selectedCompany, null);
    assert.deepEqual(state.selectedStationLineIds, ['MAIN', 'BRANCH']);
    assert.equal(state.selectedStationId, 'ST-01');
}

{
    store.dispatch(selectionClear({ stationOnly: true, source: 'smoke.stationOnly' }));
    const state = store.getState();
    assert.equal(state.selectedLineId, null);
    assert.equal(state.selectedCompany, null);
    assert.equal(state.selectedStationLineIds, null);
    assert.equal(state.selectedStationId, null);
}

{
    searchFeature.commitCompany('Tokyo Metro');
    assert.equal(store.getState().selectedCompany, 'Tokyo Metro');

    searchFeature.clearSelection({ source: 'smoke.clearAll' });
    const state = store.getState();
    assert.equal(state.selectedCompany, null);
    assert.equal(state.selectedLineId, null);
    assert.equal(state.selectedStationLineIds, null);
    assert.equal(state.selectedStationId, null);
    assert.equal(state.selectedServiceMode, 'all');
}

assert.deepEqual(toArray(seen.map((entry) => entry.type)), [
    'selection/commitLine',
    'selection/selectStationLines',
    'selection/clear',
    'selection/commitCompany',
    'selection/clear'
]);

console.log('selection store flow smoke ok');
