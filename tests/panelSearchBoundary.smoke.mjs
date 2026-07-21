import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoPattern } from './helpers/architectureBoundaryScanner.mjs';
import { buildStationResultGroupMetaMap } from '../src/features/search/search.js';

const root = process.cwd();
const travelSearchSource = readFileSync(join(root, 'src/features/search/travel-search-ui.js'), 'utf8');

const searchUiFiles = [
    'src/features/search/search.js',
    'src/features/search/travel-search-ui.js',
    'src/features/search/journeyPlanRenderer.js'
];

const panelFiles = [
    'src/features/panel/panel.js',
    'src/features/panel/panelCatalogShell.js',
    'src/features/panel/panelCatalogShell.js',
    'src/features/panel/panelCatalogShell.js',
    'src/features/panel/panelInteractionCore.js',
    'src/features/panel/panelInteractionView.js',
    'src/features/panel/panelInteractionView.js',
    'src/features/panel/panelInteractionCore.js',
    'src/features/panel/panelInteractionCore.js',
    'src/features/panel/panelInteractionView.js',
    'src/features/panel/panelInteractionCore.js',
    'src/features/panel/panelExport.js',
    'src/features/panel/panelInteractionCore.js',
    'src/features/panel/panelCatalogShell.js',
    'src/features/panel/panelTimetableUi.js',
    'src/features/panel/panelTripDetailRender.js',
    'src/features/panel/panelTimetableCore.js',
    'src/features/panel/panelInteractionCore.js',
    'src/features/panel/panelTimetableCore.js'
];

assertNoPattern({
    files: searchUiFiles,
    pattern: /\bnew\s+maplibregl\b|\bmaplibregl\.(?!popup\b)|\.(setPaintProperty|setFilter|addLayer|addSource|removeLayer|removeSource|queryRenderedFeatures)\s*\(/,
    message: 'search UI files must not call raw MapLibre APIs'
});

assertNoPattern({
    files: panelFiles,
    pattern: /from\s+['"].*(routePlanning|services\/mapEngine|createMapEngine|mapEngine)['"]|require\([^)]*(routePlanning|services\/mapEngine|createMapEngine|mapEngine)/,
    message: 'panel files must not import route planning or mapEngine dependencies directly'
});

{
    const syncPlanPinsBody = travelSearchSource.match(/const syncJourneyPickPinsForPlanRow = async \(row\) => \{([\s\S]*?)\n    \};/)?.[1] || '';
    assert.match(
        syncPlanPinsBody,
        /journeyPickController\.clearPin\(\)/,
        'journey result display must reset pick pins before drawing result pins'
    );
    assert.doesNotMatch(
        syncPlanPinsBody,
        /showStationPin\(\{\s*stationId:\s*originStationId[\s\S]*type:\s*'origin'/,
        'journey result display must not show an origin pin'
    );
    assert.match(
        syncPlanPinsBody,
        /showStationPin\(\{\s*stationId:\s*destinationStationId[\s\S]*type:\s*'destination'/,
        'journey result display must keep showing the destination pin'
    );
    assert.match(
        syncPlanPinsBody,
        /label:\s*`途径点\$\{index \+ 1\}`[\s\S]*type:\s*`waypoint-result-\$\{index \+ 1\}`/,
        'waypoint journey result pins must show numbered waypoint labels'
    );
    assert.doesNotMatch(
        syncPlanPinsBody,
        /showCoordinatePin/,
        'waypoint journey result pins should keep station-backed pins so labels and station pin tracking remain stable'
    );
}

{
    const waypointProgressBody = travelSearchSource.match(/const updateWaypointSegmentProgressMessage = \(\{([\s\S]*?)\n    \};/)?.[1] || '';
    assert.match(
        waypointProgressBody,
        /journey-plan-empty/,
        'waypoint segment progress should update the calculating message'
    );
    assert.doesNotMatch(
        waypointProgressBody,
        /renderPlanResults|highlightAllPlanResults|syncJourneyPlanVisibility/,
        'waypoint segment progress must not render or highlight partial result rows'
    );

    const waypointComputeBody = travelSearchSource.match(/const maybeComputeWaypointPlans = async \(\) => \{([\s\S]*?)\n    \};/)?.[1] || '';
    assert.match(
        waypointComputeBody,
        /onSegmentComplete:\s*\(\{ endpointList, segmentRows \}\) => \{[\s\S]*updateWaypointSegmentProgressMessage/,
        'waypoint planning should only update progress text while segments are still computing'
    );
}

{
    const renderPlanResultsBody = travelSearchSource.match(/const renderPlanResults = async \(rows\) => \{([\s\S]*?)\n    \};/)?.[1] || '';
    assert.match(
        renderPlanResultsBody,
        /await highlightAllPlanResults\(rows\);[\s\S]*syncJourneyPlanVisibility\(currentPlanPage, \{ force: true \}\);[\s\S]*await syncCurrentJourneyPickPins\(\);/,
        'journey result pins should sync after final result highlighting has settled'
    );
    assert.doesNotMatch(
        travelSearchSource.match(/const showCurrentPage = async \(\) => \{([\s\S]*?)\n    \};/)?.[1] || '',
        /syncJourneyPickPinsForPlanRow|syncCurrentJourneyPickPins/,
        'showCurrentPage should not draw journey pins before preview highlighting'
    );
}

const lineIdsOf = (meta) => Array.isArray(meta?.lineIds) ? meta.lineIds.slice().sort() : [];

{
    const map = buildStationResultGroupMetaMap([
        [
            ['A.Red.Shared'],
            ['B.Blue.Shared', 'C.Green.Shared']
        ]
    ]);

    const first = map.get('A.Red.Shared');
    const second = map.get('B.Blue.Shared');
    const third = map.get('C.Green.Shared');

    assert.ok(first);
    assert.equal(first.clusterKey, second.clusterKey);
    assert.equal(first.clusterKey, third.clusterKey);
    assert.equal(first.primaryId, 'A.Red.Shared');
    assert.deepEqual(lineIdsOf(first), ['A.Red', 'B.Blue', 'C.Green']);
}

{
    const map = buildStationResultGroupMetaMap([
        [
            ['JR-East.Yamanote.Yurakucho', 'JR-East.KeihinTohokuNegishi.Yurakucho'],
            ['TokyoMetro.Yurakucho.Yurakucho'],
            ['Toei.Mita.Hibiya'],
            ['TokyoMetro.Chiyoda.Hibiya']
        ]
    ]);

    const yurakucho = map.get('JR-East.Yamanote.Yurakucho');
    const yurakuchoMetro = map.get('TokyoMetro.Yurakucho.Yurakucho');
    const hibiya = map.get('Toei.Mita.Hibiya');
    const hibiyaMetro = map.get('TokyoMetro.Chiyoda.Hibiya');
    const allGroupLineIds = [
        'JR-East.KeihinTohokuNegishi',
        'JR-East.Yamanote',
        'Toei.Mita',
        'TokyoMetro.Chiyoda',
        'TokyoMetro.Yurakucho'
    ];

    assert.ok(yurakucho);
    assert.ok(hibiya);
    assert.equal(yurakucho.clusterKey, yurakuchoMetro.clusterKey);
    assert.equal(hibiya.clusterKey, hibiyaMetro.clusterKey);
    assert.notEqual(yurakucho.clusterKey, hibiya.clusterKey);
    assert.equal(yurakucho.primaryId, 'JR-East.Yamanote.Yurakucho');
    assert.equal(hibiya.primaryId, 'Toei.Mita.Hibiya');
    assert.deepEqual(lineIdsOf(yurakucho), allGroupLineIds);
    assert.deepEqual(lineIdsOf(hibiya), allGroupLineIds);
}

console.log('panel/search boundary smoke ok');
