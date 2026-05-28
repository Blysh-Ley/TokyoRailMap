import { buildEndpointStationIdSetFromPayloadList } from '../../domain/routePreviewSelection.js';

export const createRoutePreviewController = ({
    routeFeature,
    isMultiSelectModeEnabled,
    resolveTripPreviewPayloadSource,
    buildTripPreviewSelectionKey,
    buildTripPreviewAggregate,
    buildTripPreviewAggregateFromPayloadList,
    buildTripPreviewFeatures,
    resolveTripPreviewStationOverrideColor,
    getBaseMultiSelectedLineIds,
    applyTripPreviewState,
    applyTripPreviewInactiveState,
    getTripPreviewActiveSource,
    clearTripEndpointPopups,
    updateTripEndpointPopups,
    syncStationOffsetForTripPreviewState,
    setStationLabelMode,
    applySelectionEffects,
    scheduleLayerCollisionUpdate,
    previewFitWithSidePanels,
    emitMultiSelectLayersUpdated,
    isDirPreviewActive,
    applyDirPreviewState,
    applyDirPreviewInactiveState,
    clearDirEndpointPopups,
    createDirEndpointPopup,
    addDirOriginPopup,
    addDirTerminalPopup,
    bboxFromStationIds
} = {}) => {
    if (!routeFeature) {
        throw new Error('routePreviewController requires routeFeature');
    }

    const rebuildTripPreviewFromMultiSelections = (fitMode = 'none') => {
        const aggregate = buildTripPreviewAggregate?.();
        routeFeature.rebuildMultiTripPreview({
            aggregate,
            fitMode,
            hasBaseMultiSelection: (getBaseMultiSelectedLineIds?.()?.size || 0) > 0,
            applyPreviewState: applyTripPreviewState,
            clearEndpointPopups: clearTripEndpointPopups,
            syncStationOffset: syncStationOffsetForTripPreviewState,
            setStationLabelMode,
            applySelectionEffects,
            scheduleLayerCollisionUpdate,
            previewFitWithSidePanels,
            emitMultiSelectLayersUpdated
        });
    };

    const clearTripPathPreview = (options = {}) => {
        routeFeature.clearTripPathPreview({
            options,
            isMultiSelectModeEnabled,
            resolvePayloadSource: resolveTripPreviewPayloadSource,
            getActiveSource: getTripPreviewActiveSource,
            rebuildMultiTripPreview: rebuildTripPreviewFromMultiSelections,
            applyInactiveState: applyTripPreviewInactiveState,
            clearEndpointPopups: clearTripEndpointPopups,
            syncStationOffset: syncStationOffsetForTripPreviewState,
            setStationLabelMode,
            applySelectionEffects,
            scheduleLayerCollisionUpdate,
            emitMultiSelectLayersUpdated
        });
    };

    const previewTripPath = (payload) => {
        routeFeature.previewTripPath({
            payload,
            isMultiSelectModeEnabled,
            clearTripPathPreview,
            resolvePayloadSource: resolveTripPreviewPayloadSource,
            buildSelectionKey: buildTripPreviewSelectionKey,
            buildAggregateFromPayloadList: buildTripPreviewAggregateFromPayloadList,
            buildFeatures: buildTripPreviewFeatures,
            rebuildMultiTripPreview: rebuildTripPreviewFromMultiSelections,
            resolveStationOverrideColor: resolveTripPreviewStationOverrideColor,
            resolveVirtualTripStationIds: ({
                payload: tripPayload,
                payloadSource,
                aggregate,
                virtualTrips
            } = {}) => {
                if (payloadSource !== 'panel-dir-branch') return aggregate?.stopIds || null;
                const explicitHighlightIds = new Set(
                    (Array.isArray(tripPayload?.highlightStationIds) ? tripPayload.highlightStationIds : [])
                        .map((x) => String(x || '').trim())
                        .filter(Boolean)
                );
                if (explicitHighlightIds.size) return explicitHighlightIds;
                const endpointIds = buildEndpointStationIdSetFromPayloadList(virtualTrips);
                return endpointIds.size ? endpointIds : aggregate?.stopIds || null;
            },
            applyActiveState: applyTripPreviewState,
            syncStationOffset: syncStationOffsetForTripPreviewState,
            clearEndpointPopups: clearTripEndpointPopups,
            updateEndpointPopups: updateTripEndpointPopups,
            setStationLabelMode,
            applySelectionEffects,
            scheduleLayerCollisionUpdate,
            previewFitWithSidePanels
        });
    };

    const clearDirHeaderPreview = () => {
        routeFeature.clearDirHeaderPreview({
            isActive: isDirPreviewActive,
            applyInactiveState: applyDirPreviewInactiveState,
            clearEndpointPopups: clearDirEndpointPopups,
            applySelectionEffects,
            scheduleLayerCollisionUpdate
        });
    };

    const previewDirHeader = (payload) => {
        routeFeature.previewDirHeader({
            payload,
            clearDirHeaderPreview,
            applyActiveState: applyDirPreviewState,
            clearEndpointPopups: clearDirEndpointPopups,
            createEndpointPopup: createDirEndpointPopup,
            addOriginPopup: addDirOriginPopup,
            addTerminalPopup: addDirTerminalPopup,
            bboxFromStationIds,
            previewFitWithSidePanels,
            applySelectionEffects,
            scheduleLayerCollisionUpdate
        });
    };

    const toggleTripPreviewSelectionVisibility = (key) => {
        const changed = routeFeature.toggleTripPreviewSelectionVisibility(key);
        if (!changed) return false;
        rebuildTripPreviewFromMultiSelections('none');
        return true;
    };

    const removeTripPreviewSelection = (key) => {
        const removed = routeFeature.deleteTripPreviewSelection(key);
        if (!removed) return false;
        rebuildTripPreviewFromMultiSelections('none');
        return true;
    };

    return {
        rebuildTripPreviewFromMultiSelections,
        clearTripPathPreview,
        previewTripPath,
        clearDirHeaderPreview,
        previewDirHeader,
        toggleTripPreviewSelectionVisibility,
        removeTripPreviewSelection
    };
};
