import {
    buildTripPreviewAggregateFromPayloadList,
    buildTripPreviewLineFeatureDedupKey,
    buildTripPreviewSelectionKey,
    resolveTripPreviewPayloadSource
} from '../../domain/routePreviewSelection.js';
import { createRoutePreviewController } from './routePreviewController.js';
import { createTripPreviewBuilder } from './tripPreviewBuilder.js';

export const createRoutePreviewRuntimeController = ({
    tripPreviewBuilderOptions,
    routeFeature,
    store,
    isMultiSelectModeEnabled,
    resolveTripPreviewStationOverrideColor,
    getBaseMultiSelectedLineIds,
    applyTripPreviewState,
    applyTripPreviewInactiveState,
    getTripPreviewActiveSource,
    endpointPopups,
    syncStationOffsetForTripPreviewState,
    setStationLabelMode,
    applySelectionEffects,
    scheduleCollisionLayerRefresh,
    viewportController,
    emitMultiSelectLayersUpdated,
    isDirPreviewActive,
    applyDirPreviewState,
    applyDirPreviewInactiveState
} = {}) => {
    if (!routeFeature) {
        throw new Error('routePreviewRuntimeController requires routeFeature');
    }
    if (!viewportController) {
        throw new Error('routePreviewRuntimeController requires viewportController');
    }
    if (!endpointPopups) {
        throw new Error('routePreviewRuntimeController requires endpointPopups');
    }

    const { buildTripPreviewFeatures } = createTripPreviewBuilder(tripPreviewBuilderOptions || {});

    const buildMultiTripPreviewAggregate = () => routeFeature.buildMultiTripPreviewAggregate({
        buildLineFeatureDedupKey: buildTripPreviewLineFeatureDedupKey
    });

    const buildAggregateFromPayloadList = (payloadList) => {
        const lineSegmentCache = new Map();
        const lineFeatureCache = new Map();
        const stopFeatureCache = new Map();
        const buildTripPreviewFeaturesWithCache = (payload, context = {}) => buildTripPreviewFeatures(payload, {
            ...(context || {}),
            lineSegmentCache,
            lineFeatureCache,
            stopFeatureCache
        });
        return buildTripPreviewAggregateFromPayloadList({
            payloadList,
            buildTripPreviewFeatures: buildTripPreviewFeaturesWithCache,
            buildLineFeatureDedupKey: buildTripPreviewLineFeatureDedupKey
        });
    };

    const controller = createRoutePreviewController({
        routeFeature,
        store,
        isMultiSelectModeEnabled,
        resolveTripPreviewPayloadSource,
        buildTripPreviewSelectionKey,
        buildTripPreviewAggregate: buildMultiTripPreviewAggregate,
        buildTripPreviewAggregateFromPayloadList: buildAggregateFromPayloadList,
        buildTripPreviewFeatures,
        resolveTripPreviewStationOverrideColor,
        getBaseMultiSelectedLineIds,
        applyTripPreviewState,
        applyTripPreviewInactiveState,
        getTripPreviewActiveSource,
        clearTripEndpointPopups: endpointPopups.clearTripEndpointPopups,
        updateTripEndpointPopups: endpointPopups.updateTripEndpointPopups,
        syncStationOffsetForTripPreviewState,
        setStationLabelMode,
        applySelectionEffects,
        scheduleCollisionLayerRefresh,
        previewFitWithSidePanels: viewportController.previewFitWithSidePanels,
        emitMultiSelectLayersUpdated,
        isDirPreviewActive,
        applyDirPreviewState,
        applyDirPreviewInactiveState,
        clearDirEndpointPopups: endpointPopups.clearDirEndpointPopups,
        createDirEndpointPopup: endpointPopups.createDirEndpointPopup,
        addDirOriginPopup: endpointPopups.addDirOriginPopup,
        addDirTerminalPopup: endpointPopups.addDirTerminalPopup,
        bboxFromStationIds: viewportController.bboxFromStationIds
    });

    return {
        ...controller,
        buildTripPreviewFeatures,
        viewportController
    };
};
