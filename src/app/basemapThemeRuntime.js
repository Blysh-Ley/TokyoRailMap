import {
    readAppearanceMode as defaultReadAppearanceMode,
    readBasemapMode as defaultReadBasemapMode,
    resolveThemeFromAppearance as defaultResolveThemeFromAppearance
} from '../services/appSettings.js';
import { normalizeBasemapMode } from '../domain/basemapMode.js';
import { DEFAULT_OSM_BASEMAP_PMTILES_URL } from '../domain/osmBasemapPackage.js';
import { createBasemapController as defaultCreateBasemapController } from '../services/mapEngine.js';
import {
    readOsmBasemapRuntimeConfig,
    verifyOsmBasemapArchive as defaultVerifyOsmBasemapArchive
} from '../services/osmBasemapConfig.js';
import {
    ONLINE_BASEMAP_PROVIDER_NONE
} from '../domain/openFreeMapBasemap.js';
import {
    loadOpenFreeMapBasemapStyle as defaultLoadOpenFreeMapBasemapStyle
} from '../services/openFreeMapBasemapStyleService.js';

const normalizeTheme = (theme) => (theme === 'dark' ? 'dark' : 'light');

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
    readBasemapRuntimeConfig = readOsmBasemapRuntimeConfig,
    resolveThemeFromAppearance = defaultResolveThemeFromAppearance,
    verifyOsmBasemapArchive = defaultVerifyOsmBasemapArchive,
    loadOpenFreeMapBasemapStyle = defaultLoadOpenFreeMapBasemapStyle,
    archiveRetryDelays = [1000, 3000, 10000],
    documentRef = getDefaultDocument(),
    windowRef = getDefaultWindow()
} = {}) => {
    const initialTheme = normalizeTheme(resolveThemeFromAppearance(readAppearanceMode()));
    const initialMode = normalizeBasemapMode(readBasemapMode());
    const basemapRuntimeConfig = readBasemapRuntimeConfig({ windowRef }) || {};

    documentRef?.documentElement?.setAttribute?.('data-theme', initialTheme);

    let mapTheme = initialTheme;
    let basemapMode = initialMode;
    let basemapSourceKind = basemapRuntimeConfig.pmtilesAvailable === true ? 'pmtiles' : 'none';
    let onlineFallbackRequestId = 0;

    const basemapController = createBasemapController({
        mapEngine,
        initialTheme: mapTheme,
        initialMode: basemapMode,
        pmtilesAvailable: basemapRuntimeConfig.pmtilesAvailable === true,
        pmtilesUrl: basemapRuntimeConfig.pmtilesUrl || DEFAULT_OSM_BASEMAP_PMTILES_URL,
        onThemeChanged: () => dispatchThemeChanged(windowRef)
    });
    const retryDelays = Array.isArray(archiveRetryDelays)
        ? archiveRetryDelays.map((delay) => Math.max(0, Number(delay) || 0))
        : [];
    const setTimeoutFn = windowRef?.setTimeout?.bind?.(windowRef)
        || (typeof setTimeout === 'function' ? setTimeout : null);

    const shouldUseOnlineFallback = () => (
        basemapRuntimeConfig.onlineBasemapProvider !== ONLINE_BASEMAP_PROVIDER_NONE
        && basemapMode !== 'transparent'
    );

    const syncBasemapStyle = () => {
        const ready = ensureBasemapLayers();
        if (!ready) return false;
        basemapController.setMode(basemapMode, mapTheme);
        return true;
    };

    const loadAndApplyOnlineFallbackStyle = async () => {
        const requestId = ++onlineFallbackRequestId;
        if (!shouldUseOnlineFallback()) {
            basemapController.setOnlineBasemapStyle?.(null);
            syncBasemapStyle();
            return false;
        }

        try {
            const descriptor = await loadOpenFreeMapBasemapStyle({
                fetchFn: windowRef?.fetch?.bind?.(windowRef) || globalThis.fetch,
                mode: basemapMode,
                theme: mapTheme
            });
            if (requestId !== onlineFallbackRequestId || basemapSourceKind !== 'online-fallback') {
                return false;
            }
            basemapController.setOnlineBasemapStyle?.(descriptor);
            syncBasemapStyle();
            return Boolean(descriptor);
        } catch {
            if (requestId === onlineFallbackRequestId) {
                basemapController.setOnlineBasemapStyle?.(null);
                syncBasemapStyle();
            }
            return false;
        }
    };

    const queueOnlineFallbackStyleRefresh = () => {
        if (basemapSourceKind !== 'online-fallback') return;
        loadAndApplyOnlineFallbackStyle().catch(() => null);
    };

    const activatePmtilesBasemap = () => {
        basemapSourceKind = 'pmtiles';
        onlineFallbackRequestId += 1;
        basemapController.setOnlineBasemapStyle?.(null);
        basemapController.setPmtilesAvailable?.(true);
        syncBasemapStyle();
    };

    const activateOnlineFallbackBasemap = async () => {
        basemapSourceKind = shouldUseOnlineFallback() ? 'online-fallback' : 'none';
        basemapController.setPmtilesAvailable?.(false);
        if (basemapSourceKind !== 'online-fallback') {
            basemapController.setOnlineBasemapStyle?.(null);
            syncBasemapStyle();
            return false;
        }
        return loadAndApplyOnlineFallbackStyle();
    };

    const validateBasemapArchive = async (attempt = 0) => {
        const available = await verifyOsmBasemapArchive({
            fetchFn: windowRef?.fetch?.bind?.(windowRef) || globalThis.fetch,
            pmtilesUrl: basemapRuntimeConfig.pmtilesUrl || DEFAULT_OSM_BASEMAP_PMTILES_URL,
            windowRef
        });
        if (available) {
            activatePmtilesBasemap();
        } else {
            activateOnlineFallbackBasemap().catch(() => null);
        }
        if (!available && setTimeoutFn && attempt < retryDelays.length) {
            setTimeoutFn(() => {
                validateBasemapArchive(attempt + 1).catch(() => {
                    basemapController.setPmtilesAvailable?.(false);
                });
            }, retryDelays[attempt]);
        }
        return available;
    };

    const ensureBasemapLayers = () => {
        try {
            if (!(map?.loaded?.() || map?.isStyleLoaded?.())) return false;
            basemapController.ensureLayers();
            return true;
        } catch {
            return false;
        }
    };

    const applyBasemapTheme = (theme) => {
        mapTheme = normalizeTheme(theme);
        syncBasemapStyle();
        queueOnlineFallbackStyleRefresh();
        return mapTheme;
    };

    const setBasemapMode = (mode) => {
        basemapMode = normalizeBasemapMode(mode);
        syncBasemapStyle();
        queueOnlineFallbackStyleRefresh();
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

    const initialValidationPromise = validateBasemapArchive().catch(async () => {
        await activateOnlineFallbackBasemap();
        return false;
    });

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
        getPackage: () => basemapRuntimeConfig.basemapPackage || null,
        getPmtilesAvailable: () => basemapController.getPmtilesAvailable?.() === true,
        getMode: () => basemapMode,
        getBasemapSourceKind: () => basemapSourceKind,
        getTheme: () => mapTheme,
        setBasemapMode,
        syncBasemapStyle,
        syncSystemAppearanceTheme,
        whenBasemapValidated: () => initialValidationPromise
    };
};
