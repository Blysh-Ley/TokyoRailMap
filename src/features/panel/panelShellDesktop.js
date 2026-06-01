const DEFAULT_HIDDEN_TRANSFORM = 'translateX(calc(100% + 24px))';

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
    root.style.position = 'fixed';
    root.style.right = `${rightPx}px`;
    root.style.zIndex = String(zIndex);
    root.style.width = `${widthPx}px`;
    root.style.maxWidth = 'calc(100vw - 20px)';
    root.style.transform = DEFAULT_HIDDEN_TRANSFORM;
    root.style.transition = 'transform 0.2s ease';

    const layout = () => {
        const heightSource = Number(win?.innerHeight) || 0;
        const top = Math.round(heightSource * 0.1);
        const height = Math.round(heightSource * 0.8);
        root.style.top = `${top}px`;
        root.style.height = `${height}px`;
        return { top, height };
    };

    const contains = (target) => Boolean(target && root.contains?.(target));

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

    const isWithinAnyElement = (target, elements = []) => (
        elements.some((element) => Boolean(element && target && element.contains?.(target)))
    );

    const matchesAnyPredicate = (target, predicates = []) => (
        predicates.some((predicate) => {
            try {
                return typeof predicate === 'function' && predicate(target) === true;
            } catch {
                return false;
            }
        })
    );

    const getClickRegion = (target, {
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

    return {
        root,
        contains,
        getClickRegion,
        isVisible: () => visible,
        layout,
        show() {
            visible = true;
            root.style.transform = 'translateX(0)';
        },
        hide() {
            visible = false;
            root.style.transform = DEFAULT_HIDDEN_TRANSFORM;
        }
    };
};
