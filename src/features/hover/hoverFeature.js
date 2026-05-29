import {
    ACTION_TYPES,
    hoverPreviewBegin,
    hoverPreviewClose,
    hoverPreviewCommit,
    hoverPreviewRestore,
    hoverSetEnabled
} from '../../store/actions.js';

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

    const tracePreviewLifecycle = (createAction, payload = {}) => {
        if (typeof store.dispatch !== 'function') return;
        store.dispatch(createAction({
            source: 'hoverFeature',
            ...payload
        }));
    };

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

    const getPreviewStatus = () => ({
        canPreviewAtZoom: canPreviewAtZoom() === true,
        enabled: enabled !== false,
        hasActivePreview: !!previewSnapshot || previewWasApplied === true,
        hasSnapshot: !!previewSnapshot,
        wasApplied: previewWasApplied === true
    });

    const beginPreview = () => {
        if (!enabled || !canPreviewAtZoom()) return false;
        const hadSnapshot = !!previewSnapshot;
        if (!previewSnapshot && typeof snapshotSelectionState === 'function') {
            previewSnapshot = snapshotSelectionState();
        }
        previewWasApplied = true;
        tracePreviewLifecycle(hoverPreviewBegin, {
            hadSnapshot,
            snapshotCreated: !hadSnapshot && !!previewSnapshot
        });
        return true;
    };

    const resetPreview = () => {
        previewSnapshot = null;
        previewWasApplied = false;
    };

    const commitPreview = () => {
        const hadSnapshot = !!previewSnapshot;
        const wasApplied = previewWasApplied === true;
        resetPreview();
        tracePreviewLifecycle(hoverPreviewCommit, {
            hadSnapshot,
            wasApplied
        });
    };

    const restorePreview = () => {
        const hadSnapshot = !!previewSnapshot;
        const wasApplied = previewWasApplied === true;
        if (previewSnapshot && previewWasApplied && typeof restoreSelectionState === 'function') {
            restoreSelectionState(previewSnapshot);
        }
        resetPreview();
        tracePreviewLifecycle(hoverPreviewRestore, {
            hadSnapshot,
            restored: hadSnapshot && wasApplied,
            wasApplied
        });
    };

    const closePreview = ({ committed = false } = {}) => {
        if (committed) {
            commitPreview();
            tracePreviewLifecycle(hoverPreviewClose, { committed: true });
            return;
        }
        restorePreview();
        tracePreviewLifecycle(hoverPreviewClose, { committed: false });
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
        getPreviewStatus,
        hasActivePreview: () => getPreviewStatus().hasActivePreview,
        hasPreviewSnapshot: () => getPreviewStatus().hasSnapshot,
        isEnabled: () => enabled !== false,
        resetPreview,
        restorePreview,
        setEnabled(nextEnabled) {
            store.dispatch(hoverSetEnabled(nextEnabled));
        }
    };
};
