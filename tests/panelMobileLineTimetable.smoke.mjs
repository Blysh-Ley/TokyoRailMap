import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const panelSource = readFileSync(join(root, 'src/features/panel/panel.js'), 'utf8');
const routeMapSource = readFileSync(join(root, 'src/features/route-map/route-map-ui.js'), 'utf8');
const routeMapCssSource = readFileSync(join(root, 'src/styles/route-map.css'), 'utf8');
const appSource = readFileSync(join(root, 'src/app.js'), 'utf8');

assert.match(
    panelSource,
    /createPanelMobileStackController/,
    'panel feature must use the mobile stack controller'
);

assert.match(
    panelSource,
    /openMobileStationOverview\(\)/,
    'station panel render must reset the mobile stack to station overview'
);

assert.match(
    panelSource,
    /openMobileLineTimetable\(touchPrimaryTarget\.lineId\)/,
    'mobile touch line selection must still use the dedicated line entry point'
);

assert.match(
    panelSource,
    /showMobileLineRouteMapPanel\(lid\)/,
    'mobile line entry must show the route-map line panel'
);

assert.match(
    panelSource,
    /__TokyoRailShowRouteMapPanel[\s\S]*placement:\s*'mobile-panel'/,
    'panel line tap must request the mobile route-map bottom sheet'
);

assert.match(
    panelSource,
    /collapseMobilePanelForMapContext\(\)/,
    'mobile line panel must half-collapse the station panel for map context'
);

assert.match(
    panelSource,
    /panelShell\.collapseHalf\(\)/,
    'mobile map context collapse must use the half-height drawer state before falling back'
);

assert.doesNotMatch(
    panelSource,
    /mobilePanelStack\.openLineTimetable\(\{[\s\S]*lineId:\s*lid/,
    'mobile line tap must not enter the old hidden-list lineTimetable screen'
);

assert.match(
    routeMapSource,
    /lastPlacement === 'mobile-panel'/,
    'route-map UI must support mobile-panel placement'
);

assert.match(
    routeMapSource,
    /placement:\s*isMobileRouteMapPresentation\(\)\s*\?\s*'mobile-panel'\s*:\s*'anchor'/,
    'route-map panel-line click path must also use mobile-panel placement on mobile'
);

assert.match(
    routeMapSource,
    /route-map-mobile-drag-bar/,
    'mobile route-map line panel must expose a top drag bar'
);

assert.match(
    routeMapSource,
    /data-route-map-mobile-dragging/,
    'mobile route-map line panel must track drag state for cleanup and styling'
);

assert.match(
    routeMapSource,
    /document\.addEventListener\('pointermove', updateMobileSheetDrag/,
    'mobile route-map line panel drag must keep working when the pointer leaves the bar'
);

assert.match(
    routeMapCssSource,
    /\.route-map\.is-mobile-panel-placement[\s\S]*var\(--ui-frosted-background\)/,
    'mobile route-map line panel must use frosted token styling'
);

assert.match(
    routeMapCssSource,
    /\.route-map\.is-mobile-panel-placement[\s\S]*border-radius:\s*18px 18px 0 0/,
    'mobile route-map line panel must be a full-width bottom drawer with top-only radius'
);

assert.match(
    routeMapCssSource,
    /\.route-map\.is-mobile-panel-placement\[data-route-map-mobile-state='half'\][\s\S]*translateY\(50%\)/,
    'mobile route-map line panel must default to a half-collapsed drawer state'
);

assert.match(
    routeMapCssSource,
    /\.route-map\.is-mobile-panel-placement \.route-map-mobile-drag-bar::before[\s\S]*var\(--ui-border-strong\)/,
    'mobile route-map drag bar must use shared token colors'
);

assert.match(
    appSource,
    /placement:\s*isMobileUiMode\(\)\s*\?\s*'mobile-panel'\s*:\s*'panel'/,
    'map line click must request the same mobile bottom sheet placement'
);

console.log('panel mobile line route-map smoke ok');
