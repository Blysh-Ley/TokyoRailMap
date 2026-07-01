import { mapClick } from '../../store/actions.js';
import { isMapClickSelectionAllowedByHighlight } from '../../domain/mapClickSelectionEligibility.js';

const STATION_INTERACTION_LAYER_IDS = ['stations-layer', 'station-labels-layer'];
const STATION_LABEL_INTERACTION_LAYER_ID = 'station-labels-layer';

const getExistingStationInteractionLayers = (mapEngine) => (
    STATION_INTERACTION_LAYER_IDS.filter((layerId) => mapEngine.hasLayer?.(layerId))
);

const queryRenderedStationLabelFeature = (mapEngine, point) => {
    if (!point || !mapEngine?.hasLayer?.(STATION_LABEL_INTERACTION_LAYER_ID)) return null;
    const hits = mapEngine.queryRenderedFeatures?.(point, {
        layers: [STATION_LABEL_INTERACTION_LAYER_ID]
    }) || [];
    return hits[0] || null;
};

export const resolveStationClickFeature = ({
    event,
    mapEngine,
    resolveDomStationLabelProps
} = {}) => {
    const domLabelProps = resolveDomStationLabelProps?.(event?.originalEvent);
    if (domLabelProps) {
        const stationId = String(domLabelProps?.id ?? '').trim();
        return {
            id: stationId || undefined,
            properties: domLabelProps
        };
    }

    const labelFeature = queryRenderedStationLabelFeature(mapEngine, event?.point);
    if (labelFeature) return labelFeature;

    return event?.features?.[0] || null;
};

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
    showRouteMapFloatingPanelForLine,
    isHighlightClickGateActive,
    getHighlightedLineIdsForClickGate,
    onBlockedLineClick
} = {}) => {
    if (!mapEngine || typeof mapEngine.on !== 'function') {
        throw new Error('bindLineClickSelect requires mapEngine');
    }
    if (!mapEngine.hasLayer?.('lines-layer')) return;

    const getLineSelectionContext = (feature) => {
        const lineId = feature?.properties?.id ?? feature?.id;
        if (lineId == null) return null;

        const rawLineId = String(lineId);
        const resolved = resolveLineSelection?.(rawLineId);
        const mainLineId = String(resolved?.mainLineId ?? rawLineId);
        const merged = Array.isArray(resolved?.mergedLineIds)
            ? resolved.mergedLineIds.map(String).filter(Boolean)
            : [mainLineId];

        return {
            rawLineId,
            mainLineId,
            merged,
            candidateLineIds: [rawLineId, mainLineId, ...merged]
        };
    };

    const isLineAllowedByHighlightGate = (context) => (
        isMapClickSelectionAllowedByHighlight({
            highlightActive: isHighlightClickGateActive?.() === true,
            candidateIds: context?.candidateLineIds || [],
            highlightedIds: getHighlightedLineIdsForClickGate?.()
        })
    );

    mapEngine.on('click', 'lines-layer', (event) => {
        if (touchTapGuard?.allowTap?.(event?.originalEvent) === false) return;

        const stationLayers = getExistingStationInteractionLayers(mapEngine);
        if (stationLayers.length) {
            const stationHits = mapEngine.queryRenderedFeatures?.(event.point, { layers: stationLayers }) || [];
            if (stationHits.length) return;
        }

        const feature = event?.features?.[0];
        const context = getLineSelectionContext(feature);
        if (!context) return;

        if (!isLineAllowedByHighlightGate(context)) {
            onBlockedLineClick?.({
                event,
                lineId: context.rawLineId,
                candidateLineIds: context.candidateLineIds
            });
            return;
        }

        if (isMultiSelectModeEnabled?.() === true) {
            toggleBaseMultiSelection?.(`line:${context.mainLineId}`, context.merged, 'line');
            if (getBaseMultiSelectedLineIds?.().size) setStationLabelMode?.('all');
            else setStationLabelMode?.('auto');
            applySelectionEffects?.();
            return;
        }

        const payload = commitLine?.(context.rawLineId);
        const nextLineId = String(payload?.selectedLineId || context.mainLineId);
        setStationLabelMode?.('all');
        markActiveLine?.(nextLineId);
        fitToCurrentSelection?.(`line:${nextLineId}`, 'commit');
        showRouteMapFloatingPanelForLine?.(context.rawLineId);
    });

    mapEngine.on('mouseenter', 'lines-layer', (event) => {
        const context = getLineSelectionContext(event?.features?.[0]);
        if (context && !isLineAllowedByHighlightGate(context)) {
            mapEngine.setCursor?.('');
            return;
        }
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
    recordStationHistory,
    preloadTimetablesByLineIds,
    isHighlightClickGateActive,
    getHighlightedStationIdsForClickGate,
    resolveDomStationLabelProps
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

        const feature = resolveStationClickFeature({
            event,
            mapEngine,
            resolveDomStationLabelProps
        });
        const props = feature?.properties || {};
        const stationId = String(props?.id ?? feature?.id ?? '').trim();
        if (!isMapClickSelectionAllowedByHighlight({
            highlightActive: isHighlightClickGateActive?.() === true,
            candidateIds: [stationId],
            highlightedIds: getHighlightedStationIdsForClickGate?.()
        })) return;
        const hadStationSelection = !!String(getSelectedStationId?.() || '').trim();

        if (isMultiSelectModeEnabled?.() !== true) {
            selectServingLinesForStation?.(props);
        }
        recordStationHistory?.(props);

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
