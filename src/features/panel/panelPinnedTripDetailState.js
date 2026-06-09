const defaultToText = (value) => String(value ?? '').trim();

export const createPanelPinnedTripDetailState = ({
    toText = defaultToText,
    clearTripDetailHideTimer = () => {},
    scheduleTripDetailHideTimer = () => {},
    hideTripDetail = () => {},
    panelSelectionState,
    body,
    clearPinnedDirPreview = () => {},
    restoreStationDefaultSelection = () => {},
    getTripLocked = () => false,
    setTripLocked = () => {},
    getLockedTripKey = () => null,
    setLockedTripKey = () => {},
    getTripDetailPinned = () => false,
    setTripDetailPinned = () => {},
    setLastTripDetailKey = () => {},
    setLastAppliedHoverKey = () => {}
} = {}) => {
    const scheduleTripDetailHide = (delayMs = 220) => {
        clearTripDetailHideTimer();
        scheduleTripDetailHideTimer(() => {
            if (!getTripDetailPinned()) {
                hideTripDetail();
                setLastTripDetailKey(null);
            }
        }, delayMs);
    };

    const lockTripPreview = (tripKey) => {
        setTripLocked(true);
        setLockedTripKey(toText(tripKey) || null);
        setTripDetailPinned(true);
        clearTripDetailHideTimer();
    };

    const unlockTripPreview = () => {
        setTripLocked(false);
        setLockedTripKey(null);
        setTripDetailPinned(false);
    };

    const getCurrentPinnedInteractionKey = () => panelSelectionState?.getCurrentPinnedInteractionKey?.({
        tripLocked: getTripLocked(),
        lockedTripKey: getLockedTripKey()
    }) || '';

    const hasPinnedPanelState = () => !!getCurrentPinnedInteractionKey();

    const clearPinnedPanelState = ({ restoreStation = true } = {}) => {
        const hadPinned = hasPinnedPanelState();
        panelSelectionState?.clearPinnedPanelSelection?.();
        body?.classList?.remove?.('is-pinned');
        if (getTripLocked() || getTripDetailPinned()) {
            hideTripDetail();
            setLastTripDetailKey(null);
        }
        if (panelSelectionState?.getPinnedDirPreviewKey?.()) {
            clearPinnedDirPreview();
        }
        if (restoreStation) {
            setLastAppliedHoverKey(null);
            restoreStationDefaultSelection();
        }
        return hadPinned;
    };

    return {
        clearPinnedPanelState,
        getCurrentPinnedInteractionKey,
        hasPinnedPanelState,
        lockTripPreview,
        scheduleTripDetailHide,
        unlockTripPreview
    };
};
