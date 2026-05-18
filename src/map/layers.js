/**
 * 添加线路图层。
 */
import { getGlobalTouchTapGuard } from './touchTapGuard.js';
import { getCachedJson, getCompanyLogoSrc } from '../lib/fetch.js';
import { createLineIconElement, createStationCodeBadgeElement, getResolvedRouteIconMeta } from '../lib/line-icons.js';
import { THROUGH_SERVICE_DISPLAY, isSUStations,THROUGH_SERVICE_CONFIGS_OBJECT } from '../lib/throughServiceManager.js';
import {
    ELEMENT_UI_CONSTANTS,
    isDarkThemeActive,
    buildBaseLineColorExpr,
    buildFocusedLinePaint,
    baseStationCircleRadiusExpr,
    baseStationCircleStrokeWidthExpr,
    buildStationCircleColorPaintExpr,
    stationCircleStrokeColorPaint
} from './element_ui.js';

const toText = (v) => String(v ?? '').trim();
const stripParenText = (v) => toText(v).replace(/（.*?）|\(.*?\)/g, '').trim();

const getCleanLineTitle = (meta, fallbackId) => {
    const title = stripParenText(meta?.title?.['zh-Hans'] || meta?.title?.['zh-Hant'] || meta?.title?.ja || meta?.title?.en || '');
    if (title) return title;
    const name = stripParenText(meta?.name || '');
    return name || toText(fallbackId);
};

const getStationGroupSUFlags = (stationIds = []) => {
    const categories = Object.keys(THROUGH_SERVICE_CONFIGS_OBJECT);
    const flags = Object.fromEntries(categories.map(c => [c, false]));
    
    const sids = Array.isArray(stationIds) ? stationIds : [];
    
    for (const sid of sids) {
        if (categories.every(c => flags[c])) {
            break;
        }

        const value = isSUStations(sid);
        if (!value) continue;

        for (const c of categories) {
            if (value[c]) {
                flags[c] = true;
            }
        }
    }

    return flags;
};

const enhancePopupLineBadges = async ({ popup, mode }) => {
    const root = popup?.getElement?.();
    if (!(root instanceof HTMLElement)) return;

    const lineEls = root.querySelectorAll('.station-hover-line[data-line-id]');
    for (const lineEl of lineEls) {
        if (!(lineEl instanceof HTMLElement)) continue;

        const lineId = toText(lineEl.getAttribute('data-line-id'));
        if (!lineId) continue;

        const fallbackColor = toText(lineEl.style?.color || '');
        const meta = await getResolvedRouteIconMeta(lineId, { color: fallbackColor });

        if (mode === 'line') {
            if (lineEl.querySelector('.rw-line-icon')) continue;
            const icon = createLineIconElement({
                routeId: toText(meta?.id) || lineId,
                code: toText(meta?.code),
                color: toText(meta?.color) || fallbackColor
            });
            if (!icon) continue;
            icon.style.marginRight = '4px';
            lineEl.prepend(icon);
            continue;
        }

        if (mode === 'station') {
            if (!lineEl.querySelector('.rw-line-icon')) {
                const lineCodeAttr = toText(lineEl.getAttribute('data-line-code'));
                const codeRaw = lineCodeAttr || toText(meta?.code);
                const codes = codeRaw.includes('/') ? codeRaw.split('/') : (codeRaw.includes(',') ? codeRaw.split(',') : [codeRaw]);
                
                const frag = document.createDocumentFragment();
                for (const c of codes) {
                    const cTrimmed = c.trim();
                    if (!cTrimmed && codes.length > 1) continue;
                    
                    const icon = createLineIconElement({
                        routeId: toText(meta?.id) || lineId,
                        code: cTrimmed,
                        color: toText(meta?.color) || fallbackColor
                    });
                    if (icon) {
                        const currentSize = parseFloat(icon.style.fontSize) || 12;
                        icon.classList.add('route-map-through-line-icon');
                        if (toText(icon.dataset?.preset) === 'seibu') {
                            icon.classList.add('route-map-through-line-icon-seibu');
                        }
                        icon.style.width = '20px';
                        icon.style.height = '20px';
                        icon.style.fontSize = `${currentSize - 3}px`;
                        icon.style.marginRight = '2px';
                        frag.appendChild(icon);
                    }
                }
                if (frag.childNodes.length > 0) {
                    const last = frag.lastChild;
                    if (last && last.style) last.style.marginRight = '4px';
                    lineEl.prepend(frag);
                }
            }

            if (lineEl.querySelector('.rw-station-code-badge')) continue;
            const stationCode = toText(lineEl.getAttribute('data-station-code'));
            if (!stationCode) continue;
            const badge = createStationCodeBadgeElement({
                code: stationCode,
                color: toText(meta?.color) || fallbackColor
            });
            if (!badge) continue;
            badge.style.marginLeft = '6px';
            const suffixEl = lineEl.querySelector('.station-hover-line-suffix');
            if (suffixEl) {
                badge.style.marginRight = '4px';
                lineEl.insertBefore(badge, suffixEl);
            } else {
                lineEl.append(badge);
            }
        }
    }
};

export function addLinesLayer(map, linesData) {
    map.addSource('lines-source', { type: 'geojson', data: linesData });
    const baseColorExpr = buildBaseLineColorExpr({ isDarkThemeActive: isDarkThemeActive() });
    const paint = buildFocusedLinePaint({ baseColorExpr });
    const lowZoomOffsetPxPerUnit = 4;
    const zBase = ELEMENT_UI_CONSTANTS.stationZoomBase;
    const zMax = ELEMENT_UI_CONSTANTS.stationZoomMax;
    const interpBase = ELEMENT_UI_CONSTANTS.zoomScaleInterpolationBase;
    const widthScaleAtMaxZoom = ELEMENT_UI_CONSTANTS.stationBaseRadiusAtMaxZoom / ELEMENT_UI_CONSTANTS.stationBaseRadius;
    const offsetPxPerUnitAtMaxZoom = lowZoomOffsetPxPerUnit * widthScaleAtMaxZoom;
    const growthPerZoom = Math.pow(offsetPxPerUnitAtMaxZoom / lowZoomOffsetPxPerUnit, 1 / (zMax - zBase));
    const offsetPxPerUnitAtZoom0 = lowZoomOffsetPxPerUnit * Math.pow(growthPerZoom, -zBase);
    const zoom14Progress = Math.max(0, Math.min(1, (14 - zBase) / (zMax - zBase)));
    const zoom14T = (Math.pow(interpBase, zoom14Progress) - 1) / (interpBase - 1);
    const offsetPxPerUnitAtZoom14 = lowZoomOffsetPxPerUnit + (offsetPxPerUnitAtMaxZoom - lowZoomOffsetPxPerUnit) * zoom14T;
    paint['line-offset'] = [
        'interpolate',
        ['exponential', interpBase],
        ['zoom'],
        0,
        ['*', ['coalesce', ['get', 'line_offset_units'], 0], offsetPxPerUnitAtZoom0],
        zBase,
        ['*', ['coalesce', ['get', 'line_offset_units'], 0], lowZoomOffsetPxPerUnit],
        14,
        ['*', ['coalesce', ['get', 'line_offset_units'], 0], offsetPxPerUnitAtZoom14],
        14.01,
        0,
        22,
        0
    ];

    map.addLayer({
        id: 'lines-layer',
        type: 'line',
        source: 'lines-source',
        filter: ['!=', ['get', 'hidden_by_opacity_zero'], 1],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint
    });
}

/**
 * 给线路添加 hover 弹窗（仅显示当前线路，不显示站名）。
 */
export function setupLineHoverPopup(map, maplibregl, options = {}) {
    const hoverMinZoom = Number.isFinite(options.hoverMinZoom) ? options.hoverMinZoom : 9;
    const stationProximityPx = Number.isFinite(options.stationProximityPx) ? Math.max(0, Number(options.stationProximityPx)) : 10;
    const companyLogoMap = options.companyLogoMap || {};
    const getHoverPreviewEnabled = typeof options.getHoverPreviewEnabled === 'function' ? options.getHoverPreviewEnabled : null;

    const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false
    });

    const isEnabled = () => (getHoverPreviewEnabled ? getHoverPreviewEnabled() !== false : true);
    const isDarkThemeActive = () => {
        try {
            return document.documentElement.getAttribute('data-theme') === 'dark';
        } catch {
            return false;
        }
    };

    const escapeHtml = (s) => String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const buildPopupHtml = (props = {}) => {
        const lineId = String(props?.id ?? '').trim();
        const lineName = String(props?.name ?? lineId ?? '').trim() || lineId || '未知线路';
        const company = String(props?.company ?? '').trim();
        const companyZh = String(companyLogoMap?.[company]?.zh || '').trim();
        const companyDisplay = companyZh || company || '未知公司';
        const lineColor = String((isDarkThemeActive() ? (props?._dark_color ?? props?.color) : props?.color) ?? '').trim();

        const logoSrc = getCompanyLogoSrc(company, companyLogoMap) || null;
        const logoHtml = logoSrc
            ? `<img class="station-hover-company-logo" src="${escapeHtml(logoSrc)}" alt="" />`
            : '';

        const lineStyle = lineColor ? ` style="color:${escapeHtml(lineColor)}"` : '';
        const lineIdAttr = lineId ? ` data-line-id="${escapeHtml(lineId)}"` : '';

        return `
            <div class="line-hover-popup">
                <div class="station-hover-company line-hover-company">
                    <div class="station-hover-company-header">${logoHtml}<span class="station-hover-company-name">${escapeHtml(companyDisplay)}</span></div>
                    <div class="station-hover-company-lines">
                        <div class="station-hover-line"${lineIdAttr}${lineStyle}>${escapeHtml(lineName)}</div>
                    </div>
                </div>
            </div>
        `;
    };

    let lastHoverLineId = null;
    let popupShown = false;
    let externalStationHover = false;

    const hidePopup = () => {
        popup.remove();
        popupShown = false;
        lastHoverLineId = null;
    };

    const hasStationNearPoint = (point) => {
        try {
            if (!point || !map.getLayer?.('stations-layer')) return false;
            const x = Number(point.x);
            const y = Number(point.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
            const r = stationProximityPx;
            const bbox = [
                [x - r, y - r],
                [x + r, y + r]
            ];
            const hits = map.queryRenderedFeatures(bbox, { layers: ['stations-layer'] }) || [];
            return hits.length > 0;
        } catch {
            return false;
        }
    };

    const shouldSuppressLineHover = (evt) => {
        if (externalStationHover) return true;
        return hasStationNearPoint(evt?.point);
    };

    map.on('mouseenter', 'lines-layer', (e) => {
        if (!isEnabled()) return;
        const z = typeof map.getZoom === 'function' ? map.getZoom() : null;
        if (typeof z === 'number' && z < hoverMinZoom) return;
        if (shouldSuppressLineHover(e)) {
            map.getCanvas().style.cursor = '';
            if (popupShown) hidePopup();
            return;
        }

        const f = e?.features?.[0];
        const props = f?.properties || {};
        const lineId = String(props?.id ?? f?.id ?? '').trim();
        if (!lineId) return;

        map.getCanvas().style.cursor = 'pointer';
        const html = buildPopupHtml(props);
        popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
        void enhancePopupLineBadges({ popup, mode: 'line' });
        popupShown = true;
        lastHoverLineId = lineId;
    });

    map.on('mousemove', 'lines-layer', (e) => {
        if (!isEnabled()) {
            if (popupShown) hidePopup();
            return;
        }

        if (shouldSuppressLineHover(e)) {
            map.getCanvas().style.cursor = '';
            if (popupShown) hidePopup();
            return;
        }

        const z = typeof map.getZoom === 'function' ? map.getZoom() : null;
        if (typeof z === 'number' && z < hoverMinZoom) {
            if (popupShown) hidePopup();
            return;
        }

        const f = e?.features?.[0];
        const props = f?.properties || {};
        const lineId = String(props?.id ?? f?.id ?? '').trim();
        if (!lineId) {
            if (popupShown) hidePopup();
            return;
        }

        if (!popupShown || lineId !== lastHoverLineId) {
            popup.setHTML(buildPopupHtml(props));
            void enhancePopupLineBadges({ popup, mode: 'line' });
            lastHoverLineId = lineId;
        }

        popup.setLngLat(e.lngLat);
        if (!popupShown) {
            popup.addTo(map);
            void enhancePopupLineBadges({ popup, mode: 'line' });
            popupShown = true;
        }
    });

    map.on('mouseleave', 'lines-layer', () => {
        map.getCanvas().style.cursor = '';
        hidePopup();
    });

    map.on('zoom', () => {
        if (!popupShown) return;
        const z = typeof map.getZoom === 'function' ? map.getZoom() : null;
        if (typeof z === 'number' && z < hoverMinZoom) hidePopup();
    });

    return {
        closePopup: () => hidePopup(),
        setExternalStationHover: (hovering) => {
            externalStationHover = hovering === true;
            if (externalStationHover && popupShown) hidePopup();
        }
    };
}

/**
 * 添加站点圆点图层。
 * - 换乘站：随缩放变化，最大半径 4
 * - 非换乘站：更小的白点（描边为 0）
 */
export function addStationsLayer(map, stationsData) {
    map.addSource('stations-source', { type: 'geojson', data: stationsData });
    const dark = isDarkThemeActive();

    map.addLayer({
        id: 'stations-layer',
        type: 'circle',
        source: 'stations-source',
        filter: ['!=', ['get', 'hidden_by_opacity_zero'], 1],
        paint: {
            'circle-radius': baseStationCircleRadiusExpr(),
            'circle-color': buildStationCircleColorPaintExpr({
                isDarkThemeActive: dark,
                lineColorById: new Map()
            }),
            'circle-stroke-width': baseStationCircleStrokeWidthExpr(),
            'circle-stroke-color': stationCircleStrokeColorPaint({ isDarkThemeActive: dark })
        }
    });
}

/**
 * 给站点圆点添加 hover 弹窗。
 */
export function setupStationPopup(map, maplibregl, options = {}) {
    const touchTapGuard = getGlobalTouchTapGuard({ maxDurationMs: 500, maxMovePx: 12 });

    const getLineMeta = typeof options.getLineMeta === 'function' ? options.getLineMeta : (() => null);
    const companyLogoMap = options.companyLogoMap || {};
    const railwaysOrderIndex = options.railwaysOrderIndex instanceof Map ? options.railwaysOrderIndex : null;
    const hoverDelayMs = Number.isFinite(options.hoverDelayMs) ? options.hoverDelayMs : 500;
    const hoverMinZoom = Number.isFinite(options.hoverMinZoom) ? options.hoverMinZoom : 9;
    const onSelectCompany = typeof options.onSelectCompany === 'function' ? options.onSelectCompany : null;
    const onSelectLine = typeof options.onSelectLine === 'function' ? options.onSelectLine : null;
    const onPopupClose = typeof options.onPopupClose === 'function' ? options.onPopupClose : null;
    const onRestoreStationLines = typeof options.onRestoreStationLines === 'function' ? options.onRestoreStationLines : null;
    const onFixedPopupBlankClick = typeof options.onFixedPopupBlankClick === 'function' ? options.onFixedPopupBlankClick : null;
    const getHoverPreviewEnabled = typeof options.getHoverPreviewEnabled === 'function' ? options.getHoverPreviewEnabled : null;
    let hoverPreviewEnabled = getHoverPreviewEnabled ? getHoverPreviewEnabled() !== false : true;
    const isHoverPreviewEnabled = () => hoverPreviewEnabled !== false;

    let stationsIndexPromise = null;
    const getStationsIndex = async () => {
        if (stationsIndexPromise) return stationsIndexPromise;
        stationsIndexPromise = (async () => {
            try {
                const list = await getCachedJson('./data/stations.json');
                const idToNameZh = new Map();
                const idToCode = new Map();
                for (const s of Array.isArray(list) ? list : []) {
                    const id = String(s?.id ?? '').trim();
                    if (!id) continue;
                    const t = s?.title || {};
                    const name = String(t['zh-Hans'] || t.zh || t.ja || t.en || '').trim();
                    if (name) idToNameZh.set(id, name);
                    const stationCode = String(s?.code ?? t?.code ?? '').trim();
                    if (stationCode) idToCode.set(id, stationCode);
                }
                return { idToNameZh, idToCode };
            } catch {
                return { idToNameZh: new Map(), idToCode: new Map() };
            }
        })();
        return stationsIndexPromise;
    };

    let stationGroupsIndexPromise = null;
    const getStationGroupsIndex = async () => {
        if (stationGroupsIndexPromise) return stationGroupsIndexPromise;
        stationGroupsIndexPromise = (async () => {
            try {
                const groups = await getCachedJson('./data/station-groups.json');
                const map = new Map();
                for (const g of Array.isArray(groups) ? groups : []) {
                    if (!Array.isArray(g)) continue;
                    const ids = [];
                    const seen = new Set();
                    for (const chunk of g) {
                        if (!Array.isArray(chunk)) continue;
                        for (const sid of chunk) {
                            const id = String(sid ?? '').trim();
                            if (!id || seen.has(id)) continue;
                            seen.add(id);
                            ids.push(id);
                        }
                    }
                    if (!ids.length) continue;
                    for (const id of ids) map.set(id, ids);
                }
                return map;
            } catch {
                return new Map();
            }
        })();
        return stationGroupsIndexPromise;
    };

    const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false
    });

    // 触屏适配：单击站点 = hover（只显示 popup），避免触屏触发 hover 预览导致“直接选中线路”
    let lastPointerType = 'mouse';
    let suppressMouseEventsUntilMs = 0;
    const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
    const isTouchLikePointer = (pt) => pt === 'touch' || pt === 'pen';
    const readPointerType = (evt) => {
        const pt = evt?.pointerType;
        if (pt) return pt;
        const t = evt?.type;
        if (t && String(t).startsWith('touch')) return 'touch';
        return 'mouse';
    };

    const canvas = map.getCanvas?.();
    if (canvas && canvas.addEventListener) {
        canvas.addEventListener(
            'pointerdown',
            (evt) => {
                lastPointerType = readPointerType(evt);
                if (isTouchLikePointer(lastPointerType)) {
                    suppressMouseEventsUntilMs = nowMs() + 800;
                }
            },
            { passive: true }
        );
    }

    let isOverStation = false;
    let isOverPopup = false;
    let hideTimerId = null;
    let boundPopupEl = null;
    let committedInPopup = false;

    // popup 打开模式：
    // - hover：鼠标悬浮站点弹出（只读，禁止交互），离开站点/弹框后自动关闭
    // - fixed：鼠标/触屏点击站点弹出（可交互），固定在地图上，点击空白处才关闭
    let popupOpenMode = null; // 'hover' | 'fixed' | null

    // 触屏：固定 popup 内两段式点击（第一次 = 预览；第二次同一线路 = 提交并关闭）
    let tapArmedKey = null;

    // 当前 popup 所属站点的 serving_ids（用于离开单条线路 hover 时恢复）
    let currentStationServingIds = [];

    // 当前已应用的 hover 预览对象（line:/company:）
    let lastAppliedHoverKey = null;

    // 线路 hover 预览离开后的“恢复站点线路”延迟（避免在两条线路之间移动时闪烁）
    let restoreTimerId = null;
    const restoreDelayMs = Math.max(hoverDelayMs, 60);

    const clearRestoreTimer = () => {
        if (restoreTimerId != null) {
            clearTimeout(restoreTimerId);
            restoreTimerId = null;
        }
    };

    let hoverTimerId = null;
    let hoverCandidateKey = null;
    let lastFiredHoverKey = null;

    const clearHoverTimer = () => {
        if (hoverTimerId != null) {
            clearTimeout(hoverTimerId);
            hoverTimerId = null;
        }
    };

    const clearHideTimer = () => {
        if (hideTimerId != null) {
            clearTimeout(hideTimerId);
            hideTimerId = null;
        }
    };

    const unbindPopupEl = () => {
        if (!boundPopupEl) return;
        boundPopupEl.removeEventListener('mouseenter', onPopupEnter);
        boundPopupEl.removeEventListener('mouseleave', onPopupLeave);
        boundPopupEl.removeEventListener('mousemove', onPopupMove);
        boundPopupEl.removeEventListener('click', onPopupClick);
        boundPopupEl.removeEventListener('pointerdown', onPopupPointerDown);
        boundPopupEl.removeEventListener('mousedown', stopPropagation);
        boundPopupEl.removeEventListener('wheel', stopPropagation);
        boundPopupEl = null;
    };

    const restoreStationLinesIfNeeded = () => {
        if (popupOpenMode !== 'fixed') return;
        if (!lastAppliedHoverKey) return;
        if (typeof onRestoreStationLines !== 'function') {
            lastAppliedHoverKey = null;
            return;
        }

        try {
            onRestoreStationLines(Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []);
        } catch {
            // ignore
        }
        lastAppliedHoverKey = null;
    };

    const scheduleRestoreStationLines = () => {
        if (popupOpenMode !== 'fixed') return;
        if (!lastAppliedHoverKey) return;
        if (typeof onRestoreStationLines !== 'function') {
            lastAppliedHoverKey = null;
            return;
        }

        clearRestoreTimer();
        restoreTimerId = setTimeout(() => {
            restoreTimerId = null;
            restoreStationLinesIfNeeded();
        }, restoreDelayMs);
    };

    const removePopupNow = ({ committed } = {}) => {
        clearHideTimer();
        clearHoverTimer();
        clearRestoreTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        tapArmedKey = null;
        popupOpenMode = null;
        currentStationServingIds = [];
        lastAppliedHoverKey = null;

        popup.remove();

        if (typeof onPopupClose === 'function') {
            try {
                onPopupClose({ committed: committed === true });
            } catch {
                // ignore
            }
        }

        unbindPopupEl();
    };

    const tryHidePopup = () => {
        if (popupOpenMode !== 'hover') return;
        clearHideTimer();
        // 需求调整：hover popup 不应因鼠标移入 popup 而保持；只要移出站点就隐藏
        hideTimerId = setTimeout(() => {
            hideTimerId = null;
            if (!isOverStation) {
                removePopupNow({ committed: committedInPopup });
            }
        }, 50);
    };

    const onPopupEnter = () => {
        // hover 打开的弹框：移入 popup 不应阻止隐藏
        if (popupOpenMode === 'hover') return;
        isOverPopup = true;
        clearHideTimer();
        clearRestoreTimer();
    };

    const onPopupLeave = () => {
        isOverPopup = false;
        clearHoverTimer();
        clearRestoreTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        tapArmedKey = null;
        restoreStationLinesIfNeeded();
        if (popupOpenMode === 'hover') tryHidePopup();
    };

    const stopPropagation = (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
    };

    const onPopupPointerDown = (evt) => {
        const pt = readPointerType(evt);
        if (!isTouchLikePointer(pt)) return;

        // hover 打开的弹框：禁止交互
        if (popupOpenMode !== 'fixed') {
            stopPropagation(evt);
            return;
        }

        lastPointerType = pt;
        suppressMouseEventsUntilMs = nowMs() + 800;

        const t = getInteractiveTarget(evt);
        if (!t) {
            // 仍然要阻止事件穿透到地图（避免拖拽/缩放）
            stopPropagation(evt);
            return;
        }

        stopPropagation(evt);
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;

        const key = `${t.kind}:${t.value}`;

        // 触屏：线路需要双击提交
        if (t.kind === 'line') {
            if (tapArmedKey !== key) {
                tapArmedKey = key;
                committedInPopup = false;
                // 第一次：当作预览
                if (typeof onSelectLine === 'function') onSelectLine(String(t.value), { source: 'popup-hover' });
                return;
            }

            // 第二次：提交并关闭
            tapArmedKey = null;
            committedInPopup = true;
            if (typeof onSelectLine === 'function') onSelectLine(String(t.value), { source: 'popup-click', isolateStations: true });
            removePopupNow({ committed: true });
            return;
        }

        // 公司：单击提交（不关闭）
        tapArmedKey = null;
        committedInPopup = true;
        if (t.kind === 'company') {
            if (typeof onSelectCompany === 'function') {
                onSelectCompany(String(t.value), {
                    source: 'popup-click',
                    stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
                });
            }
            // 需求：点击公司后也关闭 popup
            removePopupNow({ committed: true });
        }
    };

    const getInteractiveTarget = (evt) => {
        const target = evt?.target;
        if (!target || !boundPopupEl) return null;

        const lineEl = target.closest?.('[data-line-id]');
        if (lineEl && boundPopupEl.contains(lineEl)) {
            const lineId = lineEl.getAttribute('data-line-id');
            return lineId ? { kind: 'line', value: String(lineId) } : null;
        }

        const companyEl = target.closest?.('[data-company]');
        if (companyEl && boundPopupEl.contains(companyEl)) {
            const company = companyEl.getAttribute('data-company');
            return company ? { kind: 'company', value: String(company) } : null;
        }

        return null;
    };

    const onPopupMove = (evt) => {
        // hover 打开的弹框：禁止交互
        if (popupOpenMode !== 'fixed') return;
        if (!isHoverPreviewEnabled()) {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            return;
        }

        // 触屏：不做 hover 预览（避免手指抬起时的合成 mousemove 导致“自动选中线路”）
        if (isTouchLikePointer(lastPointerType)) return;

        const t = getInteractiveTarget(evt);
        if (!t) {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            return;
        }

        // 两条线路之间移动时，鼠标可能短暂落在容器上：这里用延迟恢复避免闪烁
        if (t.kind !== 'line' && t.kind !== 'company') {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            return;
        }

        // 进入其他类型元素后再回来时，允许重新触发 hover
        if (lastFiredHoverKey && !String(lastFiredHoverKey).startsWith(`${t.kind}:`)) {
            lastFiredHoverKey = null;
        }

        // 进入可交互元素：取消待恢复
        clearRestoreTimer();

        const key = `${t.kind}:${t.value}`;
        if (key === hoverCandidateKey) return;

        clearHoverTimer();
        hoverCandidateKey = key;

        if (key === lastFiredHoverKey) return;

        hoverTimerId = setTimeout(() => {
            hoverTimerId = null;
            if (!boundPopupEl || !isOverPopup) return;
            if (hoverCandidateKey !== key) return;
            lastFiredHoverKey = key;

            if (t.kind === 'line' && typeof onSelectLine === 'function') {
                onSelectLine(String(t.value), { source: 'popup-hover' });
                lastAppliedHoverKey = `line:${String(t.value)}`;
            } else if (t.kind === 'company' && typeof onSelectCompany === 'function') {
                onSelectCompany(String(t.value), { source: 'popup-hover', stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : [] });
                lastAppliedHoverKey = `company:${String(t.value)}`;
            }
        }, hoverDelayMs);
    };

    const onPopupClick = (evt) => {
        // hover 打开的弹框：禁止交互
        if (popupOpenMode !== 'fixed') {
            // 仍然阻止事件穿透到地图，避免点击弹框文本触发“点击空白处”逻辑
            stopPropagation(evt);
            return;
        }

        // 触屏/笔：由 pointerdown 完整接管两段式交互；忽略 click，避免第一下就被当成“第二下提交”
        if (isTouchLikePointer(lastPointerType)) {
            stopPropagation(evt);
            return;
        }

        const t = getInteractiveTarget(evt);
        if (!t) return;

        stopPropagation(evt);
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;

        committedInPopup = true;

        if (t.kind === 'line') {
            if (typeof onSelectLine === 'function') onSelectLine(String(t.value), { source: 'popup-click', isolateStations: true });
            // 需求：点击弹出的 popup 中，鼠标单击线路后关闭 popup
            removePopupNow({ committed: true });
            return;
        }

        if (t.kind === 'company' && typeof onSelectCompany === 'function') {
            onSelectCompany(String(t.value), {
                source: 'popup-click',
                stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
            });
            // 需求：点击公司后也关闭 popup
            removePopupNow({ committed: true });
        }
    };

    const bindPopupHover = () => {
        const el = popup.getElement?.();
        if (!el || el === boundPopupEl) return;

        unbindPopupEl();

        boundPopupEl = el;
        boundPopupEl.addEventListener('mouseenter', onPopupEnter);
        boundPopupEl.addEventListener('mouseleave', onPopupLeave);
        boundPopupEl.addEventListener('mousemove', onPopupMove);
        boundPopupEl.addEventListener('click', onPopupClick);
        boundPopupEl.addEventListener('pointerdown', onPopupPointerDown, { passive: false });
        boundPopupEl.addEventListener('mousedown', stopPropagation);
        boundPopupEl.addEventListener('wheel', stopPropagation, { passive: false });
    };

    const escapeHtml = (s) => String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const buildPopupHtml = async (props = {}, meta = {}) => {
        const name = props.name_zh || props.name || '';
        const interactive = meta?.interactive === true;
        const normalizeArrayLike = (value) => {
            if (Array.isArray(value)) return value;
            if (typeof value !== 'string') return value ? [value] : [];

            const s = value.trim();
            // 兼容：某些数据源会把数组写成 JSON 字符串（例如 "[\"A\",\"B\"]"）
            if (s.startsWith('[') && s.endsWith(']')) {
                try {
                    const parsed = JSON.parse(s);
                    return Array.isArray(parsed) ? parsed : [value];
                } catch {
                    return [value];
                }
            }
            return s ? [s] : [];
        };

        const servingIdsRaw = normalizeArrayLike(props.serving_ids);
        const servingIds = servingIdsRaw.map(String).filter(Boolean);

        const stationId = String(props?.id ?? '').trim();
        const currentStationNameZh = String(props?.name_zh || props?.['name:zh'] || name || '').trim();
        const platformLineIdsRaw = normalizeArrayLike(props?.platform_line_id);
        const currentPlatformLineId = String(platformLineIdsRaw?.[0] ?? '').trim();

        const lineStationNameByLineId = new Map();
        const lineStationCodeByLineId = new Map();
        
        // ==========================================
        // 优化点 1：使用 THROUGH_SERVICE_CONFIGS_OBJECT 动态初始化 Flags 和 Codes 对象
        // 彻底杜绝硬编码 { UenoTokyo: false, ... }
        // ==========================================
        const suCategories = Object.keys(THROUGH_SERVICE_CONFIGS_OBJECT);
        let stationGroupSUFlags = Object.fromEntries(suCategories.map(c => [c, false]));
        let stationGroupSUCodes = Object.fromEntries(suCategories.map(c => [c, new Set()]));

        if (stationId) {
            try {
                const [groupsIndex, stationsIndex] = await Promise.all([getStationGroupsIndex(), getStationsIndex()]);
                const groupIds = Array.from(new Set([stationId, ...((groupsIndex.get(stationId) || [stationId]).map((sid) => String(sid ?? '').trim()).filter(Boolean))]));
                stationGroupSUFlags = getStationGroupSUFlags(groupIds);

                // ==========================================
                // 优化点 2：动态收集各直通线路的车站代码，消除重复的 if 判断
                // ==========================================
                for (const sid of groupIds) {
                    const c = String(stationsIndex?.idToCode?.get?.(sid) || '').trim();
                    if (!c) continue;
                    const flags = getStationGroupSUFlags([sid]);
                    
                    for (const category of suCategories) {
                        if (flags[category]) {
                            stationGroupSUCodes[category].add(c);
                        }
                    }
                }

                for (const lineIdRaw of servingIds) {
                    const lineId = String(lineIdRaw ?? '').trim();
                    if (!lineId) continue;
                    const candidateId = groupIds.find((sid) => {
                        const id = String(sid ?? '').trim();
                        return id && (id === lineId || id.startsWith(`${lineId}.`));
                    });
                    if (!candidateId) continue;
                    const n = String(stationsIndex?.idToNameZh?.get?.(candidateId) || '').trim();
                    if (n) lineStationNameByLineId.set(lineId, n);
                    const c = String(stationsIndex?.idToCode?.get?.(candidateId) || '').trim();
                    if (c) lineStationCodeByLineId.set(lineId, c);
                }
            } catch {
                // ignore
            }
        }

        currentStationServingIds = servingIds.slice();

        const nameHtml = `<div class="station-hover-name">${escapeHtml(name)}</div>`;

        const rootClass = interactive ? 'station-hover-popup is-interactive' : 'station-hover-popup';

        if (!servingIds.length) {
            return `<div class="${rootClass}">${nameHtml}</div>`;
        }

        // 需求：
        // 1) 用 serving_ids 匹配线路元数据里的 company/name/color
        // 2) 按 company 分组显示，公司单独一行（含 logo）
        // 3) abb 从 companyLogoMap 取，缺失则用公司全名
        // 4) 线路名去掉 abb（除非仅由 abb+线/本线/新线 构成）

        const groups = new Map(); // company -> [{ lineId, displayName, color }]
        const seenLineIds = new Set();
        const toRailwaysOrderKey = (lineId) => {
            const raw = String(lineId ?? '').trim();
            if (!raw) return '';
            const parts = raw.split('.');
            const company = String(parts[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const name = String(parts.slice(1).join('') ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!company || !name) return '';
            return `${company}-${name}`;
        };

        // 以 serving_ids 为准：company/name/color 都来自线路元数据
        for (const lineId of servingIds) {
            const id = String(lineId);
            if (!id || seenLineIds.has(id)) continue;
            seenLineIds.add(id);

            const meta = getLineMeta(id);
            const company = (meta?.company ? String(meta.company) : '未知公司').trim() || '未知公司';
            const color = meta?.color || null;
            const abb = companyLogoMap?.[company]?.abb || company;
            const rawTitle = getCleanLineTitle(meta, id);

            let displayName = rawTitle;
            const displayColor = color;

            const isSpecial = (displayName === `${abb}线` || displayName === `${abb}本线` || displayName === `${abb}新线`);
            if (!isSpecial && abb) displayName = displayName.replace(abb, '').trim();
            displayName = stripParenText(displayName) || id;

            if (!groups.has(company)) groups.set(company, []);
            groups.get(company).push({ lineId: id, displayName, color: displayColor, stationCode: String(lineStationCodeByLineId.get(id) || '').trim() });
        }

        if (!groups.size) {
            return `<div class="${rootClass}">${nameHtml}</div>`;
        }

        let companiesHtml = '';
        for (const [company, lines] of groups) {
            // 同公司内线路排序：按 /data/railways-order.json 的顺序（若提供）
            const sortedLines = (() => {
                if (!railwaysOrderIndex || !railwaysOrderIndex.size) return Array.isArray(lines) ? lines : [];
                const src = Array.isArray(lines) ? lines : [];
                const decorated = src.map((line, idx) => {
                    const k = toRailwaysOrderKey(line?.lineId);
                    const r = k ? railwaysOrderIndex.get(k) : undefined;
                    const rank = (typeof r === 'number' && Number.isFinite(r)) ? r : Number.POSITIVE_INFINITY;
                    return { line, idx, rank };
                });
                decorated.sort((a, b) => {
                    const aFinite = Number.isFinite(a.rank);
                    const bFinite = Number.isFinite(b.rank);
                    if (aFinite !== bFinite) return aFinite ? -1 : 1;
                    if (aFinite && bFinite && a.rank !== b.rank) return b.rank - a.rank;
                    return a.idx - b.idx;
                });
                return decorated.map((x) => x.line);
            })();

            const companyZh = companyLogoMap?.[company]?.zh || null;
            const companyDisplay = String(companyZh || company);

            const logoSrc = getCompanyLogoSrc(company, companyLogoMap) || null;
            const logoHtml = logoSrc
                ? `<img class="station-hover-company-logo" src="${escapeHtml(logoSrc)}" alt="" />`
                : '';

            // ==========================================
            // 优化点 3：利用 THROUGH_SERVICE_CONFIGS_OBJECT 的 operator 动态判断是否注入直通运转数据
            // 彻底摒弃了 if (company === 'JR-East') 和内部硬编码
            // ==========================================
            const throughServiceLines = [];
            for (const [category, info] of Object.entries(THROUGH_SERVICE_CONFIGS_OBJECT)) {
                // 仅当当前遍历的公司与配置中的 operator 匹配，且拥有该线路的 flag 时才添加
                if (company === info.operator && stationGroupSUFlags[category]) {
                    throughServiceLines.push({
                        key: category,
                        // 优先读 THROUGH_SERVICE_CONFIGS_OBJECT 里的配置，兼容老的 THROUGH_SERVICE_DISPLAY
                        displayName: info.lineName || THROUGH_SERVICE_DISPLAY?.[category]?.name || '',
                        color: info.color || THROUGH_SERVICE_DISPLAY?.[category]?.color || '',
                        // 智能拼接 code：如果配置是数组 ['JU', 'JT'] 就用 / 连起来，变成 'JU/JT'
                        code: Array.isArray(info.codes) ? info.codes.join('/') : (info.codes || ''),
                        stationCode: Array.from(stationGroupSUCodes[category] || []).join(',')
                    });
                }
            }

            // 去重放在“原线路 + 追加项”都准备好之后，判断口径仍然是最终展示名。
            const dedupedLines = [];
            const seenDisplayNames = new Set();
            for (const line of [...sortedLines, ...throughServiceLines]) {
                const candidateName = line.key 
                ? String(line.displayName).trim() 
                : (stripParenText(String(line?.displayName ?? '')).trim() || String(line?.lineId ?? '').trim());
                if (!candidateName) continue;
                if (seenDisplayNames.has(candidateName)) continue;
                seenDisplayNames.add(candidateName);
                dedupedLines.push(line);
            }

            let linesHtml = '';
            for (const line of dedupedLines) {
                const style = (typeof line.color === 'string' && line.color.trim())
                    ? ` style="color:${escapeHtml(line.color.trim())}"`
                    : '';
                const lineIdAttr = line.key 
                    ? ` data-line-id="${escapeHtml(String(line.key))}"`
                    : line.lineId 
                        ? ` data-line-id="${escapeHtml(String(line.lineId))}"` 
                        : '';
                const lineId = String(line.lineId ?? '').trim();
                let stationCode = String(line.stationCode || lineStationCodeByLineId.get(lineId) || '').trim();
                const stationCodeAttr = stationCode ? ` data-station-code="${escapeHtml(stationCode)}"` : '';
                const lineCodeAttr = line.code ? ` data-line-code="${escapeHtml(line.code)}"` : '';
                const isTransferStation = servingIds.length > 1;
                const isCurrentLine = !!lineId && !!currentPlatformLineId && lineId === currentPlatformLineId;
                const transferStationName = String(lineStationNameByLineId.get(lineId) || '').trim();
                const showTransferNameSuffix = !!transferStationName && !!currentStationNameZh && transferStationName !== currentStationNameZh;

                const suffixParts = [];
                if (showTransferNameSuffix) {
                    suffixParts.push(`（${transferStationName}站）`);
                }
                const suffixHtml = suffixParts.length
                    ? `<span class="station-hover-line-suffix">${escapeHtml(suffixParts.join(''))}</span>`
                    : '';
                const currentClass = isTransferStation && isCurrentLine ? ' is-current' : '';

                linesHtml += `<div class="station-hover-line${currentClass}"${lineIdAttr}${stationCodeAttr}${lineCodeAttr}${style}>${escapeHtml(line.displayName)}${suffixHtml}</div>`;
            }

            companiesHtml += `
                <div class="station-hover-company">
                    <div class="station-hover-company-header" data-company="${escapeHtml(company)}">${logoHtml}<span class="station-hover-company-name">${escapeHtml(companyDisplay)}</span></div>
                    <div class="station-hover-company-lines">${linesHtml}</div>
                </div>
            `;
        }

        return `<div class="${rootClass}">${nameHtml}${companiesHtml}</div>`;
    };

    map.on('mouseenter', 'stations-layer', async (e) => {
        if (!isHoverPreviewEnabled()) return;
        // 触屏会产生合成 mouseenter：这里直接忽略，改用 click 来显示 popup
        if (nowMs() < suppressMouseEventsUntilMs || isTouchLikePointer(lastPointerType)) return;

        // 固定弹框存在时，不响应 hover
        if (popupOpenMode === 'fixed') return;

        // 缩放过小：禁用“鼠标 hover 站点弹窗”
        const z = typeof map.getZoom === 'function' ? map.getZoom() : null;
        if (typeof z === 'number' && z < hoverMinZoom) {
            map.getCanvas().style.cursor = '';
            return;
        }

        map.getCanvas().style.cursor = 'pointer';
        isOverStation = true;
        clearHideTimer();
        committedInPopup = false;
        popupOpenMode = 'hover';
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        const coordinates = e.features[0].geometry.coordinates.slice();
        const props = e.features[0].properties || {};
        const html = await buildPopupHtml(props, { interactive: false });
        popup.setLngLat(coordinates).setHTML(html).addTo(map);
        void enhancePopupLineBadges({ popup, mode: 'station' });
        bindPopupHover();
    });

    map.on('mouseleave', 'stations-layer', () => {
        if (!isHoverPreviewEnabled()) return;
        if (nowMs() < suppressMouseEventsUntilMs || isTouchLikePointer(lastPointerType)) return;
        map.getCanvas().style.cursor = '';
        isOverStation = false;
        if (popupOpenMode === 'hover') tryHidePopup();
    });

    // 点击站点/空白处不再打开/固定 popup：交互迁移到右侧 panel。

    // 外部触发（例如：站名 DOM 标签点击）
    const showPopupAt = async (coordinates, props = {}, meta = {}) => {
        if (!coordinates) return;

        const pt = meta?.pointerType;
        if (pt) {
            lastPointerType = String(pt);
            if (isTouchLikePointer(lastPointerType)) {
                suppressMouseEventsUntilMs = nowMs() + 800;
            }
        }

        popupOpenMode = 'fixed';
        committedInPopup = false;
        clearHideTimer();
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;

        const html = await buildPopupHtml(props, { interactive: true });
        popup.setLngLat(coordinates).setHTML(html).addTo(map);
        void enhancePopupLineBadges({ popup, mode: 'station' });
        bindPopupHover();
    };

    const setExternalStationHover = (over) => {
        if (popupOpenMode !== 'hover') return;
        isOverStation = over === true;
        if (isOverStation) {
            clearHideTimer();
            return;
        }
        tryHidePopup();
    };

    return {
        showPopupAt,
        setExternalStationHover,
        setHoverPreviewEnabled: (enabled) => {
            hoverPreviewEnabled = enabled !== false;
            if (hoverPreviewEnabled) return;
            clearHoverTimer();
            clearRestoreTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            if (popupOpenMode === 'hover') {
                removePopupNow({ committed: false });
            }
        },
        getOpenMode: () => popupOpenMode,
        closePopup: ({ committed } = {}) => {
            // 用于：外部 UI（例如菜单）切换选择时，关闭固定 popup 并清理其内部选中/预览状态。
            removePopupNow({ committed: committed !== false });
        }
    };
}
