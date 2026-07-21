import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const panelSource = readFileSync(join(process.cwd(), 'src/features/panel/panel.js'), 'utf8');

assert.match(
    panelSource,
    /const\s+clearAppliedPanelTripPreviewState\s*=\s*\(\)\s*=>\s*\{[\s\S]*tripPreviewScheduler\.getAppliedKey\?\.\(\)[\s\S]*tripPreviewScheduler\.clearApplied\(\);[\s\S]*return\s+hadApplied;/,
    'panel should read the applied trip preview key before clearing scheduler state'
);

assert.match(
    panelSource,
    /const\s+clearUnpinnedTripPreview\s*=\s*\(\{[\s\S]*skipStationThroughRestore[\s\S]*\}\s*=\s*\{\}\)\s*=>\s*\{[\s\S]*const\s+hadAppliedTripPreview\s*=\s*clearAppliedPanelTripPreviewState\(\);[\s\S]*if\s*\(!hadAppliedTripPreview\)\s+return;[\s\S]*onTripClear\?\.\(\);/,
    'panel should clear the global trip preview only when it owns an applied panel-trip preview'
);

assert.match(
    panelSource,
    /const\s+hideTripDetail\s*=\s*\(\{[\s\S]*restoreStationThroughPreview[\s\S]*\}\s*=\s*\{\}\)\s*=>\s*\{[\s\S]*const\s+hadAppliedTripPreview\s*=\s*clearAppliedPanelTripPreviewState\(\);[\s\S]*if\s*\(hadAppliedTripPreview\)\s*\{[\s\S]*onTripClear\?\.\(\);[\s\S]*if\s*\(restoreStationThroughPreview\s*&&\s*hadAppliedTripPreview\)/,
    'panel trip-detail hide should not clear or restore map preview when no panel-trip preview was applied'
);

assert.match(
    panelSource,
    /if\s*\(!tripDetailPinned\)\s*\{[\s\S]*clearUnpinnedTripPreview\(\{[\s\S]*skipStationThroughRestore:\s*true[\s\S]*\}\);[\s\S]*scheduleTripDetailHide\(\);[\s\S]*\}/,
    'panel body leave should clear unpinned trip preview before delayed hide'
);

assert.doesNotMatch(
    panelSource,
    new RegExp([
        ['isDirFilter', 'Pinned'].join(''),
        ['applyDirPreview', 'ByKey'].join(''),
        ['clearDir', 'Preview'].join('')
    ].join('|')),
    'panel should not retain the old dir-filter direction-preview restore path'
);

console.log('panel trip preview clear smoke ok');
