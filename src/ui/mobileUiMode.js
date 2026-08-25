import { readDesktopLayoutEnabled } from '../services/appSettings.js';
import { isDesktopLayoutPreferenceAvailableForCurrentDevice } from '../services/deviceFormFactorService.js';

const MOBILE_VIEWPORT_MAX_WIDTH_PX = 760;
const COARSE_POINTER_MAX_WIDTH_PX = 900;

const mediaMatches = (win, query) => {
    try {
        return typeof win?.matchMedia === 'function' && win.matchMedia(query).matches === true;
    } catch {
        return false;
    }
};

const toPlatformText = (value) => String(value ?? '').trim().toLowerCase();

const resolveNativePlatform = (win) => {
    const capacitor = win?.Capacitor || null;
    if (!capacitor) return '';

    let platform = '';
    try {
        if (typeof capacitor.getPlatform === 'function') {
            platform = toPlatformText(capacitor.getPlatform());
        }
    } catch {
        platform = '';
    }
    if (!platform) platform = toPlatformText(capacitor.platform);
    if (!platform || platform === 'web') return '';

    try {
        if (typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform() !== true) {
            return '';
        }
    } catch {
        return '';
    }

    return platform;
};

export const isMobileViewport = (
    win = globalThis.window,
    { desktopLayoutEnabled = readDesktopLayoutEnabled() } = {}
) => {
    if (!win) return false;

    if (isDesktopLayoutPreferenceAvailableForCurrentDevice(win)) {
        return desktopLayoutEnabled !== true;
    }

    if (mediaMatches(win, `(max-width: ${MOBILE_VIEWPORT_MAX_WIDTH_PX}px)`)) return true;

    const isCoarsePointer = mediaMatches(win, '(pointer: coarse)');
    const isCompactTouchViewport = mediaMatches(win, `(max-width: ${COARSE_POINTER_MAX_WIDTH_PX}px)`);
    if (isCoarsePointer && isCompactTouchViewport) return true;

    const width = Number(win.innerWidth);
    return Number.isFinite(width) && width > 0 && width <= MOBILE_VIEWPORT_MAX_WIDTH_PX;
};

const setMobileUiDataset = (doc, isMobile, nativePlatform = '') => {
    const value = isMobile ? '1' : '0';
    const root = doc?.documentElement || null;
    const body = doc?.body || null;
    for (const node of [root, body]) {
        if (!node?.dataset) continue;
        node.dataset.mobileUi = value;
        if (nativePlatform) {
            node.dataset.nativePlatform = nativePlatform;
        } else {
            delete node.dataset.nativePlatform;
        }
    }
};

export const createMobileUiModeController = ({
    doc = globalThis.document,
    win = globalThis.window,
    onChange = null,
    notifyOnInit = true
} = {}) => {
    let current = false;
    let initialized = false;

    const refresh = () => {
        const next = isMobileViewport(win);
        setMobileUiDataset(doc, next, resolveNativePlatform(win));
        if (
            next !== current
            && typeof onChange === 'function'
            && (initialized || notifyOnInit)
        ) {
            onChange(next);
        }
        current = next;
        initialized = true;
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
