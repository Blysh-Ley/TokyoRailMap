import { buildEndpointStationIdSetFromPayloadList } from '../../domain/routePreviewSelection.js';
import {
    tripPreviewCleared,
    tripPreviewRequested
} from '../../store/actions.js';

export const createRoutePreviewController = ({
    routeFeature,
    store,
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
    scheduleCollisionLayerRefresh,
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

    const toText = (value) => String(value ?? '').trim();

    const dispatchTrace = (action) => {
        if (typeof store?.dispatch === 'function') store.dispatch(action);
    };

    const resolvePreviewSource = (payload = {}, options = {}) => {
        return toText(options?.previewSource)
            || toText(options?.source)
            || toText(payload?.__previewSource)
            || toText(payload?.previewSource)
            || toText(resolveTripPreviewPayloadSource?.(payload));
    };

    const resolveFitMode = (payload = {}, options = {}) => {
        return toText(options?.fitMode) || toText(payload?.fitMode) || 'preview';
    };

    const resolvePreviewInteraction = (payload = {}, options = {}) => {
        const explicit = toText(options?.interaction)
            || toText(payload?.__previewInteraction)
            || toText(payload?.previewInteraction);
        if (explicit) return explicit;

        const fitMode = resolveFitMode(payload, options);
        if (fitMode === 'commit') return 'click';
        if (fitMode === 'preview') return 'hover';
        if (fitMode === 'none') return 'auto';
        return '';
    };

    const buildTripPreviewTracePayload = (payload = {}, options = {}) => ({
        source: 'routePreviewController',
        previewSource: resolvePreviewSource(payload, options) || null,
        interaction: resolvePreviewInteraction(payload, options) || null,
        fitMode: resolveFitMode(payload, options),
        clearBefore: options?.clearBefore === true,
        previewKey: toText(payload?.previewKey) || null,
        tripKey: toText(payload?.tripKey) || null,
        selectedLineId: toText(payload?.selectedLineId) || null,
        mainLineId: toText(payload?.mainLineId) || null
    });

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
            scheduleCollisionLayerRefresh,
            previewFitWithSidePanels,
            emitMultiSelectLayersUpdated
        });
    };

    const clearTripPathPreview = (options = {}) => {
        dispatchTrace(tripPreviewCleared({
            source: 'routePreviewController',
            previewSource: resolvePreviewSource({}, options) || null,
            interaction: toText(options?.interaction) || null,
            fitMode: toText(options?.fitMode) || null
        }));
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
            scheduleCollisionLayerRefresh,
            emitMultiSelectLayersUpdated
        });
    };

    const previewTripPath = (payload, options = {}) => {
        dispatchTrace(tripPreviewRequested(buildTripPreviewTracePayload(payload, options)));
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
            scheduleCollisionLayerRefresh,
            previewFitWithSidePanels
        });
    };

    const clearDirHeaderPreview = () => {
        routeFeature.clearDirHeaderPreview({
            isActive: isDirPreviewActive,
            applyInactiveState: applyDirPreviewInactiveState,
            clearEndpointPopups: clearDirEndpointPopups,
            applySelectionEffects,
            scheduleCollisionLayerRefresh
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
            scheduleCollisionLayerRefresh
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
