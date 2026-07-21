import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createJourneyRuntimeAdapter } from '../src/features/search/journeyRuntimeAdapter.js';
import {
    computeJourneyResultRowsWithNextDayFallback,
    computeWaypointJourneySegments,
    computeWaypointJourneySegmentsWithNextDayFallback,
    createWaypointJourneyComputeKey,
    createPickedJourneyResultRows,
    createWaypointJourneyResultRow
} from '../src/features/search/journeyComputeOrchestrator.js';

{
    const runtime = {};
    const adapter = createJourneyRuntimeAdapter({ runtime, now: () => 1000 });

    adapter.resetMapPickRuntimeFlags();
    assert.equal(runtime.__TokyoRailJourneyMapPickActive, false);
    assert.equal(runtime.__TokyoRailSuppressStationSelectionUntil, 0);

    adapter.setMapPickActive(true);
    assert.equal(runtime.__TokyoRailJourneyMapPickActive, true);

    adapter.suppressStationSelectionOnce(700);
    assert.equal(runtime.__TokyoRailSuppressStationSelectionUntil, 1700);
}

{
    const calls = [];
    const runtime = {
        __TokyoRailMultiSelectInternalAPI: {
            setEnabledSilent: (enabled) => calls.push(['enabled', enabled]),
            setForbidClass: (enabled) => calls.push(['forbid', enabled])
        }
    };
    const adapter = createJourneyRuntimeAdapter({ runtime });

    adapter.setMultiSelectInternalMode(true);
    adapter.setMultiSelectInternalMode(false);

    assert.deepEqual(calls, [
        ['enabled', true],
        ['forbid', true],
        ['enabled', false],
        ['forbid', false]
    ]);
}

{
    const runtime = {};
    const adapter = createJourneyRuntimeAdapter({ runtime });
    const ui = { ok: true };

    adapter.publishJourneyUI(ui);
    assert.equal(adapter.getJourneyUI(), ui);
}

{
    const text = readFileSync(join(process.cwd(), 'src/features/search/travel-search-ui.js'), 'utf8');
    assert.doesNotMatch(text, /__TokyoRailJourneyMapPickActive|__TokyoRailSuppressStationSelectionUntil|__TokyoRailMultiSelectInternalAPI/);
}

{
    const plan = {
        legs: [
            { fromStop: 'Actual.Line2.A', toStop: 'Mid' },
            { fromStop: 'Mid', toStop: 'Actual.Line3.Z' }
        ]
    };
    const rows = createPickedJourneyResultRows({
        departureMs: 0,
        destinationId: 'Picked.Line1.Z',
        destinationInputText: 'Z',
        destinationSeeds: ['Picked.Line1.Z'],
        getStationNameById: (id) => id,
        normalizeText: (value) => String(value ?? '').trim(),
        originId: 'Picked.Line1.A',
        originInputText: 'A',
        originSeeds: ['Picked.Line1.A'],
        pairBestPlans: [plan],
        pairBestWrappers: [{
            plan,
            originStationId: 'Picked.Line1.A',
            destinationStationId: 'Picked.Line1.Z'
        }],
        pickPlanBuckets: (plans) => [{ plan: plans[0], label: 'recommended' }],
        serviceDay: 'Weekday'
    });

    assert.equal(rows[0].originStationId, 'Actual.Line2.A');
    assert.equal(rows[0].destinationStationId, 'Actual.Line3.Z');
}

{
    const normalizeText = (value) => String(value ?? '').trim();
    const getGroupStops = (stationId) => new Set([normalizeText(stationId)]);
    const filterNearbyStops = (_stationId, sourceStops) => sourceStops;
    const sameSet = (a, b) => [...(a || [])].sort().join('|') === [...(b || [])].sort().join('|');
    const getStationNameById = (id) => ({ A: '起点', B: '途径点', C: '终点', NearA: '附近起点' }[id] || id);
    const shouldBlockJourneyPlanning = ({ originStationId, destinationStationId }) => (
        normalizeText(originStationId) && normalizeText(originStationId) === normalizeText(destinationStationId)
    );
    const createCollectPlans = (calls) => async ({ baseDepartureMs, sourceStops, destinationStops }) => {
        const origin = [...sourceStops][0];
        const destination = [...destinationStops][0];
        calls.push({ baseDepartureMs, origin, destination });
        if (destination === 'NO_ROUTE') return [];
        const durationMs = destination === 'B' ? 600000 : 900000;
        return [{
            baseDepartureMs,
            durationMs,
            firstDepMs: baseDepartureMs,
            arrivalMs: baseDepartureMs + durationMs,
            transfers: destination === 'C' ? 1 : 0,
            legs: [{ fromStop: origin, toStop: destination, depMs: baseDepartureMs, arrMs: baseDepartureMs + durationMs }],
            sections: []
        }];
    };
    const baseOptions = (calls) => ({
        collectPlans: createCollectPlans(calls),
        departureMs: 1000000,
        filterNearbyStops,
        getGroupStops,
        getStationNameById,
        normalizeText,
        sameSet,
        serviceDay: 'Weekday',
        shouldBlockJourneyPlanning
    });

    const directCalls = [];
    const directProgress = [];
    const directResult = await computeWaypointJourneySegments({
        ...baseOptions(directCalls),
        endpoints: [
            { role: 'origin', inputText: '起点', stationId: 'A' },
            { role: 'destination', inputText: '终点', stationId: 'C' }
        ],
        onSegmentComplete: (event) => directProgress.push(event)
    });
    assert.equal(directResult.rows.length, 1);
    assert.equal(directProgress.length, 1);
    assert.equal(directProgress[0].isPartial, false);

    const waypointCalls = [];
    const waypointProgress = [];
    const endpoints = [
        { role: 'origin', inputText: '起点', stationId: 'A' },
        { role: 'waypoint', inputText: '途径点', stationId: 'B' },
        { role: 'destination', inputText: '终点', stationId: 'C' }
    ];
    const waypointResult = await computeWaypointJourneySegments({
        ...baseOptions(waypointCalls),
        endpoints,
        onSegmentComplete: (event) => waypointProgress.push(event)
    });
    const waypointRow = createWaypointJourneyResultRow({
        departureMs: 1000000,
        endpoints,
        getStationNameById,
        normalizeText,
        segmentRows: waypointResult.rows,
        serviceDay: 'Weekday'
    });
    assert.equal(waypointResult.rows.length, 2);
    assert.equal(waypointProgress[0].isPartial, true);
    assert.equal(waypointProgress[1].isPartial, false);
    assert.equal(waypointCalls[1].baseDepartureMs, waypointResult.rows[0].plan.arrivalMs);
    assert.equal(waypointRow.kind, 'waypointJourney');
    assert.deepEqual(waypointRow.waypointNames, ['途径点']);
    assert.deepEqual(waypointRow.waypointStationIds, ['B']);
    assert.deepEqual(waypointRow.waitMinutesByEndpoint, [0, 0, 0]);
    assert.equal(waypointRow.totalWaitMinutes, 0);

    const baseWaitKey = createWaypointJourneyComputeKey({
        departureMs: 1000000,
        endpoints,
        serviceDay: 'Weekday'
    });
    const changedWaitKey = createWaypointJourneyComputeKey({
        departureMs: 1000000,
        endpoints: endpoints.map((endpoint) => (
            endpoint.role === 'waypoint' ? { ...endpoint, waitMinutes: 15 } : endpoint
        )),
        serviceDay: 'Weekday'
    });
    assert.notEqual(baseWaitKey, changedWaitKey);

    const waitedCalls = [];
    const waitedEndpoints = [
        { role: 'origin', inputText: '起点', stationId: 'A', waitMinutes: 5 },
        { role: 'waypoint', inputText: '途径点', stationId: 'B', waitMinutes: 15 },
        { role: 'destination', inputText: '终点', stationId: 'C' }
    ];
    const waitedResult = await computeWaypointJourneySegments({
        ...baseOptions(waitedCalls),
        endpoints: waitedEndpoints
    });
    const waitedRow = createWaypointJourneyResultRow({
        departureMs: 1000000,
        endpoints: waitedEndpoints,
        getStationNameById,
        normalizeText,
        segmentRows: waitedResult.rows,
        serviceDay: 'Weekday'
    });
    assert.equal(waitedCalls[0].baseDepartureMs, 1000000 + 5 * 60000);
    assert.equal(waitedCalls[1].baseDepartureMs, waitedResult.rows[0].plan.arrivalMs + 15 * 60000);
    assert.deepEqual(waitedRow.waitMinutesByEndpoint, [5, 15, 0]);
    assert.equal(waitedRow.totalWaitMinutes, 20);

    const coordinateResult = await computeWaypointJourneySegments({
        ...baseOptions([]),
        endpoints: [
            { role: 'origin', inputText: '坐标', candidateIds: ['NearA'], candidateMeta: [{ stationId: 'NearA', walkMinutes: 4 }] },
            { role: 'destination', inputText: '终点', stationId: 'C' }
        ]
    });
    assert.equal(coordinateResult.rows[0].__walkOriginMinutes, 4);

    const duplicateResult = await computeWaypointJourneySegments({
        ...baseOptions([]),
        endpoints: [
            { role: 'origin', inputText: '起点', stationId: 'A' },
            { role: 'waypoint', inputText: '重复', stationId: 'A' },
            { role: 'destination', inputText: '终点', stationId: 'C' }
        ]
    });
    assert.equal(duplicateResult.errorMessage, '相邻站点不能相同');

    const noRouteResult = await computeWaypointJourneySegments({
        ...baseOptions([]),
        endpoints: [
            { role: 'origin', inputText: '起点', stationId: 'A' },
            { role: 'waypoint', inputText: '断点', stationId: 'NO_ROUTE' },
            { role: 'destination', inputText: '终点', stationId: 'C' }
        ]
    });
    assert.equal(noRouteResult.errorMessage, '第 1 段无可用路线');

    const fallbackStartMs = new Date(2026, 0, 3, 3, 0).getTime();
    const fallbackBaseDepartureMs = new Date(2026, 0, 2, 23, 30).getTime();
    const createFallbackPlan = ({ baseDepartureMs, origin, destination }) => ({
        baseDepartureMs,
        durationMs: 600000,
        firstDepMs: baseDepartureMs,
        arrivalMs: baseDepartureMs + 600000,
        transfers: 0,
        legs: [{ fromStop: origin, toStop: destination, depMs: baseDepartureMs, arrMs: baseDepartureMs + 600000 }],
        sections: []
    });
    const baseJourneyRowOptions = (collectPlans) => ({
        ...baseOptions([]),
        collectPlans,
        departureMs: fallbackBaseDepartureMs,
        destinationId: 'C',
        destinationInputText: '终点',
        destinationSeeds: ['C'],
        originId: 'A',
        originInputText: '起点',
        originSeeds: ['A'],
        pickPlanBuckets: (plans) => plans.map((plan, index) => ({ label: `方案${index + 1}`, plan })),
        serviceDay: 'Weekday'
    });

    const nextDayCalls = [];
    const nextDayResult = await computeJourneyResultRowsWithNextDayFallback(baseJourneyRowOptions(async ({ baseDepartureMs, sourceStops, destinationStops, serviceDay }) => {
        const origin = [...sourceStops][0];
        const destination = [...destinationStops][0];
        nextDayCalls.push({ baseDepartureMs, destination, origin, serviceDay });
        if (serviceDay !== 'SaturdayHoliday') return [];
        return [createFallbackPlan({ baseDepartureMs, origin, destination })];
    }));
    assert.equal(nextDayCalls.length, 2);
    assert.equal(nextDayCalls[0].serviceDay, 'Weekday');
    assert.equal(nextDayCalls[1].serviceDay, 'SaturdayHoliday');
    assert.equal(nextDayCalls[1].baseDepartureMs, fallbackStartMs);
    assert.equal(nextDayResult.usedNextDayFallback, true);
    assert.equal(nextDayResult.rows[0].isNextDayFallback, true);
    assert.equal(nextDayResult.rows[0].serviceDay, 'SaturdayHoliday');
    assert.equal(nextDayResult.rows[0].baseDepartureMs, fallbackStartMs);
    assert.equal(nextDayResult.rows[0].tagLabels[0], '次日最早');

    const beforeBoundaryFallbackStartMs = new Date(2026, 0, 3, 3, 0).getTime();
    const beforeBoundaryCalls = [];
    const beforeBoundaryResult = await computeJourneyResultRowsWithNextDayFallback({
        ...baseJourneyRowOptions(async ({ baseDepartureMs, sourceStops, destinationStops }) => {
            const origin = [...sourceStops][0];
            const destination = [...destinationStops][0];
            beforeBoundaryCalls.push({ baseDepartureMs, destination, origin });
            if (baseDepartureMs < beforeBoundaryFallbackStartMs) return [];
            return [createFallbackPlan({ baseDepartureMs, origin, destination })];
        }),
        departureMs: new Date(2026, 0, 2, 0, 2).getTime()
    });
    assert.equal(beforeBoundaryCalls.at(-1).baseDepartureMs, beforeBoundaryFallbackStartMs);
    assert.equal(beforeBoundaryResult.rows[0].baseDepartureMs, beforeBoundaryFallbackStartMs);

    const immediateCalls = [];
    const immediateResult = await computeJourneyResultRowsWithNextDayFallback(baseJourneyRowOptions(async ({ baseDepartureMs, sourceStops, destinationStops, serviceDay }) => {
        const origin = [...sourceStops][0];
        const destination = [...destinationStops][0];
        immediateCalls.push({ baseDepartureMs, destination, origin, serviceDay });
        return [createFallbackPlan({ baseDepartureMs, origin, destination })];
    }));
    assert.equal(immediateCalls.length, 1);
    assert.equal(immediateResult.usedNextDayFallback, undefined);
    assert.equal(immediateResult.rows[0].isNextDayFallback, undefined);

    const waypointFallbackCalls = [];
    const waypointFallbackResult = await computeWaypointJourneySegmentsWithNextDayFallback({
        ...baseOptions(waypointFallbackCalls),
        collectPlans: async ({ baseDepartureMs, sourceStops, destinationStops }) => {
            const origin = [...sourceStops][0];
            const destination = [...destinationStops][0];
            waypointFallbackCalls.push({ baseDepartureMs, destination, origin });
            if (baseDepartureMs < fallbackStartMs && destination === 'C') return [];
            return [createFallbackPlan({ baseDepartureMs, origin, destination })];
        },
        departureMs: fallbackBaseDepartureMs,
        endpoints,
        serviceDay: 'Weekday'
    });
    assert.equal(waypointFallbackResult.usedNextDayFallback, true);
    assert.equal(waypointFallbackResult.rows.length, 2);
    assert.equal(waypointFallbackResult.rows[0].tagLabels[0], '次日最早');
    assert.equal(waypointFallbackCalls[0].origin, 'A');
    assert.equal(waypointFallbackCalls[0].destination, 'B');
    assert.equal(waypointFallbackCalls[1].origin, 'B');
    assert.equal(waypointFallbackCalls[1].destination, 'C');
    assert.equal(waypointFallbackCalls[2].origin, 'A');
    assert.equal(waypointFallbackCalls[2].destination, 'B');
    assert.equal(waypointFallbackCalls[2].baseDepartureMs, fallbackStartMs);
}
