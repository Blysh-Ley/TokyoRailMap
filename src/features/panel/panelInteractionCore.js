import {
    createTouchTapIntentTracker,
    isTouchLikePointer as isTouchLikePointerShared,
    readPointerType as readPointerTypeShared
} from '../../ui/touchTapIntent.js';



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
        waypointIndex,
        stationId,
        stationName
    } = {}) => callSafely_panelCrossFeatureBridgeController(() => {
        const ui = getJourney();
        const methodName = field === 'waypoint'
            ? 'setWaypointStation'
            : (field === 'destination' ? 'setDestinationStation' : 'setOriginStation');
        const method = ui?.[methodName];
        if (typeof method !== 'function') return false;
        method.call(ui, stationId, stationName, { expand: true, recompute: false, waypointIndex });
        return true;
    }) === true;

    const openJourneyPlanner = () => callSafely_panelCrossFeatureBridgeController(() => {
        const openPlanner = getJourney()?.openPlanner;
        if (typeof openPlanner !== 'function') return false;
        openPlanner();
        return true;
    }) === true;

    const getJourneyWaypointOptions = () => callSafely_panelCrossFeatureBridgeController(() => {
        const getOptions = getJourney()?.getWaypointOptions;
        if (typeof getOptions !== 'function') return [];
        const options = getOptions();
        return Array.isArray(options) ? options : [];
    }) || [];

    const isJourneyPlannerOpen = () => callSafely_panelCrossFeatureBridgeController(() => {
        const isOpen = getJourney()?.isPlannerOpen;
        if (typeof isOpen !== 'function') return false;
        return isOpen() === true;
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
        getJourneyWaypointOptions,
        isJourneyPlannerOpen,
        loadTimetableForLineId,
        openJourneyPlanner,
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

export const resolvePanelDirFocusButtonTarget = (target, options = {}) => resolveDirButtonTarget_panelEventDelegationCoordinator(target, {
    ...options,
    selector: '.panel-dir-focus-btn[data-dir-focus-btn]'
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
        bind_panelEventDelegationCoordinator(tripDetailBody, 'click', tripDetailHandlers.click, { passive: false }),
        bind_panelEventDelegationCoordinator(tripDetailBody, 'keydown', tripDetailHandlers.keydown, { passive: false }),
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

export const createPanelDismissController = ({
    clearPinnedPanelState = () => {},
    findTripTarget = () => null,
    getLockedTripKey = () => null,
    getTripDetailPinned = () => false,
    getTripLocked = () => false,
    hasPinnedPanelState = () => false,
    hideTripDetail = () => {},
    ignoredElements = [],
    ignoredSelectors = [],
    insidePredicates = [],
    panelSelectionState,
    panelShell,
    restorePinnedPanelState = null,
    setLastTripDetailKey = () => {},
    tripDetailRoot
} = {}) => {
    const restorePinnedState = typeof restorePinnedPanelState === 'function'
        ? restorePinnedPanelState
        : () => clearPinnedPanelState({ restoreStation: true });

    const handleDocumentClick = (evt) => {
        const target = evt?.target;
        const clickRegion = panelShell?.getClickRegion?.(target, {
            ignoredElements,
            ignoredSelectors,
            insidePredicates
        }) || {};

        const targetIsElement = typeof Element !== 'undefined' && target instanceof Element;
        if (targetIsElement && clickRegion.ignored) return;

        if (hasPinnedPanelState()) {
            if (!clickRegion.insidePanelOrExtra) {
                restorePinnedState();
                return;
            }
        }

        if (!getTripDetailPinned() && !getTripLocked()) return;
        if (target && tripDetailRoot?.contains?.(target)) return;
        if (clickRegion.insidePanel) {
            const rowEl = findTripTarget(target);
            const lineEl = rowEl?.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const tripKey = rowEl?.getAttribute?.('data-trip-key');
            const key = lineId && tripKey ? `${String(lineId)}||${String(tripKey)}` : null;
            if (getTripLocked() && key && key === getLockedTripKey()) return;
            hideTripDetail();
            setLastTripDetailKey(null);
            return;
        }
        hideTripDetail();
        setLastTripDetailKey(null);
    };

    return {
        handleDocumentClick
    };
};

export const createPanelInteractionPolicy = ({
    getPresentation = () => 'desktop',
    touchInteraction
} = {}) => {
    const isMobilePresentation = () => getPresentation?.() === 'mobile';
    const isLastPointerTouchLike = () => touchInteraction?.isLastPointerTouchLike?.() === true;
    const shouldSkipDesktopHover = () => isMobilePresentation() || isLastPointerTouchLike();

    return {
        armCancelInteractionSuppression: () => touchInteraction?.armCancelInteractionSuppression?.(),
        beginPointer: (evt) => touchInteraction?.beginPointer?.(evt) || {},
        cancelTripTap: () => touchInteraction?.cancelTripTap?.(),
        finishTripTap: (evt) => touchInteraction?.finishTripTap?.(evt) || {},
        isLastPointerTouchLike,
        isMobilePresentation,
        markPointer: (evt) => touchInteraction?.markPointer?.(evt),
        moveTripTap: (evt) => touchInteraction?.moveTripTap?.(evt),
        shouldSkipDesktopHover,
        shouldSuppressMouseClick: () => touchInteraction?.shouldSuppressMouseClick?.() === true,
        shouldSuppressMouseEvents: () => touchInteraction?.shouldSuppressMouseEvents?.() === true,
        shouldSuppressMouseHover: () => touchInteraction?.shouldSuppressMouseHover?.() === true,
        startTripTap: (evt, payload) => touchInteraction?.startTripTap?.(evt, payload)
    };
};

// panelStationRestoreController.js
export const createPanelStationRestoreController = ({
    clearPinnedPanelState = () => {},
    restoreStationDefaultSelection = () => {},
    restoreStationLinesIfNeeded = () => {}
} = {}) => ({
    clearPinnedStateAndRestore: () => clearPinnedPanelState({ restoreStation: true }),
    restoreDefaultSelection: () => restoreStationDefaultSelection(),
    restoreHoverSelectionIfNeeded: () => restoreStationLinesIfNeeded()
});

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
    previewDirFilterDirection = () => {},
    toggleDirFilterPopoverFromButton = () => {}
} = {}) => {
    if (!filterTarget) return false;
    previewDirFilterDirection(filterTarget.lineId, filterTarget.dirKey);
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

export const dispatchPanelDirectionFocusIntent = ({
    dirTarget,
    toggleDirectionFocus = () => {}
} = {}) => {
    if (!dirTarget) return false;
    toggleDirectionFocus(dirTarget.lineId, dirTarget.dirKey);
    return true;
};

export const dispatchPanelPrimarySelectionIntent = ({
    primaryTarget,
    mode = 'mouse',
    lastMousePrimaryKey = '',
    clearHoverTimer = () => {},
    resetHoverState = () => {},
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
    getDirFocusButtonTarget = () => null,
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

    const dirFocus = getDirFocusButtonTarget(target);
    if (dirFocus) return `dir:${makeLineDirKey(dirFocus.lineId, dirFocus.dirKey)}`;

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
    getWaypointOptions = () => [],
    isPlannerOpen = () => false,
    loadIcon = () => {},
    onSelectField = () => {},
    onSelectHeatmap = () => {},
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

    root.appendChild(button);
    root.appendChild(menu);

    const createMenuItem = ({ action, text }) => {
        const item = doc.createElement('button');
        item.type = 'button';
        item.className = 'panel-map-select-item';
        item.textContent = text || '';
        item.setAttribute('role', 'menuitem');
        item.addEventListener('click', (event) => {
            select(action, event);
        }, { passive: false });
        return item;
    };

    const rebuildMenu = () => {
        while (menu.firstChild) menu.removeChild(menu.firstChild);
        menu.appendChild(createMenuItem({
            action: { field: 'origin' },
            text: labels.origin || 'Origin'
        }));

        const plannerOpen = typeof isPlannerOpen === 'function' && isPlannerOpen() === true;
        if (plannerOpen) {
            const waypointOptions = typeof getWaypointOptions === 'function' ? getWaypointOptions() : [];
            for (const option of Array.isArray(waypointOptions) ? waypointOptions : []) {
                const index = Number(option?.index);
                if (!Number.isFinite(index) || index < 0) continue;
                menu.appendChild(createMenuItem({
                    action: { field: 'waypoint', waypointIndex: index },
                    text: option?.label || `Waypoint ${index + 1}`
                }));
            }

            menu.appendChild(createMenuItem({
                action: { field: 'waypoint', waypointIndex: -1 },
                text: labels.newWaypoint || 'New waypoint'
            }));
        }

        menu.appendChild(createMenuItem({
            action: { field: 'destination' },
            text: labels.destination || 'Destination'
        }));

        menu.appendChild(createMenuItem({
            action: { type: 'travelHeatmap' },
            text: labels.heatmap || '出行热图'
        }));
    };

    const open = () => {
        rebuildMenu();
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

    const select = (action, event) => {
        stopEvent(event);
        close();
        if (action?.type === 'travelHeatmap') onSelectHeatmap();
        else onSelectField(action);
    };

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

// panelSelectionStateController.js
const defaultToText_panelSelectionStateController = (value) => String(value ?? '').trim();

export const createPanelSelectionStateController = ({ toText = defaultToText_panelSelectionStateController } = {}) => {
    let pinnedPanelSelection = null;

    const normalize = (value) => toText(value);

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
        return '';
    };

    const hasPinnedPanelState = (options = {}) => !!getCurrentPinnedInteractionKey(options);

    const clearPinnedState = () => {
        pinnedPanelSelection = null;
    };

    return {
        clearPinnedPanelSelection,
        clearPinnedState,
        getCurrentPinnedInteractionKey,
        getPinnedPanelSelection,
        hasPinnedPanelState,
        setPinnedPanelSelection
    };
};

// panelTouchInteractionController.js
export const readPointerType = (evt) => {
    return readPointerTypeShared(evt);
};

export const isTouchLikePointer = (pt) => isTouchLikePointerShared(pt);

export const createPanelTouchInteractionController = ({
    cancelClickSuppressMs = 260,
    cancelHoverSuppressMs = 1000,
    maxDurationMs = 500,
    maxMovePx = 12,
    mouseSuppressMs = 800,
    now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now())
} = {}) => {
    const tapTracker = createTouchTapIntentTracker({ maxDurationMs, maxMovePx, now });
    const activeTouchPointers = new Set();
    let lastPointerType = 'mouse';
    let suppressMouseClickUntilMs = 0;
    let suppressMouseEventsUntilMs = 0;
    let suppressMouseHoverUntilMs = 0;

    const markPointer = (evt) => {
        lastPointerType = readPointerType(evt);
        return lastPointerType;
    };

    const beginPointer = (evt) => {
        const pointerType = markPointer(evt);
        const isTouchLike = isTouchLikePointer(pointerType);
        if (isTouchLike) {
            suppressMouseEventsUntilMs = now() + mouseSuppressMs;
            const pointerId = evt?.pointerId;
            if (pointerId != null) activeTouchPointers.add(pointerId);
            if (activeTouchPointers.size > 1) tapTracker.markMultiTouch();
            else tapTracker.cancel();
        }
        return { isTouchLike, pointerType };
    };

    const startTripTap = (evt, payload = {}) => {
        tapTracker.begin(evt, payload);
        if (activeTouchPointers.size > 1) tapTracker.markMultiTouch();
        return payload;
    };

    const moveTripTap = (evt) => {
        return tapTracker.move(evt);
    };

    const finishTripTap = (evt) => {
        const pointerType = markPointer(evt);
        const result = tapTracker.finish(evt);
        const pointerId = evt?.pointerId;
        if (pointerId != null) activeTouchPointers.delete(pointerId);
        return result.handled ? result : { ...result, pointerType };
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
            activeTouchPointers.clear();
            tapTracker.cancel();
        },
        finishTripTap,
        getLastPointerType: () => lastPointerType,
        hasPendingTripTap: () => tapTracker.hasPending(),
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
