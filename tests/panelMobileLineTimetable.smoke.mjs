import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const panelSource = readFileSync(join(root, 'src/features/panel/panel.js'), 'utf8');
const panelRouteMapBridgeSource = readFileSync(join(root, 'src/features/panel/panelRouteMapBridge.js'), 'utf8');
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
    /createPanelRouteMapBridge/,
    'panel route-map event bridge must be isolated from the panel UI feature'
);

assert.match(
    panelSource,
    /panelRouteMapBridge\.requestLineRouteMapPanel\(\{[\s\S]*placement:\s*'mobile-panel'/,
    'panel line tap must request the mobile route-map bottom sheet through the bridge'
);

assert.match(
    panelSource,
    /panelRouteMapBridge\.requestLineRouteMapPanel\(\{[\s\S]*returnTarget:\s*'panel'/,
    'panel line tap must tell the route-map sheet it can return to the panel menu'
);

assert.match(
    panelSource,
    /panelRouteMapBridge\.onReturn\(\(\) => \{[\s\S]*panelShell\.expand\?\.\(\)/,
    'panel must restore the mobile menu when the route-map return bar is tapped'
);

assert.match(
    panelSource,
    /panelRouteMapBridge\.onReturn\(\(\) => \{[\s\S]*clearPinnedPanelState\(\{\s*restoreStation:\s*true\s*\}\)/,
    'route-map return must restore the station line highlight instead of leaving a single line pinned'
);

assert.match(
    panelRouteMapBridgeSource,
    /ROUTE_MAP_SHOW_EVENT\s*=\s*'__TokyoRailShowRouteMapPanel'/,
    'panel route-map bridge must own the route-map show event name'
);

assert.match(
    panelRouteMapBridgeSource,
    /ROUTE_MAP_RETURN_EVENT\s*=\s*'__TokyoRailRouteMapReturnPanel'/,
    'panel route-map bridge must own the route-map return event name'
);

assert.match(
    panelRouteMapBridgeSource,
    /requestLineRouteMapPanel[\s\S]*placement\s*=\s*'mobile-panel'[\s\S]*returnTarget\s*=\s*'panel'/,
    'panel route-map bridge must preserve mobile panel defaults'
);

assert.match(
    panelSource,
    /hideMobilePanelForRouteMapContext\(\)/,
    'mobile line route-map panel must fully hide the station panel behind the frosted sheet'
);

assert.match(
    panelSource,
    /const hideMobilePanelForRouteMapContext[\s\S]*panelShell\.hide\?\.\(\)/,
    'mobile route-map context must hide only the panel shell without running the full panel reset path'
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
    /shouldDeferPanelLineClickToMobilePanel/,
    'route-map generic click handler must defer mobile panel line taps to the panel-owned route-map entry point'
);

assert.match(
    routeMapSource,
    /if\s*\(shouldDeferPanelLineClickToMobilePanel\(evt\?\.target\)\)\s*return;[\s\S]*const info = readLineIdAndNameFromTarget/,
    'mobile panel line taps must not hit the route-map pin toggle branch before the panel dispatches'
);

assert.match(
    routeMapSource,
    /route-map-mobile-drag-bar/,
    'mobile route-map line panel must expose a top drag bar'
);

assert.match(
    routeMapSource,
    /route-map-back-btn/,
    'mobile route-map line panel must expose a return button'
);

assert.match(
    routeMapSource,
    /data-route-map-return-target/,
    'mobile route-map line panel must track whether it can return to the panel'
);

assert.match(
    routeMapSource,
    /__TokyoRailRouteMapReturnPanel/,
    'route-map return button must notify the panel instead of manipulating panel DOM directly'
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
    routeMapCssSource,
    /\.route-map\.is-mobile-panel-placement\[data-route-map-return-target='panel'\] \.route-map-back-btn[\s\S]*display:\s*inline-flex/,
    'mobile route-map return button must only appear for panel-origin route-map sheets'
);

assert.match(
    appSource,
    /placement:\s*isMobileUiMode\(\)\s*\?\s*'mobile-panel'\s*:\s*'panel'/,
    'map line click must request the same mobile bottom sheet placement'
);

assert.doesNotMatch(
    appSource,
    /returnTarget:\s*'panel'/,
    'map line click must not show the panel return bar'
);

console.log('panel mobile line route-map smoke ok');
