import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
    assertNoPattern,
    readSourceFile
} from './helpers/architectureBoundaryScanner.mjs';

const panelDir = 'src/features/panel';
const panelFiles = readdirSync(join(process.cwd(), panelDir))
    .filter((name) => name.endsWith('.js'))
    .map((name) => `${panelDir}/${name}`)
    .sort();

const rawMapLibrePattern = /\bnew\s+maplibregl\b|\bmaplibregl\.(?!popup\b)|\.(setPaintProperty|setFilter|addLayer|addSource|removeLayer|removeSource|queryRenderedFeatures|querySourceFeatures)\s*\(/;
const planningOrMapEnginePattern = /from\s+['"].*(routePlanning|travel-search-planner|journeyComputeOrchestrator|services\/mapEngine|createMapEngine|mapEngine)['"]|require\([^)]*(routePlanning|travel-search-planner|journeyComputeOrchestrator|services\/mapEngine|createMapEngine|mapEngine)/;
const shellBusinessImportPattern = /from\s+['"].*(\.\.\/\.\.\/(?:domain|lib|map|services|store)\/|\.\.\/(?:search|route-map|hover|highlight|layer|print)\/)['"]|require\([^)]*(\.\.\/\.\.\/(?:domain|lib|map|services|store)\/|\.\.\/(?:search|route-map|hover|highlight|layer|print)\/)/;
const shellGlobalBridgePattern = /\bwindow\.(?:TokyoRail|__TokyoRail)|\bCustomEvent\b|\bwindow\.dispatchEvent\b|\bwindow\.addEventListener\b/;
const shellContentFiles = [
    'src/features/panel/panelCatalogShell.js',
    'src/features/panel/panelCatalogShell.js',
    'src/features/panel/panelCatalogShell.js'
];

assertNoPattern({
    files: panelFiles,
    pattern: rawMapLibrePattern,
    message: 'panel files must not call raw MapLibre APIs'
});

assertNoPattern({
    files: panelFiles,
    pattern: planningOrMapEnginePattern,
    message: 'panel files must not import routePlanning, journey planners, or mapEngine'
});

assertNoPattern({
    files: shellContentFiles,
    pattern: shellBusinessImportPattern,
    message: 'panel shell/content API files must not import business feature, domain, service, store, map, lib, or print modules'
});

assertNoPattern({
    files: shellContentFiles,
    pattern: shellGlobalBridgePattern,
    message: 'panel shell/content API files must not own TokyoRail window bridges or global event bridges'
});

const panelSource = readSourceFile('src/features/panel/panel.js');
const contentApiSource = readSourceFile('src/features/panel/panelCatalogShell.js');
const shellSource = readSourceFile('src/features/panel/panelCatalogShell.js');
const contentHostSource = readSourceFile('src/features/panel/panelCatalogShell.js');
const packageJson = JSON.parse(readSourceFile('package.json'));
const testScript = String(packageJson?.scripts?.test || '');
const budgetSource = readSourceFile('tests/uiArchitectureBudgets.smoke.mjs');

assert.ok(
    contentApiSource.includes('export const createPanelContentApi'),
    'mobile-readiness gate requires reusable createPanelContentApi export'
);
assert.ok(
    contentApiSource.includes('export const composePanelShellWithContent'),
    'mobile-readiness gate requires reusable shell/content composition export'
);
assert.equal(
    /createDesktopPanelShell|panelShellDesktop/.test(contentApiSource),
    false,
    'panel content API must not import or depend on the desktop shell'
);
assert.ok(
    panelSource.includes('createPanelContentApi()') && panelSource.includes('composePanelShellWithContent'),
    'desktop createPanel must compose through the reusable content API'
);
assert.equal(
    panelSource.includes("from './panelCatalogShell.js'"),
    false,
    'desktop createPanel must not bypass the reusable content API by importing panelContentHost directly'
);
assert.ok(
    shellSource.includes('getClickRegion') && shellSource.includes('layout') && shellSource.includes('show()') && shellSource.includes('hide()'),
    'desktop shell must remain a shell lifecycle/placement boundary'
);
assert.ok(
    contentHostSource.includes("panel.className = 'panel-container'") && contentHostSource.includes('mount(host)'),
    'content host must remain the reusable panel content root boundary'
);
assert.ok(
    testScript.includes('tests/panelFinalDecouplingGate.smoke.mjs'),
    'npm test must include the final panel decoupling gate'
);
assert.equal(
    budgetSource.includes('src/features/print/print.js'),
    false,
    'print.js remains outside this panel structural gate'
);

console.log('panel final decoupling gate smoke ok');
