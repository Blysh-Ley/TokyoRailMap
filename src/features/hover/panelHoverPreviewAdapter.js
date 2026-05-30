const toSource = (source) => String(source ?? '').trim();

export const createPanelHoverPreviewLifecycle = ({
    getHoverFeature
} = {}) => {
    const getHover = () => (typeof getHoverFeature === 'function' ? getHoverFeature() : null);
    const isPanelHover = (source) => toSource(source) === 'panel-hover';

    return Object.freeze({
        beginIfNeeded(source) {
            if (!isPanelHover(source)) return true;
            return getHover()?.beginPreview?.() === true;
        },
        close() {
            getHover()?.closePreview?.({ committed: false });
        },
        commitIfNeeded(source) {
            if (isPanelHover(source)) return;
            getHover()?.commitPreview?.();
        },
        getFitMode(source) {
            return isPanelHover(source) ? 'preview' : 'commit';
        },
        isPanelHover
    });
};
