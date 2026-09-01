import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cssSource = readFileSync('src/styles/app.css', 'utf8');
const journeySource = readFileSync('src/features/search/travel-search-ui.js', 'utf8');
const thresholdSelector = String.raw`\.search-ui\.is-planner-open\[data-waypoint-count\]:not\(\[data-waypoint-count='0'\]\):not\(\[data-waypoint-count='1'\]\):not\(\[data-waypoint-count='2'\]\)`;

assert.match(
    journeySource,
    /node\.dataset\.waypointCount = String\(count\)/,
    'the existing waypoint layout sync must publish every added or removed row count'
);
assert.match(
    cssSource,
    new RegExp(`\[data-mobile-ui='1'\][^,{]*${thresholdSelector}[^{]*\\{[^}]*--mobile-search-waypoint-scroll-height:[^}]*100vh[^}]*--mobile-search-waypoint-scroll-height:[^}]*100dvh[^}]*right:\\s*calc\\(12px \\+ 52px\\);[^}]*max-height:\\s*var\\(--mobile-search-waypoint-scroll-height\\);[^}]*padding-right:\\s*0;[^}]*border-radius:\\s*var\\(--search-panel-radius\\);[^}]*overflow-y:\\s*auto;[^}]*overscroll-behavior-y:\\s*contain;`, 's'),
    'mobile planners with 3+ waypoint rows must cap at the two-waypoint height and scroll the whole search shell'
);
assert.match(
    cssSource,
    new RegExp(`${thresholdSelector}::before[^{}]*\\{[^}]*height:\\s*var\\(--mobile-search-planner-height\\);[^}]*width:\\s*100%;`, 's'),
    'the frosted shell must cover the scrollable planner and align its corner with the clipping edge'
);
assert.match(
    cssSource,
    new RegExp(`@media \\(min-width: 600px\\)[^{]*\\{[^{}]*${thresholdSelector}[^{}]*\\{[^}]*right:\\s*auto;[^}]*width:\\s*calc\\(var\\(--mobile-foldable-pane-width\\) - 52px\\);[^}]*max-width:\\s*calc\\(var\\(--mobile-foldable-pane-width\\) - 52px\\);`, 's'),
    'foldable mobile layouts must keep the scroll clipping edge aligned with the frosted planner corner'
);
assert.match(
    cssSource,
    new RegExp(`${thresholdSelector} > \\.journey-ui > \\.journey-results[^{}]*\\{[^}]*bottom:\\s*calc\\([^}]*var\\(--mobile-search-waypoint-scroll-height\\)`, 's'),
    'station candidates must stay directly above the capped visible planner height'
);
assert.doesNotMatch(
    cssSource,
    new RegExp(`html:not\\(\\[data-mobile-ui='1'\\]\\)[^,{]*${thresholdSelector}(?=\\s*[,\\{])`),
    'desktop planner scrolling must remain unchanged'
);

console.log('mobile journey waypoint scroll smoke ok');
