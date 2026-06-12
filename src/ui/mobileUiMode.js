const MOBILE_VIEWPORT_MAX_WIDTH_PX = 760;
const COARSE_POINTER_MAX_WIDTH_PX = 900;

const mediaMatches = (win, query) => {
    try {
        return typeof win?.matchMedia === 'function' && win.matchMedia(query).matches === true;
    } catch {
        return false;
    }
};

export const isMobileViewport = (win = globalThis.window) => {
    if (!win) return false;

    if (mediaMatches(win, `(max-width: ${MOBILE_VIEWPORT_MAX_WIDTH_PX}px)`)) return true;

    const isCoarsePointer = mediaMatches(win, '(pointer: coarse)');
    const isCompactTouchViewport = mediaMatches(win, `(max-width: ${COARSE_POINTER_MAX_WIDTH_PX}px)`);
    if (isCoarsePointer && isCompactTouchViewport) return true;

    const width = Number(win.innerWidth);
    return Number.isFinite(width) && width > 0 && width <= MOBILE_VIEWPORT_MAX_WIDTH_PX;
};

const setMobileUiDataset = (doc, isMobile) => {
    const value = isMobile ? '1' : '0';
    const root = doc?.documentElement || null;
    const body = doc?.body || null;
    if (root?.dataset) root.dataset.mobileUi = value;
    if (body?.dataset) body.dataset.mobileUi = value;
};

export const createMobileUiModeController = ({
    doc = globalThis.document,
    win = globalThis.window,
    onChange = null
} = {}) => {
    let current = false;

    const refresh = () => {
        const next = isMobileViewport(win);
        setMobileUiDataset(doc, next);
        if (next !== current && typeof onChange === 'function') {
            onChange(next);
        }
        current = next;
        return current;
    };

    const mediaQueries = [
        `(max-width: ${MOBILE_VIEWPORT_MAX_WIDTH_PX}px)`,
        `(max-width: ${COARSE_POINTER_MAX_WIDTH_PX}px)`,
        '(pointer: coarse)'
    ]
        .map((query) => {
            try {
                return typeof win?.matchMedia === 'function' ? win.matchMedia(query) : null;
            } catch {
                return null;
            }
        })
        .filter(Boolean);

    for (const mediaQuery of mediaQueries) {
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', refresh);
        } else if (typeof mediaQuery.addListener === 'function') {
            mediaQuery.addListener(refresh);
        }
    }
    win?.addEventListener?.('resize', refresh, { passive: true });

    refresh();

    return {
        destroy: () => {
            for (const mediaQuery of mediaQueries) {
                if (typeof mediaQuery.removeEventListener === 'function') {
                    mediaQuery.removeEventListener('change', refresh);
                } else if (typeof mediaQuery.removeListener === 'function') {
                    mediaQuery.removeListener(refresh);
                }
            }
            win?.removeEventListener?.('resize', refresh);
        },
        isMobile: () => current,
        refresh
    };
};
