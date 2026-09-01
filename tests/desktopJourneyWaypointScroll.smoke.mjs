import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cssSource = readFileSync('src/styles/app.css', 'utf8');
const journeySource = readFileSync('src/features/search/travel-search-ui.js', 'utf8');
const desktopThresholdSelector = String.raw`html:not\(\[data-mobile-ui='1'\]\) \.search-ui\.is-planner-open\[data-waypoint-count\]:not\(\[data-waypoint-count='0'\]\):not\(\[data-waypoint-count='1'\]\):not\(\[data-waypoint-count='2'\]\):not\(\[data-waypoint-count='3'\]\):not\(\[data-waypoint-count='4'\]\):not\(\[data-waypoint-count='5'\]\)`;
const desktopFiveWaypointSelector = String.raw`html:not\(\[data-mobile-ui='1'\]\) \.search-ui\.is-planner-open\[data-waypoint-count\]:not\(\[data-waypoint-count='0'\]\):not\(\[data-waypoint-count='1'\]\):not\(\[data-waypoint-count='2'\]\):not\(\[data-waypoint-count='3'\]\):not\(\[data-waypoint-count='4'\]\)`;

assert.match(
    journeySource,
    /node\.dataset\.waypointCount = String\(count\)/,
    'the existing waypoint layout sync must publish the desktop threshold count'
);
assert.match(
    cssSource,
    new RegExp(`${desktopThresholdSelector}[^,{]*\\{[^}]*--desktop-search-waypoint-scroll-height:\\s*calc\\([^}]*var\\(--search-expanded-panel-height\\)[^}]*var\\(--search-row-height\\)[^}]*--desktop-search-waypoint-scroll-width:\\s*min\\(320px, calc\\(100vw - 72px\\)\\);[^}]*width:\\s*var\\(--desktop-search-waypoint-scroll-width\\);[^}]*max-height:\\s*var\\(--desktop-search-waypoint-scroll-height\\);[^}]*padding-right:\\s*0;[^}]*border-radius:\\s*var\\(--search-panel-radius\\);[^}]*overflow-y:\\s*auto;[^}]*overscroll-behavior-y:\\s*contain;`, 's'),
    'desktop planners with 6+ waypoint rows must keep five rows visible and scroll the frosted card'
);
assert.match(
    cssSource,
    new RegExp(`${desktopThresholdSelector}::before[^{}]*\\{[^}]*height:\\s*var\\(--search-planner-card-height\\);[^}]*width:\\s*100%;`, 's'),
    'the desktop frosted shell must cover all scrollable planner content and align with the clipping edge'
);
assert.match(
    cssSource,
    new RegExp(`${desktopThresholdSelector} > \\.journey-ui > \\.journey-results,[^{}]*${desktopThresholdSelector} > \\.journey-ui > \\.journey-plan-results[^{}]*\\{[^}]*position:\\s*fixed;[^}]*top:\\s*calc\\(10px \\+ var\\(--desktop-search-waypoint-scroll-height\\) \\+ 8px\\);[^}]*width:\\s*var\\(--desktop-search-waypoint-scroll-width\\);[^}]*margin-top:\\s*0;[^}]*margin-left:\\s*0;`, 's'),
    'desktop candidate and route result panels must stay outside the planner scroll clipping area'
);
assert.doesNotMatch(
    cssSource,
    new RegExp(`${desktopFiveWaypointSelector}(?=\\s*[,\\{])`),
    'five desktop waypoint rows must keep the existing non-scrolling planner layout'
);

console.log('desktop journey waypoint scroll smoke ok');
