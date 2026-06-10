import { previewBranchesForLine } from '../../map/analyze_branch.js';



// panelCrossFeatureBridgeController.js
const noopProvider_panelCrossFeatureBridgeController = () => null;

const callSafely_panelCrossFeatureBridgeController = (fn) => {
    try {
        return fn();
    } catch {
        return null;
    }
};

export const createPanelCrossFeatureBridgeController = ({
    getJourneyUi = () => globalThis.window?.TokyoRailJourneyUI,
    getSearchMapActions = () => globalThis.window?.TokyoRailSearchMapActions,
    getTimePickerStateTarget = () => globalThis.window,
    getTimetableCache = () => globalThis.window?.TokyoRailTimetableCache
} = {}) => {
    const getJourney = typeof getJourneyUi === 'function' ? getJourneyUi : noopProvider_panelCrossFeatureBridgeController;
    const getSearchActions = typeof getSearchMapActions === 'function' ? getSearchMapActions : noopProvider_panelCrossFeatureBridgeController;
    const getTimeTarget = typeof getTimePickerStateTarget === 'function' ? getTimePickerStateTarget : noopProvider_panelCrossFeatureBridgeController;
    const getCache = typeof getTimetableCache === 'function' ? getTimetableCache : noopProvider_panelCrossFeatureBridgeController;

    const setJourneyStation = ({
        field,
        stationId,
        stationName
    } = {}) => callSafely_panelCrossFeatureBridgeController(() => {
        const ui = getJourney();
        const methodName = field === 'destination' ? 'setDestinationStation' : 'setOriginStation';
        const method = ui?.[methodName];
        if (typeof method !== 'function') return false;
        method.call(ui, stationId, stationName, { expand: true, recompute: true });
        return true;
    }) === true;

    const clearStationSelection = () => callSafely_panelCrossFeatureBridgeController(() => {
        const clear = getSearchActions()?.clearStationSelection;
        if (typeof clear !== 'function') return false;
        clear();
        return true;
    }) === true;

    const applyStationToJourneyField = (payload = {}) => {
        const appliedJourney = setJourneyStation(payload);
        const clearedSelection = clearStationSelection();
        return { appliedJourney, clearedSelection };
    };

    const clearTripPathPreviewBySource = (source) => callSafely_panelCrossFeatureBridgeController(() => {
        const clear = getSearchActions()?.clearTripPathPreviewBySource;
        if (typeof clear !== 'function') return false;
        clear(source);
        return true;
    }) === true;

    const recomputeJourney = () => callSafely_panelCrossFeatureBridgeController(() => {
        const recompute = getJourney()?.recompute;
        if (typeof recompute !== 'function') return false;
        recompute();
        return true;
    }) === true;

    const setTimePickerOpenState = (open) => callSafely_panelCrossFeatureBridgeController(() => {
        const target = getTimeTarget();
        if (!target) return false;
        target.__TokyoRailTimePickerOpen = !!open;
        return true;
    }) === true;

    const loadTimetableForLineId = async (lineId) => {
        const id = String(lineId ?? '').trim();
        if (!id) return null;
        try {
            const cache = getCache();
            if (!cache) return null;
            const existing = cache.get?.(id);
            if (existing) return existing;
            await cache.preloadByLineIds?.([id]);
            return cache.get?.(id) || null;
        } catch {
            return null;
        }
    };

    return {
        applyStationToJourneyField,
        clearStationSelection,
        clearTripPathPreviewBySource,
        loadTimetableForLineId,
        recomputeJourney,
        setJourneyStation,
        setTimePickerOpenState
    };
};

// panelEventDelegationCoordinator.js
const defaultToText_panelEventDelegationCoordinator = (value) => String(value ?? '').trim();

const isElementLike_panelEventDelegationCoordinator = (target) => !!target && typeof target.closest === 'function';

const isContained_panelEventDelegationCoordinator = (rootEl, target) => {
    if (!rootEl || !target || typeof rootEl.contains !== 'function') return false;
    return rootEl.contains(target);
};

const closestInside_panelEventDelegationCoordinator = (target, selector, rootEl) => {
    if (!isElementLike_panelEventDelegationCoordinator(target)) return null;
    const hit = target.closest?.(selector);
    if (!hit || (rootEl && !isContained_panelEventDelegationCoordinator(rootEl, hit))) return null;
    return hit;
};

export const resolvePanelCompanyTarget = (target, {
    body,
    toText = defaultToText_panelEventDelegationCoordinator
} = {}) => {
    const hit = closestInside_panelEventDelegationCoordinator(target, '.panel-company-logo, .panel-company-name', body);
    if (!hit) return null;
    const companyEl = hit.closest?.('.panel-company-header[data-company]');
    const company = toText(companyEl?.getAttribute?.('data-company'));
    return company || null;
};

export const resolvePanelLineTarget = (target, {
    body,
    toText = defaultToText_panelEventDelegationCoordinator
} = {}) => {
    const hit = closestInside_panelEventDelegationCoordinator(target, '.panel-line-name', body);
    if (!hit) return null;
    const lineEl = hit.closest?.('[data-line-id]');
    const lineId = toText(lineEl?.getAttribute?.('data-line-id'));
    return lineId || null;
};

const resolveLineDirTarget_panelEventDelegationCoordinator = (target, {
    body,
    triggerSelector,
    toText = defaultToText_panelEventDelegationCoordinator
} = {}) => {
    const triggerEl = closestInside_panelEventDelegationCoordinator(target, triggerSelector, body);
    if (!triggerEl) return null;
    const dirEl = triggerEl.closest?.('[data-dir-toggle]');
    const lineEl = triggerEl.closest?.('[data-line-id]');
    const lineId = toText(lineEl?.getAttribute?.('data-line-id'));
    const dirKey = toText(dirEl?.getAttribute?.('data-dir-key'));
    if (!lineId || !dirKey) return null;
    return { lineId, dirKey };
};

export const resolvePanelDirTitleTarget = (target, options = {}) => resolveLineDirTarget_panelEventDelegationCoordinator(target, {
    ...options,
    triggerSelector: '.panel-dir-title'
});

export const resolvePanelDirTriangleTarget = (target, options = {}) => resolveLineDirTarget_panelEventDelegationCoordinator(target, {
    ...options,
    triggerSelector: '.panel-dir-triangle'
});

const resolveDirButtonTarget_panelEventDelegationCoordinator = (target, {
    body,
    selector,
    toText = defaultToText_panelEventDelegationCoordinator
} = {}) => {
    const buttonEl = closestInside_panelEventDelegationCoordinator(target, selector, body);
    if (!buttonEl) return null;
    const lineId = toText(buttonEl.getAttribute?.('data-line-id'));
    const dirKey = toText(buttonEl.getAttribute?.('data-dir-key'));
    if (!lineId || !dirKey) return null;
    return { buttonEl, lineId, dirKey };
};

export const resolvePanelDirFilterButtonTarget = (target, options = {}) => resolveDirButtonTarget_panelEventDelegationCoordinator(target, {
    ...options,
    selector: '.panel-dir-filter-btn[data-dir-filter-btn]'
});

export const resolvePanelDirPrintButtonTarget = (target, options = {}) => resolveDirButtonTarget_panelEventDelegationCoordinator(target, {
    ...options,
    selector: '.panel-dir-print-btn[data-dir-print-btn]'
});

export const resolveTripDetailStationTarget = (target, {
    rootEl = null
} = {}) => closestInside_panelEventDelegationCoordinator(target, '.panel-trip-detail-station[data-station-id]', rootEl);

const bind_panelEventDelegationCoordinator = (target, type, handler, options) => {
    if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') {
        return () => {};
    }
    target.addEventListener(type, handler, options);
    return () => target.removeEventListener?.(type, handler, options);
};

export const createPanelEventDelegationCoordinator = ({
    body,
    bodyHandlers = {},
    tripDetailBody = null,
    tripDetailHandlers = {}
} = {}) => {
    const unbinders = [
        bind_panelEventDelegationCoordinator(body, 'pointerdown', bodyHandlers.pointerdown, { passive: false }),
        bind_panelEventDelegationCoordinator(body, 'pointermove', bodyHandlers.pointermove, { passive: true }),
        bind_panelEventDelegationCoordinator(body, 'pointerup', bodyHandlers.pointerup, { passive: true }),
        bind_panelEventDelegationCoordinator(body, 'pointercancel', bodyHandlers.pointercancel, { passive: true }),
        bind_panelEventDelegationCoordinator(body, 'mousemove', bodyHandlers.mousemove),
        bind_panelEventDelegationCoordinator(body, 'mouseleave', bodyHandlers.mouseleave),
        bind_panelEventDelegationCoordinator(body, 'click', bodyHandlers.click, { passive: false }),
        bind_panelEventDelegationCoordinator(body, 'mouseover', bodyHandlers.mouseover),
        bind_panelEventDelegationCoordinator(body, 'mouseout', bodyHandlers.mouseout),
        bind_panelEventDelegationCoordinator(tripDetailBody, 'mouseover', tripDetailHandlers.mouseover),
        bind_panelEventDelegationCoordinator(tripDetailBody, 'mouseout', tripDetailHandlers.mouseout),
        bind_panelEventDelegationCoordinator(tripDetailBody, 'mouseleave', tripDetailHandlers.mouseleave),
        bind_panelEventDelegationCoordinator(tripDetailBody, 'pointerdown', tripDetailHandlers.pointerdown, { passive: true })
    ];

    return {
        destroy() {
            while (unbinders.length) {
                const unbind = unbinders.pop();
                try {
                    unbind?.();
                } catch {
                    // ignore teardown errors from detached test doubles or DOM nodes
                }
            }
        }
    };
};

// panelHoverRestoreRuntime.js
const defaultToText_panelHoverRestoreRuntime = (value) => String(value ?? '').trim();

export const createPanelHoverRestoreRuntime = ({
    setTimeoutFn = globalThis.setTimeout,
    clearTimeoutFn = globalThis.clearTimeout,
    restoreDelayMs = 60,
    getLastAppliedHoverKey = () => null,
    setLastAppliedHoverKey = () => {},
    onRestoreStationLines = null,
    getCurrentStationServingIds = () => [],
    getCurrentStationId = () => null,
    toText = defaultToText_panelHoverRestoreRuntime
} = {}) => {
    let hoverTimerId = null;
    let restoreTimerId = null;

    const clearHoverTimer = () => {
        if (hoverTimerId != null) {
            clearTimeoutFn?.(hoverTimerId);
            hoverTimerId = null;
        }
    };

    const clearRestoreTimer = () => {
        if (restoreTimerId != null) {
            clearTimeoutFn?.(restoreTimerId);
            restoreTimerId = null;
        }
    };

    const restoreStationLinesIfNeeded = () => {
        if (!getLastAppliedHoverKey?.()) return;
        if (typeof onRestoreStationLines !== 'function') {
            setLastAppliedHoverKey(null);
            return;
        }
        try {
            onRestoreStationLines(
                Array.isArray(getCurrentStationServingIds?.()) ? getCurrentStationServingIds().slice() : [],
                { stationId: toText(getCurrentStationId?.()) || null }
            );
        } catch {
            // ignore restore failures during hover teardown
        }
        setLastAppliedHoverKey(null);
    };

    const scheduleRestoreStationLines = () => {
        if (!getLastAppliedHoverKey?.()) return;
        if (typeof onRestoreStationLines !== 'function') {
            setLastAppliedHoverKey(null);
            return;
        }
        clearRestoreTimer();
        restoreTimerId = setTimeoutFn?.(() => {
            restoreTimerId = null;
            restoreStationLinesIfNeeded();
        }, restoreDelayMs);
    };

    const scheduleHoverTimer = (callback, delayMs) => {
        clearHoverTimer();
        hoverTimerId = setTimeoutFn?.(() => {
            hoverTimerId = null;
            callback?.();
        }, delayMs);
        return hoverTimerId;
    };

    return {
        clearHoverTimer,
        clearRestoreTimer,
        restoreStationLinesIfNeeded,
        scheduleHoverTimer,
        scheduleRestoreStationLines
    };
};

// panelIntentController.js
const noop_panelIntentController = () => {};

export const createPanelIntentController = ({
    captureElement = null
} = {}) => {
    const captureTripDetail = async ({
        root,
        filenameBase,
        buttonEl
    } = {}) => {
        if (typeof captureElement !== 'function' || !root) return false;
        await captureElement(root, filenameBase, buttonEl);
        return true;
    };

    const requestDirectionPrint = (printRequests, lineId, dirKey) => (
        printRequests?.requestDirectionTimetable?.(lineId, dirKey) === true
    );

    const requestAllPrint = (printRequests) => (
        printRequests?.requestAllTimetables?.() === true
    );

    const bindRouteMapPopoverHover = (target, {
        onEnter = noop_panelIntentController,
        onLeave = noop_panelIntentController
    } = {}) => {
        if (!target || typeof target.addEventListener !== 'function') {
            return noop_panelIntentController;
        }

        const handleEnter = (event) => onEnter(event);
        const handleLeave = (event) => onLeave(event);

        target.addEventListener('__TokyoRailRouteMapPopoverHoverEnter', handleEnter);
        target.addEventListener('__TokyoRailRouteMapPopoverHoverLeave', handleLeave);

        return () => {
            target.removeEventListener?.('__TokyoRailRouteMapPopoverHoverEnter', handleEnter);
            target.removeEventListener?.('__TokyoRailRouteMapPopoverHoverLeave', handleLeave);
        };
    };

    return {
        bindRouteMapPopoverHover,
        captureTripDetail,
        requestAllPrint,
        requestDirectionPrint
    };
};

// panelIntentDispatcher.js
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

// panelIntentTargetParser.js
const defaultToText_panelIntentTargetParser = (value) => String(value ?? '').trim();

export const findPanelTripTarget = (target, {
    elementCtor = globalThis.Element
} = {}) => {
    if (!(target instanceof elementCtor)) return null;
    return target.closest?.('.panel-timetable-row[data-trip-key], .panel-grid-cell[data-trip-key]') || null;
};

export const resolvePanelInteractionKeyFromTarget = (target, {
    body,
    findTripTarget = findPanelTripTarget,
    getDirFilterButtonTarget = () => null,
    getDirPrintButtonTarget = () => null,
    getDirTitleTarget = () => null,
    getDirTriangleTarget = () => null,
    getLineTarget = () => '',
    getCompanyTarget = () => '',
    makeLineDirKey = () => '',
    toText = defaultToText_panelIntentTargetParser
} = {}) => {
    const rowEl = findTripTarget(target);
    if (rowEl && body?.contains?.(rowEl)) {
        const lineEl = rowEl.closest?.('[data-line-id]');
        const lineId = lineEl?.getAttribute?.('data-line-id');
        const tripKey = rowEl.getAttribute?.('data-trip-key');
        if (lineId && tripKey) return `trip:${String(lineId)}||${String(tripKey)}`;
    }

    const dirFilter = getDirFilterButtonTarget(target);
    if (dirFilter) return `dir:${makeLineDirKey(dirFilter.lineId, dirFilter.dirKey)}`;

    const dirPrint = getDirPrintButtonTarget(target);
    if (dirPrint) return `dir:${makeLineDirKey(dirPrint.lineId, dirPrint.dirKey)}`;

    const dirTitle = getDirTitleTarget(target);
    if (dirTitle) return `dir:${makeLineDirKey(dirTitle.lineId, dirTitle.dirKey)}`;

    const dirTriangle = getDirTriangleTarget(target);
    if (dirTriangle) return `dir:${makeLineDirKey(dirTriangle.lineId, dirTriangle.dirKey)}`;

    const lineId = getLineTarget(target);
    if (lineId) return `line:${String(lineId)}`;

    const company = getCompanyTarget(target);
    if (company) return `company:${String(company)}`;

    return toText('');
};

export const resolvePanelMousePrimaryTarget = (target, {
    getDirTitleTarget = () => null,
    getLineTarget = () => '',
    getCompanyTarget = () => '',
    makeLineDirKey = () => ''
} = {}) => {
    const dirTitle = getDirTitleTarget(target);
    if (dirTitle) {
        const key = makeLineDirKey(dirTitle.lineId, dirTitle.dirKey);
        return { kind: 'dir', key: `dir:${key}`, lineId: dirTitle.lineId, dirKey: dirTitle.dirKey, lineDirKey: key };
    }

    const lineId = getLineTarget(target);
    if (lineId) return { kind: 'line', key: `line:${String(lineId)}`, lineId: String(lineId) };

    const companyName = getCompanyTarget(target);
    if (companyName) return { kind: 'company', key: `company:${String(companyName)}`, companyName: String(companyName) };

    return null;
};

// panelMapSelectController.js
export const createPanelMapSelectController = ({
    doc = globalThis.document,
    stopEvent = (event) => event?.preventDefault?.(),
    loadIcon = () => {},
    onSelectField = () => {},
    labels = {}
} = {}) => {
    const root = doc.createElement('div');
    root.className = 'panel-map-select-ui';

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'panel-map-select-btn';
    button.setAttribute('data-panel-map-select-btn', '1');
    button.setAttribute('aria-label', labels.button || 'Add station to journey');

    const icon = doc.createElement('img');
    icon.className = 'panel-map-select-icon';
    icon.alt = '';
    button.appendChild(icon);
    try {
        loadIcon(icon);
    } catch {
        // ignore
    }

    const menu = doc.createElement('div');
    menu.className = 'panel-map-select-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', labels.menu || 'Use station as origin or destination');

    const originItem = doc.createElement('button');
    originItem.type = 'button';
    originItem.className = 'panel-map-select-item';
    originItem.textContent = labels.origin || 'Origin';
    originItem.setAttribute('role', 'menuitem');

    const destinationItem = doc.createElement('button');
    destinationItem.type = 'button';
    destinationItem.className = 'panel-map-select-item';
    destinationItem.textContent = labels.destination || 'Destination';
    destinationItem.setAttribute('role', 'menuitem');

    menu.appendChild(originItem);
    menu.appendChild(destinationItem);
    root.appendChild(button);
    root.appendChild(menu);

    const open = () => {
        root.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
    };

    const close = () => {
        root.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
    };

    const isOpen = () => root.classList.contains('is-open');

    const toggle = () => {
        if (isOpen()) close();
        else open();
    };

    let hoverCloseTimer = null;
    const cancelHoverClose = () => {
        if (hoverCloseTimer == null) return;
        clearTimeout(hoverCloseTimer);
        hoverCloseTimer = null;
    };

    const scheduleHoverClose = (delayMs = 200) => {
        cancelHoverClose();
        hoverCloseTimer = setTimeout(() => {
            hoverCloseTimer = null;
            close();
        }, Math.max(0, Number(delayMs) || 0));
    };

    button.addEventListener('mouseenter', () => {
        cancelHoverClose();
        open();
    });
    button.addEventListener('mouseleave', () => {
        scheduleHoverClose(220);
    });
    menu.addEventListener('mouseenter', () => {
        cancelHoverClose();
        open();
    });
    menu.addEventListener('mouseleave', () => {
        scheduleHoverClose(220);
    });

    let lastPointerDownAt = 0;
    button.addEventListener('pointerdown', (event) => {
        stopEvent(event);
        lastPointerDownAt = Date.now();
        toggle();
    }, { passive: false });
    button.addEventListener('click', (event) => {
        stopEvent(event);
        if (Date.now() - lastPointerDownAt < 700) return;
        toggle();
    }, { passive: false });

    const select = (field, event) => {
        stopEvent(event);
        close();
        onSelectField(field);
    };

    originItem.addEventListener('click', (event) => {
        select('origin', event);
    }, { passive: false });
    destinationItem.addEventListener('click', (event) => {
        select('destination', event);
    }, { passive: false });

    doc.addEventListener('pointerdown', (event) => {
        if (!isOpen()) return;
        const target = event?.target;
        if (target && root.contains(target)) return;
        close();
    }, true);

    return {
        close,
        el: root,
        isOpen,
        open,
        toggle
    };
};

// panelPinnedTripDetailState.js
const defaultToText_panelPinnedTripDetailState = (value) => String(value ?? '').trim();

export const createPanelPinnedTripDetailState = ({
    toText = defaultToText_panelPinnedTripDetailState,
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

// panelRoutePreviewController.js
const defaultToText_panelRoutePreviewController = (value) => String(value ?? '').trim();

export const createPanelRoutePreviewController = ({
    clearTripPathPreviewBySource = () => false,
    previewSource = 'panel-dir-branch',
    requestRoutePreview = previewBranchesForLine,
    toText = defaultToText_panelRoutePreviewController
} = {}) => {
    let activeKey = '';
    let requestSeq = 0;

    const applyDirectionPreview = async ({
        currentStationIds = [],
        fitMode = '',
        force = false,
        key,
        meta,
        onEnter = null,
        sourceLineIds = [],
        targetTripKeys = [],
        throughServiceCategory = ''
    } = {}) => {
        const nextKey = toText(key);
        if (!nextKey || !meta) return false;
        if (!force && activeKey === nextKey) return false;
        activeKey = nextKey;

        const normalizedSourceLineIds = Array.isArray(sourceLineIds)
            ? sourceLineIds.map((x) => toText(x)).filter(Boolean)
            : [];
        const originStationIds = Array.isArray(meta.originStationIds) ? meta.originStationIds.slice() : [];
        const terminalStationIds = Array.isArray(meta.terminalStationIds) ? meta.terminalStationIds.slice() : [];
        const normalizedCurrentStationIds = Array.isArray(currentStationIds)
            ? currentStationIds.map((x) => toText(x)).filter(Boolean)
            : [];

        try {
            onEnter?.({
                currentStationIds: normalizedCurrentStationIds.slice(),
                fitMode: toText(fitMode),
                lineId: toText(meta.lineId),
                originStationIds,
                sourceLineIds: normalizedSourceLineIds.slice(),
                terminalStationIds
            });
        } catch {
            // keep preview request behavior independent from optional UI callbacks
        }

        const seq = ++requestSeq;
        const highlightStationIds = Array.from(new Set([
            ...originStationIds,
            ...terminalStationIds,
            ...normalizedCurrentStationIds
        ].map((x) => toText(x)).filter(Boolean)));

        try {
            await requestRoutePreview({
                fitMode: toText(fitMode),
                highlightStationIds,
                lineId: toText(meta.lineId),
                lineName: '',
                originStationIds,
                previewSource,
                sourceLineIds: normalizedSourceLineIds,
                targetTripKeys: Array.isArray(targetTripKeys) ? targetTripKeys.slice() : [],
                terminalStationIds,
                throughServiceCategory: toText(throughServiceCategory)
            });
        } catch {
            if (seq === requestSeq) {
                clearTripPathPreviewBySource(previewSource);
            }
        }

        return seq === requestSeq;
    };

    const clearDirectionPreview = ({ onLeave = null } = {}) => {
        if (!activeKey) return false;
        activeKey = '';
        requestSeq += 1;
        try {
            onLeave?.();
        } catch {
            // keep clear behavior independent from optional UI callbacks
        }
        clearTripPathPreviewBySource(previewSource);
        return true;
    };

    return {
        applyDirectionPreview,
        clearDirectionPreview,
        getActiveKey: () => activeKey,
        getRequestSeq: () => requestSeq,
        previewSource
    };
};

// panelSelectionStateController.js
const defaultToText_panelSelectionStateController = (value) => String(value ?? '').trim();

export const createPanelSelectionStateController = ({ toText = defaultToText_panelSelectionStateController } = {}) => {
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

// panelTouchInteractionController.js
export const readPointerType = (evt) => {
    const pt = evt?.pointerType;
    if (pt) return String(pt);
    const t = evt?.type;
    if (t && String(t).startsWith('touch')) return 'touch';
    return 'mouse';
};

export const isTouchLikePointer = (pt) => pt === 'touch' || pt === 'pen';

export const createPanelTouchInteractionController = ({
    cancelClickSuppressMs = 260,
    cancelHoverSuppressMs = 1000,
    maxMovePx = 12,
    mouseSuppressMs = 800,
    now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now())
} = {}) => {
    const maxMoveSq = maxMovePx * maxMovePx;
    let lastPointerType = 'mouse';
    let pendingTripTap = null;
    let suppressMouseClickUntilMs = 0;
    let suppressMouseEventsUntilMs = 0;
    let suppressMouseHoverUntilMs = 0;

    const markPointer = (evt) => {
        lastPointerType = readPointerType(evt);
        return lastPointerType;
    };

    const pointerMatchesPending = (evt, pending) => {
        const pendingPointerId = pending?.pointerId;
        const evtPointerId = evt?.pointerId;
        return !(pendingPointerId != null && evtPointerId != null && pendingPointerId !== evtPointerId);
    };

    const beginPointer = (evt) => {
        const pointerType = markPointer(evt);
        const isTouchLike = isTouchLikePointer(pointerType);
        if (isTouchLike) {
            suppressMouseEventsUntilMs = now() + mouseSuppressMs;
            pendingTripTap = null;
        }
        return { isTouchLike, pointerType };
    };

    const startTripTap = (evt, payload = {}) => {
        pendingTripTap = {
            pointerId: evt?.pointerId,
            startX: evt?.clientX ?? 0,
            startY: evt?.clientY ?? 0,
            moved: false,
            ...payload
        };
        return pendingTripTap;
    };

    const moveTripTap = (evt) => {
        if (!pendingTripTap) return { handled: false };
        const pointerType = readPointerType(evt);
        if (!isTouchLikePointer(pointerType)) return { handled: false, pointerType };
        if (!pointerMatchesPending(evt, pendingTripTap)) return { handled: false, pointerMismatch: true, pointerType };

        const dx = (evt?.clientX ?? pendingTripTap.startX) - pendingTripTap.startX;
        const dy = (evt?.clientY ?? pendingTripTap.startY) - pendingTripTap.startY;
        if ((dx * dx + dy * dy) > maxMoveSq) {
            pendingTripTap.moved = true;
        }
        return { handled: true, pointerType, tap: pendingTripTap };
    };

    const finishTripTap = (evt) => {
        const pending = pendingTripTap;
        if (!pending) return { handled: false };

        const pointerType = markPointer(evt);
        if (!isTouchLikePointer(pointerType)) {
            pendingTripTap = null;
            return { handled: false, pointerType };
        }

        if (!pointerMatchesPending(evt, pending)) {
            return { handled: false, pointerMismatch: true, pointerType };
        }

        pendingTripTap = null;
        const dx = (evt?.clientX ?? pending.startX) - pending.startX;
        const dy = (evt?.clientY ?? pending.startY) - pending.startY;
        const moved = pending.moved || (dx * dx + dy * dy) > maxMoveSq;

        return {
            clientX: evt?.clientX || pending.startX,
            clientY: evt?.clientY || pending.startY,
            handled: true,
            moved,
            pointerType,
            tap: pending
        };
    };

    const armCancelInteractionSuppression = () => {
        const base = now();
        suppressMouseClickUntilMs = base + cancelClickSuppressMs;
        suppressMouseHoverUntilMs = base + cancelHoverSuppressMs;
    };

    return {
        armCancelInteractionSuppression,
        beginPointer,
        cancelTripTap() {
            pendingTripTap = null;
        },
        finishTripTap,
        getLastPointerType: () => lastPointerType,
        hasPendingTripTap: () => !!pendingTripTap,
        isLastPointerTouchLike: () => isTouchLikePointer(lastPointerType),
        isTouchLikePointer,
        markPointer,
        moveTripTap,
        readPointerType,
        shouldSuppressMouseClick: () => now() < suppressMouseClickUntilMs,
        shouldSuppressMouseEvents: () => now() < suppressMouseEventsUntilMs,
        shouldSuppressMouseHover: () => now() < suppressMouseHoverUntilMs,
        startTripTap
    };
};

