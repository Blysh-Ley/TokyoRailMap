export const resolveMultiSelectBaseLayerModeEffects = ({ enabled } = {}) => {
    const active = enabled === true;
    return {
        clearBaseSelections: true,
        clearSelectionState: !active
    };
};

export const resolveMultiSelectTripPreviewModeEffects = () => ({
    clearTripPathPreview: true,
    clearDirHeaderPreview: true
});
