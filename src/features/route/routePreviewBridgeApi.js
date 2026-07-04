const toText = (value) => String(value ?? '').trim();

export const createRoutePreviewBridgeApi = ({
    previewTripPath,
    applyTripPreviewSnapshot,
    clearTripPathPreview,
    fitMobileTripBounds,
    isMultiSelectModeEnabled,
    defaultSource = 'journey'
} = {}) => {
    const source = toText(defaultSource) || 'journey';

    return {
        previewTripPath: (payload, options = {}) => {
            const interaction = toText(payload?.__previewInteraction || payload?.previewInteraction);
            const inferredFitMode = interaction === 'click'
                ? 'commit'
                : (interaction === 'hover' ? 'preview' : 'none');
            const fitMode = toText(options?.fitMode || payload?.fitMode || inferredFitMode) || 'none';
            const nextPayload = {
                ...(payload || {}),
                __previewSource: source,
                fitMode
            };
            if (options?.clearBefore === true && isMultiSelectModeEnabled?.() !== true) {
                clearTripPathPreview?.({ source });
            }
            return previewTripPath?.(nextPayload, options);
        },
        applyTripPreviewSnapshot: (snapshot, options = {}) => {
            return applyTripPreviewSnapshot?.(snapshot, options);
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
