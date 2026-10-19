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
assert.match(source, /buildLineNameLabelCandidates\(getLineNameLabelPaths\(\)/);
assert.match(source, /lineIds: getLineNameLabelLineIdsForCurrentHighlight\(\)/);
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
    const frames = [];
    const submissions = [];
    let revision = 1;
    const candidates = () => ({ type: 'FeatureCollection', features: [{ id: revision }] });
    const runtime = new Function('requestAnimationFrame', 'mapEngine', 'buildLineNameLabelCandidates', `
        const cancelAnimationFrame = () => {};
        let lineNameLabelsFrame = null;
        let lineNameLabelsDataSignature = '';
        const movingLineNameLabels = null;
        let lineNameLabelLayout = null;
        const lineNameLabelWidths = new Map();
        const lineNameLabelMeasureContext = {};
        const readCurrentLineNameLabelLayout = () => ({ viewport: {}, obstacles: [] });
        const getLineNameLabelPaths = () => ({});
        const getLineNameLabelLineIdsForCurrentHighlight = () => null;
        const buildOffsetPolylinePixelsWithMiter = () => [];
        ${source.slice(start, end)}
        return { schedule: scheduleLineNameLabelPlacement };
    `)(callback => { frames.push(callback); return frames.length; }, {
        hasLayer: () => true,
        getCanvas: () => ({ clientWidth: 500, clientHeight: 400 }),
        queryRenderedFeatures: () => [],
        getZoom: () => 12,
        setSourceData: (_id, data) => { submissions.push(data); return {}; }
    }, candidates);
    runtime.schedule();
    runtime.schedule();
    assert.equal(frames.length, 1, '同一轮多次请求只排入一帧');
    frames.shift()();
    assert.equal(submissions.length, 1);
    runtime.schedule();
    frames.shift()();
    assert.equal(submissions.length, 1, '候选结果相同不能重复提交 GeoJSON');
    revision += 1;
    runtime.schedule();
    frames.shift()();
    assert.equal(submissions.length, 2, '候选结果变化后仍正常提交');
}

console.log('app line selection style smoke ok');
