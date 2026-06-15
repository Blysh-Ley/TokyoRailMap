import { mapClick } from '../../store/actions.js';

const STATION_INTERACTION_LAYER_IDS = ['stations-layer', 'station-labels-layer'];

const getExistingStationInteractionLayers = (mapEngine) => (
    STATION_INTERACTION_LAYER_IDS.filter((layerId) => mapEngine.hasLayer?.(layerId))
);

export const bindBlankMapClickRestore = ({
    mapEngine,
    store,
    touchTapGuard,
    isInFullscreenMode,
    isMultiSelectModeEnabled,
    hasActiveSelection,
    hidePanel,
    clearTripPathPreview,
    clearSelectionsAndRestore
} = {}) => {
    if (!mapEngine || typeof mapEngine.on !== 'function') {
        throw new Error('bindBlankMapClickRestore requires mapEngine');
    }

    mapEngine.on('click', (event) => {
        if (touchTapGuard?.allowTap?.(event?.originalEvent) === false) return;
        if (isInFullscreenMode?.() === true) return;

        const layers = [];
        if (mapEngine.hasLayer?.('lines-layer')) layers.push('lines-layer');
        layers.push(...getExistingStationInteractionLayers(mapEngine));

        const hits = layers.length
            ? (mapEngine.queryRenderedFeatures?.(event.point, { layers }) || [])
            : [];

        store?.dispatch?.(mapClick({
            source: 'mapInteractionController.bindBlankMapClickRestore',
            target: hits.length ? 'feature' : 'blank',
            point: event?.point ? { x: event.point.x, y: event.point.y } : null,
            lngLat: event?.lngLat ? { lng: event.lngLat.lng, lat: event.lngLat.lat } : null
        }));

        if (hits.length) return;

        hidePanel?.();
        if (isMultiSelectModeEnabled?.() !== true) {
            clearTripPathPreview?.();
        }

        if (hasActiveSelection?.() !== true) return;
        clearSelectionsAndRestore?.();
    });
};

export const bindLineClickSelect = ({
    mapEngine,
    touchTapGuard,
    resolveLineSelection,
    isMultiSelectModeEnabled,
    toggleBaseMultiSelection,
    getBaseMultiSelectedLineIds,
    setStationLabelMode,
    applySelectionEffects,
    commitLine,
    markActiveLine,
    fitToCurrentSelection,
    showRouteMapFloatingPanelForLine
} = {}) => {
    if (!mapEngine || typeof mapEngine.on !== 'function') {
        throw new Error('bindLineClickSelect requires mapEngine');
    }
    if (!mapEngine.hasLayer?.('lines-layer')) return;

    mapEngine.on('click', 'lines-layer', (event) => {
        if (touchTapGuard?.allowTap?.(event?.originalEvent) === false) return;

        const stationLayers = getExistingStationInteractionLayers(mapEngine);
        if (stationLayers.length) {
            const stationHits = mapEngine.queryRenderedFeatures?.(event.point, { layers: stationLayers }) || [];
            if (stationHits.length) return;
        }

        const feature = event?.features?.[0];
        const lineId = feature?.properties?.id ?? feature?.id;
        if (lineId == null) return;

        const rawLineId = String(lineId);
        const resolved = resolveLineSelection?.(rawLineId);
        const mainLineId = String(resolved?.mainLineId ?? rawLineId);
        const merged = Array.isArray(resolved?.mergedLineIds)
            ? resolved.mergedLineIds.map(String).filter(Boolean)
            : [mainLineId];

        if (isMultiSelectModeEnabled?.() === true) {
            toggleBaseMultiSelection?.(`line:${mainLineId}`, merged, 'line');
            if (getBaseMultiSelectedLineIds?.().size) setStationLabelMode?.('all');
            else setStationLabelMode?.('auto');
            applySelectionEffects?.();
            return;
        }

        const payload = commitLine?.(rawLineId);
        const nextLineId = String(payload?.selectedLineId || mainLineId);
        setStationLabelMode?.('all');
        markActiveLine?.(nextLineId);
        fitToCurrentSelection?.(`line:${nextLineId}`, 'commit');
        showRouteMapFloatingPanelForLine?.(rawLineId);
    });

    mapEngine.on('mouseenter', 'lines-layer', () => {
        mapEngine.setCursor?.('pointer');
    });
    mapEngine.on('mouseleave', 'lines-layer', () => {
        mapEngine.setCursor?.('');
    });
};

export const bindStationClickHighlightServingLines = ({
    mapEngine,
    touchTapGuard,
    isJourneyMapPickActive,
    isMultiSelectModeEnabled,
    getSelectedStationId,
    selectServingLinesForStation,
    openPanelForStationWithAutoScroll,
    getServingLineIdsFromStationProps,
    preloadTimetablesByLineIds
} = {}) => {
    if (!mapEngine || typeof mapEngine.on !== 'function') {
        throw new Error('bindStationClickHighlightServingLines requires mapEngine');
    }
    const stationLayers = getExistingStationInteractionLayers(mapEngine);
    if (!stationLayers.length) return;

    const handleStationClick = async (event) => {
        if (touchTapGuard?.allowTap?.(event?.originalEvent) === false) return;
        if (isJourneyMapPickActive?.() === true) return;
        if (event?.originalEvent?.__tokyoRailStationClickHandled === true) return;
        if (event?.originalEvent) event.originalEvent.__tokyoRailStationClickHandled = true;

        const feature = event?.features?.[0];
        const props = feature?.properties || {};
        const hadStationSelection = !!String(getSelectedStationId?.() || '').trim();

        if (isMultiSelectModeEnabled?.() !== true) {
            selectServingLinesForStation?.(props);
        }

        await openPanelForStationWithAutoScroll?.(props, { autoScroll: hadStationSelection });

        try {
            const ids = getServingLineIdsFromStationProps?.(props) || [];
            preloadTimetablesByLineIds?.(ids);
        } catch {
            // ignore
        }
    };

    stationLayers.forEach((layerId) => {
        mapEngine.on('click', layerId, handleStationClick);
    });
};

export const bindMapInteractions = ({
    blankClick = null,
    lineClick = null,
    stationClick = null
} = {}) => {
    if (blankClick) bindBlankMapClickRestore(blankClick);
    if (lineClick) bindLineClickSelect(lineClick);
    if (stationClick) bindStationClickHighlightServingLines(stationClick);
};
