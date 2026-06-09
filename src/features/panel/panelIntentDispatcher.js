export const dispatchPanelDirFilterIntent = ({
    filterTarget,
    fitMode = 'preview',
    makeLineDirKey = () => '',
    applyDirPreviewByKey = () => {},
    pinDirPreviewByKey = () => {},
    setPinnedPanelSelection = () => {},
    toggleDirFilterPopoverFromButton = () => {}
} = {}) => {
    if (!filterTarget) return false;
    const lineDirKey = makeLineDirKey(filterTarget.lineId, filterTarget.dirKey);
    if (!lineDirKey) return false;
    applyDirPreviewByKey(lineDirKey, { fitMode });
    pinDirPreviewByKey(lineDirKey);
    setPinnedPanelSelection('dir', lineDirKey);
    toggleDirFilterPopoverFromButton(filterTarget.buttonEl);
    return true;
};

export const dispatchPanelDirectionToggleIntent = ({
    dirTarget,
    toggleDirectionTimetable = () => {}
} = {}) => {
    if (!dirTarget) return false;
    toggleDirectionTimetable(dirTarget.lineId, dirTarget.dirKey);
    return true;
};

export const dispatchPanelPrimarySelectionIntent = ({
    primaryTarget,
    mode = 'mouse',
    lastMousePrimaryKey = '',
    clearHoverTimer = () => {},
    resetHoverState = () => {},
    clearPinnedDirPreview = () => {},
    setPinnedPanelSelection = () => {},
    applyLineHoverSelection = () => {},
    applyCompanyHoverSelection = () => {},
    onSelectLine = null,
    onSelectCompany = null,
    currentStationServingIds = []
} = {}) => {
    if (!primaryTarget || (primaryTarget.kind !== 'line' && primaryTarget.kind !== 'company')) return {
        handled: false,
        lastMousePrimaryKey
    };

    clearHoverTimer();
    resetHoverState();
    clearPinnedDirPreview();

    if (primaryTarget.kind === 'line') {
        if (mode === 'touch') {
            setPinnedPanelSelection('line', String(primaryTarget.lineId));
            onSelectLine?.(String(primaryTarget.lineId), { source: 'panel-touch', isolateStations: true });
            return {
                handled: true,
                lastMousePrimaryKey
            };
        }

        let nextLastMousePrimaryKey = lastMousePrimaryKey;
        if (lastMousePrimaryKey !== primaryTarget.key) {
            applyLineHoverSelection(primaryTarget.lineId);
            nextLastMousePrimaryKey = primaryTarget.key;
        }
        setPinnedPanelSelection('line', String(primaryTarget.lineId));
        return {
            handled: true,
            lastMousePrimaryKey: nextLastMousePrimaryKey
        };
    }

    if (mode === 'touch') {
        setPinnedPanelSelection('company', String(primaryTarget.companyName));
        onSelectCompany?.(String(primaryTarget.companyName), {
            source: 'panel-touch',
            stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
        });
        return {
            handled: true,
            lastMousePrimaryKey
        };
    }

    let nextLastMousePrimaryKey = lastMousePrimaryKey;
    if (lastMousePrimaryKey !== primaryTarget.key) {
        applyCompanyHoverSelection(primaryTarget.companyName);
        nextLastMousePrimaryKey = primaryTarget.key;
    }
    setPinnedPanelSelection('company', String(primaryTarget.companyName));
    return {
        handled: true,
        lastMousePrimaryKey: nextLastMousePrimaryKey
    };
};
