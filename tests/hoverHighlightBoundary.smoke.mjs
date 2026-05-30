import assert from 'node:assert/strict';

import { createHoverFeature } from '../src/features/hover/hoverFeature.js';
import { buildMultiSelectLayerItemsFromInputs } from '../src/features/highlight/multiSelectLayerItems.js';
import { createRoutePreviewController } from '../src/features/route/routePreviewController.js';
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
                lineIds: new Set(['L9'])
            },
            payload: {
                selectedLineId: 'L9'
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

    const items = buildMultiSelectLayerItemsFromInputs({
        baseSelectionsByKey,
        excludeTripPreviewSource: 'ms-base-trip-preview',
        formatBranchLineName: (lineName) => `${lineName} branch`,
        getBaseKindName: (kind) => (kind === 'company' ? 'Company' : 'Line'),
        getBranchSource: (lineId) => (lineId ? `ms-line-branch:${lineId}` : ''),
        getLineName: (lineId) => `Line ${lineId}`,
        getStationName: (stationId) => `Station ${stationId}`,
        hasLineName: (lineId) => lineId === 'L3' || lineId === 'L4',
        hasTripPreviewSelectionBySource: (source) => source === 'ms-line-branch:L1',
        resolveTripPreviewPayloadSource: (payload) => payload?.previewSource,
        tripPreviewSelectionEntries
    });

    assert.equal(items.length, 4);
    assert.deepEqual(items[0], {
        id: 'base:line:L1',
        scope: 'base',
        key: 'line:L1',
        visible: true,
        lineName: 'Line L1',
        originName: '-',
        terminalName: '-',
        typeName: 'Line',
        branchToggleSupported: true,
        branchVisible: true
    });
    assert.equal(items[1].lineName, 'Company One');
    assert.equal(items.some((item) => item.key === 'base-preview'), false);
    assert.equal(items.find((item) => item.key === 'branch-1').lineName, 'Line Four branch');
};

testHoverLifecycleTrace();
testTripPreviewTrace();
testMultiSelectLayerItemsHelper();

console.log('hover/highlight boundary smoke ok');
