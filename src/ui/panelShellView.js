const DEFAULT_DESKTOP_HIDDEN_TRANSFORM = 'translateX(calc(100% + 24px))';
const DEFAULT_MOBILE_HIDDEN_TRANSFORM = 'translateY(calc(100% + 24px))';
const DEFAULT_MOBILE_COLLAPSED_PEEK_PX = 86;
const MOBILE_DRAG_THRESHOLD_PX = 48;

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
    widthPx = 360,
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
    root.style.maxWidth = 'calc(100vw - 20px)';
    root.style.transform = DEFAULT_DESKTOP_HIDDEN_TRANSFORM;
    root.style.transition = 'transform 0.2s ease';

    const layout = () => {
        const heightSource = Number(win?.innerHeight) || 0;
        const top = Math.round(heightSource * 0.05);
        const height = Math.round(heightSource * 0.9);
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
    let dragStartOffset = 0;
    let dragCurrentOffset = 0;
    let dragStartedCollapsed = false;
    let dragStartedHalf = false;
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

    const getCollapsedOffset = () => Math.max(0, lastLayoutHeight - peekPx);
    const getHalfOffset = () => Math.max(0, Math.round(lastLayoutHeight * 0.5));
    const clampOffset = (value) => Math.max(0, Math.min(getCollapsedOffset(), Number(value) || 0));
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
        const height = Math.round(heightSource * 0.88);
        lastLayoutHeight = height;
        root.style.top = 'auto';
        root.style.height = `${height}px`;
        root.style.maxHeight = 'calc(100vh - env(safe-area-inset-top, 0px) - 12px)';
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
        beginMobileDrag() {
            if (!visible) return false;
            dragStartedCollapsed = collapsed === true;
            dragStartedHalf = halfCollapsed === true;
            dragStartOffset = collapsed ? getCollapsedOffset() : (halfCollapsed ? getHalfOffset() : 0);
            dragCurrentOffset = dragStartOffset;
            root.setAttribute('data-panel-mobile-dragging', '1');
            setTransitionEnabled(false);
            return true;
        },
        updateMobileDrag(deltaY = 0) {
            if (!visible) return false;
            dragCurrentOffset = clampOffset(dragStartOffset + deltaY);
            root.style.transform = `translateY(${dragCurrentOffset}px)`;
            return true;
        },
        endMobileDrag(deltaY = 0) {
            if (!visible) return 'hidden';
            root.removeAttribute('data-panel-mobile-dragging');
            setTransitionEnabled(true);

            const dragDelta = Number(deltaY) || 0;
            const shouldExpand = dragStartedCollapsed && dragDelta < -MOBILE_DRAG_THRESHOLD_PX;
            const shouldCollapse = !dragStartedCollapsed && !dragStartedHalf && (
                dragDelta > MOBILE_DRAG_THRESHOLD_PX ||
                dragCurrentOffset > getCollapsedOffset() * 0.4
            );
            const shouldExpandFromHalf = dragStartedHalf && dragDelta < -MOBILE_DRAG_THRESHOLD_PX;
            const shouldCollapseFromHalf = dragStartedHalf && dragDelta > MOBILE_DRAG_THRESHOLD_PX;

            if (shouldExpand || shouldExpandFromHalf) {
                expand();
                return 'expanded';
            }

            if (shouldCollapseFromHalf) {
                collapse();
                return 'collapsed';
            }

            if (shouldCollapse) {
                collapse();
                return 'collapsed';
            }

            if (dragStartedCollapsed) {
                collapse();
                return 'collapsed';
            }

            if (dragStartedHalf) {
                collapseHalf();
                return 'half';
            }

            expand();
            return 'expanded';
        },
        getClickRegion: createPanelShellClickRegion(contains),
        getMobileState: () => (visible ? (collapsed ? 'collapsed' : (halfCollapsed ? 'half' : 'expanded')) : 'hidden'),
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
