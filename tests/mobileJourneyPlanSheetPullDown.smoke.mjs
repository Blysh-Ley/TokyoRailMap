import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sheetSource = readFileSync(join(root, 'src/ui/mobileJourneyPlanSheet.js'), 'utf8');
const journeyUiSource = readFileSync(join(root, 'src/features/search/travel-search-ui.js'), 'utf8');
const cssSource = readFileSync(join(root, 'src/styles/app.css'), 'utf8');

assert.match(
    sheetSource,
    /import \{ createMobileSheetPullDownController \} from '\.\/mobileSheetPullDown\.js';/,
    'mobile journey plan sheet must reuse the shared pull-down controller'
);

assert.match(
    sheetSource,
    /const bindScrollableContent = \(scrollEl\) => createMobileSheetPullDownController\(\{[\s\S]*scrollEl,[\s\S]*beginSheetDrag:\s*\(event\) => beginDrag\(event\),[\s\S]*updateSheetDrag:\s*updateDrag,[\s\S]*endSheetDrag:\s*finishDrag/,
    'journey sheet scroll content must drive the same sheet drag lifecycle as the handle'
);

assert.match(
    sheetSource,
    /return \{[\s\S]*bindHandle,[\s\S]*bindScrollableContent,[\s\S]*getState:/,
    'mobile journey plan sheet must expose scroll-content pull-down binding through its UI API'
);

assert.match(
    journeyUiSource,
    /const path = el\('div', 'journey-plan-path'\);[\s\S]*await appendJourneyPath\(path, row, displayPlan\);[\s\S]*journeyPlanSheet\.bindScrollableContent\(path\);/,
    'journey plan path must register top pull-down support after its path content is rendered'
);

assert.match(
    cssSource,
    /\[data-mobile-search-mode='journey'\] \.journey-plan-path[\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior:\s*none;[\s\S]*overscroll-behavior-y:\s*none;[\s\S]*touch-action:\s*pan-y;/,
    'mobile journey plan path must suppress native overscroll while keeping vertical scrolling'
);

console.log('mobile journey plan sheet pull-down smoke ok');
