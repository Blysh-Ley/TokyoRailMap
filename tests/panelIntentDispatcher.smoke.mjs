import assert from 'node:assert/strict';

import {
    dispatchPanelDirFilterIntent,
    dispatchPanelDirectionToggleIntent,
    dispatchPanelPrimarySelectionIntent
} from '../src/features/panel/panelIntentDispatcher.js';

const events = [];

assert.equal(dispatchPanelDirFilterIntent({
    filterTarget: { lineId: 'JR.Main', dirKey: 'north', buttonEl: { id: 'btn' } },
    makeLineDirKey: (lineId, dirKey) => `${lineId}||${dirKey}`,
    applyDirPreviewByKey: (key, options) => events.push(['preview', key, options.fitMode]),
    pinDirPreviewByKey: (key) => events.push(['pin', key]),
    setPinnedPanelSelection: (kind, key) => events.push(['select', kind, key]),
    toggleDirFilterPopoverFromButton: (buttonEl) => events.push(['toggle', buttonEl.id])
}), true);
assert.deepEqual(events, [
    ['preview', 'JR.Main||north', 'preview'],
    ['pin', 'JR.Main||north'],
    ['select', 'dir', 'JR.Main||north'],
    ['toggle', 'btn']
]);

assert.equal(dispatchPanelDirectionToggleIntent({
    dirTarget: { lineId: 'JR.Main', dirKey: 'south' },
    toggleDirectionTimetable: (lineId, dirKey) => events.push(['toggle-dir', lineId, dirKey])
}), true);

const mouseEvents = [];
const mouseResult = dispatchPanelPrimarySelectionIntent({
    primaryTarget: { kind: 'line', key: 'line:JR.Main', lineId: 'JR.Main' },
    mode: 'mouse',
    lastMousePrimaryKey: '',
    clearHoverTimer: () => mouseEvents.push('clearHover'),
    resetHoverState: () => mouseEvents.push('resetHover'),
    clearPinnedDirPreview: () => mouseEvents.push('clearPinnedDir'),
    setPinnedPanelSelection: (kind, key) => mouseEvents.push(['select', kind, key]),
    applyLineHoverSelection: (lineId) => mouseEvents.push(['hoverLine', lineId])
});
assert.equal(mouseResult.handled, true);
assert.equal(mouseResult.lastMousePrimaryKey, 'line:JR.Main');
assert.deepEqual(mouseEvents, [
    'clearHover',
    'resetHover',
    'clearPinnedDir',
    ['hoverLine', 'JR.Main'],
    ['select', 'line', 'JR.Main']
]);

const touchEvents = [];
const touchResult = dispatchPanelPrimarySelectionIntent({
    primaryTarget: { kind: 'company', key: 'company:JR', companyName: 'JR' },
    mode: 'touch',
    clearHoverTimer: () => touchEvents.push('clearHover'),
    resetHoverState: () => touchEvents.push('resetHover'),
    clearPinnedDirPreview: () => touchEvents.push('clearPinnedDir'),
    setPinnedPanelSelection: (kind, key) => touchEvents.push(['select', kind, key]),
    onSelectCompany: (companyName, options) => touchEvents.push(['selectCompany', companyName, options.source, options.stationLineIds.join(',')]),
    currentStationServingIds: ['JR.Main', 'JR.Main.Branch']
});
assert.equal(touchResult.handled, true);
assert.deepEqual(touchEvents, [
    'clearHover',
    'resetHover',
    'clearPinnedDir',
    ['select', 'company', 'JR'],
    ['selectCompany', 'JR', 'panel-touch', 'JR.Main,JR.Main.Branch']
]);

console.log('panel intent dispatcher smoke ok');
