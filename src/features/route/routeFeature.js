export const createRouteFeature = ({
    tripPreviewRenderer,
    emitTripPreviewUpdated,
    emitTripPreviewCleared
} = {}) => {
    if (!tripPreviewRenderer) {
        throw new Error('routeFeature requires tripPreviewRenderer');
    }

    return {
        ensureTripPreviewLayers() {
            tripPreviewRenderer.ensureLayers();
        },
        resetTripPreviewLayers() {
            tripPreviewRenderer.reset();
        },
        setTripPreviewData({ lineFc, stopFc } = {}) {
            tripPreviewRenderer.setData({ lineFc, stopFc });
        },
        notifyTripPreviewUpdated({ payload, built } = {}) {
            emitTripPreviewUpdated?.({ payload, built });
        },
        notifyTripPreviewCleared() {
            emitTripPreviewCleared?.();
        }
    };
};
