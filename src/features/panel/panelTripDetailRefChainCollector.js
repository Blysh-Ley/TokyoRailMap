const defaultToText = (value) => String(value ?? '').trim();

const normalizeStepKey = (key) => (key === 'pt' ? 'pt' : 'nt');

const readNextRefs = (trip, stepKey, toText) => (
    (Array.isArray(trip?.[stepKey]) ? trip[stepKey] : (trip?.[stepKey] ? [trip[stepKey]] : []))
        .map((value) => toText(value))
        .filter(Boolean)
);

const walkPanelTripDetailRefChain = async ({
    startRefId = '',
    key = 'nt',
    loadTripByRefId = async () => null,
    isTokenCurrent = () => true,
    maxSteps = 24,
    onTrip = () => undefined,
    toText = defaultToText
} = {}) => {
    const stepKey = normalizeStepKey(key);
    const seenRefs = new Set();
    const seenTrips = new Set();
    let refId = toText(startRefId);

    for (let index = 0; index < maxSteps; index += 1) {
        if (!refId) break;
        if (seenRefs.has(refId)) break;
        seenRefs.add(refId);

        const refTrip = await loadTripByRefId(refId);
        if (!isTokenCurrent()) return null;
        if (!refTrip) break;

        const tripId = toText(refTrip?.id) || toText(refTrip?.t);
        if (tripId && seenTrips.has(tripId)) break;
        if (tripId) seenTrips.add(tripId);

        const nextRefs = readNextRefs(refTrip, stepKey, toText);
        const next = onTrip(refTrip, nextRefs);
        if (next?.done) return next.value;

        refId = nextRefs[0] || '';
    }

    return onTrip(null, null)?.finalValue;
};

export const collectPanelTripDetailRefChainTripsFromRef = async ({
    startRefId = '',
    key = 'nt',
    loadTripByRefId = async () => null,
    isTokenCurrent = () => true,
    maxSteps = 24,
    toText = defaultToText
} = {}) => {
    const out = [];
    const result = await walkPanelTripDetailRefChain({
        startRefId,
        key,
        loadTripByRefId,
        isTokenCurrent,
        maxSteps,
        toText,
        onTrip: (trip) => {
            if (!trip) return { finalValue: out };
            out.push(trip);
            return undefined;
        }
    });
    return result;
};

export const resolvePanelTripDetailFirstMultiRefsAlongChain = async ({
    startRefId = '',
    key = 'nt',
    loadTripByRefId = async () => null,
    isTokenCurrent = () => true,
    maxSteps = 24,
    toText = defaultToText
} = {}) => {
    const result = await walkPanelTripDetailRefChain({
        startRefId,
        key,
        loadTripByRefId,
        isTokenCurrent,
        maxSteps,
        toText,
        onTrip: (_trip, nextRefs) => {
            if (!nextRefs) return { finalValue: [] };
            if (nextRefs.length >= 2) {
                return { done: true, value: nextRefs };
            }
            return undefined;
        }
    });
    if (result === null) return null;
    return Array.isArray(result) ? result : [];
};
