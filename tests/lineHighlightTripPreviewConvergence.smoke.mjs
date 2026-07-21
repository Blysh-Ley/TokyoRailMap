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
const panelTripDetailRuntimeSource = readSource('src/features/panel/panelTripDetailRuntime.js');
const analyzeBranchSource = readSource('src/map/analyze_branch.js');

for (const deletedName of [
    'selection' + '-line-trip-preview',
    'SELECTION' + '_LINE_TRIP_PREVIEW',
    'syncSelection' + 'LineTripPreview',
    'getSelection' + 'LineTripPreviewLineIds',
    'buildSelection' + 'LineTripVirtualTrips'
]) {
    assert.equal(appSource.includes(deletedName), false, `${deletedName} must stay deleted`);
}

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
assert.match(
    appSource,
    /tripPreviewLineIds = lineIds \|\| null;\s*tripPreviewRenderer\.applyLinePaint\?\.\(\);\s*applyTripPreviewEndpointLabelProtection\(\);/,
    'trip preview line paint must refresh after active line ids are stored'
);

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

const multiSelectLayerItemsBody = extractConstFunctionBody(appSource, 'buildMultiSelectLayerItems');
assert.match(multiSelectLayerItemsBody, /baseSelectionsByKey:\s*baseMultiSelectionsByKey/);
assert.match(multiSelectLayerItemsBody, /formatBaseBranchLineName:\s*\(lineName, step\) =>/);
assert.match(multiSelectLayerItemsBody, /getBranchPreviewStep:\s*\(lineId\) =>/);
assert.match(multiSelectLayerItemsBody, /tripPreviewSelectionEntries:\s*routeFeature\.getTripPreviewSelectionEntries\(\)/);

const toggleBaseMultiSelectionBody = extractConstFunctionBody(appSource, 'toggleBaseMultiSelection');
assert.match(
    toggleBaseMultiSelectionBody,
    /toggleBaseMultiSelectionState\(\{[\s\S]*selectionsByKey:\s*baseMultiSelectionsByKey[\s\S]*\}\);[\s\S]*baseMultiSelectionCommitter\?\.commitChangedResult\(result\)[\s\S]*return result\.selected === true;/
);
const toggleBaseLineBranchPreviewBody = extractConstFunctionBody(appSource, 'toggleBaseLineBranchPreview');
assert.match(toggleBaseLineBranchPreviewBody, /branchPreviewStepCommitter\?\.setStep\(lineId, decision\.nextStep\)/);
assert.match(toggleBaseLineBranchPreviewBody, /filterSpecial: decision\.filterSpecial/);
assert.doesNotMatch(toggleBaseLineBranchPreviewBody, /branchAutoHidden/);
assert.doesNotMatch(toggleBaseLineBranchPreviewBody, /hidden:\s*true/);
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
assert.match(panelTripDetailRuntimeSource, /withTripPreviewLineIdentity/);
assert.match(panelTripDetailRuntimeSource, /geometryLineId/);
assert.match(panelTripDetailRuntimeSource, /offsetLineId/);
assert.match(panelTripDetailRuntimeSource, /chainLineIds/);
assert.match(panelTripDetailRuntimeSource, /virtualTimetable/);
assert.match(analyzeBranchSource, /fullRouteChains/);
assert.match(analyzeBranchSource, /buildBranchSegmentsFromRouteChains/);
assert.match(analyzeBranchSource, /filterSpecial !== true/);
assert.match(analyzeBranchSource, /base-branch-/);
assert.match(
    analyzeBranchSource,
    /const baseResult = await analyzeBranchesForLine\(lid,\s*\{[\s\S]*targetTripKeys,[\s\S]*throughServiceCategory:\s*normalizedCategory,[\s\S]*sourceLineIds:\s*normalizedSourceLineIds,[\s\S]*filterSpecial:\s*true,[\s\S]*anchorStationIds:\s*normalizedAnchorStationIds,[\s\S]*alternateLineMembership,[\s\S]*\.\.\.cancellationOptions[\s\S]*\}\);/
);
assert.match(analyzeBranchSource, /mergeEndpointIds/);
assert.match(analyzeBranchSource, /addCurrentLineCoverageRecords/);
assert.match(analyzeBranchSource, /lineStationIdsById/);
assert.match(analyzeBranchSource, /collectAdjacentPairKeys/);
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
assert.match(printSource, /pickLineNameLabelsInBbox/);
assert.match(printSource, /lineIds:\s*built\?\.lineIds/);
assert.match(printSource, /getGeoJsonSourceData\(baseMap, 'line-name-labels-source'\)/);
assert.match(printSource, /appendLineNameLabelsSvg/);
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
