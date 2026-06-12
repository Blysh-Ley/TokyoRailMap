import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const panelSource = readFileSync(join(process.cwd(), 'src/features/panel/panel.js'), 'utf8');

assert.match(
    panelSource,
    /const\s+clearUnpinnedTripPreview\s*=\s*\(\)\s*=>\s*\{[\s\S]*tripPreviewScheduler\.clearApplied\(\);[\s\S]*onTripClear\?\.\(\);/,
    'panel should clear the active trip preview when unpinned trip hover is cancelled'
);

assert.match(
    panelSource,
    /if\s*\(!tripDetailPinned\)\s*\{[\s\S]*clearUnpinnedTripPreview\(\);[\s\S]*scheduleTripDetailHide\(\);[\s\S]*\}/,
    'panel body leave should clear unpinned trip preview before delayed hide'
);

assert.match(
    panelSource,
    /if\s*\(isDirFilterPinned\(\)\)\s*\{[\s\S]*applyDirPreviewByKey[\s\S]*\}\s*else\s*\{[\s\S]*clearUnpinnedTripPreview\(\);[\s\S]*\}/,
    'trip row mouseout should clear unpinned trip preview while preserving pinned direction restore'
);

console.log('panel trip preview clear smoke ok');
