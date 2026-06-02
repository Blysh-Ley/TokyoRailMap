import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSource = (path) => readFileSync(path, 'utf8');

const extractConstFunctionBody = (source, name) => {
    const marker = `const ${name} =`;
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `${name} must exist`);

    const bodyStart = source.indexOf('{', start);
    assert.notEqual(bodyStart, -1, `${name} must have a body`);

    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(bodyStart + 1, index);
        }
    }

    throw new Error(`${name} body was not closed`);
};

const appSource = readSource('src/app.js');
const printSource = readSource('src/features/print/print.js');

const selectionSyncBody = extractConstFunctionBody(appSource, 'syncSelectionLineTripPreview');
assert.match(selectionSyncBody, /SELECTION_LINE_TRIP_PREVIEW_SOURCE/);
assert.match(selectionSyncBody, /clearTripPathPreview\(\{\s*source: SELECTION_LINE_TRIP_PREVIEW_SOURCE\s*\}\)/);
assert.match(selectionSyncBody, /previewTripPath\(\{/);
assert.match(selectionSyncBody, /previewSource: SELECTION_LINE_TRIP_PREVIEW_SOURCE/);
assert.match(selectionSyncBody, /virtualTrips/);

assert.match(appSource, /const getSelectionLineTripPreviewLineIds = \(\) => resolveSelectionLineHighlightIds\(\{/);
assert.match(appSource, /selectedLineId,\s*[\r\n]+\s*selectedStationLineIds/);

const multiSelectSyncBody = extractConstFunctionBody(appSource, 'syncMultiSelectBaseTripPreview');
assert.match(multiSelectSyncBody, /MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE/);
assert.match(multiSelectSyncBody, /clearTripPathPreview\(\{\s*source: MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE\s*\}\)/);
assert.match(multiSelectSyncBody, /selectedLineId: 'multi-base'/);
assert.match(multiSelectSyncBody, /previewSource: MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE/);
assert.match(multiSelectSyncBody, /virtualTrips/);

const exportCurrentSelectionBody = extractConstFunctionBody(printSource, 'exportCurrentSelection');
assert.match(exportCurrentSelectionBody, /isTripPreviewActiveNow\(\)/);
assert.match(exportCurrentSelectionBody, /getGeoJsonSourceData\(baseMap, 'trip-preview-source'\)/);
assert.match(exportCurrentSelectionBody, /getGeoJsonSourceData\(baseMap, 'trip-preview-stops-source'\)/);
assert.match(exportCurrentSelectionBody, /exportSnapshot\(lastSnapshot, options\)/);
assert.match(exportCurrentSelectionBody, /return false/);

assert.doesNotMatch(printSource, /\bexportBaseHighlight\b/);
assert.doesNotMatch(printSource, /\bbuildSvgFromBaseHighlight\b/);
assert.doesNotMatch(printSource, /__TokyoRailBaseHighlight/);

console.log('line highlight trip-preview convergence smoke ok');
