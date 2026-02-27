import { loadRailGeoDataFromDataFolder } from './data.js';
import { addLinesLayer, addStationsLayer, setupLineHoverPopup, setupStationPopup } from './layers.js';
import { createStationMarkers } from './labels.js';
import { setupCollisions } from './collision.js';
import { Menu } from './menu.js';
import { getGlobalTouchTapGuard } from './touchTapGuard.js';
import { createPanel } from './panel.js';
import { getGlobalTimetableCache } from './timetableCache.js';
import { initFullscreen, isInFullscreenMode } from './fullscreen.js';

// MapLibre 通过 CDN 以全局变量方式引入
const maplibregl = window.maplibregl;

if (!maplibregl) {
    throw new Error('MapLibre GL JS 未加载：请检查 maplibre-gl.js 引入是否成功');
}
const APPEARANCE_STORAGE_KEY = 'tokyorail.appearance.mode';
const TIMETABLE_VIEW_STORAGE_KEY = 'tokyorail.timetable.view.mode';
const HOVER_PREVIEW_STORAGE_KEY = 'tokyorail.hover.preview.enabled';
const MULTI_SELECT_EVENT = '__TokyoRailMultiSelectModeChanged';
const MULTI_SELECT_LAYERS_EVENT = '__TokyoRailMultiSelectLayersUpdated';
const MULTI_SELECT_LAYERS_COMMAND_EVENT = '__TokyoRailMultiSelectLayersCommand';
const HOVER_PREVIEW_MIN_ZOOM = 10;
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

// /data/railways-order.json: [{ "jreast-yamanote": "1037" }, ...]
// 我们只需要其“数组顺序”，用于 UI 中同公司线路排序。
const loadRailwaysOrderIndex = (() => {
    let promise = null;
    return async () => {
        if (promise) return promise;
        promise = (async () => {
            try {
                const resp = await fetch('./data/railways-order.json');
                if (!resp.ok) return new Map();
                const list = await resp.json();
                const arr = Array.isArray(list) ? list : [];
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

const initialTheme = resolveThemeFromAppearance(readAppearanceMode());
document.documentElement.setAttribute('data-theme', initialTheme);
let mapMode = initialTheme;

// 1) 初始化地图（底图使用 Carto raster tiles）
const map = new maplibregl.Map({
    container: 'map',
    center: [139.767, 35.681],
    zoom: 11,
    style: {
        version: 8,
        sources: {
            'carto-light-source': {
                type: 'raster',
                tiles: [
                    'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                    'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                    'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                    'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
                ],
                tileSize: 256,
                attribution: '&copy; <a href="https://carto.com/">Carto</a>'
            },
            'carto-dark-source': {
                type: 'raster',
                tiles: [
                    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                    'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                    'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                    'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
                ],
                tileSize: 256,
                attribution: '&copy; <a href="https://carto.com/">Carto</a>'
            }
        },
        layers: [
            {
                id: 'carto-light-layer',
                type: 'raster',
                source: 'carto-light-source',
                layout: { visibility: mapMode === 'light' ? 'visible' : 'none' },
                minzoom: 0,
                paint: {}
            },
            {
                id: 'carto-dark-layer',
                type: 'raster',
                source: 'carto-dark-source',
                layout: { visibility: mapMode === 'dark' ? 'visible' : 'none' },
                minzoom: 0,
                paint: {}
            }
        ]
    }
});

// 暴露给 print.js：用于导出 trip-preview 的 SVG（避免 print.js import app.js 导致重复初始化）
try {
    window.__TokyoRailMap = map;
} catch {
    // ignore
}

const applyBasemapTheme = (theme) => {
    const next = theme === 'dark' ? 'dark' : 'light';
    mapMode = next;
    const lightVisibility = next === 'light' ? 'visible' : 'none';
    const darkVisibility = next === 'dark' ? 'visible' : 'none';

    try {
        if (map.getLayer('carto-light-layer')) map.setLayoutProperty('carto-light-layer', 'visibility', lightVisibility);
        if (map.getLayer('carto-dark-layer')) map.setLayoutProperty('carto-dark-layer', 'visibility', darkVisibility);
    } catch {
        // ignore
    }
};

// 左下角比例尺
map.addControl(
    new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
    'bottom-left'
);

// 2) 底图加载完成后再加载业务数据与图层
map.on('load', async () => {
    //console.log('底图加载完毕，准备加载 GeoJSON...');

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
    applyBasemapTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

    const railwaysOrderIndex = await loadRailwaysOrderIndex();

    // 触屏防误触：仅短按且几乎不移动才视为 tap
    const touchTapGuard = getGlobalTouchTapGuard({ maxDurationMs: 500, maxMovePx: 12 });

    let collisionController = null;
    let menu = null;
    let selectedCompany = null;
    let selectedLineId = null;
    let selectedStationLineIds = null; // Set<string>：点击站点/站名后高亮其 serving_lines
    let selectedStationId = null; // 点击站点高亮时，仅高亮该站点
    let selectedServiceMode = 'all';
    let isolateStationsToSelectedLine = false; // 仅用于“popup 提交线路”：隐藏非该线路站点
    let stationLabelMode = 'auto'; // 'off' | 'auto' | 'all'
    let setStationLabelMode = (_mode) => false;
    // mode: 'preview' | 'commit'
    let fitToCurrentSelection = (_triggerKey, _mode = 'preview') => {};
    let enabledLineIdsByCompany = new Map();
    let stationPopup = null;
    let lineHoverPopup = null;
    let stationLabels = [];
    let fixedPopupStationId = null;
    let transferStationIdsByStationId = new Map();
    let previewTripPath = (_payload) => {};
    let clearTripPathPreview = () => {};
    let tripPreviewStationIds = null; // Set<string> | null
    let tripPreviewLineIds = null; // Set<string> | null
    let tripPreviewActive = false;
    let tripPreviewOriginPopup = null;
    let tripPreviewTerminalPopup = null;
    let tripCurrentStationPopup = null;
    let tripDetailStationTriangleMarker = null;
    let tripPreviewSelectionsByKey = new Map(); // key -> { payload, built, hidden?:boolean }
    let baseMultiSelectionsByKey = new Map(); // key -> { kind, lineIds:Set<string>, hidden?:boolean }
    let dirPreviewActive = false;
    let dirPreviewLineIds = null; // Set<string> | null
    let dirPreviewStationIds = null; // Set<string> | null
    let dirPreviewOriginPopups = [];
    let dirPreviewTerminalPopups = [];
    let previewDirHeader = (_payload) => {};
    let clearDirHeaderPreview = () => {};
    let hoverPreviewEnabled = readHoverPreviewEnabled();
    let multiSelectModeEnabled = window.__TokyoRailMultiSelectEnabled === true;
    let hoverPreviewEnabledBeforeMultiSelect = hoverPreviewEnabled;
    let hoverPreviewToggleController = {
        setEnabled: () => {},
        setDisabled: () => {}
    };
    let stationCoordById = new Map();
    let stationServingCountById = new Map();

    // 右侧界面：站点/站名/搜索提交站点时弹出（在 applySelectionEffects 定义后初始化）
    let panel = null;

    const isHoverPreviewEnabled = () => hoverPreviewEnabled !== false;
    const applyHoverPreviewEnabled = (enabled) => {
        hoverPreviewEnabled = enabled !== false;
        panel?.setHoverPreviewEnabled?.(hoverPreviewEnabled);
        stationPopup?.setHoverPreviewEnabled?.(hoverPreviewEnabled);
    };

    const isMultiSelectModeEnabled = () => multiSelectModeEnabled === true;

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

    const toggleBaseMultiSelection = (key, lineIds, kind = 'line') => {
        const k = String(key || '').trim();
        const ids = Array.isArray(lineIds)
            ? lineIds.map((x) => String(x || '').trim()).filter(Boolean)
            : [];
        if (!k || !ids.length) return false;
        if (baseMultiSelectionsByKey.has(k)) {
            baseMultiSelectionsByKey.delete(k);
            emitMultiSelectLayersUpdated();
            return false;
        }
        baseMultiSelectionsByKey.set(k, {
            kind: String(kind || 'line').trim() || 'line',
            lineIds: new Set(ids),
            hidden: false
        });
        emitMultiSelectLayersUpdated();
        return true;
    };

    const toggleBaseMultiSelectionVisibility = (key) => {
        const k = String(key || '').trim();
        if (!k || !baseMultiSelectionsByKey.has(k)) return false;
        const current = baseMultiSelectionsByKey.get(k) || {};
        const next = {
            ...current,
            hidden: !(current?.hidden === true)
        };
        baseMultiSelectionsByKey.set(k, next);
        emitMultiSelectLayersUpdated();
        return true;
    };

    const removeBaseMultiSelection = (key) => {
        const k = String(key || '').trim();
        if (!k) return false;
        const removed = baseMultiSelectionsByKey.delete(k);
        if (removed) emitMultiSelectLayersUpdated();
        return removed;
    };

    const clearBaseMultiSelections = () => {
        baseMultiSelectionsByKey = new Map();
        emitMultiSelectLayersUpdated();
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

            const platform = normalizeArrayLike(props?.platform_line_id).map((x) => String(x || '').trim()).filter(Boolean);
            const servingIds = normalizeArrayLike(props?.serving_ids).map((x) => String(x || '').trim()).filter(Boolean);
            const servingLines = normalizeArrayLike(props?.serving_lines).map((x) => String(x || '').trim()).filter(Boolean);
            const lines = platform.length ? platform : (servingIds.length ? servingIds : servingLines);

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
            // 进入/退出多选模式都重置直通图层状态
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

    // 时刻表虚拟内存缓存（按线路 id 预加载 train-timetables/*.json）
    const timetableCache = getGlobalTimetableCache({ maxBytes: 50 * 1024 * 1024, logFetch: true, logDiscover: true });

    const cssEscape = (value) => {
        const s = String(value);
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s);
        return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    };

    // 底部居中提示条：显示当前高亮的公司/线路
    const selectionBadgeEl = document.createElement('div');
    selectionBadgeEl.className = 'selection-badge is-hidden';
    const selectionBadgeTextEl = document.createElement('span');
    selectionBadgeTextEl.className = 'selection-badge-text';
    selectionBadgeEl.appendChild(selectionBadgeTextEl);
    document.body.appendChild(selectionBadgeEl);

    const lineNameById = new Map();
    const lineColorById = new Map();
    const lineColorByName = new Map();
    const lineCompanyById = new Map();

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

    const getBaseKindNameForMultiSelect = (kind) => {
        const k = String(kind || '').trim();
        if (k === 'company') return '公司筛选';
        if (k === 'mode') return '模式筛选';
        return '基础线路';
    };

    const buildMultiSelectLayerItems = () => {
        const items = [];

        for (const [key, entry] of baseMultiSelectionsByKey.entries()) {
            const ids = entry?.lineIds instanceof Set ? Array.from(entry.lineIds).map(String).filter(Boolean) : [];
            const firstLineId = ids[0] || '';
            items.push({
                id: `base:${key}`,
                scope: 'base',
                key,
                visible: entry?.hidden !== true,
                lineName: getLineNameForMultiSelect(firstLineId),
                originName: '-',
                terminalName: '-',
                typeName: getBaseKindNameForMultiSelect(entry?.kind)
            });
        }

        for (const [key, entry] of tripPreviewSelectionsByKey.entries()) {
            const payload = entry?.payload || {};
            const built = entry?.built || {};
            const lineId = String(payload?.selectedLineId || payload?.mainLineId || '').trim();
            const typeName = String(payload?.typeName || payload?.tripTypeName || '').trim() || '-';
            const originName = getStationNameForMultiSelect(built?.startStationId || payload?.originStationId || '');
            const terminalName = getStationNameForMultiSelect(built?.endStationId || payload?.terminalStationId || '');

            items.push({
                id: `trip:${key}`,
                scope: 'trip',
                key,
                visible: entry?.hidden !== true,
                lineName: getLineNameForMultiSelect(lineId),
                originName,
                terminalName,
                typeName
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

        // 兼容：某些数据源会把数组写成 JSON 字符串（例如 "[\"A\",\"B\"]"）
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
        try {
            const resp = await fetch('./data/station-groups.json');
            if (!resp.ok) return new Map();
            const groups = await resp.json();
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

            return map;
        } catch {
            return new Map();
        }
    };

    const getSelectedStationHighlightIds = () => {
        const sid = String(selectedStationId ?? '').trim();
        if (!sid) return [];
        const groupSet = transferStationIdsByStationId.get(sid);
        if (groupSet && groupSet.size) return Array.from(groupSet).map(String).filter(Boolean);
        return [sid];
    };

    const getServingLineIdsFromStationProps = (props) => {
        const p = props || {};
        // 注意：stations.geojson 的 serving_lines 是“线路名称”，不一定等同于 lines.geojson 的 id。
        // 目前 lines-layer 的匹配应优先使用 serving_ids / platform_line_id（都是线路 id）。
        const servingIdsRaw = normalizeArrayLike(p.serving_ids);
        const platformLineIdsRaw = normalizeArrayLike(p.platform_line_id);
        const servingLinesRaw = normalizeArrayLike(p.serving_lines);

        let ids = (servingIdsRaw && servingIdsRaw.length ? servingIdsRaw : platformLineIdsRaw)
            .map((x) => String(x).trim())
            .filter(Boolean);

        // 兜底：若只有 serving_lines（名称），尝试用 lineNameById 反查 id
        if ((!ids || ids.length === 0) && servingLinesRaw && servingLinesRaw.length) {
            const names = servingLinesRaw.map((x) => String(x).trim()).filter(Boolean);
            if (names.length) {
                const out = [];
                for (const name of names) {
                    for (const [id, n] of lineNameById.entries()) {
                        if (String(n) === name) {
                            out.push(String(id));
                            break;
                        }
                    }
                }
                ids = out;
            }
        }

        // 去重且保持顺序
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

    function updateSelectionBadge() {
        if (selectedLineId) {
            const name = lineNameById.get(String(selectedLineId)) || String(selectedLineId);
            const color = resolveRailColorForTheme(lineColorById.get(String(selectedLineId)) || '#111') || '#111';
            selectionBadgeTextEl.textContent = name;
            selectionBadgeTextEl.style.color = color;
            selectionBadgeEl.classList.remove('is-hidden');
            return;
        }

        if (selectedCompany) {
            const companyKey = String(selectedCompany);
            const companyZh = String(companyLogoMap?.[companyKey]?.zh || '').trim();
            selectionBadgeTextEl.textContent = companyZh || companyKey;
            selectionBadgeTextEl.style.color = isDarkThemeActive() ? '#f2f2f2' : '#111';
            selectionBadgeEl.classList.remove('is-hidden');
            return;
        }

        selectionBadgeEl.classList.add('is-hidden');
    }
    const companyLogoMap = {
    'JR-East': { 'zh': 'JR东日本', 'img': ["jreast.png"], 'abb': "JR", 'type': "JR铁路公司" },
    'JR-Central': { 'zh': 'JR东海', 'img': ["jrc.svg"], 'abb': "JR东海", 'type': "JR铁路公司" },
    'TokyoMetro': { 'zh': '东京地下铁', 'img': ["Tokyometro.png", 60], 'abb': "东京地下铁", 'type': "大手私铁/地下铁" },
    'Toei': { 'zh': '都营地下铁', 'img': ["duyinmetro.svg"], 'abb': "都营地下铁", 'type': "地下铁" },
    //'Toei': { 'zh': '都营交通', 'img': ["duyinmetro.svg"],'abb':"都营交通" },
    'Keio': { 'zh': '京王电铁', 'img': ["jingwang.svg", 65], 'abb': "京王", 'type': "大手私铁", 'order': ['京王线', '新线', '井之头'] },
    'Tobu': { 'zh': '东武铁道', 'img': ["dongwu.svg", 70], 'abb': "东武", 'type': "大手私铁", 'order': ['晴空塔', '伊势崎', '日光', '东上', '都市公园', '龟户'] },
    'Tokyu': { 'zh': '东急电铁', 'img': ["dongji.png"], 'abb': "东急", 'type': "大手私铁" },
    'Seibu': { 'zh': '西武铁道', 'img': ["xiwu.png"], 'abb': "西武", 'type': "大手私铁", 'order': ['池袋', '新宿'] },
    'Keikyu': { 'zh': '京急电铁', 'img': ["jingji.png", 65], 'abb': "京急", 'type': "大手私铁", 'order': ['本线', '空港'] },
    'Odakyu': { 'zh': '小田急电铁', 'img': ["xiaotianji.png"], 'abb': "小田急", 'type': "大手私铁", 'order': ['小田原', '江之岛', '多摩'] },
    'Keisei': { 'zh': '京成电铁', 'img': ["jingcheng.png", 60], 'abb': "京成", 'type': "大手私铁", 'order': ['本线', '空港', '押上'] },
    'Sotetsu': { 'zh': '相模铁道', 'img': ["xiangmo.png"], 'abb': "相铁", 'type': "大手私铁" },
    'Hokuso': { 'zh': '北总铁道', 'img': ["beizong.png", 80] },
    'MIR': { 'zh': '首都圈新都市铁道', 'img': ["TsukubaExpress.png", 40] },
    'TokyoMonorail': { 'zh': '东京单轨电车', 'img': ["tokyoMonorail.png"] },
    'TWR': { 'zh': '东京临海高速铁道', 'img': ["linhai.png", 40] },
    'Yurikamome': { 'zh': '新交通百合鸥', 'img': ["yurikamome.png", 45] },
    'Disney': { 'zh': '迪士尼', 'img': ["disney.png", 65], 'abb': " " },
    'YokohamaMunicipal': { 'zh': '横滨市营地下铁', 'img': ["yokohamaMetro.svg"], 'type': "地下铁" },
    'YokohamaSeaside': { 'zh': '横滨海岸线', 'img': ["YokohamaSeaside.png", 45] },
    'Minatomirai': { 'zh': '横滨高速铁道', 'img': ["gangweilai.png"] },
    //'Yokohama Ropeway': { 'zh': '横滨索道', 'img': ["quanyang.png"]},
    'ChibaMonorail': { 'zh': '千叶都市单轨', 'img': ["chibaMonorail.png", 35] },
    'ToyoRapid': { 'zh': '东叶高速铁道', 'img': ["dongyegaosu.png", 40] },
    'Ryutetsu': { 'zh': '流铁', 'img': ["liutie.png", 35] },
    'Yamaman': { 'zh': '山万', 'img': ["shanwan.png", 35] },
    'SaitamaTransit': { 'zh': '埼玉新都市交通', 'img': ["SaitamaNUT.png"] },
    'SaitamaRailway': { 'zh': '埼玉高速铁道', 'img': ["qiyugaosu.png", 50] },
    'TamaMonorail': { 'zh': '多摩都市单轨', 'img': ["TamaMonorail.png"] },
    'ShonanMonorail': { 'zh': '湘南单轨电车', 'img': ["shonanMonorail.png", 50] },
    'KantoRailway': { 'zh': '关东铁道', 'img': ["guandong.png", 35] },
    'Enoden': { 'zh': '江之岛电铁', 'img': ["jiangdian.png", 60] },
    'UtsunomiyaLightRail': { 'zh': '宇都宫轻轨', 'img': ["yudugong.png", 35] },
    'KashimaRinkai': { 'zh': '鹿岛临海铁道', 'img': ["ludao.png", 35] },
    'Choshi': { 'zh': '铫子电气铁道', 'img': ["yaozi.png", 35] },
    'Isumi': { 'zh': '夷隅铁道', 'img': ["yiou.png", 35] },
    'Fujikyu': { 'zh': '富士急行', 'img': ["fushi.png", 40] },
    'Shibayama': { 'zh': '芝山铁道', 'img': ["zhishan.png"] },
    'Kominato': { 'zh': '小凑铁道', 'img': ["xiaocou.png", 35] },
    'Izukyu': { 'zh': '伊豆急行', 'img': ["yidouji.png"] },
    'Hitachinaka':{'zh':'常陆那珂海滨铁道','img':["hitachinaka.svg",35]},
    'IzuHakone': { 'zh': '伊豆箱根铁道', 'img':["yidouxianggen.png",35] },
    'OdakyuHakone': { 'zh': '箱根登山铁道', 'img':["xiaotianji.png"] },
    'Chichibu': { 'zh': '秩父铁道', 'img': ["zhifu.svg", 35] },
    //'Jōmō Electric Railway': { 'zh': '上毛电气铁道', 'img':["shangmao.svg",35] },
    'Moka': { 'zh': '真冈铁道', 'img':["zhengang.svg",35] },
    //'Jōshin Dentetsu': { 'zh': '上信电铁', 'img':["shangxin.svg",35] },
    //'Watarase Keikoku Railway': { 'zh': '渡良濑溪谷铁道', 'img':["dulianglai.png",35] }
};



    // 暴露给 search.js：复用公司 logo 元数据（避免 search.js import app.js 导致重复初始化）
    try {
        window.TokyoRailCompanyLogoMap = companyLogoMap;
        window.TokyoRailCompanyLogoBasePath = './companyLogos/';
    } catch {
        // ignore
    }

    function applyLineSelectionStyle() {
        if (!map.getLayer('lines-layer')) return;

        const baseColorExpr = isDarkThemeActive()
            ? ['coalesce', ['get', '_dark_color'], ['get', 'color'], '#555']
            : ['coalesce', ['get', 'color'], '#555'];
        const multiLineIds = getBaseMultiSelectedLineIds();

        const applyMultiLineHighlight = (dimOpacity = 0.6) => {
            const ids = Array.from(multiLineIds).map(String).filter(Boolean);
            if (!ids.length) return false;
            const hitExpr = ids.length === 1
                ? ['==', ['get', 'id'], ids[0]]
                : ['in', ['get', 'id'], ['literal', ids]];

            map.setPaintProperty('lines-layer', 'line-color', [
                'case',
                hitExpr,
                baseColorExpr,
                '#999'
            ]);
            map.setPaintProperty('lines-layer', 'line-width', [
                'case',
                hitExpr,
                3,
                1.2
            ]);
            map.setPaintProperty('lines-layer', 'line-opacity', [
                'case',
                hitExpr,
                1,
                dimOpacity
            ]);
            return true;
        };

        // 车次预览态：底图线路统一弱化，真正高亮由“分段预览图层”承担（避免整条线被点亮）
        if (tripPreviewActive) {
            if (isMultiSelectModeEnabled() && applyMultiLineHighlight(0.45)) return;
            map.setPaintProperty('lines-layer', 'line-color', '#999');
            map.setPaintProperty('lines-layer', 'line-width', 1.2);
            map.setPaintProperty('lines-layer', 'line-opacity', 0.45);
            return;
        }

        if (isMultiSelectModeEnabled() && applyMultiLineHighlight(0.6)) return;

        if (dirPreviewActive && dirPreviewLineIds && dirPreviewLineIds.size) {
            const ids = Array.from(dirPreviewLineIds).map(String).filter(Boolean);
            const hitExpr = ids.length === 1
                ? ['==', ['get', 'id'], ids[0]]
                : ['in', ['get', 'id'], ['literal', ids]];

            map.setPaintProperty('lines-layer', 'line-color', [
                'case',
                hitExpr,
                baseColorExpr,
                '#999'
            ]);
            map.setPaintProperty('lines-layer', 'line-width', [
                'case',
                hitExpr,
                3,
                1.2
            ]);
            map.setPaintProperty('lines-layer', 'line-opacity', [
                'case',
                hitExpr,
                1,
                0.6
            ]);
            return;
        }

        // 线路优先：选中线路时，忽略公司选中
        // 但如果菜单把支线合并到主线（selectedStationLineIds 里包含多条），则按集合高亮。
        if (selectedLineId) {
            const mergedIds = (selectedStationLineIds && selectedStationLineIds.size > 1)
                ? Array.from(selectedStationLineIds).map(String).filter(Boolean)
                : null;
            const hitExpr = mergedIds
                ? ['in', ['get', 'id'], ['literal', mergedIds]]
                : ['==', ['get', 'id'], selectedLineId];

            map.setPaintProperty('lines-layer', 'line-color', [
                'case',
                hitExpr,
                baseColorExpr,
                '#999'
            ]);

            map.setPaintProperty('lines-layer', 'line-width', [
                'case',
                hitExpr,
                3,
                1.2
            ]); //线宽，线路宽度

            map.setPaintProperty('lines-layer', 'line-opacity', [
                'case',
                hitExpr,
                1,
                0.6
            ]);

            return;
        }

        // 站点选中：高亮该站点的所有 serving_lines（不执行 fitBounds）
        if (selectedStationLineIds && selectedStationLineIds.size) {
            const ids = Array.from(selectedStationLineIds).map(String).filter(Boolean);
            const hitExpr = ids.length === 1
                ? ['==', ['get', 'id'], ids[0]]
                : ['in', ['get', 'id'], ['literal', ids]];

            map.setPaintProperty('lines-layer', 'line-color', [
                'case',
                hitExpr,
                baseColorExpr,
                '#999'
            ]);

            map.setPaintProperty('lines-layer', 'line-width', [
                'case',
                hitExpr,
                3,
                1.2
            ]);//线宽，线路宽度

            map.setPaintProperty('lines-layer', 'line-opacity', [
                'case',
                hitExpr,
                1,
                0.6
            ]);

            return;
        }

        if (!selectedCompany) {
            map.setPaintProperty('lines-layer', 'line-color', baseColorExpr);
            map.setPaintProperty('lines-layer', 'line-width', 3); //线宽
            map.setPaintProperty('lines-layer', 'line-opacity', 1);
            return;
        }

        
        map.setPaintProperty('lines-layer', 'line-color', [
            'case',
            ['==', ['get', 'company'], selectedCompany],
            baseColorExpr,
            '#999'
        ]);

        map.setPaintProperty('lines-layer', 'line-width', [
            'case',
            ['==', ['get', 'company'], selectedCompany],
            3,
            1.2
        ]);

        map.setPaintProperty('lines-layer', 'line-opacity', [
            'case',
            ['==', ['get', 'company'], selectedCompany],
            1,
            0.6
        ]);
    }

    function baseStationCircleRadiusExpr() {
        const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['get', 'serving_lines']];
        return [
            'interpolate',
            ['linear'],
            ['zoom'],
            6, [
                'case',
                ['==', ['length', servingIdsExpr], 1],
                0.5,
                0.5
            ],
            14, [
                'case',
                ['==', ['length', servingIdsExpr], 1],
                3.5,
                4
            ],
            22, [
                'case',
                ['==', ['length', servingIdsExpr], 1],
                3.5,
                4
            ]
        ];
    }

    function baseStationCircleStrokeWidthExpr() {
        const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['get', 'serving_lines']];
        return [
            'case',
            ['==', ['length', servingIdsExpr], 1],
            0,
            2
        ];
    }

    function isDarkThemeActive() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    function parseCssColorToRgb(input) {
        const s = String(input || '').trim();
        if (!s) return null;

        const hex = s.match(/^#([0-9a-fA-F]{3,8})$/);
        if (hex) {
            const raw = hex[1];
            if (raw.length === 3 || raw.length === 4) {
                const r = parseInt(raw[0] + raw[0], 16);
                const g = parseInt(raw[1] + raw[1], 16);
                const b = parseInt(raw[2] + raw[2], 16);
                return { r, g, b };
            }
            if (raw.length === 6 || raw.length === 8) {
                const r = parseInt(raw.slice(0, 2), 16);
                const g = parseInt(raw.slice(2, 4), 16);
                const b = parseInt(raw.slice(4, 6), 16);
                return { r, g, b };
            }
        }

        const rgb = s.match(/^rgba?\(\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)(?:\s*,\s*([0-9]+(?:\.[0-9]+)?))?\s*\)$/i);
        if (rgb) {
            const r = Math.max(0, Math.min(255, Math.round(Number(rgb[1]))));
            const g = Math.max(0, Math.min(255, Math.round(Number(rgb[2]))));
            const b = Math.max(0, Math.min(255, Math.round(Number(rgb[3]))));
            return { r, g, b };
        }

        return null;
    }

    function rgbToHex({ r, g, b }) {
        const to2 = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).padStart(2, '0');
        return `#${to2(r)}${to2(g)}${to2(b)}`;
    }

    function relativeLuminance({ r, g, b }) {
        const toLinear = (v) => {
            const x = Math.max(0, Math.min(255, Number(v) || 0)) / 255;
            return x <= 0.03928 ? (x / 12.92) : Math.pow((x + 0.055) / 1.055, 2.4);
        };
        const lr = toLinear(r);
        const lg = toLinear(g);
        const lb = toLinear(b);
        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    }

    const DARK_INVERT_TRIGGER_LUMINANCE = (() => {
        const ref = parseCssColorToRgb('#005AAA');
        return ref ? relativeLuminance(ref) : 0.102;
    })();

    function adjustColorForDarkThemeIfNeeded(color) {
        const parsed = parseCssColorToRgb(color);
        if (!parsed) return String(color || '');

        const lum = relativeLuminance(parsed);
        if (!(lum < DARK_INVERT_TRIGGER_LUMINANCE)) return String(color || '');

        const inverted = {
            r: 255 - parsed.r,
            g: 255 - parsed.g,
            b: 255 - parsed.b
        };
        return rgbToHex(inverted);
    }

    function resolveRailColorForTheme(color) {
        const raw = String(color || '').trim();
        if (!raw) return raw;
        if (!isDarkThemeActive()) return raw;
        return adjustColorForDarkThemeIfNeeded(raw);
    }

    function stationCircleColorPaintExpr() {
        if (!isDarkThemeActive()) return '#fff';
        const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['get', 'serving_lines']];
        return [
            'case',
            ['==', ['length', servingIdsExpr], 1],
            '#8e95a1',
            '#111'
        ];
    }

    function stationCircleStrokeColorPaint() {
        return isDarkThemeActive() ? '#fff' : '#333';
    }

    function tripPreviewStopCircleColorPaintExpr() {
        if (!isDarkThemeActive()) return '#fff';
        return [
            'case',
            ['<=', ['coalesce', ['get', 'serving_count'], 1], 1],
            '#8e95a1',
            '#111'
        ];
    }

    function tripPreviewStopStrokeColorPaint() {
        return isDarkThemeActive() ? '#fff' : '#111';
    }

    function applyStationThemePaintToMapLayers() {
        try {
            if (map.getLayer('stations-layer')) {
                map.setPaintProperty('stations-layer', 'circle-color', stationCircleColorPaintExpr());
                map.setPaintProperty('stations-layer', 'circle-stroke-color', stationCircleStrokeColorPaint());
            }
            if (map.getLayer('trip-preview-stops-layer')) {
                map.setPaintProperty('trip-preview-stops-layer', 'circle-color', tripPreviewStopCircleColorPaintExpr());
                map.setPaintProperty('trip-preview-stops-layer', 'circle-stroke-color', tripPreviewStopStrokeColorPaint());
            }
        } catch {
            // ignore
        }
    }

    function buildStationAnyLineMatchExpr(lineIds) {
        // 判断站点是否服务于给定线路集合：
        // 优先用 platform_line_id（平台所属线路 id）来判断，避免换乘站的“另一条线路站台”被误判为命中
        // 兼容旧数据：没有 platform_line_id 时回退 serving_ids / serving_lines
        const platformIdsExpr = ['coalesce', ['get', 'platform_line_id'], ['get', 'serving_ids'], ['get', 'serving_lines']];
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
        if (!map.getLayer('stations-layer')) return;
        const multiLineIds = getBaseMultiSelectedLineIds();
        // 车次预览态：站点画法恢复基础，由 collision 的显式站点过滤控制可见集合
        if (tripPreviewActive && !(isMultiSelectModeEnabled() && multiLineIds.size)) {
            map.setPaintProperty('stations-layer', 'circle-radius', baseStationCircleRadiusExpr());
            map.setPaintProperty('stations-layer', 'circle-stroke-width', baseStationCircleStrokeWidthExpr());
            map.setPaintProperty('stations-layer', 'circle-opacity', 1);
            map.setPaintProperty('stations-layer', 'circle-stroke-opacity', 1);
            applyStationThemePaintToMapLayers();
            return;
        }

        if (dirPreviewActive && dirPreviewStationIds && dirPreviewStationIds.size) {
            const ids = Array.from(dirPreviewStationIds).map(String).filter(Boolean);
            const isPreviewStation = ids.length === 1
                ? ['==', ['get', 'id'], ids[0]]
                : ['in', ['get', 'id'], ['literal', ids]];

            map.setPaintProperty('stations-layer', 'circle-radius', [
                'interpolate',
                ['linear'],
                ['zoom'],
                6, ['case', isPreviewStation, 0.5, 0.5],
                14, ['case', isPreviewStation, 4, 0.5],
                22, ['case', isPreviewStation, 4, 0.5]
            ]);
            map.setPaintProperty('stations-layer', 'circle-stroke-width', [
                'case',
                isPreviewStation,
                baseStationCircleStrokeWidthExpr(),
                0
            ]);
            map.setPaintProperty('stations-layer', 'circle-opacity', 1);
            map.setPaintProperty('stations-layer', 'circle-stroke-opacity', 1);
            applyStationThemePaintToMapLayers();
            return;
        }


        // 换乘站判断仍用 serving_ids（全服务线路集合）
        const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['get', 'serving_lines']];
        // 高亮匹配用 platform_line_id（平台所属线路）
        const platformIdsExpr = ['coalesce', ['get', 'platform_line_id'], servingIdsExpr];

        if (isMultiSelectModeEnabled() && multiLineIds.size) {
            const isSelectedStation = buildStationAnyLineMatchExpr(Array.from(multiLineIds));

            map.setPaintProperty('stations-layer', 'circle-radius', [
                'interpolate',
                ['linear'],
                ['zoom'],

                6, [
                    'case',
                    isSelectedStation,
                    [
                        'case',
                        ['==', ['length', servingIdsExpr], 1],
                        0.5,
                        0.5
                    ],
                    0.5
                ],

                14, [
                    'case',
                    isSelectedStation,
                    [
                        'case',
                        ['==', ['length', servingIdsExpr], 1],
                        3.5,
                        4
                    ],
                    0.5
                ],

                22, [
                    'case',
                    isSelectedStation,
                    [
                        'case',
                        ['==', ['length', servingIdsExpr], 1],
                        3.5,
                        4
                    ],
                    0.5
                ]
            ]);

            map.setPaintProperty('stations-layer', 'circle-opacity', 1);
            map.setPaintProperty('stations-layer', 'circle-stroke-opacity', 1);

            map.setPaintProperty('stations-layer', 'circle-stroke-width', [
                'case',
                isSelectedStation,
                baseStationCircleStrokeWidthExpr(),
                0
            ]);
            applyStationThemePaintToMapLayers();
            return;
        }

        // 未选择任何东西：恢复原样式
        if (!selectedLineId && !selectedCompany && !(selectedStationLineIds && selectedStationLineIds.size)) {
            map.setPaintProperty('stations-layer', 'circle-radius', baseStationCircleRadiusExpr());
            map.setPaintProperty('stations-layer', 'circle-stroke-width', baseStationCircleStrokeWidthExpr());
            // 重要：上一次高亮可能设置过 circle-opacity（仅影响填充，不影响描边），
            // 若不在“恢复原样式”时重置，会导致换乘站出现“空心圈/圆心透明”。
            map.setPaintProperty('stations-layer', 'circle-opacity', 1);
            map.setPaintProperty('stations-layer', 'circle-stroke-opacity', 1);
            applyStationThemePaintToMapLayers();
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
                        const ids = getSelectedStationHighlightIds();
                        if (!ids.length) return ['==', ['get', 'id'], String(selectedStationId)];
                        if (ids.length === 1) return ['==', ['get', 'id'], ids[0]];
                        return ['in', ['get', 'id'], ['literal', ids]];
                    })()
                    : buildStationAnyLineMatchExpr(Array.from(selectedStationLineIds ?? [])));

        const shouldIsolate = Boolean(selectedLineId) && isolateStationsToSelectedLine === true;

        map.setPaintProperty('stations-layer', 'circle-radius', [
            'interpolate',
            ['linear'],
            ['zoom'],

            6, [
                'case',
                isSelectedStation,
                [
                    'case',
                    ['==', ['length', servingIdsExpr], 1],
                    0.5,
                    0.5
                ],
                0.5
            ],

            14, [
                'case',
                isSelectedStation,
                [
                    'case',
                    ['==', ['length', servingIdsExpr], 1],
                    3.5,
                    4
                ],
                0.5
            ],

            22, [
                'case',
                isSelectedStation,
                [
                    'case',
                    ['==', ['length', servingIdsExpr], 1],
                    3.5,
                    4
                ],
                0.5
            ]
        ]);

        // 需求（仅对“popup 提交线路”）：隐藏其他站点
        if (shouldIsolate) {
            map.setPaintProperty('stations-layer', 'circle-opacity', [
                'case',
                isSelectedStation,
                1,
                0
            ]);
        } else {
            map.setPaintProperty('stations-layer', 'circle-opacity', 1);
        }

        map.setPaintProperty('stations-layer', 'circle-stroke-width', [
            'case',
            isSelectedStation,
            baseStationCircleStrokeWidthExpr(),
            0
        ]);
        applyStationThemePaintToMapLayers();
        
    }

    function getEnabledLineIdsForLabels() {
        if (tripPreviewActive) return null;
        if (dirPreviewActive) return null;
        if (isMultiSelectModeEnabled()) {
            const ids = getBaseMultiSelectedLineIds();
            if (ids.size) return ids;
        }
        // 需求：选择线路不变、其他线路变灰变细；且“其他线路站点不显示站点名”
        // 这里返回“当前选中线路集合”，只用于站名筛选（圆点不筛选）。
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

    function clearSelectionsAndRestore() {
        selectedCompany = null;
        selectedLineId = null;
        selectedStationLineIds = null;
        selectedStationId = null;
        selectedServiceMode = 'all';
        isolateStationsToSelectedLine = false;
        setStationLabelMode('auto');

        if (menu && typeof menu.clearActive === 'function') menu.clearActive();

        applySelectionEffects();
    }

    const applySelectionEffects = () => {
        applyLineSelectionStyle();
        applyStationSelectionStyle();
        if (collisionController) collisionController.scheduleUpdate();
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
    };

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
        {
            const candidates = ['./icons/settings.svg', '/icons/settings.svg'];
            let idx = 0;
            fabIcon.src = candidates[idx];
            fabIcon.addEventListener('error', () => {
                idx += 1;
                if (idx < candidates.length) fabIcon.src = candidates[idx];
            });
        }
        fab.appendChild(fabIcon);

        const content = document.createElement('div');
        content.className = 'settings-content is-hidden';

        root.appendChild(fab);
        root.appendChild(content);
        document.body.appendChild(root);

        const expand = () => {
            root.classList.remove('is-collapsed');
            content.classList.remove('is-hidden');
        };

        const collapse = () => {
            root.classList.add('is-collapsed');
            content.classList.add('is-hidden');
        };

        root.addEventListener('mouseenter', () => {
            expand();
        });

        root.addEventListener('mouseleave', (evt) => {
            const toEl = evt?.relatedTarget;
            if (toEl && toEl instanceof Element && toEl.closest('.settings-time-picker')) return;
            if (window.__TokyoRailTimePickerOpen === true) return;
            collapse();
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

    // 初始化右侧 panel，并复用 popup 的数据结构与交互语义（hover=预览，click=提交）
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

            const resolved = (menu && typeof menu.resolveLineSelection === 'function')
                ? menu.resolveLineSelection(id)
                : null;
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

            // panel click：提交高亮（不执行 fitBounds）
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
            try {
                tripDetailStationTriangleMarker?.remove?.();
            } catch {
                // ignore
            }
            tripDetailStationTriangleMarker = null;
        },
        onTripCurrentStationShow: ({ stationId }) => {
            const sid = String(stationId || '').trim();
            if (!sid) return;
            const coord = stationCoordById.get(sid);
            if (!Array.isArray(coord) || coord.length < 2) return;

            try {
                tripCurrentStationPopup?.remove?.();
            } catch {
                // ignore
            }
            tripCurrentStationPopup = null;

            const el = document.createElement('div');
            el.className = 'trip-current-station-label';
            el.textContent = '当前站';

            try {
                tripCurrentStationPopup = new maplibregl.Popup({
                    closeButton: false,
                    closeOnClick: false,
                    closeOnMove: false,
                    anchor: 'top',
                    offset: [0, 8],
                    className: 'trip-current-station-popup'
                })
                    .setLngLat(coord)
                    .setDOMContent(el)
                    .addTo(map);
            } catch {
                tripCurrentStationPopup = null;
            }
        },
        onTripCurrentStationHide: () => {
            try {
                tripCurrentStationPopup?.remove?.();
            } catch {
                // ignore
            }
            tripCurrentStationPopup = null;
        },
        onTripDetailStationIndicator: ({ stationId }) => {
            const sid = String(stationId || '').trim();
            if (!sid) return;
            const coord = stationCoordById.get(sid);
            if (!Array.isArray(coord) || coord.length < 2) return;

            try {
                tripDetailStationTriangleMarker?.remove?.();
            } catch {
                // ignore
            }
            tripDetailStationTriangleMarker = null;

            // Wrap the visual indicator in an outer container so MapLibre's
            // internal `transform` applied to position the marker doesn't
            // overwrite our rotation on the visual element.
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
        },
        onTripDetailStationIndicatorClear: () => {
            try {
                tripDetailStationTriangleMarker?.remove?.();
            } catch {
                // ignore
            }
            tripDetailStationTriangleMarker = null;
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

        // 先恢复所有站名为默认“上移”位置
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

        // 站点正下方：下移自身高度(100%)后再留一点间距
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

        // 菜单 hover/commit 任一交互发生时：站点 popup 应立即隐藏
        // 同时清理 popup 的预览快照，避免 popup 关闭时回滚干扰菜单预览。
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

    // 暴露给 search.js：复用“菜单同款”的预览/提交高亮 + fitBounds
    // 注意：search.js 不能 import app.js（会重复初始化地图），因此用 window 作为桥接。
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

    // “通过该站台的线路”：优先 platform_line_id；没有则回退 serving_ids / serving_lines
    const getPlatformLineIdsFromStationProps = (props) => {
        const p = props || {};
        const platformIds = normalizeLineIdArrayLike(p.platform_line_id);
        if (platformIds.length) return platformIds;

        const servingIds = normalizeLineIdArrayLike(p.serving_ids);
        if (servingIds.length) return servingIds;

        const servingLines = normalizeLineIdArrayLike(p.serving_lines);
        if (!servingLines.length) return [];

        // 若 serving_lines 是“名称”，尝试用 lineNameById 反查 id
        const out = [];
        for (const name of servingLines) {
            for (const [id, n] of lineNameById.entries()) {
                if (String(n) === name) {
                    out.push(String(id));
                    break;
                }
            }
        }
        return out;
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

    const selectPlatformLinesForStation = (props) => {
        const ids = getPlatformLineIdsFromStationProps(props);
        if (!ids.length) return;

        selectedStationLineIds = new Set(ids);
        selectedStationId = String(props?.id ?? '').trim() || null;
        selectedCompany = null;
        selectedLineId = null;
        selectedServiceMode = 'all';
        isolateStationsToSelectedLine = false;

        applySelectionEffects();
    };

    const fitToPointAsBounds = (coordinates, { maxZoom } = {}) => {
        if (!Array.isArray(coordinates) || coordinates.length < 2) return;
        const lng = Number(coordinates[0]);
        const lat = Number(coordinates[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

        // 点用一个很小的 bbox 来 fitBounds，实现“居中”语义
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
            map.fitBounds(bounds, opts);
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

    if (searchMapActions) {
        searchMapActions.isReady = false;
        searchMapActions.snapshotSelectionState = snapshotSelectionState;
        searchMapActions.restoreSelectionState = restoreSelectionState;

        searchMapActions.previewLine = (lineId) => {
            const id = String(lineId ?? '').trim();
            if (!id) return;
            hideStationPopupForMenuInteraction();

            const resolved = (menu && typeof menu.resolveLineSelection === 'function')
                ? menu.resolveLineSelection(id)
                : null;

            const mainLineId = String(resolved?.mainLineId ?? id);
            const merged = Array.isArray(resolved?.mergedLineIds)
                ? resolved.mergedLineIds.map(String).filter(Boolean)
                : [mainLineId];

            selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
            selectedStationId = null;
            selectedLineId = mainLineId;
            selectedCompany = null;
            selectedServiceMode = 'all';
            isolateStationsToSelectedLine = false;
            setStationLabelMode('auto');
            applySelectionEffects();
            fitToCurrentSelection(`line:${selectedLineId}`, 'preview');
        };

        searchMapActions.commitLine = (lineId) => {
            const id = String(lineId ?? '').trim();
            if (!id) return;
            hideStationPopupForMenuInteraction();

            const resolved = (menu && typeof menu.resolveLineSelection === 'function')
                ? menu.resolveLineSelection(id)
                : null;

            const mainLineId = String(resolved?.mainLineId ?? id);
            const merged = Array.isArray(resolved?.mergedLineIds)
                ? resolved.mergedLineIds.map(String).filter(Boolean)
                : [mainLineId];

            selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
            selectedStationId = null;
            selectedLineId = mainLineId;
            selectedCompany = null;
            selectedServiceMode = 'all';
            isolateStationsToSelectedLine = false;
            setStationLabelMode('all');

            if (menu && typeof menu.markActive === 'function') {
                const el = menu.wrapper?.querySelector(`.RW-line-content[data-line-id="${cssEscape(selectedLineId)}"]`);
                if (el) menu.markActive(el);
            }

            applySelectionEffects();
            fitToCurrentSelection(`line:${selectedLineId}`, 'commit');
        };

        searchMapActions.previewCompany = (companyName) => {
            const name = String(companyName ?? '').trim();
            if (!name) return;
            hideStationPopupForMenuInteraction();
            selectedStationLineIds = null;
            selectedStationId = null;
            selectedCompany = name;
            selectedLineId = null;
            selectedServiceMode = 'all';
            isolateStationsToSelectedLine = false;
            setStationLabelMode('auto');
            applySelectionEffects();
            fitToCurrentSelection(`company:${name}`, 'preview');
        };

        searchMapActions.commitCompany = (companyName) => {
            const name = String(companyName ?? '').trim();
            if (!name) return;
            hideStationPopupForMenuInteraction();
            selectedStationLineIds = null;
            selectedStationId = null;
            selectedCompany = name;
            selectedLineId = null;
            selectedServiceMode = 'all';
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

            applySelectionEffects();
            fitToCurrentSelection(`company:${name}`, 'commit');
        };

        // station 的 popup 依赖 stationsData 加载完成后初始化的 stationPopup；这里先挂函数，内部做空值保护
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

        // 方便搜索预览结束时收起 popup（如果需要）
        searchMapActions.closeStationPopup = ({ committed } = {}) => {
            stationPopup?.closePopup?.({ committed: committed !== false });
            setFixedPopupStationLabelBelow(null);
        };
    }

    function bindClickBlankToRestore() {
        // 点击地图空白处：恢复所有线路显示（并同步恢复站点/站名联动）
        map.on('click', (e) => {
            if (!touchTapGuard.allowTap(e?.originalEvent)) return;

            // 全屏模式下，空白点击由 fullscreen.js 处理退出，不重置高亮
            if (isInFullscreenMode()) return;

            const layers = [];
            if (map.getLayer('lines-layer')) layers.push('lines-layer');
            if (map.getLayer('stations-layer')) layers.push('stations-layer');

            // 若没有可查询的图层，视为“空白”
            const hits = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : [];
            if (hits.length) return;

            // 点击空白处：隐藏右侧 panel
            panel?.hide?.();
            if (!isMultiSelectModeEnabled()) {
                clearTripPathPreview();
            }

            // 已经是“全显示”状态就不做任何事（避免多余刷新）
            if (!selectedCompany && !selectedLineId && !(selectedStationLineIds && selectedStationLineIds.size)) return;

            clearSelectionsAndRestore();
        });
    }

    function bindClickLineToSelect() {
        if (!map.getLayer('lines-layer')) return;

        // 点击线路：高亮该线路及其站点（复用现有逻辑）
        map.on('click', 'lines-layer', (e) => {
            if (!touchTapGuard.allowTap(e?.originalEvent)) return;

            // 若点击点同时命中站点（站点覆盖在线路上），则视为“点击站点”，不高亮线路
            // 需求：点击站点（或站点与线路一起被点到）时，不应触发线路选中
            if (map.getLayer('stations-layer')) {
                const stationHits = map.queryRenderedFeatures(e.point, { layers: ['stations-layer'] }) || [];
                if (stationHits.length) return;
            }

            const f = e?.features?.[0];
            const lineId = f?.properties?.id ?? f?.id;
            if (lineId == null) return;

            const rawLineId = String(lineId);
            const resolved = (menu && typeof menu.resolveLineSelection === 'function')
                ? menu.resolveLineSelection(rawLineId)
                : null;

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

            // 点击线路：永远选中；取消选择仅通过“点击空白处”
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

        // 点击站点圆点：高亮其 serving_lines（不执行 fitBounds）
        map.on('click', 'stations-layer', async (e) => {
            if (!touchTapGuard.allowTap(e?.originalEvent)) return;

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
        text.textContent = '站名';

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
            stationLabelMode = mode;
            setActive();
        };

        setStationLabelMode = (mode) => {
            if (stationLabelMode === mode) return false;
            setMode(mode);
            return true;
        };

        btnOff.addEventListener('click', () => {
            setMode('off');
            if (collisionController) collisionController.scheduleUpdate();
        });
        btnAuto.addEventListener('click', () => {
            setMode('auto');
            if (collisionController) collisionController.scheduleUpdate();
        });
        btnAll.addEventListener('click', () => {
            setMode('all');
            if (collisionController) collisionController.scheduleUpdate();
        });

        setMode('auto');
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
        {
            const candidates = ['./icons/list.svg', '/icons/list.svg'];
            let idx = 0;
            listIcon.src = candidates[idx];
            listIcon.addEventListener('error', () => {
                idx += 1;
                if (idx < candidates.length) listIcon.src = candidates[idx];
            });
        }
        btnList.appendChild(listIcon);

        const btnGrid = document.createElement('button');
        btnGrid.type = 'button';
        btnGrid.className = 'settings-view-btn settings-view-btn-grid';
        btnGrid.setAttribute('aria-label', '网格视图');

        const gridIcon = document.createElement('img');
        gridIcon.className = 'settings-view-btn-icon';
        gridIcon.alt = '';
        {
            const candidates = ['./icons/grid.svg', '/icons/grid.svg'];
            let idx = 0;
            gridIcon.src = candidates[idx];
            gridIcon.addEventListener('error', () => {
                idx += 1;
                if (idx < candidates.length) gridIcon.src = candidates[idx];
            });
        }
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
        text.textContent = '悬浮预览';

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

    mountAppearanceToggle(settingsMenuContentEl);
    mountTimetableViewToggle(settingsMenuContentEl);
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
    }

    let generatedLinesData = null;
    let generatedStationsData = null;

    try {
        const { linesGeoJSON, linesGeoJSONByZoom, lineRoutingCoordsById, stationsGeoJSON, diagnostics } = await loadRailGeoDataFromDataFolder();
        generatedLinesData = linesGeoJSON;
        generatedStationsData = stationsGeoJSON;
        transferStationIdsByStationId = await loadTransferStationIdMap();

        /*
        try {
            const items = Array.isArray(diagnostics?.largeGaps) ? diagnostics.largeGaps : [];
            if (items.length) {
                // 同一条线路可能有多个 segment 触发；按 id 取 max
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
        try {
            const fs = Array.isArray(linesData?.features) ? linesData.features : [];
            for (const f of fs) {
                if (!f?.properties || typeof f.properties !== 'object') continue;
                const color = f.properties.color;
                if (typeof color !== 'string' || !color.trim()) continue;
                f.properties._dark_color = adjustColorForDarkThemeIfNeeded(color.trim());
            }
        } catch {
            // ignore
        }
        addLinesLayer(map, linesData);

        // 需求：无视缩放比例，不做 zoom 级别切换

        // 构造 RWMenuCore 所需数据：companyObj / linesObj
        const allLineFeatures = Array.isArray(linesData?.features)
            ? linesData.features.filter((f) => f?.properties?.type === 'line')
            : [];
        const lineFeatures = allLineFeatures.filter((f) => Number(f?.properties?.hidden_by_opacity_zero) !== 1);
        const lineChainsById = new Map();

        // 站点坐标索引：用于车次路径高亮（只高亮停靠站）
        stationCoordById = new Map();
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

                const servingIds = normalizeArrayLike(p?.serving_ids);
                const servingLines = normalizeArrayLike(p?.serving_lines);
                const servingCount = (servingIds.length || servingLines.length || 1);
                stationServingCountById.set(sid, servingCount);
            }
        } catch {
            // ignore
        }

        const ensureTripPreviewLayers = () => {
            if (!map.getSource('trip-preview-source')) {
                map.addSource('trip-preview-source', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
            }

            if (!map.getLayer('trip-preview-line-layer')) {
                map.addLayer({
                    id: 'trip-preview-line-layer',
                    type: 'line',
                    source: 'trip-preview-source',
                    filter: ['!=', ['get', 'role'], 'connector'],
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': ['coalesce', ['get', 'color'], '#0a84ff'],
                        'line-width': 3,
                        'line-opacity': 1
                    }
                });
            }

            if (!map.getLayer('trip-preview-connector-layer')) {
                map.addLayer({
                    id: 'trip-preview-connector-layer',
                    type: 'line',
                    source: 'trip-preview-source',
                    filter: ['==', ['get', 'role'], 'connector'],
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': ['coalesce', ['get', 'color'], '#0a84ff'],
                        'line-width': 3,
                        'line-opacity': 1
                    }
                });
            }

            if (!map.getSource('trip-preview-stops-source')) {
                map.addSource('trip-preview-stops-source', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
            }

            if (!map.getLayer('trip-preview-stops-layer')) {
                map.addLayer({
                    id: 'trip-preview-stops-layer',
                    type: 'circle',
                    source: 'trip-preview-stops-source',
                    paint: {
                        'circle-radius': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            6, [
                                'case',
                                ['<=', ['coalesce', ['get', 'serving_count'], 1], 1],
                                0.5,
                                0.5
                            ],
                            14, [
                                'case',
                                ['<=', ['coalesce', ['get', 'serving_count'], 1], 1],
                                3.5,
                                4
                            ],
                            22, [
                                'case',
                                ['<=', ['coalesce', ['get', 'serving_count'], 1], 1],
                                3.5,
                                4
                            ]
                        ],
                        'circle-color': tripPreviewStopCircleColorPaintExpr(),
                        'circle-stroke-width': [
                            'case',
                            ['<=', ['coalesce', ['get', 'serving_count'], 1], 1],
                            0,
                            2
                        ],
                        'circle-stroke-color': tripPreviewStopStrokeColorPaint()
                    }
                });
            }
        };

        const resetTripPreviewLayers = () => {
            const emptyFc = { type: 'FeatureCollection', features: [] };
            try {
                map.getSource('trip-preview-source')?.setData?.(emptyFc);
                map.getSource('trip-preview-stops-source')?.setData?.(emptyFc);
            } catch {
                // ignore
            }
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

        // 直通计算优先使用“完整线路链路”（含 opacity:0 子段，按原 subline 顺序拼接）
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
            // 已有完整链路时，不再用拆分 feature 覆盖，避免与“手动去掉 opacity:0”结果不一致
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

        const extractLineSegment = (lineId, fromCoord, toCoord) => {
            const chains = getLineChains(lineId);
            let best = null;

            for (const chain of chains) {
                if (!Array.isArray(chain) || chain.length < 2) continue;
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
            const s = stationCoordById.get(stationId);
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
            const ca = stationCoordById.get(a);
            const cb = stationCoordById.get(b);
            if (!ca || !cb) return false;
            return distMeters(ca, cb) <= 350;
        };

        const previewFitWithSidePanels = (bbox) => {
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
                map.fitBounds(bounds, {
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
                const coord = stationCoordById.get(sid);
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

            const allSegments = Array.isArray(payload?.segments) ? payload.segments : [];
            const ntSeg = allSegments.find((s) => String(s?.kind) === 'nt') || null;
            const ntFirstStationId = (() => {
                const ids = Array.isArray(ntSeg?.stationIds) ? ntSeg.stationIds : [];
                return ids.length ? String(ids[0] || '').trim() : '';
            })();

            let allowNt = !payload?.hasNt || isLineTerminalStation(payload?.mainLineId, payload?.mainTerminalStationId);
            if (!allowNt && payload?.hasNt) {
                allowNt = isSamePhysicalStation(payload?.mainTerminalStationId, ntFirstStationId);
            }

            // 非端点直通也允许：只要主段末站与 nt 首站在局部几何上可连通（避免同班次在不同入口显示不一致）
            if (!allowNt && payload?.hasNt && ntSeg) {
                const mainTerminalId = String(payload?.mainTerminalStationId || '').trim();
                const mainTerminalCoord = stationCoordById.get(mainTerminalId);
                const ntFirstCoord = stationCoordById.get(ntFirstStationId);
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

            const segments = allowNt ? allSegments : allSegments.filter((s) => String(s?.kind) !== 'nt');

            const pushLineFeature = (coords, lineId, role = 'line') => {
                if (!Array.isArray(coords) || coords.length < 2) return;
                for (const c of coords) {
                    if (Array.isArray(c) && c.length >= 2) coordsForBbox.push(c);
                }
                outLineFeatures.push({
                    type: 'Feature',
                    properties: {
                        role,
                        lineId: String(lineId || ''),
                        color: resolveRailColorForTheme(lineColorById.get(String(lineId || '')) || '#0a84ff') || '#0a84ff'
                    },
                    geometry: { type: 'LineString', coordinates: coords }
                });
            };

            for (let i = 0; i < segments.length; i += 1) {
                const seg = segments[i] || {};
                const lineId = String(seg.lineId || '').trim();
                const stationIds = Array.isArray(seg.stationIds) ? seg.stationIds.map((x) => String(x).trim()).filter(Boolean) : [];
                for (const sid of stationIds) stopIds.add(sid);

                for (let j = 0; j < stationIds.length - 1; j += 1) {
                    const fromId = stationIds[j];
                    const toId = stationIds[j + 1];
                    const from = stationCoordById.get(fromId);
                    const to = stationCoordById.get(toId);
                    if (!from || !to) continue;

                    const clipped = extractLineSegment(lineId, from, to);
                    if (clipped && clipped.length >= 2) pushLineFeature(clipped, lineId, 'line');
                    else pushLineFeature([from, to], lineId, 'connector');
                }

                if (i > 0) {
                    const prev = segments[i - 1] || {};
                    const prevIds = Array.isArray(prev.stationIds) ? prev.stationIds : [];
                    const prevLast = String(prevIds.length ? prevIds[prevIds.length - 1] : '').trim();
                    const currFirst = String(stationIds.length ? stationIds[0] : '').trim();
                    if (prevLast && currFirst && prevLast !== currFirst) {
                        const a = stationCoordById.get(prevLast);
                        const b = stationCoordById.get(currFirst);
                        if (a && b) {
                            const bridge = nearestBridgeBetweenLines(prev.lineId, lineId, a, b);
                            const canUseBridge = bridge && Number.isFinite(bridge.dist) && bridge.dist <= 3000;
                            if (canUseBridge) {
                                const segA = extractLineSegment(prev.lineId, a, bridge.a);
                                const segB = extractLineSegment(lineId, bridge.b, b);
                                if (segA && segA.length >= 2) pushLineFeature(segA, prev.lineId, 'line');
                                if (bridge.dist > 25) pushLineFeature([bridge.a, bridge.b], lineId || prev.lineId, 'connector');
                                if (segB && segB.length >= 2) pushLineFeature(segB, lineId, 'line');

                                if ((!segA || segA.length < 2) && (!segB || segB.length < 2)) {
                                    pushLineFeature([a, b], lineId || prev.lineId, 'connector');
                                }
                            } else {
                                pushLineFeature([a, b], lineId || prev.lineId, 'connector');
                            }
                        }
                    }
                }
            }

            for (const sid of stopIds) {
                const c = stationCoordById.get(sid);
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
            tripPreviewOriginPopup = null;
            tripPreviewTerminalPopup = null;
        };

        const createTripEndpointPopup = ({ stationId, text, color, yOffset = 8 }) => {
            const sid = String(stationId || '').trim();
            if (!sid) return null;
            const coord = stationCoordById.get(sid);
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
            const coord = stationCoordById.get(sid);
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
            const lineId = String(payload?.selectedLineId || payload?.mainLineId || '').trim();
            const tripKey = String(payload?.tripKey || '').trim();
            if (!lineId || !tripKey) return '';
            return `${lineId}||${tripKey}`;
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

        const rebuildTripPreviewFromMultiSelections = (fitMode = 'none') => {
            const aggregate = buildMultiTripPreviewAggregate();
            const hasVisible = aggregate.lineIds instanceof Set && aggregate.lineIds.size > 0;
            const hasAnySelection = tripPreviewSelectionsByKey.size > 0;

            ensureTripPreviewLayers();
            try {
                map.getSource('trip-preview-source')?.setData?.(aggregate.lineFc);
                map.getSource('trip-preview-stops-source')?.setData?.(aggregate.stopFc);
            } catch {
                // ignore
            }

            clearTripEndpointPopups();

            tripPreviewActive = hasVisible;
            tripPreviewStationIds = hasVisible ? aggregate.stopIds : null;
            tripPreviewLineIds = hasVisible ? aggregate.lineIds : null;

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

            const stationIds = new Set([...originIds, ...terminalIds]);
            dirPreviewActive = true;
            dirPreviewLineIds = new Set([lineId]);
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

        clearTripPathPreview = () => {
            tripPreviewActive = false;
            tripPreviewStationIds = null;
            tripPreviewLineIds = null;
            tripPreviewSelectionsByKey = new Map();
            resetTripPreviewLayers();
            clearTripEndpointPopups();
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
                clearTripPathPreview();
                return;
            }

            const fitMode = String(payload?.fitMode || 'preview').trim() || 'preview';

            if (isMultiSelectModeEnabled()) {
                const selectionKey = buildTripPreviewSelectionKey(payload);
                if (!selectionKey) return;

                if (tripPreviewSelectionsByKey.has(selectionKey)) {
                    tripPreviewSelectionsByKey.delete(selectionKey);
                } else {
                    const builtSingle = buildTripPreviewFeatures(payload);
                    tripPreviewSelectionsByKey.set(selectionKey, {
                        payload: { ...(payload || {}) },
                        built: builtSingle,
                        hidden: false
                    });
                }

                rebuildTripPreviewFromMultiSelections(fitMode);
                return;
            }

            ensureTripPreviewLayers();
            const built = buildTripPreviewFeatures(payload);
            tripPreviewActive = true;
            tripPreviewStationIds = built.stopIds;
            tripPreviewLineIds = built.lineIds;

            try {
                map.getSource('trip-preview-source')?.setData?.(built.lineFc);
                map.getSource('trip-preview-stops-source')?.setData?.(built.stopFc);
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
                if (action === 'remove') {
                    const ok = removeBaseMultiSelection(parsed.key);
                    if (ok) {
                        if (!getBaseMultiSelectedLineIds().size && !tripPreviewActive) setStationLabelMode('auto');
                        applySelectionEffects();
                        collisionController?.scheduleUpdate?.();
                    }
                    return ok;
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
        enabledLineIdsByCompany = new Map();

        // ====== 选中后自动缩放：预计算线路 bounds（支持 LineString / MultiLineString） ======
        const lineBoundsById = new Map();
        let lastFitKey = null;
        let fitRafId = null;
        let pendingFit = null;
        let lastFitPaddingSig = null;

        const getFitPadding = (paddingMode = 'auto') => {
            const base = 60;
            const extraLeft = 200;

            // 默认：四周等距 padding
            const fallback = { top: base, right: base, bottom: base, left: base };

            // 提交选择：强制按全屏 fit（不扣除菜单宽度）
            if (paddingMode === 'full') return fallback;

            let leftPad = base;
            if (menu?.wrapper) {
                // 需求：预览（hover）时也应扣除左侧菜单占用宽度。
                // 注意：菜单可能处于“收起但仍在左侧”的状态，此时 rect.right 可能接近 0；
                // 为保持一致，使用 max(rect.right, rect.width) 来估算需要预留的宽度。
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
                map.fitBounds(bounds, fitOptions);
            });
        }

        for (const f of lineFeatures) {
            const lineId = f?.properties?.id ?? f?.id;
            if (!lineId) continue;

            const company = f?.properties?.company ?? '未知公司';
            const name = f?.properties?.name ?? String(lineId);
            const color = f?.properties?.color;

            if (typeof color === 'string' && color.trim() && f?.properties && typeof f.properties === 'object') {
                f.properties._dark_color = adjustColorForDarkThemeIfNeeded(color.trim());
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

        // 对外统一入口：既支持 mode 参数，也兼容 triggerKey 前缀（commit:/preview:）
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
            logoBasePath: './companyLogos/',
            hoverDelayMs: 500,
            onCancelSelection: clearSelectionsAndRestore,
            onCompanyClick: (companyName, meta) => {
                const source = meta?.source ?? 'click';
                if (source === 'hover' && !isHoverPreviewEnabled()) return;
                hideStationPopupForMenuInteraction();
                const commitPreview = meta?.commitPreview === true;

                if (isMultiSelectModeEnabled() && source !== 'hover') {
                    const name = String(companyName ?? '').trim();
                    if (!name) return;
                    const ids = Array.from(enabledLineIdsByCompany.get(name) ?? []).map(String).filter(Boolean);
                    if (!ids.length) return;
                    toggleBaseMultiSelection(`company:${name}`, ids, 'company');
                    applySelectionEffects();
                    return;
                }

                selectedStationLineIds = null;
                if (source === 'hover') {
                    selectedCompany = companyName;
                    setStationLabelMode('auto');
                } else {
                    // click 提交预览时不做反向 toggle
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

                // 菜单已将“支线 -> 主线”解析并给出 mergedLineIds（主线+支线）。
                // 这里统一以主线作为 selectedLineId，保证底部显示主线名。
                const resolved = (menu && typeof menu.resolveLineSelection === 'function')
                    ? menu.resolveLineSelection(lineId)
                    : null;

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

                // 菜单 Branch 合并：点击/提交时同时高亮其归并的支线
                if (source !== 'hover') {
                    selectedStationLineIds = selectedLineId && merged.length > 1 ? new Set(merged) : null;
                }

                // 需求：高亮线路时自动切换为站名全显（仅对 click/commit 生效，避免 hover 预览频繁切换）
                if (source !== 'hover' && selectedLineId) setStationLabelMode('all');
                applySelectionEffects();
                if (selectedLineId) {
                    if (source === 'hover') fitToCurrentSelectionPreview(`line:${selectedLineId}`);
                    else fitToCurrentSelectionCommit(`line:${selectedLineId}`);
                }
            },
            onModeClick: ({ lineId, mode }, meta) => {
                const source = meta?.source ?? 'click';
                if (source === 'hover' && !isHoverPreviewEnabled()) return;
                hideStationPopupForMenuInteraction();
                const commitPreview = meta?.commitPreview === true;

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
                // 预留：目前地图高亮/站名过滤仍以 lineId 为主
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

                // 需求：高亮线路时自动切换为站名全显（仅对 click/commit 生效）
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

        // 菜单展开时：用“扣除菜单宽度后的可视区域”重新 fit 当前选中对象
        const refitForMenuOpen = () => {
            if (!isHoverPreviewEnabled()) return;
            if (!selectedCompany && !selectedLineId) return;
            // 用 preview 语义，避免改变“提交态”的选择逻辑
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

                // 仅在“从收起状态唤起”的那次触摸后 refit
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
        const stationsData = generatedStationsData || (await loadRailGeoDataFromDataFolder()).stationsGeoJSON;
        addStationsLayer(map, stationsData);

        // 站点圆点点击：高亮该站点所有 serving_lines（不执行 fitBounds）
        bindClickStationToHighlightServingLines();

        // 确保 stations-layer 创建后立即应用一次“选中线路的站点样式策略”
        applySelectionEffects();

        const markers = createStationMarkers(map, maplibregl, stationsData);
        stationLabels = markers.stationLabels;
        const stationCircles = markers.stationCircles;

        // 站名碰撞：标签上移偏移在 labels.js 内按站点类型设置
        collisionController = setupCollisions(map, stationLabels, stationCircles, {
            gridCellPx: 80,
            // 线路联动：只影响站名（圆点仍按碰撞显示）
            getEnabledLineIds: getEnabledLineIdsForLabels,
            getVisibleStationIds: () => {
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
                    return new Set(getSelectedStationHighlightIds());
                }
                return null;
            },
            // 右上角三段开关：off/auto(碰撞)/all(无视碰撞)
            getLabelMode: () => {
                if (dirPreviewActive) return 'all';
                return stationLabelMode;
            },
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
            getPinnedStationId: () => fixedPopupStationId,
            lineFilterTarget: 'labels'
        });

        collisionController.scheduleUpdate();

        stationPopup = setupStationPopup(map, maplibregl, {
            // 悬浮弹框：用 serving_ids 匹配 lines.geojson 的 meta
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
                    // 需求调整：hover 公司时，不再显示“公司所有线路”，而是显示“通过该站点且属于该公司的线路”
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
                    // 修复：点击 popup 公司时，只高亮“通过该站点且属于该公司”的线路集合
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

                // 其它来源（例如菜单 click）：保持原逻辑，高亮该公司所有线路
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

                const resolved = (menu && typeof menu.resolveLineSelection === 'function')
                    ? menu.resolveLineSelection(id)
                    : null;
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

                // popup click：提交高亮（同“点击线路”效果），但不执行 fitBounds
                popupPreviewSnapshot = null;
                popupPreviewWasApplied = false;
                selectedLineId = mainLineId;
                selectedCompany = null;
                selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
                selectedStationId = null;
                selectedServiceMode = 'all';
                setStationLabelMode('all');
                isolateStationsToSelectedLine = meta?.isolateStations === true;

                // 同步菜单高亮（若菜单存在）
                if (menu && typeof menu.markActive === 'function') {
                    const el = menu.wrapper?.querySelector(`.RW-line-content[data-line-id="${cssEscape(selectedLineId)}"]`);
                    if (el) menu.markActive(el);
                }

                applySelectionEffects();
            },
            onRestoreStationLines: (lineIds) => {
                // popup 内 hover 预览离开：恢复为“该站点所有线路”
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

        // search.js bridge：stations/popup 已可用
        try {
            if (window.TokyoRailSearchMapActions) {
                window.TokyoRailSearchMapActions.isReady = true;
            }
        } catch {
            // ignore
        }

        // 站名标签：鼠标点击/触屏点击打开右侧 panel（popup 不再固定）
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

                // 用于 popup 自动隐藏的“是否在站点上方”判断
                el.addEventListener('mouseenter', () => {
                    stationPopup.setExternalStationHover?.(true);
                    lineHoverPopup?.setExternalStationHover?.(true);
                });
                el.addEventListener('mouseleave', () => {
                    stationPopup.setExternalStationHover?.(false);
                    lineHoverPopup?.setExternalStationHover?.(false);
                });

                // 触屏/笔：按下时只阻止穿透；抬起时满足“短按+小位移”才触发
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
    } catch (e) {
        console.error('站点加载失败', e);
    }
});
