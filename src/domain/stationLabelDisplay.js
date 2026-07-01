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

export const buildTerminalStationIdSet = (railways = []) => {
    const ids = new Set();
    if (!Array.isArray(railways)) return ids;

    for (const railway of railways) {
        const stations = Array.isArray(railway?.stations)
            ? railway.stations.map((stationId) => String(stationId || '').trim()).filter(Boolean)
            : [];
        if (!stations.length) continue;
        ids.add(stations[0]);
        ids.add(stations[stations.length - 1]);
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
