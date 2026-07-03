const toText = (value) => String(value ?? '').trim();

const toLineIds = (value) => (
    Array.isArray(value) ? value.map(toText).filter(Boolean) : []
);

const createDefaultHoverLifecycle = () => ({
    beginIfNeeded: () => true,
    close: () => {},
    commitIfNeeded: () => {},
    getFitMode: () => 'commit',
    isHover: () => false
});

export const createPanelSearchSelectionCallbacks = ({
    canRestoreStationLines,
    clearSelection,
    closeOnRestore = false,
    fitOnSelect = true,
    fitToCurrentSelection,
    getLineCompany,
    getSelectedStationId = () => null,
    hoverLifecycle = createDefaultHoverLifecycle(),
    isMenuThroughLineId = () => false,
    isMultiSelectModeEnabled = () => false,
    markActiveLine,
    previewMenuThroughLine,
    resolveLineSelection,
    searchFeature,
    resetLabelOnRestore = true,
    setIsolateStationsToSelectedLine,
    setStationLabelMode,
    sourcePrefix = ''
} = {}) => {
    if (!searchFeature) {
        throw new Error('panelSearchSelectionCallbacks requires searchFeature');
    }

    const isManagedSource = (source) => (
        sourcePrefix ? toText(source).startsWith(sourcePrefix) : true
    );

    const isHoverSource = (source) => (
        typeof hoverLifecycle.isPanelHover === 'function'
            ? hoverLifecycle.isPanelHover(source)
            : (
                typeof hoverLifecycle.isHover === 'function'
                    ? hoverLifecycle.isHover(source)
                    : toText(source).endsWith('hover')
            )
    );

    const setIsolate = (enabled) => {
        setIsolateStationsToSelectedLine?.(enabled === true);
    };

    const selectStationLineSubsetForCompany = (companyName, meta = {}) => {
        const name = toText(companyName);
        if (!name) return false;

        const stationLineIds = toLineIds(meta?.stationLineIds);
        const subset = stationLineIds.filter((id) => toText(getLineCompany?.(id)) === name);
        const nextIds = (subset.length ? subset : stationLineIds).map(String).filter(Boolean);

        setIsolate(false);
        setStationLabelMode?.('auto');
        if (nextIds.length) {
            searchFeature.selectStationLines({ lineIds: nextIds });
        } else {
            clearSelection?.({ source: `${sourcePrefix || 'selection.'}selectCompany` });
        }
        return true;
    };

    const selectCompany = (companyName, meta = {}) => {
        const source = meta?.source;
        if (isMultiSelectModeEnabled?.() && isManagedSource(source)) return;
        if (!hoverLifecycle.beginIfNeeded?.(source)) return;

        const name = toText(companyName);
        if (!name) return;
        hoverLifecycle.commitIfNeeded?.(source);

        if (isManagedSource(source)) {
            selectStationLineSubsetForCompany(name, meta);
        } else {
            setIsolate(false);
            setStationLabelMode?.('auto');
            searchFeature.commitCompany(name);
        }

        if (fitOnSelect && meta?.skipFit !== true) {
            fitToCurrentSelection?.(`company:${name}`, hoverLifecycle.getFitMode?.(source) || 'commit');
        }
    };

    const selectLine = (lineId, meta = {}) => {
        const source = meta?.source;
        if (isMultiSelectModeEnabled?.() && isManagedSource(source)) return;
        if (!hoverLifecycle.beginIfNeeded?.(source)) return;

        const id = toText(lineId);
        if (!id) return;
        hoverLifecycle.commitIfNeeded?.(source);

        if (isMenuThroughLineId(id)) {
            previewMenuThroughLine?.({ lineId: id, source: isHoverSource(source) ? 'hover' : 'click' });
            return;
        }

        const resolved = resolveLineSelection?.(id);
        const mainLineId = toText(resolved?.mainLineId) || id;

        if (isHoverSource(source)) {
            searchFeature.previewLine(id);
            setIsolate(false);
            setStationLabelMode?.('auto');
            if (fitOnSelect && meta?.skipFit !== true) {
                fitToCurrentSelection?.(`line:${mainLineId}`, 'preview');
            }
            return;
        }

        const payload = searchFeature.commitLine(id);
        const nextLineId = toText(payload?.selectedLineId) || mainLineId;
        setStationLabelMode?.('all');
        setIsolate(meta?.isolateStations === true);
        markActiveLine?.(nextLineId);

        if (fitOnSelect && meta?.skipFit !== true) {
            fitToCurrentSelection?.(`line:${nextLineId}`, 'commit');
        }
    };

    const restoreStationLines = (lineIds, meta = {}) => {
        const ids = toLineIds(lineIds);
        const stationId = toText(meta?.stationId) || toText(getSelectedStationId?.()) || null;
        if (typeof canRestoreStationLines === 'function' && !canRestoreStationLines({
            lineIds: ids,
            meta,
            sourcePrefix,
            stationId
        })) {
            return;
        }

        if (closeOnRestore) hoverLifecycle.close?.();
        setIsolate(false);

        if (ids.length) {
            searchFeature.selectStationLines({
                stationId,
                lineIds: ids
            });
        } else {
            clearSelection?.({ source: `${sourcePrefix || 'selection.'}restoreStationLines` });
        }

        if (resetLabelOnRestore) setStationLabelMode?.('auto');
    };

    return {
        onRestoreStationLines: restoreStationLines,
        onSelectCompany: selectCompany,
        onSelectLine: selectLine
    };
};
