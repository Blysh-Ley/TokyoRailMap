export const STATION_LABEL_MODES = Object.freeze({
    OFF: 'off',
    FOCUS: 'focus',
    AUTO: 'auto',
    ALL: 'all'
});

export const normalizeStationLabelMode = (mode) => {
    const value = String(mode || '').trim().toLowerCase();
    if (value === STATION_LABEL_MODES.OFF) return STATION_LABEL_MODES.OFF;
    if (value === STATION_LABEL_MODES.FOCUS) return STATION_LABEL_MODES.FOCUS;
    if (value === STATION_LABEL_MODES.ALL) return STATION_LABEL_MODES.ALL;
    return STATION_LABEL_MODES.AUTO;
};

export const buildTerminalStationIdSet = (railways = [], {
    shouldSkipStation
} = {}) => {
    const ids = new Set();
    if (!Array.isArray(railways)) return ids;
    const shouldSkip = typeof shouldSkipStation === 'function'
        ? shouldSkipStation
        : null;

    for (const railway of railways) {
        const lineId = String(railway?.id || '').trim();
        const stations = Array.isArray(railway?.stations)
            ? railway.stations.map((stationId) => String(stationId || '').trim()).filter(Boolean)
            : [];
        if (!stations.length) continue;

        const isSkipped = (stationId, index) => {
            if (!shouldSkip) return false;
            try {
                return shouldSkip(stationId, { railway, lineId, index }) === true;
            } catch {
                return false;
            }
        };

        let firstIndex = 0;
        while (firstIndex < stations.length && isSkipped(stations[firstIndex], firstIndex)) firstIndex += 1;

        let lastIndex = stations.length - 1;
        while (lastIndex >= firstIndex && isSkipped(stations[lastIndex], lastIndex)) lastIndex -= 1;

        if (firstIndex > lastIndex) continue;
        ids.add(stations[firstIndex]);
        ids.add(stations[lastIndex]);
    }

    return ids;
};

export const isTerminalStationLabel = (stationLike = {}) => (
    Number(stationLike?.isTerminalStation ?? stationLike?.properties?.is_terminal_station ?? stationLike?.props?.is_terminal_station) === 1
    || stationLike?.isTerminalStation === true
    || stationLike?.properties?.is_terminal_station === true
    || stationLike?.props?.is_terminal_station === true
);

export const isTransferStationLabel = (stationLike = {}) => (
    Number(stationLike?.priority ?? stationLike?.properties?.priority ?? stationLike?.props?.priority ?? 0) > 1
);

export const getFocusedStationLabelPriority = (stationLike = {}) => {
    if (isTerminalStationLabel(stationLike)) return 2;
    if (isTransferStationLabel(stationLike)) return 1;
    return 0;
};

export const shouldShowFocusedStationLabel = (stationLike = {}) => (
    getFocusedStationLabelPriority(stationLike) > 0
);

export const buildDirectionEndpointLabelCounts = (rows, {
    getOriginStationIds,
    getTerminalStationIds,
    toText = (value) => String(value ?? '').trim()
} = {}) => {
    const countsByStationId = new Map();
    const list = Array.isArray(rows) ? rows : [];
    const readOriginIds = typeof getOriginStationIds === 'function' ? getOriginStationIds : () => [];
    const readTerminalIds = typeof getTerminalStationIds === 'function' ? getTerminalStationIds : () => [];

    const normalizeIds = (value) => Array.from(new Set(
        (Array.isArray(value) ? value : [value])
            .map((item) => toText(item))
            .filter(Boolean)
    ));

    const addCount = (stationId, key) => {
        const sid = toText(stationId);
        if (!sid) return;
        const current = countsByStationId.get(sid) || { stationId: sid, originCount: 0, terminalCount: 0 };
        current[key] = Number(current[key] || 0) + 1;
        countsByStationId.set(sid, current);
    };

    for (const row of list) {
        for (const stationId of normalizeIds(readOriginIds(row))) {
            addCount(stationId, 'originCount');
        }
        for (const stationId of normalizeIds(readTerminalIds(row))) {
            addCount(stationId, 'terminalCount');
        }
    }

    return Array.from(countsByStationId.values());
};
