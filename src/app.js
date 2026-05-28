import {
    COMPANY_LOGO_BASE_PATH,
    getCachedJson,
    getCompanyLogoCandidates,
    getIconCandidates,
    getPreferredCachedImageSrc,
    initializeFetchCache,
    preloadAllDataAssets,
    preloadIcons,
    registerCompanyLogoMap,
    setImageElementFromCache
} from './lib/fetch.js';
import { loadRailGeoDataFromDataFolder } from './lib/data.js';
import { buildStationOffsetGeoJSONAtZoom } from './map/offset.js';
import { addLinesLayer, addStationsLayer, setupLineHoverPopup, setupStationPopup } from './map/layers.js';
import { createStationMarkers } from './map/labels.js';
import { setupCollisions } from './map/collision.js';
import { buildTransferCapsuleGeoJSON, addTransferCapsuleLayers, buildTransferCapsuleConnectionOrder } from './map/transfer-capsules.js';
import { Menu } from './features/menu/menu.js';
import { getGlobalTouchTapGuard } from './map/touchTapGuard.js';
import { createPanel } from './features/panel/panel.js';
import { getGlobalTimetableCache } from './lib/timetableCache.js';
import { initFullscreen, isInFullscreenMode } from './map/fullscreen.js';
import { buildVirtualTripPreviewPayload, extractShortestLoopSegmentByIndex, isLoopDirection } from './lib/trip-preview.js';
import { previewBranchesForLine } from './map/analyze_branch.js';
import { createLineIconElement } from './lib/line-icons.js';
import {
    buildBaseLineColorExpr,
    buildFocusedLinePaint,
    buildLowlightLinePaint,
    buildStationCircleColorPaintExpr,
    stationCircleStrokeColorPaint,
    buildStationSelectionPaint,
    isDarkThemeActive,
    resolveRailColorForTheme,
    tripPreviewLineLayerPaint,
    tripPreviewStopLayerPaint
} from './map/element_ui.js';
import {
    MENU_THROUGH_LINE_IDS,
    THROUGH_SERVICE_DISPLAY,
    getMenuThroughCategoryByLineId,
    isMenuThroughLineId,
    THROUGH_SERVICE_CONFIGS_OBJECT
} from './lib/throughServiceManager.js';
import './features/route-map/route-map-ui.js';
import { companyLogoMap, resolveLineSelectionByBranchRules } from './lib/special-condition.js';
import { createBasemapController, createMapEngine } from './services/mapEngine.js';
import { createStore } from './store/appStore.js';
import { hoverSetEnabled, selectionSelectStationLines } from './store/actions.js';
import { createHighlightFeature } from './features/highlight/highlightFeature.js';
import { createHighlightRenderer } from './features/highlight/highlightRenderer.js';
import { createTripPreviewRenderer } from './features/highlight/tripPreviewRenderer.js';
import { createReachableStopsOverlayRenderer } from './features/search/reachableStopsOverlayRenderer.js';
import { createSearchFeature } from './features/search/searchFeature.js';

initializeFetchCache();

try {
    preloadIcons([
        'settings.svg',
        'list.svg',
        'grid.svg',
        'search.svg',
        'camera.svg',
        'print.svg',
        'map-select.svg',
        'clockwise.svg',
        'filter.svg',
        'fs.svg',
        'travel.svg',
        'change-dirc.svg',
        'x.svg',
        'arrow-right.svg',
        'arrows.svg',
        'mul-select.svg',
        'eye.svg',
        'eye-slash.svg',
        'lr.svg'
    ], { concurrency: 12 }).catch(() => null);
} catch {
    // ignore
}

try {
    preloadAllDataAssets({ includeTimetables: true, timetableConcurrency: 10 }).catch((err) => {
        console.warn('预加载数据失败（将回退按需加载）', err);
    });
} catch (err) {
    console.warn('初始化预加载失败（将回退按需加载）', err);
}

// MapLibre 通过 CDN 以全局变量方式引入
const maplibregl = window.maplibregl;

if (!maplibregl) {
    throw new Error('MapLibre GL JS 未加载：请检查 maplibre-gl.js 引入是否成功');
}
const APPEARANCE_STORAGE_KEY = 'tokyorail.appearance.mode';
const BASEMAP_STORAGE_KEY = 'tokyorail.basemap.mode';
const AUTO_UPDATE_CHECK_STORAGE_KEY = 'tokyorail.auto.update.check.enabled';
const TIMETABLE_VIEW_STORAGE_KEY = 'tokyorail.timetable.view.mode';
const HOVER_PREVIEW_STORAGE_KEY = 'tokyorail.hover.preview.enabled';
const ADAPTIVE_VIEWPORT_STORAGE_KEY = 'tokyorail.adaptive.viewport.enabled';
const STATION_OFFSET_MODE_STORAGE_KEY = 'tokyorail.station.offset.mode';
const MULTI_SELECT_EVENT = '__TokyoRailMultiSelectModeChanged';
const MULTI_SELECT_LAYERS_EVENT = '__TokyoRailMultiSelectLayersUpdated';
const MULTI_SELECT_LAYERS_COMMAND_EVENT = '__TokyoRailMultiSelectLayersCommand';
const MULTI_SELECT_SHOW_ICONS_EVENT = '__TokyoRailMultiSelectShowIconsChanged';
const HOVER_PREVIEW_MIN_ZOOM = 10;
let pendingTransferCapsuleRefreshAfterCollision;
const getSystemTheme = () => (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
const readAppearanceMode = () => {
    try {
        const raw = String(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) || 'system').trim();
        if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
    } catch {
        // ignore
    }
    return 'system';
};
const resolveThemeFromAppearance = (mode) => {
    if (mode === 'dark') return 'dark';
    if (mode === 'light') return 'light';
    return getSystemTheme();
};
const readBasemapMode = () => {
    try {
        const raw = String(window.localStorage.getItem(BASEMAP_STORAGE_KEY) || 'carto').trim().toLowerCase();
        if (raw === 'carto' || raw === 'ost' || raw === 'transparent') return raw;
    } catch {
        // ignore
    }
    return 'carto';
};

const readAutoUpdateCheckEnabled = () => {
    try {
        const raw = String(window.localStorage.getItem(AUTO_UPDATE_CHECK_STORAGE_KEY) || '1').trim().toLowerCase();
        if (raw === '0' || raw === 'false') return false;
        if (raw === '1' || raw === 'true') return true;
    } catch {
        // ignore
    }
    return true;
};
const readTimetableViewMode = () => {
    try {
        const raw = String(window.localStorage.getItem(TIMETABLE_VIEW_STORAGE_KEY) || 'list').trim();
        if (raw === 'list' || raw === 'grid') return raw;
    } catch {
        // ignore
    }
    return 'list';
};

const readHoverPreviewEnabled = () => {
    try {
        const raw = String(window.localStorage.getItem(HOVER_PREVIEW_STORAGE_KEY) || '1').trim();
        if (raw === '0' || raw === 'false') return false;
        if (raw === '1' || raw === 'true') return true;
    } catch {
        // ignore
    }
    return true;
};

const readAdaptiveViewportEnabled = () => {
    try {
        const raw = String(window.localStorage.getItem(ADAPTIVE_VIEWPORT_STORAGE_KEY) || '1').trim();
        if (raw === '0' || raw === 'false') return false;
        if (raw === '1' || raw === 'true') return true;
    } catch {
        // ignore
    }
    return true;
};

const readStationOffsetMode = () => {
    try {
        const raw = String(window.localStorage.getItem(STATION_OFFSET_MODE_STORAGE_KEY) || 'dynamic').trim().toLowerCase();
        if (raw === 'dynamic' || raw === 'performance') return raw;
    } catch {
        // ignore
    }
    return 'dynamic';
};

// /data/railways-order.json: [{ "jreast-yamanote": "1037" }, ...]

const loadRailwaysOrderIndex = (() => {
    let promise = null;
    return async () => {
        if (promise) return promise;
        promise = (async () => {
            try {
                const list = await getCachedJson('./data/railways-order.json');
                const arr_re = Array.isArray(list) ? list : [];
                const arr = arr_re.toReversed()
                const map = new Map();
                for (let i = 0; i < arr.length; i++) {
                    const obj = arr[i];
                    if (!obj || typeof obj !== 'object') continue;
                    const keys = Object.keys(obj);
                    if (!keys.length) continue;
                    const k = String(keys[0] ?? '').trim();
                    if (!k) continue;
                    if (!map.has(k)) map.set(k, i);
                }
                return map;
            } catch {
                return new Map();
            }
        })();
        return promise;
    };
})();

let transferStationIdMapPromise = null;
let transferStationIdMapCache = null;
const getTransferStationIdMap = async () => {
    if (transferStationIdMapCache instanceof Map) return transferStationIdMapCache;
    if (transferStationIdMapPromise) return transferStationIdMapPromise;
    transferStationIdMapPromise = (async () => {
        try {
            const groups = await getCachedJson('./data/station-groups.json');
            const map = new Map();

            for (const group of Array.isArray(groups) ? groups : []) {
                if (!Array.isArray(group)) continue;
                const ids = [];
                const seen = new Set();

                for (const chunk of group) {
                    if (!Array.isArray(chunk)) continue;
                    for (const sid of chunk) {
                        const id = String(sid ?? '').trim();
                        if (!id || seen.has(id)) continue;
                        seen.add(id);
                        ids.push(id);
                    }
                }

                if (!ids.length) continue;
                const groupSet = new Set(ids);
                for (const id of ids) {
                    map.set(id, groupSet);
                }
            }

            transferStationIdMapCache = map;
            return map;
        } catch {
            transferStationIdMapCache = new Map();
            return transferStationIdMapCache;
        } finally {
            transferStationIdMapPromise = null;
        }
    })();
    return transferStationIdMapPromise;
};

export const getTransferStationIdsByStationId = async (stationId) => {
    const sid = String(stationId ?? '').trim();
    if (!sid) return new Set();

    const map = await getTransferStationIdMap();
    const groupSet = map.get(sid);
    if (!(groupSet instanceof Set) || groupSet.size <= 1) return new Set();

    return new Set(Array.from(groupSet).map((x) => String(x || '').trim()).filter(Boolean));
};

const initialTheme = resolveThemeFromAppearance(readAppearanceMode());
document.documentElement.setAttribute('data-theme', initialTheme);
let mapTheme = initialTheme;
let basemapMode = readBasemapMode();

const OSM_RASTER_PAINT_LIGHT = {

    'raster-contrast': -0.3,
    'raster-brightness-min': 0.12,
    'raster-brightness-max': 1,
    'raster-saturation': -0.2,
    'raster-hue-rotate': 0
};

const OSM_RASTER_PAINT_DARK = {

    'raster-contrast': -0.3,
    'raster-brightness-min': 0,
    'raster-brightness-max': 0.48,
    'raster-saturation': -0.2,
    'raster-hue-rotate': 180
};


const mapEngine = createMapEngine({
    maplibregl,
    container: 'map',
    center: [139.767, 35.681],
    zoom: 11,
    style: {
        version: 8,
        sources: {},
        layers: []
    }
});
const map = mapEngine.getMap();
const highlightRenderer = createHighlightRenderer({ mapEngine });
const reachableStopsOverlayRenderer = createReachableStopsOverlayRenderer({ mapEngine });
const basemapController = createBasemapController({
    mapEngine,
    initialTheme: mapTheme,
    initialMode: basemapMode,
    lightRasterPaint: OSM_RASTER_PAINT_LIGHT,
    darkRasterPaint: OSM_RASTER_PAINT_DARK,
    onThemeChanged: () => {
        try {
            if (typeof window !== 'undefined' && window && typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new Event('__TokyoRailThemeChanged'));
            }
        } catch {
            // ignore
        }
    }
});


try {
    window.__TokyoRailMap = map;
} catch {
    // ignore
}

const applyBasemapTheme = (theme) => {
    const next = theme === 'dark' ? 'dark' : 'light';
    mapTheme = next;
    basemapController.applyTheme(next);
};

const setBasemapMode = (mode) => {
    basemapMode = (mode === 'carto' || mode === 'ost' || mode === 'transparent') ? mode : 'carto';
    basemapController.setMode(basemapMode);
};

const ensureBasemapLayers = () => {
    basemapController.ensureLayers();
};

// 左下角比例尺
mapEngine.addMetricScaleControl({ maxWidth: 100, position: 'bottom-left' });

// 2) 初始化业务数据与图层（不强依赖底图瓦片成功加载）
const initMapApp = async () => {
    //console.log('地图初始化完成，准备加载 GeoJSON...');

    const applyCustomAttribution = () => {
        try {
            const inner = document.querySelector('.maplibregl-ctrl-attrib-inner');
            if (!inner) return;

            inner.innerHTML = [
                '<a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">© MapLibre</a>',
                '&copy; <a href="https://carto.com/">Carto</a>',
                '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>',
                
                '<a href="https://github.com/nagix/mini-tokyo-3d" target="_blank" rel="noopener noreferrer">Data based on mini-tokyo-3d</a>'
            ].join(' | ');
        } catch {
            // ignore
        }
    };

    applyCustomAttribution();
    map.on('styledata', applyCustomAttribution);

    const railwaysOrderIndex = await loadRailwaysOrderIndex();

    // 触屏防误触：仅短按且几乎不移动才视为 tap
    const touchTapGuard = getGlobalTouchTapGuard({ maxDurationMs: 500, maxMovePx: 12 });

    let collisionController = null;
    let menu = null;
    let selectedCompany = null;
    let selectedLineId = null;
    let selectedStationLineIds = null;
    let selectedStationId = null; // 点击站点高亮时，仅高亮该站点
    let selectedServiceMode = 'all';
    let isolateStationsToSelectedLine = false; // 仅用于“popup 提交线路”：隐藏非该线路站点
    let stationLabelMode = 'auto';
    let setStationLabelMode = (_mode) => false;
    // mode: 'preview' | 'commit'
    let fitToCurrentSelection = (_triggerKey, _mode = 'preview') => {};
    let enabledLineIdsByCompany = new Map();
    let lineSelectionLinesObj = null;
    let stationPopup = null;
    let lineHoverPopup = null;
    let stationLabels = [];
    let fixedPopupStationId = null;
    let transferStationIdsByStationId = new Map();
    let previewTripPath = (_payload) => {};
    let clearTripPathPreview = () => {};
    let tripPreviewStationIds = null; // Set<string> | null
    let tripPreviewLineIds = null; // Set<string> | null
    let tripPreviewStationOverrideColor = '';
    let tripPreviewActive = false;
    let tripPreviewActiveSource = '';
    let tripPreviewOriginPopup = null;
    let tripPreviewTerminalPopup = null;
    let tripPreviewOriginPopups = [];
    let tripPreviewTerminalPopups = [];
    let tripCurrentStationPopup = null;
    let selectedStationCurrentPopup = null;
    let selectedStationCurrentPopupStationId = null;
    let tripDetailStationTriangleMarker = null;
    let journeyPickOriginPin = null;
    let journeyPickDestinationPin = null;
    let tripPreviewSelectionsByKey = new Map();
    let baseMultiSelectionsByKey = new Map();
    let dirPreviewActive = false;
    let dirPreviewLineIds = null; // Set<string> | null
    let dirPreviewStationIds = null; // Set<string> | null
    let dirPreviewOriginPopups = [];
    let dirPreviewTerminalPopups = [];
    let previewDirHeader = (_payload) => {};
    let clearDirHeaderPreview = () => {};
    let hoverPreviewEnabled = readHoverPreviewEnabled();
    let adaptiveViewportEnabled = readAdaptiveViewportEnabled();
    let multiSelectModeEnabled = window.__TokyoRailMultiSelectEnabled === true;
    let hoverPreviewEnabledBeforeMultiSelect = hoverPreviewEnabled;
    let hoverPreviewToggleController = {
        setEnabled: () => {},
        setDisabled: () => {}
    };
    let stationOffsetMode = readStationOffsetMode();
    let stationCoordById = new Map();
    let stationCoordByIdBase = new Map();
    let stationServingCountById = new Map();
    let transferCapsuleStationsData = null;
    let transferCapsuleStationGroups = null;
    let transferCapsuleBaseConnectionOrder = null;
    let transferCapsuleRefreshRafId = null;
    let transferCapsuleVisibleKey = '__init__';
    let reachableStopsOverlayVisibleKey = '__init__';
    let reachableStopsLabelIds = null;
    let reachableStopsExtremeLabelIds = null;
    let syncStationOffsetForTripPreviewState = () => {};
    let railwaysIndexByIdCachePromise = null;
    let multiSelectBaseTripPreviewSignature = '';

    const MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE = 'ms-base-trip-preview';
    const MULTI_SELECT_BASE_TRIP_PREVIEW_KEY = 'multi-base-lines';


    let panel = null;
    const appStore = createStore({
        selectedCompany,
        selectedLineId,
        selectedStationLineIds,
        selectedStationId,
        selectedServiceMode,
        hoverPreviewEnabled
    });

    const isHoverPreviewEnabled = () => hoverPreviewEnabled !== false;
    const isAdaptiveViewportEnabled = () => adaptiveViewportEnabled !== false;
    const applyHoverPreviewEnabled = (enabled) => {
        hoverPreviewEnabled = enabled !== false;
        appStore.dispatch(hoverSetEnabled(hoverPreviewEnabled));
        panel?.setHoverPreviewEnabled?.(hoverPreviewEnabled);
        stationPopup?.setHoverPreviewEnabled?.(hoverPreviewEnabled);
    };
    const applyAdaptiveViewportEnabled = (enabled) => {
        adaptiveViewportEnabled = enabled !== false;
    };

    const applyStationOffsetMode = (mode, { persistStorage = true } = {}) => {
        const next = (String(mode || '').trim().toLowerCase() === 'performance') ? 'performance' : 'dynamic';
        stationOffsetMode = next;
        if (persistStorage) {
            try {
                window.localStorage.setItem(STATION_OFFSET_MODE_STORAGE_KEY, next);
            } catch {
                // ignore
            }
        }
        return next;
    };

    const isStationOffsetDynamicMode = () => stationOffsetMode !== 'performance';

    const clearTripDetailStationIndicator = () => {
        try {
            tripDetailStationTriangleMarker?.remove?.();
        } catch {
            // ignore
        }
        tripDetailStationTriangleMarker = null;
    };

    const clearJourneyPickPin = (type = null) => {
        const t = String(type || '').trim().toLowerCase();
        if (!t || t === 'origin') {
            try {
                journeyPickOriginPin?.remove?.();
            } catch {
                // ignore
            }
            journeyPickOriginPin = null;
        }
        if (!t || t === 'destination') {
            try {
                journeyPickDestinationPin?.remove?.();
            } catch {
                // ignore
            }
            journeyPickDestinationPin = null;
        }
    };

    const showJourneyPickPin = async ({ lngLat, stationId, type = 'origin' } = {}) => {
        const pinType = String(type || 'origin').trim().toLowerCase();
        if (pinType !== 'origin' && pinType !== 'destination') return;

        const sid = String(stationId || '').trim();
        let coord = null;
        if (Array.isArray(lngLat) && lngLat.length >= 2) {
            const lng = Number(lngLat[0]);
            const lat = Number(lngLat[1]);
            if (Number.isFinite(lng) && Number.isFinite(lat)) coord = [lng, lat];
        } else if (lngLat && typeof lngLat === 'object') {
            const lng = Number(lngLat.lng ?? lngLat.lon ?? lngLat.longitude);
            const lat = Number(lngLat.lat ?? lngLat.latitude);
            if (Number.isFinite(lng) && Number.isFinite(lat)) coord = [lng, lat];
        }

        if (!coord && sid) {
            const stationCoord = stationCoordById.get(sid);
            if (Array.isArray(stationCoord) && stationCoord.length >= 2) {
                const lng = Number(stationCoord[0]);
                const lat = Number(stationCoord[1]);
                if (Number.isFinite(lng) && Number.isFinite(lat)) coord = [lng, lat];
            }
        }

        clearJourneyPickPin(pinType);
        if (!coord) return;

        const outer = document.createElement('div');
        outer.className = `journey-pick-pin-marker journey-pick-pin-${pinType}`;
        const icon = document.createElement('img');
        icon.className = `journey-pick-pin-icon journey-pick-pin-icon-${pinType}`;
        icon.alt = '';
        outer.appendChild(icon);
        try {
            await setImageElementFromCache(icon, getIconCandidates('pin.svg'), {
                cacheKey: 'icon:pin.svg',
                fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('pin.svg'), { cacheKey: 'icon:pin.svg' })
            });
        } catch {
            // ignore
        }

        try {
            const marker = new maplibregl.Marker({ element: outer, anchor: 'bottom', offset: [0, 0] })
                .setLngLat(coord)
                .addTo(map);
            if (pinType === 'origin') {
                journeyPickOriginPin = marker;
            } else {
                journeyPickDestinationPin = marker;
            }
        } catch {
            // ignore
        }
    };

    const showTripDetailStationIndicatorById = (stationId) => {
        const sid = String(stationId || '').trim();
        if (!sid) return;
        const coord = stationCoordById.get(sid);
        if (!Array.isArray(coord) || coord.length < 2) return;

        clearTripDetailStationIndicator();

        const outer = document.createElement('div');
        outer.className = 'trip-detail-station-indicator-outer';
        const inner = document.createElement('div');
        inner.className = 'trip-detail-station-indicator';
        outer.appendChild(inner);

        try {
            tripDetailStationTriangleMarker = new maplibregl.Marker({ element: outer, anchor: 'top', offset: [0, 6] })
                .setLngLat(coord)
                .addTo(map);
        } catch {
            tripDetailStationTriangleMarker = null;
        }
    };

    window.addEventListener('__TokyoRailRouteMapStationIndicatorShow', (evt) => {
        const sid = String(evt?.detail?.stationId || '').trim();
        if (!sid) return;
        showTripDetailStationIndicatorById(sid);
    });

    window.addEventListener('__TokyoRailRouteMapStationIndicatorClear', () => {
        clearTripDetailStationIndicator();
    });

    const isMultiSelectModeEnabled = () => multiSelectModeEnabled === true;

    const BASE_LAYER_HIDDEN_LINE_IDS = new Set([
        'Seibu.S-Yurakucho',
        'Seibu.S-Fukutoshin'
    ]);

    const shouldApplyBaseLayerHiddenFilter = () => !(tripPreviewActive || dirPreviewActive);

    const isBaseLayerHiddenStationId = (stationId) => {
        const sid = String(stationId || '').trim();
        if (!sid) return false;
        for (const lineId of BASE_LAYER_HIDDEN_LINE_IDS) {
            if (sid === lineId || sid.startsWith(`${lineId}.`)) return true;
        }
        return false;
    };

    const isStationHiddenInBaseLayer = (stationId) => {
        if (!shouldApplyBaseLayerHiddenFilter()) return false;
        return isBaseLayerHiddenStationId(stationId);
    };

    const filterStationIdsForBaseLayer = (ids) => {
        if (!(ids instanceof Set)) return ids;
        if (!shouldApplyBaseLayerHiddenFilter()) return ids;

        const out = new Set();
        for (const rawId of ids) {
            const id = String(rawId || '').trim();
            if (!id) continue;
            if (isBaseLayerHiddenStationId(id)) continue;
            out.add(id);
        }
        return out;
    };

    const getFixedVisibleStationIdsForTransferCapsules = () => {
        if (!shouldApplyBaseLayerHiddenFilter()) return null;
        if (!transferCapsuleStationsData || !Array.isArray(transferCapsuleStationsData.features)) return null;

        const out = new Set();
        for (const feature of transferCapsuleStationsData.features) {
            const sid = String(feature?.properties?.id ?? feature?.id ?? '').trim();
            if (!sid) continue;
            if (isBaseLayerHiddenStationId(sid)) continue;
            out.add(sid);
        }
        return out;
    };

    const getBaseMultiSelectedLineIds = () => {
        const out = new Set();
        for (const [key, entry] of baseMultiSelectionsByKey.entries()) {
            if (!key) continue;
            if (entry?.hidden === true) continue;
            const ids = entry?.lineIds;
            if (!(ids instanceof Set)) continue;
            for (const id of ids) {
                const s = String(id || '').trim();
                if (s) out.add(s);
            }
        }
        return out;
    };

    const reachableStopsCircleRadiusMeters = (remainingMs) => {
        const maxMinutes = 20;
        const minMinutes = 5;
        const remainingMinutes = Math.max(minMinutes, Number(remainingMs) / 60000);
        const walkMinutes = Math.min(maxMinutes, remainingMinutes);
        return walkMinutes * 50;
    };

    const getReachableStopsLabelIdSet = (geojson) => {
        const features = Array.isArray(geojson?.features) ? geojson.features : [];
        if (!features.length) return null;
        const out = new Set();
        for (const f of features) {
            const sid = String(f?.properties?.id ?? f?.id ?? '').trim();
            if (sid) out.add(sid);
        }
        return out.size ? out : null;
    };

    const getReachableStopsExtremeLabelIdSet = (geojson) => {
        const features = Array.isArray(geojson?.features) ? geojson.features : [];
        if (!features.length) return null;

        let east = null;
        let west = null;
        let north = null;
        let south = null;

        const pick = (current, candidate, cmp) => {
            if (!current) return candidate;
            const res = cmp(candidate, current);
            if (res > 0) return candidate;
            if (res < 0) return current;
            const aId = String(candidate?.id || '').trim();
            const bId = String(current?.id || '').trim();
            return aId && bId && aId < bId ? candidate : current;
        };

        for (const f of features) {
            const c = f?.geometry?.coordinates;
            if (!Array.isArray(c) || c.length < 2) continue;
            const lng = Number(c[0]);
            const lat = Number(c[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
            const sid = String(f?.properties?.id ?? f?.id ?? '').trim();
            if (!sid) continue;
            const item = { id: sid, lng, lat };
            east = pick(east, item, (a, b) => a.lng - b.lng);
            west = pick(west, item, (a, b) => b.lng - a.lng);
            north = pick(north, item, (a, b) => a.lat - b.lat);
            south = pick(south, item, (a, b) => b.lat - a.lat);
        }

        const out = new Set();
        for (const it of [east, west, north, south]) {
            if (it?.id) out.add(String(it.id));
        }
        return out.size ? out : null;
    };

    const applyReachableStopsLabelPriorityBoost = (extremeIds) => {
        if (!Array.isArray(stationLabels) || !stationLabels.length) return;
        const set = extremeIds instanceof Set ? extremeIds : null;
        for (const item of stationLabels) {
            const sid = String(item?.stationId || item?.props?.id || '').trim();
            const boost = !!(sid && set && set.has(sid));
            item.collisionPriorityBoost = boost ? 1 : 0;
        }
    };

    const destinationPointFromBearing = (lng, lat, distanceMeters, bearingRad) => {
        const earthRadius = 6371000;
        const delta = Number(distanceMeters) / earthRadius;
        const phi1 = lat * Math.PI / 180;
        const lambda1 = lng * Math.PI / 180;
        const sinPhi1 = Math.sin(phi1);
        const cosPhi1 = Math.cos(phi1);
        const sinDelta = Math.sin(delta);
        const cosDelta = Math.cos(delta);
        const sinPhi2 = sinPhi1 * cosDelta + cosPhi1 * sinDelta * Math.cos(bearingRad);
        const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
        const y = Math.sin(bearingRad) * sinDelta * cosPhi1;
        const x = cosDelta - sinPhi1 * Math.sin(phi2);
        const lambda2 = lambda1 + Math.atan2(y, x);
        return [lambda2 * 180 / Math.PI, phi2 * 180 / Math.PI];
    };


    const generateDynamicColorExpressionPalette = (countsArray) => {
        // 1. 获取并排序所有实际存在的班次频次
        const uniqueCounts = [...new Set(countsArray)].sort((a, b) => a - b);
        

        const PALETTE =[
            '#BAE1FF',
            '#B5EAD7',
            '#FFFFBA',
            '#FFDFBA',
            '#FFB7B2',
            '#E0BBE4'
        ];;


        if (uniqueCounts.length === 0) return PALETTE[0]; 
        if (uniqueCounts.length === 1) return PALETTE[PALETTE.length - 1]; 

        const expression = ['interpolate', ['linear'], ['get', 'shiftCount']];
        let lastVal = -1;
        

        const steps = PALETTE.length;
        
        for (let i = 0; i < steps; i++) {
            // 精确计算当前颜色应该映射到哪个分位数 (0%, 20%, 40%, 60%, 80%, 100%)
            const percentileIndex = (i / (steps - 1)) * (uniqueCounts.length - 1);
            const lower = Math.floor(percentileIndex);
            const upper = Math.ceil(percentileIndex);
            const weight = percentileIndex - lower;
            

            let currentVal = uniqueCounts[lower] * (1 - weight) + uniqueCounts[upper] * weight;
            currentVal = Math.round(currentVal * 100) / 100;


            if (currentVal <= lastVal) {
                currentVal = lastVal + 0.1; 
            }

            expression.push(currentVal, PALETTE[i]);
            lastVal = currentVal;
        }

        return expression;
    };

    // 生成动态分位数的颜色插值表达式
    const generateDynamicColorExpression = (countsArray) => {

        const uniqueCounts = [...new Set(countsArray)].sort((a, b) => a - b);
        

        if (uniqueCounts.length === 0) return '#f0f8ff'; // 淡黄兜底
        if (uniqueCounts.length === 1) return '#f0f8ff';


        const maxSteps = 10;
        const steps = Math.min(maxSteps, uniqueCounts.length);
        

        const colors = [];
        for (let i = 0; i < steps; i++) {
            const ratio = i / (steps - 1);
            const h = Math.round(220 * (1 - ratio));
            const s = 100;
            const l = Math.round(65 - 15 * ratio);
            colors.push(`hsl(${h}, ${s}%, ${l}%)`);
        }

        const expression = ['interpolate', ['linear'], ['get', 'shiftCount']];
        let lastVal = -1;
        const debugBuckets = [];

        for (let i = 0; i < steps; i++) {
            let currentVal;
            
            if (uniqueCounts.length === steps) {
                // 数量本来就少，直接挨个取
                currentVal = uniqueCounts[i];
            } else {

                const percentileIndex = (i / (steps - 1)) * (uniqueCounts.length - 1);
                const lower = Math.floor(percentileIndex);
                const upper = Math.ceil(percentileIndex);
                const weight = percentileIndex - lower;

                currentVal = uniqueCounts[lower] * (1 - weight) + uniqueCounts[upper] * weight;
            }


            currentVal = Math.round(currentVal * 100) / 100;


            if (currentVal > lastVal) {
                expression.push(currentVal, colors[i]);
                lastVal = currentVal;

                debugBuckets.push({
                    '档位': debugBuckets.length + 1,
                    '班次数量 (shiftCount)': currentVal,
                    '对应颜色 (RGB)': colors[i]
                });
                
                lastVal = currentVal;
            }
        }
        // 如果过滤后剩下的有效档位过少，直接返回单一颜色兜底
        if (expression.length <= 5) {
            return colors[colors.length - 1] || '#FF0000';
        }

        return expression;
    };

    const generateAbsoluteColorExpressionAbsolute = (countsArray) => {
    // 1. 定义你的绝对频次锚点 (依据你之前的 18h / 3min 逻辑)

        const fixedSteps = [0, 18, 36, 54, 72, 108, 180, 360];
        
        // 2. 准备颜色数组
        const steps = fixedSteps.length;
        const colors = [];
        for (let i = 0; i < steps; i++) {
            const ratio = i / (steps - 1);
            const h = Math.round(50 * (1 - ratio));
            const s = 100;
            const l = Math.round(80 - 30 * ratio);
            colors.push(`hsl(${h}, ${s}%, ${l}%)`);
        }


        const expression = ['interpolate', ['linear'], ['get', 'shiftCount']];
        

        for (let i = 0; i < steps; i++) {
            expression.push(fixedSteps[i], colors[i]);
        }

        // 调试打印：让你看到目前的班次落在哪个档位
        const validCounts = countsArray.filter(c => c > 0);
        const max = Math.max(...validCounts, 0);

        return expression;
    };

    const buildReachableStopsOverlayGeoJSON = (payload = {}) => {
        const reachableStops = payload?.reachableStops;
        const remainingMsByStop = payload?.remainingMsByStop instanceof Map
            ? payload.remainingMsByStop
            : new Map();

        const stopIds = Array.isArray(reachableStops)
            ? reachableStops
            : (reachableStops instanceof Set ? Array.from(reachableStops) : Object.keys(payload?.remainingMsByStop || {}));

        const features = [];
        const allShiftCounts = []; 

        for (const rawStopId of stopIds) {
            const stopId = String(rawStopId || '').trim();
            if (!stopId) continue;

            const shiftsArray = remainingMsByStop.get(stopId);
            if (!Array.isArray(shiftsArray) || shiftsArray.length === 0) continue;

            const coord = stationCoordById.get(stopId) || stationCoordByIdBase.get(stopId);
            if (!Array.isArray(coord) || coord.length < 2) continue;

            const lng = Number(coord[0]);
            const lat = Number(coord[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

            for (const shift of shiftsArray) {
                const remainingMs = Number(shift.remainMs);
                const shiftCount = Number(shift.count) || 0; // 单独提取这一个时间圈的班次数
                
                if (!Number.isFinite(remainingMs) || remainingMs < 0) continue;

                if (shiftCount > 0) {
                    allShiftCounts.push(shiftCount);
                }

                const radiusMeters = reachableStopsCircleRadiusMeters(remainingMs);
                const sortKey = (shiftCount * 100000) - radiusMeters;
                features.push({
                    type: 'Feature',
                    properties: {
                        id: stopId,
                        remainingMs,
                        radiusMeters,                  
                        shiftCount,
                        sortKey
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [lng, lat]
                    }
                });
            }
        }
        features.sort((a, b) => {
            // 1. 主要条件：按班次数升序排序。保证低班次(黄色)先渲染在底层，高班次(红色/橙色)后渲染在顶层
            if (a.properties.shiftCount !== b.properties.shiftCount) {
                return a.properties.shiftCount - b.properties.shiftCount;
            }
            // 2. 次要条件：如果班次数相同(颜色相同)，按半径降序排序。保证大圈在底层，小圈在顶层
            return b.properties.radiusMeters - a.properties.radiusMeters;
        });
        // 数据的汇总数组，生成独属于当下的动态颜色表达式
        const dynamicColorExpression = generateAbsoluteColorExpressionAbsolute(allShiftCounts);

        return {
            geojson: { type: 'FeatureCollection', features },
            dynamicColorExpression
        };
    };

    const ensureReachableStopsOverlayLayers = (dynamicColorExpression, baseOpacity = 0.12) => {
        reachableStopsOverlayRenderer.ensureLayers(dynamicColorExpression, baseOpacity);

    };

    let lastReachableStopsPayload = null;

    const fitToReachableStopsBounds = (geojson, options = {}) => {
        reachableStopsOverlayRenderer.fitToBounds(geojson, options);
    };

    const clearReachableStopsOverlay = () => {
        reachableStopsOverlayVisibleKey = '__empty__';
        lastReachableStopsPayload = null;
        reachableStopsLabelIds = null;
        reachableStopsOverlayRenderer.clear();
        collisionController?.scheduleUpdate?.();
    };

    const refreshReachableStopsOverlay = async (payload = null, options = {}) => {
        if (!map) return;
        
        if (payload) {
            lastReachableStopsPayload = payload;
        } else {
            payload = lastReachableStopsPayload;
        }
        
        if (!payload) return;

        const data = buildReachableStopsOverlayGeoJSON(payload);
        ensureReachableStopsOverlayLayers(data.dynamicColorExpression, payload.opacity);

        const nextKey = JSON.stringify((Array.isArray(data?.geojson?.features) ? data.geojson.features : []).map((f) => [
            f?.properties?.id, 
            Math.round(Number(f?.properties?.remainingMs) || 0),
            (f?.geometry?.coordinates?.[0] || 0).toFixed(6),
            (f?.geometry?.coordinates?.[1] || 0).toFixed(6)
        ]));
        if (nextKey === reachableStopsOverlayVisibleKey) return;
        reachableStopsOverlayVisibleKey = nextKey;

        reachableStopsOverlayRenderer.setData(data.geojson);

        reachableStopsLabelIds = getReachableStopsLabelIdSet(data.geojson);
        reachableStopsExtremeLabelIds = getReachableStopsExtremeLabelIdSet(data.geojson);
        applyReachableStopsLabelPriorityBoost(reachableStopsExtremeLabelIds);
        collisionController?.scheduleUpdate?.();

        if (options?.fitBounds !== false && payload?.fitBounds !== false) {
            fitToReachableStopsBounds(data.geojson);
        }
    };

    const toggleBaseMultiSelection = (key, lineIds, kind = 'line', displayName = '') => {
        const k = String(key || '').trim();
        const ids = Array.isArray(lineIds)
            ? lineIds.map((x) => String(x || '').trim()).filter(Boolean)
            : [];
        const label = String(displayName || '').trim();
        if (!k || !ids.length) return false;
        if (baseMultiSelectionsByKey.has(k)) {
            baseMultiSelectionsByKey.delete(k);
            emitMultiSelectLayersUpdated();
            return false;
        }
        baseMultiSelectionsByKey.set(k, {
            kind: String(kind || 'line').trim() || 'line',
            lineIds: new Set(ids),
            displayName: label,
            hidden: false
        });
        emitMultiSelectLayersUpdated();
        syncMultiSelectBaseTripPreview().catch(() => null);
        return true;
    };

    const toggleBaseMultiSelectionVisibility = (key) => {
        const k = String(key || '').trim();
        if (!k || !baseMultiSelectionsByKey.has(k)) return false;
        const current = baseMultiSelectionsByKey.get(k) || {};
        const next = {
            ...current,
            hidden: !(current?.hidden === true),
            branchAutoHidden: false
        };
        baseMultiSelectionsByKey.set(k, next);
        emitMultiSelectLayersUpdated();
        syncMultiSelectBaseTripPreview().catch(() => null);
        return true;
    };

    const removeBaseMultiSelection = (key) => {
        const k = String(key || '').trim();
        if (!k) return false;
        const removed = baseMultiSelectionsByKey.delete(k);
        if (removed) {
            emitMultiSelectLayersUpdated();
            syncMultiSelectBaseTripPreview().catch(() => null);
        }
        return removed;
    };

    const clearBaseMultiSelections = () => {
        baseMultiSelectionsByKey = new Map();
        emitMultiSelectLayersUpdated();
        syncMultiSelectBaseTripPreview().catch(() => null);
    };

    const getVisibleStationIdsForBaseMultiSelection = () => {
        const selectedLineIds = getBaseMultiSelectedLineIds();
        if (!selectedLineIds.size) return new Set();

        const out = new Set();
        const labels = Array.isArray(stationLabels) ? stationLabels : [];
        for (const item of labels) {
            const props = item?.props || {};
            const sid = String(item?.stationId || props?.id || '').trim();
            if (!sid) continue;
            if (isStationHiddenInBaseLayer(sid)) continue;

            const platform = normalizeArrayLike(props?.platform_line_id).map((x) => String(x || '').trim()).filter(Boolean);
            const servingIds = normalizeArrayLike(props?.serving_ids).map((x) => String(x || '').trim()).filter(Boolean);
            const lines = platform.length ? platform : servingIds;

            if (!lines.length) continue;
            let hit = false;
            for (const lid of lines) {
                if (selectedLineIds.has(lid)) {
                    hit = true;
                    break;
                }
            }
            if (hit) out.add(sid);
        }
        return out;
    };

    const getVisibleStationIdsByLineIds = (lineIds) => {
        const ids = lineIds instanceof Set
            ? lineIds
            : new Set(Array.isArray(lineIds) ? lineIds.map((x) => String(x || '').trim()).filter(Boolean) : []);
        if (!ids.size) return new Set();

        const out = new Set();
        const labels = Array.isArray(stationLabels) ? stationLabels : [];
        for (const item of labels) {
            const props = item?.props || {};
            const sid = String(item?.stationId || props?.id || '').trim();
            if (!sid) continue;
            if (isStationHiddenInBaseLayer(sid)) continue;

            const platform = normalizeArrayLike(props?.platform_line_id).map((x) => String(x || '').trim()).filter(Boolean);
            const servingIds = normalizeArrayLike(props?.serving_ids).map((x) => String(x || '').trim()).filter(Boolean);
            const lines = platform.length ? platform : servingIds;
            if (!lines.length) continue;

            let hit = false;
            for (const lid of lines) {
                if (ids.has(lid)) {
                    hit = true;
                    break;
                }
            }
            if (hit) out.add(sid);
        }
        return filterStationIdsForBaseLayer(out);
    };

    const getVisibleStationIdsForTransferCapsules = () => {
        if (tripPreviewActive && tripPreviewStationIds && tripPreviewStationIds.size) {
            if (isMultiSelectModeEnabled()) {
                const baseIds = getVisibleStationIdsForBaseMultiSelection();
                if (baseIds.size) {
                    const merged = new Set(baseIds);
                    for (const sid of tripPreviewStationIds) merged.add(String(sid || '').trim());
                    return merged;
                }
            }
            return new Set(Array.from(tripPreviewStationIds).map((x) => String(x || '').trim()).filter(Boolean));
        }

        if (dirPreviewActive && dirPreviewStationIds && dirPreviewStationIds.size) {
            return new Set(Array.from(dirPreviewStationIds).map((x) => String(x || '').trim()).filter(Boolean));
        }

        if (isMultiSelectModeEnabled()) {
            const baseIds = getVisibleStationIdsForBaseMultiSelection();
            if (baseIds.size) return baseIds;
        }

        if (!selectedLineId && !selectedCompany && selectedStationId) {
            return getVisibleStationIdsForSelectedStationSelection();
        }

        const highlightLineIds = (() => {
            if (selectedLineId) {
                if (selectedStationLineIds && selectedStationLineIds.size > 1) {
                    return new Set(Array.from(selectedStationLineIds).map(String).filter(Boolean));
                }
                return new Set([String(selectedLineId)]);
            }

            if (selectedStationLineIds && selectedStationLineIds.size) {
                return new Set(Array.from(selectedStationLineIds).map(String).filter(Boolean));
            }

            if (selectedCompany && enabledLineIdsByCompany && enabledLineIdsByCompany.has(selectedCompany)) {
                return new Set(Array.from(enabledLineIdsByCompany.get(selectedCompany) || []).map(String).filter(Boolean));
            }

            return null;
        })();

        if (highlightLineIds && highlightLineIds.size) {
            return getVisibleStationIdsByLineIds(highlightLineIds);
        }

        return null;
    };

    const getStationIdTailToken = (stationId) => {
        const sid = String(stationId || '').trim();
        if (!sid) return '';
        const parts = sid.split('.').map((x) => String(x || '').trim()).filter(Boolean);
        return parts.length ? parts[parts.length - 1] : sid;
    };

    const applyTransferStationLabelCollapse = () => {
        if (!Array.isArray(stationLabels) || !stationLabels.length) return;

        const visibleIds = getVisibleStationIdsForTransferCapsules();
        const visibleSet = visibleIds instanceof Set ? visibleIds : null;
        const hideInBaseLayer = shouldApplyBaseLayerHiddenFilter();
        const labelById = new Map();

        const labelOffsets = [
            '0 -14px',
            '14px -4px',
            '0 10px',
            '-14px -4px'
        ];

        const getBaseName = (item) => {
            const cached = String(item?._transferLabelBaseName || '').trim();
            if (cached) return cached;
            const baseName = String(item?.props?.name_zh || item?.props?.name || item?.stationId || '').trim();
            item._transferLabelBaseName = baseName;
            return baseName;
        };

        const getBasePriority = (item) => {
            if (Number.isFinite(item?._transferLabelBasePriority)) return Number(item._transferLabelBasePriority);
            const base = Number(item?.priority || 0);
            item._transferLabelBasePriority = base;
            return base;
        };

        const getBaseTranslate = (item) => {
            const cached = String(item?._transferLabelBaseTranslate || '').trim();
            if (cached) return cached;
            const dy = Number.isFinite(item?.labelDyPx) ? Number(item.labelDyPx) : 3;
            const baseTranslate = `0 -${dy}px`;
            item._transferLabelBaseTranslate = baseTranslate;
            return baseTranslate;
        };

        const pickNorthernmost = (items) => {
            let best = null;
            let bestLat = Number.NEGATIVE_INFINITY;
            for (const it of items) {
                if (!it) continue;
                const lat = Number(it?.coordinates?.[1]);
                if (!Number.isFinite(lat)) continue;
                const sid = String(it?.stationId || it?.props?.id || '').trim();
                const bestSid = String(best?.stationId || best?.props?.id || '').trim();
                if (lat > bestLat || (lat === bestLat && sid < bestSid)) {
                    bestLat = lat;
                    best = it;
                }
            }
            return best;
        };

        for (const item of stationLabels) {
            const sid = String(item?.stationId || item?.props?.id || '').trim();
            if (!sid) continue;
            labelById.set(sid, item);
        }

        const repIdsByGroupKey = new Map();
        const offsetByStationId = new Map();

        for (const item of stationLabels) {
            const sid = String(item?.stationId || item?.props?.id || '').trim();
            if (!sid) continue;

            const groupSet = transferStationIdsByStationId.get(sid);
            if (!(groupSet instanceof Set) || groupSet.size <= 1) continue;

            const groupIds = Array.from(groupSet)
                .map((x) => String(x || '').trim())
                .filter(Boolean)
                .filter((id) => !(hideInBaseLayer && isBaseLayerHiddenStationId(id)));
            if (!groupIds.length) continue;

            const candidateIds = visibleSet
                ? groupIds.filter((id) => visibleSet.has(id))
                : groupIds.slice();
            if (!candidateIds.length) continue;

            const groupKey = groupIds.slice().sort().join('|');
            if (repIdsByGroupKey.has(groupKey)) continue;

            const candidates = candidateIds.map((id) => labelById.get(id)).filter(Boolean);
            if (!candidates.length) continue;

            const nameBuckets = new Map();
            for (const cand of candidates) {
                const nm = getBaseName(cand) || String(cand?.stationId || '').trim();
                if (!nameBuckets.has(nm)) nameBuckets.set(nm, []);
                nameBuckets.get(nm).push(cand);
            }

            const reps = [];
            if (nameBuckets.size <= 1) {
                const rep = pickNorthernmost(candidates);
                if (rep) reps.push(rep);
            } else {
                for (const bucket of nameBuckets.values()) {
                    const rep = pickNorthernmost(bucket);
                    if (rep) reps.push(rep);
                }
            }

            reps.sort((a, b) => {
                const latA = Number(a?.coordinates?.[1]);
                const latB = Number(b?.coordinates?.[1]);
                if (latA !== latB) return latB - latA;
                return String(a?.stationId || '').localeCompare(String(b?.stationId || ''));
            });

            const repIdSet = new Set();
            for (let i = 0; i < reps.length; i += 1) {
                const rep = reps[i];
                const repId = String(rep?.stationId || rep?.props?.id || '').trim();
                if (!repId) continue;
                repIdSet.add(repId);
                if (nameBuckets.size > 1) {
                    offsetByStationId.set(repId, labelOffsets[i % labelOffsets.length]);
                }
            }

            repIdsByGroupKey.set(groupKey, repIdSet);
        }

        for (const item of stationLabels) {
            const sid = String(item?.stationId || item?.props?.id || '').trim();
            if (!sid) continue;

            const basePriority = getBasePriority(item);
            const baseName = getBaseName(item);
            const baseTranslate = getBaseTranslate(item);

            if (hideInBaseLayer && isBaseLayerHiddenStationId(sid)) {
                item.priority = 0;
                item.forceHiddenByTransferCollapse = true;
                item._multiSelectBaseLabelText = baseName;
                if (item?.el) item.el.style.translate = baseTranslate;
                if (!isMultiSelectModeEnabled() && item?.el) item.el.textContent = baseName;
                continue;
            }

            const groupSet = transferStationIdsByStationId.get(sid);

            if (!(groupSet instanceof Set) || groupSet.size <= 1) {
                item.priority = basePriority;
                item.forceHiddenByTransferCollapse = false;
                item._multiSelectBaseLabelText = baseName;
                if (item?.el) item.el.style.translate = baseTranslate;
                if (!isMultiSelectModeEnabled() && item?.el) item.el.textContent = baseName;
                continue;
            }

            const groupIds = Array.from(groupSet)
                .map((x) => String(x || '').trim())
                .filter(Boolean)
                .filter((id) => !(hideInBaseLayer && isBaseLayerHiddenStationId(id)));

            if (groupIds.length <= 1) {
                item.priority = basePriority;
                item.forceHiddenByTransferCollapse = false;
                item._multiSelectBaseLabelText = baseName;
                if (item?.el) item.el.style.translate = baseTranslate;
                if (!isMultiSelectModeEnabled() && item?.el) item.el.textContent = baseName;
                continue;
            }

            const groupKey = groupIds.slice().sort().join('|');
            const repIds = repIdsByGroupKey.get(groupKey);
            const visibleByScope = !visibleSet || visibleSet.has(sid);
            const isRepresentative = visibleByScope && repIds instanceof Set && repIds.has(sid);

            item.priority = isRepresentative ? basePriority : 0;
            item.forceHiddenByTransferCollapse = !isRepresentative;
            item._multiSelectBaseLabelText = baseName;
            if (item?.el) {
                item.el.style.translate = isRepresentative
                    ? (offsetByStationId.get(sid) || baseTranslate)
                    : baseTranslate;
            }
            if (!isMultiSelectModeEnabled() && item?.el) item.el.textContent = baseName;
        }
    };

    const toTransferCapsuleVisibleKey = (visibleIds, options = {}) => {
        const mode = options?.useFixedConnections ? 'fixed' : 'auto';
        if (options?.useFixedConnections && options?.baseHiddenFilterActive) {
            return `${mode}:__base-hidden-filter__`;
        }
        if (!(visibleIds instanceof Set)) return `${mode}:*`;
        if (!visibleIds.size) return `${mode}:__empty__`;
        return `${mode}:${Array.from(visibleIds).map(String).filter(Boolean).sort().join('|')}`;
    };

    const shouldUseFixedTransferCapsuleConnections = () => {
        if (tripPreviewActive) return false;
        if (dirPreviewActive) return false;
        if (isMultiSelectModeEnabled() && getBaseMultiSelectedLineIds().size) return false;
        if (selectedLineId) return false;
        if (selectedCompany) return false;
        if (selectedStationId) return false;
        if (selectedStationLineIds && selectedStationLineIds.size) return false;
        return true;
    };

    const refreshTransferCapsulesNow = () => {
        if (!map || !transferCapsuleStationsData || !Array.isArray(transferCapsuleStationGroups)) return;

        const useFixedConnections = shouldUseFixedTransferCapsuleConnections();
        const fixedVisibleStationIds = useFixedConnections ? getFixedVisibleStationIdsForTransferCapsules() : null;
        const visibleStationIds = useFixedConnections ? fixedVisibleStationIds : getVisibleStationIdsForTransferCapsules();
        const nextKey = toTransferCapsuleVisibleKey(visibleStationIds, {
            useFixedConnections,
            baseHiddenFilterActive: fixedVisibleStationIds instanceof Set
        });
        if (nextKey === transferCapsuleVisibleKey) return;
        transferCapsuleVisibleKey = nextKey;

        const transferCapsuleData = buildTransferCapsuleGeoJSON(transferCapsuleStationsData, transferCapsuleStationGroups, {
            visibleStationIds,
            fixedConnectionsByGroupId: useFixedConnections ? transferCapsuleBaseConnectionOrder : null,
            singleStationFallbackCircle: true,
            resolveLineColor: (lineId) => {
                const id = String(lineId || '').trim();
                if (!id) return '';
                return resolveRailColorForTheme(lineColorById.get(id) || '') || '';
            }
        });

        addTransferCapsuleLayers(map, transferCapsuleData, {
            beforeLayerId: 'stations-layer',
            minZoom: 8
        });
    };

    const scheduleTransferCapsuleRefresh = () => {
        if (transferCapsuleRefreshRafId != null) return;
        transferCapsuleRefreshRafId = requestAnimationFrame(() => {
            transferCapsuleRefreshRafId = null;
            refreshTransferCapsulesNow();
        });
    };

    const applyMultiSelectBaseLayerState = (enabled) => {
        const active = enabled === true;
        if (active) {
            try {
                clearBaseMultiSelections();
            } catch {
                // ignore
            }
            return;
        }
        try {
            clearBaseMultiSelections();
            clearSelectionsAndRestore();
        } catch {
            // ignore
        }
    };

    const applyMultiSelectTripPreviewLayerState = (enabled) => {
        const active = enabled === true;
        try {

            clearTripPathPreview();
            clearDirHeaderPreview();
        } catch {
            // ignore
        }
        if (active) return;
        try {
            // 预留：后续在这里恢复“trip-preview 图层多选态”专属逻辑
        } catch {
            // ignore
        }
    };

    const applyMultiSelectModeState = (enabled) => {
        const next = enabled === true;
        if (multiSelectModeEnabled === next) return;
        multiSelectModeEnabled = next;

        try {
            window.__TokyoRailMultiSelectEnabled = next;
        } catch {
            // ignore
        }

        if (next) {
            hoverPreviewEnabledBeforeMultiSelect = isHoverPreviewEnabled();
            hoverPreviewToggleController.setEnabled(false, { persistStorage: false });
            hoverPreviewToggleController.setDisabled(true);
        } else {
            hoverPreviewToggleController.setDisabled(false);
            hoverPreviewToggleController.setEnabled(hoverPreviewEnabledBeforeMultiSelect, { persistStorage: false });
        }

        applyMultiSelectBaseLayerState(next);
        applyMultiSelectTripPreviewLayerState(next);
        emitMultiSelectLayersUpdated();
    };

    try {
        window.__TokyoRailMultiSelectModeInternalAPI = {
            setEnabledSilent: (enabled) => {
                const next = enabled === true;
                multiSelectModeEnabled = next;
                try {
                    window.__TokyoRailMultiSelectEnabled = next;
                } catch {
                    // ignore
                }
            }
        };
    } catch {
        // ignore
    }


    const timetableCache = getGlobalTimetableCache({ maxBytes: 50 * 1024 * 1024, logFetch: true, logDiscover: true });

    const cssEscape = (value) => {
        const s = String(value);
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s);
        return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    };


    const selectionBadgeEl = document.createElement('div');
    selectionBadgeEl.className = 'selection-badge is-hidden';
    const selectionBadgeIconEl = document.createElement('span');
    selectionBadgeIconEl.className = 'selection-badge-icon';
    selectionBadgeIconEl.style.gap = '4px';
    selectionBadgeIconEl.style.marginRight = '6px';
    const selectionBadgeTextEl = document.createElement('span');
    selectionBadgeTextEl.className = 'selection-badge-text';
    selectionBadgeEl.appendChild(selectionBadgeIconEl);
    selectionBadgeEl.appendChild(selectionBadgeTextEl);
    document.body.appendChild(selectionBadgeEl);

    const lineNameById = new Map();
    const lineColorById = new Map();
    const lineColorByName = new Map();
    const lineCompanyById = new Map();
    const tripPreviewRenderer = createTripPreviewRenderer({
        mapEngine,
        getLinePaint: () => tripPreviewLineLayerPaint(),
        getStopPaint: () => tripPreviewStopLayerPaint({
            isDarkThemeActive: isDarkThemeActive(),
            lineColorById
        })
    });

    const getStationNameForMultiSelect = (stationId) => {
        const sid = String(stationId || '').trim();
        if (!sid) return '-';
        const labels = Array.isArray(stationLabels) ? stationLabels : [];
        for (const item of labels) {
            const props = item?.props || {};
            const id = String(item?.stationId || props?.id || '').trim();
            if (id !== sid) continue;
            const n = String(props?.name_zh || props?.name || props?.name_ja || '').trim();
            if (n) return n;
        }
        return sid;
    };

    const getLineNameForMultiSelect = (lineId) => {
        const id = String(lineId || '').trim();
        if (!id) return '未知线路';
        return String(lineNameById.get(id) || id);
    };

    const resolveLineSelectionForApp = (lineId) => {
        const id = String(lineId ?? '').trim();
        if (!id) {
            return {
                rawLineId: '',
                mainLineId: '',
                mergedLineIds: []
            };
        }

        const byMenu = (menu && typeof menu.resolveLineSelection === 'function')
            ? menu.resolveLineSelection(id)
            : null;
        if (byMenu) {
            const mainLineId = String(byMenu?.mainLineId ?? id).trim() || id;
            const mergedLineIds = Array.isArray(byMenu?.mergedLineIds)
                ? byMenu.mergedLineIds.map(String).filter(Boolean)
                : [mainLineId];
            return {
                rawLineId: id,
                mainLineId,
                mergedLineIds: mergedLineIds.length ? mergedLineIds : [mainLineId]
            };
        }

        return resolveLineSelectionByBranchRules(id, lineSelectionLinesObj || null);
    };

    const getBaseKindNameForMultiSelect = (kind) => {
        const k = String(kind || '').trim();
        if (k === 'company') return '公司筛选';
        if (k === 'mode') return '模式筛选';
        return '基础线路';
    };

    const getRailwaysIndexById = async () => {
        if (railwaysIndexByIdCachePromise) return railwaysIndexByIdCachePromise;

        railwaysIndexByIdCachePromise = (async () => {
            const list = await getCachedJson('./data/railways.json');
            const out = new Map();
            for (const row of Array.isArray(list) ? list : []) {
                const id = String(row?.id || '').trim();
                if (!id || out.has(id)) continue;
                out.set(id, row);
            }
            return out;
        })().catch(() => new Map());

        return railwaysIndexByIdCachePromise;
    };

    const getMultiSelectBaseTripPreviewLineIds = () => {
        const ids = Array.from(getBaseMultiSelectedLineIds()).map(String).filter(Boolean);
        ids.sort((a, b) => a.localeCompare(b));
        return ids;
    };

    const buildMultiSelectBaseTripVirtualTrips = async (lineIds) => {
        const ids = Array.isArray(lineIds) ? lineIds.map((x) => String(x || '').trim()).filter(Boolean) : [];
        if (!ids.length) return [];

        const railwaysIndexById = await getRailwaysIndexById();
        const out = [];

        for (const lineId of ids) {
            const meta = railwaysIndexById.get(lineId) || null;
            const stationIds = Array.isArray(meta?.stations)
                ? meta.stations.map((x) => String(x || '').trim()).filter(Boolean)
                : Array.isArray(meta?.stationIds)
                    ? meta.stationIds.map((x) => String(x || '').trim()).filter(Boolean)
                    : [];
            if (stationIds.length < 2) continue;

            const lineName = String(meta?.title?.['zh-Hans'] || meta?.title?.['zh-Hant'] || meta?.title?.ja || meta?.title?.en || lineNameById.get(lineId) || lineId).trim() || lineId;
            const payload = buildVirtualTripPreviewPayload({
                lineId,
                lineName,
                stationIds,
                tripKey: lineId,
                previewSource: MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE,
                fitMode: 'none'
            });
            if (payload) out.push(payload);
        }

        return out;
    };

    const syncMultiSelectBaseTripPreview = async () => {
        if (!isMultiSelectModeEnabled()) {
            multiSelectBaseTripPreviewSignature = '';
            clearTripPathPreview({ source: MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE });
            return;
        }

        const lineIds = getMultiSelectBaseTripPreviewLineIds();
        const signature = lineIds.join('|');

        if (!lineIds.length) {
            if (multiSelectBaseTripPreviewSignature) {
                multiSelectBaseTripPreviewSignature = '';
                clearTripPathPreview({ source: MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE });
            }
            return;
        }

        if (signature === multiSelectBaseTripPreviewSignature) return;
        multiSelectBaseTripPreviewSignature = signature;

        const virtualTrips = await buildMultiSelectBaseTripVirtualTrips(lineIds);
        if (!virtualTrips.length) {
            clearTripPathPreview({ source: MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE });
            return;
        }

        previewTripPath({
            selectedLineId: 'multi-base',
            mainLineId: lineIds[0],
            tripKey: signature,
            previewKey: MULTI_SELECT_BASE_TRIP_PREVIEW_KEY,
            previewSource: MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE,
            fitMode: 'none',
            virtualTrips
        }, { fitMode: 'none', clearBefore: true });
    };

    const getMultiSelectLineBranchSource = (lineId) => {
        const id = String(lineId || '').trim();
        if (!id) return '';
        return `ms-line-branch:${id}`;
    };

    const multiSelectBranchPreviewStepByLineId = new Map();

    const getLineIdFromBaseMultiSelectKey = (key) => {
        const k = String(key || '').trim();
        if (!k.startsWith('line:')) return '';
        return String(k.slice('line:'.length) || '').trim();
    };

    const hasTripPreviewSelectionBySource = (source) => {
        const target = String(source || '').trim();
        if (!target) return false;
        for (const entry of tripPreviewSelectionsByKey.values()) {
            const current = String(entry?.source || resolveTripPreviewPayloadSource(entry?.payload) || '').trim();
            if (current === target && entry?.hidden !== true) return true;
        }
        return false;
    };

    const toggleBaseLineBranchPreview = (baseKey) => {
        const key = String(baseKey || '').trim();
        const lineId = getLineIdFromBaseMultiSelectKey(key);
        if (!lineId) return false;
        const source = getMultiSelectLineBranchSource(lineId);
        if (!source) return false;

        const baseEntry = baseMultiSelectionsByKey.get(key);
        if (!baseEntry) return false;

        const currentStep = Number(multiSelectBranchPreviewStepByLineId.get(lineId) || 0);

        if (currentStep >= 2 && hasTripPreviewSelectionBySource(source)) {
            clearTripPathPreview({ source });
            multiSelectBranchPreviewStepByLineId.delete(lineId);

            const latest = baseMultiSelectionsByKey.get(key);
            if (latest?.hidden === true && latest?.branchAutoHidden === true) {
                baseMultiSelectionsByKey.set(key, {
                    ...latest,
                    hidden: false,
                    branchAutoHidden: false
                });
                emitMultiSelectLayersUpdated();
                syncMultiSelectBaseTripPreview().catch(() => null);
                applySelectionEffects();
                collisionController?.scheduleUpdate?.();
            }
            return false;
        }

        const isFirstClick = currentStep <= 0 || !hasTripPreviewSelectionBySource(source);
        if (isFirstClick) {
            if (baseEntry?.hidden !== true) {
                baseMultiSelectionsByKey.set(key, {
                    ...baseEntry,
                    hidden: true,
                    branchAutoHidden: true
                });
                emitMultiSelectLayersUpdated();
                syncMultiSelectBaseTripPreview().catch(() => null);
                applySelectionEffects();
                collisionController?.scheduleUpdate?.();
            } else if (baseEntry?.branchAutoHidden === true) {
                baseMultiSelectionsByKey.set(key, {
                    ...baseEntry,
                    branchAutoHidden: false
                });
                emitMultiSelectLayersUpdated();
                syncMultiSelectBaseTripPreview().catch(() => null);
            }
        }

        previewBranchesForLine({
            lineId,
            lineName: getLineNameForMultiSelect(lineId),
            fitMode: 'none',
            previewSource: source,
            filterSpecial: isFirstClick
        }).then((result) => {
            if (result?.ok === true) {
                const nextStep = isFirstClick ? 1 : 2;
                multiSelectBranchPreviewStepByLineId.set(lineId, nextStep);
            } else {
                multiSelectBranchPreviewStepByLineId.delete(lineId);
            }
        }).catch(() => {
            clearTripPathPreview({ source });
            multiSelectBranchPreviewStepByLineId.delete(lineId);
            const latest = baseMultiSelectionsByKey.get(key);
            if (latest?.hidden === true && latest?.branchAutoHidden === true) {
                baseMultiSelectionsByKey.set(key, {
                    ...latest,
                    hidden: false,
                    branchAutoHidden: false
                });
                emitMultiSelectLayersUpdated();
                applySelectionEffects();
                collisionController?.scheduleUpdate?.();
            }
        });

        syncMultiSelectBaseTripPreview().catch(() => null);
        return true;
    };

    const MENU_THROUGH_SOURCE_BY_CATEGORY = Object.freeze(
        Object.fromEntries(
            Object.entries(THROUGH_SERVICE_CONFIGS_OBJECT).map(([category, info]) => [
                category, 
                Object.freeze(info.routeIds)
            ])
        )
    );
    const MENU_THROUGH_PREVIEW_SOURCES = Object.freeze(
        Object.values(THROUGH_SERVICE_CONFIGS_OBJECT).map(info => `rw-menu-through:${info.lineId}`)
    );
    const getMenuThroughDisplayByCategory = (category) => {
        return THROUGH_SERVICE_DISPLAY[category] || null;
    };
    const getMenuThroughDisplayByLineId = (lineId) => {
        const category = getMenuThroughCategoryByLineId(lineId);
        return getMenuThroughDisplayByCategory(category);
    };

    const getMenuThroughDisplayByPreviewSource = (source) => {
        const raw = String(source || '').trim();
        if (!raw.startsWith('rw-menu-through:')) return null;
        const lineId = raw.slice('rw-menu-through:'.length).trim();
        if (!lineId) return null;
        return getMenuThroughDisplayByLineId(lineId);
    };

    const resolveTripPreviewStationOverrideColor = (payload, source) => {
        const throughFromSource = getMenuThroughDisplayByPreviewSource(source);
        const bySourceColor = String(throughFromSource?.color || '').trim();
        if (bySourceColor) return resolveRailColorForTheme(bySourceColor) || bySourceColor;

        const byCategory = getMenuThroughDisplayByCategory(String(payload?.throughServiceCategory || '').trim());
        const byCategoryColor = String(byCategory?.color || '').trim();
        if (byCategoryColor) return resolveRailColorForTheme(byCategoryColor) || byCategoryColor;

        const fallback = String(payload?.highlightColor || payload?.typeColor || '').trim();
        const throughColors = new Set(
            Object.values(THROUGH_SERVICE_CONFIGS_OBJECT)
                .map(info => String(info.color || '').trim().toLowerCase())
                .filter(Boolean)
        );
        const fallbackNorm = fallback.toLowerCase();
        if (!fallbackNorm || !throughColors.has(fallbackNorm)) return '';
        return resolveRailColorForTheme(fallback) || fallback;
    };

    const clearMenuThroughPreview = () => {
        for (const source of MENU_THROUGH_PREVIEW_SOURCES) {
            clearTripPathPreview({ source });
        }
    };

    const previewMenuThroughLine = ({ lineId, source }) => {
        const menuLineId = String(lineId || '').trim();
        const throughCategory = getMenuThroughCategoryByLineId(menuLineId);
        if (!throughCategory) return false;
        const sourceLineIds = Array.isArray(MENU_THROUGH_SOURCE_BY_CATEGORY[throughCategory])
            ? MENU_THROUGH_SOURCE_BY_CATEGORY[throughCategory]
            : [];
        if (!sourceLineIds.length) return false;

        const display = getMenuThroughDisplayByCategory(throughCategory);
        const previewSource = `rw-menu-through:${menuLineId}`;
        const fitMode = source === 'hover' ? 'preview' : 'commit';


        selectedCompany = null;
        selectedStationLineIds = null;
        selectedLineId = menuLineId;
        selectedServiceMode = 'all';
        if (source === 'hover') setStationLabelMode('auto');
        else setStationLabelMode('all');
        applySelectionEffects();

        previewBranchesForLine({
            lineId: sourceLineIds[0],
            sourceLineIds,
            lineName: String(display?.name || menuLineId),
            throughServiceCategory: throughCategory,
            highlightColor: String(display?.color || '').trim(),
            fitMode,
            previewSource
        }).catch(() => {
            clearTripPathPreview({ source: previewSource });
        });

        return true;
    };

    const buildMultiSelectLayerItems = () => {
        const items = [];

        for (const [key, entry] of baseMultiSelectionsByKey.entries()) {
            const ids = entry?.lineIds instanceof Set ? Array.from(entry.lineIds).map(String).filter(Boolean) : [];
            const firstLineId = ids[0] || '';
            const kind = String(entry?.kind || '').trim();
            const fallbackCompanyName = key.startsWith('company:') ? key.slice('company:'.length) : '';
            const baseDisplayName = String(entry?.displayName || '').trim();
            const branchSource = getMultiSelectLineBranchSource(firstLineId);
            items.push({
                id: `base:${key}`,
                scope: 'base',
                key,
                visible: entry?.hidden !== true,
                lineName: kind === 'company'
                    ? (baseDisplayName || fallbackCompanyName || getLineNameForMultiSelect(firstLineId))
                    : getLineNameForMultiSelect(firstLineId),
                originName: '-',
                terminalName: '-',
                typeName: getBaseKindNameForMultiSelect(entry?.kind),
                branchToggleSupported: kind === 'line' && !!firstLineId,
                branchVisible: kind === 'line' && !!branchSource ? hasTripPreviewSelectionBySource(branchSource) : false
            });
        }

        for (const [key, entry] of tripPreviewSelectionsByKey.entries()) {
            const payload = entry?.payload || {};
            const built = entry?.built || {};
            const builtLineIds = built?.lineIds instanceof Set
                ? Array.from(built.lineIds).map((x) => String(x || '').trim()).filter(Boolean)
                : [];
            const selectedLineId = String(payload?.selectedLineId || '').trim();
            const mainLineId = String(payload?.mainLineId || '').trim();
            const lineIdCandidates = [selectedLineId, mainLineId, ...builtLineIds].filter(Boolean);
            const lineId = lineIdCandidates.find((id) => lineNameById.has(id)) || lineIdCandidates[0] || '';
            const source = String(entry?.source || resolveTripPreviewPayloadSource(payload) || '').trim();
            if (source === MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE) continue;
            const isBranchSource = source.startsWith('ms-line-branch:');
            const typeName = String(payload?.typeName || payload?.tripTypeName || '').trim() || '-';
            const originName = getStationNameForMultiSelect(built?.startStationId || payload?.originStationId || '');
            const terminalName = getStationNameForMultiSelect(built?.endStationId || payload?.terminalStationId || '');
            const baseLineName = String(payload?.selectedLineName || payload?.lineName || payload?.mainLineName || '').trim()
                || getLineNameForMultiSelect(lineId);
            const displayLineName = isBranchSource ? `${baseLineName}（直通线路）` : baseLineName;

            items.push({
                id: `trip:${key}`,
                scope: 'trip',
                key,
                visible: entry?.hidden !== true,
                lineName: displayLineName,
                originName,
                terminalName,
                typeName,
                displayText: isBranchSource ? displayLineName : ''
            });
        }

        return items;
    };

    const emitMultiSelectLayersUpdated = () => {
        try {
            window.dispatchEvent(new CustomEvent(MULTI_SELECT_LAYERS_EVENT, {
                detail: {
                    ts: Date.now(),
                    enabled: isMultiSelectModeEnabled(),
                    items: buildMultiSelectLayerItems()
                }
            }));
        } catch {
            // ignore
        }
    };

    const normalizeArrayLike = (value) => {
        if (Array.isArray(value)) return value;
        if (typeof value !== 'string') return value != null ? [value] : [];

        const s = value.trim();
        if (!s) return [];


        if (s.startsWith('[') && s.endsWith(']')) {
            try {
                const parsed = JSON.parse(s);
                return Array.isArray(parsed) ? parsed : [value];
            } catch {
                return [value];
            }
        }
        return [s];
    };

    const loadTransferStationIdMap = async () => {
        return getTransferStationIdMap();
    };

    const getSelectedStationHighlightIds = () => {
        const sid = String(selectedStationId ?? '').trim();
        if (!sid) return [];
        const groupSet = transferStationIdsByStationId.get(sid);
        if (groupSet && groupSet.size) return Array.from(groupSet).map(String).filter(Boolean);
        return [sid];
    };

    const updateSelectedStationLabelClass = () => {
        const selectedIds = new Set(getSelectedStationHighlightIds().map(String).filter(Boolean));
        const hasSelected = selectedIds.size > 0;
        const labels = Array.isArray(stationLabels) ? stationLabels : [];

        for (const item of labels) {
            const el = item?.el;
            if (!(el instanceof HTMLElement)) continue;
            const sid = String(item?.stationId ?? item?.props?.id ?? '').trim();
            const isSelected = hasSelected && !!sid && selectedIds.has(sid);
            el.classList.toggle('station-selected-current-label', isSelected);
        }
    };

    const clearSelectedStationCurrentPopup = () => {
        try {
            selectedStationCurrentPopup?.remove?.();
        } catch {
            // ignore
        }
        selectedStationCurrentPopup = null;
        selectedStationCurrentPopupStationId = null;
    };

    const updateSelectedStationCurrentPopup = () => {
        const sid = String(selectedStationId ?? '').trim();
        if (!sid) {
            clearSelectedStationCurrentPopup();
            return;
        }

        const coord = stationCoordById.get(sid);
        if (!Array.isArray(coord) || coord.length < 2) {
            clearSelectedStationCurrentPopup();
            return;
        }

        if (selectedStationCurrentPopup && selectedStationCurrentPopupStationId === sid) {
            return;
        }

        clearSelectedStationCurrentPopup();

        const el = document.createElement('div');
        el.className = 'station-selected-current-label';
        el.textContent = '当前站';

        try {
            selectedStationCurrentPopup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false,
                closeOnMove: false,
                anchor: 'top',
                offset: [0, 8],
                className: 'station-selected-current-popup'
            })
                .setLngLat(coord)
                .setDOMContent(el)
                .addTo(map);
            selectedStationCurrentPopupStationId = sid;
        } catch {
            selectedStationCurrentPopup = null;
            selectedStationCurrentPopupStationId = null;
        }
    };

    const getVisibleStationIdsForSelectedStationSelection = () => {
        if (!selectedStationId) return null;

        const selectedIds = filterStationIdsForBaseLayer(
            new Set(getSelectedStationHighlightIds().map(String).filter(Boolean))
        );
        if (selectedStationLineIds && selectedStationLineIds.size) {
            const lineStationIds = getVisibleStationIdsByLineIds(selectedStationLineIds);
            for (const id of selectedIds) {
                lineStationIds.add(String(id || '').trim());
            }
            const filteredLineStationIds = filterStationIdsForBaseLayer(lineStationIds);
            if (filteredLineStationIds.size) return filteredLineStationIds;
        }
        return selectedIds;
    };

    const getServingLineIdsFromStationProps = (props) => {
        const p = props || {};
        const servingIdsRaw = normalizeArrayLike(p.serving_ids);
        const platformLineIdsRaw = normalizeArrayLike(p.platform_line_id);

        const ids = (servingIdsRaw && servingIdsRaw.length ? servingIdsRaw : platformLineIdsRaw)
            .map((x) => String(x).trim())
            .filter(Boolean);


        const seen = new Set();
        const out = [];
        for (const id of ids) {
            if (seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
        return out;
    };

    const selectServingLinesForStation = (props) => {
        const ids = getServingLineIdsFromStationProps(props);
        if (!ids.length) return;

        selectedStationLineIds = new Set(ids);
        selectedStationId = String(props?.id ?? '').trim() || null;
        selectedCompany = null;
        selectedLineId = null;
        selectedServiceMode = 'all';
        isolateStationsToSelectedLine = false;
        setStationLabelMode('all');

        applySelectionEffects();
    };

    const isJourneyMapPickActive = () => {
        try {
            if (window.__TokyoRailJourneyMapPickActive === true) return true;
            const until = Number(window.__TokyoRailSuppressStationSelectionUntil) || 0;
            return until > Date.now();
        } catch {
            return false;
        }
    };

    function updateSelectionBadge() {
        const clearSelectionBadgeIcons = () => {
            selectionBadgeIconEl.innerHTML = '';
        };

        const appendBadgeIcon = ({ routeId, code, color }) => {
            const icon = createLineIconElement({ routeId, code, color });
            if (!icon) return;
            icon.style.marginRight = '0';
            selectionBadgeIconEl.appendChild(icon);
        };

        if (selectedLineId) {
            const sid = String(selectedLineId);
            const throughDisplay = getMenuThroughDisplayByLineId(sid);
            const name = throughDisplay?.name || lineNameById.get(sid) || sid;
            const color = resolveRailColorForTheme(throughDisplay?.color || lineColorById.get(sid) || '#111') || '#111';

            clearSelectionBadgeIcons();
            const throughCategory = getMenuThroughCategoryByLineId(sid);
            const info = THROUGH_SERVICE_CONFIGS_OBJECT[throughCategory];

            if (info) {
                for (const code of info.codes || []) {
                    appendBadgeIcon({
                        routeId: info.routeIds?.[0] || '', // 动态获取主控制物理路线 ID
                        code: code,
                        color: info.color || ''
                    });
                }
            } else {
                appendBadgeIcon({ 
                    routeId: sid, 
                    code: '', 
                    color: lineColorById.get(sid) || '' 
                });
            }

            selectionBadgeTextEl.textContent = name;
            selectionBadgeTextEl.style.color = color;
            selectionBadgeEl.classList.remove('is-hidden');
            return;
        }

        if (selectedCompany) {
            clearSelectionBadgeIcons();
            const companyKey = String(selectedCompany);
            const companyZh = String(companyLogoMap?.[companyKey]?.zh || '').trim();
            const logoFile = companyLogoMap?.[companyKey]?.img?.[0];
            if (logoFile) {
                const logoIcon = document.createElement('img');
                logoIcon.className = 'selection-badge-company-logo';
                logoIcon.alt = companyZh || companyKey;
                logoIcon.decoding = 'async';
                logoIcon.loading = 'eager';
                logoIcon.style.height = '25px';
                logoIcon.style.width = 'auto';
                logoIcon.style.maxWidth = '80px';
                logoIcon.style.display = 'block';
                logoIcon.style.objectFit = 'contain';
                selectionBadgeIconEl.appendChild(logoIcon);
                setImageElementFromCache(logoIcon, getCompanyLogoCandidates(logoFile), {
                    cacheKey: `companyLogo:${logoFile}`
                }).catch(() => null);
            }
            selectionBadgeTextEl.textContent = companyZh || companyKey;
            selectionBadgeTextEl.style.color = isDarkThemeActive() ? '#f2f2f2' : '#111';
            selectionBadgeEl.classList.remove('is-hidden');
            return;
        }

        clearSelectionBadgeIcons();
        selectionBadgeEl.classList.add('is-hidden');
    }


    registerCompanyLogoMap(companyLogoMap, { preload: true, concurrency: 8 });

    function applyLineSelectionStyle() {
        if (!highlightRenderer.hasLayer('lines-layer')) return;

        const baseColorExpr = buildBaseLineColorExpr({ isDarkThemeActive: isDarkThemeActive() });
        const applyLinePaint = (paint) => {
            highlightRenderer.applyLinePaint(paint);
        };


        if (tripPreviewActive) {
            applyLinePaint(buildLowlightLinePaint({ dimOpacity: 0.45 }));
            return;
        }

        if (dirPreviewActive && dirPreviewLineIds && dirPreviewLineIds.size) {
            const ids = Array.from(dirPreviewLineIds).map(String).filter(Boolean);
            const hitExpr = ids.length === 1
                ? ['==', ['get', 'id'], ids[0]]
                : ['in', ['get', 'id'], ['literal', ids]];
            applyLinePaint(buildFocusedLinePaint({ baseColorExpr, focusExpr: hitExpr, dimOpacity: 0.6 }));
            return;
        }

        // 线路优先：选中线路时，忽略公司选中

        if (selectedLineId) {
            const mergedIds = (selectedStationLineIds && selectedStationLineIds.size > 1)
                ? Array.from(selectedStationLineIds).map(String).filter(Boolean)
                : null;
            const hitExpr = mergedIds
                ? ['in', ['get', 'id'], ['literal', mergedIds]]
                : ['==', ['get', 'id'], selectedLineId];

            applyLinePaint(buildFocusedLinePaint({ baseColorExpr, focusExpr: hitExpr, dimOpacity: 0.6 }));

            return;
        }


        if (selectedStationLineIds && selectedStationLineIds.size) {
            const ids = Array.from(selectedStationLineIds).map(String).filter(Boolean);
            const hitExpr = ids.length === 1
                ? ['==', ['get', 'id'], ids[0]]
                : ['in', ['get', 'id'], ['literal', ids]];

            applyLinePaint(buildFocusedLinePaint({ baseColorExpr, focusExpr: hitExpr, dimOpacity: 0.6 }));

            return;
        }

        if (!selectedCompany) {
            applyLinePaint(buildFocusedLinePaint({ baseColorExpr }));
            return;
        }

        applyLinePaint(buildFocusedLinePaint({
            baseColorExpr,
            focusExpr: ['==', ['get', 'company'], selectedCompany],
            dimOpacity: 0.6
        }));
    }

    const applyBaseLayerVisibilityFilters = () => {
        if (!highlightRenderer.hasLayer('lines-layer')) return;

        const baseFilterExpr = ['!=', ['get', 'hidden_by_opacity_zero'], 1];
        const hideSeibuBranches = shouldApplyBaseLayerHiddenFilter();
        const hiddenLineIds = Array.from(BASE_LAYER_HIDDEN_LINE_IDS);

        const lineFilterExpr = hideSeibuBranches && hiddenLineIds.length
            ? ['all', baseFilterExpr, ...hiddenLineIds.map((id) => ['!=', ['get', 'id'], id])]
            : baseFilterExpr;

        highlightRenderer.applyLineFilter(lineFilterExpr);
    };

    function applyStationThemePaintToMapLayers() {
        const dark = isDarkThemeActive();
        const overrideColor = String(tripPreviewStationOverrideColor || '').trim();
        const overrideStationIds = tripPreviewActive && tripPreviewStationIds && tripPreviewStationIds.size
            ? Array.from(tripPreviewStationIds)
            : [];
        highlightRenderer.applyStationThemePaint({
            stationsPaint: {
                'circle-color': buildStationCircleColorPaintExpr({
                    isDarkThemeActive: dark,
                    lineColorById,
                    overrideColor,
                    overrideStationIds
                }),
                'circle-stroke-color': stationCircleStrokeColorPaint({ isDarkThemeActive: dark })
            }
        });
        tripPreviewRenderer.applyStopPaint({
            'circle-color': buildStationCircleColorPaintExpr({
                isDarkThemeActive: dark,
                lineColorById
            }),
            'circle-stroke-color': stationCircleStrokeColorPaint({ isDarkThemeActive: dark })
        });
    }

    function buildStationAnyLineMatchExpr(lineIds) {
        // 判断站点是否服务于给定线路集合：

        const platformIdsExpr = ['coalesce', ['get', 'platform_line_id'], ['get', 'serving_ids'], ['literal', []]];
        const ids = Array.isArray(lineIds) ? lineIds.filter(Boolean) : [];
        if (!ids.length) return ['boolean', false];
        if (ids.length === 1) return ['in', ids[0], platformIdsExpr];

        const any = ['any'];
        for (const id of ids) {
            any.push(['in', id, platformIdsExpr]);
        }
        return any;
    }

    function applyStationSelectionStyle() {
        if (!highlightRenderer.hasLayer('stations-layer')) return;
        const multiLineIds = getBaseMultiSelectedLineIds();
        const applyStationPaint = (paint) => {
            highlightRenderer.applyStationSelectionPaint(paint);
        };

        const applyBaseStationPaint = () => {
            applyStationPaint(buildStationSelectionPaint());
            applyStationThemePaintToMapLayers();
        };

        const applyFocusedStationPaint = (isSelectedExpr, { hideOthers = true } = {}) => {
            applyStationPaint(buildStationSelectionPaint({ isSelectedExpr, hideOthers }));
            applyStationThemePaintToMapLayers();
        };

        if (tripPreviewActive) {
            if (tripPreviewStationIds && tripPreviewStationIds.size) {
                const ids = Array.from(tripPreviewStationIds).map(String).filter(Boolean);
                const isSelectedExpr = ids.length === 1
                    ? ['==', ['get', 'id'], ids[0]]
                    : ['in', ['get', 'id'], ['literal', ids]];
                applyFocusedStationPaint(isSelectedExpr, { hideOthers: true });
                return;
            }
            applyBaseStationPaint();
            return;
        }

        if (dirPreviewActive && dirPreviewStationIds && dirPreviewStationIds.size) {
            const ids = Array.from(dirPreviewStationIds).map(String).filter(Boolean);
            const isSelectedExpr = ids.length === 1
                ? ['==', ['get', 'id'], ids[0]]
                : ['in', ['get', 'id'], ['literal', ids]];
            applyFocusedStationPaint(isSelectedExpr, { hideOthers: true });
            return;
        }



        const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['literal', []]];

        const platformIdsExpr = ['coalesce', ['get', 'platform_line_id'], servingIdsExpr];

        if (isMultiSelectModeEnabled() && multiLineIds.size) {
            const isSelectedStation = buildStationAnyLineMatchExpr(Array.from(multiLineIds));
            applyFocusedStationPaint(isSelectedStation, { hideOthers: true });
            return;
        }

        // 未选择任何东西：恢复原样式
        if (!selectedLineId && !selectedCompany && !(selectedStationLineIds && selectedStationLineIds.size)) {
            applyBaseStationPaint();
            return;
        }

        const mergedIdsForSelectedLine = (selectedLineId && selectedStationLineIds && selectedStationLineIds.size > 1)
            ? Array.from(selectedStationLineIds).map(String).filter(Boolean)
            : null;

        const isSelectedStation = selectedLineId
            ? (mergedIdsForSelectedLine
                ? buildStationAnyLineMatchExpr(mergedIdsForSelectedLine)
                : ['in', selectedLineId, platformIdsExpr])
            : selectedCompany
                ? buildStationAnyLineMatchExpr(Array.from(enabledLineIdsByCompany.get(selectedCompany) ?? []))
                : (selectedStationId
                    ? (() => {
                        const ids = getSelectedStationHighlightIds().map(String).filter(Boolean);
                        const stationExpr = (() => {
                            if (!ids.length) return ['==', ['get', 'id'], String(selectedStationId)];
                            if (ids.length === 1) return ['==', ['get', 'id'], ids[0]];
                            return ['in', ['get', 'id'], ['literal', ids]];
                        })();

                        if (selectedStationLineIds && selectedStationLineIds.size) {
                            const lineExpr = buildStationAnyLineMatchExpr(Array.from(selectedStationLineIds));
                            return ['any', stationExpr, lineExpr];
                        }

                        return stationExpr;
                    })()
                    : buildStationAnyLineMatchExpr(Array.from(selectedStationLineIds ?? [])));

        applyFocusedStationPaint(isSelectedStation, { hideOthers: true });
        
    }

    function getEnabledLineIdsForLabels() {
        if (tripPreviewActive) return null;
        if (dirPreviewActive) return null;
        if (isMultiSelectModeEnabled()) {
            const ids = getBaseMultiSelectedLineIds();
            if (ids.size) return ids;
        }


        if (selectedLineId) {
            if (selectedStationLineIds && selectedStationLineIds.size > 1) return selectedStationLineIds;
            return new Set([selectedLineId]);
        }

        if (selectedStationLineIds && selectedStationLineIds.size) {
            return selectedStationLineIds;
        }

        if (selectedCompany && enabledLineIdsByCompany.has(selectedCompany)) {
            return enabledLineIdsByCompany.get(selectedCompany);
        }

        return null;
    }

    function updateMultiSelectStationLabelChips() {
        if (!Array.isArray(stationLabels) || !stationLabels.length) return;

        const inMultiSelectMode = isMultiSelectModeEnabled();
        const activeLineIds = inMultiSelectMode
            ? Array.from(getBaseMultiSelectedLineIds()).map(String).filter(Boolean)
            : [];
        const visibleTripSelections = inMultiSelectMode
            ? Array.from(tripPreviewSelectionsByKey.values()).filter((entry) => entry?.hidden !== true)
            : [];
        const showMultiSelectIcons = window.__TokyoRailMultiSelectShowIcons !== false;

        const resolveBaseLabelText = (item) => {
            const cached = String(item?._multiSelectBaseLabelText || '').trim();
            if (cached) return cached;
            const fromProps = String(item?.props?.name_zh || item?.props?.name || item?.stationId || '').trim();
            const fromDom = String(item?.el?.textContent || '').trim();
            const text = fromProps || fromDom;
            item._multiSelectBaseLabelText = text;
            return text;
        };

        const restoreLabel = (item) => {
            const el = item?.el;
            if (!el) return;
            const text = resolveBaseLabelText(item);
            el.textContent = text;
        };

        if (!inMultiSelectMode || (!activeLineIds.length && !visibleTripSelections.length)) {
            for (const item of stationLabels) {
                restoreLabel(item);
            }
            return;
        }

        const servingLineIdsByStationId = new Map();
        for (const item of stationLabels) {
            const sid = String(item?.stationId || item?.props?.id || '').trim();
            if (!sid) continue;
            if (!servingLineIdsByStationId.has(sid)) servingLineIdsByStationId.set(sid, new Set());
            const targetSet = servingLineIdsByStationId.get(sid);
            const ids = Array.isArray(item?.servingLineIds) ? item.servingLineIds : [];
            for (const lineId of ids) {
                const id = String(lineId || '').trim();
                if (id) targetSet.add(id);
            }
        }
        for (const item of stationLabels) {
            const el = item?.el;
            if (!el) continue;

            const sid = String(item?.stationId || item?.props?.id || '').trim();
            const transferGroup = sid ? transferStationIdsByStationId.get(sid) : null;
            const groupedStationIds = (transferGroup && transferGroup.size)
                ? Array.from(transferGroup).map((x) => String(x || '').trim()).filter(Boolean)
                : (sid ? [sid] : []);

            const stationLineIdSet = new Set();
            for (const gid of groupedStationIds) {
                const lineSet = servingLineIdsByStationId.get(gid);
                if (!lineSet || !lineSet.size) continue;
                for (const lineId of lineSet) stationLineIdSet.add(String(lineId));
            }
            const groupedStationIdSet = new Set(groupedStationIds);

            if (!stationLineIdSet.size) {
                const fallbackIds = Array.isArray(item?.servingLineIds) ? item.servingLineIds : [];
                for (const lineId of fallbackIds) {
                    const id = String(lineId || '').trim();
                    if (id) stationLineIdSet.add(id);
                }
            }

            const renderByLineId = new Map();
            const renderOrder = [];
            const ensureRenderLine = (lineId) => {
                const id = String(lineId || '').trim();
                if (!id) return null;
                if (!renderByLineId.has(id)) {
                    renderByLineId.set(id, {
                        lineId: id,
                        chipColor: resolveRailColorForTheme(lineColorById.get(id) || null) || '#999999',
                        typeColors: []
                    });
                    renderOrder.push(id);
                }
                return renderByLineId.get(id);
            };

            for (const id of activeLineIds) {
                if (!stationLineIdSet.has(id)) continue;
                ensureRenderLine(id);
            }

            const stationMatchesGroup = (candidateStationId) => {
                const sid = String(candidateStationId || '').trim();
                if (!sid) return false;
                if (groupedStationIdSet.has(sid)) return true;
                const transferGroup = transferStationIdsByStationId.get(sid);
                if (!(transferGroup && transferGroup.size)) return false;
                for (const gid of transferGroup) {
                    if (groupedStationIdSet.has(String(gid || '').trim())) return true;
                }
                return false;
            };

            for (const entry of visibleTripSelections) {
                const payload = entry?.payload || {};
                const segs = Array.isArray(payload?.segments)
                    ? payload.segments
                    : [];
                const virtualTripSegs = Array.isArray(payload?.virtualTrips)
                    ? payload.virtualTrips
                        .flatMap((v) => Array.isArray(v?.segments) ? v.segments : [])
                    : [];
                const allSegs = [...segs, ...virtualTripSegs];
                const payloadTypeColor = String(payload?.typeColor || '').trim();
                for (const seg of allSegs) {
                    const segLineId = String(seg?.lineId || '').trim();
                    if (!segLineId) continue;
                    const segStationIds = Array.isArray(seg?.stationIds) ? seg.stationIds : [];
                    const hitCurrentStation = segStationIds.some((sid) => stationMatchesGroup(sid));
                    if (!hitCurrentStation) continue;

                    const model = ensureRenderLine(segLineId);
                    if (!model) continue;

                    const typeColor = String(seg?.typeColor || payloadTypeColor).trim();
                    if (typeColor) {
                        model.typeColors.push(typeColor);
                    }
                }
            }

            if (!renderOrder.length) {
                restoreLabel(item);
                continue;
            }

            if (!showMultiSelectIcons) {
                restoreLabel(item);
                continue;
            }

            const labelText = resolveBaseLabelText(item);

            let nameEl = el.querySelector('.station-label-name');
            if (!nameEl) {
                el.textContent = '';
                nameEl = document.createElement('div');
                nameEl.className = 'station-label-name';
                el.appendChild(nameEl);
            }
            nameEl.textContent = labelText;

            let chipsRowEl = el.querySelector('.station-label-multi-row');
            if (!chipsRowEl) {
                chipsRowEl = document.createElement('div');
                chipsRowEl.className = 'station-label-multi-row';
                el.appendChild(chipsRowEl);
            }
            chipsRowEl.innerHTML = '';

            for (const lineId of renderOrder) {
                const lineModel = renderByLineId.get(lineId);
                if (!lineModel) continue;

                const cluster = document.createElement('span');
                cluster.className = 'station-label-multi-cluster';

                const chip = document.createElement('span');
                chip.className = 'station-label-multi-chip';
                chip.style.backgroundColor = String(lineModel.chipColor || '#999999');
                cluster.appendChild(chip);

                for (const typeColor of lineModel.typeColors) {
                    const typeDot = document.createElement('span');
                    typeDot.className = 'station-label-multi-type-dot';
                    const resolvedTypeColor = resolveRailColorForTheme(typeColor) || String(typeColor || '');
                    typeDot.style.backgroundColor = String(resolvedTypeColor);
                    cluster.appendChild(typeDot);
                }

                chipsRowEl.appendChild(cluster);
            }
        }
    }

    function clearSelectionsAndRestore() {
        selectedCompany = null;
        selectedLineId = null;
        selectedStationLineIds = null;
        selectedStationId = null;
        selectedServiceMode = 'all';
        isolateStationsToSelectedLine = false;
        setStationLabelMode('auto');



        pendingTransferCapsuleRefreshAfterCollision = true;
        transferCapsuleVisibleKey = '__init__';

        if (menu && typeof menu.clearActive === 'function') menu.clearActive();

        applySelectionEffects();
    }

    let applySelectionEffectsRafId = null;
    const applySelectionEffects = () => {
        if (applySelectionEffectsRafId != null) cancelAnimationFrame(applySelectionEffectsRafId);
        applySelectionEffectsRafId = requestAnimationFrame(() => {
            applySelectionEffectsRafId = null;
            applyBaseLayerVisibilityFilters();
            applyLineSelectionStyle();
            applyStationSelectionStyle();
            updateSelectedStationCurrentPopup();
            applyTransferStationLabelCollapse();
            updateSelectedStationLabelClass();
            updateMultiSelectStationLabelChips();
            if (collisionController) collisionController.scheduleUpdate();

            scheduleTransferCapsuleRefresh();
            updateSelectionBadge();
            try {
                const lineIds = (() => {
                    if (isMultiSelectModeEnabled()) {
                        const ids = Array.from(getBaseMultiSelectedLineIds()).map(String).filter(Boolean);
                        if (ids.length) return ids;
                    }
                    if (selectedLineId) {
                        if (selectedStationLineIds && selectedStationLineIds.size > 1) return Array.from(selectedStationLineIds).map(String).filter(Boolean);
                        return [String(selectedLineId)];
                    }
                    if (selectedStationLineIds && selectedStationLineIds.size) {
                        return Array.from(selectedStationLineIds).map(String).filter(Boolean);
                    }
                    if (selectedCompany && enabledLineIdsByCompany && enabledLineIdsByCompany.has(selectedCompany)) {
                        return Array.from(enabledLineIdsByCompany.get(selectedCompany) || []).map(String).filter(Boolean);
                    }
                    return [];
                })();

                if (!lineIds.length) {
                    window.dispatchEvent(new CustomEvent('__TokyoRailBaseHighlightCleared'));
                    return;
                }

                const kind = isMultiSelectModeEnabled() && getBaseMultiSelectedLineIds().size
                    ? 'multi-base'
                    : (selectedLineId ? 'line' : (selectedCompany ? 'company' : (selectedStationLineIds && selectedStationLineIds.size ? 'station' : 'unknown')));
                window.dispatchEvent(new CustomEvent('__TokyoRailBaseHighlightUpdated', {
                    detail: {
                        kind,
                        lineIds,
                        selectedLineId: selectedLineId ? String(selectedLineId) : null,
                        selectedCompany: selectedCompany ? String(selectedCompany) : null,
                        selectedStationId: selectedStationId ? String(selectedStationId) : null,
                    }
                }));
            } catch {
                // ignore
            }
        });
    };

    createHighlightFeature({
        store: appStore,
        applyLegacySelection: (state) => {
            selectedCompany = state.selectedCompany || null;
            selectedLineId = state.selectedLineId || null;
            selectedStationLineIds = state.selectedStationLineIds instanceof Set
                ? state.selectedStationLineIds
                : null;
            selectedStationId = state.selectedStationId || null;
            selectedServiceMode = state.selectedServiceMode || 'all';
            hoverPreviewEnabled = state.hoverPreviewEnabled !== false;
            applySelectionEffects();
        }
    });

    function mountSettingsMenu() {
        const existing = document.querySelector('.settings-ui');
        if (existing) {
            return existing.querySelector('.settings-content') || existing;
        }

        const root = document.createElement('div');
        root.className = 'settings-ui is-collapsed';

        const fab = document.createElement('button');
        fab.type = 'button';
        fab.className = 'settings-fab';
        fab.setAttribute('aria-label', '设置');

        const fabIcon = document.createElement('img');
        fabIcon.className = 'settings-fab-icon';
        fabIcon.alt = '';
        setImageElementFromCache(fabIcon, getIconCandidates('settings.svg'), {
            cacheKey: 'icon:settings.svg',
            fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('settings.svg'), { cacheKey: 'icon:settings.svg' })
        }).catch(() => null);
        fab.appendChild(fabIcon);

        const content = document.createElement('div');
        content.className = 'settings-content is-hidden';

        root.appendChild(fab);
        root.appendChild(content);
        document.body.appendChild(root);

        let collapseTimer = null;
        let enterTimer = null;

        const expand = () => {
            if (collapseTimer) {
                window.clearTimeout(collapseTimer);
                collapseTimer = null;
            }
            root.classList.remove('is-collapsed');
            content.classList.remove('is-hidden');
        };

        const collapse = () => {
            if (collapseTimer) {
                window.clearTimeout(collapseTimer);
                collapseTimer = null;
            }
            root.classList.add('is-collapsed');
            content.classList.add('is-hidden');
        };

        const scheduleCollapse = () => {
            if (collapseTimer) window.clearTimeout(collapseTimer);
            collapseTimer = window.setTimeout(() => {
                collapseTimer = null;
                collapse();
            }, 120);
        };

        root.addEventListener('mouseenter', () => {
            if (collapseTimer) {
                window.clearTimeout(collapseTimer);
                collapseTimer = null;
            }
            if (enterTimer) {
                window.clearTimeout(enterTimer);
                enterTimer = null;
            }
            enterTimer = window.setTimeout(() => {
                enterTimer = null;
                expand();
            }, 100);
        });

        root.addEventListener('mouseleave', (evt) => {
            const toEl = evt?.relatedTarget;
            if (toEl && toEl instanceof Element && toEl.closest('.settings-time-picker')) return;
            if (window.__TokyoRailTimePickerOpen === true) return;
            if (enterTimer) {
                window.clearTimeout(enterTimer);
                enterTimer = null;
            }
            scheduleCollapse();
        });

        fab.addEventListener('pointerdown', (evt) => {
            evt.preventDefault?.();
            evt.stopPropagation?.();
            if (root.classList.contains('is-collapsed')) expand();
            else collapse();
        });

        fab.addEventListener('click', (evt) => {
            evt.preventDefault?.();
            evt.stopPropagation?.();
            if (root.classList.contains('is-collapsed')) expand();
            else collapse();
        });

        document.addEventListener('pointerdown', (evt) => {
            if (root.classList.contains('is-collapsed')) return;
            const t = evt?.target;
            if (t && root.contains(t)) return;
            if (t && t instanceof Element && t.closest('.settings-time-picker')) return;
            if (window.__TokyoRailTimePickerOpen === true) return;
            collapse();
        }, true);

        return content;
    }

    const settingsMenuContentEl = mountSettingsMenu();


    panel = createPanel({
        hoverDelayMs: 50,
        settingsContentEl: settingsMenuContentEl,
        companyLogoMap,
        railwaysOrderIndex,
        getHoverPreviewEnabled: () => isHoverPreviewEnabled(),
        getMultiSelectModeEnabled: () => isMultiSelectModeEnabled(),
        getTimetableViewMode: () => readTimetableViewMode(),
        getLineMeta: (lineId) => {
            const id = String(lineId);
            return {
                company: lineCompanyById.get(id) || null,
                name: lineNameById.get(id) || id,
                color: resolveRailColorForTheme(lineColorById.get(id) || null) || null
            };
        },
        onSelectCompany: (companyName, meta) => {
            const source = meta?.source;
            if (isMultiSelectModeEnabled() && String(source || '').startsWith('panel-')) return;
            if (source === 'panel-hover' && !isHoverPreviewEnabled()) return;
            const name = String(companyName ?? '').trim();
            if (!name) return;

            const stationLineIds = Array.isArray(meta?.stationLineIds) ? meta.stationLineIds.map(String).filter(Boolean) : [];
            const subset = stationLineIds.filter((id) => String(lineCompanyById.get(String(id)) || '') === name);
            const nextIds = (subset.length ? subset : stationLineIds).map(String).filter(Boolean);

            selectedCompany = null;
            selectedLineId = null;
            selectedStationLineIds = nextIds.length ? new Set(nextIds) : null;
            selectedStationId = null;
            selectedServiceMode = 'all';
            isolateStationsToSelectedLine = false;
            setStationLabelMode('auto');
            applySelectionEffects();

            const fitMode = source === 'panel-hover' ? 'preview' : 'commit';
            if (meta?.skipFit !== true) {
                fitToCurrentSelection(`company:${name}`, fitMode);
            }
        },
        onSelectLine: (lineId, meta) => {
            const source = meta?.source;
            if (isMultiSelectModeEnabled() && String(source || '').startsWith('panel-')) return;
            if (source === 'panel-hover' && !isHoverPreviewEnabled()) return;
            const id = String(lineId ?? '').trim();
            if (!id) return;

            if (isMenuThroughLineId(id)) {
                previewMenuThroughLine({ lineId: id, source: source === 'panel-hover' ? 'hover' : 'click' });
                return;
            }

            const resolved = resolveLineSelectionForApp(id);
            const mainLineId = String(resolved?.mainLineId ?? id);
            const merged = Array.isArray(resolved?.mergedLineIds)
                ? resolved.mergedLineIds.map(String).filter(Boolean)
                : [mainLineId];

            if (source === 'panel-hover') {
                selectedLineId = mainLineId;
                selectedCompany = null;
                selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
                selectedStationId = null;
                selectedServiceMode = 'all';
                isolateStationsToSelectedLine = false;
                setStationLabelMode('auto');
                applySelectionEffects();
                if (meta?.skipFit !== true) {
                    fitToCurrentSelection(`line:${mainLineId}`, 'preview');
                }
                return;
            }


            selectedLineId = mainLineId;
            selectedCompany = null;
            selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
            selectedStationId = null;
            selectedServiceMode = 'all';
            setStationLabelMode('all');
            isolateStationsToSelectedLine = meta?.isolateStations === true;

            if (menu && typeof menu.markActive === 'function') {
                const el = menu.wrapper?.querySelector(`.RW-line-content[data-line-id="${cssEscape(selectedLineId)}"]`);
                if (el) menu.markActive(el);
            }

            applySelectionEffects();
            if (meta?.skipFit !== true) {
                fitToCurrentSelection(`line:${mainLineId}`, 'commit');
            }
        },
        onRestoreStationLines: (lineIds, meta) => {
            selectedLineId = null;
            selectedCompany = null;
            isolateStationsToSelectedLine = false;
            selectedServiceMode = 'all';

            if (Array.isArray(lineIds) && lineIds.length) {
                selectedStationLineIds = new Set(lineIds.map(String).filter(Boolean));
            }
            selectedStationId = meta?.stationId ? String(meta.stationId).trim() : selectedStationId;

            setStationLabelMode('auto');
            applySelectionEffects();
        },
        onTripPreview: (payload) => {
            previewTripPath(payload);
        },
        onTripClear: () => {
            if (!isMultiSelectModeEnabled()) {
                clearTripPathPreview();
            }
            try {
                tripCurrentStationPopup?.remove?.();
            } catch {
                // ignore
            }
            tripCurrentStationPopup = null;
            clearTripDetailStationIndicator();
        },
        onTripDetailStationIndicator: ({ stationId }) => {
            showTripDetailStationIndicatorById(stationId);
        },
        onTripDetailStationIndicatorClear: () => {
            clearTripDetailStationIndicator();
        },
        onDirPreviewEnter: (payload) => {
            if (isMultiSelectModeEnabled()) return;
            previewDirHeader(payload);
        },
        onDirPreviewLeave: () => {
            clearDirHeaderPreview();
        }
    });

    const setFixedPopupStationLabelBelow = (stationId) => {
        fixedPopupStationId = stationId != null ? String(stationId) : null;

        if (!Array.isArray(stationLabels) || !stationLabels.length) return;


        for (const label of stationLabels) {
            label.labelPosition = null;
            label.labelBelowPadPx = null;
            const dy = Number.isFinite(label.labelDyPx) ? label.labelDyPx : 0;
            label.el.style.translate = `0 -${dy}px`;
        }

        if (!fixedPopupStationId) {
            if (collisionController) collisionController.scheduleUpdate();
            return;
        }

        const pinned = stationLabels.find((x) => x && String(x.stationId) === fixedPopupStationId);
        if (!pinned) {
            if (collisionController) collisionController.scheduleUpdate();
            return;
        }


        const pad = pinned.priority > 1 ? 6 : 4;
        pinned.labelPosition = 'below';
        pinned.labelBelowPadPx = pad;
        pinned.el.style.translate = `0 calc(100% + ${pad}px)`;

        if (collisionController) collisionController.scheduleUpdate();
    };

    let popupPreviewSnapshot = null;
    let popupPreviewWasApplied = false;

    const hideStationPopupForMenuInteraction = () => {
        if (!stationPopup || typeof stationPopup.getOpenMode !== 'function') return;
        const mode = stationPopup.getOpenMode();
        if (!mode) return;



        popupPreviewSnapshot = null;
        popupPreviewWasApplied = false;
        stationPopup.closePopup?.({ committed: true });
    };

    const snapshotSelectionState = () => ({
        selectedCompany,
        selectedLineId,
        selectedStationLineIds: selectedStationLineIds ? Array.from(selectedStationLineIds) : null,
        selectedStationId,
        selectedServiceMode,
        stationLabelMode,
        isolateStationsToSelectedLine
    });

    const restoreSelectionState = (snapshot) => {
        if (!snapshot) return;
        selectedCompany = snapshot.selectedCompany;
        selectedLineId = snapshot.selectedLineId;
        selectedStationLineIds = Array.isArray(snapshot.selectedStationLineIds)
            ? new Set(snapshot.selectedStationLineIds.map(String).filter(Boolean))
            : null;
        selectedStationId = snapshot?.selectedStationId ? String(snapshot.selectedStationId) : null;
        selectedServiceMode = snapshot.selectedServiceMode;
        setStationLabelMode(snapshot.stationLabelMode);
        isolateStationsToSelectedLine = snapshot.isolateStationsToSelectedLine === true;
        applySelectionEffects();
    };



    const searchMapActions = (() => {
        try {
            if (!window.TokyoRailSearchMapActions) window.TokyoRailSearchMapActions = {};
            return window.TokyoRailSearchMapActions;
        } catch {
            return null;
        }
    })();

    const normalizeLineIdArrayLike = (value) => {
        const raw = normalizeArrayLike(value);
        const out = [];
        const seen = new Set();
        for (const x of raw) {
            const id = String(x).trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
        return out;
    };

    // “通过该站台的线路”：优先 platform_line_id；没有则回退 serving_ids
    const getPlatformLineIdsFromStationProps = (props) => {
        const p = props || {};
        const platformIds = normalizeLineIdArrayLike(p.platform_line_id);
        if (platformIds.length) return platformIds;

        const servingIds = normalizeLineIdArrayLike(p.serving_ids);
        if (servingIds.length) return servingIds;
        return [];
    };

    const getPreferredPanelScrollLineIdFromStationProps = (props) => {
        const platformIds = getPlatformLineIdsFromStationProps(props || {});
        if (platformIds.length) return String(platformIds[0]);
        const servingIds = getServingLineIdsFromStationProps(props || {});
        return servingIds.length ? String(servingIds[0]) : '';
    };

    const openPanelForStationWithAutoScroll = async (props, options = {}) => {
        const p = props || {};
        const prevScrollTop = panel?.getScrollTop?.() || 0;
        await panel?.showForStationProps?.(p);
        const shouldAutoScroll = options?.autoScroll !== false;
        if (!shouldAutoScroll) {
            panel?.setScrollTop?.(0, { behavior: 'auto' });
            return;
        }
        panel?.setScrollTop?.(prevScrollTop, { behavior: 'auto' });
        const lineId = getPreferredPanelScrollLineIdFromStationProps(p);
        if (lineId) panel?.scrollToLineId?.(lineId, { behavior: 'smooth', block: 'start' });
    };

    const showRouteMapFloatingPanelForLine = (lineId) => {
        const id = String(lineId || '').trim();
        if (!id) return;
        const lineName = String(lineNameById.get(id) || id).trim() || id;
        try {
            window.dispatchEvent(new CustomEvent('__TokyoRailShowRouteMapPanel', {
                detail: {
                    lineId: id,
                    lineName,
                    placement: 'panel'
                }
            }));
        } catch {
            // ignore
        }
    };

    const selectPlatformLinesForStation = (props) => {
        const ids = getPlatformLineIdsFromStationProps(props);
        if (!ids.length) return;

        searchFeature?.selectStationLines?.({
            stationId: String(props?.id ?? '').trim() || null,
            lineIds: ids
        });
        isolateStationsToSelectedLine = false;
    };

    const fitToPointAsBounds = (coordinates, { maxZoom } = {}) => {
        if (!isAdaptiveViewportEnabled()) return;
        if (!Array.isArray(coordinates) || coordinates.length < 2) return;
        const lng = Number(coordinates[0]);
        const lat = Number(coordinates[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;


        const dLng = 0.006;
        const dLat = 0.004;
        const bounds = [
            [lng - dLng, lat - dLat],
            [lng + dLng, lat + dLat]
        ];

        const opts = {
            padding: 60,
            duration: 300,
            easing: (t) => t,
            essential: true
        };
        if (Number.isFinite(maxZoom)) opts.maxZoom = maxZoom;
        try {
            mapEngine.fitBounds(bounds, opts);
        } catch {
            // ignore
        }
    };

    const findStationLabelItemById = (stationId) => {
        const id = String(stationId ?? '').trim();
        if (!id) return null;
        if (!Array.isArray(stationLabels) || !stationLabels.length) return null;
        return (
            stationLabels.find((x) => x && String(x.stationId) === id) ||
            stationLabels.find((x) => x && String(x.props?.id ?? '') === id) ||
            null
        );
    };

    const searchFeature = createSearchFeature({
        store: appStore,
        resolveLineSelection: resolveLineSelectionForApp
    });

    if (searchMapActions) {
        searchMapActions.isReady = false;
        searchMapActions.snapshotSelectionState = snapshotSelectionState;
        searchMapActions.restoreSelectionState = restoreSelectionState;


        searchMapActions.previewTripPath = (payload, options = {}) => {
            const interaction = String(payload?.__previewInteraction || payload?.previewInteraction || '').trim() || '';
            const inferredFitMode = interaction === 'click'
                ? 'commit'
                : (interaction === 'hover' ? 'preview' : 'none');
            const fitMode = String(options?.fitMode || payload?.fitMode || inferredFitMode).trim() || 'none';
            const nextPayload = {
                ...(payload || {}),
                __previewSource: 'journey',
                fitMode
            };
            if (options?.clearBefore === true) {
                if (!isMultiSelectModeEnabled()) {
                    clearTripPathPreview({ source: 'journey' });
                }
            }
            previewTripPath(nextPayload);
        };
        searchMapActions.clearTripPathPreview = () => {
            clearTripPathPreview({ source: 'journey' });
        };
        searchMapActions.showJourneyPickPin = async (payload = {}) => {
            await showJourneyPickPin(payload || {});
        };
        searchMapActions.clearJourneyPickPin = (type) => {
            clearJourneyPickPin(type);
        };
        searchMapActions.clearTripPathPreviewBySource = (source) => {
            const s = String(source || '').trim();
            if (!s) return;
            clearTripPathPreview({ source: s });
        };
        searchMapActions.updateReachableStopsOverlay = async (payload = {}) => {
            await refreshReachableStopsOverlay(payload || {}, { fitBounds: true });
        };
        searchMapActions.clearReachableStopsOverlay = () => {
            clearReachableStopsOverlay();
        };



        searchMapActions.clearStationSelection = () => {
            appStore.dispatch(selectionSelectStationLines({
                selectedCompany,
                selectedLineId,
                selectedStationLineIds: null,
                selectedStationId: null,
                selectedServiceMode
            }));
        };

        searchMapActions.previewLine = (lineId) => {
            const id = String(lineId ?? '').trim();
            if (!id) return;
            hideStationPopupForMenuInteraction();

            const payload = searchFeature.previewLine(id);
            if (!payload?.selectedLineId) return;
            isolateStationsToSelectedLine = false;
            setStationLabelMode('auto');
            fitToCurrentSelection(`line:${payload.selectedLineId}`, 'preview');
        };

        searchMapActions.commitLine = (lineId) => {
            const id = String(lineId ?? '').trim();
            if (!id) return;
            hideStationPopupForMenuInteraction();

            const resolved = resolveLineSelectionForApp(id);

            const mainLineId = String(resolved?.mainLineId ?? id);
            const merged = Array.isArray(resolved?.mergedLineIds)
                ? resolved.mergedLineIds.map(String).filter(Boolean)
                : [mainLineId];

            if (isMultiSelectModeEnabled()) {
                toggleBaseMultiSelection(`line:${mainLineId}`, merged, 'line');
                if (getBaseMultiSelectedLineIds().size) setStationLabelMode('all');
                else setStationLabelMode('auto');
                applySelectionEffects();
                showRouteMapFloatingPanelForLine(id);
                return;
            }

            const payload = searchFeature.commitLine(id);
            const nextLineId = payload?.selectedLineId || mainLineId;
            isolateStationsToSelectedLine = false;
            setStationLabelMode('all');

            if (menu && typeof menu.markActive === 'function') {
                const el = menu.wrapper?.querySelector(`.RW-line-content[data-line-id="${cssEscape(nextLineId)}"]`);
                if (el) menu.markActive(el);
            }

            fitToCurrentSelection(`line:${nextLineId}`, 'commit');

            showRouteMapFloatingPanelForLine(id);
        };

        searchMapActions.previewCompany = (companyName) => {
            const name = String(companyName ?? '').trim();
            if (!name) return;
            hideStationPopupForMenuInteraction();
            const payload = searchFeature.previewCompany(name);
            if (!payload?.selectedCompany) return;
            isolateStationsToSelectedLine = false;
            setStationLabelMode('auto');
            fitToCurrentSelection(`company:${name}`, 'preview');
        };

        searchMapActions.commitCompany = (companyName) => {
            const name = String(companyName ?? '').trim();
            if (!name) return;
            hideStationPopupForMenuInteraction();
            const payload = searchFeature.commitCompany(name);
            if (!payload?.selectedCompany) return;
            isolateStationsToSelectedLine = false;
            setStationLabelMode('auto');

            if (menu && typeof menu.markActive === 'function') {
                const companyEls = menu.wrapper?.querySelectorAll?.('.RW-company-content') || [];
                for (const el of companyEls) {
                    const n = el?.querySelector?.('.RW-company-name')?.textContent?.trim();
                    if (n === name) {
                        menu.markActive(el);
                        break;
                    }
                }
            }

            fitToCurrentSelection(`company:${name}`, 'commit');
        };


        const openStationForStationId = (stationId, meta = {}) => {
            const item = findStationLabelItemById(stationId);
            if (!item) return null;

            const props = item.props || {};
            const coords = item.coordinates;
            const pt = meta?.pointerType ? String(meta.pointerType) : 'mouse';

            selectPlatformLinesForStation(props);
            fitToPointAsBounds(coords, { maxZoom: meta?.maxZoom });
            return { props, coords };
        };

        searchMapActions.previewStation = (stationId, meta) => {
            openStationForStationId(stationId, meta || {});
        };

        searchMapActions.commitStation = (stationId, meta) => {
            const opened = openStationForStationId(stationId, meta || {});
            openPanelForStationWithAutoScroll(opened?.props || {});

            // 预加载该站点关联线路的时刻表
            try {
                const ids = getServingLineIdsFromStationProps(opened?.props || {});
                timetableCache?.preloadRecursiveByLineIds?.(ids);
            } catch {
                // ignore
            }
        };


        searchMapActions.closeStationPopup = ({ committed } = {}) => {
            stationPopup?.closePopup?.({ committed: committed !== false });
            setFixedPopupStationLabelBelow(null);
        };
    }

    function bindClickBlankToRestore() {

        map.on('click', (e) => {
            if (!touchTapGuard.allowTap(e?.originalEvent)) return;


            if (isInFullscreenMode()) return;

            const layers = [];
            if (map.getLayer('lines-layer')) layers.push('lines-layer');
            if (map.getLayer('stations-layer')) layers.push('stations-layer');


            const hits = layers.length ? mapEngine.queryRenderedFeatures(e.point, { layers }) : [];
            if (hits.length) return;

            // 点击空白处：隐藏右侧 panel
            panel?.hide?.();
            if (!isMultiSelectModeEnabled()) {
                clearTripPathPreview();
            }


            if (!selectedCompany && !selectedLineId && !(selectedStationLineIds && selectedStationLineIds.size)) return;

            clearSelectionsAndRestore();
        });
    }

    function bindClickLineToSelect() {
        if (!map.getLayer('lines-layer')) return;


        map.on('click', 'lines-layer', (e) => {
            if (!touchTapGuard.allowTap(e?.originalEvent)) return;


            // 需求：点击站点（或站点与线路一起被点到）时，不应触发线路选中
            if (map.getLayer('stations-layer')) {
                const stationHits = mapEngine.queryRenderedFeatures(e.point, { layers: ['stations-layer'] }) || [];
                if (stationHits.length) return;
            }

            const f = e?.features?.[0];
            const lineId = f?.properties?.id ?? f?.id;
            if (lineId == null) return;

            const rawLineId = String(lineId);
            const resolved = resolveLineSelectionForApp(rawLineId);

            const mainLineId = String(resolved?.mainLineId ?? rawLineId);
            const merged = Array.isArray(resolved?.mergedLineIds)
                ? resolved.mergedLineIds.map(String).filter(Boolean)
                : [mainLineId];

            if (isMultiSelectModeEnabled()) {
                toggleBaseMultiSelection(`line:${mainLineId}`, merged, 'line');
                if (getBaseMultiSelectedLineIds().size) setStationLabelMode('all');
                else setStationLabelMode('auto');
                applySelectionEffects();
                return;
            }


            selectedLineId = mainLineId;
            selectedCompany = null;
            selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
            selectedStationId = null;
            selectedServiceMode = 'all';
            setStationLabelMode('all');

            // 同步菜单高亮（如果菜单已挂载且能找到对应项）
            if (menu && typeof menu.markActive === 'function') {
                const el = menu.wrapper?.querySelector(`.RW-line-content[data-line-id="${cssEscape(selectedLineId)}"]`);
                if (el) menu.markActive(el);
            }

            applySelectionEffects();
            // 点击高亮：不限制放大倍率
            fitToCurrentSelection(`line:${selectedLineId}`, 'commit');

            showRouteMapFloatingPanelForLine(rawLineId);
        });

        // 鼠标样式提示可点击（可选但很轻量）
        map.on('mouseenter', 'lines-layer', () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'lines-layer', () => {
            map.getCanvas().style.cursor = '';
        });
    }

    function bindClickStationToHighlightServingLines() {
        if (!map.getLayer('stations-layer')) return;


        map.on('click', 'stations-layer', async (e) => {
            if (!touchTapGuard.allowTap(e?.originalEvent)) return;
            if (isJourneyMapPickActive()) return;

            const f = e?.features?.[0];
            const props = f?.properties || {};
            const hadStationSelection = !!String(selectedStationId || '').trim();
            if (!isMultiSelectModeEnabled()) {
                selectServingLinesForStation(props);
            }

            // 打开右侧界面 A
            await openPanelForStationWithAutoScroll(props, { autoScroll: hadStationSelection });

            // 预加载该站点关联线路的时刻表
            try {
                const ids = getServingLineIdsFromStationProps(props);
                timetableCache?.preloadRecursiveByLineIds?.(ids);
            } catch {
                // ignore
            }
        });
    }

    function mountStationLabelToggle(hostEl) {
        const container = document.createElement('div');
        container.className = 'settings-item settings-item-station-label';

        const text = document.createElement('span');
        text.className = 'settings-item-title';
        text.textContent = '站名显示';

        const seg = document.createElement('div');
        seg.className = 'settings-item-control settings-seg';

        const btnOff = document.createElement('button');
        btnOff.type = 'button';
        btnOff.textContent = '隐藏';

        const btnAuto = document.createElement('button');
        btnAuto.type = 'button';
        btnAuto.textContent = '自动';

        const btnAll = document.createElement('button');
        btnAll.type = 'button';
        btnAll.textContent = '全显';

        seg.appendChild(btnOff);
        seg.appendChild(btnAuto);
        seg.appendChild(btnAll);

        container.appendChild(text);
        container.appendChild(seg);
        const host = (hostEl && hostEl.appendChild) ? hostEl : document.body;
        if (host.firstChild) host.insertBefore(container, host.firstChild);
        else host.appendChild(container);

        const setActive = () => {
            btnOff.classList.toggle('is-active', stationLabelMode === 'off');
            btnAuto.classList.toggle('is-active', stationLabelMode === 'auto');
            btnAll.classList.toggle('is-active', stationLabelMode === 'all');
        };

        const setMode = (mode) => {
            const next = mode === 'off' || mode === 'all' ? mode : 'auto';
            if (stationLabelMode === next) return false;
            stationLabelMode = next;
            setActive();
            return true;
        };


        setStationLabelMode = (mode, options = {}) => {
            if (options?.fromUser !== true) return false;
            return setMode(mode);
        };

        btnOff.addEventListener('click', () => {
            if (setStationLabelMode('off', { fromUser: true })) {
                if (collisionController) collisionController.scheduleUpdate();
            }
        });
        btnAuto.addEventListener('click', () => {
            if (setStationLabelMode('auto', { fromUser: true })) {
                if (collisionController) collisionController.scheduleUpdate();
            }
        });
        btnAll.addEventListener('click', () => {
            if (setStationLabelMode('all', { fromUser: true })) {
                if (collisionController) collisionController.scheduleUpdate();
            }
        });


        setActive();
    }

    function mountAppearanceToggle(hostEl) {
        const storageKey = APPEARANCE_STORAGE_KEY;
        const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

        const container = document.createElement('div');
        container.className = 'settings-item settings-item-appearance';

        const text = document.createElement('span');
        text.className = 'settings-item-title';
        text.textContent = '外观';

        const seg = document.createElement('div');
        seg.className = 'settings-item-control settings-seg';

        const btnLight = document.createElement('button');
        btnLight.type = 'button';
        btnLight.textContent = '浅色';

        const btnDark = document.createElement('button');
        btnDark.type = 'button';
        btnDark.textContent = '深色';

        const btnSystem = document.createElement('button');
        btnSystem.type = 'button';
        btnSystem.textContent = '跟随系统';

        seg.appendChild(btnLight);
        seg.appendChild(btnDark);
        seg.appendChild(btnSystem);

        container.appendChild(text);
        container.appendChild(seg);

        const host = (hostEl && hostEl.appendChild) ? hostEl : document.body;
        if (host.firstChild) host.insertBefore(container, host.firstChild);
        else host.appendChild(container);

        const resolveTheme = (mode) => {
            if (mode === 'dark') return 'dark';
            if (mode === 'light') return 'light';
            return media?.matches ? 'dark' : 'light';
        };

        const setThemeMode = (mode) => {
            const m = (mode === 'light' || mode === 'dark' || mode === 'system') ? mode : 'system';
            btnLight.classList.toggle('is-active', m === 'light');
            btnDark.classList.toggle('is-active', m === 'dark');
            btnSystem.classList.toggle('is-active', m === 'system');
            const resolved = resolveTheme(m);
            document.documentElement.setAttribute('data-theme', resolved);
            applyBasemapTheme(resolved);
            applyStationThemePaintToMapLayers();
            applySelectionEffects();
            try {
                window.localStorage.setItem(storageKey, m);
            } catch {
                // ignore
            }
        };

        btnLight.addEventListener('click', () => setThemeMode('light'));
        btnDark.addEventListener('click', () => setThemeMode('dark'));
        btnSystem.addEventListener('click', () => setThemeMode('system'));

        const onSystemThemeChange = () => {
            let currentMode = 'system';
            try {
                const saved = String(window.localStorage.getItem(storageKey) || 'system').trim();
                if (saved === 'light' || saved === 'dark' || saved === 'system') currentMode = saved;
            } catch {
                // ignore
            }
            if (currentMode === 'system') setThemeMode('system');
        };

        if (media && typeof media.addEventListener === 'function') {
            media.addEventListener('change', onSystemThemeChange);
        } else if (media && typeof media.addListener === 'function') {
            media.addListener(onSystemThemeChange);
        }

        let initial = 'system';
        try {
            const saved = String(window.localStorage.getItem(storageKey) || 'system').trim();
            if (saved === 'light' || saved === 'dark' || saved === 'system') initial = saved;
        } catch {
            // ignore
        }
        setThemeMode(initial);
    }

    function mountBasemapToggle(hostEl) {
        const storageKey = BASEMAP_STORAGE_KEY;

        const container = document.createElement('div');
        container.className = 'settings-item settings-item-basemap';

        const text = document.createElement('span');
        text.className = 'settings-item-title';
        text.textContent = '地图底图';

        const seg = document.createElement('div');
        seg.className = 'settings-item-control settings-seg';

        const btnCarto = document.createElement('button');
        btnCarto.type = 'button';
        btnCarto.textContent = 'Carto';

        const btnOst = document.createElement('button');
        btnOst.type = 'button';
        btnOst.textContent = 'OST';

        const btnTransparent = document.createElement('button');
        btnTransparent.type = 'button';
        btnTransparent.textContent = '透明';

        seg.appendChild(btnCarto);
        seg.appendChild(btnOst);
        seg.appendChild(btnTransparent);
        container.appendChild(text);
        container.appendChild(seg);

        const host = (hostEl && hostEl.appendChild) ? hostEl : document.body;
        if (host.firstChild) host.insertBefore(container, host.firstChild);
        else host.appendChild(container);

        const setMode = (mode) => {
            const m = (mode === 'carto' || mode === 'ost' || mode === 'transparent') ? mode : 'carto';
            btnCarto.classList.toggle('is-active', m === 'carto');
            btnOst.classList.toggle('is-active', m === 'ost');
            btnTransparent.classList.toggle('is-active', m === 'transparent');
            setBasemapMode(m);
            try {
                window.localStorage.setItem(storageKey, m);
            } catch {
                // ignore
            }
        };

        btnCarto.addEventListener('click', () => setMode('carto'));
        btnOst.addEventListener('click', () => setMode('ost'));
        btnTransparent.addEventListener('click', () => setMode('transparent'));

        let initial = 'carto';
        try {
            const saved = String(window.localStorage.getItem(storageKey) || 'carto').trim().toLowerCase();
            if (saved === 'carto' || saved === 'ost' || saved === 'transparent') initial = saved;
        } catch {
            // ignore
        }
        setMode(initial);
    }

    function mountAutoUpdateToggle(hostEl) {
        const electronApi = window?.TokyoRailElectron;
        const hasElectronApi = !!(
            electronApi
            && typeof electronApi.setAutoUpdateCheckEnabled === 'function'
            && typeof electronApi.checkForUpdatesNow === 'function'
        );
        if (!hasElectronApi) return;

        const storageKey = AUTO_UPDATE_CHECK_STORAGE_KEY;

        const container = document.createElement('div');
        container.className = 'settings-item settings-item-auto-update';

        const left = document.createElement('button');
        left.type = 'button';
        left.className = 'settings-update-check-now';
        left.setAttribute('aria-label', '立即检查更新');
        left.title = '立即检查更新';

        const checkNowIcon = document.createElement('img');
        checkNowIcon.className = 'settings-update-check-now-icon';
        checkNowIcon.alt = '';
        setImageElementFromCache(checkNowIcon, getIconCandidates('clockwise.svg'), {
            cacheKey: 'icon:clockwise.svg',
            fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('clockwise.svg'), { cacheKey: 'icon:clockwise.svg' })
        }).catch(() => null);
        left.appendChild(checkNowIcon);

        const text = document.createElement('span');
        text.className = 'settings-item-title';
        text.textContent = '自动检查更新';

        const controls = document.createElement('div');
        controls.className = 'settings-auto-update-controls';

        const seg = document.createElement('div');
        seg.className = 'settings-item-control settings-seg';

        const btnOn = document.createElement('button');
        btnOn.type = 'button';
        btnOn.textContent = '开启';

        const btnOff = document.createElement('button');
        btnOff.type = 'button';
        btnOff.textContent = '关闭';

        seg.appendChild(btnOn);
        seg.appendChild(btnOff);
    controls.appendChild(left);
    controls.appendChild(seg);
    container.appendChild(text);
    container.appendChild(controls);

        const host = (hostEl && hostEl.appendChild) ? hostEl : document.body;
        const appearanceRow = host.querySelector('.settings-item.settings-item-appearance');
        if (appearanceRow && appearanceRow.parentElement === host && appearanceRow.nextSibling) {
            host.insertBefore(container, appearanceRow.nextSibling);
        } else if (appearanceRow && appearanceRow.parentElement === host) {
            host.appendChild(container);
        } else if (host.firstChild) {
            host.insertBefore(container, host.firstChild);
        } else {
            host.appendChild(container);
        }

        const setEnabled = (enabled) => {
            const isEnabled = enabled !== false;
            btnOn.classList.toggle('is-active', isEnabled);
            btnOff.classList.toggle('is-active', !isEnabled);
            try {
                window.localStorage.setItem(storageKey, isEnabled ? '1' : '0');
            } catch {
                // ignore
            }
            electronApi.setAutoUpdateCheckEnabled(isEnabled).catch(() => null);
        };

        btnOn.addEventListener('click', () => setEnabled(true));
        btnOff.addEventListener('click', () => setEnabled(false));

        left.addEventListener('click', async () => {
            if (left.disabled) return;
            left.disabled = true;
            try {
                await electronApi.checkForUpdatesNow();
            } catch {
                // ignore
            } finally {
                left.disabled = false;
            }
        });

        setEnabled(readAutoUpdateCheckEnabled());
    }

    function mountTimetableViewToggle(hostEl) {
        const storageKey = TIMETABLE_VIEW_STORAGE_KEY;

        const container = document.createElement('div');
        container.className = 'settings-item settings-item-timetable-view';

        const text = document.createElement('span');
        text.className = 'settings-item-title';
        text.textContent = '班次视图';

        const seg = document.createElement('div');
        seg.className = 'settings-item-control settings-view-seg';

        const btnList = document.createElement('button');
        btnList.type = 'button';
        btnList.className = 'settings-view-btn settings-view-btn-list';
        btnList.setAttribute('aria-label', '列表视图');

        const listIcon = document.createElement('img');
        listIcon.className = 'settings-view-btn-icon';
        listIcon.alt = '';
        setImageElementFromCache(listIcon, getIconCandidates('list.svg'), {
            cacheKey: 'icon:list.svg',
            fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('list.svg'), { cacheKey: 'icon:list.svg' })
        }).catch(() => null);
        btnList.appendChild(listIcon);

        const btnGrid = document.createElement('button');
        btnGrid.type = 'button';
        btnGrid.className = 'settings-view-btn settings-view-btn-grid';
        btnGrid.setAttribute('aria-label', '网格视图');

        const gridIcon = document.createElement('img');
        gridIcon.className = 'settings-view-btn-icon';
        gridIcon.alt = '';
        setImageElementFromCache(gridIcon, getIconCandidates('grid.svg'), {
            cacheKey: 'icon:grid.svg',
            fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('grid.svg'), { cacheKey: 'icon:grid.svg' })
        }).catch(() => null);
        btnGrid.appendChild(gridIcon);

        seg.appendChild(btnList);
        seg.appendChild(btnGrid);
        container.appendChild(text);
        container.appendChild(seg);

        const host = (hostEl && hostEl.appendChild) ? hostEl : document.body;
        if (host.firstChild) host.insertBefore(container, host.firstChild);
        else host.appendChild(container);

        const setMode = (mode) => {
            const m = mode === 'grid' ? 'grid' : 'list';
            btnList.classList.toggle('is-active', m === 'list');
            btnGrid.classList.toggle('is-active', m === 'grid');
            panel?.setTimetableViewMode?.(m);
            try {
                window.localStorage.setItem(storageKey, m);
            } catch {
                // ignore
            }
        };

        btnList.addEventListener('click', () => setMode('list'));
        btnGrid.addEventListener('click', () => setMode('grid'));

        setMode(readTimetableViewMode());
    }

    function mountHoverPreviewToggle(hostEl) {
        const storageKey = HOVER_PREVIEW_STORAGE_KEY;

        const container = document.createElement('div');
        container.className = 'settings-item settings-item-hover-preview';

        const text = document.createElement('span');
        text.className = 'settings-item-title';
        text.textContent = '自动预览';

        const seg = document.createElement('div');
        seg.className = 'settings-item-control settings-seg';

        const btnOn = document.createElement('button');
        btnOn.type = 'button';
        btnOn.textContent = '开启';

        const btnOff = document.createElement('button');
        btnOff.type = 'button';
        btnOff.textContent = '关闭';

        seg.appendChild(btnOn);
        seg.appendChild(btnOff);
        container.appendChild(text);
        container.appendChild(seg);

        const host = (hostEl && hostEl.appendChild) ? hostEl : document.body;
        if (host.firstChild) host.insertBefore(container, host.firstChild);
        else host.appendChild(container);

        const setEnabled = (enabled, { persistStorage = true } = {}) => {
            const on = enabled !== false;
            btnOn.classList.toggle('is-active', on);
            btnOff.classList.toggle('is-active', !on);
            applyHoverPreviewEnabled(on);
            if (persistStorage) {
                try {
                    window.localStorage.setItem(storageKey, on ? '1' : '0');
                } catch {
                    // ignore
                }
            }
        };

        const setDisabled = (disabled) => {
            const on = disabled === true;
            container.classList.toggle('is-disabled', on);
            btnOn.disabled = on;
            btnOff.disabled = on;
            btnOn.setAttribute('aria-disabled', on ? 'true' : 'false');
            btnOff.setAttribute('aria-disabled', on ? 'true' : 'false');
        };

        btnOn.addEventListener('click', () => setEnabled(true));
        btnOff.addEventListener('click', () => setEnabled(false));

        setEnabled(readHoverPreviewEnabled());

        hoverPreviewToggleController = {
            setEnabled,
            setDisabled
        };
    }

    function mountAdaptiveViewportToggle(hostEl) {
        const storageKey = ADAPTIVE_VIEWPORT_STORAGE_KEY;

        const container = document.createElement('div');
        container.className = 'settings-item settings-item-adaptive-viewport';

        const text = document.createElement('span');
        text.className = 'settings-item-title';
        text.textContent = '自适应视野';

        const seg = document.createElement('div');
        seg.className = 'settings-item-control settings-seg';

        const btnOn = document.createElement('button');
        btnOn.type = 'button';
        btnOn.textContent = '开启';

        const btnOff = document.createElement('button');
        btnOff.type = 'button';
        btnOff.textContent = '关闭';

        seg.appendChild(btnOn);
        seg.appendChild(btnOff);
        container.appendChild(text);
        container.appendChild(seg);

        const host = (hostEl && hostEl.appendChild) ? hostEl : document.body;
        if (host.firstChild) host.insertBefore(container, host.firstChild);
        else host.appendChild(container);

        const setEnabled = (enabled, { persistStorage = true } = {}) => {
            const on = enabled !== false;
            btnOn.classList.toggle('is-active', on);
            btnOff.classList.toggle('is-active', !on);
            applyAdaptiveViewportEnabled(on);
            if (persistStorage) {
                try {
                    window.localStorage.setItem(storageKey, on ? '1' : '0');
                } catch {
                    // ignore
                }
            }
        };

        btnOn.addEventListener('click', () => setEnabled(true));
        btnOff.addEventListener('click', () => setEnabled(false));

        setEnabled(readAdaptiveViewportEnabled());
    }

    function mountStationOffsetToggle(hostEl) {
        const storageKey = STATION_OFFSET_MODE_STORAGE_KEY;

        const container = document.createElement('div');
        container.className = 'settings-item settings-item-station-offset';

        const text = document.createElement('span');
        text.className = 'settings-item-title';
        text.textContent = '站点位置纠正';

        const seg = document.createElement('div');
        seg.className = 'settings-item-control settings-seg';

        const btnDynamic = document.createElement('button');
        btnDynamic.type = 'button';
        btnDynamic.textContent = '动态';

        const btnPerformance = document.createElement('button');
        btnPerformance.type = 'button';
        btnPerformance.textContent = '性能';

        seg.appendChild(btnDynamic);
        seg.appendChild(btnPerformance);
        container.appendChild(text);
        container.appendChild(seg);

        const host = (hostEl && hostEl.appendChild) ? hostEl : document.body;
        if (host.firstChild) host.insertBefore(container, host.firstChild);
        else host.appendChild(container);

        const setMode = (mode) => {
            const next = applyStationOffsetMode(mode);
            btnDynamic.classList.toggle('is-active', next === 'dynamic');
            btnPerformance.classList.toggle('is-active', next === 'performance');
        };

        btnDynamic.addEventListener('click', () => setMode('dynamic'));
        btnPerformance.addEventListener('click', () => setMode('performance'));

        setMode(readStationOffsetMode());
    }

    mountAppearanceToggle(settingsMenuContentEl);
    mountAutoUpdateToggle(settingsMenuContentEl);
    mountBasemapToggle(settingsMenuContentEl);
    mountTimetableViewToggle(settingsMenuContentEl);
    mountAdaptiveViewportToggle(settingsMenuContentEl);
    mountStationOffsetToggle(settingsMenuContentEl);
    mountHoverPreviewToggle(settingsMenuContentEl);
    mountStationLabelToggle(settingsMenuContentEl);

    {
        const initialMultiSelect = multiSelectModeEnabled;
        multiSelectModeEnabled = false;
        applyMultiSelectModeState(initialMultiSelect);

        window.addEventListener(MULTI_SELECT_EVENT, (evt) => {
            const enabled = evt?.detail?.enabled === true;
            applyMultiSelectModeState(enabled);
        });

        window.addEventListener(MULTI_SELECT_SHOW_ICONS_EVENT, () => {
            applySelectionEffects();
        });
    }

    let generatedLinesData = null;
    let generatedStationsData = null;
    let generatedStationOffsetAlgorithmContext = null;

    try {
        const {
            linesGeoJSON,
            linesGeoJSONByZoom,
            lineRoutingCoordsById,
            stationsGeoJSON,
            stationOffsetAlgorithmContext,
            diagnostics
        } = await loadRailGeoDataFromDataFolder();
        generatedLinesData = linesGeoJSON;
        generatedStationsData = stationsGeoJSON;
        generatedStationOffsetAlgorithmContext = stationOffsetAlgorithmContext;
        transferStationIdsByStationId = await loadTransferStationIdMap();

        /*
        try {
            const items = Array.isArray(diagnostics?.largeGaps) ? diagnostics.largeGaps : [];
            if (items.length) {

                const byId = new Map();
                for (const it of items) {
                    const id = String(it?.id || '').trim();
                    if (!id) continue;
                    const prev = byId.get(id);
                    if (!prev || (it?.maxJumpMeters ?? 0) > (prev?.maxJumpMeters ?? 0)) byId.set(id, it);
                }
                const sorted = Array.from(byId.values()).sort((a, b) => (b?.maxJumpMeters ?? 0) - (a?.maxJumpMeters ?? 0));
                console.warn('[数据检查] 存在“大跨度跳跃”的线路（按最大相邻点跳跃降序）：');
                for (const it of sorted) {
                    const km = ((it?.maxJumpMeters ?? 0) / 1000).toFixed(2);
                    console.warn(`- ${it?.titleZhHans || it?.id} (${it?.id}): ${km}km`);
                }
            } else {
                console.log('[数据检查] 未发现“大跨度跳跃”的线路');
            }
        } catch {
            // ignore
        }
        */
        const linesData = (linesGeoJSONByZoom && linesGeoJSONByZoom[18]) || linesGeoJSON;


        // - 未出现在 order 文件中的线路排到末尾（保持稳定性）
        try {
            const orderList = await getCachedJson('./data/railways-order.json');
            if (Array.isArray(orderList) && Array.isArray(linesData?.features)) {
                const normOrderMap = new Map();
                for (let i = 0; i < orderList.length; i++) {
                    const obj = orderList[i];
                    if (!obj || typeof obj !== 'object') continue;
                    const keys = Object.keys(obj);
                    if (!keys.length) continue;
                    const raw = String(keys[0] ?? '').trim().toLowerCase();
                    if (!raw) continue;
                    const parts = raw.split('-');
                    if (parts[0] && parts[0].startsWith('jr') && parts[0].length > 2) {
                        parts[0] = 'jr-' + parts[0].slice(2);
                    }
                    const norm = parts.join('.');
                    if (!normOrderMap.has(norm)) normOrderMap.set(norm, i);
                }

                const getFeatId = (f) => {
                    try {
                        const maybe = (f && (f.properties && (f.properties.id || f.properties._id))) || (f && f.id) || '';
                        return String(maybe ?? '').toLowerCase();
                    } catch {
                        return '';
                    }
                };

                linesData.features.sort((a, b) => {
                    const aid = getFeatId(a);
                    const bid = getFeatId(b);
                    const ai = normOrderMap.has(aid) ? normOrderMap.get(aid) : Number.MAX_SAFE_INTEGER;
                    const bi = normOrderMap.has(bid) ? normOrderMap.get(bid) : Number.MAX_SAFE_INTEGER;
                    if (ai === bi) return 0;
                    // 我们希望 order 文件中靠前的线路最终出现在 GeoJSON features 的后面（绘制时覆盖在上面），

                    if (ai === Number.MAX_SAFE_INTEGER) return -1;
                    if (bi === Number.MAX_SAFE_INTEGER) return 1;
                    return bi - ai;
                });
            }
        } catch {
            // ignore
        }
        try {
            const fs = Array.isArray(linesData?.features) ? linesData.features : [];
            for (const f of fs) {
                if (!f?.properties || typeof f.properties !== 'object') continue;
                const color = f.properties.color;
                if (typeof color !== 'string' || !color.trim()) continue;
                f.properties._dark_color = resolveRailColorForTheme(color.trim(), { isDarkThemeActive: true });
            }
        } catch {
            // ignore
        }
        addLinesLayer(map, linesData);




        const allLineFeatures = Array.isArray(linesData?.features)
            ? linesData.features.filter((f) => f?.properties?.type === 'line')
            : [];
        const lineFeatures = allLineFeatures.filter((f) => Number(f?.properties?.hidden_by_opacity_zero) !== 1);
        const lineChainsById = new Map();


        stationCoordById = new Map();
        stationCoordByIdBase = new Map();
        stationServingCountById = new Map();
        try {
            const stationFeaturesForPreview = Array.isArray(generatedStationsData?.features)
                ? generatedStationsData.features
                : [];
            for (const sf of stationFeaturesForPreview) {
                if (sf?.geometry?.type !== 'Point') continue;
                const p = sf?.properties || {};
                const sid = String(p?.id ?? sf?.id ?? '').trim();
                const c = sf?.geometry?.coordinates;
                if (!sid || !Array.isArray(c) || c.length < 2) continue;
                const lng = Number(c[0]);
                const lat = Number(c[1]);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
                stationCoordById.set(sid, [lng, lat]);
                stationCoordByIdBase.set(sid, [lng, lat]);

                const servingIds = normalizeArrayLike(p?.serving_ids);
                const servingCount = (servingIds.length || 1);
                stationServingCountById.set(sid, servingCount);
            }

            // Fallback: also load raw coordinates from stations.json for off-map branch endpoints
            const rawStations = await getCachedJson('./data/stations.json');
            if (Array.isArray(rawStations)) {
                for (const s of rawStations) {
                    const sid = String(s?.id || '').trim();
                    const c = Array.isArray(s?.coord) ? s.coord : null;
                    if (sid && c && c.length >= 2 && !stationCoordById.has(sid)) {
                        const lng = Number(c[0]);
                        const lat = Number(c[1]);
                        if (Number.isFinite(lng) && Number.isFinite(lat)) {
                            stationCoordById.set(sid, [lng, lat]);
                            stationCoordByIdBase.set(sid, [lng, lat]);
                        }
                    }
                }
            }
        } catch {
            // ignore
        }

        const ensureTripPreviewLayers = () => {
            tripPreviewRenderer.ensureLayers();
        };

        const resetTripPreviewLayers = () => {
            tripPreviewRenderer.reset();
        };

        const distMeters = (a, b) => {
            if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return Number.POSITIVE_INFINITY;
            const lng1 = Number(a[0]);
            const lat1 = Number(a[1]);
            const lng2 = Number(b[0]);
            const lat2 = Number(b[1]);
            if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
            const dLat = (lat2 - lat1) * (Math.PI / 180);
            const dLng = (lng2 - lng1) * (Math.PI / 180);
            const mLat = ((lat1 + lat2) / 2) * (Math.PI / 180);
            const x = dLng * Math.cos(mLat);
            const y = dLat;
            return Math.sqrt(x * x + y * y) * 6371000;
        };

        const appendChainsFromGeometry = (lineIdRaw, geom) => {
            const lineId = String(lineIdRaw ?? '').trim();
            if (!lineId || !geom) return;
            if (!lineChainsById.has(lineId)) lineChainsById.set(lineId, []);
            const bucket = lineChainsById.get(lineId);

            if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
                const chain = geom.coordinates.filter((pt) => Array.isArray(pt) && pt.length >= 2);
                if (chain.length >= 2) bucket.push(chain);
                return;
            }

            if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
                for (const line of geom.coordinates) {
                    if (!Array.isArray(line)) continue;
                    const chain = line.filter((pt) => Array.isArray(pt) && pt.length >= 2);
                    if (chain.length >= 2) bucket.push(chain);
                }
            }
        };


        if (lineRoutingCoordsById && typeof lineRoutingCoordsById === 'object') {
            for (const [rawId, coords] of Object.entries(lineRoutingCoordsById)) {
                const lineId = String(rawId || '').trim();
                if (!lineId || !Array.isArray(coords) || coords.length < 2) continue;
                const chain = coords.filter((pt) => Array.isArray(pt) && pt.length >= 2);
                if (chain.length < 2) continue;
                lineChainsById.set(lineId, [chain]);
            }
        }

        for (const f of allLineFeatures) {
            const lineId = f?.properties?.id ?? f?.id;
            if (!lineId) continue;

            if (lineChainsById.has(String(lineId))) continue;
            appendChainsFromGeometry(String(lineId), f?.geometry);
        }

        const getLineChains = (lineIdRaw) => {
            const lineId = String(lineIdRaw ?? '').trim();
            if (!lineId) return [];
            const chains = lineChainsById.get(lineId);
            return Array.isArray(chains) ? chains : [];
        };

        const findNearestIndex = (chain, coord) => {
            if (!Array.isArray(chain) || !Array.isArray(coord)) return { index: -1, dist: Number.POSITIVE_INFINITY };
            let bestIdx = -1;
            let bestDist = Number.POSITIVE_INFINITY;
            for (let i = 0; i < chain.length; i += 1) {
                const d = distMeters(chain[i], coord);
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = i;
                }
            }
            return { index: bestIdx, dist: bestDist };
        };

        const projectToLocalXY = (lngLat, refLatDeg) => {
            const lng = Number(lngLat?.[0]);
            const lat = Number(lngLat?.[1]);
            const k = Math.cos((Number(refLatDeg) || 0) * Math.PI / 180);
            return {
                x: lng * k,
                y: lat
            };
        };

        const closestPointOnSegmentLL = (p, a, b) => {
            const refLat = (Number(p?.[1]) + Number(a?.[1]) + Number(b?.[1])) / 3;
            const pp = projectToLocalXY(p, refLat);
            const pa = projectToLocalXY(a, refLat);
            const pb = projectToLocalXY(b, refLat);

            const vx = pb.x - pa.x;
            const vy = pb.y - pa.y;
            const wx = pp.x - pa.x;
            const wy = pp.y - pa.y;

            const vv = vx * vx + vy * vy;
            let t = vv > 0 ? (wx * vx + wy * vy) / vv : 0;
            if (!Number.isFinite(t)) t = 0;
            if (t < 0) t = 0;
            if (t > 1) t = 1;

            const out = [
                Number(a?.[0]) + (Number(b?.[0]) - Number(a?.[0])) * t,
                Number(a?.[1]) + (Number(b?.[1]) - Number(a?.[1])) * t
            ];
            return { point: out, t };
        };

        const closestPointOnChain = (chain, coord) => {
            if (!Array.isArray(chain) || chain.length < 2 || !Array.isArray(coord)) {
                return { point: null, segIndex: -1, t: 0, dist: Number.POSITIVE_INFINITY };
            }

            let best = { point: null, segIndex: -1, t: 0, dist: Number.POSITIVE_INFINITY };
            for (let i = 0; i < chain.length - 1; i += 1) {
                const a = chain[i];
                const b = chain[i + 1];
                if (!Array.isArray(a) || !Array.isArray(b)) continue;
                const proj = closestPointOnSegmentLL(coord, a, b);
                const d = distMeters(coord, proj.point);
                if (d < best.dist) {
                    best = { point: proj.point, segIndex: i, t: proj.t, dist: d };
                }
            }
            return best;
        };

        const buildProjectedSubchain = (chain, fromProj, toProj) => {
            if (!Array.isArray(chain) || chain.length < 2 || !fromProj?.point || !toProj?.point) return null;

            const i = Number(fromProj.segIndex);
            const j = Number(toProj.segIndex);
            if (!Number.isFinite(i) || !Number.isFinite(j) || i < 0 || j < 0) return null;

            const out = [fromProj.point];
            if (i === j) {
                out.push(toProj.point);
                return out;
            }

            if (i < j) {
                for (let k = i + 1; k <= j; k += 1) out.push(chain[k]);
                out.push(toProj.point);
                return out;
            }

            // reverse direction
            for (let k = i; k >= j + 1; k -= 1) out.push(chain[k]);
            out.push(toProj.point);
            return out;
        };

        const extractLineSegment = (lineId, fromCoord, toCoord, options = {}) => {
            const chains = getLineChains(lineId);
            let best = null;
            const preferLoopShortest = options?.preferLoopShortest === true;

            const measurePolylineMeters = (coords) => {
                if (!Array.isArray(coords) || coords.length < 2) return Number.POSITIVE_INFINITY;
                let sum = 0;
                for (let i = 0; i < coords.length - 1; i += 1) {
                    const d = distMeters(coords[i], coords[i + 1]);
                    if (!Number.isFinite(d)) return Number.POSITIVE_INFINITY;
                    sum += d;
                }
                return sum;
            };

            for (const chain of chains) {
                if (!Array.isArray(chain) || chain.length < 2) continue;

                if (preferLoopShortest) {
                    const loopSeg = extractShortestLoopSegmentByIndex(chain, fromCoord, toCoord, {
                        maxSnapMeters: 250,
                        direction: options?.direction
                    });
                    if (Array.isArray(loopSeg) && loopSeg.length >= 2) {
                        const score = measurePolylineMeters(loopSeg);
                        if (!best || score < best.score) {
                            best = { score, seg: loopSeg, endDist: 0 };
                        }
                        continue;
                    }
                }

                const a = closestPointOnChain(chain, fromCoord);
                const b = closestPointOnChain(chain, toCoord);
                if (a.segIndex < 0 || b.segIndex < 0 || !a.point || !b.point) continue;

                const score = a.dist + b.dist;
                if (!best || score < best.score) {
                    const seg = buildProjectedSubchain(chain, a, b);
                    best = { score, seg, endDist: Math.max(a.dist, b.dist) };
                }
            }

            if (!best || !Array.isArray(best.seg) || best.seg.length < 2) return null;
            // 近似阈值：端点距离线路过远则认为不可靠，走直连
            if (best.endDist > 250) return null;
            return best.seg;
        };

        const nearestBridgeBetweenLines = (lineIdA, lineIdB, anchorA = null, anchorB = null) => {
            const chainsA = getLineChains(lineIdA);
            const chainsB = getLineChains(lineIdB);
            if (!chainsA.length || !chainsB.length) return null;

            const hasAnchorA = Array.isArray(anchorA) && anchorA.length >= 2;
            const hasAnchorB = Array.isArray(anchorB) && anchorB.length >= 2;

            const MAX_SAMPLES = 900;
            const sampleIndices = (len) => {
                if (!Number.isFinite(len) || len <= 0) return [];
                const step = Math.max(1, Math.ceil(len / MAX_SAMPLES));
                const out = [];
                for (let i = 0; i < len; i += step) out.push(i);
                if (out[out.length - 1] !== len - 1) out.push(len - 1);
                return out;
            };

            let best = null;
            let bestLocal = null;
            for (const ca of chainsA) {
                if (!Array.isArray(ca) || ca.length < 2) continue;
                const ia = sampleIndices(ca.length);
                for (const ibase of ia) {
                    const pa = ca[ibase];
                    for (const cb of chainsB) {
                        if (!Array.isArray(cb) || cb.length < 2) continue;
                        const pbProj = closestPointOnChain(cb, pa);
                        if (!pbProj?.point || pbProj.segIndex < 0) continue;
                        const paProj = closestPointOnChain(ca, pbProj.point);
                        if (!paProj?.point || paProj.segIndex < 0) continue;
                        const d = distMeters(paProj.point, pbProj.point);
                        if (!best || d < best.dist) {
                            best = { a: paProj.point, b: pbProj.point, dist: d };
                        }

                        if (hasAnchorA || hasAnchorB) {
                            const da = hasAnchorA ? distMeters(anchorA, paProj.point) : 0;
                            const db = hasAnchorB ? distMeters(anchorB, pbProj.point) : 0;
                            const isLocalA = !hasAnchorA || da <= 12000;
                            const isLocalB = !hasAnchorB || db <= 12000;

                            if (isLocalA && isLocalB) {
                                const score = d + (da * 0.15) + (db * 0.15);
                                if (!bestLocal || score < bestLocal.score) {
                                    bestLocal = { a: paProj.point, b: pbProj.point, dist: d, score };
                                }
                            }
                        }
                    }
                }
            }
            return bestLocal || best;
        };

        const isLineTerminalStation = (lineIdRaw, stationIdRaw) => {
            const lineId = String(lineIdRaw ?? '').trim();
            const stationId = String(stationIdRaw ?? '').trim();
            if (!lineId || !stationId) return false;
            const s = stationCoordByIdBase.get(stationId) || stationCoordById.get(stationId);
            if (!s) return false;
            const chains = getLineChains(lineId);
            if (!chains.length) return false;

            let minEndDist = Number.POSITIVE_INFINITY;
            for (const chain of chains) {
                if (!Array.isArray(chain) || chain.length < 2) continue;
                const d1 = distMeters(s, chain[0]);
                const d2 = distMeters(s, chain[chain.length - 1]);
                minEndDist = Math.min(minEndDist, d1, d2);
            }
            return minEndDist <= 1200;
        };

        const stationAKey = (stationIdRaw) => {
            const s = String(stationIdRaw ?? '').trim();
            if (!s) return '';
            const parts = s.split('.').map((x) => x.trim()).filter(Boolean);
            return parts.length ? parts[parts.length - 1] : '';
        };

        const isSamePhysicalStation = (aRaw, bRaw) => {
            const a = String(aRaw ?? '').trim();
            const b = String(bRaw ?? '').trim();
            if (!a || !b) return false;
            if (a === b) return true;
            const ak = stationAKey(a);
            const bk = stationAKey(b);
            if (ak && bk && ak === bk) return true;
            const ca = stationCoordByIdBase.get(a) || stationCoordById.get(a);
            const cb = stationCoordByIdBase.get(b) || stationCoordById.get(b);
            if (!ca || !cb) return false;
            return distMeters(ca, cb) <= 350;
        };

        const previewFitWithSidePanels = (bbox) => {
            if (!isAdaptiveViewportEnabled()) return;
            if (!bbox) return;
            const bounds = [
                [bbox.minLng, bbox.minLat],
                [bbox.maxLng, bbox.maxLat]
            ];

            const base = 50;
            let rightReserve = base;
            let leftReserve = base;

            try {
                const menuRect = menu?.wrapper?.getBoundingClientRect?.();
                if (menuRect && Number.isFinite(menuRect.width)) {
                    leftReserve = Math.max(leftReserve, Math.ceil(Math.max(menuRect.right || 0, menuRect.width) + base));
                }
            } catch {
                // ignore
            }

            try {
                const panelRect = panel?.el?.getBoundingClientRect?.();
                if (panelRect && Number.isFinite(panelRect.width)) {
                    rightReserve = Math.max(rightReserve, Math.ceil(panelRect.width + base));
                }
            } catch {
                // ignore
            }

            try {
                const tripEl = document.querySelector('[data-panel-trip-detail]');
                const hidden = tripEl?.classList?.contains('is-hidden');
                const rect = tripEl?.getBoundingClientRect?.();
                if (!hidden && rect && Number.isFinite(rect.width) && rect.width > 0) {
                    rightReserve = Math.max(rightReserve, Math.ceil(rightReserve + rect.width));
                }
            } catch {
                // ignore
            }

            try {
                mapEngine.fitBounds(bounds, {
                    padding: { top: base, bottom: base, left: leftReserve, right: rightReserve },
                    duration: 280,
                    easing: (t) => t,
                    essential: true
                });
            } catch {
                // ignore
            }
        };

        const bboxFromStationIds = (stationIds) => {
            const list = Array.isArray(stationIds) ? stationIds : [];
            let bbox = null;
            for (const stationId of list) {
                const sid = String(stationId || '').trim();
                if (!sid) continue;
                const coord = stationCoordByIdBase.get(sid) || stationCoordById.get(sid);
                if (!Array.isArray(coord) || coord.length < 2) continue;
                const lng = Number(coord[0]);
                const lat = Number(coord[1]);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
                bbox = extendBBox(bbox, lng, lat);
            }
            return bbox;
        };

        const buildTripPreviewFeatures = (payload) => {
            const outLineFeatures = [];
            const outStopFeatures = [];
            const coordsForBbox = [];
            const stopIds = new Set();
            const throughServiceHighlightColors = new Set(
                Object.values(THROUGH_SERVICE_CONFIGS_OBJECT)
                    .map(info => String(info.color || '').trim().toLowerCase())
                    .filter(Boolean)
            );
            const isThroughServiceHighlightColor = (color) => {
                const normalized = String(color || '').trim().toLowerCase();
                return !!normalized && throughServiceHighlightColors.has(normalized);
            };

            const debugLoop = (() => {
                try {
                    return globalThis?.__TokyoRailDebugLoopSlice === true;
                } catch {
                    return false;
                }
            })();

            const allSegments = Array.isArray(payload?.segments) ? payload.segments : [];
            const ntSeg = allSegments.find((s) => String(s?.kind) === 'nt') || null;
            const ntFirstStationId = (() => {
                const ids = Array.isArray(ntSeg?.stationIds) ? ntSeg.stationIds : [];
                return ids.length ? String(ids[0] || '').trim() : '';
            })();

            const forceIncludeNt = payload?.forceIncludeNt === true || payload?.__forceIncludeNt === true;
            let allowNt = true;
            if (!forceIncludeNt) {
                allowNt = !payload?.hasNt || isLineTerminalStation(payload?.mainLineId, payload?.mainTerminalStationId);
                if (!allowNt && payload?.hasNt) {
                    allowNt = isSamePhysicalStation(payload?.mainTerminalStationId, ntFirstStationId);
                }

                // 非端点直通也允许：只要主段末站与 nt 首站在局部几何上可连通（避免同班次在不同入口显示不一致）
                if (!allowNt && payload?.hasNt && ntSeg) {
                    const mainTerminalId = String(payload?.mainTerminalStationId || '').trim();
                    const mainTerminalCoord = stationCoordByIdBase.get(mainTerminalId) || stationCoordById.get(mainTerminalId);
                    const ntFirstCoord = stationCoordByIdBase.get(ntFirstStationId) || stationCoordById.get(ntFirstStationId);
                    const ntLineId = String(ntSeg?.lineId || '').trim();

                    if (mainTerminalCoord && ntFirstCoord && ntLineId) {
                        const directDist = distMeters(mainTerminalCoord, ntFirstCoord);
                        if (directDist <= 8000) {
                            allowNt = true;
                        } else {
                            const bridge = nearestBridgeBetweenLines(
                                payload?.mainLineId,
                                ntLineId,
                                mainTerminalCoord,
                                ntFirstCoord
                            );
                            allowNt = !!bridge && Number.isFinite(bridge.dist) && bridge.dist <= 3000;
                        }
                    }
                }
            }

            const segments = allowNt ? allSegments : allSegments.filter((s) => String(s?.kind) !== 'nt');
            const payloadTypeColor = String(payload?.typeColor || '').trim();
            const resolveSegColor = (seg, fallbackLineId) => {
                const segTypeColorRaw = String(seg?.typeColor || payloadTypeColor).trim();
                if (isThroughServiceHighlightColor(segTypeColorRaw)) {
                    return resolveRailColorForTheme(segTypeColorRaw) || segTypeColorRaw;
                }
                return resolveRailColorForTheme(lineColorById.get(String(fallbackLineId || '')) || '') || '';
            };

            const pushLineFeature = (coords, lineId, role = 'line', colorOverride = '') => {
                if (!Array.isArray(coords) || coords.length < 2) return;
                for (const c of coords) {
                    if (Array.isArray(c) && c.length >= 2) coordsForBbox.push(c);
                }
                const rawColor = String(colorOverride || '').trim()
                    || resolveRailColorForTheme(lineColorById.get(String(lineId || '')) || '#0a84ff')
                    || '#0a84ff';
                outLineFeatures.push({
                    type: 'Feature',
                    properties: {
                        role,
                        lineId: String(lineId || ''),
                        color: rawColor
                    },
                    geometry: { type: 'LineString', coordinates: coords }
                });
            };

            for (let i = 0; i < segments.length; i += 1) {
                const seg = segments[i] || {};
                const lineId = String(seg.lineId || '').trim();
                const segColor = resolveSegColor(seg, lineId);
                const isLoopDirectionSeg = isLoopDirection(seg?.d);
                const stationIds = Array.isArray(seg.stationIds) ? seg.stationIds.map((x) => String(x).trim()).filter(Boolean) : [];

                if (debugLoop && (seg?.d || isLoopDirectionSeg)) {
                    try {
                        // eslint-disable-next-line no-console
                        console.debug('[trip-preview seg]', {
                            lineId,
                            d: seg?.d,
                            preferLoopShortest: isLoopDirectionSeg,
                            stationCount: stationIds.length,
                            first: stationIds[0] || null,
                            last: stationIds[stationIds.length - 1] || null
                        });
                    } catch {
                        // ignore
                    }
                }

                for (const sid of stationIds) stopIds.add(sid);

                for (let j = 0; j < stationIds.length - 1; j += 1) {
                    const fromId = stationIds[j];
                    const toId = stationIds[j + 1];
                    const from = stationCoordByIdBase.get(fromId) || stationCoordById.get(fromId);
                    const to = stationCoordByIdBase.get(toId) || stationCoordById.get(toId);
                    if (!from || !to) continue;

                    const clipped = extractLineSegment(lineId, from, to, {
                        preferLoopShortest: isLoopDirectionSeg,
                        direction: seg?.d
                    });
                    if (clipped && clipped.length >= 2) pushLineFeature(clipped, lineId, 'line', segColor);
                    else pushLineFeature([from, to], lineId, 'connector', segColor);
                }

                if (i > 0) {
                    const prev = segments[i - 1] || {};
                    const prevIds = Array.isArray(prev.stationIds) ? prev.stationIds : [];
                    const prevLast = String(prevIds.length ? prevIds[prevIds.length - 1] : '').trim();
                    const currFirst = String(stationIds.length ? stationIds[0] : '').trim();
                    if (prevLast && currFirst && !isSamePhysicalStation(prevLast, currFirst)) {
                        const a = stationCoordByIdBase.get(prevLast) || stationCoordById.get(prevLast);
                        const b = stationCoordByIdBase.get(currFirst) || stationCoordById.get(currFirst);
                        if (a && b) {
                            const bridge = nearestBridgeBetweenLines(prev.lineId, lineId, a, b);
                            const canUseBridge = bridge && Number.isFinite(bridge.dist) && bridge.dist <= 3000;
                            if (canUseBridge) {
                                const segA = extractLineSegment(prev.lineId, a, bridge.a);
                                const segB = extractLineSegment(lineId, bridge.b, b);
                                const prevSegColor = resolveSegColor(prev, String(prev?.lineId || '').trim()) || segColor;
                                if (segA && segA.length >= 2) pushLineFeature(segA, prev.lineId, 'line', prevSegColor);
                                if (bridge.dist > 25) pushLineFeature([bridge.a, bridge.b], lineId || prev.lineId, 'connector', segColor || prevSegColor);
                                if (segB && segB.length >= 2) pushLineFeature(segB, lineId, 'line', segColor);

                                if ((!segA || segA.length < 2) && (!segB || segB.length < 2)) {
                                    const fallbackDist = distMeters(a, b);
                                    if (Number.isFinite(fallbackDist) && fallbackDist <= 3000) {
                                        pushLineFeature([a, b], lineId || prev.lineId, 'connector', segColor);
                                    }
                                }
                            } else {
                                // Prevent long-range false connectors across unrelated branch segments.
                                const directDist = distMeters(a, b);
                                if (Number.isFinite(directDist) && directDist <= 3000) {
                                    pushLineFeature([a, b], lineId || prev.lineId, 'connector', segColor);
                                }
                            }
                        }
                    }
                }
            }

            for (const sid of stopIds) {
                const c = stationCoordByIdBase.get(sid) || stationCoordById.get(sid);
                if (!c) continue;
                outStopFeatures.push({
                    type: 'Feature',
                    properties: {
                        id: sid,
                        serving_count: Number(stationServingCountById.get(sid) || 1)
                    },
                    geometry: { type: 'Point', coordinates: c }
                });
            }

            let bbox = null;
            for (const c of coordsForBbox) {
                const lng = Number(c?.[0]);
                const lat = Number(c?.[1]);
                bbox = extendBBox(bbox, lng, lat);
            }

            const firstSeg = segments.find((s) => Array.isArray(s?.stationIds) && s.stationIds.length) || null;
            const lastSeg = (() => {
                for (let i = segments.length - 1; i >= 0; i -= 1) {
                    const s = segments[i];
                    if (Array.isArray(s?.stationIds) && s.stationIds.length) return s;
                }
                return null;
            })();

            const startStationId = firstSeg ? String(firstSeg.stationIds[0] || '').trim() : '';
            const endStationId = lastSeg
                ? String(lastSeg.stationIds[lastSeg.stationIds.length - 1] || '').trim()
                : '';

            return {
                lineFc: { type: 'FeatureCollection', features: outLineFeatures },
                stopFc: { type: 'FeatureCollection', features: outStopFeatures },
                lineIds: new Set(segments.map((s) => String(s?.lineId || '').trim()).filter(Boolean)),
                stopIds,
                startStationId,
                endStationId,
                bbox
            };
        };

        const clearTripEndpointPopups = () => {
            try {
                tripPreviewOriginPopup?.remove?.();
            } catch {
                // ignore
            }
            try {
                tripPreviewTerminalPopup?.remove?.();
            } catch {
                // ignore
            }
            for (const popup of tripPreviewOriginPopups) {
                try { popup?.remove?.(); } catch { /* ignore */ }
            }
            for (const popup of tripPreviewTerminalPopups) {
                try { popup?.remove?.(); } catch { /* ignore */ }
            }
            tripPreviewOriginPopup = null;
            tripPreviewTerminalPopup = null;
            tripPreviewOriginPopups = [];
            tripPreviewTerminalPopups = [];
        };

        const createTripEndpointPopup = ({ stationId, text, color, yOffset = 8 }) => {
            const sid = String(stationId || '').trim();
            if (!sid) return null;
            const coord = stationCoordByIdBase.get(sid) || stationCoordById.get(sid);
            if (!Array.isArray(coord) || coord.length < 2) return null;

            const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
            const role = String(text || '').includes('始发') ? 'origin' : (String(text || '').includes('终点') ? 'terminal' : 'normal');
            const resolvedColor = role === 'origin'
                ? (isDarkTheme ? '#59e37d' : (color || '#1A9B2D'))
                : role === 'terminal'
                    ? (isDarkTheme ? '#ff6b6b' : (color || '#D32F2F'))
                    : String(color || '#111');

            const el = document.createElement('div');
            el.style.fontSize = '12px';
            el.style.fontWeight = '700';
            el.style.lineHeight = '1.2';
            el.style.color = resolvedColor;
            if (role === 'origin') el.classList.add('trip-endpoint-origin');
            if (role === 'terminal') el.classList.add('trip-endpoint-terminal');
            el.textContent = String(text || '');

            return new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false,
                closeOnMove: false,
                anchor: 'top',
                offset: [0, yOffset],
                className: 'trip-endpoint-popup'
            })
                .setLngLat(coord)
                .setDOMContent(el)
                .addTo(map);
        };

        const updateTripEndpointPopups = (startStationId, endStationId) => {
            clearTripEndpointPopups();

            const startId = String(startStationId || '').trim();
            const endId = String(endStationId || '').trim();
            if (!startId && !endId) return;

            tripPreviewOriginPopup = createTripEndpointPopup({
                stationId: startId,
                text: '始发站',
                color: '#1A9B2D',
                yOffset: 8
            });

            tripPreviewTerminalPopup = createTripEndpointPopup({
                stationId: endId,
                text: '终点站',
                color: '#D32F2F',
                yOffset: startId && endId && startId === endId ? 30 : 8
            });

            tripPreviewOriginPopups = tripPreviewOriginPopup ? [tripPreviewOriginPopup] : [];
            tripPreviewTerminalPopups = tripPreviewTerminalPopup ? [tripPreviewTerminalPopup] : [];
        };

        const updateTripEndpointPopupsFromPayloadList = (payloadList, rootPayload = null) => {
            clearTripEndpointPopups();

            const list = Array.isArray(payloadList) ? payloadList : [];
            if (!list.length) return;

            const originIds = new Set();
            const terminalIds = new Set();

            const explicitOriginIds = Array.isArray(rootPayload?.originStationIds)
                ? rootPayload.originStationIds.map((x) => String(x || '').trim()).filter(Boolean)
                : [];
            const explicitTerminalIds = Array.isArray(rootPayload?.terminalStationIds)
                ? rootPayload.terminalStationIds.map((x) => String(x || '').trim()).filter(Boolean)
                : [];

            if (explicitOriginIds.length || explicitTerminalIds.length) {
                for (const sid of explicitOriginIds) originIds.add(sid);
                for (const sid of explicitTerminalIds) terminalIds.add(sid);
            }

            if (!originIds.size && !terminalIds.size) {
                for (const payload of list) {
                    const segments = Array.isArray(payload?.segments) ? payload.segments : [];
                    if (!segments.length) continue;

                    const firstSeg = segments.find((s) => Array.isArray(s?.stationIds) && s.stationIds.length) || null;
                    const lastSeg = (() => {
                        for (let i = segments.length - 1; i >= 0; i -= 1) {
                            const seg = segments[i];
                            if (Array.isArray(seg?.stationIds) && seg.stationIds.length) return seg;
                        }
                        return null;
                    })();

                    const startId = String(firstSeg?.stationIds?.[0] || '').trim();
                    const endIds = Array.isArray(lastSeg?.stationIds) ? lastSeg.stationIds : [];
                    const endId = String(endIds.length ? endIds[endIds.length - 1] : '').trim();

                    if (startId) originIds.add(startId);
                    if (endId) terminalIds.add(endId);
                }
            }

            const sharedIds = new Set();
            for (const sid of originIds) {
                if (terminalIds.has(sid)) sharedIds.add(sid);
            }

            tripPreviewOriginPopups = Array.from(originIds)
                .map((sid) => createTripEndpointPopup({
                    stationId: sid,
                    text: '始发站',
                    color: '#1A9B2D',
                    yOffset: sharedIds.has(sid) ? 30 : 8
                }))
                .filter(Boolean);

            tripPreviewTerminalPopups = Array.from(terminalIds)
                .map((sid) => createTripEndpointPopup({
                    stationId: sid,
                    text: '终点站',
                    color: '#D32F2F',
                    yOffset: 8
                }))
                .filter(Boolean);

            tripPreviewOriginPopup = tripPreviewOriginPopups[0] || null;
            tripPreviewTerminalPopup = tripPreviewTerminalPopups[0] || null;
        };

        const clearDirEndpointPopups = () => {
            for (const popup of dirPreviewOriginPopups) {
                try { popup?.remove?.(); } catch { /* ignore */ }
            }
            for (const popup of dirPreviewTerminalPopups) {
                try { popup?.remove?.(); } catch { /* ignore */ }
            }
            dirPreviewOriginPopups = [];
            dirPreviewTerminalPopups = [];
        };

        const createDirEndpointPopup = ({ stationId, text, color, yOffset = 10 }) => {
            const sid = String(stationId || '').trim();
            if (!sid) return null;
            const coord = stationCoordByIdBase.get(sid) || stationCoordById.get(sid);
            if (!Array.isArray(coord) || coord.length < 2) return null;

            const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
            const role = String(text || '').includes('始发') ? 'origin' : (String(text || '').includes('终点') ? 'terminal' : 'normal');
            const resolvedColor = role === 'origin'
                ? (isDarkTheme ? '#59e37d' : (color || '#1A9B2D'))
                : role === 'terminal'
                    ? (isDarkTheme ? '#ff6b6b' : (color || '#D32F2F'))
                    : String(color || '#111');

            const el = document.createElement('div');
            el.style.fontSize = '12px';
            el.style.fontWeight = '700';
            el.style.lineHeight = '1.2';
            el.style.color = resolvedColor;
            if (role === 'origin') el.classList.add('trip-endpoint-origin');
            if (role === 'terminal') el.classList.add('trip-endpoint-terminal');
            el.textContent = String(text || '');

            return new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false,
                closeOnMove: false,
                anchor: 'top',
                offset: [0, yOffset],
                className: 'trip-endpoint-popup'
            })
                .setLngLat(coord)
                .setDOMContent(el)
                .addTo(map);
        };

        const toCoordKey = (coord) => {
            if (!Array.isArray(coord) || coord.length < 2) return '';
            const lng = Number(coord[0]);
            const lat = Number(coord[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return '';
            return `${lng.toFixed(6)},${lat.toFixed(6)}`;
        };

        const buildLineCoordsCanonicalKey = (coords) => {
            const arr = Array.isArray(coords) ? coords.map((c) => toCoordKey(c)).filter(Boolean) : [];
            if (arr.length < 2) return '';
            const fwd = arr.join('>');
            const rev = arr.slice().reverse().join('>');
            return fwd <= rev ? fwd : rev;
        };

        const buildLineFeatureDedupKey = (feature) => {
            const role = String(feature?.properties?.role || 'line');
            const lineId = String(feature?.properties?.lineId || '');
            const geom = feature?.geometry;
            if (!geom || geom.type !== 'LineString') return '';
            const pathKey = buildLineCoordsCanonicalKey(geom.coordinates);
            if (!pathKey) return '';
            return `${role}||${lineId}||${pathKey}`;
        };

        const buildTripPreviewSelectionKey = (payload) => {
            const source = String(payload?.previewSource || payload?.__previewSource || payload?.source || '').trim() || 'default';
            const explicitPreviewKey = String(payload?.previewKey || payload?.__previewKey || '').trim();
            if (explicitPreviewKey) {
                return `${source}||preview||${explicitPreviewKey}`;
            }

            const segmentList = Array.isArray(payload?.segments) ? payload.segments : [];
            const lineIdFromSegments = String(segmentList.find((seg) => String(seg?.lineId || '').trim())?.lineId || '').trim();
            const lineId = String(payload?.selectedLineId || payload?.mainLineId || lineIdFromSegments || '').trim();

            let tripKey = String(payload?.tripKey || '').trim();
            if (!tripKey) {
                const fromSegments = segmentList
                    .map((seg) => {
                        const lid = String(seg?.lineId || '').trim();
                        const ids = Array.isArray(seg?.stationIds)
                            ? seg.stationIds.map((x) => String(x || '').trim()).filter(Boolean)
                            : [];
                        if (!lid || ids.length < 2) return '';
                        return `${lid}:${ids.join('>')}`;
                    })
                    .filter(Boolean)
                    .join('||');

                const virtualTrips = Array.isArray(payload?.virtualTrips) ? payload.virtualTrips : [];
                const fromVirtualTrips = !fromSegments && virtualTrips.length
                    ? virtualTrips
                        .map((vt) => {
                            const segs = Array.isArray(vt?.segments) ? vt.segments : [];
                            return segs
                                .map((seg) => {
                                    const lid = String(seg?.lineId || '').trim();
                                    const ids = Array.isArray(seg?.stationIds)
                                        ? seg.stationIds.map((x) => String(x || '').trim()).filter(Boolean)
                                        : [];
                                    if (!lid || ids.length < 2) return '';
                                    return `${lid}:${ids.join('>')}`;
                                })
                                .filter(Boolean)
                                .join('||');
                        })
                        .filter(Boolean)
                        .join('~~~')
                    : '';

                tripKey = fromSegments || fromVirtualTrips;
            }

            if (!tripKey) return '';
            return `${source}||${lineId || 'unknown-line'}||${tripKey}`;
        };

        const resolveTripPreviewPayloadSource = (payload) => {
            return String(payload?.previewSource || payload?.__previewSource || payload?.source || '').trim() || '';
        };

        const buildMultiTripPreviewAggregate = () => {
            const lineFeatureByKey = new Map();
            const stopFeatureByStationId = new Map();
            const lineIds = new Set();
            const stopIds = new Set();
            let bbox = null;

            for (const entry of tripPreviewSelectionsByKey.values()) {
                if (entry?.hidden === true) continue;
                const built = entry?.built;
                const lineFeatures = Array.isArray(built?.lineFc?.features) ? built.lineFc.features : [];
                const stopFeatures = Array.isArray(built?.stopFc?.features) ? built.stopFc.features : [];

                for (const lf of lineFeatures) {
                    const key = buildLineFeatureDedupKey(lf);
                    if (!key || lineFeatureByKey.has(key)) continue;
                    lineFeatureByKey.set(key, lf);
                }

                for (const sf of stopFeatures) {
                    const sid = String(sf?.properties?.id || '').trim();
                    if (!sid) continue;
                    if (!stopFeatureByStationId.has(sid)) stopFeatureByStationId.set(sid, sf);
                }

                const ids = built?.lineIds instanceof Set ? built.lineIds : null;
                if (ids) {
                    for (const id of ids) {
                        const s = String(id || '').trim();
                        if (s) lineIds.add(s);
                    }
                }

                const sids = built?.stopIds instanceof Set ? built.stopIds : null;
                if (sids) {
                    for (const sid of sids) {
                        const s = String(sid || '').trim();
                        if (s) stopIds.add(s);
                    }
                }

                const b = built?.bbox;
                if (b && Number.isFinite(b.minLng) && Number.isFinite(b.maxLng) && Number.isFinite(b.minLat) && Number.isFinite(b.maxLat)) {
                    bbox = bbox
                        ? {
                            minLng: Math.min(bbox.minLng, b.minLng),
                            minLat: Math.min(bbox.minLat, b.minLat),
                            maxLng: Math.max(bbox.maxLng, b.maxLng),
                            maxLat: Math.max(bbox.maxLat, b.maxLat)
                        }
                        : { ...b };
                }
            }

            return {
                lineFc: { type: 'FeatureCollection', features: Array.from(lineFeatureByKey.values()) },
                stopFc: { type: 'FeatureCollection', features: Array.from(stopFeatureByStationId.values()) },
                lineIds,
                stopIds,
                bbox
            };
        };

        const buildTripPreviewAggregateFromPayloadList = (payloadList) => {
            const list = Array.isArray(payloadList) ? payloadList : [];
            const lineFeatureByKey = new Map();
            const stopFeatureByStationId = new Map();
            const lineIds = new Set();
            const stopIds = new Set();
            let bbox = null;
            let startStationId = '';
            let endStationId = '';

            for (const payload of list) {
                const built = buildTripPreviewFeatures(payload);
                const lineFeatures = Array.isArray(built?.lineFc?.features) ? built.lineFc.features : [];
                const stopFeatures = Array.isArray(built?.stopFc?.features) ? built.stopFc.features : [];

                if (!startStationId) startStationId = String(built?.startStationId || '').trim();
                if (String(built?.endStationId || '').trim()) endStationId = String(built?.endStationId || '').trim();

                for (const lf of lineFeatures) {
                    const key = buildLineFeatureDedupKey(lf);
                    if (!key || lineFeatureByKey.has(key)) continue;
                    lineFeatureByKey.set(key, lf);
                }

                for (const sf of stopFeatures) {
                    const sid = String(sf?.properties?.id || '').trim();
                    if (!sid) continue;
                    if (!stopFeatureByStationId.has(sid)) stopFeatureByStationId.set(sid, sf);
                }

                const ids = built?.lineIds instanceof Set ? built.lineIds : null;
                if (ids) {
                    for (const id of ids) {
                        const s = String(id || '').trim();
                        if (s) lineIds.add(s);
                    }
                }

                const sids = built?.stopIds instanceof Set ? built.stopIds : null;
                if (sids) {
                    for (const sid of sids) {
                        const s = String(sid || '').trim();
                        if (s) stopIds.add(s);
                    }
                }

                const b = built?.bbox;
                if (b && Number.isFinite(b.minLng) && Number.isFinite(b.maxLng) && Number.isFinite(b.minLat) && Number.isFinite(b.maxLat)) {
                    bbox = bbox
                        ? {
                            minLng: Math.min(bbox.minLng, b.minLng),
                            minLat: Math.min(bbox.minLat, b.minLat),
                            maxLng: Math.max(bbox.maxLng, b.maxLng),
                            maxLat: Math.max(bbox.maxLat, b.maxLat)
                        }
                        : { ...b };
                }
            }

            return {
                lineFc: { type: 'FeatureCollection', features: Array.from(lineFeatureByKey.values()) },
                stopFc: { type: 'FeatureCollection', features: Array.from(stopFeatureByStationId.values()) },
                lineIds,
                stopIds,
                startStationId,
                endStationId,
                bbox
            };
        };

        const buildEndpointStationIdSetFromPayloadList = (payloadList) => {
            const out = new Set();
            const list = Array.isArray(payloadList) ? payloadList : [];

            for (const payload of list) {
                const segments = Array.isArray(payload?.segments)
                    ? payload.segments
                    : [];
                if (!segments.length) continue;

                const firstSeg = segments.find((s) => Array.isArray(s?.stationIds) && s.stationIds.length) || null;
                const lastSeg = (() => {
                    for (let i = segments.length - 1; i >= 0; i -= 1) {
                        const seg = segments[i];
                        if (Array.isArray(seg?.stationIds) && seg.stationIds.length) return seg;
                    }
                    return null;
                })();

                const startId = String(firstSeg?.stationIds?.[0] || '').trim();
                const endIds = Array.isArray(lastSeg?.stationIds) ? lastSeg.stationIds : [];
                const endId = String(endIds.length ? endIds[endIds.length - 1] : '').trim();

                if (startId) out.add(startId);
                if (endId) out.add(endId);
            }

            return out;
        };

        const rebuildTripPreviewFromMultiSelections = (fitMode = 'none') => {
            const aggregate = buildMultiTripPreviewAggregate();
            const hasVisible = aggregate.lineIds instanceof Set && aggregate.lineIds.size > 0;
            const hasAnySelection = tripPreviewSelectionsByKey.size > 0;

            ensureTripPreviewLayers();
            try {
                tripPreviewRenderer.setData({ lineFc: aggregate.lineFc, stopFc: aggregate.stopFc });
            } catch {
                // ignore
            }

            clearTripEndpointPopups();

            tripPreviewActive = hasVisible;
            tripPreviewStationIds = hasVisible ? aggregate.stopIds : null;
            tripPreviewLineIds = hasVisible ? aggregate.lineIds : null;
            tripPreviewStationOverrideColor = '';
            syncStationOffsetForTripPreviewState();

            if (!hasVisible) {
                setStationLabelMode(getBaseMultiSelectedLineIds().size ? 'all' : 'auto');
                applySelectionEffects();
                collisionController?.scheduleUpdate?.();
                try {
                    window.dispatchEvent(new CustomEvent('__TokyoRailTripPreviewCleared', { detail: { ts: Date.now() } }));
                } catch {
                    // ignore
                }
                emitMultiSelectLayersUpdated();
                return;
            }

            const payloadForExport = hasAnySelection && tripPreviewSelectionsByKey.size === 1
                ? Array.from(tripPreviewSelectionsByKey.values())[0]?.payload
                : {
                    selectedLineId: 'multi',
                    tripKey: Array.from(tripPreviewSelectionsByKey.keys()).join(' + ')
                };

            try {
                window.dispatchEvent(new CustomEvent('__TokyoRailTripPreviewUpdated', {
                    detail: {
                        ts: Date.now(),
                        payload: payloadForExport,
                        built: aggregate
                    }
                }));
            } catch {
                // ignore
            }

            setStationLabelMode('all');
            applySelectionEffects();
            collisionController?.scheduleUpdate?.();
            if (fitMode !== 'none' && aggregate.bbox) {
                previewFitWithSidePanels(aggregate.bbox);
            }
            emitMultiSelectLayersUpdated();
        };

        clearDirHeaderPreview = () => {
            if (!dirPreviewActive) return;
            dirPreviewActive = false;
            dirPreviewLineIds = null;
            dirPreviewStationIds = null;
            clearDirEndpointPopups();
            applySelectionEffects();
            collisionController?.scheduleUpdate?.();
        };

        previewDirHeader = (payload) => {
            const lineId = String(payload?.lineId || '').trim();
            const fitMode = String(payload?.fitMode || 'preview').trim() || 'preview';
            if (!lineId) {
                clearDirHeaderPreview();
                return;
            }

            const originIds = Array.isArray(payload?.originStationIds)
                ? payload.originStationIds.map((x) => String(x).trim()).filter(Boolean)
                : [];
            const terminalIds = Array.isArray(payload?.terminalStationIds)
                ? payload.terminalStationIds.map((x) => String(x).trim()).filter(Boolean)
                : [];
            const currentIds = Array.isArray(payload?.currentStationIds)
                ? payload.currentStationIds.map((x) => String(x).trim()).filter(Boolean)
                : [];

            const stationIds = new Set([...originIds, ...terminalIds, ...currentIds]);
            dirPreviewActive = true;
            dirPreviewLineIds = new Set([lineId]);
            if (payload && Array.isArray(payload.sourceLineIds) && payload.sourceLineIds.length) {
                payload.sourceLineIds.forEach(id => dirPreviewLineIds.add(String(id)));
            }
            dirPreviewStationIds = stationIds;

            clearDirEndpointPopups();
            const roleMap = new Map();
            for (const sid of originIds) {
                if (!roleMap.has(sid)) roleMap.set(sid, new Set());
                roleMap.get(sid).add('origin');
            }
            for (const sid of terminalIds) {
                if (!roleMap.has(sid)) roleMap.set(sid, new Set());
                roleMap.get(sid).add('terminal');
            }

            for (const [sid, roles] of roleMap.entries()) {
                const hasOrigin = roles.has('origin');
                const hasTerminal = roles.has('terminal');
                if (hasOrigin) {
                    const popup = createDirEndpointPopup({
                        stationId: sid,
                        text: '始发站',
                        color: '#1A9B2D',
                        yOffset: 10
                    });
                    if (popup) dirPreviewOriginPopups.push(popup);
                }
                if (hasTerminal) {
                    const popup = createDirEndpointPopup({
                        stationId: sid,
                        text: '终点站',
                        color: '#D32F2F',
                        yOffset: hasOrigin ? 30 : 10
                    });
                    if (popup) dirPreviewTerminalPopups.push(popup);
                }
            }

            applySelectionEffects();
            collisionController?.scheduleUpdate?.();

            if (fitMode !== 'none') {
                const fitBbox = bboxFromStationIds(Array.from(stationIds));
                previewFitWithSidePanels(fitBbox);
            }
        };

        clearTripPathPreview = (options = {}) => {
            const targetSource = String(options?.source || '').trim();

            if (targetSource && isMultiSelectModeEnabled()) {
                let removed = false;
                for (const [key, entry] of tripPreviewSelectionsByKey.entries()) {
                    const source = String(entry?.source || resolveTripPreviewPayloadSource(entry?.payload) || '').trim();
                    if (source !== targetSource) continue;
                    tripPreviewSelectionsByKey.delete(key);
                    removed = true;
                }
                if (removed) {
                    rebuildTripPreviewFromMultiSelections('none');
                }
                return;
            }

            if (targetSource && !isMultiSelectModeEnabled()) {
                const currentSource = String(tripPreviewActiveSource || '').trim();
                if (currentSource && currentSource !== targetSource) return;
            }

            tripPreviewActive = false;
            tripPreviewActiveSource = '';
            tripPreviewStationIds = null;
            tripPreviewLineIds = null;
            tripPreviewStationOverrideColor = '';
            tripPreviewSelectionsByKey = new Map();
            resetTripPreviewLayers();
            clearTripEndpointPopups();
            syncStationOffsetForTripPreviewState();
            setStationLabelMode('auto');
            applySelectionEffects();
            collisionController?.scheduleUpdate?.();

            try {
                window.dispatchEvent(new CustomEvent('__TokyoRailTripPreviewCleared', { detail: { ts: Date.now() } }));
            } catch {
                // ignore
            }
            emitMultiSelectLayersUpdated();
        };

        previewTripPath = (payload) => {
            if (!payload || !Array.isArray(payload?.segments) || !payload.segments.length) {
                const virtualTrips = Array.isArray(payload?.virtualTrips)
                    ? payload.virtualTrips.filter((x) => x && Array.isArray(x?.segments) && x.segments.length)
                    : [];
                if (!virtualTrips.length) {
                    clearTripPathPreview();
                    return;
                }
            }

            const fitMode = String(payload?.fitMode || 'preview').trim() || 'preview';
            const payloadSource = resolveTripPreviewPayloadSource(payload);
            const previewInteraction = String(payload?.__previewInteraction || payload?.previewInteraction || '').trim() || '';
            const virtualTrips = Array.isArray(payload?.virtualTrips)
                ? payload.virtualTrips.filter((x) => x && Array.isArray(x?.segments) && x.segments.length)
                : [];

            if (virtualTrips.length) {
                if (isMultiSelectModeEnabled()) {
                    if (previewInteraction === 'hover') {
                        return;
                    }

                    const selectionKey = buildTripPreviewSelectionKey(payload);
                    if (!selectionKey) return;

                    const aggregate = buildTripPreviewAggregateFromPayloadList(virtualTrips);
                    const hasVisible = aggregate.lineIds instanceof Set && aggregate.lineIds.size > 0;
                    if (!hasVisible) {
                        tripPreviewSelectionsByKey.delete(selectionKey);
                        rebuildTripPreviewFromMultiSelections('none');
                        return;
                    }

                    tripPreviewSelectionsByKey.set(selectionKey, {
                        payload: { ...(payload || {}) },
                        built: {
                            lineFc: aggregate.lineFc,
                            stopFc: aggregate.stopFc,
                            lineIds: aggregate.lineIds,
                            stopIds: aggregate.stopIds,
                            startStationId: aggregate.startStationId,
                            endStationId: aggregate.endStationId,
                            bbox: aggregate.bbox
                        },
                        source: payloadSource,
                        hidden: false
                    });

                    rebuildTripPreviewFromMultiSelections(fitMode);
                    return;
                }

                ensureTripPreviewLayers();
                const aggregate = buildTripPreviewAggregateFromPayloadList(virtualTrips);
                const hasVisible = aggregate.lineIds instanceof Set && aggregate.lineIds.size > 0;

                if (!hasVisible) {
                    clearTripPathPreview({ source: payloadSource || '' });
                    return;
                }

                tripPreviewActive = true;
                tripPreviewActiveSource = payloadSource;
                tripPreviewStationOverrideColor = resolveTripPreviewStationOverrideColor(payload, payloadSource);
                if (payloadSource === 'panel-dir-branch') {
                    const explicitHighlightIds = new Set(
                        (Array.isArray(payload?.highlightStationIds) ? payload.highlightStationIds : [])
                            .map((x) => String(x || '').trim())
                            .filter(Boolean)
                    );
                    if (explicitHighlightIds.size) {
                        tripPreviewStationIds = explicitHighlightIds;
                    } else {
                        const endpointIds = buildEndpointStationIdSetFromPayloadList(virtualTrips);
                        tripPreviewStationIds = endpointIds.size ? endpointIds : aggregate.stopIds;
                    }
                } else {
                    tripPreviewStationIds = aggregate.stopIds;
                }
                tripPreviewLineIds = aggregate.lineIds;
                syncStationOffsetForTripPreviewState();

                try {
                    tripPreviewRenderer.setData({ lineFc: aggregate.lineFc, stopFc: aggregate.stopFc });
                } catch {
                    // ignore
                }

                clearTripEndpointPopups();

                try {
                    window.dispatchEvent(new CustomEvent('__TokyoRailTripPreviewUpdated', {
                        detail: {
                            ts: Date.now(),
                            payload,
                            built: aggregate
                        }
                    }));
                } catch {
                    // ignore
                }

                setStationLabelMode('all');
                applySelectionEffects();
                collisionController?.scheduleUpdate?.();
                if (fitMode !== 'none') {
                    previewFitWithSidePanels(aggregate.bbox);
                }
                return;
            }

            if (isMultiSelectModeEnabled()) {
                if (previewInteraction === 'hover') {
                    return;
                }
                const selectionKey = buildTripPreviewSelectionKey(payload);
                if (!selectionKey) return;

                if (tripPreviewSelectionsByKey.has(selectionKey)) {
                    tripPreviewSelectionsByKey.delete(selectionKey);
                } else {
                    const builtSingle = buildTripPreviewFeatures(payload);
                    tripPreviewSelectionsByKey.set(selectionKey, {
                        payload: { ...(payload || {}) },
                        built: builtSingle,
                        source: payloadSource,
                        hidden: false
                    });
                }

                rebuildTripPreviewFromMultiSelections(fitMode);
                return;
            }

            ensureTripPreviewLayers();
            const built = buildTripPreviewFeatures(payload);
            tripPreviewActive = true;
            tripPreviewActiveSource = payloadSource;
            tripPreviewStationOverrideColor = resolveTripPreviewStationOverrideColor(payload, payloadSource);
            tripPreviewStationIds = built.stopIds;
            tripPreviewLineIds = built.lineIds;
            syncStationOffsetForTripPreviewState();

            try {
                tripPreviewRenderer.setData({ lineFc: built.lineFc, stopFc: built.stopFc });
            } catch {
                // ignore
            }

            updateTripEndpointPopups(built.startStationId, built.endStationId);

            try {
                window.dispatchEvent(new CustomEvent('__TokyoRailTripPreviewUpdated', {
                    detail: {
                        ts: Date.now(),
                        payload,
                        built
                    }
                }));
            } catch {
                // ignore
            }

            setStationLabelMode('all');
            applySelectionEffects();
            collisionController?.scheduleUpdate?.();
            if (fitMode !== 'none') {
                previewFitWithSidePanels(built.bbox);
            }
        };

        const toggleTripPreviewSelectionVisibility = (key) => {
            const k = String(key || '').trim();
            if (!k || !tripPreviewSelectionsByKey.has(k)) return false;
            const current = tripPreviewSelectionsByKey.get(k) || {};
            tripPreviewSelectionsByKey.set(k, {
                ...current,
                hidden: !(current?.hidden === true)
            });
            rebuildTripPreviewFromMultiSelections('none');
            return true;
        };

        const removeTripPreviewSelection = (key) => {
            const k = String(key || '').trim();
            if (!k) return false;
            const removed = tripPreviewSelectionsByKey.delete(k);
            if (!removed) return false;
            rebuildTripPreviewFromMultiSelections('none');
            return true;
        };

        const parseMultiSelectItemScope = (id) => {
            const raw = String(id || '').trim();
            if (!raw) return null;
            if (raw.startsWith('base:')) return { scope: 'base', key: raw.slice(5) };
            if (raw.startsWith('trip:')) return { scope: 'trip', key: raw.slice(5) };
            return null;
        };

        const runMultiSelectLayersCommand = (action, itemId) => {
            const parsed = parseMultiSelectItemScope(itemId);
            if (!parsed?.key) return false;

            if (parsed.scope === 'base') {
                if (action === 'toggle-visibility') {
                    const ok = toggleBaseMultiSelectionVisibility(parsed.key);
                    if (ok) {
                        applySelectionEffects();
                        collisionController?.scheduleUpdate?.();
                    }
                    return ok;
                }
                if (action === 'toggle-branch-preview') {
                    return toggleBaseLineBranchPreview(parsed.key);
                }
                if (action === 'remove') {
                    const lineId = getLineIdFromBaseMultiSelectKey(parsed.key);
                    const source = getMultiSelectLineBranchSource(lineId);
                    const ok = removeBaseMultiSelection(parsed.key);
                    if (ok) {
                        if (lineId) multiSelectBranchPreviewStepByLineId.delete(lineId);
                        if (source) clearTripPathPreview({ source });
                        if (!getBaseMultiSelectedLineIds().size && !tripPreviewActive) setStationLabelMode('auto');
                        applySelectionEffects();
                        collisionController?.scheduleUpdate?.();
                    }
                    return ok;
                }

                // Split company into individual line selections (respecting main+branch merge rules)
                if (action === 'split-company') {
                    try {
                        const baseKey = String(parsed.key || '').trim();
                        if (!baseKey) return false;
                        const entry = baseMultiSelectionsByKey.get(baseKey);
                        if (!entry || String(entry.kind || '') !== 'company') return false;

                        // Build map of mainLineId -> Set(mergedLineIds)
                        const mainMap = new Map();
                        const ids = entry.lineIds instanceof Set ? Array.from(entry.lineIds) : [];
                        for (const lidRaw of ids) {
                            const lid = String(lidRaw || '').trim();
                            if (!lid) continue;
                            const resolved = resolveLineSelectionForApp(lid) || {};
                            const mainLineId = String(resolved?.mainLineId || lid).trim() || lid;
                            const merged = Array.isArray(resolved?.mergedLineIds) ? resolved.mergedLineIds.map(String).filter(Boolean) : [mainLineId];
                            if (!mainMap.has(mainLineId)) mainMap.set(mainLineId, new Set());
                            const setRef = mainMap.get(mainLineId);
                            for (const x of merged) setRef.add(String(x));
                        }

                        // Remove the company selection
                        baseMultiSelectionsByKey.delete(baseKey);

                        // Add per-main-line selections (skip if already present)
                        for (const [mainId, setIds] of mainMap.entries()) {
                            const arr = Array.from(setIds).map(String).filter(Boolean);
                            if (!arr.length) continue;
                            const lineKey = `line:${mainId}`;
                            if (baseMultiSelectionsByKey.has(lineKey)) continue;
                            baseMultiSelectionsByKey.set(lineKey, {
                                kind: 'line',
                                lineIds: new Set(arr),
                                displayName: getLineNameForMultiSelect(mainId) || '',
                                hidden: false
                            });
                        }

                        emitMultiSelectLayersUpdated();
                        syncMultiSelectBaseTripPreview().catch(() => null);
                        applySelectionEffects();
                        collisionController?.scheduleUpdate?.();
                        return true;
                    } catch {
                        return false;
                    }
                }
                return false;
            }

            if (parsed.scope === 'trip') {
                if (action === 'toggle-visibility') return toggleTripPreviewSelectionVisibility(parsed.key);
                if (action === 'remove') return removeTripPreviewSelection(parsed.key);
                return false;
            }

            return false;
        };

        try {
            window.__TokyoRailMultiSelectLayerControl = {
                runCommand: (action, itemId) => runMultiSelectLayersCommand(action, itemId),
                requestSync: () => emitMultiSelectLayersUpdated()
            };
        } catch {
            // ignore
        }

        window.addEventListener(MULTI_SELECT_LAYERS_COMMAND_EVENT, (evt) => {
            const action = String(evt?.detail?.action || '').trim();
            const itemId = String(evt?.detail?.id || '').trim();
            if (!action || !itemId) return;
            runMultiSelectLayersCommand(action, itemId);
        });

        const companyObj = {};
        const linesObj = {};
        lineSelectionLinesObj = linesObj;
        enabledLineIdsByCompany = new Map();


        const lineBoundsById = new Map();
        let lastFitKey = null;
        let fitRafId = null;
        let pendingFit = null;
        let lastFitPaddingSig = null;

        const getFitPadding = (paddingMode = 'auto') => {
            const base = 60;
            const extraLeft = 200;


            const fallback = { top: base, right: base, bottom: base, left: base };


            if (paddingMode === 'full') return fallback;

            let leftPad = base;
            if (menu?.wrapper) {



                const rect = menu.wrapper.getBoundingClientRect?.();
                if (rect && Number.isFinite(rect.width)) {
                    const reserve = Math.max(0, Number.isFinite(rect.right) ? rect.right : 0, rect.width);
                    leftPad = Math.max(base, Math.ceil(reserve + base + extraLeft));
                }
            }

            let rightPad = base;
            try {
                const panelRect = panel?.el?.getBoundingClientRect?.();
                if (panelRect && Number.isFinite(panelRect.width) && panelRect.width > 0) {
                    rightPad = Math.max(rightPad, Math.ceil(panelRect.width + base));
                }
            } catch {
                // ignore
            }

            try {
                const tripEl = document.querySelector('[data-panel-trip-detail]');
                const hidden = tripEl?.classList?.contains('is-hidden');
                const rect = tripEl?.getBoundingClientRect?.();
                if (!hidden && rect && Number.isFinite(rect.width) && rect.width > 0) {
                    rightPad = Math.max(rightPad, Math.ceil(rightPad + rect.width));
                }
            } catch {
                // ignore
            }

            return { top: base, right: rightPad, bottom: base, left: leftPad };
        };

        function isFiniteNum(n) {
            return Number.isFinite(n);
        }

        function extendBBox(b, lng, lat) {
            if (!isFiniteNum(lng) || !isFiniteNum(lat)) return b;
            if (!b) return { minLng: lng, minLat: lat, maxLng: lng, maxLat: lat };
            if (lng < b.minLng) b.minLng = lng;
            if (lat < b.minLat) b.minLat = lat;
            if (lng > b.maxLng) b.maxLng = lng;
            if (lat > b.maxLat) b.maxLat = lat;
            return b;
        }

        function bboxFromGeometry(geom) {
            if (!geom) return null;
            const type = geom.type;
            const coords = geom.coordinates;
            let b = null;

            if (type === 'LineString' && Array.isArray(coords)) {
                for (const pt of coords) {
                    if (!Array.isArray(pt) || pt.length < 2) continue;
                    const lng = Number(pt[0]);
                    const lat = Number(pt[1]);
                    b = extendBBox(b, lng, lat);
                }
                return b;
            }

            if (type === 'MultiLineString' && Array.isArray(coords)) {
                for (const line of coords) {
                    if (!Array.isArray(line)) continue;
                    for (const pt of line) {
                        if (!Array.isArray(pt) || pt.length < 2) continue;
                        const lng = Number(pt[0]);
                        const lat = Number(pt[1]);
                        b = extendBBox(b, lng, lat);
                    }
                }
                return b;
            }

            return null;
        }

        function unionBBox(a, b) {
            if (!a) return b;
            if (!b) return a;
            if (![a.minLng, a.minLat, a.maxLng, a.maxLat].every(isFiniteNum)) return b;
            if (![b.minLng, b.minLat, b.maxLng, b.maxLat].every(isFiniteNum)) return a;
            return {
                minLng: Math.min(a.minLng, b.minLng),
                minLat: Math.min(a.minLat, b.minLat),
                maxLng: Math.max(a.maxLng, b.maxLng),
                maxLat: Math.max(a.maxLat, b.maxLat)
            };
        }

        function bboxToFitBounds(b) {
            if (!b) return null;
            if (![b.minLng, b.minLat, b.maxLng, b.maxLat].every(Number.isFinite)) return null;
            // MapLibre: [[west,south],[east,north]]
            return [
                [b.minLng, b.minLat],
                [b.maxLng, b.maxLat]
            ];
        }

        function scheduleFit(key, bbox, options = {}) {
            if (!isAdaptiveViewportEnabled()) return;
            if (!bbox) return;
            const padding = getFitPadding(options?.paddingMode);
            const paddingSig = `l${padding.left}|r${padding.right}|t${padding.top}|b${padding.bottom}`;
            if (key && key === lastFitKey && paddingSig === lastFitPaddingSig) return;

            pendingFit = { key, bbox, options, padding, paddingSig };
            if (fitRafId != null) return;

            fitRafId = requestAnimationFrame(() => {
                fitRafId = null;
                const next = pendingFit;
                pendingFit = null;
                if (!next) return;

                const bounds = bboxToFitBounds(next.bbox);
                if (!bounds) return;
                const flat = [bounds[0]?.[0], bounds[0]?.[1], bounds[1]?.[0], bounds[1]?.[1]];
                if (!flat.every(isFiniteNum)) return;

                lastFitKey = next.key ?? null;
                lastFitPaddingSig = next.paddingSig ?? null;
                const fitOptions = {
                    padding: next.padding || 60,
                    duration: 300,
                    easing: (t) => t,
                    essential: true
                };
                if (Number.isFinite(next.options?.maxZoom)) fitOptions.maxZoom = next.options.maxZoom;
                mapEngine.fitBounds(bounds, fitOptions);
            });
        }

        for (const f of lineFeatures) {
            const lineId = f?.properties?.id ?? f?.id;
            if (!lineId) continue;

            const company = f?.properties?.company ?? '未知公司';
            const name = f?.properties?.name ?? String(lineId);
            const color = f?.properties?.color;

            if (typeof color === 'string' && color.trim() && f?.properties && typeof f.properties === 'object') {
                f.properties._dark_color = resolveRailColorForTheme(color.trim(), { isDarkThemeActive: true });
            }

            lineCompanyById.set(String(lineId), String(company));

            lineNameById.set(String(lineId), String(name));
            if (typeof color === 'string' && color.trim()) lineColorById.set(String(lineId), color.trim());
            if (typeof color === 'string' && color.trim()) lineColorByName.set(String(name), color.trim());

            companyObj[company] = true;

            if (!enabledLineIdsByCompany.has(company)) enabledLineIdsByCompany.set(company, new Set());
            enabledLineIdsByCompany.get(company).add(String(lineId));

            linesObj[String(lineId)] = {
                company,
                simplified: name,
                // 运行模式预留：目前只提供 all
                modes: ['all']
            };

            // 预计算该线路 geometry bounds
            const bbox = bboxFromGeometry(f.geometry);
            if (bbox) {
                const key = String(lineId);
                const prev = lineBoundsById.get(key) ?? null;
                lineBoundsById.set(key, unionBBox(prev, bbox));
            }
        }

        emitMultiSelectLayersUpdated();

        function getBBoxForSelected() {
            if (selectedLineId) {
                if (selectedStationLineIds && selectedStationLineIds.size > 1) {
                    let b = null;
                    for (const id of selectedStationLineIds) {
                        b = unionBBox(b, lineBoundsById.get(String(id)) ?? null);
                    }
                    return b ?? null;
                }

                const b = lineBoundsById.get(String(selectedLineId));
                return b ?? null;
            }

            if (selectedCompany) {
                const ids = enabledLineIdsByCompany.get(selectedCompany);
                if (!ids || ids.size === 0) return null;
                let b = null;
                for (const id of ids) {
                    b = unionBBox(b, lineBoundsById.get(String(id)) ?? null);
                }
                return b;
            }

            return null;
        }

        const fitToCurrentSelectionPreview = (triggerKey) => {
            const b = getBBoxForSelected();
            if (!b) return;
            scheduleFit(`preview:${triggerKey}`, b, { maxZoom: 11 });
        };

        const canRunHoverPreviewAtCurrentZoom = () => {
            const z = typeof map.getZoom === 'function' ? map.getZoom() : null;
            return !(typeof z === 'number' && z < HOVER_PREVIEW_MIN_ZOOM);
        };

        const fitToCurrentSelectionCommit = (triggerKey) => {
            const b = getBBoxForSelected();
            if (!b) return;
            // 点击高亮：不限制放大倍率，按 bounds 实际大小 fit
            scheduleFit(`commit:${triggerKey}`, b, { maxZoom: undefined, paddingMode: 'full' });
        };


        fitToCurrentSelection = (triggerKey, mode = 'preview') => {
            const key = String(triggerKey ?? '');
            const explicitCommit = key.startsWith('commit:');
            const explicitPreview = key.startsWith('preview:');
            const cleanKey = key.replace(/^(commit:|preview:)/, '');
            const useCommit = explicitCommit || (!explicitPreview && mode === 'commit');
            if (useCommit) fitToCurrentSelectionCommit(cleanKey);
            else fitToCurrentSelectionPreview(cleanKey);
        };

        // 旧的 #controls 容器不再作为侧边栏使用，清空避免视觉干扰
        const controlsEl = document.getElementById('controls');
        if (controlsEl) controlsEl.innerHTML = '';

        menu = new Menu({
            companyObj,
            linesObj,
            companyLogoMap,
            railwaysOrderIndex,
            logoBasePath: COMPANY_LOGO_BASE_PATH,
            hoverDelayMs: 500,
            onCancelSelection: clearSelectionsAndRestore,
            onCompanyClick: (companyName, meta) => {
                const source = meta?.source ?? 'click';
                if (source === 'hover' && !isHoverPreviewEnabled()) return;
                hideStationPopupForMenuInteraction();
                const commitPreview = meta?.commitPreview === true;
                clearMenuThroughPreview();

                if (isMultiSelectModeEnabled() && source !== 'hover') {
                    const name = String(companyName ?? '').trim();
                    if (!name) return;
                    const ids = Array.from(enabledLineIdsByCompany.get(name) ?? []).map(String).filter(Boolean);
                    if (!ids.length) return;
                    const companyDisplayName = String(companyLogoMap?.[name]?.zh || name).trim() || name;
                    toggleBaseMultiSelection(`company:${name}`, ids, 'company', companyDisplayName);
                    applySelectionEffects();
                    return;
                }

                selectedStationLineIds = null;
                if (source === 'hover') {
                    selectedCompany = companyName;
                    setStationLabelMode('auto');
                } else {

                    selectedCompany = commitPreview ? companyName : (selectedCompany === companyName ? null : companyName);
                }
                selectedLineId = null;
                selectedServiceMode = 'all';
                applySelectionEffects();
                if (selectedCompany) {
                    if (source === 'hover') fitToCurrentSelectionPreview(`company:${selectedCompany}`);
                    else fitToCurrentSelectionCommit(`company:${selectedCompany}`);
                }
            },
            onLineClick: (lineId, meta) => {
                const source = meta?.source ?? 'click';
                if (source === 'hover' && !isHoverPreviewEnabled()) return;
                hideStationPopupForMenuInteraction();
                const commitPreview = meta?.commitPreview === true;

                if (isMenuThroughLineId(lineId)) {
                    previewMenuThroughLine({ lineId, source: source === 'hover' ? 'hover' : 'click' });
                    return;
                }

                clearMenuThroughPreview();



                const resolved = resolveLineSelectionForApp(lineId);

                const mainLineId = String(meta?.mainLineId ?? resolved?.mainLineId ?? lineId);
                const merged = Array.isArray(meta?.mergedLineIds)
                    ? meta.mergedLineIds.map(String).filter(Boolean)
                    : (Array.isArray(resolved?.mergedLineIds) ? resolved.mergedLineIds.map(String).filter(Boolean) : [mainLineId]);

                if (isMultiSelectModeEnabled() && source !== 'hover') {
                    toggleBaseMultiSelection(`line:${mainLineId}`, merged, 'line');
                    if (getBaseMultiSelectedLineIds().size) setStationLabelMode('all');
                    else setStationLabelMode('auto');
                    applySelectionEffects();
                    return;
                }

                // 线路点击：优先级高于公司点击
                if (source === 'hover') {
                    selectedLineId = mainLineId;
                    selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
                    setStationLabelMode('auto');
                } else {
                    selectedLineId = commitPreview
                        ? mainLineId
                        : (selectedLineId === mainLineId ? null : mainLineId);
                }
                if (selectedLineId) selectedCompany = null;
                selectedServiceMode = 'all';


                if (source !== 'hover') {
                    selectedStationLineIds = selectedLineId && merged.length > 1 ? new Set(merged) : null;
                }


                if (source !== 'hover' && selectedLineId) setStationLabelMode('all');
                applySelectionEffects();
                if (selectedLineId) {
                    if (source === 'hover') fitToCurrentSelectionPreview(`line:${selectedLineId}`);
                    else {
                        fitToCurrentSelectionCommit(`line:${selectedLineId}`);
                        showRouteMapFloatingPanelForLine(lineId);
                    }
                }
            },
            onModeClick: ({ lineId, mode }, meta) => {
                const source = meta?.source ?? 'click';
                if (source === 'hover' && !isHoverPreviewEnabled()) return;
                hideStationPopupForMenuInteraction();
                const commitPreview = meta?.commitPreview === true;
                clearMenuThroughPreview();

                if (isMultiSelectModeEnabled() && source !== 'hover') {
                    const id = String(lineId ?? '').trim();
                    if (!id) return;
                    toggleBaseMultiSelection(`mode:${id}:${String(mode || 'all').trim() || 'all'}`, [id], 'mode');
                    if (getBaseMultiSelectedLineIds().size) setStationLabelMode('all');
                    else setStationLabelMode('auto');
                    applySelectionEffects();
                    return;
                }

                selectedStationLineIds = null;

                if (source === 'hover') {
                    selectedLineId = lineId;
                    selectedServiceMode = mode;
                    setStationLabelMode('auto');
                } else {
                    selectedLineId = commitPreview
                        ? lineId
                        : (selectedLineId === lineId && selectedServiceMode === mode ? null : lineId);
                    selectedServiceMode = mode;
                }
                if (selectedLineId) selectedCompany = null;


                if (source !== 'hover' && selectedLineId) setStationLabelMode('all');
                applySelectionEffects();
                if (selectedLineId) {
                    if (source === 'hover') fitToCurrentSelectionPreview(`mode:${selectedLineId}:${selectedServiceMode}`);
                    else fitToCurrentSelectionCommit(`mode:${selectedLineId}:${selectedServiceMode}`);
                }
            }
        });

        menu.mount(document.body);
        menu.setWrapperStyle();
        window.addEventListener('resize', () => menu.setWrapperStyle());

        lineHoverPopup = setupLineHoverPopup(map, maplibregl, {
            hoverMinZoom: HOVER_PREVIEW_MIN_ZOOM,
            companyLogoMap,
            getHoverPreviewEnabled: () => isHoverPreviewEnabled()
        });


        const refitForMenuOpen = () => {
            if (!isHoverPreviewEnabled()) return;
            if (!selectedCompany && !selectedLineId) return;

            fitToCurrentSelection('menu-open', 'preview');
        };

        menu.wrapper?.addEventListener('mouseenter', () => {
            refitForMenuOpen();
        });

        menu.wrapper?.addEventListener(
            'pointerdown',
            (evt) => {
                const pt = evt?.pointerType;
                if (pt !== 'touch' && pt !== 'pen') return;


                const leftBefore = parseFloat(getComputedStyle(menu.wrapper).left || '0');
                if (Number.isFinite(leftBefore) && leftBefore < 0) {
                    setTimeout(() => refitForMenuOpen(), 0);
                }
            },
            { passive: true }
        );

        bindClickLineToSelect();

        bindClickBlankToRestore();

        // 全屏浏览按钮
        initFullscreen(map, touchTapGuard);

        applySelectionEffects();
    } catch (e) {
        console.error('线路加载失败，请确保运行了 python -m http.server', e);
    }

    try {
        const loadedGeoData = generatedStationsData && generatedStationOffsetAlgorithmContext
            ? null
            : await loadRailGeoDataFromDataFolder();
        const stationsData = generatedStationsData || loadedGeoData?.stationsGeoJSON;
        const stationOffsetAlgorithmContext = generatedStationOffsetAlgorithmContext || loadedGeoData?.stationOffsetAlgorithmContext;




        try {
            const orderList = await getCachedJson('./data/railways-order.json');
            if (Array.isArray(orderList) && Array.isArray(stationsData?.features)) {
                const normOrderMap = new Map();
                for (let i = 0; i < orderList.length; i++) {
                    const obj = orderList[i];
                    if (!obj || typeof obj !== 'object') continue;
                    const keys = Object.keys(obj);
                    if (!keys.length) continue;
                    const raw = String(keys[0] ?? '').trim().toLowerCase();
                    if (!raw) continue;
                    const parts = raw.split('-');
                    if (parts[0] && parts[0].startsWith('jr') && parts[0].length > 2) {
                        parts[0] = 'jr-' + parts[0].slice(2);
                    }
                    const norm = parts.join('.');
                    if (!normOrderMap.has(norm)) normOrderMap.set(norm, i);
                }

                const getStationLineId = (f) => {
                    try {
                        const maybe = (f && (f.properties && (f.properties.id || f.properties._id))) || (f && f.id) || '';
                        const id = String(maybe || '').trim();
                        if (!id) return '';
                        const parts = id.split('.').map((s) => String(s || '').trim()).filter(Boolean);
                        if (!parts.length) return '';
                        const two = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
                        return String(two || '').toLowerCase();
                    } catch {
                        return '';
                    }
                };

                const MAX = Number.MAX_SAFE_INTEGER;
                stationsData.features.sort((a, b) => {
                    const aid = getStationLineId(a);
                    const bid = getStationLineId(b);
                    const ai = normOrderMap.has(aid) ? normOrderMap.get(aid) : MAX;
                    const bi = normOrderMap.has(bid) ? normOrderMap.get(bid) : MAX;
                    if (ai === bi) return 0;
                    if (ai === MAX) return -1;
                    if (bi === MAX) return 1;
                    return bi - ai;
                });
            }
        } catch {
            // ignore
        }

        addStationsLayer(map, stationsData);

        let currentStationOffsetStateKey = null;


        try {
            transferCapsuleStationsData = stationsData;
            transferCapsuleStationGroups = await getCachedJson('./data/station-groups.json');
            transferCapsuleBaseConnectionOrder = buildTransferCapsuleConnectionOrder(stationsData, transferCapsuleStationGroups);
            transferCapsuleVisibleKey = '__init__';
            scheduleTransferCapsuleRefresh();
        } catch (e) {
            console.warn('换乘站 MST 胶囊渲染初始化失败', e);
        }


        bindClickStationToHighlightServingLines();


        applySelectionEffects();

        const markers = createStationMarkers(map, maplibregl, stationsData);
        stationLabels = markers.stationLabels;
        const stationCircles = markers.stationCircles;

        const rebuildStationCoordMap = (geojson) => {
            stationCoordById = new Map();
            const fs = Array.isArray(geojson?.features) ? geojson.features : [];
            for (const sf of fs) {
                if (sf?.geometry?.type !== 'Point') continue;
                const sid = String(sf?.properties?.id ?? sf?.id ?? '').trim();
                const c = sf?.geometry?.coordinates;
                if (!sid || !Array.isArray(c) || c.length < 2) continue;
                const lng = Number(c[0]);
                const lat = Number(c[1]);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
                stationCoordById.set(sid, [lng, lat]);
            }
            
            // 地图缩放引发坐标变动时，实时触发热力图及源数据的刷新
            try {
                if (typeof refreshReachableStopsOverlay === 'function') {
                    refreshReachableStopsOverlay(undefined, { fitBounds: false });
                }
            } catch (e) {
                // ignore
            }
        };

        const applyStationGeoJSON = (geojson, keyHint = '') => {
            const nextGeoJSON = geojson && typeof geojson === 'object' ? geojson : null;
            if (!nextGeoJSON) return;

            try {
                map.getSource('stations-source')?.setData?.(nextGeoJSON);
            } catch {
                // ignore
            }

            const coordById = new Map();
            const fs = Array.isArray(nextGeoJSON?.features) ? nextGeoJSON.features : [];
            for (const f of fs) {
                const sid = String(f?.properties?.id ?? f?.id ?? '').trim();
                const c = f?.geometry?.coordinates;
                if (!sid || !Array.isArray(c) || c.length < 2) continue;
                const lng = Number(c[0]);
                const lat = Number(c[1]);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
                coordById.set(sid, [lng, lat]);
            }

            for (const item of stationLabels) {
                const sid = String(item?.stationId ?? item?.props?.id ?? '').trim();
                const c = sid ? coordById.get(sid) : null;
                if (!c) continue;
                item.coordinates = c;
                try { item.marker?.setLngLat?.(c); } catch { /* ignore */ }
            }

            for (const item of stationCircles) {
                const sid = String(item?.stationId ?? '').trim();
                const c = sid ? coordById.get(sid) : null;
                if (!c) continue;
                item.coordinates = c;
            }

            rebuildStationCoordMap(nextGeoJSON);
            transferCapsuleStationsData = nextGeoJSON;
            transferCapsuleVisibleKey = String(keyHint || '__station-geojson__');
            scheduleTransferCapsuleRefresh();
            collisionController?.scheduleUpdate?.();
        };

        const applyRealtimeStationOffsetForZoom = (zoom) => {
            const z = Number(zoom);
            if (!Number.isFinite(z)) return;

            const stateKey = `offset-zoom:${z.toFixed(3)}`;
            if (stateKey === currentStationOffsetStateKey) return;

            const nextGeoJSON = buildStationOffsetGeoJSONAtZoom({
                baseStationsGeoJSON: stationsData,
                stationOffsetAlgorithmContext,
                zoom: z
            });

            applyStationGeoJSON(nextGeoJSON, stateKey);
            currentStationOffsetStateKey = stateKey;
        };

        syncStationOffsetForTripPreviewState = () => {
            if (tripPreviewActive) {
                const tripPreviewBaseKey = '__trip-preview-base__';
                if (currentStationOffsetStateKey === tripPreviewBaseKey) return;
                applyStationGeoJSON(stationsData, tripPreviewBaseKey);
                currentStationOffsetStateKey = tripPreviewBaseKey;
                return;
            }

            applyRealtimeStationOffsetForZoom(map.getZoom());
        };



        applyTransferStationLabelCollapse();
        updateMultiSelectStationLabelChips();

        // 站名碰撞：标签上移偏移在 labels.js 内按站点类型设置
        collisionController = setupCollisions(map, stationLabels, stationCircles, {
            gridCellPx: 80,
            transferGroupByStationId: transferStationIdsByStationId,
            onCircleCollisionResolved: ({ visibleStationIds }) => {
                collisionVisibleStationIds = visibleStationIds instanceof Set ? new Set(visibleStationIds) : null;
                if (pendingTransferCapsuleRefreshAfterCollision) {
                    pendingTransferCapsuleRefreshAfterCollision = false;
                    transferCapsuleVisibleKey = '__init__';
                    scheduleTransferCapsuleRefresh();
                }
            },
            // 线路联动：只影响站名（圆点仍按碰撞显示）
            getEnabledLineIds: getEnabledLineIdsForLabels,
            getVisibleStationIds: () => {
                const baseVisible = (() => {
                    if (tripPreviewActive && tripPreviewStationIds && tripPreviewStationIds.size) {
                        if (isMultiSelectModeEnabled()) {
                            const baseIds = getVisibleStationIdsForBaseMultiSelection();
                            if (baseIds.size) {
                                const merged = new Set(baseIds);
                                for (const sid of tripPreviewStationIds) merged.add(String(sid || '').trim());
                                return merged;
                            }
                        }
                        return tripPreviewStationIds;
                    }
                    if (dirPreviewActive && dirPreviewStationIds && dirPreviewStationIds.size) {
                        return dirPreviewStationIds;
                    }
                    if (!selectedLineId && !selectedCompany && selectedStationId) {
                        return getVisibleStationIdsForSelectedStationSelection();
                    }
                    return null;
                })();

                if (!(reachableStopsLabelIds instanceof Set)) return baseVisible;
                if (!(baseVisible instanceof Set)) return reachableStopsLabelIds;

                const intersect = new Set();
                for (const rawId of baseVisible) {
                    const sid = String(rawId || '').trim();
                    if (sid && reachableStopsLabelIds.has(sid)) intersect.add(sid);
                }
                return intersect;
            },
            // 右上角三段开关：off/auto(碰撞)/all(无视碰撞)
            getLabelMode: () => {
                if (dirPreviewActive) return 'all';
                return stationLabelMode;
            },
            shouldThinAutoLabels: () => {
                if (stationLabelMode !== 'auto') return false;

                const hasBaseHighlight = Boolean(
                    selectedLineId ||
                    selectedCompany ||
                    selectedStationId ||
                    (selectedStationLineIds && selectedStationLineIds.size) ||
                    (isMultiSelectModeEnabled() && getBaseMultiSelectedLineIds().size)
                );
                const hasTripPreviewHighlight = Boolean(
                    tripPreviewActive ||
                    dirPreviewActive ||
                    (tripPreviewStationIds && tripPreviewStationIds.size) ||
                    (dirPreviewStationIds && dirPreviewStationIds.size)
                );

                return !(hasBaseHighlight || hasTripPreviewHighlight);
            },
            lowZoomLabelThinMaxZoom: 13,
            lowZoomLabelKeepRatio: 1,
            // 高亮线路/公司时：圆点全部显示，避免缩小后站点消失
            getCircleMode: () => (
                tripPreviewActive ||
                dirPreviewActive ||
                (isMultiSelectModeEnabled() && getBaseMultiSelectedLineIds().size) ||
                selectedLineId ||
                selectedCompany ||
                (selectedStationLineIds && selectedStationLineIds.size)
                    ? 'all'
                    : 'collide'
            ),

            getPinnedStationId: () => selectedStationId || fixedPopupStationId,
            shouldHideStation: (stationLike) => {
                if (!shouldApplyBaseLayerHiddenFilter()) return false;
                const sid = String(stationLike?.stationId || '').trim();
                if (!sid) return false;
                return isBaseLayerHiddenStationId(sid);
            },
            lineFilterTarget: 'labels'
        });

        collisionController.scheduleUpdate();

        applyRealtimeStationOffsetForZoom(map.getZoom());

        let lastUpdateZoom = map.getZoom();
        let previousFrameZoom = map.getZoom();

        map.on('zoom', () => {
            if (!isStationOffsetDynamicMode()) return;
            if (tripPreviewActive) return;

            const currentZoom = map.getZoom();
            
            const cumulativeDelta = Math.abs(currentZoom - lastUpdateZoom);
            

            const frameVelocity = Math.abs(currentZoom - previousFrameZoom);
            
            previousFrameZoom = currentZoom;

            if (cumulativeDelta >= 0.2 || (frameVelocity > 0 && frameVelocity < 0.02)) {
                applyRealtimeStationOffsetForZoom(currentZoom);
                lastUpdateZoom = currentZoom; 
            }
        });

        map.on('zoomend', () => {
            if (isStationOffsetDynamicMode()) return;
            if (tripPreviewActive) return;

            applyRealtimeStationOffsetForZoom(map.getZoom());
            lastUpdateZoom = map.getZoom();
            previousFrameZoom = map.getZoom(); 
            
        });
        


        applySelectionEffects();

        stationPopup = setupStationPopup(map, maplibregl, {

            getLineMeta: (lineId) => {
                const id = String(lineId);
                return {
                    company: lineCompanyById.get(id) || null,
                    name: lineNameById.get(id) || id,
                    color: resolveRailColorForTheme(lineColorById.get(id) || null) || null
                };
            },
            companyLogoMap,
            railwaysOrderIndex,
            hoverDelayMs: 50,
            hoverMinZoom: HOVER_PREVIEW_MIN_ZOOM,
            getHoverPreviewEnabled: () => isHoverPreviewEnabled(),
            onSelectCompany: (companyName, meta) => {
                const source = meta?.source;
                if (isMultiSelectModeEnabled() && (source === 'popup-hover' || source === 'popup-click')) return;
                const name = String(companyName ?? '').trim();
                if (!name) return;

                if (source === 'popup-hover') {
                    if (!canRunHoverPreviewAtCurrentZoom()) return;
                    if (!popupPreviewSnapshot) popupPreviewSnapshot = snapshotSelectionState();
                    popupPreviewWasApplied = true;

                    const stationLineIds = Array.isArray(meta?.stationLineIds) ? meta.stationLineIds.map(String).filter(Boolean) : [];
                    const subset = stationLineIds.filter((id) => String(lineCompanyById.get(String(id)) || '') === name);

                    selectedCompany = null;
                    selectedLineId = null;
                    selectedStationLineIds = new Set((subset.length ? subset : stationLineIds).map(String).filter(Boolean));
                    selectedStationId = null;
                    selectedServiceMode = 'all';
                    isolateStationsToSelectedLine = false;
                    setStationLabelMode('auto');
                    applySelectionEffects();
                    return;
                }

                if (source === 'popup-click') {

                    popupPreviewSnapshot = null;
                    popupPreviewWasApplied = false;

                    const stationLineIds = Array.isArray(meta?.stationLineIds)
                        ? meta.stationLineIds.map(String).filter(Boolean)
                        : [];
                    const subset = stationLineIds.filter((id) => String(lineCompanyById.get(String(id)) || '') === name);

                    selectedCompany = null;
                    selectedLineId = null;
                    selectedStationLineIds = new Set((subset.length ? subset : stationLineIds).map(String).filter(Boolean));
                    selectedStationId = null;
                    selectedServiceMode = 'all';
                    isolateStationsToSelectedLine = false;
                    setStationLabelMode('auto');
                    applySelectionEffects();
                    return;
                }


                popupPreviewSnapshot = null;
                popupPreviewWasApplied = false;
                selectedCompany = name;
                selectedLineId = null;
                selectedStationLineIds = null;
                selectedStationId = null;
                selectedServiceMode = 'all';
                isolateStationsToSelectedLine = false;
                applySelectionEffects();
            },
            onSelectLine: (lineId, meta) => {
                const source = meta?.source;
                if (isMultiSelectModeEnabled() && (source === 'popup-hover' || source === 'popup-click')) return;
                const id = String(lineId ?? '').trim();
                if (!id) return;

                if (isMenuThroughLineId(id)) {
                    previewMenuThroughLine({ lineId: id, source: source === 'popup-hover' ? 'hover' : 'click' });
                    return;
                }

                const resolved = resolveLineSelectionForApp(id);
                const mainLineId = String(resolved?.mainLineId ?? id);
                const merged = Array.isArray(resolved?.mergedLineIds)
                    ? resolved.mergedLineIds.map(String).filter(Boolean)
                    : [mainLineId];

                if (source === 'popup-hover') {
                    if (!canRunHoverPreviewAtCurrentZoom()) return;
                    if (!popupPreviewSnapshot) popupPreviewSnapshot = snapshotSelectionState();
                    popupPreviewWasApplied = true;
                    selectedLineId = mainLineId;
                    selectedCompany = null;
                    selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
                    selectedStationId = null;
                    selectedServiceMode = 'all';
                    isolateStationsToSelectedLine = false;
                    setStationLabelMode('auto');
                    applySelectionEffects();
                    return;
                }


                popupPreviewSnapshot = null;
                popupPreviewWasApplied = false;
                selectedLineId = mainLineId;
                selectedCompany = null;
                selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
                selectedStationId = null;
                selectedServiceMode = 'all';
                setStationLabelMode('all');
                isolateStationsToSelectedLine = meta?.isolateStations === true;


                if (menu && typeof menu.markActive === 'function') {
                    const el = menu.wrapper?.querySelector(`.RW-line-content[data-line-id="${cssEscape(selectedLineId)}"]`);
                    if (el) menu.markActive(el);
                }

                applySelectionEffects();
            },
            onRestoreStationLines: (lineIds) => {

                selectedLineId = null;
                selectedCompany = null;
                isolateStationsToSelectedLine = false;
                selectedServiceMode = 'all';

                if (Array.isArray(lineIds) && lineIds.length) {
                    selectedStationLineIds = new Set(lineIds.map(String).filter(Boolean));
                }
                selectedStationId = fixedPopupStationId ? String(fixedPopupStationId).trim() : selectedStationId;

                applySelectionEffects();
            },
            onFixedPopupBlankClick: () => {
                // 固定 popup：点击空白处直接恢复“全显示”，且不触发预览快照回滚
                popupPreviewSnapshot = null;
                popupPreviewWasApplied = false;
                clearSelectionsAndRestore();
            },
            onPopupClose: ({ committed }) => {
                if (!committed && popupPreviewSnapshot && popupPreviewWasApplied) {
                    restoreSelectionState(popupPreviewSnapshot);
                }
                popupPreviewSnapshot = null;
                popupPreviewWasApplied = false;
                setFixedPopupStationLabelBelow(null);
            }
        });


        try {
            if (window.TokyoRailSearchMapActions) {
                window.TokyoRailSearchMapActions.isReady = true;
            }
        } catch {
            // ignore
        }


        {
            const isTouchLike = (pt) => pt === 'touch' || pt === 'pen';
            const readPointerType = (evt) => {
                const pt = evt?.pointerType;
                if (pt) return pt;
                const t = evt?.type;
                if (t && String(t).startsWith('touch')) return 'touch';
                return 'mouse';
            };
            const stop = (evt) => {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
            };

            const fireStationLabelTap = (item, pt) => {
                if (isJourneyMapPickActive()) return;
                if (item?.forceHiddenByTransferCollapse) return;
                const hadStationSelection = !!String(selectedStationId || '').trim();
                if (!isMultiSelectModeEnabled()) {
                    selectServingLinesForStation(item.props || {});
                }
                openPanelForStationWithAutoScroll(item.props || {}, { autoScroll: hadStationSelection });

                // 预加载该站点关联线路的时刻表
                try {
                    const ids = getServingLineIdsFromStationProps(item.props || {});
                    timetableCache?.preloadRecursiveByLineIds?.(ids);
                } catch {
                    // ignore
                }
            };

            stationLabels.forEach((item) => {
                const el = item?.el;
                if (!el) return;


                el.addEventListener('mouseenter', () => {
                    stationPopup.setExternalStationHover?.(true);
                    lineHoverPopup?.setExternalStationHover?.(true);
                });
                el.addEventListener('mouseleave', () => {
                    stationPopup.setExternalStationHover?.(false);
                    lineHoverPopup?.setExternalStationHover?.(false);
                });


                el.addEventListener(
                    'pointerdown',
                    (evt) => {
                        const pt = readPointerType(evt);
                        if (!isTouchLike(pt)) return;
                        stop(evt);
                    },
                    { passive: false }
                );

                el.addEventListener(
                    'pointerup',
                    (evt) => {
                        const pt = readPointerType(evt);
                        if (!isTouchLike(pt)) return;
                        stop(evt);
                        if (!touchTapGuard.allowTap(evt)) return;
                        fireStationLabelTap(item, pt);
                    },
                    { passive: false }
                );

                // 鼠标：click 弹出 popup
                el.addEventListener('click', (evt) => {
                    const pt = readPointerType(evt);
                    if (isTouchLike(pt)) {
                        stop(evt);
                        return;
                    }
                    stop(evt);
                    fireStationLabelTap(item, pt);
                });
            });
        }

        ensureBasemapLayers();
        applyBasemapTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    } catch (e) {
        console.error('站点加载失败', e);
    }
};

let mapInitStarted = false;
let mapInitQueued = false;
const startMapInit = (reason) => {
    if (mapInitStarted) return;
    if (map?.loaded?.() || map?.isStyleLoaded?.()) {
        mapInitStarted = true;
        initMapApp().catch((e) => {
            console.error('地图初始化失败', e);
        });
        return;
    }

    if (mapInitQueued) return;
    mapInitQueued = true;
    map.once('styledata', () => {
        mapInitQueued = false;
        startMapInit(reason || 'styledata');
    });
   
};

map.on('load', () => startMapInit('load'));
map.on('error', () => startMapInit('error'));
setTimeout(() => startMapInit('timeout'), 3000);


const STORAGE_KEY = "zoomlevel-bookmark";

 window.getZoomInfo = () => {
    if (!map) return;
    const zoom = map.getZoom();
    const center = map.getCenter();
    const pitch = map.getPitch();
    const bearing = map.getBearing();
    console.log(`当前地图状态 - Zoom: ${zoom.toFixed(2)}, Center: [${center.lng.toFixed(4)}, ${center.lat.toFixed(4)}], Pitch: ${pitch.toFixed(1)}, Bearing: ${bearing.toFixed(1)}`);
    }

window.saveZoom = (remark=false) => {
    if (!map) return;
    const zoom = map.getZoom();
    const center = map.getCenter();
    const pitch = map.getPitch();
    const bearing = map.getBearing();
    let records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (remark === false) {
        remark = `u${records.length + 1}`;
    }
    const state = { zoom, center, pitch, bearing, remark };
    records.push(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    console.log("地图状态已保存");
    };

    window.showZoomRecords = () => {
        const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        records.forEach((rec, index) => {
            rec.zoom = rec.zoom.toFixed(2);
            rec.centerLat = rec.center.lat.toFixed(3);
            rec.centerLon = rec.center.lng.toFixed(3);
            delete rec.center;
        })
        console.table(records);
    };

    window.clearZoomRecords = () => {
        localStorage.removeItem(STORAGE_KEY);
        console.log('地图缩放记录已清除');
    };

    window.setZoom = (remark) => {
        const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        const record = records.find(r => r.remark === remark);
        if (record) {
            mapEngine.flyTo({
                zoom: record.zoom,
                center: record.center,
                pitch: record.pitch,
                bearing: record.bearing,
                essential: true
            });
            console.log(`已飞行到标记为 "${remark}" 的地图状态`);
        }
    }
