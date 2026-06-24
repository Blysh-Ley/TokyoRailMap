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
    BASEMAP_SOURCE_OPENFREEMAP,
    BASEMAP_SOURCE_PMTILES,
    normalizeBasemapSource
} from '../domain/basemapSource.js';
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
    const configuredBasemapSource = normalizeBasemapSource(
        basemapRuntimeConfig.basemapSource,
        BASEMAP_SOURCE_PMTILES
    );
    let basemapSourceKind = configuredBasemapSource === BASEMAP_SOURCE_OPENFREEMAP
        ? BASEMAP_SOURCE_OPENFREEMAP
        : (basemapRuntimeConfig.pmtilesAvailable === true ? BASEMAP_SOURCE_PMTILES : 'none');
    let onlineBasemapRequestId = 0;

    const basemapController = createBasemapController({
        mapEngine,
        initialTheme: mapTheme,
        initialMode: basemapMode,
        pmtilesAvailable: configuredBasemapSource === BASEMAP_SOURCE_PMTILES
            && basemapRuntimeConfig.pmtilesAvailable === true,
        pmtilesUrl: basemapRuntimeConfig.pmtilesUrl || DEFAULT_OSM_BASEMAP_PMTILES_URL,
        onThemeChanged: () => dispatchThemeChanged(windowRef)
    });
    const retryDelays = Array.isArray(archiveRetryDelays)
        ? archiveRetryDelays.map((delay) => Math.max(0, Number(delay) || 0))
        : [];
    const setTimeoutFn = windowRef?.setTimeout?.bind?.(windowRef)
        || (typeof setTimeout === 'function' ? setTimeout : null);

    const shouldUseOnlineBasemap = () => (
        configuredBasemapSource === BASEMAP_SOURCE_OPENFREEMAP
        &&
        basemapRuntimeConfig.onlineBasemapProvider !== ONLINE_BASEMAP_PROVIDER_NONE
        && basemapMode !== 'transparent'
    );

    const syncBasemapStyle = () => {
        const ready = ensureBasemapLayers();
        if (!ready) return false;
        basemapController.setMode(basemapMode, mapTheme);
        return true;
    };

    const loadAndApplyOnlineBasemapStyle = async () => {
        const requestId = ++onlineBasemapRequestId;
        if (!shouldUseOnlineBasemap()) {
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
            if (requestId !== onlineBasemapRequestId || basemapSourceKind !== BASEMAP_SOURCE_OPENFREEMAP) {
                return false;
            }
            basemapController.setOnlineBasemapStyle?.(descriptor);
            syncBasemapStyle();
            return Boolean(descriptor);
        } catch {
            if (requestId === onlineBasemapRequestId) {
                basemapController.setOnlineBasemapStyle?.(null);
                syncBasemapStyle();
            }
            return false;
        }
    };

    const queueOnlineBasemapStyleRefresh = () => {
        if (basemapSourceKind !== BASEMAP_SOURCE_OPENFREEMAP) return;
        loadAndApplyOnlineBasemapStyle().catch(() => null);
    };

    const activatePmtilesBasemap = () => {
        basemapSourceKind = BASEMAP_SOURCE_PMTILES;
        onlineBasemapRequestId += 1;
        basemapController.setOnlineBasemapStyle?.(null);
        basemapController.setPmtilesAvailable?.(true);
        syncBasemapStyle();
    };

    const activateNoBasemap = () => {
        basemapSourceKind = 'none';
        onlineBasemapRequestId += 1;
        basemapController.setPmtilesAvailable?.(false);
        basemapController.setOnlineBasemapStyle?.(null);
        syncBasemapStyle();
        return false;
    };

    const activateOnlineBasemap = async () => {
        basemapSourceKind = shouldUseOnlineBasemap() ? BASEMAP_SOURCE_OPENFREEMAP : 'none';
        basemapController.setPmtilesAvailable?.(false);
        if (basemapSourceKind !== BASEMAP_SOURCE_OPENFREEMAP) return activateNoBasemap();
        return loadAndApplyOnlineBasemapStyle();
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
            activateNoBasemap();
        }
        if (!available && setTimeoutFn && attempt < retryDelays.length) {
            setTimeoutFn(() => {
                validateBasemapArchive(attempt + 1).catch(() => {
                    activateNoBasemap();
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
        queueOnlineBasemapStyleRefresh();
        return mapTheme;
    };

    const setBasemapMode = (mode) => {
        basemapMode = normalizeBasemapMode(mode);
        syncBasemapStyle();
        queueOnlineBasemapStyleRefresh();
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

    const initialValidationPromise = configuredBasemapSource === BASEMAP_SOURCE_OPENFREEMAP
        ? activateOnlineBasemap()
        : (
            configuredBasemapSource === BASEMAP_SOURCE_PMTILES
                ? validateBasemapArchive().catch(() => activateNoBasemap())
                : Promise.resolve(activateNoBasemap())
        );

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
