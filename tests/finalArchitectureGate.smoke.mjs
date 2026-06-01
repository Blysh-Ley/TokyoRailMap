import assert from 'node:assert/strict';

import { readSourceFile } from './helpers/architectureBoundaryScanner.mjs';

const packageJson = JSON.parse(readSourceFile('package.json'));
const testScript = String(packageJson?.scripts?.test || '');
const budgetSource = readSourceFile('tests/uiArchitectureBudgets.smoke.mjs');
const checklist = readSourceFile('tests/fixtures/tok86E2EChecklist.md');

const requiredTestEntries = [
    'tests/architectureBoundaryScanner.smoke.mjs',
    'tests/uiArchitectureBudgets.smoke.mjs',
    'tests/refactorE2EChecklist.smoke.mjs',
    'tests/finalArchitectureGate.smoke.mjs',
    'tests/panelSearchBoundary.smoke.mjs',
    'tests/panelShellContentBoundary.smoke.mjs',
    'tests/panelCrossFeatureBridgeController.smoke.mjs'
];

for (const entry of requiredTestEntries) {
    assert.ok(
        testScript.includes(entry),
        `npm test must include ${entry}`
    );
}

const budgetedUiFiles = [
    'src/features/panel/panel.js',
    'src/features/panel/panelShellDesktop.js',
    'src/features/panel/panelContentHost.js',
    'src/features/search/search.js',
    'src/features/search/travel-search-ui.js',
    'src/features/route-map/route-map-ui.js',
    'src/features/menu/menu.js'
];

for (const file of budgetedUiFiles) {
    assert.ok(
        budgetSource.includes(file),
        `UI architecture budget must include ${file}`
    );
}

const excludedPrintPaths = [
    'src/features/print/print.js',
    'src/features/print/print-timetables.js',
    'src/features/print/mul-select.js'
];

for (const file of excludedPrintPaths) {
    assert.equal(
        budgetSource.includes(file),
        false,
        `UI architecture budget must exclude legacy print path ${file}`
    );
}

assert.ok(
    checklist.includes('structural `src/features/print/print.js` work'),
    'E2E checklist must state print.js structural work is excluded'
);
assert.ok(
    checklist.includes('TOK-72'),
    'E2E checklist must state TOK-72 is outside this gate'
);

console.log('final architecture gate smoke ok');
