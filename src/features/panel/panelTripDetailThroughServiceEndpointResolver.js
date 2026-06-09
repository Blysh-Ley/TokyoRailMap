const defaultToText = (value) => String(value ?? '').trim();

const getFirstStationId = (value, toText = defaultToText) => {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    for (const item of list) {
        const stationId = toText(item);
        if (stationId) return stationId;
    }
    return '';
};

export const getPanelTripDetailStationIds = (value, {
    toText = defaultToText
} = {}) => {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    return Array.from(new Set(list.map((item) => toText(item)).filter(Boolean)));
};

const getTripId = (trip, toText = defaultToText) => {
    const id = toText(trip?.id);
    return id || null;
};

export const resolvePanelTripDetailThroughServiceEndpointIds = async ({
    trip = null,
    loadTripByRefId = async () => null,
    toText = defaultToText
} = {}) => {
    const visited = new Set();

    let originId = getFirstStationId(trip?.os, toText);
    let cursor = trip;
    while (cursor) {
        const cursorId = getTripId(cursor, toText);
        if (cursorId) {
            if (visited.has(cursorId)) break;
            visited.add(cursorId);
        }

        const refs = Array.isArray(cursor?.pt) ? cursor.pt : (cursor?.pt ? [cursor.pt] : []);
        const refId = toText(refs?.[0]);
        if (!refId) break;

        const previousTrip = await loadTripByRefId(refId);
        if (!previousTrip) break;

        const previousOrigin = getFirstStationId(previousTrip?.os, toText);
        if (previousOrigin) originId = previousOrigin;
        cursor = previousTrip;
    }

    const followTerminalByNextRef = async ({
        startRefId,
        fallbackTerminalId
    } = {}) => {
        const seen = new Set();
        let terminalId = toText(fallbackTerminalId);
        let refId = toText(startRefId);

        while (refId) {
            if (seen.has(refId)) break;
            seen.add(refId);

            const nextTrip = await loadTripByRefId(refId);
            if (!nextTrip) break;

            const nextDs = getPanelTripDetailStationIds(nextTrip?.ds, { toText });
            if (nextDs.length && (!terminalId || !nextDs.includes(terminalId))) {
                terminalId = nextDs[0];
            }

            const nextRefs = Array.isArray(nextTrip?.nt) ? nextTrip.nt : (nextTrip?.nt ? [nextTrip.nt] : []);
            refId = toText(nextRefs?.[0]);
        }

        return terminalId;
    };

    visited.clear();
    const dsList = getPanelTripDetailStationIds(trip?.ds, { toText });
    const ntRefs = (Array.isArray(trip?.nt) ? trip.nt : (trip?.nt ? [trip.nt] : []))
        .map((item) => toText(item))
        .filter(Boolean);

    let terminalIds = [];

    if (dsList.length >= 2) {
        const resolved = [];
        for (let index = 0; index < dsList.length; index += 1) {
            const fallbackTerminalId = dsList[index];
            const startRefId = ntRefs[index] || '';
            const traced = await followTerminalByNextRef({
                startRefId,
                fallbackTerminalId
            });
            if (traced) resolved.push(traced);
            else if (fallbackTerminalId) resolved.push(fallbackTerminalId);
        }
        terminalIds = Array.from(new Set(resolved.filter(Boolean)));
    } else {
        let terminalId = getFirstStationId(dsList, toText);
        cursor = trip;
        while (cursor) {
            const cursorId = getTripId(cursor, toText);
            if (cursorId) {
                if (visited.has(cursorId)) break;
                visited.add(cursorId);
            }

            const refs = Array.isArray(cursor?.nt) ? cursor.nt : (cursor?.nt ? [cursor.nt] : []);
            const refId = toText(refs?.[0]);
            if (!refId) break;

            const nextTrip = await loadTripByRefId(refId);
            if (!nextTrip) break;

            const nextTerminal = getFirstStationId(nextTrip?.ds, toText);
            if (nextTerminal) terminalId = nextTerminal;
            cursor = nextTrip;
        }
        terminalIds = terminalId ? [terminalId] : [];
    }

    const terminalId = terminalIds[0] || '';
    return { originId, terminalId, terminalIds };
};
