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
assert.doesNotMatch(body, /\['==', \['get', 'id'\], selectedLineId\]/);
assert.doesNotMatch(body, /\['==', \['get', 'company'\], selectedCompany\]/);

assert.match(source, /function getLineNameLabelLineIdsForCurrentHighlight\(\)/);
assert.match(source, /highlightRenderer\.applyLineNameLabelFilter/);
assert.match(source, /dirPreviewActive\) return dirPreviewLineIds/);

const labelIdsBody = extractFunctionBody(source, 'getLineNameLabelLineIdsForCurrentHighlight');
assert.ok(
    labelIdsBody.indexOf('if (selectedLineId)') < labelIdsBody.indexOf('if (tripPreviewActive)'),
    'line name labels should prefer selected line ids before trip preview fallback'
);

assert.match(source, /SELECTION_LINE_TRIP_PREVIEW_SOURCE = 'selection-line-trip-preview'/);
assert.match(source, /previewSource: SELECTION_LINE_TRIP_PREVIEW_SOURCE/);
assert.match(source, /SELECTION_COMPANY_TRIP_PREVIEW_SOURCE = 'selection-company-trip-preview'/);
assert.match(source, /previewSource: SELECTION_COMPANY_TRIP_PREVIEW_SOURCE/);

console.log('app line selection style smoke ok');
