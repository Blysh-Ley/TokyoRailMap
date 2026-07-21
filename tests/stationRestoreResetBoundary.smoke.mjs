import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appSource = readFileSync(join(process.cwd(), 'src/app.js'), 'utf8');
const mapInteractionSource = readFileSync(join(process.cwd(), 'src/features/map-interactions/mapInteractionController.js'), 'utf8');
const panelSource = readFileSync(join(process.cwd(), 'src/features/panel/panel.js'), 'utf8');

assert.match(
    appSource,
    /function\s+cancelStationRestoreState\(\)\s*\{[\s\S]*panel\?\.invalidateStationRestoreSession\?\.\(\{\s*cancelRender:\s*true\s*\}\);[\s\S]*panel\?\.cancelStationThroughPreview\?\.\(\);[\s\S]*stationPopup\?\.clearRestoreState\?\.\(\);[\s\S]*cancelSelectionTripPreviewSync\(\);[\s\S]*\}/,
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

assert.match(
    mapInteractionSource,
    /if\s*\(isMultiSelectModeEnabled\?\.\(\)\s*!==\s*true\)\s*\{[\s\S]*clearTripPathPreview\?\.\(\);[\s\S]*\}\s*cancelStationRestoreState\?\.\(\);[\s\S]*if\s*\(hasActiveSelection\?\.\(\)\s*!==\s*true\)\s+return;[\s\S]*clearSelectionsAndRestore\?\.\(\);/,
    'blank map clicks should cancel station restore state even when selection state is already empty'
);

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

console.log('station restore reset boundary smoke ok');
