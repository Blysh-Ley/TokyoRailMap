import { selectionSelectStationLines } from '../../store/actions.js';

const toText = (value) => String(value ?? '').trim();

export const createSearchSelectionController = ({
    store,
    searchFeature,
    hoverApi,
    hoverFeature,
    resolveLineSelection,
    getSelectionState,
    isMultiSelectModeEnabled,
    getBaseMultiSelectedLineIds,
    toggleBaseMultiSelection,
    setStationLabelMode,
    setIsolateStationsToSelectedLine,
    applySelectionEffects,
    fitToCurrentSelection,
    hideStationPopupForMenuInteraction,
    showRouteMapFloatingPanelForLine,
    markActiveLine,
    markActiveCompany,
    findStationLabelItemById,
    setStationVisualHighlight,
    selectPlatformLinesForStation,
    fitToPointAsBounds,
    openPanelForStationWithAutoScroll,
    getServingLineIdsFromStationProps,
    preloadTimetablesByLineIds,
    closeStationPopup,
    setFixedPopupStationLabelBelow
} = {}) => {
    if (!store || typeof store.dispatch !== 'function') {
        throw new Error('searchSelectionController requires a store');
    }
    if (!searchFeature) {
        throw new Error('searchSelectionController requires searchFeature');
    }

    const resolveLine = (lineId) => (
        typeof resolveLineSelection === 'function' ? resolveLineSelection(lineId) : null
    );

    const setIsolate = (enabled) => {
        if (typeof setIsolateStationsToSelectedLine === 'function') {
            setIsolateStationsToSelectedLine(enabled === true);
        }
    };

    const hoverLifecycle = {
        beginPreview() {
            if (typeof hoverApi?.beginPreview === 'function') return hoverApi.beginPreview() === true;
            return hoverFeature?.beginPreview?.() === true;
        },
        commitPreview() {
            if (typeof hoverApi?.commitPreview === 'function') return hoverApi.commitPreview();
            return hoverFeature?.commitPreview?.();
        },
        endPreview() {
            if (typeof hoverApi?.endPreview === 'function') return hoverApi.endPreview();
            return hoverFeature?.closePreview?.({ committed: false });
        },
        getPreviewStatus() {
            if (typeof hoverApi?.getPreviewStatus === 'function') return hoverApi.getPreviewStatus();
            return hoverFeature?.getPreviewStatus?.() || null;
        }
    };

    const openStationForStationId = (stationId, meta = {}) => {
        const item = typeof findStationLabelItemById === 'function'
            ? findStationLabelItemById(stationId)
            : null;
        if (!item) return null;

        const props = item.props || {};
        const coords = item.coordinates;
        const requestedLineIds = Array.isArray(meta?.lineIds)
            ? meta.lineIds.map((lineId) => toText(lineId)).filter(Boolean)
            : [];
        const fallbackLineIds = typeof getServingLineIdsFromStationProps === 'function'
            ? getServingLineIdsFromStationProps(props)
            : [];
        const lineIds = requestedLineIds.length ? requestedLineIds : fallbackLineIds;

        setStationVisualHighlight?.(toText(stationId) || toText(props?.id) || null);
        if (!lineIds.length) selectPlatformLinesForStation?.(props);
        setIsolate(false);
        setStationLabelMode?.('all');
        fitToPointAsBounds?.(coords, { maxZoom: meta?.maxZoom });
        return { props, coords, lineIds };
    };

    return {
        clearStationSelection() {
            const state = typeof getSelectionState === 'function' ? getSelectionState() : {};
            store.dispatch(selectionSelectStationLines({
                selectedCompany: state.selectedCompany,
                selectedLineId: state.selectedLineId,
                selectedStationLineIds: null,
                selectedStationId: null,
                selectedServiceMode: state.selectedServiceMode
            }));
        },

        previewLine(lineId) {
            const id = toText(lineId);
            if (!id) return;
            hideStationPopupForMenuInteraction?.({ preserveHoverPreview: true });
            if (hoverLifecycle.beginPreview() !== true) return;

            const payload = searchFeature.previewLine(id);
            if (!payload?.selectedLineId) return;
            setIsolate(false);
            setStationLabelMode?.('auto');
            fitToCurrentSelection?.(`line:${payload.selectedLineId}`, 'preview');
        },

        commitLine(lineId) {
            const id = toText(lineId);
            if (!id) return;
            hideStationPopupForMenuInteraction?.();
            hoverLifecycle.commitPreview();

            const resolved = resolveLine(id);
            const mainLineId = toText(resolved?.mainLineId) || id;
            const merged = Array.isArray(resolved?.mergedLineIds)
                ? resolved.mergedLineIds.map(String).filter(Boolean)
                : [mainLineId];

            if (isMultiSelectModeEnabled?.()) {
                toggleBaseMultiSelection?.(`line:${mainLineId}`, merged, 'line');
                if (getBaseMultiSelectedLineIds?.().size) setStationLabelMode?.('all');
                else setStationLabelMode?.('auto');
                applySelectionEffects?.();
                showRouteMapFloatingPanelForLine?.(id);
                return;
            }

            const payload = searchFeature.commitLine(id);
            const nextLineId = payload?.selectedLineId || mainLineId;
            setIsolate(false);
            setStationLabelMode?.('all');
            markActiveLine?.(nextLineId);
            fitToCurrentSelection?.(`line:${nextLineId}`, 'commit');
            showRouteMapFloatingPanelForLine?.(id);
        },

        previewCompany(companyName) {
            const name = toText(companyName);
            if (!name) return;
            hideStationPopupForMenuInteraction?.({ preserveHoverPreview: true });
            if (hoverLifecycle.beginPreview() !== true) return;
            const payload = searchFeature.previewCompany(name);
            if (!payload?.selectedCompany) return;
            setIsolate(false);
            setStationLabelMode?.('auto');
            fitToCurrentSelection?.(`company:${name}`, 'preview');
        },

        commitCompany(companyName) {
            const name = toText(companyName);
            if (!name) return;
            hideStationPopupForMenuInteraction?.();
            hoverLifecycle.commitPreview();
            const payload = searchFeature.commitCompany(name);
            if (!payload?.selectedCompany) return;
            setIsolate(false);
            setStationLabelMode?.('auto');
            markActiveCompany?.(name);
            fitToCurrentSelection?.(`company:${name}`, 'commit');
        },

        previewStation(stationId, meta) {
            if (hoverLifecycle.beginPreview() !== true) return;
            openStationForStationId(stationId, meta || {});
        },

        commitStation(stationId, meta) {
            hoverLifecycle.commitPreview();
            const opened = openStationForStationId(stationId, meta || {});
            if (meta?.showPanel === false) return;

            openPanelForStationWithAutoScroll?.(opened?.props || {}, { collapseMobileSearch: true });

            try {
                const ids = getServingLineIdsFromStationProps?.(opened?.props || {});
                preloadTimetablesByLineIds?.(ids);
            } catch {
                // ignore
            }
        },

        closeStationPopup({ committed } = {}) {
            closeStationPopup?.({ committed: committed !== false });
            setFixedPopupStationLabelBelow?.(null);
        }
    };
};
