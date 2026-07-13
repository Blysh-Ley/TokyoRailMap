export const SEARCH_PLANNER_STATE_EVENT = 'tokyoRail:searchPlannerState';

const state = {
    searchRoot: null,
    journeyRoot: null,
    originControl: null,
    originDragHandle: null,
    swapButton: null,
    toggleButton: null,
    expanded: false
};

const getDoc = () => state.searchRoot?.ownerDocument || state.journeyRoot?.ownerDocument || globalThis.document || null;

const setDatasetFlag = (doc, expanded) => {
    const value = expanded ? '1' : '';
    for (const node of [doc?.documentElement, doc?.body]) {
        if (!node?.dataset) continue;
        if (value) node.dataset.searchPlannerExpanded = value;
        else delete node.dataset.searchPlannerExpanded;
    }
};

const syncMobileSearchFocus = (doc, expanded) => {
    const rootDataset = doc?.documentElement?.dataset || {};
    const bodyDataset = doc?.body?.dataset || {};
    const mobileSearchActive = (rootDataset.mobileUi === '1' || bodyDataset.mobileUi === '1')
        && (rootDataset.mobileNavActive === 'search' || bodyDataset.mobileNavActive === 'search');
    if (!mobileSearchActive) return;

    const mode = expanded ? 'journey' : 'station';
    if (doc?.documentElement?.dataset) {
        doc.documentElement.dataset.mobileSearchMode = mode;
        doc.documentElement.dataset.mobileSearchFocus = mode;
    }
    if (doc?.body?.dataset) {
        doc.body.dataset.mobileSearchMode = mode;
        doc.body.dataset.mobileSearchFocus = mode;
    }
};

const syncToggleButton = () => {
    const button = state.toggleButton;
    if (!button) return;
    button.setAttribute('aria-expanded', state.expanded ? 'true' : 'false');
    button.setAttribute('aria-label', state.expanded ? '收起路线规划' : '展开路线规划');
    button.textContent = state.expanded ? '−' : '+';
};

const attachJourneyRoot = () => {
    const searchRoot = state.searchRoot;
    const journeyRoot = state.journeyRoot;
    if (!searchRoot || !journeyRoot || searchRoot.contains(journeyRoot)) return;
    const beforeNode = searchRoot.querySelector?.('.search-results') || null;
    searchRoot.insertBefore(journeyRoot, beforeNode);
};

const attachOriginControls = () => {
    const searchRoot = state.searchRoot;
    const bar = searchRoot?.querySelector?.('.search-bar') || null;
    if (!bar) return;
    const beforeNode = state.toggleButton && bar.contains(state.toggleButton) ? state.toggleButton : null;
    if (state.originDragHandle && !bar.contains(state.originDragHandle)) {
        bar.insertBefore(state.originDragHandle, beforeNode);
    }
    if (state.originControl && !bar.contains(state.originControl)) {
        bar.insertBefore(state.originControl, beforeNode);
    }
    if (state.swapButton && !bar.contains(state.swapButton)) {
        bar.insertBefore(state.swapButton, beforeNode);
    }
};

const dispatchStateEvent = (doc) => {
    try {
        doc?.defaultView?.dispatchEvent?.(new CustomEvent(SEARCH_PLANNER_STATE_EVENT, {
            detail: {
                expanded: state.expanded
            }
        }));
    } catch {
        // best effort only
    }
};

const syncShell = ({ focusJourney = false } = {}) => {
    const doc = getDoc();
    attachJourneyRoot();
    attachOriginControls();
    state.searchRoot?.classList?.toggle?.('is-planner-open', state.expanded);
    state.journeyRoot?.classList?.toggle?.('is-collapsed', !state.expanded);
    state.journeyRoot?.setAttribute?.('aria-hidden', state.expanded ? 'false' : 'true');
    setDatasetFlag(doc, state.expanded);
    syncMobileSearchFocus(doc, state.expanded);
    syncToggleButton();
    if (focusJourney && state.expanded) {
        try {
            state.journeyRoot?.querySelector?.('.journey-input-origin')?.focus?.();
        } catch {
            // ignore focus failures
        }
    }
    dispatchStateEvent(doc);
};

export const registerSearchPlannerSearchRoot = ({ root, toggleButton } = {}) => {
    state.searchRoot = root || state.searchRoot;
    state.toggleButton = toggleButton || state.toggleButton;
    syncShell();
    return {
        setExpanded: setSearchPlannerExpanded,
        toggle: toggleSearchPlanner
    };
};

export const registerSearchPlannerJourneyRoot = (root) => {
    state.journeyRoot = root || state.journeyRoot;
    syncShell();
    return {
        setExpanded: setSearchPlannerExpanded,
        toggle: toggleSearchPlanner
    };
};

export const registerSearchPlannerOriginControls = ({ originControl, originDragHandle, swapButton } = {}) => {
    state.originControl = originControl || state.originControl;
    state.originDragHandle = originDragHandle || state.originDragHandle;
    state.swapButton = swapButton || state.swapButton;
    state.originDragHandle?.classList?.add?.('search-planner-origin-drag-handle');
    state.originControl?.classList?.add?.('search-planner-origin-control');
    state.swapButton?.classList?.add?.('search-planner-swap-btn');
    syncShell();
    return {
        setExpanded: setSearchPlannerExpanded,
        toggle: toggleSearchPlanner
    };
};

export const setSearchPlannerExpanded = (expanded, options = {}) => {
    state.expanded = expanded === true;
    syncShell(options);
    return state.expanded;
};

export const toggleSearchPlanner = (options = {}) => (
    setSearchPlannerExpanded(!state.expanded, options)
);

export const isSearchPlannerExpanded = () => state.expanded === true;

export const hideSearchPlannerResultSurfaces = () => {
    state.searchRoot?.querySelector?.('.search-results')?.classList?.add?.('is-hidden');
    state.journeyRoot?.querySelector?.('.journey-results')?.classList?.add?.('is-hidden');
};
