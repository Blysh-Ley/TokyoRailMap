const toText = (value) => String(value ?? '').trim();

export const createRoutePreviewBridgeApi = ({
    previewTripPath,
    applyTripPreviewSnapshot,
    fitTripPreviewSnapshot,
    clearTripPathPreview,
    fitMobileTripBounds,
    isMultiSelectModeEnabled,
    shouldPreserveStationViewport = () => false,
    defaultSource = 'journey'
} = {}) => {
    const source = toText(defaultSource) || 'journey';

    return {
        previewTripPath: (payload, options = {}) => {
            const interaction = toText(payload?.__previewInteraction || payload?.previewInteraction);
            const inferredFitMode = interaction === 'click'
                ? 'commit'
                : (interaction === 'hover' ? 'preview' : 'none');
            const preserveViewport = shouldPreserveStationViewport(payload) === true;
            const fitMode = preserveViewport ? 'none' : (toText(options?.fitMode || payload?.fitMode || inferredFitMode) || 'none');
            const nextPayload = {
                ...(payload || {}),
                __previewSource: source,
                fitMode
            };
            if (options?.clearBefore === true && isMultiSelectModeEnabled?.() !== true) {
                clearTripPathPreview?.({ source });
            }
            return previewTripPath?.(nextPayload, preserveViewport
                ? { ...options, fitMode: 'none', preserveViewport: true }
                : options);
        },
        applyTripPreviewSnapshot: (snapshot, options = {}) => {
            return applyTripPreviewSnapshot?.(snapshot, shouldPreserveStationViewport(snapshot?.payload) === true
                ? { ...options, fitMode: 'none', preserveViewport: true }
                : options);
        },
        fitTripPreviewSnapshot: (snapshot, options = {}) => {
            if (shouldPreserveStationViewport(snapshot?.payload) === true) return true;
            return fitTripPreviewSnapshot?.(snapshot, options) === true;
        },
        clearTripPathPreview: () => {
            clearTripPathPreview?.({ source });
        },
        clearTripPathPreviewBySource: (previewSource) => {
            const s = toText(previewSource);
            if (!s) return;
            clearTripPathPreview?.({ source: s });
        },
        fitMobileTripBounds: (payload, options = {}) => {
            if (shouldPreserveStationViewport(payload) === true) return false;
            return fitMobileTripBounds?.(
                {
                    ...(payload || {}),
                    __previewSource: toText(payload?.__previewSource || payload?.previewSource) || source
                },
                options
            ) === true;
        }
    };
};
