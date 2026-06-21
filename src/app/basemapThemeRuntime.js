import {
    readAppearanceMode as defaultReadAppearanceMode,
    readBasemapMode as defaultReadBasemapMode,
    resolveThemeFromAppearance as defaultResolveThemeFromAppearance
} from '../services/appSettings.js';
import { normalizeBasemapMode } from '../domain/basemapMode.js';
import { createBasemapController as defaultCreateBasemapController } from '../services/mapEngine.js';

const DEFAULT_BASEMAP_PMTILES_URL = './tiles/kanto.pmtiles';

const normalizeTheme = (theme) => (theme === 'dark' ? 'dark' : 'light');

const getDefaultDocument = () => (
    typeof document !== 'undefined' ? document : null
);

const getDefaultWindow = () => (
    typeof window !== 'undefined' ? window : null
);

const defaultReadBasemapRuntimeConfig = ({ windowRef = getDefaultWindow() } = {}) => {
    const rawUrl = String(windowRef?.TOKYO_RAIL_OSM_BASEMAP_URL || DEFAULT_BASEMAP_PMTILES_URL).trim();
    return {
        pmtilesUrl: rawUrl || DEFAULT_BASEMAP_PMTILES_URL
    };
};

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
    readBasemapRuntimeConfig = defaultReadBasemapRuntimeConfig,
    resolveThemeFromAppearance = defaultResolveThemeFromAppearance,
    documentRef = getDefaultDocument(),
    windowRef = getDefaultWindow()
} = {}) => {
    const initialTheme = normalizeTheme(resolveThemeFromAppearance(readAppearanceMode()));
    const initialMode = normalizeBasemapMode(readBasemapMode());
    const basemapRuntimeConfig = readBasemapRuntimeConfig({ windowRef }) || {};

    documentRef?.documentElement?.setAttribute?.('data-theme', initialTheme);

    let mapTheme = initialTheme;
    let basemapMode = initialMode;

    const basemapController = createBasemapController({
        mapEngine,
        initialTheme: mapTheme,
        initialMode: basemapMode,
        pmtilesUrl: basemapRuntimeConfig.pmtilesUrl || DEFAULT_BASEMAP_PMTILES_URL,
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
        basemapMode = normalizeBasemapMode(mode);
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
        getExportStyle: (options = {}) => basemapController.getStyle?.({
            mode: basemapMode,
            theme: mapTheme,
            ...options
        }),
        getMapAttributionItems: () => basemapController.getAttributionItems?.() || [],
        getMode: () => basemapMode,
        getTheme: () => mapTheme,
        setBasemapMode,
        syncBasemapStyle,
        syncSystemAppearanceTheme
    };
};
