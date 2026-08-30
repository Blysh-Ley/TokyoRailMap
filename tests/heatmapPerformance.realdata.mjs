import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const timetableFetchCountByPath = new Map();

const localDataFetch = async (input) => {
    const raw = typeof input === 'string' ? input : input?.url;
    const url = new URL(raw, window.location.href);
    const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (relativePath.startsWith('data/train-timetables/')) {
        timetableFetchCountByPath.set(
            relativePath,
            (timetableFetchCountByPath.get(relativePath) || 0) + 1
        );
    }

    try {
        const body = await readFile(path.join(root, relativePath));
        return new Response(body, {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        return new Response('', { status: 404 });
    }
};

globalThis.window = {
    location: { href: 'http://tokyo-rail-map.local/index.html' },
    fetch: localDataFetch
};
globalThis.fetch = localDataFetch;

const importFromRoot = async (relativePath) => import(
    pathToFileURL(path.join(root, relativePath)).href
);

const [cacheModule, planner, legacyPlanner, runtime, palette] = await Promise.all([
    importFromRoot('src/lib/timetableCache.js'),
    importFromRoot('src/features/search/travel-search-planner-opportunity.js'),
    importFromRoot('src/features/search/travel-search-planner-raptor.js'),
    importFromRoot('src/features/search/reachableStopsRuntime.js'),
    importFromRoot('src/features/search/reachableStopsPalette.js')
]);

const { getGlobalTimetableCache } = cacheModule;
const {
    getReachableStopsByDepartureOpportunity,
    getReachableStopsOpportunityCacheStats,
    invalidateReachableStopsOpportunityCache
} = planner;
const { getReachableStopsWithinMinutes: getLegacyReachableStopsWithinMinutes } = legacyPlanner;
const { buildReachableStopsOverlayGeoJSON } = runtime;
const { REACHABLE_STOPS_COLOR_STOPS } = palette;

assert.equal(typeof getReachableStopsByDepartureOpportunity, 'function');
assert.equal(typeof getLegacyReachableStopsWithinMinutes, 'function');
assert.equal(typeof getReachableStopsOpportunityCacheStats, 'function');
assert.equal(typeof invalidateReachableStopsOpportunityCache, 'function');

const timetableCache = getGlobalTimetableCache({
    maxBytes: 512 * 1024 * 1024,
    logFetch: false,
    logDiscover: false
});

const stationRows = JSON.parse(await readFile(path.join(root, 'data/stations.json'), 'utf8'));
const stationCoordById = new Map(
    (Array.isArray(stationRows) ? stationRows : [])
        .map((station) => [String(station?.id || '').trim(), station?.coord])
        .filter(([stationId, coord]) => (
            stationId &&
            Array.isArray(coord) &&
            coord.length >= 2 &&
            Number.isFinite(Number(coord[0])) &&
            Number.isFinite(Number(coord[1]))
        ))
        .map(([stationId, coord]) => [stationId, [Number(coord[0]), Number(coord[1])]])
);

const samples = Object.freeze([
    {
        name: 'Tokyo 30m',
        originStationId: 'JR-East.Yamanote.Tokyo',
        minutes: 30
    },
    {
        name: 'Tokyo 60m',
        originStationId: 'JR-East.Yamanote.Tokyo',
        minutes: 60
    },
    {
        name: 'ChibaMinato 30m',
        originStationId: 'ChibaMonorail.Line1.ChibaMinato',
        minutes: 30
    },
    {
        name: 'Disney ResortGateway 30m',
        originStationId: 'Disney.DisneyResortLine.ResortGateway',
        minutes: 30
    }
]);

const HOT_RUN_COUNT = 3;
const LEGACY_BASELINE_RUN_COUNT = 3;
const MAX_TOP_STOP_SATURATION_PERCENT = 5;
const MAX_SINGLE_BAND_PERCENT = 50;

const roundMs = (value) => Number(Number(value).toFixed(2));
const roundMiB = (bytes) => Number((Number(bytes) / (1024 * 1024)).toFixed(2));

const captureMemoryUsage = () => {
    const usage = process.memoryUsage();
    return {
        rssMiB: roundMiB(usage.rss),
        heapTotalMiB: roundMiB(usage.heapTotal),
        heapUsedMiB: roundMiB(usage.heapUsed),
        externalMiB: roundMiB(usage.external),
        arrayBuffersMiB: roundMiB(usage.arrayBuffers)
    };
};

const summarizeRunMemory = (runs) => {
    const rows = Array.isArray(runs) ? runs : [];
    const afterRows = rows.map((run) => run.memoryAfter).filter(Boolean);
    return {
        beforeFirstRun: rows[0]?.memoryBefore || null,
        afterLastRun: rows.at(-1)?.memoryAfter || null,
        peakAfterRunRssMiB: afterRows.length
            ? Math.max(...afterRows.map((memory) => memory.rssMiB))
            : null,
        peakAfterRunHeapUsedMiB: afterRows.length
            ? Math.max(...afterRows.map((memory) => memory.heapUsedMiB))
            : null
    };
};

const percentile = (values, fraction) => {
    const sorted = values
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    if (!sorted.length) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
    return sorted[index];
};

const normalizeResultForHash = (result) => ({
    meta: result?.meta || null,
    reachableStops: Array.from(result?.reachableStops || []).map(String).sort(),
    remainingMsByStop: Array.from(
        result?.remainingMsByStop instanceof Map
            ? result.remainingMsByStop.entries()
            : []
    )
        .map(([stationId, circles]) => [
            String(stationId),
            (Array.isArray(circles) ? circles : [])
                .map((circle) => ({
                    count: Number(circle?.departureOpportunityCount ?? circle?.count ?? circle?.shiftCount) || 0,
                    remainMs: Number(circle?.remainMs) || 0,
                    tripId: String(circle?.tripId || '')
                }))
                .sort((a, b) => (
                    b.remainMs - a.remainMs ||
                    a.count - b.count ||
                    a.tripId.localeCompare(b.tripId)
                ))
        ])
        .sort(([a], [b]) => a.localeCompare(b))
});

const hashResult = (result) => createHash('sha256')
    .update(JSON.stringify(normalizeResultForHash(result)))
    .digest('hex');

const getTimetableFetchStats = () => ({
    fileCount: timetableFetchCountByPath.size,
    requestCount: Array.from(timetableFetchCountByPath.values())
        .reduce((sum, count) => sum + count, 0)
});

const getCountBandLabel = (count) => {
    const stops = REACHABLE_STOPS_COLOR_STOPS;
    let bandIndex = 0;
    for (let index = 0; index < stops.length; index += 1) {
        if (count < stops[index]) break;
        bandIndex = index;
    }
    const lower = stops[bandIndex];
    const upper = stops[bandIndex + 1];
    return Number.isFinite(upper) ? `${lower}-${upper - 1}` : `>=${lower}`;
};

const summarizeDistribution = (result) => {
    const { geojson } = buildReachableStopsOverlayGeoJSON({
        payload: result,
        getStationCoord: (stationId) => stationCoordById.get(stationId) || null,
        theme: 'light'
    });
    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    const counts = features
        .map((feature) => Number(feature?.properties?.departureOpportunityCount))
        .filter((count) => Number.isFinite(count) && count > 0);
    const bandCounts = new Map();
    for (const count of counts) {
        const label = getCountBandLabel(count);
        bandCounts.set(label, (bandCounts.get(label) || 0) + 1);
    }

    const topStop = REACHABLE_STOPS_COLOR_STOPS.at(-1);
    const topStopCount = counts.filter((count) => count >= topStop).length;
    const largestBandCount = Math.max(0, ...bandCounts.values());
    const denominator = counts.length || 1;

    return {
        featureCount: features.length,
        reachableStationCount: Array.from(result?.reachableStops || []).length,
        count: {
            min: counts.length ? Math.min(...counts) : null,
            p50: percentile(counts, 0.5),
            p90: percentile(counts, 0.9),
            max: counts.length ? Math.max(...counts) : null
        },
        bands: Object.fromEntries(bandCounts),
        topStop,
        topStopSaturationPercent: roundMs((topStopCount / denominator) * 100),
        largestBandPercent: roundMs((largestBandCount / denominator) * 100)
    };
};

const assertPaletteDistribution = (sampleName, distribution) => {
    assert.ok(distribution.featureCount > 0, `${sampleName} should render positive-count circles`);
    assert.ok(
        distribution.topStopSaturationPercent < MAX_TOP_STOP_SATURATION_PERCENT,
        `${sampleName} top-stop saturation must stay below ${MAX_TOP_STOP_SATURATION_PERCENT}%`
    );
    assert.ok(
        distribution.largestBandPercent < MAX_SINGLE_BAND_PERCENT,
        `${sampleName} largest single color band must stay below ${MAX_SINGLE_BAND_PERCENT}%`
    );
};

const timePlannerQuery = async ({ query, sample, includeServiceDay }) => {
    const memoryBefore = captureMemoryUsage();
    const startedAt = performance.now();
    const result = await query({
        originStationId: sample.originStationId,
        minutes: sample.minutes,
        ...(includeServiceDay ? { serviceDay: 'Weekday' } : {})
    });
    const durationMs = performance.now() - startedAt;
    const memoryAfter = captureMemoryUsage();
    return {
        durationMs,
        hash: hashResult(result),
        result,
        memoryBefore,
        memoryAfter
    };
};

const timeQuery = (sample) => timePlannerQuery({
    query: getReachableStopsByDepartureOpportunity,
    sample,
    includeServiceDay: true
});

const timeLegacyQuery = (sample) => timePlannerQuery({
    query: getLegacyReachableStopsWithinMinutes,
    sample,
    includeServiceDay: false
});

invalidateReachableStopsOpportunityCache();
const initialPlannerStats = getReachableStopsOpportunityCacheStats();
const initialBuildCount = Number(initialPlannerStats?.buildCount) || 0;

const cold = await timeQuery(samples[0]);
assert.ok(cold.result.reachableStops.length > 0, 'cold Tokyo query should return reachable stations');
assert.equal(cold.result.meta?.metric, 'originDepartureOpportunity');
const coldDistribution = summarizeDistribution(cold.result);
assertPaletteDistribution(`${samples[0].name} cold`, coldDistribution);

const plannerStatsAfterCold = getReachableStopsOpportunityCacheStats();
const timetableStatsAfterCold = timetableCache.stats();
const fetchStatsAfterCold = getTimetableFetchStats();
assert.equal(
    Number(plannerStatsAfterCold?.buildCount) - initialBuildCount,
    1,
    'the Weekday connection index should be built exactly once by the cold query'
);
assert.equal(plannerStatsAfterCold?.serviceDayCacheCount, 1);
assert.equal(
    plannerStatsAfterCold?.serviceDays?.find?.((entry) => entry?.serviceDay === 'Weekday')?.status,
    'ready'
);

console.log('[heatmap:perf] cold', JSON.stringify({
    sample: samples[0].name,
    durationMs: roundMs(cold.durationMs),
    hash: cold.hash,
    distribution: coldDistribution,
    memory: {
        before: cold.memoryBefore,
        after: cold.memoryAfter
    },
    plannerCache: plannerStatsAfterCold,
    timetableCache: timetableStatsAfterCold,
    timetableFetch: fetchStatsAfterCold
}));

let legacyTokyo30HotP50Ms = null;
let legacyBaselineReport = null;
try {
    const legacyWarmup = await timeLegacyQuery(samples[0]);
    assert.ok(
        legacyWarmup.result.reachableStops.length > 0,
        'legacy Tokyo 30m warmup should return reachable stations'
    );
    const legacyRuns = [];
    for (let runIndex = 0; runIndex < LEGACY_BASELINE_RUN_COUNT; runIndex += 1) {
        legacyRuns.push(await timeLegacyQuery(samples[0]));
    }
    for (const run of legacyRuns) {
        assert.equal(run.hash, legacyWarmup.hash, 'legacy Tokyo 30m should return a stable hot hash');
    }
    const legacyDurations = legacyRuns.map((run) => run.durationMs);
    legacyTokyo30HotP50Ms = percentile(legacyDurations, 0.5);
    legacyBaselineReport = {
        sample: samples[0].name,
        api: 'getReachableStopsWithinMinutes',
        method: 'same process; timetable cache prewarmed by V2 cold query; one untimed legacy warmup',
        helperShim: false,
        warmupMs: roundMs(legacyWarmup.durationMs),
        measuredRuns: LEGACY_BASELINE_RUN_COUNT,
        hotTimingsMs: legacyDurations.map(roundMs),
        hotP50Ms: roundMs(legacyTokyo30HotP50Ms),
        hash: legacyWarmup.hash,
        memory: summarizeRunMemory(legacyRuns)
    };
    console.log('[heatmap:perf] legacy-baseline', JSON.stringify(legacyBaselineReport));
} catch (error) {
    throw new Error(
        '[heatmap:perf] legacy Tokyo 30m baseline could not run through '
        + 'getReachableStopsWithinMinutes; comparison was intentionally aborted without '
        + `a synthetic fallback: ${error?.message || error}`,
        { cause: error }
    );
}

const timetableStatsBeforeHotQueries = timetableCache.stats();
const fetchStatsBeforeHotQueries = getTimetableFetchStats();

let v2Tokyo30HotP50Ms = null;
const reports = [];
for (const sample of samples) {
    const runs = [];
    for (let runIndex = 0; runIndex < HOT_RUN_COUNT; runIndex += 1) {
        runs.push(await timeQuery(sample));
    }

    const expectedHash = sample === samples[0] ? cold.hash : runs[0].hash;
    for (const run of runs) {
        assert.equal(run.hash, expectedHash, `${sample.name} should return a stable hash`);
    }

    const durations = runs.map((run) => run.durationMs);
    const hotP50Ms = percentile(durations, 0.5);
    const distribution = summarizeDistribution(runs[0].result);
    assertPaletteDistribution(`${sample.name} hot`, distribution);
    if (sample === samples[0]) v2Tokyo30HotP50Ms = hotP50Ms;
    const report = {
        sample: sample.name,
        hotTimingsMs: durations.map(roundMs),
        hotP50Ms: roundMs(hotP50Ms),
        hash: expectedHash,
        distribution,
        memory: summarizeRunMemory(runs)
    };
    reports.push(report);
    console.log('[heatmap:perf] hot', JSON.stringify(report));
}

assert.ok(Number.isFinite(legacyTokyo30HotP50Ms), 'legacy Tokyo 30m p50 must be measured');
assert.ok(Number.isFinite(v2Tokyo30HotP50Ms), 'V2 Tokyo 30m p50 must be measured');
assert.ok(
    v2Tokyo30HotP50Ms <= legacyTokyo30HotP50Ms,
    `V2 Tokyo 30m hot p50 ${roundMs(v2Tokyo30HotP50Ms)}ms must not exceed `
    + `legacy p50 ${roundMs(legacyTokyo30HotP50Ms)}ms`
);
const baselineComparison = {
    sample: samples[0].name,
    legacyHotP50Ms: roundMs(legacyTokyo30HotP50Ms),
    v2HotP50Ms: roundMs(v2Tokyo30HotP50Ms),
    deltaMs: roundMs(v2Tokyo30HotP50Ms - legacyTokyo30HotP50Ms),
    v2ToLegacyRatio: Number(
        (v2Tokyo30HotP50Ms / legacyTokyo30HotP50Ms).toFixed(4)
    ),
    passed: true
};
console.log('[heatmap:perf] baseline-comparison', JSON.stringify(baselineComparison));

const finalPlannerStats = getReachableStopsOpportunityCacheStats();
const finalTimetableStats = timetableCache.stats();
const finalFetchStats = getTimetableFetchStats();

assert.equal(
    Number(finalPlannerStats?.buildCount) - initialBuildCount,
    1,
    'hot queries must reuse the one Weekday connection index'
);
assert.deepEqual(
    finalPlannerStats,
    plannerStatsAfterCold,
    'planner cache shape and index diagnostics must remain stable across hot queries'
);
assert.deepEqual(
    finalTimetableStats,
    timetableStatsBeforeHotQueries,
    'timetable cache must not grow across hot queries'
);
assert.deepEqual(
    finalFetchStats,
    fetchStatsBeforeHotQueries,
    'hot queries must not fetch timetable files again'
);

console.log('[heatmap:perf] summary', JSON.stringify({
    coldMs: roundMs(cold.durationMs),
    hotRunsPerSample: HOT_RUN_COUNT,
    legacyBaseline: legacyBaselineReport,
    baselineComparison,
    reports,
    plannerCache: finalPlannerStats,
    timetableCache: finalTimetableStats,
    timetableFetch: finalFetchStats,
    finalMemory: captureMemoryUsage()
}));
console.log('heatmap real-data performance probe ok');
