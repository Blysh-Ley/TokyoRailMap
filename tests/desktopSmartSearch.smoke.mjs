import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const searchSource = readFileSync(join(root, 'src/features/search/search.js'), 'utf8');
const travelSearchSource = readFileSync(join(root, 'src/features/search/travel-search-ui.js'), 'utf8');
const smartSearchSource = readFileSync(join(root, 'src/ui/searchModeSwitch.js'), 'utf8');
const cssSource = readFileSync(join(root, 'src/styles/app.css'), 'utf8');

assert.doesNotMatch(
    smartSearchSource + cssSource,
    /desktopSearchMode|data-desktop-search-mode|desktop-search-mode-switch|installDesktopSearchModeSwitch/,
    'desktop smart search submit must not keep mode-switch state or class names'
);

assert.match(
    smartSearchSource,
    /SMART_SEARCH_STATE[\s\S]*SEARCH:[\s\S]*ROUTE_DRAFT:[\s\S]*ROUTE_READY:[\s\S]*PLANNING:/,
    'desktop smart search must expose explicit search, route draft, route ready, and planning states'
);

assert.match(
    smartSearchSource,
    /className = 'desktop-smart-search-submit'/,
    'desktop smart search must render a submit control, not a mode switch'
);

assert.match(
    smartSearchSource,
    /submitSearch[\s\S]*showStationSelectionPanel/,
    'search-state submit must open the ordinary station selection panel'
);

assert.match(
    searchSource,
    /const enterDesktopRouteDraft = \(item\) =>[\s\S]*TokyoRailDesktopSmartSearch[\s\S]*enterRouteDraft/,
    'ordinary station search commits must be able to enter the desktop route draft'
);

assert.match(
    searchSource,
    /input\.addEventListener\('keydown'[\s\S]*key !== 'Enter'[\s\S]*showStationSelectionPanel/,
    'desktop search input Enter must open the station selection panel'
);

assert.match(
    searchSource + travelSearchSource,
    /resetToSearch\?\.\(\{ clearSearch: true, clearJourney: true \}\)/,
    'map reset must exit desktop route planning and clear search inputs'
);

assert.match(
    travelSearchSource,
    /installDesktopSmartSearchController\(\{ journeyUi: ui \}\)/,
    'travel search UI must install the desktop smart-search controller after publishing journey UI'
);

assert.match(
    travelSearchSource,
    /if \(!updateDesktopSmartSearchDraft\(\{ conditionChanged: true \}\)\) maybeComputePlans\(\)/,
    'desktop route draft changes must update draft state instead of always auto-planning'
);

assert.match(
    cssSource,
    /data-desktop-smart-search-state='routeDraft'[\s\S]*\.search-ui/,
    'route draft CSS must hide the ordinary search UI'
);

assert.match(
    cssSource,
    /\.desktop-smart-search-submit-icon[\s\S]*stroke: currentColor/,
    'desktop smart-search submit must use an icon-only affordance'
);
