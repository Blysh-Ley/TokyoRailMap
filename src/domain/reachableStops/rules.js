export const REACHABLE_STOPS_RULES = Object.freeze({
    planningSlackMinutes: 5,
    minLastMileWalkMinutes: 5,
    maxLastMileWalkMinutes: 20,
    walkingMetersPerMinute: 50,
    maxWaitMinutes: 30,
    maxTransferCount: 3,
    originGroupMaxDistanceMeters: 800,
    bucketCount: 15
});

export const REACHABLE_STOPS_SERVICE_DAYS = Object.freeze([
    'Weekday',
    'SaturdayHoliday'
]);

export const normalizeReachableStopsServiceDay = (value) => (
    String(value ?? '').trim() === 'SaturdayHoliday'
        ? 'SaturdayHoliday'
        : 'Weekday'
);

const toFiniteNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

export const getReachableStopsPlanningBudgetMinutes = (selectedMinutes) => {
    const requested = toFiniteNumber(selectedMinutes);
    if (requested == null) return null;
    return requested + REACHABLE_STOPS_RULES.planningSlackMinutes;
};

export const getReachableStopsLastMileWalkMinutes = (remainingMinutes) => {
    const remaining = toFiniteNumber(remainingMinutes);
    const safeRemaining = remaining == null ? 0 : remaining;
    return Math.min(
        REACHABLE_STOPS_RULES.maxLastMileWalkMinutes,
        Math.max(REACHABLE_STOPS_RULES.minLastMileWalkMinutes, safeRemaining)
    );
};

export const getReachableStopsLastMileRadiusMeters = (remainingMinutes) => (
    getReachableStopsLastMileWalkMinutes(remainingMinutes) * REACHABLE_STOPS_RULES.walkingMetersPerMinute
);

export const getReachableStopsMaxEnvelopeMinutes = (selectedMinutes) => {
    const planningBudget = getReachableStopsPlanningBudgetMinutes(selectedMinutes);
    if (planningBudget == null) return null;
    return planningBudget + REACHABLE_STOPS_RULES.minLastMileWalkMinutes;
};

export const buildReachableStopsOpportunityMeta = ({
    minutes,
    serviceDay = 'Weekday'
} = {}) => ({
    metric: 'originDepartureOpportunity',
    requestedMinutes: Number(minutes),
    planningBudgetMinutes: getReachableStopsPlanningBudgetMinutes(minutes),
    maxEnvelopeMinutes: getReachableStopsMaxEnvelopeMinutes(minutes),
    serviceDay: normalizeReachableStopsServiceDay(serviceDay)
});
