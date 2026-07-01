const toText = (value) => String(value ?? '').trim();

export const MULTI_SELECT_BRANCH_PREVIEW_ACTION_NONE = 'none';
export const MULTI_SELECT_BRANCH_PREVIEW_ACTION_CLEAR = 'clear';
export const MULTI_SELECT_BRANCH_PREVIEW_ACTION_PREVIEW = 'preview';

export const resolveMultiSelectBranchPreviewToggle = ({
    lineId,
    source,
    hasBaseEntry,
    currentStep = 0,
    hasPreviewSelection = false
} = {}) => {
    const resolvedLineId = toText(lineId);
    const resolvedSource = toText(source);
    if (!resolvedLineId || !resolvedSource || hasBaseEntry !== true) {
        return {
            action: MULTI_SELECT_BRANCH_PREVIEW_ACTION_NONE,
            ok: false
        };
    }

    const step = Number.isFinite(Number(currentStep)) ? Number(currentStep) : 0;
    const previewVisible = hasPreviewSelection === true;

    if (step >= 2) {
        return {
            action: MULTI_SELECT_BRANCH_PREVIEW_ACTION_CLEAR,
            ok: true,
            lineId: resolvedLineId,
            source: resolvedSource,
            nextStep: 0,
            shouldClearPreview: previewVisible
        };
    }

    const isFirstClick = step <= 0 || !previewVisible;
    return {
        action: MULTI_SELECT_BRANCH_PREVIEW_ACTION_PREVIEW,
        ok: true,
        lineId: resolvedLineId,
        source: resolvedSource,
        nextStep: isFirstClick ? 1 : 2,
        filterSpecial: isFirstClick
    };
};
