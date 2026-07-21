import assert from 'node:assert/strict';
import { createPanelSearchSelectionCallbacks } from '../src/features/selection/panelSearchSelectionCallbacks.js';
import { createPanelStationRestoreContext } from '../src/features/panel/panelStation.js';

const createRecorder = () => {
    const calls = [];
    return {
        calls,
        push: (name, payload) => calls.push([name, payload])
    };
};

{
    const rec = createRecorder();
    const callbacks = createPanelSearchSelectionCallbacks({
        canRestoreStationLines: () => true,
        closeOnRestore: true,
        clearSelection: (payload) => rec.push('clear', payload),
        fitToCurrentSelection: (key, mode) => rec.push('fit', { key, mode }),
        getLineCompany: (lineId) => lineId === 'A' ? 'Metro' : 'Other',
        hoverLifecycle: {
            beginIfNeeded: (source) => {
                rec.push('begin', source);
                return true;
            },
            close: () => rec.push('close'),
            commitIfNeeded: (source) => rec.push('commit-preview', source),
            getFitMode: (source) => source === 'panel-hover' ? 'preview' : 'commit',
            isPanelHover: (source) => source === 'panel-hover'
        },
        isMenuThroughLineId: (lineId) => lineId === 'THROUGH',
        isMultiSelectModeEnabled: () => false,
        markActiveLine: (lineId) => rec.push('mark', lineId),
        previewMenuThroughLine: (payload) => rec.push('through', payload),
        resolveLineSelection: (lineId) => ({ mainLineId: `${lineId}-MAIN` }),
        searchFeature: {
            commitLine: (lineId) => {
                rec.push('commit-line', lineId);
                return { selectedLineId: `${lineId}-MAIN` };
            },
            previewLine: (lineId) => rec.push('preview-line', lineId),
            selectStationLines: (payload) => rec.push('station-lines', payload)
        },
        setIsolateStationsToSelectedLine: (enabled) => rec.push('isolate', enabled),
        setStationLabelMode: (mode) => rec.push('label-mode', mode),
        sourcePrefix: 'panel-'
    });

    callbacks.onSelectLine('L1', { source: 'panel-hover' });
    assert.deepEqual(rec.calls.slice(0, 5), [
        ['begin', 'panel-hover'],
        ['commit-preview', 'panel-hover'],
        ['preview-line', 'L1'],
        ['isolate', false],
        ['label-mode', 'auto']
    ]);
    assert.deepEqual(rec.calls[5], ['fit', { key: 'line:L1-MAIN', mode: 'preview' }]);

    rec.calls.length = 0;
    callbacks.onSelectLine('L2', { source: 'panel-touch', isolateStations: true });
    assert.deepEqual(rec.calls, [
        ['begin', 'panel-touch'],
        ['commit-preview', 'panel-touch'],
        ['commit-line', 'L2'],
        ['label-mode', 'all'],
        ['isolate', true],
        ['mark', 'L2-MAIN'],
        ['fit', { key: 'line:L2-MAIN', mode: 'commit' }]
    ]);

    rec.calls.length = 0;
    callbacks.onSelectCompany('Metro', {
        source: 'panel-touch',
        stationLineIds: ['A', 'B']
    });
    assert.deepEqual(rec.calls, [
        ['begin', 'panel-touch'],
        ['commit-preview', 'panel-touch'],
        ['isolate', false],
        ['label-mode', 'auto'],
        ['station-lines', { lineIds: ['A'] }],
        ['fit', { key: 'company:Metro', mode: 'commit' }]
    ]);

    rec.calls.length = 0;
    callbacks.onRestoreStationLines(['A'], { stationId: 'S1' });
    assert.deepEqual(rec.calls, [
        ['close', undefined],
        ['isolate', false],
        ['station-lines', { stationId: 'S1', lineIds: ['A'] }],
        ['label-mode', 'auto']
    ]);
}

{
    const rec = createRecorder();
    const callbacks = createPanelSearchSelectionCallbacks({
        canRestoreStationLines: () => true,
        clearSelection: (payload) => rec.push('clear', payload),
        fitOnSelect: false,
        hoverLifecycle: {
            beginIfNeeded: () => true,
            commitIfNeeded: () => rec.push('commit-preview'),
            getFitMode: () => 'commit',
            isHover: (source) => source === 'popup-hover'
        },
        isMenuThroughLineId: () => false,
        isMultiSelectModeEnabled: () => false,
        markActiveLine: (lineId) => rec.push('mark', lineId),
        resolveLineSelection: (lineId) => ({ mainLineId: lineId }),
        resetLabelOnRestore: false,
        searchFeature: {
            commitLine: (lineId) => {
                rec.push('commit-line', lineId);
                return { selectedLineId: lineId };
            },
            selectStationLines: (payload) => rec.push('station-lines', payload)
        },
        setIsolateStationsToSelectedLine: (enabled) => rec.push('isolate', enabled),
        setStationLabelMode: (mode) => rec.push('label-mode', mode),
        sourcePrefix: 'popup-'
    });

    callbacks.onSelectLine('L3', { source: 'popup-click' });
    assert.deepEqual(rec.calls, [
        ['commit-preview', undefined],
        ['commit-line', 'L3'],
        ['label-mode', 'all'],
        ['isolate', false],
        ['mark', 'L3']
    ]);

    rec.calls.length = 0;
    callbacks.onRestoreStationLines(['L3'], { stationId: 'S2' });
    assert.deepEqual(rec.calls, [
        ['isolate', false],
        ['station-lines', { stationId: 'S2', lineIds: ['L3'] }]
    ]);
}

{
    const rec = createRecorder();
    const callbacks = createPanelSearchSelectionCallbacks({
        canRestoreStationLines: ({ stationId }) => stationId === 'CURRENT',
        closeOnRestore: true,
        clearSelection: (payload) => rec.push('clear', payload),
        hoverLifecycle: {
            close: () => rec.push('close')
        },
        searchFeature: {
            selectStationLines: (payload) => rec.push('station-lines', payload)
        },
        setIsolateStationsToSelectedLine: (enabled) => rec.push('isolate', enabled),
        setStationLabelMode: (mode) => rec.push('label-mode', mode)
    });

    callbacks.onRestoreStationLines(['A'], { stationId: 'STALE' });
    assert.deepEqual(rec.calls, []);

    callbacks.onRestoreStationLines(['A'], { stationId: 'CURRENT' });
    assert.deepEqual(rec.calls, [
        ['close', undefined],
        ['isolate', false],
        ['station-lines', { stationId: 'CURRENT', lineIds: ['A'] }],
        ['label-mode', 'auto']
    ]);
}

{
    const rec = createRecorder();
    let currentRestoreToken = 2;
    const callbacks = createPanelSearchSelectionCallbacks({
        canRestoreStationLines: ({ meta }) => Number(meta?.restoreToken) === currentRestoreToken,
        clearSelection: (payload) => rec.push('clear', payload),
        searchFeature: {
            selectStationLines: (payload) => rec.push('station-lines', payload)
        },
        setIsolateStationsToSelectedLine: (enabled) => rec.push('isolate', enabled),
        setStationLabelMode: (mode) => rec.push('label-mode', mode),
        sourcePrefix: 'popup-'
    });

    callbacks.onRestoreStationLines(['A'], { stationId: 'S1', restoreToken: 1 });
    assert.deepEqual(rec.calls, []);

    callbacks.onRestoreStationLines(['A'], { stationId: 'S1', restoreToken: 2 });
    assert.deepEqual(rec.calls, [
        ['isolate', false],
        ['station-lines', { stationId: 'S1', lineIds: ['A'] }],
        ['label-mode', 'auto']
    ]);

    rec.calls.length = 0;
    currentRestoreToken = 3;
    callbacks.onRestoreStationLines(['A'], { stationId: 'S1', restoreToken: 2 });
    assert.deepEqual(rec.calls, []);
}

{
    const rec = createRecorder();
    const callbacks = createPanelSearchSelectionCallbacks({
        canRestoreStationLines: () => true,
        clearSelection: (payload) => rec.push('clear', payload),
        getSelectedStationId: () => 'SHOULD-NOT-FALLBACK',
        searchFeature: {
            selectStationLines: (payload) => rec.push('station-lines', payload)
        },
        setIsolateStationsToSelectedLine: (enabled) => rec.push('isolate', enabled),
        setStationLabelMode: (mode) => rec.push('label-mode', mode)
    });

    callbacks.onRestoreStationLines(['A']);
    assert.deepEqual(rec.calls, []);
}

{
    const rec = createRecorder();
    const callbacks = createPanelSearchSelectionCallbacks({
        clearSelection: (payload) => rec.push('clear', payload),
        searchFeature: {
            selectStationLines: (payload) => rec.push('station-lines', payload)
        },
        setIsolateStationsToSelectedLine: (enabled) => rec.push('isolate', enabled),
        setStationLabelMode: (mode) => rec.push('label-mode', mode)
    });

    callbacks.onRestoreStationLines(['A'], { stationId: 'S1' });
    assert.deepEqual(rec.calls, []);
}

{
    const context = createPanelStationRestoreContext();
    const firstSession = context.set('S1', ['L1', 'L2']);

    assert.equal(context.canRestore({ stationId: 'S1', lineIds: ['L1', 'L2'] }), true);
    assert.equal(context.canRestore({ stationId: 'S1', lineIds: ['L1', 'L2'], sessionId: firstSession.sessionId }), true);
    assert.equal(context.canRestore({ stationId: 'S2', lineIds: ['L1', 'L2'] }), false);
    assert.equal(context.canRestore({ stationId: 'S1', lineIds: ['OLD'] }), false);
    assert.deepEqual(context.get('S1'), { stationId: 'S1', servingIds: ['L1', 'L2'] });

    context.invalidate();
    assert.equal(context.canRestore({ stationId: 'S1', lineIds: ['L1', 'L2'] }), false);
    assert.equal(context.get('S1'), null);

    const secondSession = context.set('S1', ['L1', 'L2']);
    assert.equal(context.canRestore({ stationId: 'S1', lineIds: ['L1', 'L2'], sessionId: firstSession.sessionId }), false);
    assert.equal(context.canRestore({ stationId: 'S1', lineIds: ['L1', 'L2'], sessionId: secondSession.sessionId }), true);
}

console.log('panel/search selection callbacks smoke ok');
