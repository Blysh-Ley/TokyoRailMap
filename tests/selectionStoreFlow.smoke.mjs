import assert from 'node:assert/strict';
import { createSearchFeature } from '../src/features/search/searchFeature.js';
import { createStore } from '../src/store/appStore.js';
import {
    hoverPreviewBegin,
    hoverPreviewClose,
    hoverSetEnabled,
    mapClick,
    multiSelectSetEnabled,
    panelOpenRequested,
    reachableStopsCleared,
    reachableStopsUpdateRequested,
    selectionClear,
    selectionCommitLine,
    tripPreviewCleared,
    tripPreviewRequested
} from '../src/store/actions.js';

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

assert.deepEqual(createStore({
    selectedCompany: ' Company ',
    selectedLineId: ' ',
    selectedStationLineIds: new Set([' L1 ', '', 'L2']),
    selectedStationId: ' ST-00 ',
    selectedServiceMode: ''
}).getState(), {
    selectedCompany: 'Company',
    selectedLineId: null,
    selectedStationLineIds: ['L1', 'L2'],
    selectedStationId: 'ST-00',
    selectedServiceMode: 'all',
    hoverPreviewEnabled: true,
    multiSelectEnabled: false,
    lastInteraction: null
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
    assert.equal(searchFeature.previewLine(''), null);
    assert.equal(searchFeature.previewCompany(''), null);
    assert.equal(searchFeature.selectStationLines({ stationId: 'S0', lineIds: [] }), null);

    const payload = searchFeature.previewLine(' L0 ');
    assert.deepEqual(payload, {
        selectedLineId: 'L0',
        selectedCompany: null,
        selectedStationLineIds: null,
        selectedStationId: null,
        selectedServiceMode: 'all',
        mergedLineIds: ['L0']
    });
    assert.equal(store.getState().selectedLineId, 'L0');
}

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
    searchFeature.previewCompany(' Preview Rail ');
    const previewState = store.getState();
    assert.equal(previewState.selectedCompany, 'Preview Rail');
    assert.equal(previewState.selectedLineId, null);

    store.dispatch(selectionClear({ stationOnly: true, source: 'smoke.stationOnly' }));
    const state = store.getState();
    assert.equal(state.selectedLineId, null);
    assert.equal(state.selectedCompany, 'Preview Rail');
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

{
    store.dispatch(selectionCommitLine({
        selectedLineId: ' Trimmed ',
        selectedCompany: 'ignored',
        selectedStationLineIds: new Set(['A', 'A', ' B ']),
        selectedStationId: ' Station ',
        selectedServiceMode: ''
    }));

    const state = store.getState();
    assert.equal(state.selectedLineId, 'Trimmed');
    assert.equal(state.selectedCompany, 'ignored');
    assert.deepEqual(state.selectedStationLineIds, ['A', 'B']);
    assert.equal(state.selectedStationId, 'Station');
    assert.equal(state.selectedServiceMode, 'all');
    assert.equal(state.lastInteraction.type, 'selection/commitLine');
}

{
    store.dispatch(hoverSetEnabled(false));
    assert.equal(store.getState().hoverPreviewEnabled, false);
    store.dispatch(hoverSetEnabled(true));
    assert.equal(store.getState().hoverPreviewEnabled, true);

    store.dispatch(multiSelectSetEnabled(true));
    assert.equal(store.getState().multiSelectEnabled, true);
    assert.equal(store.getState().lastInteraction.type, 'multiSelect/setEnabled');
    store.dispatch(multiSelectSetEnabled(false));
    assert.equal(store.getState().multiSelectEnabled, false);
}

{
    const payloads = [
        mapClick({ layerId: 'lines-layer', featureId: 'L1' }),
        panelOpenRequested({ stationId: 'S1' }),
        tripPreviewRequested({ source: 'smoke' }),
        tripPreviewCleared({ source: 'smoke' }),
        reachableStopsUpdateRequested({ minutes: 30 }),
        reachableStopsCleared({ source: 'smoke' }),
        hoverPreviewBegin({ source: 'smoke.hover' }),
        hoverPreviewClose({ source: 'smoke.hover' })
    ];

    for (const action of payloads) {
        store.dispatch(action);
        assert.equal(store.getState().lastInteraction.type, action.type);
        assert.deepEqual(store.getState().lastInteraction.payload, action.payload);
    }
}

{
    const unsubscribeSeen = [];
    const unsubscribe = store.subscribe((state, action) => unsubscribeSeen.push(action.type));
    store.dispatch(mapClick({ id: 'before-unsubscribe' }));
    unsubscribe();
    store.dispatch(mapClick({ id: 'after-unsubscribe' }));
    assert.deepEqual(unsubscribeSeen, ['map/click']);
}

assert.deepEqual(toArray(seen.map((entry) => entry.type)), [
    'selection/previewLine',
    'selection/commitLine',
    'selection/selectStationLines',
    'selection/previewCompany',
    'selection/clear',
    'selection/commitCompany',
    'selection/clear',
    'selection/commitLine',
    'hover/setEnabled',
    'hover/setEnabled',
    'multiSelect/setEnabled',
    'multiSelect/setEnabled',
    'map/click',
    'panel/openRequested',
    'tripPreview/requested',
    'tripPreview/cleared',
    'reachableStops/updateRequested',
    'reachableStops/cleared',
    'hover/previewBegin',
    'hover/previewClose',
    'map/click',
    'map/click'
]);

console.log('selection store flow smoke ok');
