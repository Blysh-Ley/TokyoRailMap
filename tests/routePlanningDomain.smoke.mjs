import assert from 'node:assert/strict';

import {
    createNextDayFallbackPlanningBase,
    formatBusinessDateInputValue,
    formatDuration,
    getBusinessDateParts,
    getDisplayServiceDayStartMs,
    getNextCalendarDayServiceStartMs,
    getNextServiceDayStartMs,
    getJapanServiceDayStartMs,
    getServiceDayStartMs,
    hhmmToOffsetMinutes,
    inferServiceDayFromDate,
    normalizeHHMM,
    parseDisplayHHMMToMs,
    parseHHMMToServiceDayMs,
    readBusinessTimezoneMode,
    TIMEZONE_MODE_JAPAN,
    TIMEZONE_MODE_LOCAL,
    toHHMMForTimezone
} from '../src/domain/routePlanning/time.js';
import {
    distanceMeters,
    isLngLatCoord,
    isWithinDistanceMeters
} from '../src/domain/routePlanning/geo.js';
import {
    extractLineIdFromTripId,
    getTripBaseKey,
    getTripCanonicalId,
    getTripFileNameByLineId,
    normalizeRefArray,
    normalizeText,
    parseTripServiceDayFromId
} from '../src/domain/routePlanning/text.js';
import {
    DEFAULT_TRANSFER_PENALTY_MS,
    calculateTransferPenaltyMs,
    parseStopId
} from '../src/domain/routePlanning/transfer.js';
import {
    dedupePlans,
    isSurchargeTypeId,
    markPlansWithSurcharge,
    pickPlanBuckets,
    planContainsSurcharge,
    sortPlansByArrivalThenDuration
} from '../src/domain/routePlanning/candidates.js';
import {
    buildDisplayPlanFromExpandedLegs,
    buildRailPreviewSegment,
    buildTripPreviewPayloadFromSegments,
    compactStationIds,
    countDisplayPlanTransfers,
    resolveAlternateRoutePlanningStationIdentity,
    rewriteTripPreviewSegmentsForAlternateMembership,
    rowsToCompactStationIds
} from '../src/domain/routePlanning/displayRows.js';

const assertNear = (actual, expected, tolerance, message) => {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
};

const testTimeHelpers = () => {
    assert.equal(normalizeHHMM('7:5'), '07:05');
    assert.equal(normalizeHHMM('24:00'), '');
    assert.equal(hhmmToOffsetMinutes('03:00'), 0);
    assert.equal(hhmmToOffsetMinutes('02:30'), 1410);
    assert.equal(formatDuration(-1), '\u7528\u65f6--');
    assert.equal(readBusinessTimezoneMode(), TIMEZONE_MODE_LOCAL);

    const tokyoNine = Date.UTC(2026, 0, 2, 0, 0, 0);
    assert.equal(toHHMMForTimezone(tokyoNine, { timezoneMode: TIMEZONE_MODE_JAPAN }), '09:00');
    assert.equal(toHHMMForTimezone(tokyoNine, { timezoneMode: TIMEZONE_MODE_LOCAL }), `${String(new Date(tokyoNine).getHours()).padStart(2, '0')}:00`);
    if (new Date(tokyoNine).getTimezoneOffset() === -480) {
        assert.equal(toHHMMForTimezone(tokyoNine, { timezoneMode: TIMEZONE_MODE_LOCAL }), '08:00');
    }

    const serviceStartMs = getServiceDayStartMs(Date.parse('2026-01-01T17:30:00Z'));
    assert.equal(serviceStartMs, Date.parse('2025-12-31T18:00:00Z'));
    assert.equal(serviceStartMs, getJapanServiceDayStartMs(Date.parse('2026-01-01T17:30:00Z')));

    const parsedTokyoNine = parseHHMMToServiceDayMs('09:00', getServiceDayStartMs(tokyoNine));
    assert.equal(parsedTokyoNine.ms, tokyoNine);

    const localDisplayStart = getDisplayServiceDayStartMs(tokyoNine, { timezoneMode: TIMEZONE_MODE_LOCAL });
    const localDisplayParsed = parseDisplayHHMMToMs(toHHMMForTimezone(tokyoNine, { timezoneMode: TIMEZONE_MODE_LOCAL }), {
        referenceMs: tokyoNine,
        timezoneMode: TIMEZONE_MODE_LOCAL
    });
    assert.equal(localDisplayParsed.serviceDayStartMs, localDisplayStart);
    assert.equal(localDisplayParsed.ms, tokyoNine);

    assert.deepEqual(
        getBusinessDateParts(tokyoNine, { timezoneMode: TIMEZONE_MODE_JAPAN }),
        { year: 2026, month: 1, day: 2, hour: 9, minute: 0, second: 0, dayOfWeek: 5 }
    );
    assert.equal(formatBusinessDateInputValue(tokyoNine, { timezoneMode: TIMEZONE_MODE_JAPAN }), '2026-01-02');

    const nextStart = getNextServiceDayStartMs(Date.parse('2026-01-02T14:30:00Z'));
    assert.equal(nextStart, Date.parse('2026-01-02T18:00:00Z'));

    const nextStartBeforeBoundary = getNextServiceDayStartMs(Date.parse('2026-01-01T17:30:00Z'));
    assert.equal(nextStartBeforeBoundary, Date.parse('2026-01-01T18:00:00Z'));

    const nextCalendarStartBeforeBoundary = getNextCalendarDayServiceStartMs(Date.parse('2026-01-01T17:30:00Z'));
    assert.equal(nextCalendarStartBeforeBoundary, Date.parse('2026-01-02T18:00:00Z'));

    assert.equal(inferServiceDayFromDate(Date.UTC(2026, 0, 2, 15), { timezoneMode: TIMEZONE_MODE_JAPAN }), 'SaturdayHoliday');
    assert.equal(inferServiceDayFromDate(Date.UTC(2026, 0, 4, 15), { isHoliday: () => true, timezoneMode: TIMEZONE_MODE_JAPAN }), 'SaturdayHoliday');
    assert.equal(inferServiceDayFromDate(Date.UTC(2026, 11, 29, 15), { timezoneMode: TIMEZONE_MODE_JAPAN }), 'SaturdayHoliday');
    assert.equal(inferServiceDayFromDate(Date.UTC(2026, 0, 5, 15), { timezoneMode: TIMEZONE_MODE_JAPAN }), 'Weekday');

    const fallback = createNextDayFallbackPlanningBase({
        departureMs: Date.parse('2026-01-02T14:30:00Z')
    });
    assert.equal(fallback.departureMs, Date.parse('2026-01-02T18:00:00Z'));
    assert.equal(fallback.serviceDay, 'SaturdayHoliday');

    const fallbackBeforeBoundary = createNextDayFallbackPlanningBase({
        departureMs: Date.parse('2026-01-01T17:30:00Z')
    });
    assert.equal(fallbackBeforeBoundary.departureMs, Date.parse('2026-01-02T18:00:00Z'));
    assert.equal(fallbackBeforeBoundary.serviceDay, 'SaturdayHoliday');
};

const testGeoHelpers = () => {
    assert.equal(isLngLatCoord([139.767, 35.681]), true);
    assert.equal(isLngLatCoord(['x', 35.681]), false);
    assertNear(distanceMeters([139.767, 35.681], [139.767, 35.682]), 111, 2, 'lat distance');
    assert.equal(isWithinDistanceMeters({
        coordA: [139.767, 35.681],
        coordB: [139.767, 35.682],
        maxDistanceMeters: 120
    }), true);
};

const testTextHelpers = () => {
    assert.equal(normalizeText('  abc  '), 'abc');
    assert.equal(parseTripServiceDayFromId('JR.Yamanote.001.Weekday.2'), 'Weekday');
    assert.equal(parseTripServiceDayFromId('JR.Yamanote.001.SaturdayHoliday'), 'SaturdayHoliday');
    assert.equal(getTripBaseKey({ id: 'JR.Line.Trip.Weekday.3' }), 'JR.Line.Trip');
    assert.deepEqual(normalizeRefArray([' a ', '', 'b']), ['a', 'b']);
    assert.equal(getTripCanonicalId({ rawTripId: 'raw', tripId: 'trip' }), 'raw');
    assert.equal(getTripFileNameByLineId(' JR.Line '), 'JR.Line.json');
    assert.equal(extractLineIdFromTripId('JR.Line.Trip.Weekday.3'), 'JR.Line');
};

const testTransferHelpers = () => {
    assert.deepEqual(parseStopId('JR.Yamanote.Tokyo'), {
        company: 'JR',
        line: 'Yamanote',
        station: 'Tokyo'
    });
    assert.equal(calculateTransferPenaltyMs({ distanceMeters: Number.NaN }), DEFAULT_TRANSFER_PENALTY_MS);
    assert.equal(calculateTransferPenaltyMs({
        distanceMeters: 0,
        fromStopInfo: parseStopId('JR.A.Tokyo'),
        toStopInfo: parseStopId('JR.B.Tokyo')
    }), 2 * 60 * 1000);
    assert.equal(calculateTransferPenaltyMs({
        distanceMeters: 10,
        fromStopInfo: parseStopId('JR.A.Tokyo'),
        toStopInfo: parseStopId('Metro.B.Tokyo')
    }), 10 * 60 * 1000);
};

const testCandidateHelpers = () => {
    const p1 = {
        legs: [{ lineId: 'A', typeId: 'local' }],
        firstDepMs: 60000,
        arrivalMs: 180000,
        durationMs: 120000,
        transfers: 0
    };
    const p2 = {
        legs: [{ lineId: 'A', typeId: 'local' }],
        firstDepMs: 60000,
        arrivalMs: 180000,
        durationMs: 120000,
        transfers: 0
    };
    const p3 = {
        legs: [{ lineId: 'B', typeId: 'limited' }],
        firstDepMs: 30000,
        arrivalMs: 240000,
        durationMs: 210000,
        transfers: 1
    };

    assert.equal(dedupePlans([p1, p2, p3]).length, 2);
    assert.equal(sortPlansByArrivalThenDuration([p3, p1])[0], p1);
    assert.equal(isSurchargeTypeId({ typeId: 'limited.express' }), true);
    assert.equal(isSurchargeTypeId({ typeId: 'limited.express', explicitSurcharge: false }), false);
    assert.equal(planContainsSurcharge({
        plan: p3,
        isTypeIdSurcharge: (typeId) => typeId === 'limited'
    }), true);

    markPlansWithSurcharge({
        plans: [p1, p3],
        hasSurcharge: (plan) => plan === p3
    });
    assert.equal(p1.hasSurcharge, false);
    assert.equal(p3.hasSurcharge, true);
    assert.ok(pickPlanBuckets([p1, p3]).length >= 1);
};

const testDisplayRowsHelpers = () => {
    assert.deepEqual(compactStationIds(['A', 'A', '', 'B']), ['A', 'B']);
    assert.deepEqual(rowsToCompactStationIds([
        { stationId: 'A' },
        { stationId: 'A' },
        { stationId: 'C' }
    ]), ['A', 'C']);

    const segment = buildRailPreviewSegment({
        lineId: 'L1',
        stationIds: ['A', 'A', 'B'],
        direction: 'North',
        typeColor: '#123456'
    });
    assert.deepEqual(segment, {
        kind: 'main',
        lineId: 'L1',
        stationIds: ['A', 'B'],
        d: 'North',
        typeColor: '#123456'
    });

    const payload = buildTripPreviewPayloadFromSegments({
        row: { originStationId: 'A' },
        displayPlan: {
            legs: [{ tripKey: 'trip-1', typeName: 'Local' }],
            firstDepMs: 0,
            arrivalMs: 60000
        },
        segments: [segment],
        toHHMM: (ms) => String(ms)
    });
    assert.equal(payload.mainLineId, 'L1');
    assert.equal(payload.terminalStationId, 'B');
    assert.equal(payload.fitMode, 'preview');

    const pairKey = (lineId, stationId) => `${lineId}\u0000${stationId}`;
    const alternateLineMembership = {
        alternateLineIdByLineStationId: new Map([
            [pairKey('SRC', 'SRC.A'), 'ALT'],
            [pairKey('SRC', 'SRC.C'), 'ALT']
        ]),
        alternateStationIdByLineStationId: new Map([
            [pairKey('SRC', 'SRC.A'), 'ALT.A'],
            [pairKey('SRC', 'SRC.C'), 'ALT.C']
        ])
    };

    assert.deepEqual(
        resolveAlternateRoutePlanningStationIdentity({
            alternateLineMembership,
            lineId: 'SRC',
            stationId: 'SRC.A'
        }),
        { lineId: 'ALT', stationId: 'ALT.A' }
    );

    assert.deepEqual(
        rewriteTripPreviewSegmentsForAlternateMembership({
            alternateLineMembership,
            hasStationId: () => true,
            segments: [{ kind: 'main', lineId: 'SRC', stationIds: ['SRC.A', 'SRC.B'] }]
        }).map(({ lineId, stationIds }) => ({ lineId, stationIds })),
        [
            { lineId: 'ALT', stationIds: ['ALT.A'] },
            { lineId: 'SRC', stationIds: ['SRC.B'] }
        ]
    );

    assert.deepEqual(
        rewriteTripPreviewSegmentsForAlternateMembership({
            alternateLineMembership,
            hasStationId: () => true,
            segments: [{ kind: 'main', lineId: 'SRC', stationIds: ['SRC.A', 'SRC.C'] }]
        }).map(({ lineId, stationIds }) => ({ lineId, stationIds })),
        [
            { lineId: 'ALT', stationIds: ['ALT.A', 'ALT.C'] }
        ]
    );

    assert.equal(countDisplayPlanTransfers({
        expandedLegs: [{ id: 1 }, { id: 2 }, { id: 3 }],
        isThroughLegPairByMeta: ({ currentLeg }) => currentLeg.id === 1
    }), 1);

    const displayPlan = buildDisplayPlanFromExpandedLegs({
        plan: { firstDepMs: 0, arrivalMs: 60000, durationMs: 60000 },
        row: { __walkOriginMinutes: 1, __walkDestinationMinutes: 1 },
        expandedLegs: [{ depMs: 0 }, { arrMs: 60000 }],
        sections: [],
        isThroughLegPairByMeta: () => false
    });
    assert.equal(displayPlan.arrivalMs, 120000);
    assert.equal(displayPlan.durationMs, 240000);
    assert.equal(displayPlan.transfers, 1);
};

testTimeHelpers();
testGeoHelpers();
testTextHelpers();
testTransferHelpers();
testCandidateHelpers();
testDisplayRowsHelpers();

console.log('route planning domain smoke ok');
