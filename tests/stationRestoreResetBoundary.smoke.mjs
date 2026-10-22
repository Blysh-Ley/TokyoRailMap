import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stationSelectionPerf } from '../src/debug/stationSelectionPerformanceProbe.js';
import { bindBlankMapClickRestore } from '../src/features/map-interactions/mapInteractionController.js';

const appSource = readFileSync(join(process.cwd(), 'src/app.js'), 'utf8');
const mapInteractionSource = readFileSync(join(process.cwd(), 'src/features/map-interactions/mapInteractionController.js'), 'utf8');
const panelSource = readFileSync(join(process.cwd(), 'src/features/panel/panel.js'), 'utf8');

assert.match(
    appSource,
    /function\s+cancelStationRestoreState\(\{\s*clearPreview\s*=\s*true,\s*perfSessionId\s*\}\s*=\s*\{\}\)\s*\{[\s\S]*panel\?\.invalidateStationRestoreSession\?\.\(\{\s*cancelRender:\s*true\s*\}\);[\s\S]*panel\?\.cancelStationThroughPreview\?\.\(\{\s*clearPreview\s*\}\);[\s\S]*stationPopup\?\.clearRestoreState\?\.\(\);[\s\S]*cancelSelectionTripPreviewSync\(\);[\s\S]*\}/,
    'app reset should expose a focused station restore cancellation step'
);

assert.match(
    appSource,
    /blankClick:\s*\{[\s\S]*hidePanel:\s*\(\)\s*=>\s*panel\?\.hide\?\.\(\),[\s\S]*cancelStationRestoreState,[\s\S]*clearTripPathPreview,[\s\S]*clearSelectionsAndRestore/,
    'blank map clicks should receive the station restore cancellation callback'
);

assert.match(
    mapInteractionSource,
    /cancelStationRestoreState,[\s\S]*clearTripPathPreview,[\s\S]*clearSelectionsAndRestore/,
    'map interaction controller should accept station restore cancellation as an injected dependency'
);

for (const active of [true, false]) {
    for (const multiSelect of [true, false]) {
        const calls = [];
        let click;
        bindBlankMapClickRestore({
            mapEngine: { on: (_event, handler) => { click = handler; }, hasLayer: () => false },
            hasActiveSelection: () => active,
            isMultiSelectModeEnabled: () => multiSelect,
            hidePanel: () => calls.push(['hide']),
            clearReachableStopsOverlay: () => calls.push(['reachable']),
            cancelStationRestoreState: options => calls.push(['cancel', options]),
            clearTripPathPreview: () => calls.push(['preview']),
            clearSelectionsAndRestore: () => calls.push(['selection'])
        });
        click({ point: { x: 10, y: 20 } });
        assert.deepEqual(calls, active
            ? [['hide'], ['reachable'], ['selection']]
            : [['hide'], ['reachable'], ['cancel', { clearPreview: multiSelect, perfSessionId: null }], ...(!multiSelect ? [['preview']] : [])],
        '空白点击只走一次共享重置；无选择时仍取消恢复，多选时保留其他来源的预览');
    }
}

assert.match(
    panelSource,
    /const\s+isStillActive\s*=\s*\(\)\s*=>\s*!stationThroughPreviewSuppressed[\s\S]*renderToken\s*===\s*stationRenderToken[\s\S]*sid\s*===\s*toText\(currentStationId\);/,
    'station-through preview scheduling should use one active-token predicate'
);

assert.match(
    panelSource,
    /stationThroughPreviewCache\?\.key\s*===\s*cacheKey[\s\S]*if\s*\(!isStillActive\(\)\)\s+return\s+false;[\s\S]*applyTripPreviewSnapshot\?\.[\s\S]*if\s*\(applied\?\.ok\s*===\s*true\)\s*\{[\s\S]*if\s*\(isStillActive\(\)\)\s+return\s+true;[\s\S]*clearTripPathPreviewBySource\(STATION_THROUGH_PREVIEW_SOURCE\);[\s\S]*clearStationThroughPreviewCache\(\);[\s\S]*return\s+false;/,
    'cached station-through snapshot restore must re-check active state before and after applying'
);

assert.match(appSource, /function clearSelectionsAndRestore\(\{ perfSessionId \} = \{\}\) \{[\s\S]*?cancelStationRestoreState\(\{ clearPreview: false, perfSessionId: sessionId \}\);\s*clearTripPathPreview\(\);/,
    '完整重置先取消异步恢复，再统一清除一次预览');

// 重置会话在面板隐藏前开始；连续空白重置各自保留一个操作编号。
stationSelectionPerf.clear();
stationSelectionPerf.start({ target: {} });
for (const active of [true, false]) {
    const observed = [];
    let click;
    const recordReset = ({ perfSessionId }) => {
        assert.equal(perfSessionId, stationSelectionPerf.currentId());
        observed.push(['clear', perfSessionId]);
    };
    bindBlankMapClickRestore({
        mapEngine: { on: (_event, handler) => { click = handler; }, hasLayer: () => false },
        hasActiveSelection: () => active,
        isMultiSelectModeEnabled: () => false,
        hidePanel: () => observed.push(['hide', stationSelectionPerf.currentId()]),
        cancelStationRestoreState: recordReset,
        clearSelectionsAndRestore: recordReset
    });
    click({ point: { x: 10, y: 20 } });
    click({ point: { x: 10, y: 20 } });
    assert.equal(observed[0][1], observed[1][1]);
    assert.equal(observed[2][1], observed[3][1]);
    assert.notEqual(observed[0][1], observed[2][1]);
}
assert.equal(stationSelectionPerf.stop().sessions.length, 4);
stationSelectionPerf.clear();

const cancelPreviewSource = panelSource.slice(panelSource.indexOf('const cancelStationThroughPreview ='), panelSource.indexOf('const getMobilePanelStationContext ='));
const cancelPanelPreview = new Function('clearPreview', 'crossFeatureBridge', 'stationSelectionPerf', `
    let stationThroughPreviewSuppressed = false;
    let stationRenderToken = 0;
    let cacheClears = 0;
    const clearStationThroughPreviewCache = () => { cacheClears += 1; };
    const STATION_THROUGH_PREVIEW_SOURCE = 'station-through-branch';
    ${cancelPreviewSource}
    cancelStationThroughPreview({ clearPreview });
    return { suppressed: stationThroughPreviewSuppressed, token: stationRenderToken, cacheClears };
`);
for (const clearPreview of [true, false]) {
    const clearedSources = [];
    assert.deepEqual(cancelPanelPreview(clearPreview, { clearTripPathPreviewBySource: source => clearedSources.push(source) }, stationSelectionPerf),
        { suppressed: true, token: 1, cacheClears: 1 }, '跳过重复预览清理仍必须使异步恢复失效并清除缓存');
    assert.deepEqual(clearedSources, clearPreview ? ['station-through-branch'] : []);
}

console.log('station restore reset boundary smoke ok');
