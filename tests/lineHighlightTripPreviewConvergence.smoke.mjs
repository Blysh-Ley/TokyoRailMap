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

const extractObjectMethodBody = (source, name) => {
    const marker = `${name}:`;
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
const elementUiSource = readSource('src/map/element_ui.js');
const layersSource = readSource('src/map/layers.js');
const printSource = readSource('src/features/print/print.js');
const tripPreviewBuilderSource = readSource('src/features/route/tripPreviewBuilder.js');
const tripPreviewLibSource = readSource('src/lib/trip-preview.js');
const panelSource = readSource('src/features/panel/panel.js');
const analyzeBranchSource = readSource('src/map/analyze_branch.js');

const selectionSyncBody = extractConstFunctionBody(appSource, 'syncSelectionLineTripPreview');
assert.match(selectionSyncBody, /SELECTION_LINE_TRIP_PREVIEW_SOURCE/);
assert.match(selectionSyncBody, /clearTripPathPreview\(\{\s*source: SELECTION_LINE_TRIP_PREVIEW_SOURCE\s*\}\)/);
assert.match(selectionSyncBody, /previewTripPath\(\{/);
assert.match(selectionSyncBody, /previewSource: SELECTION_LINE_TRIP_PREVIEW_SOURCE/);
assert.match(selectionSyncBody, /virtualTrips/);

assert.match(appSource, /const getSelectionLineTripPreviewLineIds = \(\) => resolveSelectionLineHighlightIds\(\{/);
assert.match(appSource, /selectedLineId,\s*[\r\n]+\s*selectedStationLineIds/);

const companySyncBody = extractConstFunctionBody(appSource, 'syncSelectionCompanyTripPreview');
assert.match(companySyncBody, /SELECTION_COMPANY_TRIP_PREVIEW_SOURCE/);
assert.match(companySyncBody, /isMultiSelectModeEnabled\(\)/);
assert.match(companySyncBody, /selectedLineId \|\| \(selectedStationLineIds && selectedStationLineIds\.size\)/);
assert.match(companySyncBody, /clearTripPathPreview\(\{\s*source: SELECTION_COMPANY_TRIP_PREVIEW_SOURCE\s*\}\)/);
assert.match(companySyncBody, /previewTripPath\(\{/);
assert.match(companySyncBody, /previewSource: SELECTION_COMPANY_TRIP_PREVIEW_SOURCE/);
assert.match(companySyncBody, /virtualTrips/);

const companyBuilderBody = extractConstFunctionBody(appSource, 'buildSelectionCompanyTripVirtualTrips');
assert.match(companyBuilderBody, /buildLineHighlightVirtualTripPayloads\(\{/);
assert.match(companyBuilderBody, /previewSource: SELECTION_COMPANY_TRIP_PREVIEW_SOURCE/);
assert.match(appSource, /SELECTION_COMPANY_TRIP_PREVIEW_SOURCE = 'selection-company-trip-preview'/);
assert.match(appSource, /MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE = 'ms-base-trip-preview'/);

const companyClickBody = extractObjectMethodBody(appSource, 'onCompanyClick');
const multiSelectCompanyBranchIndex = companyClickBody.indexOf("if (isMultiSelectModeEnabled() && source !== 'hover') {");
const normalCompanySelectionIndex = companyClickBody.indexOf('selectedCompany = companyName;');
assert.notEqual(multiSelectCompanyBranchIndex, -1);
assert.notEqual(normalCompanySelectionIndex, -1);
assert.ok(multiSelectCompanyBranchIndex < normalCompanySelectionIndex);
assert.match(
    companyClickBody.slice(multiSelectCompanyBranchIndex, normalCompanySelectionIndex),
    /toggleBaseMultiSelection\(`company:\$\{name\}`, ids, 'company', companyDisplayName\);[\s\S]*return;/
);

const multiSelectSyncBody = extractConstFunctionBody(appSource, 'syncMultiSelectBaseTripPreview');
assert.match(multiSelectSyncBody, /MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE/);
assert.match(multiSelectSyncBody, /clearTripPathPreview\(\{\s*source: MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE\s*\}\)/);
assert.match(multiSelectSyncBody, /selectedLineId: 'multi-base'/);
assert.match(multiSelectSyncBody, /previewSource: MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE/);
assert.match(multiSelectSyncBody, /virtualTrips/);
assert.doesNotMatch(multiSelectSyncBody, /SELECTION_COMPANY_TRIP_PREVIEW_SOURCE/);
assert.doesNotMatch(appSource, /focusExpr: \['==', \['get', 'company'\], selectedCompany\]/);

const lineOffsetPaintBody = extractConstFunctionBody(elementUiSource, 'buildLineOffsetPaintExpr');
assert.match(lineOffsetPaintBody, /line_offset_units/);
assert.match(elementUiSource, /getLineOffsetPixelsPerUnitAtZoom/);
assert.match(elementUiSource, /tripPreviewLineLayerPaint[\s\S]*'line-offset': buildLineOffsetPaintExpr\(\)/);
assert.match(layersSource, /buildLineOffsetPaintExpr/);
assert.match(layersSource, /paint\['line-offset'\] = buildLineOffsetPaintExpr\(\)/);
assert.match(tripPreviewBuilderSource, /getLineOffsetUnits = \(\) => 0/);
assert.match(tripPreviewBuilderSource, /line_offset_units: lineOffsetUnits/);
assert.match(tripPreviewBuilderSource, /r: routeLineId/);
assert.match(tripPreviewBuilderSource, /preserveLineDirection: true/);
assert.match(tripPreviewBuilderSource, /geometry_line_id: geometryLineId/);
assert.match(tripPreviewBuilderSource, /line_offset_id: offsetLineId/);
assert.doesNotMatch(tripPreviewBuilderSource, /inferLineIdFromStation/);
assert.match(tripPreviewLibSource, /geometryLineId/);
assert.match(tripPreviewLibSource, /offsetLineId/);
assert.match(tripPreviewLibSource, /chainLineIds/);
assert.match(tripPreviewLibSource, /virtualTimetable/);
assert.match(panelSource, /withTripPreviewLineIdentity/);
assert.match(panelSource, /geometryLineId/);
assert.match(panelSource, /offsetLineId/);
assert.match(panelSource, /chainLineIds/);
assert.match(panelSource, /virtualTimetable/);
assert.match(analyzeBranchSource, /fullRouteChains/);
assert.match(analyzeBranchSource, /buildBranchSegmentsFromRouteChains/);
assert.doesNotMatch(analyzeBranchSource, /inferLineIdFromStation/);
assert.match(appSource, /lineOffsetUnitsById/);
assert.match(appSource, /getLineOffsetUnits: \(lineId\) => \{/);
assert.match(appSource, /lineOffsetUnitsById\.has\(id\)/);
assert.match(appSource, /buildOffsetPolylinePixelsWithMiter/);
assert.match(appSource, /getStationOffsetGeoJSONAtZoom: \(zoom\) => buildStationOffsetGeoJSONAtZoom/);

const exportCurrentSelectionBody = extractConstFunctionBody(printSource, 'exportCurrentSelection');
assert.match(exportCurrentSelectionBody, /isTripPreviewActiveNow\(\)/);
assert.match(exportCurrentSelectionBody, /getGeoJsonSourceData\(baseMap, 'trip-preview-source'\)/);
assert.match(exportCurrentSelectionBody, /getGeoJsonSourceData\(baseMap, 'trip-preview-stops-source'\)/);
assert.match(exportCurrentSelectionBody, /exportSnapshot\(lastSnapshot, options\)/);
assert.match(exportCurrentSelectionBody, /return false/);
assert.match(printSource, /getLineOffsetPixelsForFeature[\s\S]*line_offset_units/);
assert.match(printSource, /pathFromLineFeatureCoords\(map, f, geom\.coordinates\)/);
assert.match(printSource, /getExportStationOffsetGeoJSONForMap\(vmap\)/);
assert.match(printSource, /remapStopFeatureCoordsToExportStations/);
assert.match(printSource, /exportStationsGeoJSON/);
assert.doesNotMatch(printSource, /EXPORT_NO_OFFSET_OVERLAY/);
assert.doesNotMatch(printSource, /remapStopFeatureCoordsToRawStations/);
assert.doesNotMatch(printSource, /buildNoOffsetCapsulesGeoJSON/);

assert.doesNotMatch(printSource, /\bexportBaseHighlight\b/);
assert.doesNotMatch(printSource, /\bbuildSvgFromBaseHighlight\b/);
assert.doesNotMatch(printSource, /__TokyoRailBaseHighlight/);

console.log('line highlight trip-preview convergence smoke ok');
