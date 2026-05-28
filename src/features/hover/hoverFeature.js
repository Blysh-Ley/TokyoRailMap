import { ACTION_TYPES, hoverSetEnabled } from '../../store/actions.js';

export const createHoverFeature = ({
    store,
    initialEnabled = true,
    canRunHoverPreviewAtCurrentZoom,
    snapshotSelectionState,
    restoreSelectionState,
    applyHoverEnabled
} = {}) => {
    if (!store) {
        throw new Error('hoverFeature requires store');
    }

    let enabled = initialEnabled !== false;
    let previewSnapshot = null;
    let previewWasApplied = false;

    const syncEnabled = (nextEnabled) => {
        enabled = nextEnabled !== false;
        if (typeof applyHoverEnabled === 'function') {
            applyHoverEnabled(enabled);
        }
    };

    const canPreviewAtZoom = () => (
        typeof canRunHoverPreviewAtCurrentZoom === 'function'
            ? canRunHoverPreviewAtCurrentZoom()
            : true
    );

    const beginPreview = () => {
        if (!enabled || !canPreviewAtZoom()) return false;
        if (!previewSnapshot && typeof snapshotSelectionState === 'function') {
            previewSnapshot = snapshotSelectionState();
        }
        previewWasApplied = true;
        return true;
    };

    const resetPreview = () => {
        previewSnapshot = null;
        previewWasApplied = false;
    };

    const commitPreview = () => {
        resetPreview();
    };

    const restorePreview = () => {
        if (previewSnapshot && previewWasApplied && typeof restoreSelectionState === 'function') {
            restoreSelectionState(previewSnapshot);
        }
        resetPreview();
    };

    const closePreview = ({ committed = false } = {}) => {
        if (committed) {
            commitPreview();
            return;
        }
        restorePreview();
    };

    const unsubscribe = store.subscribe((state, action) => {
        if (action?.type !== ACTION_TYPES.HOVER_SET_ENABLED) return;
        syncEnabled(state?.hoverPreviewEnabled !== false);
    });

    syncEnabled(store.getState?.().hoverPreviewEnabled ?? enabled);

    return {
        beginPreview,
        closePreview,
        commitPreview,
        destroy: unsubscribe,
        isEnabled: () => enabled !== false,
        resetPreview,
        restorePreview,
        setEnabled(nextEnabled) {
            store.dispatch(hoverSetEnabled(nextEnabled));
        }
    };
};
