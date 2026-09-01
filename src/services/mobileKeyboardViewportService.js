export const NATIVE_KEYBOARD_VISIBILITY_EVENT = 'tokyoRail:nativeKeyboardVisibility';

const MINIMUM_KEYBOARD_HEIGHT_PX = 100;
const KEYBOARD_HEIGHT_RATIO = 0.15;
const TEXT_INPUT_TYPES = new Set([
    '',
    'email',
    'number',
    'password',
    'search',
    'tel',
    'text',
    'url'
]);

const toPositiveNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
};

const readViewport = (win) => {
    const viewport = win?.visualViewport || null;
    return {
        height: toPositiveNumber(viewport?.height) || toPositiveNumber(win?.innerHeight),
        width: toPositiveNumber(viewport?.width) || toPositiveNumber(win?.innerWidth),
        scale: toPositiveNumber(viewport?.scale) || 1
    };
};

const getWidthKey = (width) => String(Math.round(toPositiveNumber(width) / 20) * 20);

export const isSoftKeyboardEditableElement = (element) => {
    if (!element || element.disabled === true || element.readOnly === true) return false;
    if (element.isContentEditable === true) return true;

    const tagName = String(element.tagName || '').trim().toLowerCase();
    if (tagName === 'textarea') return true;
    if (tagName !== 'input') return false;
    return TEXT_INPUT_TYPES.has(String(element.type || 'text').trim().toLowerCase());
};

export const resolveMobileKeyboardVisible = ({
    isMobile = false,
    hasEditableFocus = false,
    nativeKeyboardVisible = false,
    baselineHeight = 0,
    viewportHeight = 0,
    viewportScale = 1
} = {}) => {
    if (isMobile !== true) return false;
    if (nativeKeyboardVisible === true) return true;
    if (hasEditableFocus !== true || Number(viewportScale) > 1.05) return false;

    const stableHeight = toPositiveNumber(baselineHeight);
    const visibleHeight = toPositiveNumber(viewportHeight);
    if (!stableHeight || !visibleHeight) return false;

    const threshold = Math.max(MINIMUM_KEYBOARD_HEIGHT_PX, stableHeight * KEYBOARD_HEIGHT_RATIO);
    return stableHeight - visibleHeight >= threshold;
};

export const createMobileKeyboardViewportService = ({
    doc = globalThis.document,
    win = globalThis.window,
    isMobile = () => false,
    onChange = null
} = {}) => {
    const baselineHeights = new Map();
    const cleanups = [];
    let nativeKeyboardVisible = false;
    let currentVisible = false;
    let frameId = null;
    let destroyed = false;

    const readIsMobile = () => {
        try {
            return typeof isMobile === 'function' ? isMobile() === true : isMobile === true;
        } catch {
            return false;
        }
    };

    const refresh = () => {
        if (destroyed) return currentVisible;

        const viewport = readViewport(win);
        const widthKey = getWidthKey(viewport.width);
        const hasEditableFocus = isSoftKeyboardEditableElement(doc?.activeElement);

        if (!hasEditableFocus && nativeKeyboardVisible !== true && viewport.height > 0) {
            const previous = toPositiveNumber(baselineHeights.get(widthKey));
            baselineHeights.set(widthKey, Math.max(previous, viewport.height));
        }

        const nextVisible = resolveMobileKeyboardVisible({
            isMobile: readIsMobile(),
            hasEditableFocus,
            nativeKeyboardVisible,
            baselineHeight: toPositiveNumber(baselineHeights.get(widthKey)) || viewport.height,
            viewportHeight: viewport.height,
            viewportScale: viewport.scale
        });

        if (nextVisible !== currentVisible) {
            currentVisible = nextVisible;
            onChange?.(currentVisible);
        }
        return currentVisible;
    };

    const scheduleRefresh = () => {
        if (destroyed || frameId !== null) return;
        if (typeof win?.requestAnimationFrame !== 'function') {
            refresh();
            return;
        }
        frameId = win.requestAnimationFrame(() => {
            frameId = null;
            refresh();
        });
    };

    const listen = (target, eventName, listener) => {
        if (typeof target?.addEventListener !== 'function') return;
        target.addEventListener(eventName, listener, { passive: true });
        cleanups.push(() => target.removeEventListener?.(eventName, listener));
    };

    const handleNativeKeyboardVisibility = (event) => {
        nativeKeyboardVisible = event?.detail?.visible === true;
        scheduleRefresh();
    };

    const initialViewport = readViewport(win);
    baselineHeights.set(getWidthKey(initialViewport.width), initialViewport.height);

    listen(doc, 'focusin', scheduleRefresh);
    listen(doc, 'focusout', scheduleRefresh);
    listen(win?.visualViewport, 'resize', scheduleRefresh);
    listen(win?.visualViewport, 'scroll', scheduleRefresh);
    listen(win, 'resize', scheduleRefresh);
    listen(win, 'orientationchange', scheduleRefresh);
    listen(win, NATIVE_KEYBOARD_VISIBILITY_EVENT, handleNativeKeyboardVisibility);
    refresh();

    return {
        destroy() {
            if (destroyed) return;
            destroyed = true;
            cleanups.splice(0).forEach((cleanup) => cleanup());
            if (frameId !== null) win?.cancelAnimationFrame?.(frameId);
            frameId = null;
            if (currentVisible) onChange?.(false);
            currentVisible = false;
        },
        isVisible: () => currentVisible,
        refresh
    };
};
