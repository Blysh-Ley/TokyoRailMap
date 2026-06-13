import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const panelSource = readFileSync(join(root, 'src/features/panel/panel.js'), 'utf8');
const cssSource = readFileSync(join(root, 'src/styles/app.css'), 'utf8');

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
    'mobile touch line selection must enter the line timetable stack screen'
);

assert.match(
    panelSource,
    /mobilePanelStack\.openLineTimetable\(/,
    'line timetable screen must be represented in the mobile stack state'
);

assert.match(
    panelSource,
    /expandMobileLineTimetableDirections\(lid\)/,
    'mobile line screen should expand the selected line timetable directions'
);

assert.match(
    panelSource,
    /panelShell\.collapse\?\.\(\)/,
    'mobile line screen must half-collapse the panel for map context'
);

assert.match(
    cssSource,
    /data-panel-mobile-stack-screen='lineTimetable'[\s\S]*\.panel-company\.is-mobile-stack-dimmed-company[\s\S]*display:\s*none/,
    'mobile line timetable screen must hide non-active companies'
);

assert.match(
    cssSource,
    /data-panel-mobile-stack-screen='lineTimetable'[\s\S]*\.panel-line\.is-mobile-stack-dimmed-line[\s\S]*display:\s*none/,
    'mobile line timetable screen must hide non-active lines'
);

console.log('panel mobile line timetable smoke ok');
