const defaultToText = (value) => String(value ?? '').trim();

export const findPanelTripByKey = async ({
    lineId = '',
    tripKey = '',
    currentLineGroupByMainId = new Map(),
    currentServiceDay = '',
    getRefLineId = () => '',
    loadTimetableForLineId = async () => null,
    parseTripServiceDayFromId = () => '',
    toText = defaultToText
} = {}) => {
    const key = toText(tripKey);
    if (!key) return null;

    const normalizedLineId = toText(lineId);
    const grouped = currentLineGroupByMainId instanceof Map
        ? currentLineGroupByMainId.get(normalizedLineId)
        : null;
    const candidateLineIds = Array.from(new Set([
        toText(getRefLineId(key)),
        normalizedLineId,
        ...((Array.isArray(grouped) ? grouped : [])
            .map((value) => toText(value))
            .filter(Boolean))
    ].filter(Boolean)));
    if (!candidateLineIds.length) return null;

    let fallback = null;
    for (const candidateLineId of candidateLineIds) {
        const data = await loadTimetableForLineId(candidateLineId);
        const list = Array.isArray(data) ? data : [];
        if (!list.length) continue;

        const candidates = list.filter((trip) => {
            const id = toText(trip?.id);
            const tkey = toText(trip?.t);
            if (id === key || tkey === key) return true;
            return id ? id.startsWith(`${key}.`) : false;
        });
        if (!candidates.length) continue;

        const withDay = candidates.find((trip) => parseTripServiceDayFromId(trip?.id) === currentServiceDay);
        if (withDay) return withDay;
        if (!fallback) fallback = candidates[0] || null;
    }

    return fallback;
};
