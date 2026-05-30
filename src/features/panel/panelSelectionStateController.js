const defaultToText = (value) => String(value ?? '').trim();

export const createPanelSelectionStateController = ({ toText = defaultToText } = {}) => {
    let pinnedDirPreviewKey = '';
    let pinnedPanelSelection = null;

    const normalize = (value) => toText(value);

    const setPinnedDirPreviewKey = (lineDirKey) => {
        pinnedDirPreviewKey = normalize(lineDirKey);
        return pinnedDirPreviewKey;
    };

    const clearPinnedDirPreviewKey = () => {
        pinnedDirPreviewKey = '';
    };

    const getPinnedDirPreviewKey = () => pinnedDirPreviewKey;

    const setPinnedPanelSelection = (kind, key) => {
        const k = normalize(kind);
        const v = normalize(key);
        if (!k || !v) {
            pinnedPanelSelection = null;
            return null;
        }
        pinnedPanelSelection = { kind: k, key: v };
        return { ...pinnedPanelSelection };
    };

    const clearPinnedPanelSelection = () => {
        pinnedPanelSelection = null;
    };

    const getPinnedPanelSelection = () => (
        pinnedPanelSelection ? { ...pinnedPanelSelection } : null
    );

    const getCurrentPinnedInteractionKey = ({ tripLocked = false, lockedTripKey = '' } = {}) => {
        const tripKey = normalize(lockedTripKey);
        if (tripLocked && tripKey) return `trip:${tripKey}`;
        if (pinnedPanelSelection?.kind && pinnedPanelSelection?.key) {
            return `${normalize(pinnedPanelSelection.kind)}:${normalize(pinnedPanelSelection.key)}`;
        }
        if (pinnedDirPreviewKey) return `dir:${pinnedDirPreviewKey}`;
        return '';
    };

    const hasPinnedPanelState = (options = {}) => !!getCurrentPinnedInteractionKey(options);

    const isDirFilterPinned = () => (
        normalize(pinnedPanelSelection?.kind) === 'dir'
        && !!pinnedDirPreviewKey
        && normalize(pinnedPanelSelection?.key) === pinnedDirPreviewKey
    );

    const clearPinnedState = () => {
        pinnedPanelSelection = null;
        pinnedDirPreviewKey = '';
    };

    return {
        clearPinnedDirPreviewKey,
        clearPinnedPanelSelection,
        clearPinnedState,
        getCurrentPinnedInteractionKey,
        getPinnedDirPreviewKey,
        getPinnedPanelSelection,
        hasPinnedPanelState,
        isDirFilterPinned,
        setPinnedDirPreviewKey,
        setPinnedPanelSelection
    };
};
