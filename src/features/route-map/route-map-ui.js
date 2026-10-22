/**
 * route-map-ui.js
 *
 * UI feature:
 * 1) Hover on .panel-line-name shows a trip-detail-like floating panel.
 * 2) Click on .panel-line-name pins/unpins the panel.
 * 3) 在同一张图中展示全部种别、停站与多层分支。
 *    布局和绘制由独立 UI 模块负责，数据处理通过 feature 入口完成。
 */

import { computeLineServiceDiagramData } from './route-map.js';
import { renderLineServiceDiagram } from '../../ui/lineServiceDiagramRenderer.js';
import { installLineServiceDiagramView } from '../../ui/lineServiceDiagramView.js';
import { captureRouteMapImage, requestRouteMapLineTimetablesPrint } from './route-map-actions.js';
import { createLineIconElement, getResolvedRouteIconMeta } from '../../lib/line-icons.js';
import { getIconCandidates, getPreferredCachedImageSrc, setImageElementFromCache } from '../../lib/fetch.js';
import { previewBranchesForLine } from '../../map/analyze_branch.js';
import { stationSelectionPerf } from '../../debug/stationSelectionPerformanceProbe.js';
import { THROUGH_SERVICE_CONFIGS_OBJECT } from '../../lib/throughServiceManager.js';
import {
    DEFAULT_MOBILE_SHEET_PEEK_PX,
    createMobileSheetDragSession,
    getMobileSheetOffsetForState,
    resolveMobileSheetDragTarget,
    updateMobileSheetDragSession
} from '../../ui/mobileSheetSnap.js';
import { createMobileSheetPullDownController } from '../../ui/mobileSheetPullDown.js';
import {
    resolveStationJumpIntent
} from '../../ui/stationJump.js';
import { createTransferHoverTouchPortalController } from '../../ui/transferHoverTouchPortal.js';

const toText = (v) => String(v ?? '').trim();
const ROUTE_MAP_BACK_INTENT_EVENT = '__TokyoRailRouteMapBackIntent';
const ROUTE_MAP_RETURN_PANEL_EVENT = '__TokyoRailRouteMapReturnPanel';

export const SU_SERVICE_INFO_BY_KEY = THROUGH_SERVICE_CONFIGS_OBJECT;

const renderRouteMapTitleWithIcon = async (titleEl, lineId, lineName, isCurrent) => {
    if (!(titleEl instanceof HTMLElement)) return;

    const safeId = toText(lineId);
    const safeName = toText(lineName) || safeId;

    titleEl.textContent = '';

    const textSpan = document.createElement('span');
    textSpan.className = 'route-map-title-text';
    textSpan.textContent = safeName;

    const meta = await getResolvedRouteIconMeta(safeId);
    if (!isCurrent()) return;
    if (meta && (meta.code || meta.color) ) {
        const icon = createLineIconElement({ routeId: meta.id, code: meta.code, color: meta.color });
        if (icon) {
            icon.style.marginRight = '4px';
            titleEl.appendChild(icon);
        }
    }

    titleEl.appendChild(textSpan);
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

const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

const ROUTE_MAP_STYLE_HREF = './src/styles/route-map.css';
const MOBILE_FOLDABLE_MIN_WIDTH_PX = 600;
// 小田急小田原线现有桌面面板的内容宽度，含边框后为 490px。
const DESKTOP_ROUTE_MAP_WIDTH_PX = 488;

const ensureStyleInstalled = () => {
    if (document.querySelector('link[data-route-map-style="1"], style[data-route-map-style="1"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ROUTE_MAP_STYLE_HREF;
    link.setAttribute('data-route-map-style', '1');
    document.head.appendChild(link);
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

const resolveColorForTheme = (color, fallback = '#888') => {
    const info = resolveTrainTypeColorInfoForTheme(toText(color) || fallback);
    return info.color || fallback;
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
    branchBtn.setAttribute('aria-label', '显示全部直通');
    branchBtn.title = '显示全部直通';
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
    document.body.appendChild(root);
    document.body.appendChild(transferHoverPortal);
    root.style.setProperty('--mobile-sheet-peek-height', `${DEFAULT_MOBILE_SHEET_PEEK_PX}px`);
    root.style.setProperty('--mobile-sheet-covered-offset', '0px');

    let diagramView = null;
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
    let mobileDragCaptureEl = null;
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

    const isMobileFoldableWidth = () => {
        const width = Number(window?.innerWidth);
        return Number.isFinite(width) && width >= MOBILE_FOLDABLE_MIN_WIDTH_PX;
    };

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
    const setMobileSheetCoveredOffset = (offset) => {
        const value = Math.max(0, Math.round(Number(offset) || 0));
        root.style.setProperty('--mobile-sheet-covered-offset', `${value}px`);
    };

    const applyMobileSheetState = (state = mobileSheetState, { transition = true } = {}) => {
        mobileSheetState = state === 'expanded'
            ? 'expanded'
            : (state === 'collapsed' ? 'collapsed' : (state === 'hidden' ? 'hidden' : 'half'));
        root.style.transition = transition ? '' : 'none';
        if (!isMobilePanelPlacementActive()) {
            root.removeAttribute('data-route-map-mobile-state');
            setMobileSheetCoveredOffset(0);
            return;
        }
        root.setAttribute('data-route-map-mobile-state', mobileSheetState);
        if (mobileSheetState === 'expanded') {
            setMobileSheetCoveredOffset(0);
            root.style.transform = 'translateY(0)';
        } else if (mobileSheetState === 'hidden') {
            setMobileSheetCoveredOffset(0);
            root.style.transform = 'translateY(calc(100% + 24px))';
        } else if (mobileSheetState === 'collapsed') {
            const offset = getMobileSheetOffset('collapsed');
            setMobileSheetCoveredOffset(offset);
            root.style.transform = `translateY(${offset}px)`;
        } else {
            const offset = getMobileSheetOffset('half');
            setMobileSheetCoveredOffset(offset);
            root.style.transform = `translateY(${offset}px)`;
        }
    };

    const beginMobileSheetDrag = (event) => {
        if (!isMobilePanelPlacementActive()) return false;
        if (event?.button != null && event.button !== 0) return false;
        const rootHeight = Math.max(1, Math.round(root.getBoundingClientRect?.().height || window.innerHeight || 1));
        mobileDragState = {
            pointerId: event?.pointerId,
            session: createMobileSheetDragSession({
                startY: Number(event?.clientY) || 0,
                startOffset: getMobileSheetOffset(),
                startState: mobileSheetState,
                height: rootHeight,
                peekPx: DEFAULT_MOBILE_SHEET_PEEK_PX,
                nowMs: Number(event?.timeStamp) || undefined
            })
        };
        mobileDragCaptureEl = event?.currentTarget instanceof HTMLElement ? event.currentTarget : mobileDragBar;
        root.setAttribute('data-route-map-mobile-dragging', '1');
        root.style.transition = 'none';
        try {
            mobileDragCaptureEl.setPointerCapture?.(event.pointerId);
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
        updateMobileSheetDragSession(mobileDragState.session, {
            clientY: Number(event?.clientY) || mobileDragState.session.currentY,
            nowMs: Number(event?.timeStamp) || undefined
        });
        setMobileSheetCoveredOffset(mobileDragState.session.currentOffset);
        root.style.transform = `translateY(${mobileDragState.session.currentOffset}px)`;
        event?.preventDefault?.();
        event?.stopPropagation?.();
    };

    const endMobileSheetDrag = (event, { cancelled = false } = {}) => {
        if (!mobileDragState) return;
        if (mobileDragState.pointerId != null && event?.pointerId !== mobileDragState.pointerId) return;
        const targetState = resolveMobileSheetDragTarget(mobileDragState.session, {
            clientY: cancelled ? mobileDragState.session.startY : (Number(event?.clientY) || mobileDragState.session.currentY),
            nowMs: Number(event?.timeStamp) || undefined,
            cancelled
        });
        mobileDragState = null;
        const captureEl = mobileDragCaptureEl || mobileDragBar;
        mobileDragCaptureEl = null;
        root.removeAttribute('data-route-map-mobile-dragging');
        root.style.transition = '';
        try {
            captureEl.releasePointerCapture?.(event.pointerId);
        } catch {
            // ignore pointer-capture gaps
        }

        applyMobileSheetState(targetState);
        event?.preventDefault?.();
        event?.stopPropagation?.();
    };

    const isRouteMapHeaderDragControl = (target) => {
        if (!(target instanceof Element)) return false;
        return Boolean(target.closest?.(
            'button, a, input, select, textarea, [role="button"], [role="menu"], [role="menuitem"], .route-map-actions, .route-map-export-menu-ui'
        ));
    };

    const beginRouteMapHeaderSheetDrag = (event) => {
        if (isRouteMapHeaderDragControl(event?.target)) return false;
        return beginMobileSheetDrag(event);
    };

    const setBranchButtonState = ({ active = false, busy = false } = {}) => {
        branchPreviewActive = active === true;
        branchPreviewBusy = busy === true;
        branchBtn.classList.toggle('is-active', branchPreviewActive);
        branchBtn.classList.toggle('is-busy', branchPreviewBusy);
        branchBtn.disabled = branchPreviewBusy;
        branchBtn.title = branchPreviewBusy ? '正在分析直通…' : (branchPreviewActive ? '仅显示当前线路' : '显示全部直通');
        branchBtn.setAttribute('aria-label', branchBtn.title);
        if (!branchPreviewBusy) diagramView?.focus();
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

    branchBtn.addEventListener('click', async (evt) => {
        stopEvent(evt);
        pinned = true;
        clearTimers();

        const lid = toText(activeLineId);
        if (!lid || branchPreviewBusy) return;

        const isSameActive = branchPreviewActive && branchPreviewLineId === lid;
        if (isSameActive) {
            clearBranchPreviewBySource();
            branchPreviewLineId = '';
            setBranchButtonState({ active: false, busy: false });
            return;
        }

        setBranchButtonState({ active: false, busy: true });
        try {
            const result = await previewBranchesForLine({
                lineId: lid,
                lineName: activeLineName,
                fitMode: 'commit',
                filterSpecial: false,
            });
            const ok = result?.ok === true;
            
            if (ok) {
                branchPreviewLineId = lid;
                setBranchButtonState({ active: true, busy: false });
            } else {
                branchPreviewLineId = '';
                setBranchButtonState({ active: false, busy: false });
            }
        } catch {
            branchPreviewLineId = '';
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
        const restoreView = diagramView?.prepareExport();
        try {
            await captureRouteMapImage({ element: root, filenameBase: baseName, buttonEl: captureBtn });
        } finally {
            await restoreView?.();
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
    let transferHoverTouchController = null;
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

        const pad = 6;
        const gap = 8;
        const rawViewportWidth = Number(window.innerWidth) || 0;
        const maxPortalWidth = rawViewportWidth > pad * 2 ? rawViewportWidth - pad * 2 : 280;
        transferHoverPortal.style.maxWidth = `${maxPortalWidth}px`;

        const shellRect = shell.getBoundingClientRect();
        const portalRect = transferHoverPortal.getBoundingClientRect();
        const viewportWidth = rawViewportWidth || portalRect.width + pad * 2;
        const viewportHeight = Number(window.innerHeight) || portalRect.height + pad * 2;

        let left = shellRect.left - portalRect.width - gap;
        if (!Number.isFinite(left) || left < pad) {
            left = shellRect.right + gap;
        }
        left = Math.max(pad, Math.min(left, Math.max(pad, viewportWidth - portalRect.width - pad)));

        let top = shellRect.top + shellRect.height / 2 - portalRect.height / 2;
        if (!Number.isFinite(top)) top = pad;
        top = Math.max(pad, Math.min(top, Math.max(pad, viewportHeight - portalRect.height - pad)));

        transferHoverPortal.style.left = `${left}px`;
        transferHoverPortal.style.top = `${top}px`;
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
        if (transferHoverTouchController?.isMobileInteraction?.(evt)) return;
        const shell = evt?.target?.closest?.('.route-map-transfer-items-shell');
        if (!(shell instanceof HTMLElement) || !body.contains(shell)) return;
        if (shell === activeTransferHoverShell) {
            positionTransferHoverPortal(shell);
            return;
        }
        showTransferHoverPortal(shell);
    });

    body.addEventListener('pointerout', (evt) => {
        if (transferHoverTouchController?.isMobileInteraction?.(evt)) return;
        const shell = evt?.target?.closest?.('.route-map-transfer-items-shell');
        if (!(shell instanceof HTMLElement) || shell !== activeTransferHoverShell) return;
        const related = evt.relatedTarget;
        if (related instanceof Node && shell.contains(related)) return;
        hideTransferHoverPortal();
    });

    body.addEventListener('focusin', (evt) => {
        if (isMobileRouteMapPresentation()) return;
        const shell = evt?.target?.closest?.('.route-map-transfer-items-shell');
        if (!(shell instanceof HTMLElement) || !body.contains(shell)) return;
        showTransferHoverPortal(shell);
    });

    body.addEventListener('focusout', (evt) => {
        if (isMobileRouteMapPresentation()) return;
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

    transferHoverTouchController = createTransferHoverTouchPortalController({
        doc: document,
        findShell: (target) => target?.closest?.('.route-map-transfer-items-shell'),
        hide: hideTransferHoverPortal,
        isMobile: isMobileRouteMapPresentation,
        // 线路图需要接收换乘图标上的指针事件，拖动成立后再取消长按意图。
        passThroughPointerEvents: true,
        portal: transferHoverPortal,
        root: body,
        show: showTransferHoverPortal
    });

    const cache = new Map();

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
            if (isPointerOverRouteMapHoverTarget()) return;
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
            root.style.right = isMobileFoldableWidth() ? 'auto' : '0';
            root.style.top = 'auto';
            root.style.bottom = '0';
            root.style.width = isMobileFoldableWidth() ? 'var(--mobile-foldable-pane-width, 50vw)' : '100%';
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
                const w = Math.min(DESKTOP_ROUTE_MAP_WIDTH_PX, maxW);
                const h = Math.min(rect.height, maxH);
                root.style.left = '';
                root.style.right = '20px';
                root.style.top = `${Math.max(pad, rect.top)}px`;
                root.style.width = `${w}px`;
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
        root.style.width = `${DESKTOP_ROUTE_MAP_WIDTH_PX}px`;
        root.style.minWidth = '';
        root.style.height = '';
        root.style.maxHeight = '';
        root.style.transform = '';
        setMobileSheetCoveredOffset(0);
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

    const showForLine = async ({ lineId, lineName, anchorRect, placement = 'anchor', returnTarget: nextReturnTarget = '' }) => {
        const lid = toText(lineId);
        if (!lid) return;
        const cacheKey = lid;

        activeLineId = lid;
        activeLineName = toText(lineName) || lid;
        const isSameBranchLine = branchPreviewActive && branchPreviewLineId === lid;
        setBranchButtonState({ active: isSameBranchLine, busy: false });
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

        diagramView?.destroy();
        diagramView = null;
        gridHeader.innerHTML = '';
        body.classList.remove('has-service-diagram');
        body.innerHTML = '';
        root.classList.remove('is-hidden');
        positionPanel();
        await renderRouteMapTitleWithIcon(topTitle, lid, activeLineName, () => activeLineId === lid);
        if (activeLineId !== lid) return;
        topTitle.style.color = '';

        try {
            const payload = cache.has(cacheKey) ? cache.get(cacheKey) : await computeLineServiceDiagramData(lid);
            cache.set(cacheKey, payload);
            if (activeLineId !== lid) return;
            topTitle.style.color = resolveColorForTheme(payload.selectedLine.color, '');
            const rendered = await renderLineServiceDiagram(payload, { resolveColor: resolveColorForTheme });
            if (activeLineId !== lid) return;
            hideTransferHoverPortal();
            gridHeader.innerHTML = rendered.headHtml;
            body.innerHTML = rendered.bodyHtml;
            body.classList.toggle('has-service-diagram', !!rendered.layout);
            if (rendered.layout) diagramView = installLineServiceDiagramView({
                root, viewport: body.querySelector('.route-map-diagram-viewport'),
                layout: rendered.layout, resolveColor: resolveColorForTheme, onMove: transferHoverTouchController.cancel,
                showFullDiagram: () => branchPreviewActive && branchPreviewLineId === activeLineId
            });
        } catch (error) {
            if (activeLineId !== lid) return;
            gridHeader.innerHTML = '';
            body.classList.remove('has-service-diagram');
            const feedback = document.createElement('div');
            feedback.className = 'route-map-empty';
            feedback.textContent = `无法生成线路图：${error.message}`;
            body.replaceChildren(feedback);
        }
        await nextFrame();
        positionPanel();
    };

    const readLineIdAndNameFromTarget = (target) => {
        if (!(target instanceof Element)) return null;
        const hit = target.closest?.('.panel-line-name');
        if (!hit) return null;
        if (hit.closest?.('[data-panel-root]')) return null;
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

    const isPointerOverRouteMapHoverTarget = () => {
        const x = Number(lastPointer?.x);
        const y = Number(lastPointer?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        const target = document.elementFromPoint?.(x, y);
        if (!(target instanceof Element)) return false;
        return root.contains(target) || !!readLineIdAndNameFromTarget(target);
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

    const resetRouteMapStateForBack = () => {
        window?.TokyoRailSearchMapActions?.clearTripPathPreviewBySource?.('route-map-branch');
        branchPreviewLineId = '';
        branchPreviewActive = false;
        branchPreviewBusy = false;
        clearRouteMapStationIndicator();
        notifyRouteMapPopoverHoverLeave();
    };

    const hideRouteMapForBackIntent = (detail) => {
        if (root.classList.contains('is-hidden')) return false;
        const perfSessionId = stationSelectionPerf.begin('reset', { entry: 'route-map-back' });
        if (detail && typeof detail === 'object') detail.perfSessionId = perfSessionId;

        const target = returnTarget;
        pinned = false;
        root.classList.add('is-hidden');
        applyMobileSheetState('hidden');
        hideTransferHoverPortal();
        activeLineId = '';
        activeLineName = '';
        returnTarget = '';
        syncReturnTargetUi();
        resetRouteMapStateForBack();

        if (target === 'panel') {
            try {
                window.dispatchEvent(new CustomEvent(ROUTE_MAP_RETURN_PANEL_EVENT, {
                    detail: { returnTarget: target, source: 'android-back' }
                }));
            } catch {
                // ignore
            }
        }
        return true;
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
            window.dispatchEvent(new CustomEvent(ROUTE_MAP_RETURN_PANEL_EVENT, {
                detail: { returnTarget: target }
            }));
        } catch {
            // ignore
        }
    }, { passive: false });

    window.addEventListener(ROUTE_MAP_BACK_INTENT_EVENT, (evt) => {
        if (!hideRouteMapForBackIntent(evt?.detail)) return;
        if (evt?.detail && typeof evt.detail === 'object') {
            evt.detail.handled = true;
        }
    });

    mobileDragBar.addEventListener('pointerdown', beginMobileSheetDrag, { passive: false });
    topHeader.addEventListener('pointerdown', beginRouteMapHeaderSheetDrag, { passive: false });
    mobileDragBar.addEventListener('pointermove', updateMobileSheetDrag, { passive: false });
    document.addEventListener('pointermove', updateMobileSheetDrag, { capture: true, passive: false });
    mobileDragBar.addEventListener('pointerup', endMobileSheetDrag, { passive: false });
    document.addEventListener('pointerup', endMobileSheetDrag, { capture: true, passive: false });
    mobileDragBar.addEventListener('pointercancel', (event) => endMobileSheetDrag(event, { cancelled: true }), { passive: false });
    document.addEventListener('pointercancel', (event) => endMobileSheetDrag(event, { cancelled: true }), { capture: true, passive: false });
    mobileDragBar.addEventListener('lostpointercapture', (event) => endMobileSheetDrag(event, { cancelled: true }), { passive: false });
    topHeader.addEventListener('lostpointercapture', (event) => endMobileSheetDrag(event, { cancelled: true }), { passive: false });
    createMobileSheetPullDownController({
        scrollEl: body,
        doc: document,
        isEnabled: isMobilePanelPlacementActive,
        canStartGesture: (event) => !event.target?.closest?.('.route-map-diagram-viewport'),
        beginSheetDrag: beginMobileSheetDrag,
        updateSheetDrag: updateMobileSheetDrag,
        endSheetDrag: endMobileSheetDrag
    });

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
        // If pointer moves into another line-name or the floating panel, do not hide.
        const related = evt?.relatedTarget;
        if (readLineIdAndNameFromTarget(related)) return;
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
            if (transferHoverPortal.contains(t)) return;
            if (t.closest?.('.panel-line-name')) return;
        }
        pinned = false;
        root.classList.add('is-hidden');
        hideTransferHoverPortal();
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
        hideTransferHoverPortal();
        activeLineId = '';
        activeLineName = '';
        clearRouteMapStationIndicator();
        notifyRouteMapPopoverHoverLeave();
    });

};

setupRouteMapUi();
