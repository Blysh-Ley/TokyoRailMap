import {
    readAppearanceMode as defaultReadAppearanceMode,
    readBasemapMode as defaultReadBasemapMode,
    resolveThemeFromAppearance as defaultResolveThemeFromAppearance
} from '../services/appSettings.js';
import { createBasemapController as defaultCreateBasemapController } from '../services/mapEngine.js';

const DEFAULT_LIGHT_RASTER_PAINT = Object.freeze({
    'raster-contrast': -0.3,
    'raster-brightness-min': 0.12,
    'raster-brightness-max': 1,
    'raster-saturation': -0.2,
    'raster-hue-rotate': 0
});

const DEFAULT_DARK_RASTER_PAINT = Object.freeze({
    'raster-contrast': -0.3,
    'raster-brightness-min': 0,
    'raster-brightness-max': 0.48,
    'raster-saturation': -0.2,
    'raster-hue-rotate': 180
});

const normalizeTheme = (theme) => (theme === 'dark' ? 'dark' : 'light');

const normalizeMode = (mode) => (
    mode === 'carto' || mode === 'ost' || mode === 'transparent'
        ? mode
        : 'carto'
);

const getDefaultDocument = () => (
    typeof document !== 'undefined' ? document : null
);

const getDefaultWindow = () => (
    typeof window !== 'undefined' ? window : null
);

const dispatchThemeChanged = (windowRef) => {
    try {
        if (!windowRef || typeof windowRef.dispatchEvent !== 'function') return;
        const EventCtor = typeof windowRef.Event === 'function'
            ? windowRef.Event
            : (typeof Event === 'function' ? Event : null);
        const event = EventCtor
            ? new EventCtor('__TokyoRailThemeChanged')
            : { type: '__TokyoRailThemeChanged' };
        windowRef.dispatchEvent(event);
    } catch {
        // ignore
    }
};

export const createBasemapThemeRuntime = ({
    map,
    mapEngine,
    createBasemapController = defaultCreateBasemapController,
    readAppearanceMode = defaultReadAppearanceMode,
    readBasemapMode = defaultReadBasemapMode,
    resolveThemeFromAppearance = defaultResolveThemeFromAppearance,
    documentRef = getDefaultDocument(),
    windowRef = getDefaultWindow(),
    lightRasterPaint = DEFAULT_LIGHT_RASTER_PAINT,
    darkRasterPaint = DEFAULT_DARK_RASTER_PAINT
} = {}) => {
    const initialTheme = normalizeTheme(resolveThemeFromAppearance(readAppearanceMode()));
    const initialMode = normalizeMode(readBasemapMode());

    documentRef?.documentElement?.setAttribute?.('data-theme', initialTheme);

    let mapTheme = initialTheme;
    let basemapMode = initialMode;

    const basemapController = createBasemapController({
        mapEngine,
        initialTheme: mapTheme,
        initialMode: basemapMode,
        lightRasterPaint,
        darkRasterPaint,
        onThemeChanged: () => dispatchThemeChanged(windowRef)
    });

    const ensureBasemapLayers = () => {
        try {
            if (!(map?.loaded?.() || map?.isStyleLoaded?.())) return false;
            basemapController.ensureLayers();
            return true;
        } catch {
            return false;
        }
    };

    const syncBasemapStyle = () => {
        const ready = ensureBasemapLayers();
        if (!ready) return false;
        basemapController.setMode(basemapMode, mapTheme);
        return true;
    };

    const applyBasemapTheme = (theme) => {
        mapTheme = normalizeTheme(theme);
        syncBasemapStyle();
        return mapTheme;
    };

    const setBasemapMode = (mode) => {
        basemapMode = normalizeMode(mode);
        syncBasemapStyle();
        return basemapMode;
    };

    const applyAppTheme = (theme) => {
        const next = normalizeTheme(theme);
        documentRef?.documentElement?.setAttribute?.('data-theme', next);
        applyBasemapTheme(next);
        return next;
    };

    const syncSystemAppearanceTheme = () => {
        if (readAppearanceMode() !== 'system') return false;
        applyAppTheme(resolveThemeFromAppearance('system'));
        return true;
    };

    const systemThemeMedia = typeof windowRef?.matchMedia === 'function'
        ? windowRef.matchMedia('(prefers-color-scheme: dark)')
        : null;

    if (systemThemeMedia && typeof systemThemeMedia.addEventListener === 'function') {
        systemThemeMedia.addEventListener('change', syncSystemAppearanceTheme);
    } else if (systemThemeMedia && typeof systemThemeMedia.addListener === 'function') {
        systemThemeMedia.addListener(syncSystemAppearanceTheme);
    }

    return {
        controller: basemapController,
        applyAppTheme,
        applyBasemapTheme,
        ensureBasemapLayers,
        getMode: () => basemapMode,
        getTheme: () => mapTheme,
        setBasemapMode,
        syncBasemapStyle,
        syncSystemAppearanceTheme
    };
};
