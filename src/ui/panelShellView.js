const DEFAULT_DESKTOP_HIDDEN_TRANSFORM = 'translateX(calc(100% + 24px))';
const DEFAULT_MOBILE_HIDDEN_TRANSFORM = 'translateY(calc(100% + 24px))';

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
    zIndex = 4000
} = {}) => {
    if (!documentRef?.createElement) {
        throw new Error('createMobilePanelShell requires documentRef');
    }

    const root = documentRef.createElement('div');
    let visible = false;
    root.setAttribute('data-panel-root', '');
    root.setAttribute('data-panel-presentation', 'mobile');
    root.style.position = 'fixed';
    root.style.left = '0';
    root.style.right = '0';
    root.style.bottom = '0';
    root.style.zIndex = String(zIndex);
    root.style.width = '100%';
    root.style.maxWidth = 'none';
    root.style.transform = DEFAULT_MOBILE_HIDDEN_TRANSFORM;
    root.style.transition = 'transform 0.22s ease';

    const layout = () => {
        const heightSource = Number(win?.innerHeight) || 0;
        const height = Math.round(heightSource * 0.88);
        root.style.top = 'auto';
        root.style.height = `${height}px`;
        root.style.maxHeight = 'calc(100vh - env(safe-area-inset-top, 0px) - 12px)';
        root.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
        return { top: null, height, presentation: 'mobile' };
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
            root.style.transform = 'translateY(0)';
        },
        hide() {
            visible = false;
            root.style.transform = DEFAULT_MOBILE_HIDDEN_TRANSFORM;
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
