import {
    isDesktopLayoutPreferenceAvailable,
    resolveDeviceFormFactor
} from '../domain/deviceFormFactor.js';

const mediaMatches = (win, query) => {
    try {
        return typeof win?.matchMedia === 'function' && win.matchMedia(query).matches === true;
    } catch {
        return false;
    }
};

const getViewportSegmentCount = (win) => {
    try {
        const segments = win?.visualViewport?.segments;
        return Array.isArray(segments) ? segments.length : 0;
    } catch {
        return 0;
    }
};

const getNativePlatform = (win) => {
    const capacitor = win?.Capacitor || null;
    if (!capacitor) return '';
    try {
        if (typeof capacitor.getPlatform === 'function') return String(capacitor.getPlatform() || '');
    } catch {
        return '';
    }
    return String(capacitor.platform || '');
};

export const getDeviceFormFactorInput = (win = globalThis.window) => {
    const navigator = win?.navigator || {};
    const screen = win?.screen || {};
    return {
        anyPointerCoarse: mediaMatches(win, '(any-pointer: coarse)'),
        coarsePointer: mediaMatches(win, '(pointer: coarse)'),
        hoverNone: mediaMatches(win, '(hover: none)'),
        maxTouchPoints: navigator.maxTouchPoints || 0,
        nativePlatform: getNativePlatform(win),
        platform: navigator.platform || '',
        screenHeight: screen.height,
        screenWidth: screen.width,
        userAgent: navigator.userAgent || '',
        viewportHeight: win?.innerHeight,
        viewportSegmentCount: getViewportSegmentCount(win),
        viewportWidth: win?.innerWidth
    };
};

export const getCurrentDeviceFormFactor = (win = globalThis.window) => (
    resolveDeviceFormFactor(getDeviceFormFactorInput(win))
);

export const isDesktopLayoutPreferenceAvailableForCurrentDevice = (win = globalThis.window) => (
    isDesktopLayoutPreferenceAvailable(getDeviceFormFactorInput(win))
);
