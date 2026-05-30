import assert from 'node:assert/strict';

import { readSourceFile } from './helpers/architectureBoundaryScanner.mjs';

const checklistPath = 'tests/fixtures/tok86E2EChecklist.md';
const checklist = readSourceFile(checklistPath);

const requiredSections = [
    'Search Plan Flow',
    'Panel Selection Flow',
    'Route-Map Flow',
    'Multi-Select Layer Flow',
    'Theme And Basemap Flow',
    'Architecture Gate Flow'
];

const requiredSignals = [
    'reachable-stops heatmap',
    'direction title marquee',
    'station indicator show/clear',
    'remove and toggle-visibility',
    'carto, ost, and transparent',
    'npm test'
];

for (const section of requiredSections) {
    assert.ok(
        checklist.includes(section),
        `${checklistPath} must include ${section}`
    );
}

for (const signal of requiredSignals) {
    assert.ok(
        checklist.includes(signal),
        `${checklistPath} must include smoke signal: ${signal}`
    );
}

assert.ok(
    checklist.includes('src/features/print/print.js'),
    `${checklistPath} must explicitly name the excluded print.js path`
);
assert.ok(
    checklist.includes('TOK-72'),
    `${checklistPath} must explicitly keep TOK-72 outside this gate`
);

console.log('refactor E2E checklist smoke ok');
