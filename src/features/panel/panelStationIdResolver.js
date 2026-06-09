const defaultToText = (value) => String(value ?? '').trim();

export const resolvePanelStationIdForLine = async ({
    lineId = '',
    currentStationId = '',
    currentStationNameZh = '',
    getStationGroupsIndex = async () => new Map(),
    getStationsIndex = async () => ({ stationIdByRailwayAndNameZh: new Map() }),
    toText = defaultToText
} = {}) => {
    const routeId = toText(lineId);
    if (!routeId) return null;

    const stationId = toText(currentStationId);
    if (stationId && (stationId === routeId || stationId.startsWith(`${routeId}.`))) {
        return stationId;
    }

    try {
        const groupsIndex = await getStationGroupsIndex();
        const groupIds = stationId ? groupsIndex?.get?.(stationId) : null;
        if (Array.isArray(groupIds) && groupIds.length) {
            for (const candidate of groupIds) {
                const value = toText(candidate);
                if (!value) continue;
                if (value === routeId || value.startsWith(`${routeId}.`)) return value;
            }
        }
    } catch {
        // Preserve panel behavior: station-group lookup is best-effort.
    }

    const stationName = toText(currentStationNameZh);
    if (!stationName) return stationId || null;

    const stationsIndex = await getStationsIndex();
    const hit = stationsIndex?.stationIdByRailwayAndNameZh?.get?.(`${routeId}||${stationName}`);
    return hit || stationId || null;
};
