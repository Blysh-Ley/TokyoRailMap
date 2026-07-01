const toText = (value) => String(value ?? '').trim();

export const resolveMultiSelectBranchLayerState = ({
    supported = false,
    branchSource = '',
    branchPreviewStep = 0,
    hasPreviewSelection = false
} = {}) => {
    const isSupported = supported === true;
    const source = toText(branchSource);
    const step = Number.isFinite(Number(branchPreviewStep)) ? Number(branchPreviewStep) : 0;
    const visibleByPreview = !!source && hasPreviewSelection === true;

    return {
        branchToggleSupported: isSupported,
        branchVisible: isSupported && (step > 0 || visibleByPreview),
        branchPreviewStep: isSupported ? step : 0
    };
};
