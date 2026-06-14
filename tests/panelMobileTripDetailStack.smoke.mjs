import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const panelSource = readFileSync(join(root, 'src/features/panel/panel.js'), 'utf8');
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
    /hideTripDetail\(\{\s*restoreMobileLine:\s*false\s*\}\)/,
    'panel close or station rerender must be able to clear trip detail without restoring old line highlight'
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

console.log('panel mobile trip detail stack smoke ok');
