import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const panelSource = readFileSync(join(root, 'src/features/panel/panel.js'), 'utf8');
const panelRouteMapBridgeSource = readFileSync(join(root, 'src/features/panel/panelRouteMapBridge.js'), 'utf8');
const routeMapSource = readFileSync(join(root, 'src/features/route-map/route-map-ui.js'), 'utf8');
const routeMapCssSource = readFileSync(join(root, 'src/styles/route-map.css'), 'utf8');
const appSource = readFileSync(join(root, 'src/app.js'), 'utf8');
const mobileSheetSnapSource = readFileSync(join(root, 'src/ui/mobileSheetSnap.js'), 'utf8');

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
    /appendStationJumpClass\('route-map-station'\)[\s\S]*data-panel-station-jump="1"[\s\S]*role="button"[\s\S]*tabindex="0"/,
    'route-map stations must render with the shared station jump class and accessible button affordance'
);

assert.match(
    routeMapSource,
    /resolveStationJumpIntent\(target,[\s\S]*adjustTime:\s*false,[\s\S]*rootEl:\s*body/,
    'route-map station jumps must reuse the shared station jump resolver without changing time'
);

assert.match(
    routeMapSource,
    /hideRouteMapForStationJump\(\);[\s\S]*window\.dispatchEvent\(new CustomEvent\('__TokyoRailPanelStationJump'[\s\S]*adjustTime:\s*false,[\s\S]*source:\s*'route-map'/,
    'route-map station jumps must hide the route-map sheet and dispatch a no-time-change station jump'
);

assert.match(
    routeMapSource,
    /body\.addEventListener\('click',\s*\(evt\) => \{[\s\S]*dispatchRouteMapStationJump\(evt\?\.target,\s*evt\);[\s\S]*\},\s*\{\s*passive:\s*false\s*\}\)/,
    'route-map station jumps must handle pointer click through the route-map body'
);

assert.match(
    routeMapSource,
    /body\.addEventListener\('keydown',\s*\(evt\) => \{[\s\S]*key !== 'Enter' && key !== ' '[\s\S]*dispatchRouteMapStationJump\(evt\?\.target,\s*evt\);[\s\S]*\},\s*\{\s*passive:\s*false\s*\}\)/,
    'route-map station jumps must also support keyboard activation'
);

assert.match(
    appSource,
    /window\.addEventListener\('__TokyoRailPanelStationJump',\s*\(event\) => \{[\s\S]*jumpToPanelStation\(event\?\.detail \|\| \{\}\)\.catch\(\(\) => null\);/,
    'app must listen for route-map station jump intents'
);

assert.match(
    routeMapSource,
    /ROUTE_MAP_BACK_INTENT_EVENT\s*=\s*'__TokyoRailRouteMapBackIntent'/,
    'route-map must own a back intent event for Android native back handling'
);

assert.match(
    routeMapSource,
    /window\.addEventListener\(ROUTE_MAP_BACK_INTENT_EVENT,[\s\S]*hideRouteMapForBackIntent\(\)[\s\S]*evt\.detail\.handled\s*=\s*true/,
    'route-map must consume Android back while visible instead of letting the app exit'
);

assert.match(
    appSource,
    /const handleRouteMapBackIntent = \(payload = \{\}\) => \{[\s\S]*clearSelectionsAndRestore\(\);[\s\S]*return true;/,
    'app must reset map state when Android back closes route-map'
);

assert.match(
    appSource,
    /handleBackIntent:\s*\(payload\) => \([\s\S]*handleRouteMapBackIntent\(payload\)[\s\S]*panel\?\.handlePanelBackIntent\?\.\(payload\) === true/,
    'Android back must offer the intent to route-map before the panel'
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
    mobileSheetSnapSource,
    /getNearestMobileSheetStateByOffset/,
    'mobile drawer snap points must be centralized for route-map and panel sheets'
);

assert.match(
    routeMapSource,
    /createMobileSheetDragSession[\s\S]*updateMobileSheetDragSession[\s\S]*resolveMobileSheetDragTarget/,
    'mobile route-map line panel drag must use shared gesture-aware expanded half collapsed snap logic'
);

assert.match(
    routeMapSource,
    /createMobileSheetPullDownController\(\{[\s\S]*scrollEl:\s*body[\s\S]*beginSheetDrag:\s*beginMobileSheetDrag[\s\S]*endSheetDrag:\s*endMobileSheetDrag/,
    'mobile route-map body must support top pull-down through the shared sheet bridge'
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
    /\.route-map\.is-mobile-panel-placement\[data-route-map-mobile-state='collapsed'\][\s\S]*var\(--mobile-sheet-peek-height,\s*86px\)/,
    'mobile route-map line panel must expose a collapsed drawer state that leaves a small top strip'
);

assert.match(
    routeMapCssSource,
    /\.route-map\.is-mobile-panel-placement \.route-map-body[\s\S]*padding-bottom:\s*var\(--mobile-bottom-nav-clearance,[\s\S]*scroll-padding-bottom:\s*var\(--mobile-bottom-nav-clearance,/,
    'mobile route-map body must reserve bottom space for the bottom navigation'
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
