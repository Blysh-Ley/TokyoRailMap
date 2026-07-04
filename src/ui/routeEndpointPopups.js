const removePopup = (popup) => {
    try {
        popup?.remove?.();
    } catch {
        // keep popup cleanup non-fatal during preview transitions
    }
};

const removeMarker = (marker) => {
    try {
        marker?.remove?.();
    } catch {
        // keep marker cleanup non-fatal during preview transitions
    }
};

export const createRouteEndpointPopupRuntime = ({
    mapEngine,
    getStationCoord,
    getIsDarkTheme = () => false,
    createJourneyPickPinElement = null,
    onTripEndpointPinStationIdsChange = () => {},
    documentRef = document
} = {}) => {
    if (!mapEngine) {
        throw new Error('routeEndpointPopupRuntime requires mapEngine');
    }

    let tripOriginPopups = [];
    let tripTerminalPopups = [];
    let tripEndpointMarkers = [];
    let dirOriginPopups = [];
    let dirTerminalPopups = [];
    let tripEndpointRenderToken = 0;

    const resolveStationCoord = (stationId) => {
        const sid = String(stationId || '').trim();
        if (!sid) return null;
        const coord = getStationCoord?.(sid);
        return Array.isArray(coord) && coord.length >= 2 ? coord : null;
    };

    const normalizeStationIds = (value) => {
        const list = value instanceof Set
            ? Array.from(value)
            : (Array.isArray(value) ? value : []);
        const out = [];
        const seen = new Set();
        for (const item of list) {
            const sid = String(item || '').trim();
            if (!sid || seen.has(sid)) continue;
            seen.add(sid);
            out.push(sid);
        }
        return out;
    };

    const buildEndpointCountsByStationId = (counts) => {
        const out = new Map();
        for (const item of Array.isArray(counts) ? counts : []) {
            const stationId = String(item?.stationId || '').trim();
            if (!stationId) continue;
            out.set(stationId, {
                originCount: Number(item?.originCount || 0),
                terminalCount: Number(item?.terminalCount || 0)
            });
        }
        return out;
    };

    const notifyTripEndpointPinStationIdsChange = (idsByType = {}) => {
        try {
            onTripEndpointPinStationIdsChange(idsByType);
        } catch {
            // keep endpoint marker rendering independent from label-position updates
        }
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
        el.style.fontSize = '10px';
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
        tripEndpointRenderToken += 1;
        for (const popup of tripOriginPopups) removePopup(popup);
        for (const popup of tripTerminalPopups) removePopup(popup);
        for (const marker of tripEndpointMarkers) removeMarker(marker);
        tripOriginPopups = [];
        tripTerminalPopups = [];
        tripEndpointMarkers = [];
        notifyTripEndpointPinStationIdsChange();
    };

    const createEndpointPin = async ({ stationId, type = 'destination' } = {}) => {
        const coord = resolveStationCoord(stationId);
        if (!coord || typeof createJourneyPickPinElement !== 'function') return null;

        const token = tripEndpointRenderToken;
        try {
            const element = await createJourneyPickPinElement({ type });
            if (token !== tripEndpointRenderToken) return null;
            const marker = mapEngine.createMarker({ element, anchor: 'bottom', offset: [0, 0] })
                .setLngLat(coord);
            mapEngine.addMarker(marker);
            return marker;
        } catch {
            return null;
        }
    };

    const updateTripEndpointPopups = (startStationId, endStationId, options = {}) => {
        clearTripEndpointPopups();

        const startId = String(startStationId || '').trim();
        const endId = String(endStationId || '').trim();
        const displayMode = String(options?.displayMode || '').trim();

        if (displayMode === 'endpoints-list') {
            const originIds = normalizeStationIds(options?.originStationIds);
            const terminalIds = normalizeStationIds(options?.terminalStationIds);
            if (!originIds.length && !terminalIds.length) return;

            const countsByStationId = buildEndpointCountsByStationId(options?.endpointLabelCounts);
            const buildLabel = (stationId, role) => {
                const counts = countsByStationId.get(stationId) || {};
                const count = role === 'origin'
                    ? Number(counts.originCount || 0)
                    : Number(counts.terminalCount || 0);
                const label = role === 'origin' ? '始发' : '终点';
                return count > 0 ? `${label}(${count})` : `${label}站`;
            };
            const originIdSet = new Set(originIds);

            tripOriginPopups = originIds
                .map((stationId) => createEndpointPopup({
                    stationId,
                    text: buildLabel(stationId, 'origin'),
                    color: '#1A9B2D',
                    yOffset: 10
                }))
                .filter(Boolean);
            tripTerminalPopups = terminalIds
                .map((stationId) => createEndpointPopup({
                    stationId,
                    text: buildLabel(stationId, 'terminal'),
                    color: '#D32F2F',
                    yOffset: originIdSet.has(stationId) ? 30 : 10
                }))
                .filter(Boolean);
            return;
        }

        if (!startId && !endId) return;

        if (displayMode === 'destination-pin-only') {
            if (!endId) return;
            const token = tripEndpointRenderToken;
            createEndpointPin({ stationId: endId, type: 'destination' }).then((marker) => {
                if (!marker) return;
                if (token !== tripEndpointRenderToken) {
                    removeMarker(marker);
                    return;
                }
                tripEndpointMarkers = [marker];
                notifyTripEndpointPinStationIdsChange({ destination: endId });
            });
            return;
        }

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
