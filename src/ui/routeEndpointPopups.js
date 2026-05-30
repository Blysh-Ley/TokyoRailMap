const removePopup = (popup) => {
    try {
        popup?.remove?.();
    } catch {
        // keep popup cleanup non-fatal during preview transitions
    }
};

export const createRouteEndpointPopupRuntime = ({
    mapEngine,
    getStationCoord,
    getIsDarkTheme = () => false,
    documentRef = document
} = {}) => {
    if (!mapEngine) {
        throw new Error('routeEndpointPopupRuntime requires mapEngine');
    }

    let tripOriginPopups = [];
    let tripTerminalPopups = [];
    let dirOriginPopups = [];
    let dirTerminalPopups = [];

    const resolveStationCoord = (stationId) => {
        const sid = String(stationId || '').trim();
        if (!sid) return null;
        const coord = getStationCoord?.(sid);
        return Array.isArray(coord) && coord.length >= 2 ? coord : null;
    };

    const createEndpointPopup = ({ stationId, text, color, yOffset = 8 } = {}) => {
        const coord = resolveStationCoord(stationId);
        if (!coord) return null;

        const role = String(text || '').includes('始发')
            ? 'origin'
            : (String(text || '').includes('终点') ? 'terminal' : 'normal');
        const isDarkTheme = getIsDarkTheme?.() === true;
        const resolvedColor = role === 'origin'
            ? (isDarkTheme ? '#59e37d' : (color || '#1A9B2D'))
            : role === 'terminal'
                ? (isDarkTheme ? '#ff6b6b' : (color || '#D32F2F'))
                : String(color || '#111');

        const el = documentRef.createElement('div');
        el.style.fontSize = '12px';
        el.style.fontWeight = '700';
        el.style.lineHeight = '1.2';
        el.style.color = resolvedColor;
        if (role === 'origin') el.classList.add('trip-endpoint-origin');
        if (role === 'terminal') el.classList.add('trip-endpoint-terminal');
        el.textContent = String(text || '');

        const popup = mapEngine.createPopup({
            closeButton: false,
            closeOnClick: false,
            closeOnMove: false,
            anchor: 'top',
            offset: [0, yOffset],
            className: 'trip-endpoint-popup'
        })
            .setLngLat(coord)
            .setDOMContent(el);
        mapEngine.addPopup(popup);
        return popup;
    };

    const clearTripEndpointPopups = () => {
        for (const popup of tripOriginPopups) removePopup(popup);
        for (const popup of tripTerminalPopups) removePopup(popup);
        tripOriginPopups = [];
        tripTerminalPopups = [];
    };

    const updateTripEndpointPopups = (startStationId, endStationId) => {
        clearTripEndpointPopups();

        const startId = String(startStationId || '').trim();
        const endId = String(endStationId || '').trim();
        if (!startId && !endId) return;

        const originPopup = createEndpointPopup({
            stationId: startId,
            text: '始发站',
            color: '#1A9B2D',
            yOffset: 8
        });
        const terminalPopup = createEndpointPopup({
            stationId: endId,
            text: '终点站',
            color: '#D32F2F',
            yOffset: startId && endId && startId === endId ? 30 : 8
        });

        tripOriginPopups = originPopup ? [originPopup] : [];
        tripTerminalPopups = terminalPopup ? [terminalPopup] : [];
    };

    const clearDirEndpointPopups = () => {
        for (const popup of dirOriginPopups) removePopup(popup);
        for (const popup of dirTerminalPopups) removePopup(popup);
        dirOriginPopups = [];
        dirTerminalPopups = [];
    };

    return {
        clearTripEndpointPopups,
        updateTripEndpointPopups,
        clearDirEndpointPopups,
        createDirEndpointPopup: createEndpointPopup,
        addDirOriginPopup: (popup) => {
            if (popup) dirOriginPopups.push(popup);
        },
        addDirTerminalPopup: (popup) => {
            if (popup) dirTerminalPopups.push(popup);
        }
    };
};
