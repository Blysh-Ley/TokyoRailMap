import {
    DEFAULT_MOBILE_SHEET_PEEK_PX,
    createMobileSheetDragSession,
    getMobileSheetOffsetForState,
    resolveMobileSheetDragTarget,
    updateMobileSheetDragSession
} from './mobileSheetSnap.js';

const DEFAULT_DESKTOP_HIDDEN_TRANSFORM = 'translateX(calc(100% + 24px))';
const DEFAULT_DESKTOP_VERTICAL_INSET_PX = 60;
const DEFAULT_MOBILE_HIDDEN_TRANSFORM = 'translateY(calc(100% + 24px))';
const DEFAULT_MOBILE_COLLAPSED_PEEK_PX = DEFAULT_MOBILE_SHEET_PEEK_PX;
const DEFAULT_MOBILE_EXPANDED_HEIGHT = 'min(88vh, calc(100vh - var(--mobile-expanded-sheet-top-clearance)))';
const MOBILE_FOLDABLE_MIN_WIDTH_PX = 700;

const isWithinAnyElement = (target, elements = []) => (
    elements.some((element) => Boolean(element && target && element.contains?.(target)))
);

const matchesAnySelector = (target, selectors = []) => {
    if (!target?.closest) return false;
    return selectors.some((selector) => {
        try {
            return Boolean(selector && target.closest(selector));
        } catch {
            return false;
        }
    });
};

const matchesAnyPredicate = (target, predicates = []) => (
    predicates.some((predicate) => {
        try {
            return typeof predicate === 'function' && predicate(target) === true;
        } catch {
            return false;
        }
    })
);

const createPanelShellClickRegion = (contains) => (target, {
    ignoredElements = [],
    ignoredSelectors = [],
    ignoredPredicates = [],
    insideElements = [],
    insidePredicates = []
} = {}) => {
    const ignored = isWithinAnyElement(target, ignoredElements) ||
        matchesAnySelector(target, ignoredSelectors) ||
        matchesAnyPredicate(target, ignoredPredicates);
    const insidePanel = contains(target);
    const insideExtra = isWithinAnyElement(target, insideElements) ||
        matchesAnyPredicate(target, insidePredicates);

    return {
        ignored,
        insideExtra,
        insidePanel,
        insidePanelOrExtra: insidePanel || insideExtra
    };
};

export const createDesktopPanelShell = ({
    documentRef = globalThis.document,
    win = globalThis.window,
    rightPx = 10,
    widthPx = 380,
    zIndex = 4000
} = {}) => {
    if (!documentRef?.createElement) {
        throw new Error('createDesktopPanelShell requires documentRef');
    }

    const root = documentRef.createElement('div');
    let visible = false;
    root.setAttribute('data-panel-root', '');
    root.setAttribute('data-panel-presentation', 'desktop');
    root.style.position = 'fixed';
    root.style.right = `${rightPx}px`;
    root.style.zIndex = String(zIndex);
    root.style.width = `${widthPx}px`;
    //root.style.maxWidth = 'calc(100vw - 20px)';
    root.style.transform = DEFAULT_DESKTOP_HIDDEN_TRANSFORM;
    root.style.transition = 'transform 0.2s ease';

    const layout = () => {
        const heightSource = Number(win?.innerHeight) || 0;
        const inset = DEFAULT_DESKTOP_VERTICAL_INSET_PX;
        const height = Math.max(0, Math.round(heightSource - inset * 2));
        const top = Math.max(0, Math.round((heightSource - height) / 2));
        root.style.top = `${top}px`;
        root.style.height = `${height}px`;
        return { top, height, presentation: 'desktop' };
    };

    const contains = (target) => Boolean(target && root.contains?.(target));

    return {
        root,
        contains,
        getClickRegion: createPanelShellClickRegion(contains),
        isVisible: () => visible,
        layout,
        show() {
            visible = true;
            root.style.transform = 'translateX(0)';
        },
        hide() {
            visible = false;
            root.style.transform = DEFAULT_DESKTOP_HIDDEN_TRANSFORM;
        }
    };
};

export const createMobilePanelShell = ({
    documentRef = globalThis.document,
    win = globalThis.window,
    zIndex = 4000,
    collapsedPeekPx = DEFAULT_MOBILE_COLLAPSED_PEEK_PX
} = {}) => {
    if (!documentRef?.createElement) {
        throw new Error('createMobilePanelShell requires documentRef');
    }

    const root = documentRef.createElement('div');
    let visible = false;
    let collapsed = false;
    let halfCollapsed = false;
    let lastLayoutHeight = 0;
    let dragSession = null;
    let dragUsesLegacyDelta = false;
    const peekPx = Number.isFinite(collapsedPeekPx) ? Math.max(48, Number(collapsedPeekPx)) : DEFAULT_MOBILE_COLLAPSED_PEEK_PX;
    root.setAttribute('data-panel-root', '');
    root.setAttribute('data-panel-presentation', 'mobile');
    root.setAttribute('data-panel-mobile-state', 'hidden');
    root.style.position = 'fixed';
    root.style.left = '0';
    root.style.right = '0';
    root.style.bottom = '0';
    root.style.zIndex = String(zIndex);
    root.style.width = '100%';
    root.style.maxWidth = 'none';
    root.style.transform = DEFAULT_MOBILE_HIDDEN_TRANSFORM;
    root.style.transition = 'transform 0.22s ease';
    root.style.overflow = 'hidden';
    root.style.setProperty('--panel-mobile-peek-height', `${peekPx}px`);

    const isFoldableWidth = () => {
        const width = Number(win?.innerWidth);
        return Number.isFinite(width) && width >= MOBILE_FOLDABLE_MIN_WIDTH_PX;
    };
    const syncFoldableWidth = () => {
        const half = isFoldableWidth();
        root.style.left = '0';
        root.style.right = half ? 'auto' : '0';
        root.style.width = half ? '50vw' : '100%';
        root.style.maxWidth = half ? '50vw' : 'none';
    };
    syncFoldableWidth();

    const getSnapOptions = () => ({ height: lastLayoutHeight || Number(win?.innerHeight) || 1, peekPx });
    const getCollapsedOffset = () => getMobileSheetOffsetForState('collapsed', getSnapOptions());
    const getHalfOffset = () => getMobileSheetOffsetForState('half', getSnapOptions());
    const getCurrentState = () => (visible ? (collapsed ? 'collapsed' : (halfCollapsed ? 'half' : 'expanded')) : 'hidden');
    const getCurrentOffset = () => {
        if (!visible) return getCollapsedOffset();
        if (collapsed) return getCollapsedOffset();
        if (halfCollapsed) return getHalfOffset();
        return 0;
    };
    const setTransitionEnabled = (enabled) => {
        root.style.transition = enabled ? 'transform 0.22s ease' : 'none';
    };
    const applyState = (state, { transition = true } = {}) => {
        setTransitionEnabled(transition);
        root.setAttribute('data-panel-mobile-state', state);

        if (state === 'hidden') {
            root.style.transform = DEFAULT_MOBILE_HIDDEN_TRANSFORM;
            return;
        }

        if (state === 'collapsed') {
            root.style.transform = `translateY(${getCollapsedOffset()}px)`;
            return;
        }

        if (state === 'half') {
            root.style.transform = `translateY(${getHalfOffset()}px)`;
            return;
        }

        root.style.transform = 'translateY(0)';
    };

    const layout = () => {
        const heightSource = Number(win?.innerHeight) || 0;
        const fallbackHeight = Math.round(heightSource * 0.88);
        root.style.height = DEFAULT_MOBILE_EXPANDED_HEIGHT;
        root.style.maxHeight = 'calc(100vh - var(--mobile-expanded-sheet-top-clearance))';
        const measuredHeight = Number(root.getBoundingClientRect?.().height) || 0;
        const height = measuredHeight > 0 ? Math.round(measuredHeight) : fallbackHeight;
        lastLayoutHeight = height;
        syncFoldableWidth();
        root.style.top = 'auto';
        root.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';

        if (!visible) {
            applyState('hidden', { transition: false });
        } else if (collapsed) {
            applyState('collapsed', { transition: false });
        } else if (halfCollapsed) {
            applyState('half', { transition: false });
        } else {
            applyState('expanded', { transition: false });
        }

        return { top: null, height, presentation: 'mobile' };
    };

    const contains = (target) => Boolean(target && root.contains?.(target));
    const collapse = () => {
        if (!visible) return false;
        visible = true;
        collapsed = true;
        halfCollapsed = false;
        applyState('collapsed');
        return true;
    };
    const collapseHalf = () => {
        if (!visible) return false;
        visible = true;
        collapsed = false;
        halfCollapsed = true;
        applyState('half');
        return true;
    };
    const expand = () => {
        visible = true;
        collapsed = false;
        halfCollapsed = false;
        applyState('expanded');
        return true;
    };

    return {
        root,
        contains,
        collapse,
        collapseHalf,
        expand,
        beginMobileDrag(options = {}) {
            if (!visible) return false;
            const startY = typeof options === 'number' ? 0 : Number(options?.startY) || 0;
            dragUsesLegacyDelta = typeof options === 'number' || Object.keys(options || {}).length === 0;
            dragSession = createMobileSheetDragSession({
                startY,
                startOffset: getCurrentOffset(),
                startState: getCurrentState(),
                ...getSnapOptions(),
                nowMs: dragUsesLegacyDelta ? 0 : (typeof options === 'object' ? options?.nowMs : undefined)
            });
            root.setAttribute('data-panel-mobile-dragging', '1');
            setTransitionEnabled(false);
            return true;
        },
        updateMobileDrag(input = 0) {
            if (!visible || !dragSession) return false;
            const clientY = typeof input === 'number'
                ? dragSession.startY + input
                : Number(input?.clientY) || dragSession.currentY;
            updateMobileSheetDragSession(dragSession, {
                clientY,
                nowMs: dragUsesLegacyDelta ? 1000 : (typeof input === 'object' ? input?.nowMs : undefined)
            });
            root.style.transform = `translateY(${dragSession.currentOffset}px)`;
            return true;
        },
        endMobileDrag(input = 0) {
            if (!visible) return 'hidden';
            root.removeAttribute('data-panel-mobile-dragging');
            setTransitionEnabled(true);

            const clientY = typeof input === 'number'
                ? (dragSession?.startY || 0) + input
                : Number(input?.clientY) || dragSession?.currentY || 0;
            const targetState = resolveMobileSheetDragTarget(dragSession, {
                clientY,
                nowMs: dragUsesLegacyDelta ? 1000 : (typeof input === 'object' ? input?.nowMs : undefined),
                cancelled: typeof input === 'object' && input?.cancelled === true
            });
            dragSession = null;
            dragUsesLegacyDelta = false;
            if (targetState === 'expanded') {
                expand();
                return 'expanded';
            }

            if (targetState === 'half') {
                collapseHalf();
                return 'half';
            }

            collapse();
            return 'collapsed';
        },
        getClickRegion: createPanelShellClickRegion(contains),
        getMobileState: getCurrentState,
        isCollapsed: () => visible && collapsed,
        isHalfCollapsed: () => visible && halfCollapsed,
        isVisible: () => visible,
        layout,
        show() {
            expand();
        },
        hide() {
            visible = false;
            collapsed = false;
            halfCollapsed = false;
            applyState('hidden');
        }
    };
};

export const createPanelShell = ({
    presentation = 'desktop',
    ...options
} = {}) => {
    if (presentation === 'mobile') {
        return createMobilePanelShell(options);
    }
    return createDesktopPanelShell(options);
};
