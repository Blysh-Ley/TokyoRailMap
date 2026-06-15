/**
 * route-map-ui.js
 *
 * UI feature:
 * 1) Hover on .panel-line-name shows a trip-detail-like floating panel.
 * 2) Click on .panel-line-name pins/unpins the panel.
 * 3) Renders a vertical (transposed) stop-pattern diagram for the current line only.
 *    - Type order follows the rendered .panel-grid-hint-content order (when available).
 *    - Local/All-stop use gray; missing colors also use gray.
 */

import { computeLineStopDiagramData } from './route-map.js';
import { captureRouteMapImage, requestRouteMapLineTimetablesPrint } from './route-map-actions.js';
import { TYPE_BASE_SEQUENCE, sortTypeNamesByBaseAndStopCount } from '../../lib/train-type-sort.js';
import { createLineIconElement, createStationCodeBadgeElement, getResolvedRouteIconMeta } from '../../lib/line-icons.js';
import { getCachedJson, getCompanyLogoSrc, getIconCandidates, getPreferredCachedImageSrc, setImageElementFromCache } from '../../lib/fetch.js';
import { previewBranchesForLine } from '../../map/analyze_branch.js';
import { isExcludedLineType, preferredOrder } from '../../lib/special-condition.js';
import { getTransferStationIdsByStationId } from '../../app.js';
import { MENU_THROUGH_LINE_IDS, THROUGH_SERVICE_CONFIGS_OBJECT, THROUGH_SERVICE_DISPLAY, isSUStations as isStationSUStations } from '../../lib/throughServiceManager.js';
import {
    DEFAULT_MOBILE_SHEET_PEEK_PX,
    clampMobileSheetOffset,
    getMobileSheetOffsetForState,
    getNearestMobileSheetStateByOffset
} from '../../ui/mobileSheetSnap.js';
import {
    appendStationJumpClass,
    resolveStationJumpIntent
} from '../../ui/stationJump.js';

const toText = (v) => String(v ?? '').trim();

let stationCodeIndexPromise = null;
const getStationCodeIndex = async () => {
    if (stationCodeIndexPromise) return stationCodeIndexPromise;
    stationCodeIndexPromise = (async () => {
        try {
            const list = await getCachedJson('./data/stations.json');
            const map = new Map();
            for (const s of Array.isArray(list) ? list : []) {
                const id = toText(s?.id);
                const code = toText(s?.title?.code || '');
                if (!id || !code) continue;
                map.set(id, code);
            }
            return map;
        } catch {
            return new Map();
        }
    })();
    return stationCodeIndexPromise;
};

let railwayMetaIndexPromise = null;
const getRailwayMetaIndex = async () => {
    if (railwayMetaIndexPromise) return railwayMetaIndexPromise;
    railwayMetaIndexPromise = (async () => {
        try {
            const list = await getCachedJson('./data/railways.json');
            const map = new Map();
            for (const row of Array.isArray(list) ? list : []) {
                const id = toText(row?.id);
                if (!id) continue;
                map.set(id, row);
            }
            return map;
        } catch {
            return new Map();
        }
    })();
    return railwayMetaIndexPromise;
};

const getRouteIdFromStationId = (stationId) => {
    const sid = toText(stationId);
    if (!sid) return '';
    const parts = sid.split('.').map((p) => toText(p)).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
    return parts[0] || '';
};

export const SU_SERVICE_INFO_BY_KEY = THROUGH_SERVICE_CONFIGS_OBJECT;

const getTransferSUFlags = ({ selfRouteId, routeIds } = {}) => {
    const ids = new Set([
        toText(selfRouteId),
        ...(Array.isArray(routeIds) ? routeIds.map((x) => toText(x)).filter(Boolean) : [])
    ]);

return Object.fromEntries(
        Object.entries(THROUGH_SERVICE_CONFIGS_OBJECT).map(([category, info]) => [
            category,                                
            info.routeIds.some((rid) => ids.has(rid)) 
        ])
    );
};
const enhanceRouteMapStationCodeBadges = async (containerEl, { lineId, lineColor } = {}) => {
    if (!(containerEl instanceof HTMLElement)) return;

    const codeMap = await getStationCodeIndex();
    let badgeColor = toText(lineColor);
    if (!badgeColor) {
        const lineMeta = await getResolvedRouteIconMeta(toText(lineId));
        badgeColor = toText(lineMeta?.color || '');
    }

    const stationEls = containerEl.querySelectorAll('.route-map-station[data-station-id]:not(.is-through-label)');
    for (const stEl of stationEls) {
        if (!(stEl instanceof HTMLElement)) continue;
        if (stEl.querySelector('.rw-station-code-badge')) continue;

        const sid = toText(stEl.getAttribute('data-station-id'));
        if (!sid) continue;
        const code = toText(codeMap.get(sid) || '');
        if (!code) continue;

        const badge = createStationCodeBadgeElement({ code, color: badgeColor });
        if (!badge) continue;
        badge.style.marginRight = '4px';
        badge.style.verticalAlign = 'middle';

        stEl.insertBefore(badge, stEl.firstChild);
    }
};

const renderRouteMapTitleWithIcon = async (titleEl, lineId, lineName) => {
    if (!(titleEl instanceof HTMLElement)) return;

    const safeId = toText(lineId);
    const safeName = toText(lineName) || safeId;

    titleEl.textContent = '';

    const textSpan = document.createElement('span');
    textSpan.className = 'route-map-title-text';
    textSpan.textContent = safeName;

    const meta = await getResolvedRouteIconMeta(safeId);
    if (meta && (meta.code || meta.color) ) {
        const icon = createLineIconElement({ routeId: meta.id, code: meta.code, color: meta.color });
        if (icon) {
            icon.style.marginRight = '4px';
            titleEl.appendChild(icon);
        }
    }

    titleEl.appendChild(textSpan);
};

const isTypeInBaseSequence = (typeNameRaw) => {
    const typeName = toText(typeNameRaw);
    if (!typeName) return false;
    const baseKeywords = TYPE_BASE_SEQUENCE
        .map((kw) => toText(kw))
        .filter(Boolean);
    return baseKeywords.some((kw) => typeName.includes(kw));
};

const shouldDisplayRouteMapType = (typeInfo, lineId) => {
    const typeId = toText(typeInfo?.typeId);
    if (isExcludedLineType(lineId, typeId)) return false;
    const typeName = toText(typeInfo?.typeName);
    return isTypeInBaseSequence(typeName);
};

const stopPropagationOnly = (evt) => {
    try {
        evt?.stopPropagation?.();
    } catch {
        // ignore
    }
};

const stopEvent = (evt) => {
    try {
        evt?.preventDefault?.();
        evt?.stopPropagation?.();
    } catch {
        // ignore
    }
};

const escapeHtml = (s) =>
    String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

const ROUTE_MAP_STYLE_HREF = './src/styles/route-map.css';

const ensureStyleInstalled = () => {
    if (document.querySelector('link[data-route-map-style="1"], style[data-route-map-style="1"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ROUTE_MAP_STYLE_HREF;
    link.setAttribute('data-route-map-style', '1');
    document.head.appendChild(link);
};

const getCurrentServiceDayFromPanelDom = () => {
    // panel.js toggles is-active on the two buttons
    const active = document.querySelector('.panel-day-seg button.is-active[data-day]');
    const day = toText(active?.getAttribute?.('data-day'));
    if (day === 'Weekday' || day === 'SaturdayHoliday') return day;
    return 'Weekday';
};

const isEnglishTypeHeadText = (value) => {
    const s = toText(value);
    if (!s) return false;
    if (!/[A-Za-z]/.test(s)) return false;
    return /^[A-Za-z0-9\s\-+&/().,'’]+$/.test(s);
};

const isDarkThemeActive = () => {
    try {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    } catch {
        return false;
    }
};

const parseCssColorToRgb = (input) => {
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
    if (!rgb) return null;

    const r = Math.max(0, Math.min(255, Math.round(Number(rgb[1]))));
    const g = Math.max(0, Math.min(255, Math.round(Number(rgb[2]))));
    const b = Math.max(0, Math.min(255, Math.round(Number(rgb[3]))));
    return { r, g, b };
};

const rgbToHex = ({ r, g, b }) => {
    const to2 = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).padStart(2, '0');
    return `#${to2(r)}${to2(g)}${to2(b)}`;
};

const relativeLuminance = ({ r, g, b }) => {
    const toLinear = (v) => {
        const x = Math.max(0, Math.min(255, Number(v) || 0)) / 255;
        return x <= 0.03928 ? (x / 12.92) : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

const DARK_INVERT_TRIGGER_LUMINANCE = (() => {
    const ref = parseCssColorToRgb('#005AAA');
    return ref ? relativeLuminance(ref) : 0.102;
})();

const resolveTrainTypeColorInfoForTheme = (color) => {
    const raw = toText(color);
    if (!raw) return { color: raw, darkAdjusted: false };
    if (!isDarkThemeActive()) return { color: raw, darkAdjusted: false };

    const parsed = parseCssColorToRgb(raw);
    if (!parsed) return { color: raw, darkAdjusted: false };
    const lum = relativeLuminance(parsed);
    if (!(lum < DARK_INVERT_TRIGGER_LUMINANCE)) return { color: raw, darkAdjusted: false };

    const adjusted = rgbToHex({
        r: 255 - parsed.r,
        g: 255 - parsed.g,
        b: 255 - parsed.b
    });
    return { color: adjusted, darkAdjusted: true };
};

const splitTypeHeadTextChunks = (value) => {
    const s = toText(value);
    if (!s) return [];

    const chunks = [];
    const isAsciiWordChar = (ch) => /[A-Za-z0-9]/.test(ch);

    let i = 0;
    while (i < s.length) {
        const ch = s[i];
        if (isAsciiWordChar(ch)) {
            let j = i + 1;
            while (j < s.length) {
                const c = s[j];
                if (isAsciiWordChar(c) || /[\s\-+&/().,'’]/.test(c)) {
                    j += 1;
                    continue;
                }
                break;
            }
            chunks.push({ text: s.slice(i, j), kind: 'en' });
            i = j;
            continue;
        }

        chunks.push({ text: ch, kind: 'other' });
        i += 1;
    }

    return chunks.filter((x) => toText(x?.text));
};

const resolveCompanyLogoUrl = (companyKey) => {
    const key = toText(companyKey);
    if (!key) return '';
    const logoMap = window?.TokyoRailCompanyLogoMap || {};
    return getCompanyLogoSrc(key, logoMap) || '';
};

const resolveColorForTheme = (color, fallback = '#888') => {
    const info = resolveTrainTypeColorInfoForTheme(toText(color) || fallback);
    return info.color || fallback;
};

const formatRouteMapLineIconHtml = (iconEl) => {
    if (!(iconEl instanceof HTMLElement)) return '';
    iconEl.classList.add('route-map-through-line-icon');
    if (toText(iconEl.dataset?.preset) === 'seibu') {
        iconEl.classList.add('route-map-through-line-icon-seibu');
    }
    iconEl.style.width = '20px';
    iconEl.style.height = '20px';
    iconEl.style.paddingTop = '1px';
    return iconEl.outerHTML;
};

const setupRouteMapUi = () => {
    try {
        if (window.__TokyoRailRouteMapUiInstalled) return;
        window.__TokyoRailRouteMapUiInstalled = true;
    } catch {
        // ignore
    }

    ensureStyleInstalled();

    const root = document.createElement('div');
    root.className = 'route-map-popover route-map is-hidden';
    root.setAttribute('data-route-map', '');
    root.style.position = 'fixed';
    root.style.zIndex = '5000';
    root.style.setProperty('--mobile-sheet-peek-height', `${DEFAULT_MOBILE_SHEET_PEEK_PX}px`);

    const mobileDragBar = document.createElement('div');
    mobileDragBar.className = 'route-map-mobile-drag-bar';
    mobileDragBar.setAttribute('data-route-map-mobile-drag-bar', '');
    mobileDragBar.setAttribute('aria-hidden', 'true');

    const topHeader = document.createElement('div');
    topHeader.className = 'route-map-header';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'panel-capture-btn route-map-back-btn';
    backBtn.setAttribute('aria-label', '返回线路列表');
    backBtn.title = '返回';
    const backIcon = document.createElement('img');
    backIcon.className = 'panel-capture-icon route-map-back-icon';
    backIcon.alt = '';
    setImageElementFromCache(backIcon, getIconCandidates('arrow-right.svg'), {
        cacheKey: 'icon:arrow-right.svg',
        fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('arrow-right.svg'), { cacheKey: 'icon:arrow-right.svg' })
    }).catch(() => null);
    backBtn.appendChild(backIcon);
    topHeader.appendChild(backBtn);

    const topTitle = document.createElement('div');
    topTitle.className = 'route-map-title';
    topHeader.appendChild(topTitle);

    const topActions = document.createElement('div');
    topActions.className = 'route-map-actions';

    const branchBtn = document.createElement('button');
    branchBtn.type = 'button';
    branchBtn.className = 'panel-capture-btn route-map-branch-btn';
    branchBtn.setAttribute('aria-label', '分支高亮');
    branchBtn.title = '分支高亮';
    const branchIcon = document.createElement('img');
    branchIcon.className = 'panel-capture-icon route-map-branch-icon';
    branchIcon.alt = '';
    setImageElementFromCache(branchIcon, getIconCandidates('lr.svg'), {
        cacheKey: 'icon:lr.svg',
        fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('lr.svg'), { cacheKey: 'icon:lr.svg' })
    }).catch(() => null);
    branchBtn.appendChild(branchIcon);
    topActions.appendChild(branchBtn);

    const exportMenuRoot = document.createElement('div');
    exportMenuRoot.className = 'route-map-export-menu-ui';

    const captureBtn = document.createElement('button');
    captureBtn.type = 'button';
    captureBtn.className = 'panel-capture-btn route-map-export-btn route-map-print-btn';
    captureBtn.setAttribute('aria-label', '\u5bfc\u51fa');
    captureBtn.setAttribute('aria-haspopup', 'menu');
    captureBtn.setAttribute('aria-expanded', 'false');
    captureBtn.title = '\u5bfc\u51fa';
    const captureIcon = document.createElement('img');
    captureIcon.className = 'panel-capture-icon route-map-capture-icon';
    captureIcon.alt = '';
    setImageElementFromCache(captureIcon, getIconCandidates('camera.svg'), {
        cacheKey: 'icon:camera.svg',
        fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('camera.svg'), { cacheKey: 'icon:camera.svg' })
    }).catch(() => null);
    captureBtn.appendChild(captureIcon);

    const exportMenu = document.createElement('div');
    exportMenu.className = 'route-map-export-menu';
    exportMenu.setAttribute('role', 'menu');
    exportMenu.setAttribute('aria-label', '\u5bfc\u51fa\u9009\u9879');

    const timetableExportItem = document.createElement('button');
    timetableExportItem.type = 'button';
    timetableExportItem.className = 'route-map-export-menu-item';
    timetableExportItem.textContent = '\u5bfc\u51fa\u5168\u7ebf\u65f6\u523b\u8868';
    timetableExportItem.setAttribute('role', 'menuitem');

    const mapExportItem = document.createElement('button');
    mapExportItem.type = 'button';
    mapExportItem.className = 'route-map-export-menu-item';
    mapExportItem.textContent = '\u5bfc\u51fa\u7ebf\u8def\u56fe';
    mapExportItem.setAttribute('role', 'menuitem');

    exportMenu.appendChild(timetableExportItem);
    exportMenu.appendChild(mapExportItem);
    exportMenuRoot.appendChild(captureBtn);
    exportMenuRoot.appendChild(exportMenu);
    topActions.appendChild(exportMenuRoot);
    topHeader.appendChild(topActions);

    const gridHeader = document.createElement('div');
    gridHeader.className = 'route-map-grid-header';

    const body = document.createElement('div');
    body.className = 'route-map-body';

    const transferHoverPortal = document.createElement('div');
    transferHoverPortal.className = 'route-map-transfer-hover-portal is-hidden';
    transferHoverPortal.setAttribute('role', 'tooltip');

    root.appendChild(mobileDragBar);
    root.appendChild(topHeader);
    root.appendChild(gridHeader);
    root.appendChild(body);
    root.appendChild(transferHoverPortal);
    document.body.appendChild(root);

    let pinned = false;
    let hoverInsidePanel = false;
    let activeLineId = '';
    let activeLineName = '';
    let lastAnchorRect = null;
    let lastPlacement = 'anchor';
    let lastPointer = { x: 0, y: 0 };
    let showTimer = 0;
    let hideTimer = 0;
    let branchPreviewLineId = '';
    let branchPreviewActive = false;
    let branchPreviewBusy = false;
    let mobileSheetState = 'half';
    let mobileDragState = null;
    let returnTarget = '';

    const isMobileRouteMapPresentation = () => {
        if (document?.documentElement?.dataset?.mobileUi === '1') return true;
        if (document?.body?.dataset?.mobileUi === '1') return true;
        try {
            return window.matchMedia?.('(max-width: 760px)')?.matches === true;
        } catch {
            return false;
        }
    };

    const isMobilePanelPlacementActive = () => (
        lastPlacement === 'mobile-panel' || (lastPlacement === 'panel' && isMobileRouteMapPresentation())
    );

    const shouldDeferPanelLineClickToMobilePanel = (target) => (
        isMobileRouteMapPresentation()
        && target instanceof Element
        && Boolean(target.closest?.('[data-panel-root] .panel-line-name'))
    );

    const syncReturnTargetUi = () => {
        const showBack = isMobilePanelPlacementActive() && returnTarget === 'panel';
        root.setAttribute('data-route-map-return-target', returnTarget);
        backBtn.hidden = !showBack;
        backBtn.setAttribute('aria-hidden', showBack ? 'false' : 'true');
    };

    const getMobileSheetHeight = () => Math.max(1, Math.round(root.getBoundingClientRect?.().height || window.innerHeight || 1));
    const getMobileSheetSnapOptions = () => ({ height: getMobileSheetHeight(), peekPx: DEFAULT_MOBILE_SHEET_PEEK_PX });
    const getMobileSheetOffset = (state = mobileSheetState) => {
        if (state === 'hidden') return getMobileSheetHeight();
        return getMobileSheetOffsetForState(state, getMobileSheetSnapOptions());
    };

    const applyMobileSheetState = (state = mobileSheetState, { transition = true } = {}) => {
        mobileSheetState = state === 'expanded'
            ? 'expanded'
            : (state === 'collapsed' ? 'collapsed' : (state === 'hidden' ? 'hidden' : 'half'));
        root.style.transition = transition ? '' : 'none';
        if (!isMobilePanelPlacementActive()) {
            root.removeAttribute('data-route-map-mobile-state');
            return;
        }
        root.setAttribute('data-route-map-mobile-state', mobileSheetState);
        if (mobileSheetState === 'expanded') {
            root.style.transform = 'translateY(0)';
        } else if (mobileSheetState === 'hidden') {
            root.style.transform = 'translateY(calc(100% + 24px))';
        } else if (mobileSheetState === 'collapsed') {
            root.style.transform = `translateY(${getMobileSheetOffset('collapsed')}px)`;
        } else {
            root.style.transform = `translateY(${getMobileSheetOffset('half')}px)`;
        }
    };

    const beginMobileSheetDrag = (event) => {
        if (!isMobilePanelPlacementActive()) return false;
        if (event?.button != null && event.button !== 0) return false;
        mobileDragState = {
            pointerId: event?.pointerId,
            startY: Number(event?.clientY) || 0,
            startOffset: getMobileSheetOffset(),
            rootHeight: Math.max(1, Math.round(root.getBoundingClientRect?.().height || window.innerHeight || 1))
        };
        root.setAttribute('data-route-map-mobile-dragging', '1');
        root.style.transition = 'none';
        try {
            mobileDragBar.setPointerCapture?.(event.pointerId);
        } catch {
            // ignore pointer-capture gaps
        }
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return true;
    };

    const updateMobileSheetDrag = (event) => {
        if (!mobileDragState) return;
        if (mobileDragState.pointerId != null && event?.pointerId !== mobileDragState.pointerId) return;
        const deltaY = (Number(event?.clientY) || 0) - mobileDragState.startY;
        const nextOffset = clampMobileSheetOffset(mobileDragState.startOffset + deltaY, {
            height: mobileDragState.rootHeight,
            peekPx: DEFAULT_MOBILE_SHEET_PEEK_PX
        });
        root.style.transform = `translateY(${nextOffset}px)`;
        mobileDragState.currentOffset = nextOffset;
        event?.preventDefault?.();
        event?.stopPropagation?.();
    };

    const endMobileSheetDrag = (event, { cancelled = false } = {}) => {
        if (!mobileDragState) return;
        if (mobileDragState.pointerId != null && event?.pointerId !== mobileDragState.pointerId) return;
        const currentY = cancelled ? mobileDragState.startY : (Number(event?.clientY) || 0);
        const deltaY = currentY - mobileDragState.startY;
        const startState = mobileSheetState;
        const currentOffset = cancelled
            ? mobileDragState.startOffset
            : (mobileDragState.currentOffset ?? clampMobileSheetOffset(mobileDragState.startOffset + deltaY, {
                height: mobileDragState.rootHeight,
                peekPx: DEFAULT_MOBILE_SHEET_PEEK_PX
            }));
        const targetState = cancelled
            ? startState
            : getNearestMobileSheetStateByOffset(currentOffset, {
                height: mobileDragState.rootHeight,
                peekPx: DEFAULT_MOBILE_SHEET_PEEK_PX
            });
        mobileDragState = null;
        root.removeAttribute('data-route-map-mobile-dragging');
        root.style.transition = '';
        try {
            mobileDragBar.releasePointerCapture?.(event.pointerId);
        } catch {
            // ignore pointer-capture gaps
        }

        applyMobileSheetState(targetState);
        event?.preventDefault?.();
        event?.stopPropagation?.();
    };

    const setBranchButtonState = ({ active = false, busy = false } = {}) => {
        branchPreviewActive = active === true;
        branchPreviewBusy = busy === true;
        branchBtn.classList.toggle('is-active', branchPreviewActive);
        branchBtn.classList.toggle('is-busy', branchPreviewBusy);
        branchBtn.disabled = branchPreviewBusy;
        branchBtn.title = branchPreviewBusy ? '正在分析分支…' : (branchPreviewActive ? '关闭分支高亮' : '分支高亮');
    };

    const clearBranchPreviewBySource = () => {
        const actions = window?.TokyoRailSearchMapActions;
        if (typeof actions?.clearTripPathPreviewBySource === 'function') {
            actions.clearTripPathPreviewBySource('route-map-branch');
        }
    };

    let exportMenuHoverTimer = 0;
    const clearExportMenuHoverTimer = () => {
        if (!exportMenuHoverTimer) return;
        clearTimeout(exportMenuHoverTimer);
        exportMenuHoverTimer = 0;
    };
    const setExportMenuOpen = (open) => {
        exportMenuRoot.classList.toggle('is-open', open === true);
        captureBtn.setAttribute('aria-expanded', open === true ? 'true' : 'false');
    };
    const toggleExportMenu = () => {
        setExportMenuOpen(!exportMenuRoot.classList.contains('is-open'));
    };
    const scheduleExportMenuClose = (delayMs = 220) => {
        clearExportMenuHoverTimer();
        exportMenuHoverTimer = setTimeout(() => {
            exportMenuHoverTimer = 0;
            setExportMenuOpen(false);
        }, Math.max(0, Number(delayMs) || 0));
    };
    const setCaptureButtonBusy = (busy) => {
        captureBtn.classList.toggle('is-route-map-exporting', busy === true);
        if (busy === true) {
            captureBtn.setAttribute('aria-busy', 'true');
        } else {
            captureBtn.removeAttribute('aria-busy');
        }
    };

    // 在外部增加一个变量用于记录点击阶段（0: 初始/未激活, 1: 已点击第一次, 2: 已点击第二次）
    let branchPreviewStep = 0;

    branchBtn.addEventListener('click', async (evt) => {
        stopEvent(evt);
        pinned = true;
        clearTimers();

        const lid = toText(activeLineId);
        if (!lid || branchPreviewBusy) return;

        const isSameActive = branchPreviewActive && branchPreviewLineId === lid;
        
        // 如果点击了不同的行，或者由于其他原因（如点击其他地方）导致当前线段取消了激活，重置阶段
        if (!isSameActive) {
            branchPreviewStep = 0;
        }

        // 第三次点击：恢复原始状态（关闭预览并重置）
        if (branchPreviewStep === 2) {
            clearBranchPreviewBySource();
            branchPreviewLineId = '';
            branchPreviewStep = 0; // 重置阶段
            setBranchButtonState({ active: false, busy: false });
            return;
        }

        // 判断是否是第一次点击
        const isFirstClick = (branchPreviewStep === 0);

        setBranchButtonState({ active: false, busy: true });
        try {
            const result = await previewBranchesForLine({
                lineId: lid,
                lineName: activeLineName,
                fitMode: 'commit',
                filterSpecial: isFirstClick, // 第一次 true，第二次 false
            });
            const ok = result?.ok === true;
            
            if (ok) {
                branchPreviewLineId = lid;
                // 成功后步数递增：第一次点击后变为 1，第二次点击后变为 2
                branchPreviewStep = isFirstClick ? 1 : 2; 
                setBranchButtonState({ active: true, busy: false });
            } else {
                // 请求失败时重置状态
                branchPreviewLineId = '';
                branchPreviewStep = 0;
                setBranchButtonState({ active: false, busy: false });
            }
        } catch {
            branchPreviewLineId = '';
            branchPreviewStep = 0;
            setBranchButtonState({ active: false, busy: false });
        }
    }, { passive: false });

    exportMenuRoot.addEventListener('mouseenter', () => {
        clearExportMenuHoverTimer();
        setExportMenuOpen(true);
    });

    exportMenuRoot.addEventListener('mouseleave', () => {
        scheduleExportMenuClose(220);
    });

    let lastExportPointerDownAt = 0;
    captureBtn.addEventListener('pointerdown', (evt) => {
        stopEvent(evt);
        lastExportPointerDownAt = Date.now();
        pinned = true;
        clearTimers();
        clearExportMenuHoverTimer();
        toggleExportMenu();
    }, { passive: false });

    captureBtn.addEventListener('click', (evt) => {
        stopEvent(evt);
        if (Date.now() - lastExportPointerDownAt < 700) return;
        pinned = true;
        clearTimers();
        clearExportMenuHoverTimer();
        toggleExportMenu();
    }, { passive: false });

    timetableExportItem.addEventListener('click', (evt) => {
        stopEvent(evt);
        pinned = true;
        clearTimers();
        setExportMenuOpen(false);
        requestRouteMapLineTimetablesPrint({
            lineId: toText(activeLineId),
            lineName: toText(activeLineName) || toText(activeLineId)
        });
    }, { passive: false });

    mapExportItem.addEventListener('click', async (evt) => {
        stopEvent(evt);
        pinned = true;
        clearTimers();
        setExportMenuOpen(false);
        const baseName = `${toText(activeLineName)}_运行系统图`;
        setCaptureButtonBusy(true);
        try {
            await captureRouteMapImage({ element: root, filenameBase: baseName, buttonEl: captureBtn });
        } finally {
            setCaptureButtonBusy(false);
        }
    }, { passive: false });

    document.addEventListener('pointerdown', (evt) => {
        if (!exportMenuRoot.classList.contains('is-open')) return;
        const target = evt?.target;
        if (target && exportMenuRoot.contains(target)) return;
        setExportMenuOpen(false);
    }, true);

    let activeTransferHoverShell = null;
    const hideTransferHoverPortal = () => {
        activeTransferHoverShell = null;
        transferHoverPortal.classList.add('is-hidden');
        transferHoverPortal.innerHTML = '';
        transferHoverPortal.style.left = '';
        transferHoverPortal.style.top = '';
        transferHoverPortal.style.visibility = '';
    };

    const positionTransferHoverPortal = (shell) => {
        if (!(shell instanceof HTMLElement) || transferHoverPortal.classList.contains('is-hidden')) return;

        const rootRect = root.getBoundingClientRect();
        const shellRect = shell.getBoundingClientRect();
        const portalRect = transferHoverPortal.getBoundingClientRect();
        const pad = 6;
        const gap = 8;

        let viewportLeft = shellRect.left - portalRect.width - gap;
        if (!Number.isFinite(viewportLeft)) viewportLeft = pad;
        viewportLeft = Math.max(pad, viewportLeft);

        let viewportTop = shellRect.top + shellRect.height / 2 - portalRect.height / 2;
        if (!Number.isFinite(viewportTop)) viewportTop = pad;
        viewportTop = Math.max(pad, Math.min(viewportTop, Math.max(pad, window.innerHeight - portalRect.height - pad)));

        transferHoverPortal.style.left = `${viewportLeft - rootRect.left}px`;
        transferHoverPortal.style.top = `${viewportTop - rootRect.top}px`;
    };

    const showTransferHoverPortal = (shell) => {
        if (!(shell instanceof HTMLElement)) return;
        const template = shell.querySelector('.route-map-transfer-hover-panel');
        const html = toText(template?.innerHTML);
        if (!html) {
            hideTransferHoverPortal();
            return;
        }

        activeTransferHoverShell = shell;
        transferHoverPortal.innerHTML = html;
        transferHoverPortal.classList.remove('is-hidden');
        transferHoverPortal.style.visibility = 'hidden';
        positionTransferHoverPortal(shell);
        transferHoverPortal.style.visibility = '';
    };

    body.addEventListener('pointerover', (evt) => {
        const shell = evt?.target?.closest?.('.route-map-transfer-items-shell');
        if (!(shell instanceof HTMLElement) || !body.contains(shell)) return;
        if (shell === activeTransferHoverShell) {
            positionTransferHoverPortal(shell);
            return;
        }
        showTransferHoverPortal(shell);
    });

    body.addEventListener('pointerout', (evt) => {
        const shell = evt?.target?.closest?.('.route-map-transfer-items-shell');
        if (!(shell instanceof HTMLElement) || shell !== activeTransferHoverShell) return;
        const related = evt.relatedTarget;
        if (related instanceof Node && shell.contains(related)) return;
        hideTransferHoverPortal();
    });

    body.addEventListener('focusin', (evt) => {
        const shell = evt?.target?.closest?.('.route-map-transfer-items-shell');
        if (!(shell instanceof HTMLElement) || !body.contains(shell)) return;
        showTransferHoverPortal(shell);
    });

    body.addEventListener('focusout', (evt) => {
        const shell = evt?.target?.closest?.('.route-map-transfer-items-shell');
        if (!(shell instanceof HTMLElement) || shell !== activeTransferHoverShell) return;
        const related = evt.relatedTarget;
        if (related instanceof Node && shell.contains(related)) return;
        hideTransferHoverPortal();
    });

    body.addEventListener('scroll', () => {
        if (activeTransferHoverShell) positionTransferHoverPortal(activeTransferHoverShell);
    }, { passive: true });

    window.addEventListener('resize', () => {
        if (activeTransferHoverShell) positionTransferHoverPortal(activeTransferHoverShell);
    }, { passive: true });

    const cache = new Map(); // key: lineId||serviceDay -> payload

    const clearTimers = () => {
        if (showTimer) {
            clearTimeout(showTimer);
            showTimer = 0;
        }
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = 0;
        }
    };

    const scheduleHide = (delayMs = 220) => {
        clearTimers();
        hideTimer = setTimeout(() => {
            hideTimer = 0;
            if (pinned) return;
            if (hoverInsidePanel) return;
            root.classList.add('is-hidden');
            applyMobileSheetState('hidden');
            hideTransferHoverPortal();
            activeLineId = '';
            activeLineName = '';
            returnTarget = '';
            syncReturnTargetUi();
        }, delayMs);
    };

    const getPanelLikePlacementRect = () => {
        const panelRoot = document.querySelector('[data-panel-root]');
        if (!(panelRoot instanceof HTMLElement)) return null;

        const style = window.getComputedStyle(panelRoot);
        const width = Number.parseFloat(panelRoot.style.width || style.width || '0');
        const right = Number.parseFloat(panelRoot.style.right || style.right || '0');
        const top = Number.parseFloat(panelRoot.style.top || style.top || '0');
        const height = Number.parseFloat(panelRoot.style.height || style.height || '0');

        const safeWidth = Number.isFinite(width) && width > 0 ? width : 320;
        const safeRight = Number.isFinite(right) ? right : 20;
        const safeTop = Number.isFinite(top) ? top : 56;
        const safeHeight = Number.isFinite(height) && height > 0 ? height : Math.max(220, window.innerHeight - safeTop - 12);

        return {
            left: Math.max(8, window.innerWidth - safeRight - safeWidth ),
            top: Math.max(8, safeTop),
            width: safeWidth,
            height: safeHeight
        };
    };

    const positionPanel = () => {
        const mobilePanelPlacement = isMobilePanelPlacementActive();
        if (mobilePanelPlacement) {
            root.classList.add('is-panel-placement');
            root.classList.add('is-mobile-panel-placement');
            syncReturnTargetUi();
            root.style.left = '0';
            root.style.right = '0';
            root.style.top = 'auto';
            root.style.bottom = '0';
            root.style.width = '100%';
            root.style.minWidth = '0';
            root.style.height = 'min(88vh, calc(100vh - env(safe-area-inset-top, 0px) - 12px))';
            root.style.maxHeight = 'min(88vh, calc(100vh - env(safe-area-inset-top, 0px) - 12px))';
            applyMobileSheetState(mobileSheetState);
            return;
        }

        if (lastPlacement === 'panel') {
            const rect = getPanelLikePlacementRect();
            if (rect) {
                root.classList.add('is-panel-placement');
                root.classList.remove('is-mobile-panel-placement');
                const pad = 8;
                const maxW = Math.max(180, window.innerWidth - pad * 2);
                const maxH = Math.max(180, window.innerHeight - rect.top - pad);
                const w = Math.min(rect.width, maxW);
                const h = Math.min(rect.height, maxH);
                root.style.left = '';
                root.style.right = '20px';
                root.style.top = `${Math.max(pad, rect.top)}px`;
                root.style.minWidth = '100px';
                root.style.height = `${h}px`;
                root.style.maxHeight = `${h}px`;
                return;
            }
        }

        root.classList.remove('is-panel-placement');
        root.classList.remove('is-mobile-panel-placement');
        root.removeAttribute('data-route-map-mobile-state');
        syncReturnTargetUi();
        root.style.right = '';
        root.style.bottom = '';
        root.style.width = '';
        root.style.minWidth = '';
        root.style.height = '';
        root.style.maxHeight = '';
        root.style.transform = '';
        const panelW = root.offsetWidth || 420;
        const panelH = root.offsetHeight || 260;
        const pad = 12;

        const anchor = lastAnchorRect;
        const preferX = anchor ? anchor.left : lastPointer.x;
        const preferY = anchor ? anchor.top : lastPointer.y;

        // Prefer showing to the left of the anchor (like trip detail), else clamp.
        let x = preferX - panelW - pad - 10;
        if (!Number.isFinite(x)) x = pad;
        x = Math.max(pad, Math.min(x, window.innerWidth - panelW - pad));

        let y = preferY;
        if (!Number.isFinite(y)) y = pad;
        y = Math.max(pad, Math.min(y, window.innerHeight - panelH - pad));

        root.style.left = `${x}px`;
        root.style.top = `${y}px`;
    };

    const pickUnifiedStationOrder = (stationIds, stationNames, directions) => {
        const ids = Array.isArray(stationIds) ? stationIds.slice() : [];
        const names = Array.isArray(stationNames) ? stationNames.slice() : [];
        const out = Array.isArray(directions) ? directions.find((d) => toText(d?.dir) === 'Outbound') : null;
        if (out) return { stationIds: ids, stationNames: names, anchorDir: 'Outbound' };
        const firstDir = (Array.isArray(directions) ? directions : []).find((d) => Array.isArray(d?.types) && d.types.length > 0) || null;
        return {
            stationIds: ids,
            stationNames: names,
            anchorDir: toText(firstDir?.dir) || 'Unknown'
        };
    };

    const renderDiagram = async (payload) => {
        const lineStations = payload?.lineStations || {};
        const displayLineId = toText(payload?.selectedLine?.lineId || payload?.selectedLine?.id || activeLineId);
        const stationIds = Array.isArray(lineStations?.stationIds) ? lineStations.stationIds : [];
        const stationNames = Array.isArray(lineStations?.stationNames) ? lineStations.stationNames : stationIds;

        const directions = Array.isArray(payload?.directions) ? payload.directions : [];
        const { stationIds: orderedStationIds, stationNames: orderedStationNames } = pickUnifiedStationOrder(stationIds, stationNames, directions);

        const dirKeys = Array.from(new Set(directions.map((d) => toText(d?.dir) || 'Unknown').filter(Boolean)));
        const preferredPrimaryDir = dirKeys.includes('Outbound') ? 'Outbound' : (dirKeys[0] || 'Unknown');
        const preferredSecondaryDir = dirKeys.includes('Inbound')
            ? 'Inbound'
            : (dirKeys.find((k) => k !== preferredPrimaryDir) || '');

        const mergedTypeMap = new Map(); // typeKey -> { typeId, typeName, color, dirMasks:Record<string,boolean[]> }
        const addDirTypes = (dirBlock, dirKey) => {
            for (const t of Array.isArray(dirBlock?.types) ? dirBlock.types : []) {
                const typeId = toText(t?.typeId) || 'Unknown';
                const typeName = toText(t?.typeName) || typeId;
                if (!shouldDisplayRouteMapType(t, displayLineId)) continue;
                const color = toText(t?.color) || '#888';
                const key = `${typeId}||${typeName}`;
                if (!mergedTypeMap.has(key)) {
                    mergedTypeMap.set(key, {
                        typeId,
                        typeName,
                        color,
                        dirMasks: {}
                    });
                }
                const row = mergedTypeMap.get(key);
                if (!Array.isArray(row.dirMasks?.[dirKey])) {
                    row.dirMasks[dirKey] = new Array(orderedStationIds.length).fill(false);
                }
                const mask = Array.isArray(t?.pattern?.stopMask) ? t.pattern.stopMask : [];
                for (let i = 0; i < orderedStationIds.length; i += 1) {
                    const v = !!mask?.[i];
                    row.dirMasks[dirKey][i] = row.dirMasks[dirKey][i] || v;
                }
            }
        };

        for (const d of directions) addDirTypes(d, toText(d?.dir) || 'Unknown');

        let types = Array.from(mergedTypeMap.values());
        const allowedTypeIds = new Set(types.map((t) => toText(t?.typeId) || 'Unknown'));
        if (!types.length) {
            return {
                headHtml: '',
                bodyHtml: '<div class="route-map-meta">当前无可用班次</div>'
            };
        }

        // Per type: choose best display direction(s) to avoid false all-pass for one-direction services.
        for (const t of types) {
            const masks = t?.dirMasks || {};
            const keys = Object.keys(masks);
            const hasAnyTrue = (key) => Array.isArray(masks[key]) && masks[key].some(Boolean);

            let primaryDir = preferredPrimaryDir;
            if (!hasAnyTrue(primaryDir)) {
                primaryDir = keys.find((k) => hasAnyTrue(k)) || primaryDir;
            }

            let secondaryDir = preferredSecondaryDir;
            if (!secondaryDir || secondaryDir === primaryDir || !hasAnyTrue(secondaryDir)) {
                secondaryDir = keys.find((k) => k !== primaryDir && hasAnyTrue(k)) || '';
            }

            t._primaryMask = Array.isArray(masks[primaryDir])
                ? masks[primaryDir]
                : new Array(orderedStationIds.length).fill(false);
            t._secondaryMask = secondaryDir && Array.isArray(masks[secondaryDir])
                ? masks[secondaryDir]
                : new Array(orderedStationIds.length).fill(false);
            t._hasPair = !!secondaryDir;

            const anyMask = new Array(orderedStationIds.length).fill(false);
            for (const k of keys) {
                const m = Array.isArray(masks[k]) ? masks[k] : [];
                for (let i = 0; i < orderedStationIds.length; i += 1) {
                    if (m[i]) anyMask[i] = true;
                }
            }
            t._anyMask = anyMask;

            let lastStop = -1;
            let firstStop = -1;
            for (let i = 0; i < orderedStationIds.length; i += 1) {
                const active = t._hasPair
                    ? (!!t._primaryMask[i] || !!t._secondaryMask[i])
                    : !!anyMask[i];
                if (active && firstStop < 0) firstStop = i;
                if (active) lastStop = i;
            }
            t._firstStopIndex = firstStop;
            t._lastStopIndex = lastStop;
        }

        const typeCount = new Map();
        for (const t of types) {
            typeCount.set(toText(t?.typeName), Number(t?.totalTrips) || 0);
        }
        const typeStopCountByName = new Map();
        for (const t of types) {
            const typeName = toText(t?.typeName);
            if (!typeName) continue;
            const mask = Array.isArray(t?._anyMask) ? t._anyMask : [];
            const stopCount = mask.reduce((sum, flag) => sum + (flag ? 1 : 0), 0);
            if (stopCount <= 0) continue;
            const prev = Number(typeStopCountByName.get(typeName));
            typeStopCountByName.set(typeName, Number.isFinite(prev) ? Math.min(prev, stopCount) : stopCount);
        }
        const orderedNames = sortTypeNamesByBaseAndStopCount(
            types.map((t) => toText(t?.typeName)),
            typeCount,
            typeStopCountByName
        );
        const orderIndex = new Map(orderedNames.map((n, i) => [n, i]));
        types.sort((a, b) => {
            const an = toText(a?.typeName);
            const bn = toText(b?.typeName);
            const ai = orderIndex.has(an) ? orderIndex.get(an) : Number.POSITIVE_INFINITY;
            const bi = orderIndex.has(bn) ? orderIndex.get(bn) : Number.POSITIVE_INFINITY;
            if (ai !== bi) return ai - bi;
            return an.localeCompare(bn, 'zh-Hans');
        });

        const railwayMetaIndex = await getRailwayMetaIndex();
        const transferItemEntryByRouteId = new Map();
        const getTransferItemDisplayNameByRouteId = (routeId) => {
            const rid = toText(routeId);
            if (!rid) return '';

            const railwayMeta = railwayMetaIndex instanceof Map ? railwayMetaIndex.get(rid) : null;
            return toText(railwayMeta?.title?.['zh-Hans']).replace(/（.*?）|\(.*?\)/g, '') || rid;
        };

        const buildTransferItemEntry = async (routeId) => {
            const rid = toText(routeId);
            if (!rid) return null;
            if (transferItemEntryByRouteId.has(rid)) return transferItemEntryByRouteId.get(rid);

            const railwayMeta = railwayMetaIndex instanceof Map ? railwayMetaIndex.get(rid) : null;
            const lineName = getTransferItemDisplayNameByRouteId(rid);
            const lineColor = resolveColorForTheme(toText(railwayMeta?.color) || '#888', '#888');
            const iconMeta = await getResolvedRouteIconMeta(rid);

            let lineIconHtml = '';
            if (iconMeta && (iconMeta.code || iconMeta.color)) {
                const iconEl = createLineIconElement({ routeId: iconMeta.id, code: iconMeta.code, color: iconMeta.color });
                if (iconEl) {
                    lineIconHtml = formatRouteMapLineIconHtml(iconEl);
                }
            }

            const html = `<span class="route-map-transfer-item">${lineIconHtml}<span class="route-map-transfer-line-name" style="color:${escapeHtml(lineColor)}">${escapeHtml(lineName)}</span></span>`;
            const entry = {
                rid,
                company: rid.split('.')[0] || '',
                displayName: lineName,
                html,
                iconCodes: [toText(iconMeta?.code)].filter(Boolean),
                iconColor: toText(iconMeta?.color) || lineColor
            };
            transferItemEntryByRouteId.set(rid, entry);
            return entry;
        };

        const buildSUTransferItemHtml = (info, codes) => {
            const iconCodes = Array.isArray(codes) ? codes.map((code) => toText(code)).filter(Boolean) : [];
            if (!info || !iconCodes.length) return '';

            const iconHtmls = [];
            for (const code of iconCodes) {
                const iconEl = createLineIconElement({ routeId: info.lineId, code, color: info.color });
                if (!iconEl) continue;
                iconHtmls.push(formatRouteMapLineIconHtml(iconEl));
            }

            if (!iconHtmls.length) return '';

            return `<span class="route-map-transfer-item route-map-transfer-item--su">${iconHtmls.join('')}<span class="route-map-transfer-line-name" style="color:${escapeHtml(info.color)}">${escapeHtml(info.lineName)}</span></span>`;
        };

        const buildSUTransferItemEntry = async (serviceKey) => {
            const info = SU_SERVICE_INFO_BY_KEY[serviceKey] || null;
            if (!info) return null;

            const iconCodes = Array.isArray(info.codes) ? info.codes.map((code) => toText(code)).filter(Boolean) : [];
            const html = buildSUTransferItemHtml(info, iconCodes);
            if (!html) return null;

            const rid = `${toText(info.operator) || toText(info.lineId).split('.')[0] || 'JR-East'}.${serviceKey}`;
            return {
                rid,
                company: toText(info.operator) || rid.split('.')[0] || '',
                serviceKey,
                displayName: toText(info.lineName),
                html,
                iconCodes,
                iconColor: toText(info.color),
                buildCompactHtml: (codes) => buildSUTransferItemHtml(info, codes)
            };
        };

        const getSUTransferDisplayName = (serviceKey) => {
            const info = SU_SERVICE_INFO_BY_KEY[serviceKey] || null;
            return toText(info?.lineName);
        };

        const MAX_TRANSFER_ROWS = 8
        const MAX_TRANSFER_ITEMS_PER_ROW = 5;
        const preferredCompanyOrderIndex = new Map(
            preferredOrder.map((company, index) => [toText(company), index])
        );
        const sortCompaniesForTransferDisplay = (companyOrder) => {
            const originalIndex = new Map(
                companyOrder.map((company, index) => [toText(company), index])
            );
            return companyOrder.slice().sort((a, b) => {
                const ac = toText(a);
                const bc = toText(b);
                const ai = preferredCompanyOrderIndex.has(ac)
                    ? preferredCompanyOrderIndex.get(ac)
                    : Number.POSITIVE_INFINITY;
                const bi = preferredCompanyOrderIndex.has(bc)
                    ? preferredCompanyOrderIndex.get(bc)
                    : Number.POSITIVE_INFINITY;
                if (ai !== bi) return ai - bi;
                const ao = originalIndex.has(ac) ? originalIndex.get(ac) : Number.POSITIVE_INFINITY;
                const bo = originalIndex.has(bc) ? originalIndex.get(bc) : Number.POSITIVE_INFINITY;
                if (ao !== bo) return ao - bo;
                return ac.localeCompare(bc, 'zh-Hans');
            });
        };
        const buildTransferRowsHtml = (itemHtmls, rowCount) => {
            const rowsHtml = [];
            for (let start = 0; start < itemHtmls.length && rowsHtml.length < rowCount; start += MAX_TRANSFER_ITEMS_PER_ROW) {
                const rowHtml = itemHtmls.slice(start, start + MAX_TRANSFER_ITEMS_PER_ROW).join('');
                rowsHtml.push(`<span class="route-map-transfer-row">${rowHtml}</span>`);
            }
            return rowsHtml.join('');
        };
        const getTransferEntryIconDedupTargets = (entry) => {
            const company = toText(entry?.company);
            const codes = Array.isArray(entry?.iconCodes) ? entry.iconCodes.map((code) => toText(code)).filter(Boolean) : [];
            if (!company) return [];
            if (codes.length) {
                return codes.map((code) => ({
                    key: `code||${company}||${code}`,
                    code
                }));
            }

            const iconColor = toText(entry?.iconColor).toLowerCase();
            if (!iconColor) return [];
            return [{
                key: `color||${company}||${iconColor}`,
                code: ''
            }];
        };
        const buildCompactTransferItemHtmls = (entries) => {
            const seenIconKeys = new Set();
            const compactHtmls = [];

            for (const entry of Array.isArray(entries) ? entries : []) {
                const html = toText(entry?.html);
                if (!html) continue;

                const targets = getTransferEntryIconDedupTargets(entry);
                if (!targets.length) {
                    compactHtmls.push(html);
                    continue;
                }

                const freshCodes = [];
                const iconCodes = Array.isArray(entry?.iconCodes) ? entry.iconCodes.map((code) => toText(code)).filter(Boolean) : [];
                let hasFreshIcon = false;
                for (const target of targets) {
                    const key = toText(target?.key);
                    if (!key) continue;
                    if (seenIconKeys.has(key)) continue;
                    seenIconKeys.add(key);
                    hasFreshIcon = true;
                    const code = toText(target?.code);
                    if (code) freshCodes.push(code);
                }

                if (!hasFreshIcon) continue;
                if (!iconCodes.length) {
                    compactHtmls.push(html);
                    continue;
                }
                if (freshCodes.length === targets.length || typeof entry?.buildCompactHtml !== 'function') {
                    compactHtmls.push(html);
                    continue;
                }

                const compactHtml = toText(entry.buildCompactHtml(freshCodes));
                if (compactHtml) compactHtmls.push(compactHtml);
            }

            return compactHtmls;
        };
        const transferDisplayByStationId = new Map();
        let transferColumnCount = 0;
        for (const sidRaw of orderedStationIds) {
            const sid = toText(sidRaw);
            if (!sid) continue;

            const transferStationIds = await getTransferStationIdsByStationId(sid);
            const transferStationIdSet = transferStationIds instanceof Set ? transferStationIds : new Set();
            const selfRouteId = getRouteIdFromStationId(sid);
            const routeIds = [];
            const seenRouteIds = new Set();
            for (const transferSid of transferStationIdSet) {
                const rid = getRouteIdFromStationId(transferSid);
                if (!rid || rid === selfRouteId || seenRouteIds.has(rid)) continue;
                seenRouteIds.add(rid);
                routeIds.push(rid);
            }

            const transferSUFlags = getTransferSUFlags({ selfRouteId, routeIds });
            const stationSUFlags = isStationSUStations(sid);
            const needsEmptyTransferDisplay = !!(stationSUFlags.ShonanShinjuku || stationSUFlags.UenoTokyo || stationSUFlags.UenoTokyoJoban);
            if (transferStationIdSet.size <= 1 && !needsEmptyTransferDisplay) continue;

            const suItemHtmls = [];
            for (const [category, info] of Object.entries(THROUGH_SERVICE_CONFIGS_OBJECT)) {
                
                if (stationSUFlags[category] || transferSUFlags[category]) {
                    const entry = await buildSUTransferItemEntry(category);
                    if (entry) suItemHtmls.push(entry);
                }
            }

            // build transfer item HTMLs, then group by company (first segment of route id)
            const pendingHtmls = await Promise.all(routeIds.map((rid) => buildTransferItemEntry(rid)));
            const filtered = [];
            const seenDisplayNames = new Set();

            for (const entry of pendingHtmls || []) {
                const html = toText(entry?.html);
                const displayName = toText(entry?.displayName);
                if (!html || !displayName || seenDisplayNames.has(displayName)) continue;
                seenDisplayNames.add(displayName);
                filtered.push(entry);
            }

            for (const entry of suItemHtmls) {
                const html = toText(entry?.html);
                if (!html) continue;
                const serviceKey = toText(entry?.serviceKey);
                const displayName = getSUTransferDisplayName(serviceKey);
                if (!displayName || seenDisplayNames.has(displayName)) continue;
                seenDisplayNames.add(displayName);
                filtered.push(entry);
            }

            if (!filtered.length && !needsEmptyTransferDisplay) continue;

            if (!filtered.length && needsEmptyTransferDisplay) {
                transferDisplayByStationId.set(sid, { itemHtmls: [''], popoverItemHtmls: [''], rowCount: 1, popoverRowCount: 1 });
                transferColumnCount = Math.max(transferColumnCount, 1);
                continue;
            }

            const companyOrder = [];
            const groups = new Map();
            for (const entry of filtered) {
                const company = toText(entry?.company) || toText(entry?.rid).split('.')[0] || '';
                if (!groups.has(company)) {
                    groups.set(company, []);
                    companyOrder.push(company);
                }
                groups.get(company).push(entry);
            }
            const sortedEntries = [];
            for (const comp of sortCompaniesForTransferDisplay(companyOrder)) {
                const arr = groups.get(comp) || [];
                for (const entry of arr) sortedEntries.push(entry);
            }
            const popoverItemHtmlsRaw = sortedEntries.map((entry) => toText(entry?.html)).filter(Boolean);
            const itemHtmlsRaw = buildCompactTransferItemHtmls(sortedEntries);
            if (!itemHtmlsRaw.length && needsEmptyTransferDisplay) itemHtmlsRaw.push('');
            if (!popoverItemHtmlsRaw.length && needsEmptyTransferDisplay) popoverItemHtmlsRaw.push('');
            if (!itemHtmlsRaw.length) continue;

            const itemHtmls = itemHtmlsRaw.slice(0, MAX_TRANSFER_ROWS * MAX_TRANSFER_ITEMS_PER_ROW);
            const popoverItemHtmls = popoverItemHtmlsRaw.slice(0, MAX_TRANSFER_ROWS * MAX_TRANSFER_ITEMS_PER_ROW);
            const rowCount = Math.min(MAX_TRANSFER_ROWS, Math.max(1, Math.ceil(itemHtmls.length / MAX_TRANSFER_ITEMS_PER_ROW)));
            const popoverRowCount = Math.min(MAX_TRANSFER_ROWS, Math.max(1, Math.ceil(popoverItemHtmls.length / MAX_TRANSFER_ITEMS_PER_ROW)));
            const maxColsInRow = Math.min(MAX_TRANSFER_ITEMS_PER_ROW, itemHtmls.length);
            transferColumnCount = Math.max(transferColumnCount, maxColsInRow);
            transferDisplayByStationId.set(sid, { itemHtmls, popoverItemHtmls, rowCount, popoverRowCount });
        }

        const transferColumnsTemplate = transferColumnCount > 0
            ? `repeat(${transferColumnCount}, max-content) `
            : '';
        const gridStyle = `grid-template-columns: ${transferColumnsTemplate}repeat(${types.length}, 12px) minmax(120px, max-content); column-gap: 1px;`;
        const typeColumnOffset = transferColumnCount;
        const stationColumnIndex = typeColumnOffset + types.length + 1;

        const throughGapMap = new Map(); // afterStationIndex -> { byTypeId: Map<typeId, target[]>, allTargets: target[] }
        const throughGapDirectionScore = new Map(); // afterStationIndex -> score(pt:+1, nt:-1)
        const preferredGapByLineId = new Map(); // refLineId -> preferred gapIndex (primary dir first)
        const primaryDirBlock = directions.find((d) => toText(d?.dir) === preferredPrimaryDir) || null;
        const throughDirBlocks = primaryDirBlock
            ? [primaryDirBlock, ...directions.filter((d) => d !== primaryDirBlock)]
            : directions.slice();

        for (const dirBlock of throughDirBlocks) {
            const dirKey = toText(dirBlock?.dir) || '';
            // Use the actual chronological step assigned by route-map if available, fallback to guessing.
            const dirOrientationSign = dirBlock.step || (dirKey && preferredSecondaryDir && dirKey === preferredSecondaryDir ? -1 : 1);
            for (const row of Array.isArray(dirBlock?.throughRows) ? dirBlock.throughRows : []) {
                const gapIndex = Number(row?.afterStationIndex);
                if (!Number.isFinite(gapIndex)) continue;
                // allow [-1, N-1] so we can show "before first" and "after last" throughs
                if (gapIndex < -1 || gapIndex > Math.max(-1, orderedStationIds.length - 1)) continue;

                if (!throughGapMap.has(gapIndex)) {
                    throughGapMap.set(gapIndex, {
                        byTypeId: new Map(),
                        allTargetsByKey: new Map()
                    });
                }
                const gap = throughGapMap.get(gapIndex);

                for (const byType of Array.isArray(row?.byType) ? row.byType : []) {
                    const typeId = toText(byType?.typeId) || 'Unknown';
                    if (!allowedTypeIds.has(typeId)) continue;
                    for (const target of Array.isArray(byType?.targets) ? byType.targets : []) {
                        const refLineId = toText(target?.refLineId);
                        const kind = toText(target?.kind) || 'nt';
                        if (!refLineId) continue;
                        const lineKey = refLineId;

                        if (!preferredGapByLineId.has(lineKey)) {
                            preferredGapByLineId.set(lineKey, gapIndex);
                        }
                        const preferredGap = Number(preferredGapByLineId.get(lineKey));
                        if (!Number.isFinite(preferredGap)) continue;

                        const rawKindScore = kind === 'pt' ? 1 : (kind === 'nt' ? -1 : 0);
                        const kindScore = rawKindScore * dirOrientationSign;
                        throughGapDirectionScore.set(
                            preferredGap,
                            Number(throughGapDirectionScore.get(preferredGap) || 0) + kindScore
                        );

                        let targetGap = gap;
                        if (preferredGap !== gapIndex) {
                            if (!throughGapMap.has(preferredGap)) {
                                throughGapMap.set(preferredGap, {
                                    byTypeId: new Map(),
                                    allTargetsByKey: new Map()
                                });
                            }
                            targetGap = throughGapMap.get(preferredGap);
                        }

                        if (!targetGap.byTypeId.has(typeId)) targetGap.byTypeId.set(typeId, new Map());
                        const targetTypeMap = targetGap.byTypeId.get(typeId);
                        if (!targetTypeMap.has(lineKey)) {
                            targetTypeMap.set(lineKey, target);
                        } else {
                            const prev = targetTypeMap.get(lineKey);
                            const prevKind = toText(prev?.kind) || 'nt';
                            if (prevKind !== 'nt' && kind === 'nt') {
                                targetTypeMap.set(lineKey, target);
                            }
                        }

                        if (!targetGap.allTargetsByKey.has(lineKey)) {
                            targetGap.allTargetsByKey.set(lineKey, target);
                        } else {
                            const prev = targetGap.allTargetsByKey.get(lineKey);
                            const prevKind = toText(prev?.kind) || 'nt';
                            if (prevKind !== 'nt' && kind === 'nt') {
                                targetGap.allTargetsByKey.set(lineKey, target);
                            }
                        }
                    }
                }
            }
        }

        for (const [gapIndex, gap] of Array.from(throughGapMap.entries())) {
            for (const [typeId, targetMap] of Array.from(gap?.byTypeId?.entries?.() || [])) {
                if (!(targetMap instanceof Map) || targetMap.size === 0) {
                    gap.byTypeId.delete(typeId);
                }
            }
            const hasAnyTypeTargets = (gap?.byTypeId instanceof Map) && gap.byTypeId.size > 0;
            const hasAnyLabelTargets = (gap?.allTargetsByKey instanceof Map) && gap.allTargetsByKey.size > 0;
            if (!hasAnyTypeTargets && !hasAnyLabelTargets) {
                throughGapMap.delete(gapIndex);
            }
        }

        const throughGapRangeByTypeId = new Map(); // typeId -> { minGap, maxGap }
        for (const [gapIndex, gap] of throughGapMap.entries()) {
            for (const typeId of gap?.byTypeId?.keys?.() || []) {
                const tid = toText(typeId) || 'Unknown';
                if (!throughGapRangeByTypeId.has(tid)) {
                    throughGapRangeByTypeId.set(tid, { minGap: gapIndex, maxGap: gapIndex });
                    continue;
                }
                const range = throughGapRangeByTypeId.get(tid);
                range.minGap = Math.min(Number(range.minGap), Number(gapIndex));
                range.maxGap = Math.max(Number(range.maxGap), Number(gapIndex));
            }
        }

        for (const t of types) {
            const typeId = toText(t?.typeId) || 'Unknown';
            const range = throughGapRangeByTypeId.get(typeId);
            if (!range) continue;

            const minVisibleByThrough = Math.max(0, Math.min(orderedStationIds.length - 1, Number(range.minGap) + 1));
            const maxVisibleByThrough = Math.max(0, Math.min(orderedStationIds.length - 1, Number(range.maxGap)));

            if (Number.isFinite(t?._firstStopIndex) && t._firstStopIndex >= 0) {
                t._firstStopIndex = Math.min(t._firstStopIndex, minVisibleByThrough);
            } else {
                t._firstStopIndex = minVisibleByThrough;
            }

            if (Number.isFinite(t?._lastStopIndex) && t._lastStopIndex >= 0) {
                t._lastStopIndex = Math.max(t._lastStopIndex, maxVisibleByThrough);
            } else {
                t._lastStopIndex = maxVisibleByThrough;
            }
        }

        const transferHeadCells = transferColumnCount > 0
            ? Array.from({ length: transferColumnCount }, () => '<div class="route-map-headspacer route-map-transfer-headspacer"></div>').join('')
            : '';

        const typeHeadCells = types.map((t) => {
            const colorInfo = resolveTrainTypeColorInfoForTheme(toText(t?.color) || '#888');
            const color = colorInfo.color || '#888';
            const name = toText(t?.typeName) || '-';

            const clsBase = colorInfo.darkAdjusted
                ? 'route-map-typehead is-dark-adjusted'
                : 'route-map-typehead';

            if (isEnglishTypeHeadText(name)) {
                return `<div class="${clsBase} is-sideways-rl" style="color:${escapeHtml(color)}">${escapeHtml(name)}</div>`;
            }

            const chunks = splitTypeHeadTextChunks(name);
            const hasEn = chunks.some((c) => c.kind === 'en');
            const hasOther = chunks.some((c) => c.kind !== 'en');
            if (hasEn && hasOther) {
                const inner = chunks.map((c) => {
                    const cls = c.kind === 'en' ? 'route-map-typehead-chunk is-en' : 'route-map-typehead-chunk is-other';
                    return `<span class="${cls}">${escapeHtml(c.text)}</span>`;
                }).join('');
                return `<div class="${clsBase} is-mixed-writing" style="color:${escapeHtml(color)}">${inner}</div>`;
            }

            return `<div class="${clsBase}" style="color:${escapeHtml(color)}">${escapeHtml(name)}</div>`;
        }).join('');

        const headCells = `${transferHeadCells}${typeHeadCells}<div class="route-map-headspacer"></div>`;

        const rows = [];
        let gridRowIndex = 1;

        const gridCellStyle = (gridRow, gridColumn, extraStyle = '') => {
            const baseStyle = `grid-row:${gridRow};grid-column:${gridColumn};`;
            return extraStyle ? `${baseStyle}${extraStyle}` : baseStyle;
        };

        const appendThroughGapRow = async (si) => {
            const throughGap = throughGapMap.get(si);
            if (!throughGap) return;

            const currentGridRow = gridRowIndex;

            const isTypePassingGap = (t, gapIndex) => {
                const stationCount = orderedStationIds.length;
                if (stationCount <= 0) return false;
                const gap = Number(gapIndex);
                if (!Number.isFinite(gap)) return false;
                if (gap < 0 || gap >= stationCount - 1) return false;

                const isVisibleAtStation = (stationIndex) => {
                    const firstStop = !!t?._primaryMask?.[stationIndex];
                    const secondStop = !!t?._secondaryMask?.[stationIndex];
                    const anyStop = !!t?._anyMask?.[stationIndex];
                    const hideHead = Number.isFinite(t?._firstStopIndex) && t._firstStopIndex >= 0 && stationIndex < t._firstStopIndex;
                    const hideTail = Number.isFinite(t?._lastStopIndex) && t._lastStopIndex >= 0 && stationIndex > t._lastStopIndex;
                    if ((hideHead && (t?._hasPair ? (!firstStop && !secondStop) : !anyStop)) || hideTail) {
                        return false;
                    }
                    return true;
                };

                return isVisibleAtStation(gap) && isVisibleAtStation(gap + 1);
            };

            const isBottomThrough = si === orderedStationIds.length - 1;

            const directionScore = Number(throughGapDirectionScore.get(si) || 0);
            const shouldReverseBranchOrder = si === -1
                ? true
                : (isBottomThrough ? false : (directionScore > 0));

            const THROUGH_BRANCH_HEIGHT_PX = 5;
            const THROUGH_BRANCH_TURN_PX = 12;
            const THROUGH_BRANCH_ELBOW_HEIGHT_PX = THROUGH_BRANCH_HEIGHT_PX + THROUGH_BRANCH_TURN_PX * 2;
            const THROUGH_BRANCH_HEAD_OFFSET_PX = 4.8;
            
            const THROUGH_ROW_SEAM_FUDGE_PX = 0.5;
            const resolveDirectionSign = () => {
                if (si === -1) return 1;
                if (isBottomThrough) return -1;
                if (directionScore === 0) return 1;
                return directionScore > 0 ? 1 : -1;
            };
            const directionSign = resolveDirectionSign();

            const isTypeAtOwnBoundary = (t) => {
                const firstStopIndex = Number(t?._firstStopIndex);
                const lastStopIndex = Number(t?._lastStopIndex);
                const isStartBoundary = Number.isFinite(firstStopIndex) && firstStopIndex === (si + 1);
                const isEndBoundary = Number.isFinite(lastStopIndex) && lastStopIndex === si;
                return isStartBoundary || isEndBoundary;
            };

            const buildRoundedBranchSvg = (branchWidth, direction) => {
                const w = Math.max(4, Number(branchWidth) || 0);
                const stroke = THROUGH_BRANCH_HEIGHT_PX;
                const maxTurnByWidth = Math.max(1, Math.floor(w - stroke - 2));
                const turn = Math.max(1, Math.min(THROUGH_BRANCH_TURN_PX, maxTurnByWidth));
                const h = stroke + turn * 2;
                const startX = stroke / 2;
                const centerY = h / 2;
                const targetY = direction === 'up' ? (centerY - turn) : (centerY + turn);
                const elbowX = startX + turn;
                const endX = Math.max(elbowX + 1, w - stroke / 2);
                const sweep = direction === 'up' ? 1 : 0;
                const d = `M ${startX} ${centerY} A ${turn} ${turn} 0 0 ${sweep} ${elbowX} ${targetY} L ${endX} ${targetY}`;
                return `<svg class="route-map-through-branch-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--branch-color, var(--tt-color, #888))" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="butt"></path></svg>`;
            };

            const activeTypeRows = [];
            for (let ti = 0; ti < types.length; ti += 1) {
                const t = types[ti];
                const typeId = toText(t?.typeId) || 'Unknown';
                const hasExplicitThroughForType = !!throughGap?.byTypeId?.has?.(typeId);
                if (!hasExplicitThroughForType) continue;
                activeTypeRows.push({ ti, t });
            }

            const activeRowsForOrder = shouldReverseBranchOrder
                ? activeTypeRows.slice()
                : activeTypeRows.slice().reverse();
            const activeIndexByTi = new Map(activeRowsForOrder.map((row, idx) => [row.ti, idx]));
            const activeCount = activeTypeRows.length;
            const hasMiddleThroughRow = activeTypeRows.some(({ t }) => !isTypeAtOwnBoundary(t));
            const stackCenter = (activeCount - 1) / 2;
            const endpointTypeIndexByTi = new Map();
            const endpointTis = [];
            for (let ti = 0; ti < types.length; ti += 1) {
                if (!activeIndexByTi.has(ti)) continue;
                if (!isTypeAtOwnBoundary(types[ti])) continue;
                endpointTis.push(ti);
            }
            endpointTis.sort((a, b) => {
                const da = Math.abs(Number(activeIndexByTi.get(a)) - stackCenter);
                const db = Math.abs(Number(activeIndexByTi.get(b)) - stackCenter);
                if (da !== db) return da - db;
                // tie-breaker: keep stable w.r.t. current stacked order
                return Number(activeIndexByTi.get(a)) - Number(activeIndexByTi.get(b));
            });
            for (let i = 0; i < endpointTis.length; i += 1) {
                endpointTypeIndexByTi.set(endpointTis[i], i + 1);
            }

            for (let ti = 0; ti < types.length; ti += 1) {
                const t = types[ti];
                const colorInfo = resolveTrainTypeColorInfoForTheme(toText(t?.color) || '#888');
                const color = colorInfo.color || '#888';

                let cls = 'route-map-cell is-through-row';
                if (colorInfo.darkAdjusted) cls += ' is-dark-adjusted';
                if (isBottomThrough) cls += ' is-through-bottom';

                if (!activeIndexByTi.has(ti)) {
                    if (isTypePassingGap(t, si)) {
                        rows.push(`<div class="${cls}" style="${gridCellStyle(currentGridRow, typeColumnOffset + ti + 1, `--tt-color:${escapeHtml(color)};`)}"></div>`);
                    } else {
                        rows.push(`<div class="route-map-through-empty" style="${gridCellStyle(currentGridRow, typeColumnOffset + ti + 1)}"></div>`);
                    }
                    continue;
                }

                const activeIdx = activeIndexByTi.get(ti);
                const remainingCols = Math.max(0, types.length - ti - 1);
                const throughWidth = remainingCols * (12 + 1) + 26;
                const z = (types.length - ti) + 1;
                const endpointOrder = Number(endpointTypeIndexByTi.get(ti) || 0);

                const branchDirection = directionSign > 0 ? 'up' : 'down';
                const isLineBoundaryGap = si === -1 || isBottomThrough;
                const isTypeBoundaryGap = isTypeAtOwnBoundary(t);
                const isBoundaryThrough = isLineBoundaryGap || isTypeBoundaryGap;
                const useMiddleThroughLogic = hasMiddleThroughRow || !isBoundaryThrough;

                const THROUGH_ROW_CENTER_Y_PX_MIDDLE = shouldReverseBranchOrder ? 37.5 : 12.5;
                const THROUGH_ROW_CENTER_Y_PX_EDGE = shouldReverseBranchOrder ? 25 : 15;
                const THROUGH_ROW_CENTER_Y_PX = useMiddleThroughLogic
                    ? THROUGH_ROW_CENTER_Y_PX_MIDDLE
                    : THROUGH_ROW_CENTER_Y_PX_EDGE;

                const branchCenterY = THROUGH_ROW_CENTER_Y_PX + (activeIdx - (activeCount - 1) / 2) * THROUGH_BRANCH_HEIGHT_PX;
                const legacyElbowTopY = branchCenterY - (THROUGH_BRANCH_ELBOW_HEIGHT_PX / 2);
                const branchTopYCenter = branchDirection === 'up' ? THROUGH_ROW_CENTER_Y_PX : 0;
                const branchTopY = useMiddleThroughLogic
                    ? legacyElbowTopY
                    : (branchTopYCenter + (activeIdx - stackCenter) * THROUGH_BRANCH_HEIGHT_PX);
                

                const throughRowTranslateY = endpointOrder <= 0
                    ? '0px'
                    : (() => {
                        const rowSign = directionSign;
                        const signedBase = rowSign * THROUGH_ROW_CENTER_Y_PX + (activeIdx - stackCenter) * THROUGH_BRANCH_HEIGHT_PX;
                        if (!hasMiddleThroughRow) {
                            const baseOffset = Number(signedBase.toFixed(2));
                            if(!shouldReverseBranchOrder){
                                return `${baseOffset - 20}px`;
                            }
                            else{
                                return `${baseOffset + 14.5}px`;
                            }
                        }
                        let y = signedBase;
                        if (!shouldReverseBranchOrder) {
                            // For reversed rows, shift uniformly by -0.5px (e.g. -12.5 -> -13.0, -22.5 -> -23.0).
                            y -= 25;
                        } else {
                            y -= THROUGH_ROW_SEAM_FUDGE_PX;
                        }
                        return `${y.toFixed(2)}px`;
                    })();

                
                const renderedWidth = throughWidth + THROUGH_BRANCH_HEAD_OFFSET_PX;
                const branchInner = buildRoundedBranchSvg(renderedWidth, branchDirection);
                const branchOffsets = isBoundaryThrough
                    ? [0, THROUGH_BRANCH_HEAD_OFFSET_PX]
                    : [THROUGH_BRANCH_HEAD_OFFSET_PX];
                const branches = branchOffsets.map((offset) => {
                    const branchStyle = `grid-row:${currentGridRow};grid-column:${typeColumnOffset + ti + 1};--branch-color:${escapeHtml(color)};--through-line-width:${throughWidth.toFixed(2)}px;--branch-total-width:${renderedWidth.toFixed(2)}px;--branch-start-offset:${Number(offset).toFixed(1)}px;--through-branch-height:${THROUGH_BRANCH_ELBOW_HEIGHT_PX}px;--branch-top-y:${branchTopY.toFixed(2)}px;`;
                    return `<span class="route-map-through-branch" style="${branchStyle}">${branchInner}</span>`;
                }).join('');

                rows.push(`<div class="${cls}" style="${gridCellStyle(currentGridRow, typeColumnOffset + ti + 1, `--tt-color:${escapeHtml(color)};--through-row-translate-y:${throughRowTranslateY};--through-z:${z};`)}"></div>`);
                rows.push(branches);
            }

            const allTargets = Array.from(throughGap.allTargetsByKey.values());
            const lineMap = new Map();
            for (const target of allTargets) {
                const lineId = toText(target?.refLineId);
                if (!lineId || lineMap.has(lineId)) continue;
                lineMap.set(lineId, target);
            }
            const throughItemList = await Promise.all(Array.from(lineMap.values()).map(async (target) => {
                const company = toText(target?.refCompany);
                const logoUrl = resolveCompanyLogoUrl(company);
                const lineId = toText(target?.refLineId);
                const lineName = toText(target?.refLineName) || lineId || '';
                const lineColor = resolveColorForTheme(target?.refLineColor || '#888', '#888');
                const logoHtml = logoUrl
                    ? `<img class="route-map-through-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(company || lineName)}" loading="lazy" decoding="async">`
                    : '';
                let lineIconHtml = '';
                if (lineId) {
                    const iconMeta = await getResolvedRouteIconMeta(lineId);
                    if (iconMeta && (iconMeta.code || iconMeta.color)) {
                        const iconEl = createLineIconElement({ routeId: iconMeta.id, code: iconMeta.code, color: iconMeta.color });
                        if (iconEl) {
                            lineIconHtml = formatRouteMapLineIconHtml(iconEl);
                        }
                    }
                }

                return `<span class="route-map-through-item">${logoHtml}${lineIconHtml}<span class="route-map-through-line" style="color:${escapeHtml(lineColor)}">${escapeHtml(lineName)}</span></span>`;
            }));

            let throughItems = '';
            let throughItemsClass = 'route-map-through-items';
            if (throughItemList.length > 2) {
                const firstRowCount = Math.ceil(throughItemList.length / 2);
                const firstRow = throughItemList.slice(0, firstRowCount).join('');
                const secondRow = throughItemList.slice(firstRowCount).join('');
                throughItemsClass += ' is-two-rows';
                throughItems = `<span class="route-map-through-row">${firstRow}</span><span class="route-map-through-row">${secondRow}</span>`;
            } else {
                throughItems = throughItemList.join('');
            }

            const labelHtml = throughItems
                ? `<span class="${throughItemsClass}">${throughItems}</span>`
                : '';
            const throughLabelTranslateY = (() => {
                if (si === -1) {
                    return throughItemList.length >= 2 ? '-2px' : '2px';
                }
                if (isBottomThrough) {
                    if (si === 0) return '2px';
                    if (si === (orderedStationIds.length - 1)) return '2px';
                }
                return '2px';
            })();
            rows.push(`<div class="route-map-station is-through-label" style="${gridCellStyle(currentGridRow, stationColumnIndex, `transform:translateY(${throughLabelTranslateY})`)}">${labelHtml}</div>`);
            gridRowIndex += 1;
        };

        // before first station
        await appendThroughGapRow(-1);

        for (let si = 0; si < orderedStationIds.length; si += 1) {
            const currentGridRow = gridRowIndex;
            const sid = toText(orderedStationIds?.[si]);
            const transferDisplay = transferDisplayByStationId.get(sid) || null;
            const isTransferStation = !!transferDisplay;
            const transferRowCount = Number(transferDisplay?.rowCount) || 1;
            const rowHeightPx = transferRowCount > 1 ?  (transferRowCount - 1) * 26 + 35 : 35;
            const stName = toText(orderedStationNames?.[si]) || toText(orderedStationIds[si]) || '';

            if (transferColumnCount > 0) {
                let transferLabelHtml = '';
                if (transferDisplay && Array.isArray(transferDisplay.itemHtmls) && transferDisplay.itemHtmls.length) {
                    const itemHtmls = transferDisplay.itemHtmls;
                    const popoverItemHtmls = Array.isArray(transferDisplay.popoverItemHtmls) && transferDisplay.popoverItemHtmls.length
                        ? transferDisplay.popoverItemHtmls
                        : itemHtmls;
                    const transferItemsClass = transferDisplay.rowCount > 2
                        ? 'route-map-transfer-items is-multi-rows'
                        : (transferDisplay.rowCount > 1 ? 'route-map-transfer-items is-two-rows' : 'route-map-transfer-items');
                    const popoverItemsClass = transferDisplay.popoverRowCount > 2
                        ? 'route-map-transfer-items is-multi-rows'
                        : (transferDisplay.popoverRowCount > 1 ? 'route-map-transfer-items is-two-rows' : 'route-map-transfer-items');
                    const rowsHtml = buildTransferRowsHtml(itemHtmls, transferDisplay.rowCount);
                    const popoverRowsHtml = buildTransferRowsHtml(popoverItemHtmls, transferDisplay.popoverRowCount || transferDisplay.rowCount);
                    const transferLinesLabel = `换乘线路：${popoverItemHtmls.length}条`;
                    transferLabelHtml = `<span class="route-map-transfer-items-shell" tabindex="0" aria-label="${escapeHtml(transferLinesLabel)}"><span class="${transferItemsClass} route-map-transfer-items-main">${rowsHtml}</span><span class="route-map-transfer-hover-panel" role="tooltip"><span class="${popoverItemsClass} route-map-transfer-items-popover">${popoverRowsHtml}</span></span></span>`;
                }

                rows.push(`<div class="route-map-station is-transfer-label" style="${gridCellStyle(currentGridRow, `1 / ${typeColumnOffset + 1}`, `min-height:${rowHeightPx}px;`)}">${transferLabelHtml}</div>`);
            }

            if (isTransferStation) {
                rows.push(`<div class="route-map-transfer-line" style="grid-row:${currentGridRow};grid-column:${typeColumnOffset + 1} / ${stationColumnIndex};"></div>`);
            }
            for (let ti = 0; ti < types.length; ti += 1) {
                const t = types[ti];
                const colorInfo = resolveTrainTypeColorInfoForTheme(toText(t?.color) || '#888');
                const color = colorInfo.color || '#888';
                const firstStop = !!t?._primaryMask?.[si];
                const secondStop = !!t?._secondaryMask?.[si];
                const anyStop = !!t?._anyMask?.[si];
                const hideHead = Number.isFinite(t?._firstStopIndex) && t._firstStopIndex >= 0 && si < t._firstStopIndex;
                const hideTail = Number.isFinite(t?._lastStopIndex) && t._lastStopIndex >= 0 && si > t._lastStopIndex;

                let cls = 'route-map-cell';
                if ((hideHead && (t?._hasPair ? (!firstStop && !secondStop) : !anyStop)) || hideTail) {
                    cls += ' is-hidden-tail';
                } else if (t?._hasPair) {
                    if (firstStop && secondStop) cls += isTransferStation ? ' is-stop is-transfer' : ' is-stop';
                    else if (secondStop && !firstStop) cls += ' is-stop-up';
                    else if (firstStop && !secondStop) cls += ' is-stop-down';
                } else if (anyStop) {
                    cls += isTransferStation ? ' is-stop is-transfer' : ' is-stop';
                }

                if (colorInfo.darkAdjusted) {
                    cls += ' is-dark-adjusted';
                }

                rows.push(`<div class="${cls}" style="${gridCellStyle(currentGridRow, typeColumnOffset + ti + 1, `--tt-color:${escapeHtml(color)};--route-row-height:${rowHeightPx}px;`)}"></div>`);
            }
            rows.push(`<div class="${escapeHtml(appendStationJumpClass('route-map-station'))}" data-station-id="${escapeHtml(sid)}" data-panel-station-jump="1" role="button" tabindex="0" title="${escapeHtml(stName)}" style="grid-row:${currentGridRow};grid-column:${stationColumnIndex};min-height:${rowHeightPx}px;display:flex;align-items:center;">${escapeHtml(stName)}</div>`);

            gridRowIndex += 1;

            await appendThroughGapRow(si);
        }

        const metaLine = (() => {
            const day = toText(payload?.serviceDay);
            const dayText = day === 'SaturdayHoliday' ? '休息日' : '工作日';
            return `<div class="route-map-meta">${escapeHtml(dayText)}</div>`;
        })();

        return {
            headHtml: `<div class="route-map-grid" style="${gridStyle}">${headCells}</div>`,
            bodyHtml: `${metaLine}
                <div class="route-map-section">
                    <div class="route-map-section-title">站序</div>
                    <div class="route-map-grid" style="${gridStyle}">
                        ${rows.join('')}
                    </div>
                </div>`
        };
    };

    const showForLine = async ({ lineId, lineName, anchorRect, placement = 'anchor', returnTarget: nextReturnTarget = '' }) => {
        const lid = toText(lineId);
        if (!lid) return;
        if (!window?.TokyoRailTimetableCache) return;

        const serviceDay = getCurrentServiceDayFromPanelDom();
        const minTripsPerDay = 0;
        const cacheKey = `${lid}||${serviceDay}||minTrips=${minTripsPerDay}`;

        activeLineId = lid;
        activeLineName = toText(lineName) || lid;
        const isSameBranchLine = branchPreviewActive && branchPreviewLineId === lid;
        setBranchButtonState({ active: isSameBranchLine, busy: false });
        await renderRouteMapTitleWithIcon(topTitle, lid, activeLineName);
        topTitle.style.color = '';
        lastAnchorRect = anchorRect || null;
        const normalizedPlacement = toText(placement);
        lastPlacement = normalizedPlacement === 'mobile-panel'
            ? 'mobile-panel'
            : (normalizedPlacement === 'panel' ? 'panel' : 'anchor');
        returnTarget = toText(nextReturnTarget);
        if (isMobilePanelPlacementActive()) {
            mobileSheetState = 'half';
        }
        syncReturnTargetUi();
        hideTransferHoverPortal();

        gridHeader.innerHTML = '';
        body.innerHTML = '<div class="route-map-meta">加载中…</div>';
        root.classList.remove('is-hidden');
        positionPanel();

        const payload = cache.has(cacheKey)
            ? cache.get(cacheKey)
            : await computeLineStopDiagramData(lid, { serviceDay, minTripsPerDay });
        if (!payload) {
            gridHeader.innerHTML = '';
            body.innerHTML = '<div class="route-map-meta">无法生成（该线路无时刻表数据或尚未加载）</div>';
            positionPanel();
            return;
        }
        cache.set(cacheKey, payload);

        // If user already hovered to another line, drop this render.
        if (activeLineId !== lid) return;

        const lineColor = resolveColorForTheme(toText(payload?.selectedLine?.lineColor) || '', '');
        topTitle.style.color = lineColor || '';

        const rendered = await renderDiagram(payload);
        hideTransferHoverPortal();
        gridHeader.innerHTML = rendered?.headHtml || '';
        body.innerHTML = rendered?.bodyHtml || '';
        await enhanceRouteMapStationCodeBadges(body, {
            lineId: lid,
            lineColor: toText(payload?.selectedLine?.lineColor || '')
        });
        await nextFrame();
        syncRouteMapGridHeaderWidth();
        positionPanel();
    };

    const readLineIdAndNameFromTarget = (target) => {
        if (!(target instanceof Element)) return null;
        const hit = target.closest?.('.panel-line-name');
        if (!hit) return null;
        const lineEl = hit.closest?.('[data-line-id]');
        const lineId = toText(lineEl?.getAttribute?.('data-line-id'));
        if (!lineId) return null;
        const displayName = toText(hit.getAttribute?.('data-line-name')) || lineId;
        return {
            lineId,
            lineName: displayName,
            lineEl,
            anchorRect: hit.getBoundingClientRect?.() || null
        };
    };

    const showRouteMapStationIndicator = (stationId) => {
        const sid = toText(stationId);
        if (!sid) return;
        try {
            window.dispatchEvent(new CustomEvent('__TokyoRailRouteMapStationIndicatorShow', {
                detail: { stationId: sid }
            }));
        } catch {
            // ignore
        }
    };

    const clearRouteMapStationIndicator = () => {
        try {
            window.dispatchEvent(new CustomEvent('__TokyoRailRouteMapStationIndicatorClear'));
        } catch {
            // ignore
        }
    };

    const notifyRouteMapPopoverHoverEnter = () => {
        try {
            window.dispatchEvent(new CustomEvent('__TokyoRailRouteMapPopoverHoverEnter'));
        } catch {
            // ignore
        }
    };

    const notifyRouteMapPopoverHoverLeave = () => {
        try {
            window.dispatchEvent(new CustomEvent('__TokyoRailRouteMapPopoverHoverLeave'));
        } catch {
            // ignore
        }
    };

    const getRouteMapStationTarget = (target) => {
        if (!(target instanceof Element)) return null;
        return target.closest?.('.route-map-station[data-station-id]') || null;
    };

    const hideRouteMapForStationJump = () => {
        pinned = false;
        root.classList.add('is-hidden');
        applyMobileSheetState('hidden');
        hideTransferHoverPortal();
        activeLineId = '';
        activeLineName = '';
        returnTarget = '';
        syncReturnTargetUi();
    };

    const dispatchRouteMapStationJump = (target, event) => {
        const intent = resolveStationJumpIntent(target, {
            adjustTime: false,
            rootEl: body,
            toText
        });
        if (!intent) return false;

        clearRouteMapStationIndicator();
        hideRouteMapForStationJump();
        try {
            window.dispatchEvent(new CustomEvent('__TokyoRailPanelStationJump', {
                detail: {
                    adjustTime: false,
                    source: 'route-map',
                    stationId: intent.stationId
                }
            }));
        } catch {
            // ignore
        }
        stopEvent(event);
        return true;
    };

    const syncRouteMapGridHeaderWidth = () => {
        const headerGrid = gridHeader.querySelector('.route-map-grid');
        const bodyGrid = body.querySelector('.route-map-grid');
        if (!(headerGrid instanceof HTMLElement) || !(bodyGrid instanceof HTMLElement)) return;

        const transferSpacers = headerGrid.querySelectorAll('.route-map-transfer-headspacer');
        if (!transferSpacers.length) return;

        const transferLabel = bodyGrid.querySelector('.route-map-station.is-transfer-label');
        if (!(transferLabel instanceof HTMLElement)) return;

        const leftWidth = Math.max(0, Math.round(transferLabel.getBoundingClientRect().width) - 2);

        transferSpacers.forEach((el, index) => {
            if (!(el instanceof HTMLElement)) return;
            el.style.width = index === 0 ? `${leftWidth+6.5}px` : '0px';
        });
    };

    // Keep panel open when pointer is inside it
    root.addEventListener('pointerdown', (e) => {
        pinned = true;
        clearTimers();
        stopPropagationOnly(e);
    }, { passive: true });
    root.addEventListener('click', (e) => {
        pinned = true;
        clearTimers();
        stopPropagationOnly(e);
    }, { passive: true });
    root.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('mouseenter', () => {
        hoverInsidePanel = true;
        clearTimers();
        notifyRouteMapPopoverHoverEnter();
    });
    root.addEventListener('mouseleave', () => {
        hoverInsidePanel = false;
        if (!pinned) scheduleHide(180);
        clearRouteMapStationIndicator();
        notifyRouteMapPopoverHoverLeave();
    });

    body.addEventListener('mouseover', (evt) => {
        const stationEl = getRouteMapStationTarget(evt?.target);
        if (!stationEl) return;
        const sid = toText(stationEl.getAttribute('data-station-id'));
        if (!sid) return;
        showRouteMapStationIndicator(sid);
    });

    body.addEventListener('mouseout', (evt) => {
        const fromEl = getRouteMapStationTarget(evt?.target);
        if (!fromEl) return;
        const toEl = evt?.relatedTarget;
        const toStation = getRouteMapStationTarget(toEl);
        if (toStation) return;
        clearRouteMapStationIndicator();
    });

    body.addEventListener('mouseleave', () => {
        clearRouteMapStationIndicator();
    });

    body.addEventListener('click', (evt) => {
        dispatchRouteMapStationJump(evt?.target, evt);
    }, { passive: false });

    body.addEventListener('keydown', (evt) => {
        const key = toText(evt?.key);
        if (key !== 'Enter' && key !== ' ') return;
        dispatchRouteMapStationJump(evt?.target, evt);
    }, { passive: false });

    body.addEventListener('pointerdown', (evt) => {
        const stationEl = getRouteMapStationTarget(evt?.target);
        if (!stationEl) return;
        const sid = toText(stationEl.getAttribute('data-station-id'));
        if (!sid) return;
        showRouteMapStationIndicator(sid);
    }, { passive: true });

    backBtn.addEventListener('click', (evt) => {
        stopEvent(evt);
        pinned = false;
        root.classList.add('is-hidden');
        applyMobileSheetState('hidden');
        hideTransferHoverPortal();
        activeLineId = '';
        activeLineName = '';
        const target = returnTarget;
        returnTarget = '';
        syncReturnTargetUi();
        try {
            window.dispatchEvent(new CustomEvent('__TokyoRailRouteMapReturnPanel', {
                detail: { returnTarget: target }
            }));
        } catch {
            // ignore
        }
    }, { passive: false });

    mobileDragBar.addEventListener('pointerdown', beginMobileSheetDrag, { passive: false });
    mobileDragBar.addEventListener('pointermove', updateMobileSheetDrag, { passive: false });
    document.addEventListener('pointermove', updateMobileSheetDrag, { capture: true, passive: false });
    mobileDragBar.addEventListener('pointerup', endMobileSheetDrag, { passive: false });
    document.addEventListener('pointerup', endMobileSheetDrag, { capture: true, passive: false });
    mobileDragBar.addEventListener('pointercancel', (event) => endMobileSheetDrag(event, { cancelled: true }), { passive: false });
    document.addEventListener('pointercancel', (event) => endMobileSheetDrag(event, { cancelled: true }), { capture: true, passive: false });
    mobileDragBar.addEventListener('lostpointercapture', (event) => endMobileSheetDrag(event, { cancelled: true }), { passive: false });

    // Hover: show
    document.addEventListener('pointermove', (evt) => {
        lastPointer = { x: Number(evt?.clientX) || 0, y: Number(evt?.clientY) || 0 };
    }, true);

    document.addEventListener('pointerover', (evt) => {
        if (pinned) return;
        const info = readLineIdAndNameFromTarget(evt?.target);
        if (!info) return;
        const { lineId, lineName, anchorRect } = info;

        clearTimers();
        showTimer = setTimeout(() => {
            showTimer = 0;
            showForLine({ lineId, lineName, anchorRect });
        }, 140);
    }, true);

    document.addEventListener('pointerout', (evt) => {
        if (pinned) return;
        const fromLine = readLineIdAndNameFromTarget(evt?.target);
        if (!fromLine) return;
        // If pointer moves into the floating panel, do not hide.
        const related = evt?.relatedTarget;
        if (related instanceof Element && root.contains(related)) return;
        scheduleHide(200);
    }, true);

    // Click: pin/unpin
    document.addEventListener('click', (evt) => {
        if (shouldDeferPanelLineClickToMobilePanel(evt?.target)) return;
        const info = readLineIdAndNameFromTarget(evt?.target);
        if (!info) return;
        const { lineId, lineName, anchorRect } = info;

        // toggle pin for the same line
        const same = toText(lineId) && toText(lineId) === activeLineId;
        if (pinned && same) {
            pinned = false;
            // if not hovering on line-name or panel, hide
            scheduleHide(0);
            return;
        }

        pinned = true;
        clearTimers();
        showForLine({
            lineId,
            lineName,
            anchorRect,
            placement: isMobileRouteMapPresentation() ? 'mobile-panel' : 'anchor',
            returnTarget: isMobileRouteMapPresentation() && evt?.target?.closest?.('[data-panel-root]') ? 'panel' : ''
        });
    }, true);

    window.addEventListener('__TokyoRailShowRouteMapPanel', (evt) => {
        const d = evt?.detail || {};
        const lineId = toText(d?.lineId);
        if (!lineId) return;
        const lineName = toText(d?.lineName) || lineId;
        const rawPlacement = toText(d?.placement);
        const placement = rawPlacement === 'mobile-panel'
            ? 'mobile-panel'
            : (rawPlacement === 'panel' ? 'panel' : 'anchor');
        const nextReturnTarget = toText(d?.returnTarget);

        pinned = true;
        clearTimers();
        showForLine({ lineId, lineName, anchorRect: null, placement, returnTarget: nextReturnTarget });
    });

    // Click outside: unpin & hide
    // Use click (not pointerdown) so dragging map does not close pinned panel.
    document.addEventListener('click', (evt) => {
        if (!pinned) return;
        const t = evt?.target;
        if (t instanceof Element) {
            if (root.contains(t)) return;
            if (t.closest?.('.panel-line-name')) return;
        }
        pinned = false;
        root.classList.add('is-hidden');
        activeLineId = '';
        activeLineName = '';
        clearRouteMapStationIndicator();
        notifyRouteMapPopoverHoverLeave();
    }, true);

    document.addEventListener('keydown', (evt) => {
        if (evt?.key !== 'Escape') return;
        if (root.classList.contains('is-hidden')) return;
        pinned = false;
        root.classList.add('is-hidden');
        activeLineId = '';
        activeLineName = '';
        clearRouteMapStationIndicator();
        notifyRouteMapPopoverHoverLeave();
    });

    // Day toggle: refresh if panel is visible
    document.addEventListener('click', (evt) => {
        const t = evt?.target;
        if (!(t instanceof Element)) return;
        if (!t.closest?.('.panel-day-seg button[data-day]')) return;
        if (root.classList.contains('is-hidden')) return;
        if (!activeLineId) return;

        // Clear cache for this line for both days to avoid stale render
        cache.delete(`${activeLineId}||Weekday`);
        cache.delete(`${activeLineId}||SaturdayHoliday`);

        showForLine({
            lineId: activeLineId,
            lineName: activeLineName,
            anchorRect: lastAnchorRect
        });
    }, true);
};

setupRouteMapUi();
