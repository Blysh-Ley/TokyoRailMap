import assert from 'node:assert/strict';

import { createHoverFeature } from '../src/features/hover/hoverFeature.js';
import { buildMultiSelectLayerItemsFromInputs } from '../src/features/highlight/multiSelectLayerItems.js';
import { createRoutePreviewController } from '../src/features/route/routePreviewController.js';
import { getVisibleBaseMultiSelectionLineIdsForPreview } from '../src/domain/multiSelectBaseSelection.js';
import { createStore } from '../src/store/appStore.js';

const testHoverLifecycleTrace = () => {
    const store = createStore({ hoverPreviewEnabled: true });
    const actions = [];
    const snapshots = [];
    const restored = [];
    store.subscribe((_state, action) => actions.push(action));

    const hoverFeature = createHoverFeature({
        store,
        canRunHoverPreviewAtCurrentZoom: () => true,
        snapshotSelectionState: () => {
            const snapshot = { selectedLineId: 'L1' };
            snapshots.push(snapshot);
            return snapshot;
        },
        restoreSelectionState: (snapshot) => {
            restored.push(snapshot);
        }
    });

    assert.equal(hoverFeature.beginPreview(), true);
    assert.equal(hoverFeature.getPreviewStatus().hasSnapshot, true);
    assert.equal(store.getState().lastInteraction.type, 'hover/previewBegin');

    hoverFeature.closePreview({ committed: false });
    assert.equal(restored.length, 1);
    assert.equal(hoverFeature.getPreviewStatus().hasActivePreview, false);
    assert.equal(store.getState().lastInteraction.type, 'hover/previewClose');
    assert.equal(store.getState().lastInteraction.payload.committed, false);

    assert.equal(hoverFeature.beginPreview(), true);
    hoverFeature.commitPreview();
    assert.equal(store.getState().lastInteraction.type, 'hover/previewCommit');

    hoverFeature.setEnabled(false);
    assert.equal(hoverFeature.beginPreview(), false);
    assert.equal(snapshots.length, 2);

    const types = actions.map((action) => action.type);
    assert.ok(types.includes('hover/previewBegin'));
    assert.ok(types.includes('hover/previewRestore'));
    assert.ok(types.includes('hover/previewClose'));
    assert.ok(types.includes('hover/previewCommit'));
};

const testTripPreviewTrace = () => {
    const store = createStore();
    const calls = [];
    const routeFeature = {
        clearTripPathPreview(args) {
            calls.push({ name: 'clearTripPathPreview', args });
        },
        previewTripPath(args) {
            calls.push({ name: 'previewTripPath', args });
        },
        rebuildMultiTripPreview() {},
        toggleTripPreviewSelectionVisibility() {
            return true;
        },
        deleteTripPreviewSelection() {
            return true;
        }
    };

    const controller = createRoutePreviewController({
        routeFeature,
        store,
        isMultiSelectModeEnabled: () => false,
        resolveTripPreviewPayloadSource: (payload) => payload?.__previewSource || payload?.previewSource || '',
        buildTripPreviewAggregate: () => null,
        getBaseMultiSelectedLineIds: () => new Set()
    });

    controller.previewTripPath({
        __previewInteraction: 'click',
        __previewSource: 'journey',
        fitMode: 'commit',
        previewKey: 'preview-1',
        selectedLineId: 'L1',
        tripKey: 'T1'
    }, {
        clearBefore: true,
        fitMode: 'commit'
    });

    assert.equal(store.getState().lastInteraction.type, 'tripPreview/requested');
    assert.deepEqual(store.getState().lastInteraction.payload, {
        source: 'routePreviewController',
        previewSource: 'journey',
        interaction: 'click',
        fitMode: 'commit',
        clearBefore: true,
        previewKey: 'preview-1',
        tripKey: 'T1',
        selectedLineId: 'L1',
        mainLineId: null
    });
    assert.equal(calls.at(-1).name, 'previewTripPath');

    controller.clearTripPathPreview({
        source: 'panel-trip',
        interaction: 'hover',
        fitMode: 'preview'
    });

    assert.equal(store.getState().lastInteraction.type, 'tripPreview/cleared');
    assert.deepEqual(store.getState().lastInteraction.payload, {
        source: 'routePreviewController',
        previewSource: 'panel-trip',
        interaction: 'hover',
        fitMode: 'preview'
    });
    assert.equal(calls.at(-1).name, 'clearTripPathPreview');
};

const testMultiSelectLayerItemsHelper = () => {
    const baseSelectionsByKey = new Map([
        ['line:L1', {
            hidden: false,
            kind: 'line',
            lineIds: new Set(['L1'])
        }],
        ['company:C1', {
            displayName: 'Company One',
            hidden: true,
            kind: 'company',
            lineIds: new Set(['L2'])
        }]
    ]);

    const tripPreviewSelectionEntries = [
        ['journey-1', {
            built: {
                endStationId: 'S2',
                lineIds: new Set(['L3']),
                startStationId: 'S1'
            },
            hidden: false,
            payload: {
                selectedLineId: 'L3',
                typeName: 'Local'
            },
            source: 'journey'
        }],
        ['base-preview', {
            built: {
                lineIds: new Set(['L1'])
            },
            payload: {
                selectedLineId: 'multi-base',
                virtualTrips: [{
                    selectedLineId: 'L1',
                    selectedLineName: 'Trip Line One',
                    mainLineId: 'L1',
                    segments: [{
                        lineId: 'L1',
                        stationIds: ['S1', 'S2']
                    }]
                }]
            },
            source: 'ms-base-trip-preview'
        }],
        ['branch-1', {
            built: {
                endStationId: 'S4',
                lineIds: new Set(['L4']),
                startStationId: 'S3'
            },
            payload: {
                selectedLineName: 'Line Four'
            },
            source: 'ms-line-branch:L4'
        }]
    ];

    const buildItems = (branchStep) => buildMultiSelectLayerItemsFromInputs({
        baseTripPreviewSource: 'ms-base-trip-preview',
        baseSelectionsByKey,
        excludeTripPreviewSource: 'ms-base-trip-preview',
        formatBaseBranchLineName: (lineName, step) => `${lineName} ${step >= 2 ? 'all-through' : 'normal-through'}`,
        formatBranchLineName: (lineName) => `${lineName} branch`,
        getBaseKindName: (kind) => (kind === 'company' ? 'Company' : 'Line'),
        getBranchSource: (lineId) => (lineId ? `ms-line-branch:${lineId}` : ''),
        getBranchPreviewStep: (lineId) => (lineId === 'L1' ? branchStep : 0),
        getLineName: (lineId) => `Line ${lineId}`,
        getStationName: (stationId) => `Station ${stationId}`,
        hasLineName: (lineId) => lineId === 'L3' || lineId === 'L4',
        hasTripPreviewSelectionBySource: (source) => source === 'ms-line-branch:L1',
        resolveTripPreviewPayloadSource: (payload) => payload?.previewSource,
        tripPreviewSelectionEntries
    });

    const items = buildItems(1);

    assert.equal(items.length, 3);
    assert.deepEqual(items[0], {
        id: 'base:line:L1',
        scope: 'base',
        key: 'line:L1',
        visible: true,
        lineName: 'Trip Line One normal-through',
        originName: '-',
        terminalName: '-',
        typeName: 'Line',
        branchToggleSupported: true,
        branchVisible: true,
        branchPreviewStep: 1,
        source: 'ms-base-trip-preview'
    });
    assert.equal(items[1].lineName, 'Company One');
    assert.equal(items.some((item) => item.key === 'base-preview'), false);
    assert.equal(items.some((item) => item.key === 'branch-1'), false);
    assert.equal(buildItems(2)[0].lineName, 'Trip Line One all-through');
};

const testMultiSelectBasePreviewLineIds = () => {
    const baseSelectionsByKey = new Map([
        ['line:L1', { hidden: false, kind: 'line', lineIds: new Set(['L1']) }],
        ['line:L2', { hidden: false, kind: 'line', lineIds: new Set(['L2']) }],
        ['line:L3', { hidden: true, kind: 'line', lineIds: new Set(['L3']) }]
    ]);

    assert.deepEqual(
        Array.from(getVisibleBaseMultiSelectionLineIdsForPreview({
            selectionsByKey: baseSelectionsByKey,
            branchPreviewStepByLineId: new Map([['L1', 1]])
        })).sort(),
        ['L2']
    );

    assert.deepEqual(
        Array.from(getVisibleBaseMultiSelectionLineIdsForPreview({
            selectionsByKey: baseSelectionsByKey,
            branchPreviewStepByLineId: new Map([['L1', 0]])
        })).sort(),
        ['L1', 'L2']
    );
};

testHoverLifecycleTrace();
testTripPreviewTrace();
testMultiSelectLayerItemsHelper();
testMultiSelectBasePreviewLineIds();

console.log('hover/highlight boundary smoke ok');
