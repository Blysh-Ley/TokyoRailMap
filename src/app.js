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
import {
    buildOffsetPolylinePixelsWithMiter,
    buildStationOffsetGeoJSONAtZoom,
    nearestProjectionOnPolylinePixels,
    projectLngLatToPixelAtZoom12,
    unprojectPixelToLngLatAtZoom12
} from './map/offset.js';
import {
    STATION_LABELS_SOURCE_ID,
    STATION_LABEL_BACKGROUND_DARK_IMAGE_ID,
    STATION_LABEL_BACKGROUND_LIGHT_IMAGE_ID,
    addLineNameLabelsLayer,
    addLinesLayer,
    addStationLabelsLayer,
    addStationsLayer,
    buildStationLabelsLayerPaint,
    setupLineHoverPopup,
    setupStationPopup
} from './map/layers.js';
import { buildStationLabelGeoJSON, createStationMarkers } from './map/labels.js';
import { setupCollisions } from './map/collision.js';
import { buildTransferCapsuleGeoJSON, addTransferCapsuleLayers, buildTransferCapsuleConnectionOrder } from './map/transfer-capsules.js';
import { installMapAttributionView } from './ui/mapAttributionView.js';
import { installMobileBottomNav, MOBILE_BOTTOM_NAV_EVENT } from './ui/mobileBottomNav.js';
import { createMobileUiModeController } from './ui/mobileUiMode.js';
import { Menu, buildMenuModel } from './features/menu/menu.js';
import { createMobileMenu } from './features/menu/mobileMenu.js';
import { getGlobalTouchTapGuard } from './map/touchTapGuard.js';
import { createPanel } from './features/panel/panel.js';
import { getGlobalTimetableCache } from './lib/timetableCache.js';
import { initFullscreen, isInFullscreenMode } from './map/fullscreen.js';
import { extractShortestLoopSegmentByIndex, isLoopDirection } from './lib/trip-preview.js';
import {
    buildLineHighlightVirtualTripPayloads,
    resolveSelectionLineHighlightIds
} from './domain/lineHighlightVirtualTripBuilder.js';
import { buildLineHighlightLabelItems } from './domain/lineHighlightLabels.js';
import { buildLineNameLabelGeoJSON } from './domain/lineNameLabels.js';
import { previewBranchesForLine } from './map/analyze_branch.js';
import { createLineIconElement, getResolvedRouteIconMeta } from './lib/line-icons.js';
import {
    buildBaseLineColorExpr,
    buildFocusedLinePaint,
    buildLowlightLinePaint,
    buildStationCircleColorPaintExpr,
    stationCircleStrokeColorPaint,
    buildStationSelectionPaint,
    getLineOffsetPixelsPerUnitAtZoom,
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
import {
    readAdaptiveViewportEnabled,
    readHoverPreviewEnabled,
    readLineNameLabelsEnabled,
    readStationOffsetMode,
    readTimetableViewMode,
    writeTimetableViewMode,
    writeStationOffsetMode
} from './services/appSettings.js';
import { createMapEngine } from './services/mapEngine.js';
import { createStore } from './store/appStore.js';
import { hoverSetEnabled, multiSelectSetEnabled, panelOpenRequested, selectionClear } from './store/actions.js';
import { createBaseHighlightEventBridge } from './features/highlight/baseHighlightEventBridge.js';
import { createHighlightFeature } from './features/highlight/highlightFeature.js';
import { createHighlightRenderer } from './features/highlight/highlightRenderer.js';
import { buildMultiSelectLayerItemsFromInputs } from './features/highlight/multiSelectLayerItems.js';
import { createTripPreviewRenderer } from './features/highlight/tripPreviewRenderer.js';
import { createHoverFeature } from './features/hover/hoverFeature.js';
import { createPanelHoverPreviewLifecycle } from './features/hover/panelHoverPreviewAdapter.js';
import { createLayerFeature } from './features/layer/layerFeature.js';
import { bindMapInteractions } from './features/map-interactions/mapInteractionController.js';
import { createStationCoordinateAdapter } from './features/layer/stationCoordinateAdapter.js';
import { createStationOffsetRuntimeController } from './features/layer/stationOffsetRuntimeController.js';
import { createRouteFeature } from './features/route/routeFeature.js';
import { createRoutePreviewBridgeApi } from './features/route/routePreviewBridgeApi.js';
import { createRoutePreviewRuntimeController } from './features/route/routePreviewRuntimeController.js';
import { createReachableStopsOverlayRenderer } from './features/search/reachableStopsOverlayRenderer.js';
import { createTravelSearchMapRuntime } from './features/search/reachableStopsRuntime.js';
import { createSearchMapBridge } from './features/search/searchMapBridge.js';
import { createSearchFeature } from './features/search/searchFeature.js';
import { createSearchSelectionController } from './features/search/searchSelectionController.js';
import { createSelectionEffectsController } from './features/selection/selectionEffectsController.js';
import { createPanelSearchSelectionCallbacks } from './features/selection/panelSearchSelectionCallbacks.js';
import { createSettingsMenu } from './features/settings/settingsMenu.js';
import {
    buildTripPreviewLineFeatureDedupKey,
    resolveTripPreviewPayloadSource as resolveRoutePreviewPayloadSource
} from './domain/routePreviewSelection.js';
import { buildPreviewVirtualStationInjection, getLineIdFromStationId } from './domain/previewVirtualStations.js';
import { createSelectionBadge } from './ui/selectionBadge.js';
import { buildSelectionBadgeViewModel, createSelectionBadgeAdapter } from './ui/selectionBadgeAdapter.js';
import { createStationLabelChipsAdapter } from './ui/layer/stationLabelChipsAdapter.js';
import { createJourneyPickPinElement } from './ui/journeyPickPinAdapter.js';
import { createRouteEndpointPopupRuntime } from './ui/routeEndpointPopups.js';
import { createRoutePreviewViewportController } from './ui/routePreviewViewport.js';
import { createBasemapThemeRuntime } from './app/basemapThemeRuntime.js';
import { installAndroidBackRuntime } from './app/androidBackRuntime.js';
import { registerDebugZoomTools } from './app/debugZoomTools.js';
import { bindMapStartup } from './app/mapStartup.js';
import {
    bindMultiSelectLayerCommandRuntime,
    bindMultiSelectModeEvents,
    createMultiSelectLayersUpdatedEmitter,
    registerMultiSelectModeInternalApi,
    setMultiSelectGlobalEnabled
} from './app/multiSelectEventsRuntime.js';
import { registerTokyoRailMapRuntime } from './app/runtimeFacade.js';
import { mountAppSettingsControls } from './app/settingsControlsRuntime.js';

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
    preloadAllDataAssets({ includeTimetables: false }).catch((err) => {
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
const HOVER_PREVIEW_MIN_ZOOM = 10;

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

const mapEngine = createMapEngine({
    maplibregl,
    container: 'map',
    center: [139.767, 35.681],
    zoom: 11,
    style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {},
        layers: []
    }
});
const map = mapEngine.getMap();
const highlightRenderer = createHighlightRenderer({ mapEngine });
const reachableStopsOverlayRenderer = createReachableStopsOverlayRenderer({ mapEngine });
const basemapThemeRuntime = createBasemapThemeRuntime({ map, mapEngine });

const canRunHoverPreviewAtCurrentZoom = () => {
    const z = typeof mapEngine.getZoom === 'function' ? mapEngine.getZoom() : null;
    return !(typeof z === 'number' && z < HOVER_PREVIEW_MIN_ZOOM);
};


registerTokyoRailMapRuntime({
    map,
    mapEngine,
    buildOffsetPolylinePixelsWithMiter,
    getLineOffsetPixelsPerUnitAtZoom
});

// 左下角比例尺
mapEngine.addMetricScaleControl({ maxWidth: 100, position: 'bottom-left' });

let mapAttributionView = null;
const mobileUiMode = createMobileUiModeController({
    onChange: () => {
        mapAttributionView?.apply?.();
    }
});
const isMobileUiMode = () => mobileUiMode.isMobile();
const mobileBottomNavController = installMobileBottomNav();
const MOBILE_PANEL_DISMISS_NAV_ITEMS = new Set(['search', 'menu', 'settings']);

// 2) 初始化业务数据与图层（不强依赖底图瓦片成功加载）
const initMapApp = async () => {
    //console.log('地图初始化完成，准备加载 GeoJSON...');

    mapAttributionView = installMapAttributionView({ mapEngine, isCompact: isMobileUiMode });

    const railwaysOrderIndex = await loadRailwaysOrderIndex();

    // 触屏防误触：仅短按且几乎不移动才视为 tap
    const touchTapGuard = getGlobalTouchTapGuard({ maxDurationMs: 500, maxMovePx: 12 });

    let menu = null;
    let mobileMenu = null;
    let menuModel = null;
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
    let stationLabelChipsAdapter = null;
    let fixedPopupStationId = null;
    const journeyPickPinnedStationIds = new Map();
    let transferStationIdsByStationId = new Map();
    let previewTripPath = (_payload) => {};
    let clearTripPathPreview = () => {};
    let tripPreviewStationIds = null; // Set<string> | null
    let tripPreviewLineIds = null; // Set<string> | null
    let tripPreviewLineNameLabelsData = null;
    let tripPreviewStationOverrideColor = '';
    let tripPreviewActive = false;
    let tripPreviewActiveSource = '';
    let tripCurrentStationPopup = null;
    let selectedStationCurrentPopup = null;
    let selectedStationCurrentPopupStationId = null;
    let tripDetailStationTriangleMarker = null;
    let baseMultiSelectionsByKey = new Map();
    let dirPreviewActive = false;
    let dirPreviewLineIds = null; // Set<string> | null
    let dirPreviewStationIds = null; // Set<string> | null
    let previewDirHeader = (_payload) => {};
    let clearDirHeaderPreview = () => {};
    let hoverPreviewEnabled = readHoverPreviewEnabled();
    let adaptiveViewportEnabled = readAdaptiveViewportEnabled();
    let lineNameLabelsEnabled = readLineNameLabelsEnabled();
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
    let transferCapsuleVisibleKey = '__init__';
    let layerFeature = null;
    let travelSearchMapRuntime = null;
    let syncStationOffsetForTripPreviewState = () => {};
    let railwaysIndexByIdCachePromise = null;
    let generatedLinesData = null;
    let generatedLineNameLabelsData = null;
    let currentLineNameLabelsData = null;
    let generatedStationsData = null;
    let generatedRawRailways = null;
    let generatedRawStations = null;
    let generatedStationOffsetAlgorithmContext = null;
    let multiSelectBaseTripPreviewSignature = '';
    let selectionLineTripPreviewSignature = '';
    let selectionLineTripPreviewRequestId = 0;
    let selectionCompanyTripPreviewSignature = '';
    let selectionCompanyTripPreviewRequestId = 0;

    const MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE = 'ms-base-trip-preview';
    const MULTI_SELECT_BASE_TRIP_PREVIEW_KEY = 'multi-base-lines';
    const SELECTION_LINE_TRIP_PREVIEW_SOURCE = 'selection-line-trip-preview';
    const SELECTION_LINE_TRIP_PREVIEW_KEY = 'selection-line';
    const SELECTION_COMPANY_TRIP_PREVIEW_SOURCE = 'selection-company-trip-preview';
    const SELECTION_COMPANY_TRIP_PREVIEW_KEY = 'selection-company';


    let panel = null;
    let hoverFeature = null;
    const isPanelVisuallyOpen = () => {
        const transform = String(panel?.el?.style?.transform || '');
        return Boolean(panel?.el) && transform && !transform.includes('calc(');
    };
    const dismissPanelForMobileNavItem = (item) => {
        if (!MOBILE_PANEL_DISMISS_NAV_ITEMS.has(item)) return;
        if (!isPanelVisuallyOpen()) return;
        panel?.hide?.();
        clearTripPathPreview();
        clearSelectionsAndRestore();
    };
    window.addEventListener(MOBILE_BOTTOM_NAV_EVENT, (event) => {
        const item = String(event?.detail?.item || '').trim();
        dismissPanelForMobileNavItem(item);
        if (item === 'menu') mobileMenu?.open?.();
        else mobileMenu?.close?.();
    });
    document.addEventListener('click', (event) => {
        const button = event?.target?.closest?.('.mobile-bottom-nav-btn');
        const item = String(button?.dataset?.mobileBottomNavItem || '').trim();
        dismissPanelForMobileNavItem(item);
    }, true);
    const appStore = createStore({
        selectedCompany,
        selectedLineId,
        selectedStationLineIds,
        selectedStationId,
        selectedServiceMode,
        hoverPreviewEnabled,
        multiSelectEnabled: multiSelectModeEnabled
    });

    const isHoverPreviewEnabled = () => (
        hoverFeature ? hoverFeature.isEnabled() : hoverPreviewEnabled !== false
    );
    const isAdaptiveViewportEnabled = () => adaptiveViewportEnabled !== false;
    const applyHoverPreviewEnabled = (enabled) => {
        if (hoverFeature) {
            hoverFeature.setEnabled(enabled);
            return;
        }
        hoverPreviewEnabled = enabled !== false;
        appStore.dispatch(hoverSetEnabled(hoverPreviewEnabled));
        panel?.setHoverPreviewEnabled?.(hoverPreviewEnabled);
        stationPopup?.setHoverPreviewEnabled?.(hoverPreviewEnabled);
    };
    const applyAdaptiveViewportEnabled = (enabled) => {
        adaptiveViewportEnabled = enabled !== false;
    };
    const applyLineNameLabelsEnabled = (enabled) => {
        lineNameLabelsEnabled = enabled !== false;
        mapEngine.setLayerVisibility?.('line-name-labels-layer', lineNameLabelsEnabled);
    };

    const applyStationOffsetMode = (mode, { persistStorage = true } = {}) => {
        const next = (String(mode || '').trim().toLowerCase() === 'performance') ? 'performance' : 'dynamic';
        stationOffsetMode = layerFeature?.setStationOffsetMode?.(next) || next;
        if (persistStorage) {
            writeStationOffsetMode(stationOffsetMode);
        }
        return stationOffsetMode;
    };

    const clearTripDetailStationIndicator = () => {
        try {
            tripDetailStationTriangleMarker?.remove?.();
        } catch {
            // ignore
        }
        tripDetailStationTriangleMarker = null;
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
            tripDetailStationTriangleMarker = mapEngine.createMarker({ element: outer, anchor: 'top', offset: [0, 6] })
                .setLngLat(coord);
            mapEngine.addMarker(tripDetailStationTriangleMarker);
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
            syncMultiSelectBaseTripPreview().catch(() => null);
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

    const getLineFeatureIdCandidates = (feature) => {
        const props = feature?.properties || {};
        return [
            props.lineId,
            props.r,
            props.geometry_line_id,
            props.line_offset_id,
            props.id,
            feature?.id
        ].map((value) => String(value || '').trim()).filter(Boolean);
    };

    const getCurrentTripPreviewAggregateLineFeatures = () => {
        if (!routeFeature || typeof routeFeature.buildMultiTripPreviewAggregate !== 'function') return [];
        const aggregate = routeFeature.buildMultiTripPreviewAggregate({
            buildLineFeatureDedupKey: buildTripPreviewLineFeatureDedupKey
        });
        return Array.isArray(aggregate?.lineFc?.features) ? aggregate.lineFc.features : [];
    };

    const projectStationToPreviewLineFeature = ({ baseCoord, feature } = {}) => {
        const coords = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
        if (!Array.isArray(baseCoord) || baseCoord.length < 2 || coords.length < 2) return null;

        const sourcePixels = coords.map(projectLngLatToPixelAtZoom12).filter(Boolean);
        const basePx = projectLngLatToPixelAtZoom12(baseCoord);
        if (!basePx || sourcePixels.length < 2) return null;

        const units = Number(feature?.properties?.line_offset_units);
        const offsetPxAtZoom = Number.isFinite(units)
            ? units * getLineOffsetPixelsPerUnitAtZoom(mapEngine.getZoom())
            : 0;
        const zoom = Number(mapEngine.getZoom());
        const scaleToZoom12 = Math.pow(2, 12 - (Number.isFinite(zoom) ? zoom : 12));
        const offsetPxAtZoom12 = offsetPxAtZoom * scaleToZoom12;
        const targetPixels = offsetPxAtZoom12
            ? buildOffsetPolylinePixelsWithMiter(sourcePixels, offsetPxAtZoom12)
            : sourcePixels;
        if (!Array.isArray(targetPixels) || targetPixels.length < 2) return null;

        const hit = nearestProjectionOnPolylinePixels(targetPixels, basePx);
        const lngLat = hit?.point ? unprojectPixelToLngLatAtZoom12(hit.point) : null;
        return Array.isArray(lngLat) && lngLat.length >= 2 ? lngLat : null;
    };

    const createPreviewVirtualStationCoordinateResolver = () => {
        const lineFeatures = getCurrentTripPreviewAggregateLineFeatures();
        return ({ baseCoord, source, lineId, realStationId } = {}) => {
            const src = String(source || '').trim();
            const lid = String(lineId || getLineIdFromStationId(realStationId) || '').trim();
            const realLineId = String(getLineIdFromStationId(realStationId) || '').trim();
            const sourceMatches = [];
            const lineMatches = [];

            for (const feature of lineFeatures) {
                const props = feature?.properties || {};
                const featureSource = String(props.line_offset_collision_source || '').trim();
                const candidates = getLineFeatureIdCandidates(feature);
                if (src && featureSource === src) sourceMatches.push(feature);
                if ((lid && candidates.includes(lid)) || (realLineId && candidates.includes(realLineId))) {
                    lineMatches.push(feature);
                }
            }

            const candidates = sourceMatches.length ? sourceMatches : lineMatches;
            let best = null;
            let bestDist = Number.POSITIVE_INFINITY;
            const basePx = projectLngLatToPixelAtZoom12(baseCoord);
            for (const feature of candidates) {
                const coord = projectStationToPreviewLineFeature({ baseCoord, feature });
                const px = projectLngLatToPixelAtZoom12(coord);
                if (!coord || !basePx || !px) continue;
                const dx = px.x - basePx.x;
                const dy = px.y - basePx.y;
                const dist = dx * dx + dy * dy;
                if (dist < bestDist) {
                    best = coord;
                    bestDist = dist;
                }
            }
            return best || baseCoord;
        };
    };

    const buildPreviewVirtualStationInjectionForCapsules = ({ stationsGeoJSON, stationGroups, visibleStationIds } = {}) => {
        if (!tripPreviewActive || !isMultiSelectModeEnabled()) return null;
        const entries = routeFeature?.getTripPreviewSelectionEntries?.();
        if (!Array.isArray(entries) || !entries.length) return null;
        return buildPreviewVirtualStationInjection({
            stationsData: stationsGeoJSON,
            stationGroups,
            visibleStationIds,
            tripPreviewSelectionEntries: entries,
            throughServiceConfigsObject: THROUGH_SERVICE_CONFIGS_OBJECT,
            baseSelectedLineIds: getBaseMultiSelectedLineIds(),
            getLineColor: (lineId, participant) => {
                const throughColor = String(THROUGH_SERVICE_CONFIGS_OBJECT?.[participant?.throughCategory]?.color || '').trim();
                if (throughColor) return resolveRailColorForTheme(throughColor) || throughColor;
                const id = String(lineId || '').trim();
                return resolveRailColorForTheme(lineColorById.get(id) || '') || '';
            },
            resolveStationCoordinate: createPreviewVirtualStationCoordinateResolver()
        });
    };

    const getVisibleStationIdsForTripPreviewStationLayer = () => {
        if (!(tripPreviewStationIds instanceof Set) || !tripPreviewStationIds.size) return null;
        const visibleIds = new Set(Array.from(tripPreviewStationIds).map((x) => String(x || '').trim()).filter(Boolean));
        const injection = buildPreviewVirtualStationInjectionForCapsules({
            stationsGeoJSON: transferCapsuleStationsData || stationsData,
            stationGroups: transferCapsuleStationGroups,
            visibleStationIds: visibleIds
        });
        if (injection?.replacedRealStationIds instanceof Set) {
            for (const id of injection.replacedRealStationIds) visibleIds.delete(id);
        }
        return visibleIds;
    };

    const getStationIdTailToken = (stationId) => {
        const sid = String(stationId || '').trim();
        if (!sid) return '';
        const parts = sid.split('.').map((x) => String(x || '').trim()).filter(Boolean);
        return parts.length ? parts[parts.length - 1] : sid;
    };

    const setStationLabelTranslate = (item, fallbackTranslate) => {
        if (!item?.el) return;
        if (item.labelPosition === 'below') {
            const pad = Number.isFinite(item.labelBelowPadPx) ? item.labelBelowPadPx : 0;
            item.el.style.translate = `0 calc(100% + ${pad}px)`;
            return;
        }
        item.el.style.translate = fallbackTranslate;
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
                setStationLabelTranslate(item, baseTranslate);
                if (!isMultiSelectModeEnabled() && item?.el) item.el.textContent = baseName;
                continue;
            }

            const groupSet = transferStationIdsByStationId.get(sid);

            if (!(groupSet instanceof Set) || groupSet.size <= 1) {
                item.priority = basePriority;
                item.forceHiddenByTransferCollapse = false;
                item._multiSelectBaseLabelText = baseName;
                setStationLabelTranslate(item, baseTranslate);
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
                setStationLabelTranslate(item, baseTranslate);
                if (!isMultiSelectModeEnabled() && item?.el) item.el.textContent = baseName;
                continue;
            }

            const groupKey = groupIds.slice().sort().join('|');
            const repIds = repIdsByGroupKey.get(groupKey);
            const visibleByScope = !visibleSet || visibleSet.has(sid);
            const isPinnedBelow = item.labelPosition === 'below';
            const isRepresentative = isPinnedBelow || (visibleByScope && repIds instanceof Set && repIds.has(sid));

            item.priority = isRepresentative ? basePriority : 0;
            item.forceHiddenByTransferCollapse = !isRepresentative;
            item._multiSelectBaseLabelText = baseName;
            setStationLabelTranslate(item, isRepresentative
                ? (offsetByStationId.get(sid) || baseTranslate)
                : baseTranslate);
            if (!isMultiSelectModeEnabled() && item?.el) item.el.textContent = baseName;
        }
    };

    const toTransferCapsuleVisibleKey = (visibleIds, options = {}) => {
        const mode = options?.useFixedConnections ? 'fixed' : 'auto';
        const scope = options?.viewportOnly ? 'viewport' : 'final';
        const previewScopeKey = (() => {
            if (!tripPreviewActive || !isMultiSelectModeEnabled()) return '';
            const previewKeys = Array.isArray(routeFeature?.getTripPreviewSelectionEntries?.())
                ? routeFeature.getTripPreviewSelectionEntries()
                    .map(([key, entry]) => `${String(key || '').trim()}:${entry?.hidden === true ? '0' : '1'}`)
                    .filter(Boolean)
                    .sort()
                : [];
            const baseKeys = Array.from(getBaseMultiSelectedLineIds()).sort();
            return `preview:${previewKeys.join(',')};base:${baseKeys.join(',')}`;
        })();
        const prefix = previewScopeKey ? `${mode}:${scope}:${previewScopeKey}:` : `${mode}:${scope}:`;
        if (options?.useFixedConnections && options?.baseHiddenFilterActive) {
            return `${prefix}__base-hidden-filter__`;
        }
        if (!(visibleIds instanceof Set)) return `${prefix}*`;
        if (!visibleIds.size) return `${prefix}__empty__`;
        return `${prefix}${Array.from(visibleIds).map(String).filter(Boolean).sort().join('|')}`;
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
        layerFeature?.refreshTransferCapsulesNow?.();
    };

    const scheduleTransferCapsuleRefresh = () => {
        if (layerFeature?.scheduleTransferCapsuleRefresh) {
            layerFeature.scheduleTransferCapsuleRefresh();
            return;
        }
        requestAnimationFrame(() => refreshTransferCapsulesNow());
    };

    const invalidateAndScheduleTransferCapsules = (keyHint = '__init__') => {
        if (layerFeature?.invalidateAndScheduleTransferCapsules) {
            layerFeature.invalidateAndScheduleTransferCapsules(keyHint);
            return;
        }
        transferCapsuleVisibleKey = String(keyHint || '__init__');
        scheduleTransferCapsuleRefresh();
    };

    const resetTransferCapsuleVisibleKey = (keyHint = '__init__') => {
        if (layerFeature?.resetTransferCapsuleVisibleKey) {
            layerFeature.resetTransferCapsuleVisibleKey(keyHint);
            return;
        }
        transferCapsuleVisibleKey = String(keyHint || '__init__');
    };

    const requestTransferCapsuleRefreshAfterCollision = (keyHint = '__init__') => {
        if (layerFeature?.requestTransferCapsuleRefreshAfterCollision) {
            layerFeature.requestTransferCapsuleRefreshAfterCollision(keyHint);
            return;
        }
        resetTransferCapsuleVisibleKey(keyHint);
    };

    const scheduleCollisionLayerRefresh = () => {
        if (layerFeature?.scheduleCollisionLayerRefresh) {
            layerFeature.scheduleCollisionLayerRefresh();
        }
    };

    const scheduleSelectionLayerRefresh = () => {
        if (layerFeature?.scheduleSelectionLayerRefresh) {
            layerFeature.scheduleSelectionLayerRefresh();
            return;
        }
        scheduleCollisionLayerRefresh();
        scheduleTransferCapsuleRefresh();
    };

    travelSearchMapRuntime = createTravelSearchMapRuntime({
        mapEngine,
        overlayRenderer: reachableStopsOverlayRenderer,
        getStationCoord: (stationId) => stationCoordById.get(stationId) || stationCoordByIdBase.get(stationId),
        getStationLabels: () => stationLabels,
        createJourneyPickPinElement,
        onJourneyPickPinStationIdsChange: (idsByType = {}) => {
            journeyPickPinnedStationIds.clear();
            for (const type of ['origin', 'destination']) {
                const sid = String(idsByType?.[type] ?? '').trim();
                if (sid) journeyPickPinnedStationIds.set(type, sid);
            }
            applyStationLabelPositionOverrides();
        },
        scheduleCollisionLayerRefresh
    });

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

        setMultiSelectGlobalEnabled(window, next);

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
        appStore.dispatch(multiSelectSetEnabled(next));
        emitMultiSelectLayersUpdated();
    };

    registerMultiSelectModeInternalApi({
        target: window,
        setEnabledSilent: (enabled) => {
            const next = enabled === true;
            multiSelectModeEnabled = next;
            setMultiSelectGlobalEnabled(window, next);
            appStore.dispatch(multiSelectSetEnabled(next));
        }
    });


    const timetableCache = getGlobalTimetableCache({ maxBytes: 50 * 1024 * 1024, logFetch: true, logDiscover: true });

    const cssEscape = (value) => {
        const s = String(value);
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s);
        return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    };


    const selectionBadge = createSelectionBadge({ host: document.body });
    const selectionBadgeAdapter = createSelectionBadgeAdapter({
        badge: selectionBadge,
        createLineIconElement,
        getCompanyLogoCandidates,
        setImageElementFromCache
    });
    const baseHighlightEventBridge = createBaseHighlightEventBridge({ target: window });

    const lineNameById = new Map();
    const lineColorById = new Map();
    const lineColorByName = new Map();
    const lineCompanyById = new Map();
    const lineOffsetUnitsById = new Map();
    const lineFeatureById = new Map();
    let lineHighlightLabelRequestId = 0;
    const tripPreviewRenderer = createTripPreviewRenderer({
        mapEngine,
        getLinePaint: () => tripPreviewLineLayerPaint({
            highlightStyle: shouldUseHighlightStyle()
        }),
        getStopPaint: () => tripPreviewStopLayerPaint({
            isDarkThemeActive: isDarkThemeActive(),
            lineColorById
        })
    });
    const routeFeature = createRouteFeature({
        tripPreviewRenderer,
        emitTripPreviewUpdated: ({ payload, built } = {}) => {
            tripPreviewLineNameLabelsData = buildTripPreviewLineNameLabelsData({ built });
            syncLineNameLabelDataForCurrentState();
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
        },
        emitTripPreviewCleared: () => {
            tripPreviewLineNameLabelsData = null;
            syncLineNameLabelDataForCurrentState();
            try {
                window.dispatchEvent(new CustomEvent('__TokyoRailTripPreviewCleared', { detail: { ts: Date.now() } }));
            } catch {
                // ignore
            }
        }
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

        if (menuModel?.mainLineIdByAnyLineId instanceof Map) {
            const mainLineId = String(menuModel.mainLineIdByAnyLineId.get(id) || id).trim() || id;
            const mergedLineIds = menuModel.mergedLineIdsByMenuLineId instanceof Map
                ? (menuModel.mergedLineIdsByMenuLineId.get(mainLineId) || [mainLineId])
                : [mainLineId];
            return {
                rawLineId: id,
                mainLineId,
                mergedLineIds: Array.isArray(mergedLineIds) ? mergedLineIds.map(String).filter(Boolean) : [mainLineId]
            };
        }

        return resolveLineSelectionByBranchRules(id, lineSelectionLinesObj || null);
    };

    const searchFeature = createSearchFeature({
        store: appStore,
        resolveLineSelection: resolveLineSelectionForApp
    });

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
        const railwaysIndexById = await getRailwaysIndexById();
        return buildLineHighlightVirtualTripPayloads({
            lineIds,
            railwaysIndexById,
            getLineName: (lineId) => lineNameById.get(lineId) || lineId,
            previewSource: MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE,
            fitMode: 'none'
        });
    };

    const getSelectionLineTripPreviewLineIds = () => resolveSelectionLineHighlightIds({
        selectedLineId,
        selectedStationLineIds
    });

    const buildSelectionLineTripVirtualTrips = async (lineIds) => {
        const railwaysIndexById = await getRailwaysIndexById();
        return buildLineHighlightVirtualTripPayloads({
            lineIds,
            railwaysIndexById,
            getLineName: (lineId) => lineNameById.get(lineId) || lineId,
            previewSource: SELECTION_LINE_TRIP_PREVIEW_SOURCE,
            fitMode: 'none'
        });
    };

    const getSelectionCompanyTripPreviewLineIds = () => {
        const company = String(selectedCompany || '').trim();
        if (!company || !enabledLineIdsByCompany || !enabledLineIdsByCompany.has(company)) return [];
        const ids = Array.from(enabledLineIdsByCompany.get(company) || []).map(String).filter(Boolean);
        ids.sort((a, b) => a.localeCompare(b));
        return ids;
    };

    const buildSelectionCompanyTripVirtualTrips = async (lineIds) => {
        const railwaysIndexById = await getRailwaysIndexById();
        return buildLineHighlightVirtualTripPayloads({
            lineIds,
            railwaysIndexById,
            getLineName: (lineId) => lineNameById.get(lineId) || lineId,
            previewSource: SELECTION_COMPANY_TRIP_PREVIEW_SOURCE,
            fitMode: 'none'
        });
    };

    const syncSelectionLineTripPreview = async () => {
        const activeSource = String(tripPreviewActiveSource || '').trim();

        if (isMultiSelectModeEnabled()) {
            const shouldClear = selectionLineTripPreviewSignature
                || activeSource === SELECTION_LINE_TRIP_PREVIEW_SOURCE;
            selectionLineTripPreviewSignature = '';
            selectionLineTripPreviewRequestId += 1;
            if (shouldClear) clearTripPathPreview({ source: SELECTION_LINE_TRIP_PREVIEW_SOURCE });
            return;
        }

        if (activeSource && activeSource !== SELECTION_LINE_TRIP_PREVIEW_SOURCE) {
            selectionLineTripPreviewRequestId += 1;
            return;
        }

        const lineIds = getSelectionLineTripPreviewLineIds();
        const signature = lineIds.join('|');

        if (!lineIds.length) {
            const shouldClear = selectionLineTripPreviewSignature
                || activeSource === SELECTION_LINE_TRIP_PREVIEW_SOURCE;
            selectionLineTripPreviewSignature = '';
            selectionLineTripPreviewRequestId += 1;
            if (shouldClear) clearTripPathPreview({ source: SELECTION_LINE_TRIP_PREVIEW_SOURCE });
            return;
        }

        if (
            signature === selectionLineTripPreviewSignature
            && activeSource === SELECTION_LINE_TRIP_PREVIEW_SOURCE
        ) return;
        selectionLineTripPreviewSignature = signature;
        const requestId = selectionLineTripPreviewRequestId + 1;
        selectionLineTripPreviewRequestId = requestId;

        const virtualTrips = await buildSelectionLineTripVirtualTrips(lineIds);
        if (requestId !== selectionLineTripPreviewRequestId) return;
        if (!virtualTrips.length) {
            selectionLineTripPreviewSignature = '';
            clearTripPathPreview({ source: SELECTION_LINE_TRIP_PREVIEW_SOURCE });
            return;
        }

        previewTripPath({
            selectedLineId: lineIds[0],
            mainLineId: lineIds[0],
            tripKey: signature,
            previewKey: SELECTION_LINE_TRIP_PREVIEW_KEY,
            previewSource: SELECTION_LINE_TRIP_PREVIEW_SOURCE,
            fitMode: 'none',
            virtualTrips
        }, { fitMode: 'none', clearBefore: true });
    };

    const syncSelectionCompanyTripPreview = async () => {
        const activeSource = String(tripPreviewActiveSource || '').trim();

        if (isMultiSelectModeEnabled()) {
            const shouldClear = selectionCompanyTripPreviewSignature
                || activeSource === SELECTION_COMPANY_TRIP_PREVIEW_SOURCE;
            selectionCompanyTripPreviewSignature = '';
            selectionCompanyTripPreviewRequestId += 1;
            if (shouldClear) clearTripPathPreview({ source: SELECTION_COMPANY_TRIP_PREVIEW_SOURCE });
            return;
        }

        if (selectedLineId || (selectedStationLineIds && selectedStationLineIds.size)) {
            const shouldClear = selectionCompanyTripPreviewSignature
                || activeSource === SELECTION_COMPANY_TRIP_PREVIEW_SOURCE;
            selectionCompanyTripPreviewSignature = '';
            selectionCompanyTripPreviewRequestId += 1;
            if (shouldClear) clearTripPathPreview({ source: SELECTION_COMPANY_TRIP_PREVIEW_SOURCE });
            return;
        }

        if (activeSource && activeSource !== SELECTION_COMPANY_TRIP_PREVIEW_SOURCE) {
            selectionCompanyTripPreviewRequestId += 1;
            return;
        }

        const company = String(selectedCompany || '').trim();
        const lineIds = getSelectionCompanyTripPreviewLineIds();
        const signature = company && lineIds.length ? `${company}|${lineIds.join('|')}` : '';

        if (!signature) {
            const shouldClear = selectionCompanyTripPreviewSignature
                || activeSource === SELECTION_COMPANY_TRIP_PREVIEW_SOURCE;
            selectionCompanyTripPreviewSignature = '';
            selectionCompanyTripPreviewRequestId += 1;
            if (shouldClear) clearTripPathPreview({ source: SELECTION_COMPANY_TRIP_PREVIEW_SOURCE });
            return;
        }

        if (
            signature === selectionCompanyTripPreviewSignature
            && activeSource === SELECTION_COMPANY_TRIP_PREVIEW_SOURCE
        ) {
            return;
        }

        selectionCompanyTripPreviewSignature = signature;
        const requestId = selectionCompanyTripPreviewRequestId + 1;
        selectionCompanyTripPreviewRequestId = requestId;

        const virtualTrips = await buildSelectionCompanyTripVirtualTrips(lineIds);
        if (requestId !== selectionCompanyTripPreviewRequestId) return;
        if (!virtualTrips.length) {
            selectionCompanyTripPreviewSignature = '';
            clearTripPathPreview({ source: SELECTION_COMPANY_TRIP_PREVIEW_SOURCE });
            return;
        }

        previewTripPath({
            selectedLineId: lineIds[0],
            mainLineId: lineIds[0],
            tripKey: signature,
            previewKey: SELECTION_COMPANY_TRIP_PREVIEW_KEY,
            previewSource: SELECTION_COMPANY_TRIP_PREVIEW_SOURCE,
            fitMode: 'none',
            virtualTrips
        }, { fitMode: 'none', clearBefore: true });
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
        return routeFeature.hasVisibleTripPreviewSelectionBySource(source, resolveRoutePreviewPayloadSource);
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

        if (currentStep >= 2) {
            if (hasTripPreviewSelectionBySource(source)) {
                clearTripPathPreview({ source });
            }
            multiSelectBranchPreviewStepByLineId.delete(lineId);
            emitMultiSelectLayersUpdated();
            return false;
        }

        const isFirstClick = currentStep <= 0 || !hasTripPreviewSelectionBySource(source);
        const nextStep = isFirstClick ? 1 : 2;
        multiSelectBranchPreviewStepByLineId.set(lineId, nextStep);
        emitMultiSelectLayersUpdated();

        previewBranchesForLine({
            lineId,
            lineName: getLineNameForMultiSelect(lineId),
            fitMode: 'none',
            previewSource: source,
            filterSpecial: isFirstClick
        }).then((result) => {
            if (result?.ok !== true) {
                multiSelectBranchPreviewStepByLineId.delete(lineId);
                emitMultiSelectLayersUpdated();
            }
        }).catch(() => {
            clearTripPathPreview({ source });
            multiSelectBranchPreviewStepByLineId.delete(lineId);
            emitMultiSelectLayersUpdated();
        });

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

    const collectTripPreviewPayloadStationIds = (payload) => {
        const out = new Set();
        const payloads = Array.isArray(payload?.virtualTrips) && payload.virtualTrips.length
            ? payload.virtualTrips
            : [payload];
        for (const item of payloads) {
            const segments = Array.isArray(item?.segments) ? item.segments : [];
            for (const segment of segments) {
                const ids = Array.isArray(segment?.stationIds) ? segment.stationIds : [];
                for (const rawId of ids) {
                    const id = String(rawId || '').trim();
                    if (id) out.add(id);
                }
            }
        }
        return out;
    };

    const getTripPreviewStationColorOverrides = () => {
        if (!tripPreviewActive) return null;
        const entries = routeFeature?.getTripPreviewSelectionEntries?.();
        if (!Array.isArray(entries) || !entries.length) return null;

        const out = new Map();
        for (const rawEntry of entries) {
            const entry = Array.isArray(rawEntry) ? rawEntry[1] : rawEntry;
            if (!entry || entry.hidden === true) continue;
            const payload = entry.payload || {};
            const color = resolveTripPreviewStationOverrideColor(payload, entry.source);
            if (!color) continue;
            for (const stationId of collectTripPreviewPayloadStationIds(payload)) {
                if (!stationId || out.has(stationId)) continue;
                out.set(stationId, color);
            }
        }
        return out.size ? out : null;
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
        return buildMultiSelectLayerItemsFromInputs({
            baseTripPreviewSource: MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE,
            baseSelectionsByKey: baseMultiSelectionsByKey,
            excludeTripPreviewSource: MULTI_SELECT_BASE_TRIP_PREVIEW_SOURCE,
            formatBaseBranchLineName: (lineName, step) => `${lineName}${step >= 2 ? '（所有直通）' : '（平常直通）'}`,
            formatBranchLineName: (lineName) => `${lineName}（直通线路）`,
            getBaseKindName: getBaseKindNameForMultiSelect,
            getBranchSource: getMultiSelectLineBranchSource,
            getBranchPreviewStep: (lineId) => {
                const id = String(lineId || '').trim();
                if (!id) return 0;
                return Number(multiSelectBranchPreviewStepByLineId.get(id) || 0);
            },
            getLineName: getLineNameForMultiSelect,
            getStationName: getStationNameForMultiSelect,
            hasLineName: (lineId) => lineNameById.has(lineId),
            hasTripPreviewSelectionBySource,
            resolveTripPreviewPayloadSource: resolveRoutePreviewPayloadSource,
            tripPreviewSelectionEntries: routeFeature.getTripPreviewSelectionEntries()
        });
    };

    const emitMultiSelectLayersUpdated = createMultiSelectLayersUpdatedEmitter({
        target: window,
        getEnabled: isMultiSelectModeEnabled,
        getItems: buildMultiSelectLayerItems
    });

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
            selectedStationCurrentPopup = mapEngine.createPopup({
                closeButton: false,
                closeOnClick: false,
                closeOnMove: false,
                anchor: 'top',
                offset: [0, 8],
                className: 'station-selected-current-popup'
            })
                .setLngLat(coord)
                .setDOMContent(el);
            mapEngine.addPopup(selectedStationCurrentPopup);
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

        isolateStationsToSelectedLine = false;
        setStationLabelMode('all');
        searchFeature?.selectStationLines?.({
            stationId: String(props?.id ?? '').trim() || null,
            lineIds: ids
        });
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
        if (isMobileUiMode() && (selectedLineId || selectedCompany)) {
            selectionBadgeAdapter.render({ kind: 'empty' });
            return;
        }

        selectionBadgeAdapter.render(buildSelectionBadgeViewModel({
            companyLogoMap,
            getLineColor: (lineId) => lineColorById.get(lineId),
            getLineName: (lineId) => lineNameById.get(lineId),
            getThroughCategory: getMenuThroughCategoryByLineId,
            getThroughDisplay: getMenuThroughDisplayByLineId,
            isDarkThemeActive,
            resolveRailColor: resolveRailColorForTheme,
            selectedCompany,
            selectedLineId,
            throughServiceConfigs: THROUGH_SERVICE_CONFIGS_OBJECT
        }));
    }


    registerCompanyLogoMap(companyLogoMap, { preload: true, concurrency: 8 });

    const EMPTY_LINE_NAME_LABELS_DATA = { type: 'FeatureCollection', features: [] };

    const getLineNameLabelLineIdCandidates = (feature) => {
        const props = feature?.properties || {};
        const raw = [
            props.r,
            props.lineId,
            props.geometry_line_id,
            props.line_offset_id,
            props.id,
            feature?.id
        ];
        const seen = new Set();
        const out = [];
        for (const value of raw) {
            const id = String(value || '').trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
        return out;
    };

    const getLineNameLabelSourceLineId = (feature) => {
        return getLineNameLabelLineIdCandidates(feature)[0] || '';
    };

    const getFirstLineMetaValue = (mapRef, ids) => {
        for (const id of Array.isArray(ids) ? ids : []) {
            const value = String(mapRef?.get?.(id) || '').trim();
            if (value) return value;
        }
        return '';
    };

    const getLineNameLabelChains = (geometry) => {
        if (geometry?.type === 'LineString' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
            return [geometry.coordinates];
        }
        if (geometry?.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
            return geometry.coordinates.filter((chain) => Array.isArray(chain) && chain.length >= 2);
        }
        return [];
    };

    const buildTripPreviewLineNameLabelsData = ({ built } = {}) => {
        const sourceFeatures = Array.isArray(built?.lineFc?.features) ? built.lineFc.features : [];
        if (!sourceFeatures.length) return EMPTY_LINE_NAME_LABELS_DATA;

        const groups = new Map();

        for (const feature of sourceFeatures) {
            const props = feature?.properties || {};
            if (String(props.role || 'line') !== 'line') continue;

            const lineIdCandidates = getLineNameLabelLineIdCandidates(feature);
            const labelId = getLineNameLabelSourceLineId(feature);
            if (!labelId) continue;

            const name = String(getFirstLineMetaValue(lineNameById, lineIdCandidates) || props.name || labelId).trim();
            if (!name) continue;

            const chains = getLineNameLabelChains(feature.geometry);
            if (!chains.length) continue;

            if (!groups.has(labelId)) {
                groups.set(labelId, {
                    id: labelId,
                    name,
                    color: String(getFirstLineMetaValue(lineColorById, lineIdCandidates) || props.color || '').trim(),
                    lineOffsetUnits: Number(props.line_offset_units) || 0,
                    chains: []
                });
            }

            const group = groups.get(labelId);
            group.chains.push(...chains);
        }

        if (!groups.size) return EMPTY_LINE_NAME_LABELS_DATA;

        return buildLineNameLabelGeoJSON(Array.from(groups.values()).map((group) => ({
            type: 'Feature',
            id: group.id,
            properties: {
                id: group.id,
                name: group.name,
                color: group.color,
                line_offset_units: group.lineOffsetUnits,
                hidden_by_opacity_zero: 0
            },
            geometry: {
                type: 'MultiLineString',
                coordinates: group.chains
            }
        })));
    };

    const syncLineNameLabelDataForCurrentState = () => {
        const nextData = tripPreviewActive
            ? (tripPreviewLineNameLabelsData || EMPTY_LINE_NAME_LABELS_DATA)
            : (generatedLineNameLabelsData || EMPTY_LINE_NAME_LABELS_DATA);
        if (currentLineNameLabelsData === nextData) return;
        currentLineNameLabelsData = nextData;
        try {
            mapEngine.setSourceData?.('line-name-labels-source', nextData);
        } catch {
            // ignore stale style/source timing while MapLibre reloads layers
        }
    };

    const buildLineNameLabelFilter = (lineIds) => {
        const clauses = [['!=', ['get', 'id'], '']];
        const hideSeibuBranches = shouldApplyBaseLayerHiddenFilter();
        const hiddenLineIds = Array.from(BASE_LAYER_HIDDEN_LINE_IDS);

        if (hideSeibuBranches && hiddenLineIds.length) {
            clauses.push(...hiddenLineIds.map((id) => ['!=', ['get', 'id'], id]));
        }

        if (lineIds instanceof Set || Array.isArray(lineIds)) {
            const ids = Array.from(lineIds).map(String).filter(Boolean);
            clauses.push(ids.length
                ? ['in', ['get', 'id'], ['literal', ids]]
                : ['==', ['get', 'id'], '']);
        }

        return clauses.length === 1 ? clauses[0] : ['all', ...clauses];
    };

    function getLineNameLabelLineIdsForCurrentHighlight() {
        if (tripPreviewActive) return null;

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

        if (dirPreviewActive) return dirPreviewLineIds && dirPreviewLineIds.size ? dirPreviewLineIds : new Set();

        return null;
    }

    function shouldUseHighlightStyle() {
        return Boolean(
            tripPreviewActive ||
            dirPreviewActive ||
            selectedLineId ||
            selectedCompany ||
            selectedStationId ||
            (selectedStationLineIds && selectedStationLineIds.size) ||
            (isMultiSelectModeEnabled() && (
                getBaseMultiSelectedLineIds().size ||
                routeFeature?.getTripPreviewSelectionSize?.()
            ))
        );
    }

    function applyLineNameLabelSelectionFilter() {
        syncLineNameLabelDataForCurrentState();
        highlightRenderer.applyLineNameLabelFilter(
            buildLineNameLabelFilter(getLineNameLabelLineIdsForCurrentHighlight())
        );
    }

    function applyLineSelectionStyle() {
        if (!highlightRenderer.hasLayer('lines-layer')) return;
        applyLineNameLabelSelectionFilter();

        const baseColorExpr = buildBaseLineColorExpr({ isDarkThemeActive: isDarkThemeActive() });
        const applyLinePaint = (paint) => {
            highlightRenderer.applyLinePaint(paint);
        };


        if (tripPreviewActive) {
            applyLinePaint(buildLowlightLinePaint({
                dimOpacity: 0.45,
                highlightStyle: shouldUseHighlightStyle()
            }));
            return;
        }

        if (dirPreviewActive && dirPreviewLineIds && dirPreviewLineIds.size) {
            const ids = Array.from(dirPreviewLineIds).map(String).filter(Boolean);
            const hitExpr = ids.length === 1
                ? ['==', ['get', 'id'], ids[0]]
                : ['in', ['get', 'id'], ['literal', ids]];
            applyLinePaint(buildFocusedLinePaint({
                baseColorExpr,
                focusExpr: hitExpr,
                dimOpacity: 0.6,
                highlightStyle: shouldUseHighlightStyle()
            }));
            return;
        }

        if (!selectedLineId && selectedStationLineIds && selectedStationLineIds.size) {
            const ids = Array.from(selectedStationLineIds).map(String).filter(Boolean);
            const hitExpr = ids.length === 1
                ? ['==', ['get', 'id'], ids[0]]
                : ['in', ['get', 'id'], ['literal', ids]];
            applyLinePaint(buildFocusedLinePaint({
                baseColorExpr,
                focusExpr: hitExpr,
                dimOpacity: 0.6,
                highlightStyle: shouldUseHighlightStyle()
            }));
            return;
        }

        applyLinePaint(buildFocusedLinePaint({
            baseColorExpr,
            highlightStyle: shouldUseHighlightStyle()
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
        const tripPreviewStationLayerIds = tripPreviewActive
            ? getVisibleStationIdsForTripPreviewStationLayer()
            : null;
        const overrideStationIds = tripPreviewStationLayerIds instanceof Set && tripPreviewStationLayerIds.size
            ? Array.from(tripPreviewStationLayerIds)
            : [];
        const rawOverrideColorByStationId = getTripPreviewStationColorOverrides();
        const overrideColorByStationId = (() => {
            if (!(rawOverrideColorByStationId instanceof Map) || !rawOverrideColorByStationId.size) return null;
            if (!(tripPreviewStationLayerIds instanceof Set)) return rawOverrideColorByStationId;
            const scoped = new Map();
            for (const [stationId, color] of rawOverrideColorByStationId.entries()) {
                if (tripPreviewStationLayerIds.has(stationId)) scoped.set(stationId, color);
            }
            return scoped.size ? scoped : null;
        })();
        highlightRenderer.applyStationThemePaint({
            stationsPaint: {
                'circle-color': buildStationCircleColorPaintExpr({
                    isDarkThemeActive: dark,
                    lineColorById,
                    overrideColor,
                    overrideStationIds,
                    overrideColorByStationId
                }),
                'circle-stroke-color': stationCircleStrokeColorPaint({ isDarkThemeActive: dark })
            }
        });
        mapEngine.applyPaintProperties?.('station-labels-layer', buildStationLabelsLayerPaint({ isDark: dark }));
        mapEngine.setLayoutProperty?.(
            'station-labels-layer',
            'icon-image',
            dark ? STATION_LABEL_BACKGROUND_DARK_IMAGE_ID : STATION_LABEL_BACKGROUND_LIGHT_IMAGE_ID
        );
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
            applyStationPaint(buildStationSelectionPaint({
                highlightStyle: shouldUseHighlightStyle()
            }));
            applyStationThemePaintToMapLayers();
        };

        const applyFocusedStationPaint = (isSelectedExpr, { hideOthers = true } = {}) => {
            applyStationPaint(buildStationSelectionPaint({
                isSelectedExpr,
                hideOthers,
                highlightStyle: shouldUseHighlightStyle()
            }));
            applyStationThemePaintToMapLayers();
        };

        if (tripPreviewActive) {
            const stationLayerIds = getVisibleStationIdsForTripPreviewStationLayer();
            if (stationLayerIds instanceof Set) {
                const ids = Array.from(stationLayerIds).map(String).filter(Boolean);
                const isSelectedExpr = ids.length
                    ? (ids.length === 1
                        ? ['==', ['get', 'id'], ids[0]]
                        : ['in', ['get', 'id'], ['literal', ids]])
                    : ['==', ['get', 'id'], ''];
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

    const clearLineHighlightIdentityLabels = () => {
        lineHighlightLabelRequestId += 1;
        highlightRenderer.clearLineIdentityLabels();
    };

    const syncLineHighlightIdentityLabels = () => {
        const lineIds = getEnabledLineIdsForLabels();
        if (!(lineIds instanceof Set) || !lineIds.size) {
            clearLineHighlightIdentityLabels();
            return;
        }

        const requestId = lineHighlightLabelRequestId + 1;
        lineHighlightLabelRequestId = requestId;
        const baseItems = buildLineHighlightLabelItems({
            lineIds,
            lineFeatureById,
            getLineColor: (lineId) => resolveRailColorForTheme(lineColorById.get(lineId) || '') || '',
            getLineName: (lineId) => lineNameById.get(lineId) || lineId
        });

        if (!baseItems.length) {
            highlightRenderer.clearLineIdentityLabels();
            return;
        }

        highlightRenderer.applyLineIdentityLabels(baseItems);

        Promise.all(baseItems.map(async (item) => {
            try {
                const meta = await getResolvedRouteIconMeta(item.lineId, { color: item.color });
                return {
                    ...item,
                    iconText: String(meta?.code || item.iconText || '').trim(),
                    color: String(meta?.color || item.color || '').trim()
                };
            } catch {
                return item;
            }
        })).then((items) => {
            if (requestId !== lineHighlightLabelRequestId) return;
            highlightRenderer.applyLineIdentityLabels(items);
        }).catch(() => {
            if (requestId === lineHighlightLabelRequestId) {
                highlightRenderer.applyLineIdentityLabels(baseItems);
            }
        });
    };

    function updateMultiSelectStationLabelChips() {
        const inMultiSelectMode = isMultiSelectModeEnabled();
        stationLabelChipsAdapter?.render?.({
            activeLineIds: inMultiSelectMode
                ? Array.from(getBaseMultiSelectedLineIds()).map(String).filter(Boolean)
                : [],
            showIcons: window.__TokyoRailMultiSelectShowIcons !== false,
            visibleTripSelections: inMultiSelectMode
                ? routeFeature.getTripPreviewSelectionValues().filter((entry) => entry?.hidden !== true)
                : []
        });
    }

    function clearSelectionsAndRestore() {
        panel?.resetTemporaryTimeOverride?.();
        appStore.dispatch(selectionClear({ source: 'app.clearSelectionsAndRestore' }));
        isolateStationsToSelectedLine = false;
        setStationLabelMode('auto');



        requestTransferCapsuleRefreshAfterCollision('__init__');

        if (menu && typeof menu.clearActive === 'function') menu.clearActive();
    }

    const selectionEffectsController = createSelectionEffectsController({
        cancelFrame: (frameId) => cancelAnimationFrame(frameId),
        effects: {
            applyBaseLayerVisibilityFilters,
            applyLineSelectionStyle,
            syncSelectionLineTripPreview: () => {
                syncSelectionLineTripPreview().catch(() => null);
            },
            syncSelectionCompanyTripPreview: () => {
                syncSelectionCompanyTripPreview().catch(() => null);
            },
            applyStationSelectionStyle,
            updateSelectedStationCurrentPopup,
            applyTransferStationLabelCollapse,
            updateSelectedStationLabelClass,
            updateMultiSelectStationLabelChips,
            syncLineHighlightIdentityLabels,
            scheduleSelectionLayerRefresh,
            updateSelectionBadge
        },
        emitBaseHighlightCleared: baseHighlightEventBridge.clear,
        emitBaseHighlightUpdated: baseHighlightEventBridge.update,
        getBaseMultiSelectedLineIds,
        getEnabledLineIdsByCompany: () => enabledLineIdsByCompany,
        getSelectionSnapshot: () => ({
            selectedCompany,
            selectedLineId,
            selectedStationLineIds,
            selectedStationId
        }),
        isMultiSelectModeEnabled,
        requestFrame: (callback) => requestAnimationFrame(callback)
    });
    const applySelectionEffects = () => selectionEffectsController.apply();

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

    const settingsMenuContentEl = createSettingsMenu({
        getIconCandidates,
        getPreferredCachedImageSrc,
        setImageElementFromCache
    });

    const panelHoverPreviewLifecycle = createPanelHoverPreviewLifecycle({
        getHoverFeature: () => hoverFeature
    });

    const markActiveSelectionLine = (lineId) => {
        if (!menu || typeof menu.markActive !== 'function') return;
        const el = menu.wrapper?.querySelector(`.RW-line-content[data-line-id="${cssEscape(lineId)}"]`);
        if (el) menu.markActive(el);
    };

    const panelSelectionCallbacks = createPanelSearchSelectionCallbacks({
        clearSelection: (options) => appStore.dispatch(selectionClear(options)),
        closeOnRestore: true,
        fitToCurrentSelection,
        getLineCompany: (lineId) => lineCompanyById.get(String(lineId)),
        getSelectedStationId: () => selectedStationId,
        hoverLifecycle: panelHoverPreviewLifecycle,
        isMenuThroughLineId,
        isMultiSelectModeEnabled,
        markActiveLine: markActiveSelectionLine,
        previewMenuThroughLine,
        resolveLineSelection: resolveLineSelectionForApp,
        searchFeature,
        setIsolateStationsToSelectedLine: (enabled) => {
            isolateStationsToSelectedLine = enabled === true;
        },
        setStationLabelMode,
        sourcePrefix: 'panel-'
    });

    panel = createPanel({
        panelPresentation: isMobileUiMode() ? 'mobile' : 'desktop',
        hoverDelayMs: 50,
        settingsContentEl: settingsMenuContentEl,
        companyLogoMap,
        railwaysOrderIndex,
        getHoverPreviewEnabled: () => isHoverPreviewEnabled(),
        getMultiSelectModeEnabled: () => isMultiSelectModeEnabled(),
        getTimetableViewMode: () => readTimetableViewMode(),
        onTimetableViewModeChanged: (mode) => writeTimetableViewMode(mode),
        getLineMeta: (lineId) => {
            const id = String(lineId);
            return {
                company: lineCompanyById.get(id) || null,
                name: lineNameById.get(id) || id,
                color: resolveRailColorForTheme(lineColorById.get(id) || null) || null
            };
        },
        onSelectCompany: panelSelectionCallbacks.onSelectCompany,
        onSelectLine: panelSelectionCallbacks.onSelectLine,
        onRestoreStationLines: panelSelectionCallbacks.onRestoreStationLines,
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
        onTripDetailStationJump: (payload) => {
            jumpToPanelStation(payload).catch(() => null);
        },
        onDirPreviewEnter: (payload) => {
            if (isMultiSelectModeEnabled()) return;
            previewDirHeader(payload);
        },
        onDirPreviewLeave: () => {
            clearDirHeaderPreview();
        },
        onAndroidBackPanelHidden: clearSelectionsAndRestore
    });
    const handleRouteMapBackIntent = (payload = {}) => {
        const detail = {
            ...payload,
            handled: false
        };
        try {
            window.dispatchEvent(new CustomEvent('__TokyoRailRouteMapBackIntent', { detail }));
        } catch {
            return false;
        }
        if (detail.handled !== true) return false;
        clearSelectionsAndRestore();
        return true;
    };
    const handleJourneyBackIntent = (payload = {}) => {
        try {
            if (window?.TokyoRailJourneyUI?.handleMobileBackIntent?.(payload) === true) return true;
        } catch {
            return false;
        }
        return false;
    };
    installAndroidBackRuntime({
        handleBackIntent: (payload) => (
            handleRouteMapBackIntent(payload)
            || handleJourneyBackIntent(payload)
            || panel?.handlePanelBackIntent?.(payload) === true
        )
    });

    const getStationLabelBelowIds = () => {
        const ids = [];
        const fixedId = String(fixedPopupStationId ?? '').trim();
        if (fixedId) ids.push(fixedId);
        for (const sid of journeyPickPinnedStationIds.values()) {
            const id = String(sid ?? '').trim();
            if (id && !ids.includes(id)) ids.push(id);
        }
        return ids;
    };

    const getCollisionPinnedStationIds = () => {
        const ids = [];
        const selectedId = String(selectedStationId ?? '').trim();
        if (selectedId) ids.push(selectedId);
        for (const id of getStationLabelBelowIds()) {
            if (id && !ids.includes(id)) ids.push(id);
        }
        return ids.length ? ids : null;
    };

    const applyStationLabelPositionOverrides = () => {
        if (!Array.isArray(stationLabels) || !stationLabels.length) return;

        for (const label of stationLabels) {
            label.labelPosition = null;
            label.labelBelowPadPx = null;
            const dy = Number.isFinite(label.labelDyPx) ? label.labelDyPx : 0;
            label.el.style.translate = `0 -${dy}px`;
        }

        const belowIds = getStationLabelBelowIds();
        for (const stationId of belowIds) {
            const pinned = stationLabels.find((x) => x && String(x.stationId) === stationId);
            if (!pinned) continue;

            const pad = pinned.priority > 1 ? 6 : 4;
            pinned.labelPosition = 'below';
            pinned.labelBelowPadPx = pad;
            pinned.el.style.translate = `0 calc(100% + ${pad}px)`;
        }

        applyTransferStationLabelCollapse();
        scheduleCollisionLayerRefresh();
    };

    const setFixedPopupStationLabelBelow = (stationId) => {
        fixedPopupStationId = stationId != null ? String(stationId) : null;
        applyStationLabelPositionOverrides();
    };

    const hideStationPopupForMenuInteraction = ({ preserveHoverPreview = false } = {}) => {
        if (!stationPopup || typeof stationPopup.getOpenMode !== 'function') return;
        const mode = stationPopup.getOpenMode();
        if (!mode) return;

        if (!preserveHoverPreview) hoverFeature?.resetPreview();
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

    hoverFeature = createHoverFeature({
        store: appStore,
        initialEnabled: hoverPreviewEnabled,
        canRunHoverPreviewAtCurrentZoom: () => canRunHoverPreviewAtCurrentZoom(),
        snapshotSelectionState,
        restoreSelectionState,
        applyHoverEnabled: (enabled) => {
            hoverPreviewEnabled = enabled !== false;
            panel?.setHoverPreviewEnabled?.(hoverPreviewEnabled);
            stationPopup?.setHoverPreviewEnabled?.(hoverPreviewEnabled);
        }
    });



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

    const findStationPropsById = (stationId) => {
        const id = String(stationId ?? '').trim();
        if (!id) return null;
        const features = Array.isArray(generatedStationsData?.features)
            ? generatedStationsData.features
            : [];
        for (const feature of features) {
            const props = feature?.properties || {};
            if (String(props?.id ?? '').trim() === id) return props;
        }
        return null;
    };

    const openPanelForStationWithAutoScroll = async (props, options = {}) => {
        const p = props || {};
        appStore.dispatch(panelOpenRequested({
            source: 'app.openPanelForStationWithAutoScroll',
            stationId: String(p?.id ?? '').trim() || null,
            autoScroll: options?.autoScroll !== false
        }));
        if (isMobileUiMode()) {
            mobileBottomNavController?.setActive?.('map', { emit: false });
        }
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

    const jumpToPanelStation = async ({
        adjustTime = true,
        arrivalTime = '',
        stationId = ''
    } = {}) => {
        const props = findStationPropsById(stationId);
        if (!props) return false;

        if (adjustTime !== false && arrivalTime) {
            panel?.setTimeOverride?.(arrivalTime, {
                notify: true,
                rerender: false,
                temporary: true
            });
        }

        if (!isMultiSelectModeEnabled()) {
            selectServingLinesForStation(props);
        }

        await openPanelForStationWithAutoScroll(props, { autoScroll: false });

        try {
            const ids = getServingLineIdsFromStationProps(props);
            timetableCache?.preloadRecursiveByLineIds?.(ids);
        } catch {
            // ignore
        }
        return true;
    };

    window.addEventListener('__TokyoRailPanelStationJump', (event) => {
        jumpToPanelStation(event?.detail || {}).catch(() => null);
    });

    const showRouteMapFloatingPanelForLine = (lineId) => {
        const id = String(lineId || '').trim();
        if (!id) return;
        const lineName = String(lineNameById.get(id) || id).trim() || id;
        try {
            window.dispatchEvent(new CustomEvent('__TokyoRailShowRouteMapPanel', {
                detail: {
                    lineId: id,
                    lineName,
                    placement: isMobileUiMode() ? 'mobile-panel' : 'panel'
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

    const hoverBridgeApi = {
        beginPreview: () => hoverFeature?.beginPreview() === true,
        endPreview: () => hoverFeature?.closePreview({ committed: false }),
        commitPreview: () => hoverFeature?.commitPreview(),
        getPreviewStatus: () => hoverFeature?.getPreviewStatus?.() || null
    };
    hoverBridgeApi.beginHoverPreview = hoverBridgeApi.beginPreview;
    hoverBridgeApi.endHoverPreview = hoverBridgeApi.endPreview;
    hoverBridgeApi.commitHoverPreview = hoverBridgeApi.commitPreview;

    const routePreviewBridgeApi = createRoutePreviewBridgeApi({
        previewTripPath: (payload, options) => previewTripPath(payload, options),
        clearTripPathPreview: (options) => clearTripPathPreview(options),
        isMultiSelectModeEnabled
    });

    const journeyPickBridgeApi = {
        showJourneyPickPin: async (payload = {}) => {
            await travelSearchMapRuntime?.showJourneyPickPin?.(payload || {});
        },
        clearJourneyPickPin: (type) => {
            travelSearchMapRuntime?.clearJourneyPickPin?.(type);
        },
        onMapPickClick: (listener) => {
            if (typeof listener !== 'function') return false;
            mapEngine.on('click', listener);
            return true;
        }
    };

    const reachableStopsBridgeApi = {
        updateReachableStopsOverlay: async (payload = {}) => {
            await travelSearchMapRuntime?.updateReachableStopsOverlay?.(payload || {});
        },
        clearReachableStopsOverlay: () => {
            travelSearchMapRuntime?.clearReachableStopsOverlay?.();
        }
    };

    const searchSelectionController = createSearchSelectionController({
        store: appStore,
        searchFeature,
        hoverApi: hoverBridgeApi,
        hoverFeature,
        resolveLineSelection: resolveLineSelectionForApp,
        getSelectionState: () => ({
            selectedCompany,
            selectedLineId,
            selectedServiceMode
        }),
        isMultiSelectModeEnabled,
        getBaseMultiSelectedLineIds,
        toggleBaseMultiSelection,
        setStationLabelMode,
        setIsolateStationsToSelectedLine: (enabled) => {
            isolateStationsToSelectedLine = enabled === true;
        },
        applySelectionEffects,
        fitToCurrentSelection,
        hideStationPopupForMenuInteraction,
        showRouteMapFloatingPanelForLine,
        markActiveLine: (lineId) => {
            if (!menu || typeof menu.markActive !== 'function') return;
            const el = menu.wrapper?.querySelector(`.RW-line-content[data-line-id="${cssEscape(lineId)}"]`);
            if (el) menu.markActive(el);
        },
        markActiveCompany: (companyName) => {
            if (!menu || typeof menu.markActive !== 'function') return;
            const companyEls = menu.wrapper?.querySelectorAll?.('.RW-company-content') || [];
            for (const el of companyEls) {
                const n = el?.querySelector?.('.RW-company-name')?.textContent?.trim();
                if (n === companyName) {
                    menu.markActive(el);
                    break;
                }
            }
        },
        findStationLabelItemById,
        selectPlatformLinesForStation,
        fitToPointAsBounds,
        openPanelForStationWithAutoScroll,
        getServingLineIdsFromStationProps,
        preloadTimetablesByLineIds: (ids) => timetableCache?.preloadRecursiveByLineIds?.(ids),
        closeStationPopup: (options) => stationPopup?.closePopup?.(options),
        setFixedPopupStationLabelBelow
    });

    const markActiveMenuLine = (lineId) => {
        if (!menu || typeof menu.markActive !== 'function') return;
        const el = menu.wrapper?.querySelector(`.RW-line-content[data-line-id="${cssEscape(lineId)}"]`);
        if (el) menu.markActive(el);
    };

    const preloadTimetablesForLineIds = (ids) => {
        timetableCache?.preloadRecursiveByLineIds?.(ids);
    };

    if (searchMapActions) {
        Object.assign(searchMapActions, createSearchMapBridge({
            hoverApi: hoverBridgeApi,
            journeyPickApi: journeyPickBridgeApi,
            multiSelectApi: {
                isEnabled: () => isMultiSelectModeEnabled(),
                runLayerCommand: (action, itemId) => {
                    try {
                        return window.__TokyoRailMultiSelectLayerControl?.runCommand?.(action, itemId) === true;
                    } catch {
                        return false;
                    }
                }
            },
            reachableStopsApi: reachableStopsBridgeApi,
            routePreviewApi: routePreviewBridgeApi,
            selectionApi: searchSelectionController,
            stationApi: searchSelectionController,
            store: appStore,
            stateApi: {
                snapshotSelectionState,
                restoreSelectionState
            }
        }));
    }

    const bindLineAndBlankMapInteractions = () => {
        bindMapInteractions({
            blankClick: {
                mapEngine,
                store: appStore,
                touchTapGuard,
                isInFullscreenMode,
                isMultiSelectModeEnabled,
                hasActiveSelection: () => !!(
                    selectedCompany ||
                    selectedLineId ||
                    (selectedStationLineIds && selectedStationLineIds.size)
                ),
                hidePanel: () => panel?.hide?.(),
                clearTripPathPreview,
                clearSelectionsAndRestore
            },
            lineClick: {
                mapEngine,
                touchTapGuard,
                resolveLineSelection: resolveLineSelectionForApp,
                isMultiSelectModeEnabled,
                toggleBaseMultiSelection,
                getBaseMultiSelectedLineIds,
                setStationLabelMode,
                applySelectionEffects,
                commitLine: (lineId) => searchFeature.commitLine(lineId),
                markActiveLine: markActiveMenuLine,
                fitToCurrentSelection,
                showRouteMapFloatingPanelForLine
            }
        });
    };

    const bindStationMapInteractions = () => {
        bindMapInteractions({
            stationClick: {
                mapEngine,
                touchTapGuard,
                isJourneyMapPickActive,
                isMultiSelectModeEnabled,
                getSelectedStationId: () => selectedStationId,
                selectServingLinesForStation,
                openPanelForStationWithAutoScroll,
                getServingLineIdsFromStationProps,
                preloadTimetablesByLineIds: preloadTimetablesForLineIds
            }
        });
    };

    const settingsControlsRuntime = mountAppSettingsControls({
        hostEl: settingsMenuContentEl,
        basemapThemeRuntime,
        electronApi: window?.TokyoRailElectron,
        getIconCandidates,
        getPreferredCachedImageSrc,
        onAdaptiveViewportEnabledChanged: applyAdaptiveViewportEnabled,
        onHoverPreviewEnabledChanged: applyHoverPreviewEnabled,
        onLineNameLabelsEnabledChanged: applyLineNameLabelsEnabled,
        onStationLabelModeChanged: (mode) => {
            stationLabelMode = mode;
        },
        onStationLabelUserModeChanged: () => {
            scheduleCollisionLayerRefresh();
        },
        onStationOffsetModeChanged: applyStationOffsetMode,
        onThemeChanged: () => {
            applyStationThemePaintToMapLayers();
            applySelectionEffects();
        },
        setImageElementFromCache,
        stationLabelMode
    });
    if (settingsControlsRuntime.hoverPreviewToggleController) {
        hoverPreviewToggleController = settingsControlsRuntime.hoverPreviewToggleController;
    }
    if (settingsControlsRuntime.setStationLabelMode) {
        setStationLabelMode = settingsControlsRuntime.setStationLabelMode;
    }

    bindMultiSelectModeEvents({
        target: window,
        getInitialEnabled: () => multiSelectModeEnabled,
        resetEnabledState: (enabled) => {
            multiSelectModeEnabled = enabled === true;
        },
        applyEnabled: applyMultiSelectModeState,
        onShowIconsChanged: applySelectionEffects
    });

    try {
        const {
            linesGeoJSON,
            linesGeoJSONByZoom,
            lineNameLabelsGeoJSON,
            lineRoutingCoordsById,
            stationsGeoJSON,
            rawRailways,
            rawStations,
            stationOffsetAlgorithmContext,
            diagnostics
        } = await loadRailGeoDataFromDataFolder();
        generatedLinesData = linesGeoJSON;
        generatedLineNameLabelsData = lineNameLabelsGeoJSON;
        generatedStationsData = stationsGeoJSON;
        generatedRawRailways = rawRailways;
        generatedRawStations = rawStations;
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
        addLinesLayer(mapEngine, linesData);




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

        const buildProjectedSubchain = (chain, fromProj, toProj, options = {}) => {
            if (!Array.isArray(chain) || chain.length < 2 || !fromProj?.point || !toProj?.point) return null;

            const i = Number(fromProj.segIndex);
            const j = Number(toProj.segIndex);
            if (!Number.isFinite(i) || !Number.isFinite(j) || i < 0 || j < 0) return null;

            if (
                options?.preserveLineDirection === true
                && (i > j || (i === j && Number(fromProj.t) > Number(toProj.t)))
            ) {
                return buildProjectedSubchain(chain, toProj, fromProj, { preserveLineDirection: false });
            }

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
                        direction: options?.direction,
                        preserveLineDirection: options?.preserveLineDirection === true
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
                    const seg = buildProjectedSubchain(chain, a, b, {
                        preserveLineDirection: options?.preserveLineDirection === true
                    });
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

        const routePreviewViewport = createRoutePreviewViewportController({
            mapEngine,
            isAdaptiveViewportEnabled,
            getMenuElement: () => menu?.wrapper || null,
            getPanelElement: () => panel?.el || null,
            getTripDetailElement: () => document.querySelector('[data-panel-trip-detail]'),
            getSelectedLineId: () => selectedLineId,
            getSelectedStationLineIds: () => selectedStationLineIds,
            getSelectedCompany: () => selectedCompany,
            getEnabledLineIdsByCompany: () => enabledLineIdsByCompany,
            getStationCoord: (stationId) => stationCoordByIdBase.get(stationId) || stationCoordById.get(stationId)
        });

        const routeEndpointPopups = createRouteEndpointPopupRuntime({
            mapEngine,
            getStationCoord: (stationId) => stationCoordByIdBase.get(stationId) || stationCoordById.get(stationId),
            getIsDarkTheme: () => document.documentElement.getAttribute('data-theme') === 'dark'
        });

        const routePreviewController = createRoutePreviewRuntimeController({
            tripPreviewBuilderOptions: {
                stationCoordByIdBase,
                stationCoordById,
                stationServingCountById,
                lineColorById,
                throughServiceConfigsObject: THROUGH_SERVICE_CONFIGS_OBJECT,
                resolveRailColorForTheme,
                isLineTerminalStation,
                isSamePhysicalStation,
                isLoopDirection,
                extractLineSegment,
                nearestBridgeBetweenLines,
                getLineOffsetUnits: (lineId) => {
                    const id = String(lineId || '').trim();
                    if (!id || !lineOffsetUnitsById.has(id)) return 0;
                    const units = Number(lineOffsetUnitsById.get(id));
                    return Number.isFinite(units) ? units : 0;
                },
                distMeters,
                extendBBox,
                isDebugLoopEnabled: () => {
                    try {
                        return globalThis?.__TokyoRailDebugLoopSlice === true;
                    } catch {
                        return false;
                    }
                }
            },
            routeFeature,
            store: appStore,
            isMultiSelectModeEnabled,
            resolveTripPreviewStationOverrideColor,
            getBaseMultiSelectedLineIds,
            applyTripPreviewState: ({
                active,
                source,
                stationOverrideColor,
                stationIds,
                lineIds
            } = {}) => {
                tripPreviewActive = !!active;
                if (source !== undefined) tripPreviewActiveSource = String(source || '');
                tripPreviewStationOverrideColor = String(stationOverrideColor || '');
                tripPreviewStationIds = stationIds || null;
                tripPreviewLineIds = lineIds || null;
            },
            applyTripPreviewInactiveState: () => {
                tripPreviewActive = false;
                tripPreviewActiveSource = '';
                tripPreviewStationIds = null;
                tripPreviewLineIds = null;
                tripPreviewStationOverrideColor = '';
            },
            getTripPreviewActiveSource: () => tripPreviewActiveSource,
            endpointPopups: routeEndpointPopups,
            syncStationOffsetForTripPreviewState,
            setStationLabelMode,
            applySelectionEffects,
            scheduleCollisionLayerRefresh,
            viewportController: routePreviewViewport,
            emitMultiSelectLayersUpdated,
            isDirPreviewActive: () => dirPreviewActive,
            applyDirPreviewState: ({
                active,
                lineIds,
                stationIds
            } = {}) => {
                dirPreviewActive = !!active;
                dirPreviewLineIds = lineIds || null;
                dirPreviewStationIds = stationIds || null;
            },
            applyDirPreviewInactiveState: () => {
                dirPreviewActive = false;
                dirPreviewLineIds = null;
                dirPreviewStationIds = null;
            }
        });

        clearTripPathPreview = routePreviewController.clearTripPathPreview;
        previewTripPath = routePreviewController.previewTripPath;
        clearDirHeaderPreview = routePreviewController.clearDirHeaderPreview;
        previewDirHeader = routePreviewController.previewDirHeader;
        const toggleTripPreviewSelectionVisibility = routePreviewController.toggleTripPreviewSelectionVisibility;
        const removeTripPreviewSelection = routePreviewController.removeTripPreviewSelection;
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
                        scheduleCollisionLayerRefresh();
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
                        scheduleCollisionLayerRefresh();
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
                        scheduleCollisionLayerRefresh();
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

        bindMultiSelectLayerCommandRuntime({
            target: window,
            emitLayersUpdated: emitMultiSelectLayersUpdated,
            runCommand: runMultiSelectLayersCommand
        });

        const companyObj = {};
        const linesObj = {};
        lineSelectionLinesObj = linesObj;
        enabledLineIdsByCompany = new Map();

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

        for (const f of lineFeatures) {
            const lineId = f?.properties?.id ?? f?.id;
            if (!lineId) continue;
            lineFeatureById.set(String(lineId), f);

            const company = f?.properties?.company ?? '未知公司';
            const name = f?.properties?.name ?? String(lineId);
            const color = f?.properties?.color;
            const lineOffsetUnits = Number(f?.properties?.line_offset_units);

            if (typeof color === 'string' && color.trim() && f?.properties && typeof f.properties === 'object') {
                f.properties._dark_color = resolveRailColorForTheme(color.trim(), { isDarkThemeActive: true });
            }

            lineCompanyById.set(String(lineId), String(company));

            lineNameById.set(String(lineId), String(name));
            if (typeof color === 'string' && color.trim()) lineColorById.set(String(lineId), color.trim());
            if (typeof color === 'string' && color.trim()) lineColorByName.set(String(name), color.trim());
            lineOffsetUnitsById.set(String(lineId), Number.isFinite(lineOffsetUnits) ? lineOffsetUnits : 0);

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
            routePreviewViewport.addLineBounds(lineId, f.geometry);
        }

        emitMultiSelectLayersUpdated();

        const fitToCurrentSelectionPreview = routePreviewViewport.fitToCurrentSelectionPreview;
        const fitToCurrentSelectionCommit = routePreviewViewport.fitToCurrentSelectionCommit;
        fitToCurrentSelection = routePreviewViewport.fitToCurrentSelection;

        // 旧的 #controls 容器不再作为侧边栏使用，清空避免视觉干扰
        const controlsEl = document.getElementById('controls');
        if (controlsEl) controlsEl.innerHTML = '';

        menuModel = buildMenuModel({
            companyObj,
            linesObj,
            companyLogoMap,
            railwaysOrderIndex,
            railwaysList: generatedRawRailways,
            stationsList: generatedRawStations
        });

        const menuActionHandlers = {
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
        };

        if (!isMobileUiMode()) {
            menu = new Menu({
                companyObj,
                linesObj,
                companyLogoMap,
                railwaysOrderIndex,
                logoBasePath: COMPANY_LOGO_BASE_PATH,
                hoverDelayMs: 500,
                ...menuActionHandlers
            });

            menu.mount(document.body);
            menu.setWrapperStyle();
            window.addEventListener('resize', () => menu.setWrapperStyle());

            lineHoverPopup = setupLineHoverPopup(mapEngine, {
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
        } else {
            mobileMenu = createMobileMenu({
                model: menuModel,
                onCompanyClick: (companyName, meta) => {
                    menuActionHandlers.onCompanyClick(companyName, meta);
                    mobileBottomNavController?.setActive?.('map', { emit: false });
                },
                onLineClick: (lineId, meta) => {
                    menuActionHandlers.onLineClick(lineId, meta);
                    mobileBottomNavController?.setActive?.('map', { emit: false });
                }
            });
            mobileMenu?.mount?.(document.body);
            if (mobileBottomNavController?.getActive?.() === 'menu') {
                mobileMenu?.open?.();
            }
        }

        bindLineAndBlankMapInteractions();

        // 全屏浏览按钮
        initFullscreen(mapEngine, touchTapGuard);

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

        addStationsLayer(mapEngine, stationsData);
        addStationLabelsLayer(mapEngine, buildStationLabelGeoJSON(stationsData));
        const lineNameLabelsData = generatedLineNameLabelsData || loadedGeoData?.lineNameLabelsGeoJSON || EMPTY_LINE_NAME_LABELS_DATA;
        generatedLineNameLabelsData = lineNameLabelsData;
        addLineNameLabelsLayer(mapEngine, lineNameLabelsData);
        applyLineNameLabelsEnabled(lineNameLabelsEnabled);

        try {
            transferCapsuleStationsData = stationsData;
            transferCapsuleStationGroups = await getCachedJson('./data/station-groups.json');
            transferCapsuleBaseConnectionOrder = buildTransferCapsuleConnectionOrder(stationsData, transferCapsuleStationGroups);
            invalidateAndScheduleTransferCapsules('__init__');
        } catch (e) {
            console.warn('换乘站 MST 胶囊渲染初始化失败', e);
        }


        bindStationMapInteractions();


        applySelectionEffects();

        const markers = createStationMarkers(mapEngine, stationsData, { attachMarkers: false });
        stationLabels = markers.stationLabels;
        const stationCircles = markers.stationCircles;
        stationLabelChipsAdapter = createStationLabelChipsAdapter({
            getLineColor: (lineId) => lineColorById.get(lineId),
            getTransferStationIds: (stationId) => transferStationIdsByStationId.get(String(stationId || '').trim()),
            resolveRailColor: resolveRailColorForTheme,
            stationLabels
        });

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
                travelSearchMapRuntime?.refreshReachableStopsOverlay?.(undefined, { fitBounds: false });
                travelSearchMapRuntime?.syncJourneyPickPinsToStations?.();
            } catch (e) {
                // ignore
            }
        };

        const stationCoordinateAdapter = createStationCoordinateAdapter({ stationLabels, stationCircles });
        const getViewportStationIdsForTransferCapsules = (stationsGeoJSON) => {
            let bounds = null;
            try {
                bounds = mapEngine.getBounds?.();
            } catch {
                bounds = null;
            }

            const west = Number(bounds?.getWest?.() ?? bounds?._sw?.lng);
            const east = Number(bounds?.getEast?.() ?? bounds?._ne?.lng);
            const south = Number(bounds?.getSouth?.() ?? bounds?._sw?.lat);
            const north = Number(bounds?.getNorth?.() ?? bounds?._ne?.lat);
            if (![west, east, south, north].every(Number.isFinite)) return null;

            const features = Array.isArray(stationsGeoJSON?.features) ? stationsGeoJSON.features : [];
            const out = new Set();
            for (const feature of features) {
                if (feature?.geometry?.type !== 'Point') continue;
                const c = feature?.geometry?.coordinates;
                if (!Array.isArray(c) || c.length < 2) continue;
                const lng = Number(c[0]);
                const lat = Number(c[1]);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
                if (lat < south || lat > north) continue;
                const inLngRange = west <= east
                    ? lng >= west && lng <= east
                    : (lng >= west || lng <= east);
                if (!inLngRange) continue;
                const sid = String(feature?.properties?.id ?? feature?.id ?? '').trim();
                if (sid) out.add(sid);
            }
            return out;
        };

        layerFeature = createLayerFeature({
            baseStationsGeoJSON: stationsData,
            stationOffsetAlgorithmContext,
            buildStationOffsetGeoJSONAtZoom,
            getZoom: () => mapEngine.getZoom(),
            updateStationsSourceData: (nextGeoJSON) => {
                try {
                    mapEngine.setSourceData('stations-source', nextGeoJSON);
                } catch {
                    // ignore
                }
            },
            updateStationLabelsSourceData: (nextGeoJSON) => {
                try {
                    mapEngine.setSourceData(STATION_LABELS_SOURCE_ID, buildStationLabelGeoJSON(nextGeoJSON));
                } catch {
                    // ignore
                }
            },
            updateStationLabelCoordinates: stationCoordinateAdapter.updateLabels,
            updateStationCircleCoordinates: stationCoordinateAdapter.updateCircles,
            rebuildStationCoordMap,
            syncTransferCapsuleStationsData: (nextGeoJSON) => {
                transferCapsuleStationsData = nextGeoJSON;
            },
            invalidateTransferCapsuleData: (keyHint) => {
                transferCapsuleVisibleKey = String(keyHint || '__station-geojson__');
            },
            getTransferCapsuleStationsData: () => transferCapsuleStationsData,
            getTransferCapsuleStationGroups: () => transferCapsuleStationGroups,
            getTransferCapsuleBaseConnectionOrder: () => transferCapsuleBaseConnectionOrder,
            getTransferCapsuleVisibleKey: () => transferCapsuleVisibleKey,
            setTransferCapsuleVisibleKey: (nextKey) => {
                transferCapsuleVisibleKey = String(nextKey || '__init__');
            },
            getViewportStationIdsForTransferCapsules,
            shouldUseFixedTransferCapsuleConnections,
            getFixedVisibleStationIdsForTransferCapsules,
            getVisibleStationIdsForTransferCapsules,
            toTransferCapsuleVisibleKey,
            buildTransferCapsuleGeoJSON: (stationsGeoJSON, stationGroups, options = {}) => {
                const injection = buildPreviewVirtualStationInjectionForCapsules({
                    stationsGeoJSON,
                    stationGroups,
                    visibleStationIds: options.visibleStationIds
                });
                return buildTransferCapsuleGeoJSON(
                    injection?.stationsData || stationsGeoJSON,
                    injection?.stationGroups || stationGroups,
                    {
                        ...options,
                        visibleStationIds: injection?.visibleStationIds || options.visibleStationIds
                    }
                );
            },
            renderTransferCapsules: (transferCapsuleData) => {
                addTransferCapsuleLayers(mapEngine, transferCapsuleData, {
                    beforeLayerId: 'stations-layer',
                    minZoom: 8,
                    highlightStyle: shouldUseHighlightStyle()
                });
            },
            resolveTransferCapsuleLineColor: (lineId) => {
                const id = String(lineId || '').trim();
                if (!id) return '';
                return resolveRailColorForTheme(lineColorById.get(id) || '') || '';
            },
            createCollisionController: (labels, circles, options) => setupCollisions(mapEngine, labels, circles, options),
            createStationOffsetRuntimeController: (options) => createStationOffsetRuntimeController({
                ...options,
                mapEngine
            }),
            getStationLabelMode: () => stationLabelMode,
            initialStationOffsetMode: stationOffsetMode,
            collisionConfig: {
                transferGroupByStationId: transferStationIdsByStationId,
                onCircleCollisionResolved: ({ visibleStationIds }) => {
                    collisionVisibleStationIds = visibleStationIds instanceof Set ? new Set(visibleStationIds) : null;
                },
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

                    const reachableStopsLabelIds = travelSearchMapRuntime?.getReachableStopsLabelIds?.() || null;
                    if (!(reachableStopsLabelIds instanceof Set)) return baseVisible;
                    if (!(baseVisible instanceof Set)) return reachableStopsLabelIds;

                    const intersect = new Set();
                    for (const rawId of baseVisible) {
                        const sid = String(rawId || '').trim();
                        if (sid && reachableStopsLabelIds.has(sid)) intersect.add(sid);
                    }
                    return intersect;
                },
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

                getPinnedStationId: getCollisionPinnedStationIds,
                shouldHideStation: (stationLike) => {
                    if (!shouldApplyBaseLayerHiddenFilter()) return false;
                    const sid = String(stationLike?.stationId || '').trim();
                    if (!sid) return false;
                    return isBaseLayerHiddenStationId(sid);
                },
                lineFilterTarget: 'labels'
            }
        });

        const syncStationOffsetForZoom = (zoom) => {
            layerFeature?.syncStationOffsetForZoom?.(zoom);
        };

        syncStationOffsetForTripPreviewState = () => {
            layerFeature?.syncStationOffsetForTripPreviewState?.({ tripPreviewActive });
        };



        applyTransferStationLabelCollapse();
        updateMultiSelectStationLabelChips();

        layerFeature.setupCollisionController({ stationLabels, stationCircles });

        scheduleCollisionLayerRefresh();

        registerTokyoRailMapRuntime({
            map,
            mapEngine,
            buildOffsetPolylinePixelsWithMiter,
            getLineOffsetPixelsPerUnitAtZoom,
            getStationOffsetGeoJSONAtZoom: (zoom) => buildStationOffsetGeoJSONAtZoom({
                baseStationsGeoJSON: stationsData,
                stationOffsetAlgorithmContext,
                zoom
            })
        });

        layerFeature.bindStationOffsetRuntime({ initialMode: stationOffsetMode });
        


        applySelectionEffects();

        const popupSelectionCallbacks = createPanelSearchSelectionCallbacks({
            clearSelection: (options) => appStore.dispatch(selectionClear(options)),
            fitOnSelect: false,
            getLineCompany: (lineId) => lineCompanyById.get(String(lineId)),
            getSelectedStationId: () => fixedPopupStationId || selectedStationId,
            hoverLifecycle: {
                beginIfNeeded: (source) => {
                    if (source !== 'popup-hover') return true;
                    return hoverFeature?.beginPreview?.() === true;
                },
                commitIfNeeded: (source) => {
                    if (source === 'popup-hover') return;
                    hoverFeature?.commitPreview?.();
                },
                getFitMode: (source) => source === 'popup-hover' ? 'preview' : 'commit',
                isHover: (source) => source === 'popup-hover'
            },
            isMenuThroughLineId,
            isMultiSelectModeEnabled,
            markActiveLine: markActiveSelectionLine,
            previewMenuThroughLine,
            resolveLineSelection: resolveLineSelectionForApp,
            resetLabelOnRestore: false,
            searchFeature,
            setIsolateStationsToSelectedLine: (enabled) => {
                isolateStationsToSelectedLine = enabled === true;
            },
            setStationLabelMode,
            sourcePrefix: 'popup-'
        });

        stationPopup = setupStationPopup(mapEngine, {

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
            onSelectCompany: popupSelectionCallbacks.onSelectCompany,
            onSelectLine: popupSelectionCallbacks.onSelectLine,
            onRestoreStationLines: popupSelectionCallbacks.onRestoreStationLines,
            onFixedPopupBlankClick: () => {
                // 固定 popup：点击空白处直接恢复“全显示”，且不触发预览快照回滚
                hoverFeature?.commitPreview();
                clearSelectionsAndRestore();
            },
            onPopupClose: ({ committed }) => {
                hoverFeature?.closePreview({ committed });
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
            const labelLongPressMs = 510;
            const labelLongPressMoveTolerancePx = 12;

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

                let labelLongPressTimer = null;
                let labelLongPressPointerId = null;
                let labelLongPressStartPoint = null;
                let labelLongPressFired = false;
                let labelLongPressShown = false;

                const clearLabelLongPressTimer = () => {
                    if (labelLongPressTimer != null) {
                        clearTimeout(labelLongPressTimer);
                        labelLongPressTimer = null;
                    }
                };

                const resetLabelLongPress = () => {
                    clearLabelLongPressTimer();
                    labelLongPressPointerId = null;
                    labelLongPressStartPoint = null;
                    labelLongPressFired = false;
                    labelLongPressShown = false;
                };

                const pointFromLabelEvent = (evt) => {
                    const x = Number(evt?.clientX);
                    const y = Number(evt?.clientY);
                    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                    return { x, y };
                };

                const startLabelLongPress = (evt, pt) => {
                    resetLabelLongPress();
                    labelLongPressPointerId = evt?.pointerId ?? null;
                    labelLongPressStartPoint = pointFromLabelEvent(evt);
                    labelLongPressTimer = window.setTimeout(() => {
                        labelLongPressTimer = null;
                        if (isJourneyMapPickActive()) return;
                        if (item?.forceHiddenByTransferCollapse) return;
                        labelLongPressFired = true;
                        void stationPopup?.showTouchHoverPopupAt?.(item.coordinates, item.props || {}, {
                            pointerType: pt,
                            isStillActive: () => labelLongPressFired === true
                        }).then((shown) => {
                            labelLongPressShown = shown === true;
                        });
                    }, labelLongPressMs);
                };

                const cancelLabelLongPressOnMove = (evt) => {
                    if (labelLongPressPointerId != null && evt?.pointerId !== labelLongPressPointerId) return;
                    if (!labelLongPressStartPoint) return;
                    const point = pointFromLabelEvent(evt);
                    if (!point) return;
                    const dx = point.x - labelLongPressStartPoint.x;
                    const dy = point.y - labelLongPressStartPoint.y;
                    if ((dx * dx + dy * dy) > (labelLongPressMoveTolerancePx * labelLongPressMoveTolerancePx)) {
                        stationPopup?.hideTouchHoverPopup?.({ pointerId: evt?.pointerId });
                        resetLabelLongPress();
                    }
                };

                const finishLabelLongPress = (evt) => {
                    const wasLongPress = labelLongPressFired === true || labelLongPressShown === true;
                    clearLabelLongPressTimer();
                    stationPopup?.hideTouchHoverPopup?.({ pointerId: evt?.pointerId });
                    resetLabelLongPress();
                    return wasLongPress;
                };

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
                        startLabelLongPress(evt, pt);
                    },
                    { passive: false }
                );

                el.addEventListener(
                    'pointermove',
                    (evt) => {
                        const pt = readPointerType(evt);
                        if (!isTouchLike(pt)) return;
                        cancelLabelLongPressOnMove(evt);
                    },
                    { passive: true }
                );

                el.addEventListener(
                    'pointerup',
                    (evt) => {
                        const pt = readPointerType(evt);
                        if (!isTouchLike(pt)) return;
                        stop(evt);
                        if (finishLabelLongPress(evt)) return;
                        if (!touchTapGuard.allowTap(evt)) return;
                        fireStationLabelTap(item, pt);
                    },
                    { passive: false }
                );

                el.addEventListener(
                    'pointercancel',
                    (evt) => {
                        const pt = readPointerType(evt);
                        if (!isTouchLike(pt)) return;
                        stationPopup?.hideTouchHoverPopup?.({ pointerId: evt?.pointerId });
                        resetLabelLongPress();
                    },
                    { passive: true }
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

        basemapThemeRuntime.ensureBasemapLayers();
        basemapThemeRuntime.applyBasemapTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    } catch (e) {
        console.error('站点加载失败', e);
    }
};

bindMapStartup({
    map,
    mapEngine,
    start: () => initMapApp(),
    onError: (e) => {
        console.error('Map initialization failed', e);
    }
});


registerDebugZoomTools({ map, mapEngine });
