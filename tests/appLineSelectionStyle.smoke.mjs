import { stationSelectionPerf } from '../src/debug/stationSelectionPerformanceProbe.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/app.js', 'utf8');

const extractFunctionBody = (code, functionName) => {
    const startToken = `function ${functionName}()`;
    const start = code.indexOf(startToken);
    assert.notEqual(start, -1, `${functionName} must exist`);

    const bodyStart = code.indexOf('{', start);
    assert.notEqual(bodyStart, -1, `${functionName} must have a body`);

    let depth = 0;
    for (let index = bodyStart; index < code.length; index += 1) {
        const char = code[index];
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) return code.slice(bodyStart + 1, index);
        }
    }

    throw new Error(`${functionName} body was not closed`);
};

const body = extractFunctionBody(source, 'applyLineSelectionStyle');

assert.match(body, /tripPreviewActive/);
assert.match(body, /dirPreviewActive/);
assert.match(body, /applyLineNameLabelSelectionFilter\(\)/);
assert.match(body, /!selectedLineId && selectedStationLineIds && selectedStationLineIds\.size/);
assert.match(body, /Array\.from\(selectedStationLineIds\)\.map\(String\)\.filter\(Boolean\)/);
assert.match(body, /focusExpr: hitExpr/);
assert.match(body, /const highlightLineIds = getHighlightedLineIdsForMapClickSelection\(\)/);
assert.match(body, /highlightLineIds && highlightLineIds\.size/);
assert.match(body, /Array\.from\(highlightLineIds\)\.map\(String\)\.filter\(Boolean\)/);
assert.match(body, /highlightStyle:\s*false/);
assert.doesNotMatch(body, /\['==', \['get', 'id'\], selectedLineId\]/);
assert.doesNotMatch(body, /\['==', \['get', 'company'\], selectedCompany\]/);

assert.match(source, /function getLineNameLabelLineIdsForCurrentHighlight\(\)/);
assert.match(source, /highlightRenderer\.applyLineNameLabelFilter/);
assert.match(source, /dirPreviewActive\) return dirPreviewLineIds/);
assert.match(source, /buildTripPreviewLineNameLabelsData/);
assert.match(source, /mapEngine\.setSourceData\?\.\('line-name-labels-source', nextData\)/);
assert.match(source, /buildLineNameLabelCandidates\(paths, options\)/);
assert.match(source, /const lineIds = getLineNameLabelLineIdsForCurrentHighlight\(\)/);
assert.match(source, /tripPreviewLineNameLabelsData = buildTripPreviewLineNameLabelsData\(\{ built \}\)/);
assert.match(source, /const lineIdCandidates = getLineNameLabelLineIdCandidates\(feature\)/);
assert.match(source, /const labelId = getLineNameLabelSourceLineId\(feature\)/);
assert.match(source, /color: String\(getFirstLineMetaValue\(lineColorById, lineIdCandidates\) \|\| props\.color \|\| ''\)\.trim\(\)/);
assert.doesNotMatch(source, /shouldUseTripPreviewDisplayNameForLabels/);

const labelIdsBody = extractFunctionBody(source, 'getLineNameLabelLineIdsForCurrentHighlight');
assert.ok(
    labelIdsBody.indexOf('if (tripPreviewActive)') < labelIdsBody.indexOf('if (selectedLineId)'),
    'line name labels should use trip-preview source data before selected line filters'
);

for (const deletedName of [
    'selection' + '-line-trip-preview',
    'SELECTION' + '_LINE_TRIP_PREVIEW'
]) {
    assert.equal(source.includes(deletedName), false, `${deletedName} must stay deleted`);
}
assert.match(source, /SELECTION_COMPANY_TRIP_PREVIEW_SOURCE = 'selection-company-trip-preview'/);
assert.match(source, /previewSource: SELECTION_COMPANY_TRIP_PREVIEW_SOURCE/);

{
    const start = source.indexOf('const syncLineNameLabelDataForCurrentState =');
    const end = source.indexOf('const buildLineNameLabelFilter =', start);
    const layoutStart = source.indexOf('const requestLineNameLabelLayout =');
    const layoutEnd = source.indexOf('const lineNameLabelLayoutObserver =', layoutStart);
    const idleStart = source.indexOf("mapEngine.on?.('idle', () => {");
    const idleEnd = source.indexOf('const onLineNameLabelPanelTransition =', idleStart);
    const frames = new Map();
    const timers = new Map();
    const mapListeners = new Map();
    const submissions = [];
    let nextId = 0;
    let builds = 0;
    let projections = 0;
    let pending = true;
    let paths = { revision: 1 };
    let layoutRevision = 1;
    let lineIds = null;
    const candidates = (_paths, options) => {
        builds += 1;
        return { type: 'FeatureCollection', features: [{ id: _paths.revision, layoutRevision, moving: options.previousOnly }] };
    };
    const runtime = new Function('requestAnimationFrame', 'setTimeout', 'clearTimeout', 'mapEngine',
        'buildLineNameLabelCandidates', 'projectLineNameLabelPaths', 'getPaths', 'getLayout', 'getLineIds', 'stationSelectionPerf', `
        let lineNameLabelsFrame = null;
        let lineNameLabelsDataSignature = '';
        let movingLineNameLabels = null;
        let lineNameLabelLayout = null;
        let lineNameLabelLayoutTimer = null;
        let lineNameLabelInput = null;
        let lineNameLabelProjectionVersion = 0;
        const lineNameLabelProjectedPaths = new WeakMap();
        const lineNameLabelWidths = new Map();
        const lineNameLabelMeasureContext = {};
        const readCurrentLineNameLabelLayout = getLayout;
        const getLineNameLabelPaths = getPaths;
        const getLineNameLabelLineIdsForCurrentHighlight = getLineIds;
        const buildOffsetPolylinePixelsWithMiter = () => [];
        const map = { unproject() {} };
        const STATION_LABELS_SOURCE_ID = 'station-labels-source';
        ${source.slice(layoutStart, layoutEnd)}
        ${source.slice(start, end)}
        ${source.slice(idleStart, idleEnd)}
        return { schedule: scheduleLineNameLabelPlacement, move: () => {
            movingLineNameLabels = new Map(); lineNameLabelProjectionVersion += 1;
        }, stop: () => { movingLineNameLabels = null; } };
    `)(callback => { const id = ++nextId; frames.set(id, callback); return id; },
        callback => { const id = ++nextId; timers.set(id, callback); return id; }, id => timers.delete(id), {
            hasLayer: () => true, getSource: () => ({}), isSourceLoaded: () => !pending,
            isSymbolPlacementPending: () => pending,
            on: (eventName, listener) => mapListeners.set(eventName, listener),
            getCanvas: () => ({ clientWidth: 500, clientHeight: 400 }),
            queryRenderedFeatures: () => [], getZoom: () => 12,
            setSourceData: (_id, data) => { submissions.push(data); return true; }
        }, candidates, () => { projections += 1; return []; }, () => paths,
        () => ({ signature: String(layoutRevision), viewport: {}, obstacles: [] }), () => lineIds, stationSelectionPerf);
    const flush = queue => { const [id, callback] = queue.entries().next().value; queue.delete(id); callback(); };
    const settle = () => { flush(timers); while (frames.size) flush(frames); };
    const idle = () => mapListeners.get('idle')();
    runtime.schedule(); runtime.schedule();
    assert.equal(timers.size, 1, '清除预览、选择变化和面板变化共用一个精排计时器');
    assert.equal(frames.size, 0, '稳定状态不立即抢占站名恢复的下一帧');
    idle(); idle();
    assert.equal(timers.size, 0, 'idle 清掉已有的尾等待计时器');
    assert.equal(frames.size, 1, '多次 idle 和已有请求只合并到一个 RAF');
    assert.equal(builds, 0, 'idle 事件回调不直接计算候选');
    flush(frames);
    assert.equal(builds, 0, '站名源或原生符号尚未稳定时等待');
    assert.equal(timers.size, 1);
    pending = false;
    idle();
    assert.equal(timers.size, 0, '后续 idle 唤醒就绪任务，不再等待 180ms');
    flush(frames);
    assert.equal(builds, 0, 'idle 唤醒后仍保留首次投影与候选比较分帧');
    idle();
    assert.equal(frames.size, 1, '投影后的已有 RAF 不被 idle 重复安排');
    flush(frames);
    assert.equal(builds, 1);
    assert.equal(submissions.length, 1);
    idle(); idle();
    assert.equal(frames.size, 0, '自身 source 更新后的相同布局 idle 不形成 RAF 循环');
    assert.equal(timers.size, 0, '相同布局 idle 不建立新计时器');
    assert.equal(submissions.length, 1, '相同布局 idle 不重复提交 source');
    runtime.schedule(); settle();
    assert.equal(builds, 1, '同样路径、相机、线路范围和实际布局不再重算候选');
    layoutRevision += 1;
    idle(); idle();
    assert.equal(timers.size, 0, '没有计时器时，真实布局变化也由 idle 直接合并到下一帧');
    assert.equal(frames.size, 1);
    assert.equal(builds, 1, '布局变化也不能在 idle 回调内直接精排');
    flush(frames);
    assert.equal(builds, 2, '新站名或面板布局仍触发重新避让');
    assert.equal(projections, 1, '同一视野的布局变化复用投影');
    lineIds = new Set(['B']);
    runtime.schedule(); settle();
    assert.equal(projections, 2, '线路范围变化重新准备对应投影');
    paths = { revision: 2 }; runtime.schedule();
    paths = { revision: 3 }; runtime.schedule();
    settle();
    assert.equal(submissions.at(-1).features[0].id, 3, '快速切站或清除预览后只处理最后的路径');
    const buildsBeforeSwitch = builds;
    paths = { revision: 4 }; runtime.schedule();
    flush(timers); flush(frames);
    assert.equal(builds, buildsBeforeSwitch, '首次投影单独让出一帧，不在同一帧继续精排');
    paths = { revision: 5 };
    idle();
    assert.equal(frames.size, 1, '投影后切换状态时继续复用已有 RAF');
    while (frames.size) flush(frames);
    assert.equal(builds, buildsBeforeSwitch + 1);
    assert.equal(submissions.at(-1).features[0].id, 5, '投影准备后切换站点不能提交旧候选');
    const projectionsBeforeMove = projections;
    runtime.move(); pending = true;
    runtime.schedule();
    assert.equal(frames.size, 1, '移动中继续逐帧跟随旧锚点');
    flush(frames);
    assert.equal(submissions.at(-1).features[0].moving, true);
    idle();
    assert.equal(frames.size, 0, '移动状态下的 idle 不启动稳定精排');
    assert.equal(timers.size, 0);
    runtime.stop(); pending = false;
    runtime.schedule(); settle();
    assert.equal(submissions.at(-1).features[0].moving, false, '停止后仍完成全部候选比较');
    assert.equal(projections, projectionsBeforeMove + 1, '相机变化后不复用过期投影');
}

console.log('app line selection style smoke ok');
