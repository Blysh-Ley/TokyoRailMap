import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const panelSource = readFileSync(join(root, 'src/features/panel/panel.js'), 'utf8');
const appSource = readFileSync(join(root, 'src/app.js'), 'utf8');
const mainViewSource = readFileSync(join(root, 'src/ui/panelMainView.js'), 'utf8');
const tripDetailViewSource = readFileSync(join(root, 'src/ui/panelTripDetailView.js'), 'utf8');
const cssSource = readFileSync(join(root, 'src/styles/app.css'), 'utf8');

assert.match(
    mainViewSource,
    /tripDetailBackBtn/,
    'mobile trip detail must expose a back button'
);

assert.match(
    mainViewSource,
    /header\.appendChild\(tripDetailBackBtn\)[\s\S]*header\.appendChild\(title\)/,
    'mobile trip detail back button must live in data-panel-header before the station title'
);

assert.doesNotMatch(
    mainViewSource,
    /tripDetailHeader\.appendChild\(tripDetailBackBtn\)/,
    'mobile trip detail back button must not stay inside the trip-detail content header'
);

assert.match(
    mainViewSource,
    /mobileHost:\s*panel/,
    'trip detail view must receive the panel container as mobile host'
);

assert.match(
    mainViewSource,
    /createMobileSheetPullDownController\(\{[\s\S]*scrollEl:\s*tripDetailBody[\s\S]*beginSheetDrag:\s*beginPanelSheetDragFromEvent[\s\S]*endSheetDrag:[\s\S]*endPanelSheetDragFromEvent/,
    'mobile trip detail body must support top pull-down through the shared sheet bridge'
);

assert.match(
    tripDetailViewSource,
    /moveToHost\(root,\s*mobileHost\)/,
    'mobile trip detail must be reparented into the panel drawer'
);

assert.match(
    tripDetailViewSource,
    /root\.style\.position\s*=\s*'relative'/,
    'mobile trip detail must use in-drawer relative positioning'
);

assert.match(
    tripDetailViewSource,
    /root\.style\.position\s*=\s*'fixed'/,
    'desktop trip detail must keep fixed popup positioning'
);

assert.match(
    panelSource,
    /mobilePanelStack\.openTripDetail\(/,
    'pinned trip render must enter the mobile tripDetail stack screen'
);

assert.match(
    panelSource,
    /handlePanelBackIntent[\s\S]*PANEL_MOBILE_STACK_SCREENS\.TRIP_DETAIL[\s\S]*hideTripDetail\(\)/,
    'Android/system back intent must return from mobile trip detail through the same panel path'
);

assert.match(
    appSource,
    /onAndroidBackPanelHidden:\s*clearSelectionsAndRestore/,
    'app must inject the map reset callback used after Android back fully hides the mobile panel'
);

assert.match(
    appSource,
    /handleBackIntent:\s*\(payload\) => \([\s\S]*handleRouteMapBackIntent\(payload\)[\s\S]*panel\?\.handlePanelBackIntent\?\.\(payload\) === true[\s\S]*\)/,
    'Android back runtime payload must be offered to route-map before falling through to the panel back intent'
);

assert.match(
    panelSource,
    /const onAndroidBackPanelHidden = typeof options\.onAndroidBackPanelHidden === 'function' \? options\.onAndroidBackPanelHidden : null;/,
    'panel must receive Android-back reset behavior as an injected callback'
);

assert.match(
    panelSource,
    /const handlePanelBackIntent = \(\{ source = '' \} = \{\}\) => \{[\s\S]*const isAndroidBack = source === 'android-back';/,
    'panel back intent must distinguish Android native back from in-app back'
);

assert.match(
    panelSource,
    /if \(panelShell\.isHalfCollapsed\?\.\(\) \|\| panelShell\.isCollapsed\?\.\(\)\) \{[\s\S]*if \(isAndroidBack\) \{[\s\S]*hide\(\);[\s\S]*onAndroidBackPanelHidden\?\.\(\);[\s\S]*return true;[\s\S]*\}[\s\S]*panelShell\.expand\?\.\(\);/,
    'Android native back must fully hide a collapsed mobile panel and reset the map instead of expanding it'
);

assert.match(
    panelSource,
    /if \(panelShell\.isVisible\?\.\(\)\) \{[\s\S]*hide\(\);[\s\S]*if \(isAndroidBack\) \{[\s\S]*onAndroidBackPanelHidden\?\.\(\);[\s\S]*\}[\s\S]*return true;/,
    'Android native back must reset the map after fully hiding a visible mobile panel'
);

assert.match(
    panelSource,
    /tripDetailBackBtn\?\..*hideTripDetail\(\)/s,
    'mobile trip detail back button must hide the trip detail'
);

assert.match(
    panelSource,
    /onTripClear\?\.\(\)[\s\S]*restoreMobileLineAfterTripDetail\(\)/,
    'trip clear must run before restoring the selected line highlight'
);

assert.match(
    panelSource,
    /const expandMobilePanelAfterTripDetailReturn = \(\) => \{[\s\S]*panelShell\.expand\?\.\(\) === true;[\s\S]*restoreMobileLineAfterTripDetail[\s\S]*restoreStationDefaultSelection\(\);[\s\S]*expandMobilePanelAfterTripDetailReturn\(\);/,
    'mobile trip-detail return must expand the station panel instead of leaving it half-collapsed'
);

assert.match(
    panelSource,
    /hideTripDetail\(\{\s*restoreMobileLine:\s*false\s*\}\)/,
    'panel close or station rerender must be able to clear trip detail without restoring old line highlight'
);

assert.match(
    panelSource,
    /if \(!isMobilePanelPresentation\(\) && evt\?\.target instanceof Element && body\.contains\(evt\.target\) && hasPinnedPanelState\(\)\)/,
    'mobile panel pointerdown must not enter the desktop pinned-interaction cancel branch'
);

assert.match(
    panelSource,
    /if \(!isMobilePanelPresentation\(\) && tripLocked\) \{/,
    'mobile panel pointerdown must not use the desktop trip-locked cancel branch'
);

assert.match(
    panelSource,
    /const dirTitle = getDirTitleTarget\(evt\?\.target\);[\s\S]*if \(dirTitle\) \{[\s\S]*stopPropagationOnly\(evt\);[\s\S]*panelInteractionPolicy\.startTripTap\(evt,\s*\{[\s\S]*kind:\s*'dir-title-toggle'[\s\S]*lineId:\s*dirTitle\.lineId[\s\S]*dirKey:\s*dirTitle\.dirKey[\s\S]*\}\);[\s\S]*return;/,
    'mobile panel direction title must wait for a confirmed tap instead of toggling on pointerdown'
);

assert.match(
    panelSource,
    /const lineHeaderToggleTarget = getPanelLineHeaderToggleTarget\(evt\?\.target\);[\s\S]*if \(lineHeaderToggleTarget\) \{[\s\S]*stopPropagationOnly\(evt\);[\s\S]*panelInteractionPolicy\.startTripTap\(evt,\s*\{[\s\S]*kind:\s*'line-header-toggle'[\s\S]*lineId:\s*lineHeaderToggleTarget\.lineEl\.getAttribute\?\.\('data-line-id'\)[\s\S]*\}\);[\s\S]*return;/,
    'mobile panel line header collapse must wait for a confirmed tap instead of toggling on pointerdown'
);

assert.match(
    panelSource,
    /const dirTriangle = getDirTriangleTarget\(evt\?\.target\);[\s\S]*if \(dirTriangle\) \{[\s\S]*stopPropagationOnly\(evt\);[\s\S]*panelInteractionPolicy\.startTripTap\(evt,\s*\{[\s\S]*kind:\s*'dir-triangle-toggle'[\s\S]*lineId:\s*dirTriangle\.lineId[\s\S]*dirKey:\s*dirTriangle\.dirKey[\s\S]*\}\);[\s\S]*return;/,
    'mobile panel direction triangle must wait for a confirmed tap instead of toggling on pointerdown'
);

assert.match(
    panelSource,
    /const pendingKind = toText\(pending\?\.kind\);[\s\S]*if \(pendingKind === 'line-header-toggle' \|\| pendingKind === 'line-toggle'\) \{[\s\S]*togglePanelLineCollapsedById\(pending\.lineId\);[\s\S]*return;[\s\S]*\}[\s\S]*if \(pendingKind === 'dir-title-toggle' \|\| pendingKind === 'dir-triangle-toggle'\) \{[\s\S]*dispatchPanelDirectionToggleIntent\(\{[\s\S]*lineId:\s*pending\.lineId[\s\S]*dirKey:\s*pending\.dirKey[\s\S]*toggleDirectionTimetable[\s\S]*\}\);[\s\S]*return;[\s\S]*\}[\s\S]*openTripDetailFromPayload\(/,
    'mobile panel line and direction toggles must execute on pointerup only when the touch did not move'
);

assert.match(
    panelSource,
    /setPinnedPanelSelection:\s*isMobilePanelPresentation\(\) \? \(\) => null : setPinnedPanelSelection/,
    'mobile line/company taps must not write desktop pinned panel selection state'
);

assert.match(
    panelSource,
    /if \(!isMobilePanelPresentation\(\)\) \{\s*lockTripPreview\(key\);\s*setPinnedPanelSelection\('trip', key\);\s*\}/,
    'mobile trip taps must open trip detail without locking desktop pinned trip state'
);

assert.doesNotMatch(
    panelSource,
    /restoreMobileLineAfterTripDetail[\s\S]*setPinnedPanelSelection\('line', lineId\)/,
    'mobile trip-detail return must restore highlight without desktop pinned line state'
);

assert.match(
    cssSource,
    /data-panel-mobile-stack-screen='tripDetail'[\s\S]*\[data-panel-body\][\s\S]*display:\s*none/,
    'mobile trip detail screen must hide the line list body'
);

assert.match(
    cssSource,
    /data-panel-mobile-stack-screen='tripDetail'[\s\S]*\[data-panel-header\] \.panel-trip-detail-back-btn[\s\S]*display:\s*inline-flex/,
    'mobile trip detail must show the back button in the panel header'
);

assert.match(
    cssSource,
    /\.panel-trip-detail-back-btn\s*\{[\s\S]*width:\s*28px[\s\S]*border-radius:\s*9999px[\s\S]*background:\s*var\(--ui-surface\)/,
    'mobile trip detail back button must match the route-map return button shape using shared tokens'
);

assert.match(
    cssSource,
    /\.panel-trip-detail\[data-panel-trip-detail-presentation='mobile'\] \.panel-trip-detail-body[\s\S]*padding-bottom:\s*calc\(6px \+ var\(--mobile-bottom-nav-clearance\)\)[\s\S]*scroll-padding-bottom:\s*var\(--mobile-bottom-nav-clearance\)/,
    'mobile trip detail body must reserve bottom space for the bottom navigation'
);

assert.match(
    cssSource,
    /\[data-panel-root\]\[data-panel-presentation='mobile'\] \.panel-trip-detail\[data-panel-trip-detail-presentation='mobile'\] \.panel-trip-detail-transfer\s*\{[\s\S]*flex:\s*0 1 min\(34vw,\s*132px\)[\s\S]*min-width:\s*0[\s\S]*max-width:\s*min\(34vw,\s*132px\)/,
    'mobile trip detail transfer column must be width-limited without forcing desktop width'
);

assert.match(
    cssSource,
    /\[data-panel-root\]\[data-panel-presentation='mobile'\] \.panel-trip-detail\[data-panel-trip-detail-presentation='mobile'\] \.panel-trip-detail-transfer-row\s*\{[\s\S]*flex-wrap:\s*wrap[\s\S]*max-width:\s*100%/,
    'mobile trip detail transfer items must wrap instead of overflowing the screen'
);

assert.match(
    cssSource,
    /html\[data-mobile-ui='1'\] \.panel-trip-detail-transfer-hover-portal,[\s\S]*body\[data-mobile-ui='1'\] \.panel-trip-detail-transfer-hover-portal\s*\{[\s\S]*width:\s*calc\(100vw - 12px\)[\s\S]*min-width:\s*0[\s\S]*max-width:\s*calc\(100vw - 12px\)/,
    'mobile trip detail transfer hover portal must be constrained to the viewport width'
);

assert.match(
    cssSource,
    /html\[data-mobile-ui='1'\] \.panel-trip-detail-transfer-hover-portal \.panel-trip-detail-transfer-row,[\s\S]*body\[data-mobile-ui='1'\] \.panel-trip-detail-transfer-hover-portal \.panel-trip-detail-transfer-row\s*\{[\s\S]*flex-wrap:\s*wrap/,
    'mobile trip detail transfer hover portal rows must wrap long transfer groups'
);

console.log('panel mobile trip detail stack smoke ok');
