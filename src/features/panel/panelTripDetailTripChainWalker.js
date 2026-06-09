const defaultToText = (value) => String(value ?? '').trim();

export const collectPanelTripDetailTripChainByTrip = async ({
    startTrip = null,
    key = 'nt',
    loadTripByRefId = async () => null,
    isTokenCurrent = () => true,
    maxSteps = 24,
    toText = defaultToText
} = {}) => {
    const out = [];
    const seenRefs = new Set();
    const seenTrips = new Set();
    let cursor = startTrip;

    for (let index = 0; index < maxSteps; index += 1) {
        const refs = Array.isArray(cursor?.[key]) ? cursor[key] : (cursor?.[key] ? [cursor[key]] : []);
        const refId = toText(refs?.[0]);
        if (!refId) break;
        if (seenRefs.has(refId)) break;
        seenRefs.add(refId);

        const refTrip = await loadTripByRefId(refId);
        if (!isTokenCurrent()) return null;
        if (!refTrip) break;

        const tripId = toText(refTrip?.id) || toText(refTrip?.t);
        if (tripId && seenTrips.has(tripId)) break;

        out.push(refTrip);
        if (tripId) seenTrips.add(tripId);

        cursor = refTrip;
    }

    return out;
};
