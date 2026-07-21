import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const layersSource = readFileSync(join(process.cwd(), 'src/map/layers.js'), 'utf8');
const appSource = readFileSync(join(process.cwd(), 'src/app.js'), 'utf8');

assert.match(layersSource, /touchHoverLongPressMs[\s\S]*510/);
assert.match(layersSource, /queryRenderedFeatures\(point,\s*\{\s*layers:\s*\['stations-layer'\]\s*\}/);
assert.match(layersSource, /startTouchHoverFromFeature\(\{[\s\S]*pointerId:[\s\S]*feature[\s\S]*\}\)/);
assert.match(layersSource, /canvas\.addEventListener\(\s*'pointerup'[\s\S]*hideTouchHoverPopup/);
assert.match(layersSource, /canvas\.addEventListener\(\s*'pointercancel'[\s\S]*hideTouchHoverPopup/);
assert.match(layersSource, /showTouchHoverPopupAt/);
assert.match(layersSource, /hideTouchHoverPopup/);
assert.match(layersSource, /isStillActive[\s\S]*buildPopupHtml[\s\S]*isStillActive/);

assert.match(appSource, /labelLongPressMs\s*=\s*510/);
assert.match(appSource, /stationPopup\?\.showTouchHoverPopupAt\?\.\(item\.coordinates,\s*item\.props/);
assert.match(appSource, /isStillActive:\s*\(\)\s*=>\s*labelLongPressFired\s*===\s*true/);
assert.match(appSource, /stationPopup\?\.hideTouchHoverPopup\?\.\(\{\s*pointerId:\s*evt\?\.pointerId\s*\}\)/);
assert.match(appSource, /if\s*\(finishLabelLongPress\(evt\)\)\s*return/);

console.log('mobile station long press popup smoke ok');
