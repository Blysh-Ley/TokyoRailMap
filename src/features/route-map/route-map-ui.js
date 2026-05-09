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
import { TYPE_BASE_SEQUENCE, sortTypeNamesByBaseAndStopCount } from '../../lib/train-type-sort.js';
import { createLineIconElement, createStationCodeBadgeElement, getResolvedRouteIconMeta } from '../../lib/line-icons.js';
import { getCachedJson, getCompanyLogoSrc, getIconCandidates, getPreferredCachedImageSrc, setImageElementFromCache } from '../../lib/fetch.js';
import { previewBranchesForLine } from '../../map/analyze_branch.js';
import { isExcludedLineType } from '../../lib/special-condition.js';
import { getTransferStationIdsByStationId } from '../../app.js';

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
    const idx = sid.lastIndexOf('.');
    return idx > 0 ? sid.slice(0, idx) : '';
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
        //badge.style.transform = 'translateY(-1px)';

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

    const exceptCode = ['NEX']

    const meta = await getResolvedRouteIconMeta(safeId);
    if (meta && (meta.code || meta.color) ) {
        const icon = createLineIconElement({ routeId: meta.id, code: meta.code, color: meta.color });
        if (icon) {
            icon.style.marginRight = '4px';
            icon.style.transform = exceptCode.includes(meta.code) ? 'translateY(5px)' : 'translateY(-3px)';
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

let html2canvasPromise = null;

const loadScript = (src) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-html2canvas-lib="${src}"]`);
    if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`加载失败: ${src}`)), { once: true });
        return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.html2canvasLib = src;
    s.addEventListener('load', () => {
        s.dataset.loaded = '1';
        resolve();
    }, { once: true });
    s.addEventListener('error', () => reject(new Error(`加载失败: ${src}`)), { once: true });
    document.head.appendChild(s);
});

const ensureHtml2canvas = async () => {
    if (html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = (async () => {
        await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
        if (!window.html2canvas) throw new Error('html2canvas 未加载');
        return window.html2canvas;
    })();
    return html2canvasPromise;
};

const nowIsoCompact = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return [
        d.getFullYear(),
        pad(d.getMonth() + 1),
        pad(d.getDate()),
        '-',
        pad(d.getHours()),
        pad(d.getMinutes()),
        pad(d.getSeconds())
    ].join('');
};

const sanitizeFilePart = (s) => String(s || '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.\-\u4e00-\u9fa5]/g, '_')
    .slice(0, 120);

const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

const canvasToBlobPng = (canvas) => new Promise((resolve, reject) => {
    try {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('toBlob 返回空结果'));
        }, 'image/png');
    } catch (err) {
        reject(err);
    }
});

const collectScrollableState = (rootEl) => {
    const states = [];
    if (!(rootEl instanceof HTMLElement)) return states;
    const nodes = [rootEl, ...Array.from(rootEl.querySelectorAll('*'))];
    for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        const cs = window.getComputedStyle(node);
        const overflowY = toText(cs.overflowY || cs.overflow).toLowerCase();
        const overflowX = toText(cs.overflowX || cs.overflow).toLowerCase();
        const canScrollY = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
        const canScrollX = overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay';
        const needsExpand = (canScrollY && node.scrollHeight > node.clientHeight + 1)
            || (canScrollX && node.scrollWidth > node.clientWidth + 1)
            || node === rootEl;
        if (!needsExpand) continue;

        states.push({
            node,
            height: node.style.height,
            maxHeight: node.style.maxHeight,
            overflowY: node.style.overflowY,
            overflowX: node.style.overflowX,
            scrollTop: node.scrollTop,
            scrollLeft: node.scrollLeft
        });

        if (node === rootEl) {
            node.style.height = 'auto';
            node.style.maxHeight = 'none';
        }
        if (canScrollY && node.scrollHeight > node.clientHeight + 1) {
            node.style.overflowY = 'visible';
            node.style.maxHeight = 'none';
            node.style.height = `${node.scrollHeight}px`;
        }
        if (canScrollX && node.scrollWidth > node.clientWidth + 1) {
            node.style.overflowX = 'visible';
        }
    }
    return states;
};

const restoreScrollableState = (states) => {
    for (const s of Array.isArray(states) ? states : []) {
        const node = s?.node;
        if (!(node instanceof HTMLElement)) continue;
        node.style.height = s.height;
        node.style.maxHeight = s.maxHeight;
        node.style.overflowY = s.overflowY;
        node.style.overflowX = s.overflowX;
        node.scrollTop = Number(s.scrollTop) || 0;
        node.scrollLeft = Number(s.scrollLeft) || 0;
    }
};

const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const exportElementToPng = async (element, filenameBase, buttonEl) => {
    if (!(element instanceof HTMLElement)) return;
    const btn = buttonEl instanceof HTMLButtonElement ? buttonEl : null;
    const prevDisabled = btn?.disabled;
    const EXPORT_CLASS = 'is-route-map-exporting';
    let exportStyleEl = null;

    const typeheadPatches = [];
    let exportMeasureSpan = null;
    const applyTypeheadExportPatch = (root) => {
        const nodes = Array.from(root.querySelectorAll('.route-map-typehead'));

        const ensureMeasureSpan = (doc) => {
            if (exportMeasureSpan && exportMeasureSpan.isConnected) return exportMeasureSpan;
            exportMeasureSpan = doc.createElement('span');
            exportMeasureSpan.setAttribute('data-export-measure-span', '1');
            exportMeasureSpan.style.position = 'absolute';
            exportMeasureSpan.style.left = '-99999px';
            exportMeasureSpan.style.top = '-99999px';
            exportMeasureSpan.style.visibility = 'hidden';
            exportMeasureSpan.style.whiteSpace = 'nowrap';
            exportMeasureSpan.style.pointerEvents = 'none';
            (doc.body || doc.documentElement).appendChild(exportMeasureSpan);
            return exportMeasureSpan;
        };

        const measureTextWidthPx = (text, refEl) => {
            const doc = refEl?.ownerDocument || document;
            const span = ensureMeasureSpan(doc);
            const cs = refEl instanceof Element ? window.getComputedStyle(refEl) : null;
            if (cs) {
                span.style.fontFamily = cs.fontFamily;
                span.style.fontSize = cs.fontSize;
                span.style.fontWeight = cs.fontWeight;
                span.style.fontStyle = cs.fontStyle;
                span.style.letterSpacing = cs.letterSpacing;
            }
            span.textContent = toText(text);
            const w = span.getBoundingClientRect?.().width;
            const width = Number(w);
            return Number.isFinite(width) ? width : 0;
        };

        const makeRotatedEnBlock = (text, refEl) => {
            const t = toText(text);
            const block = document.createElement('div');
            block.style.position = 'relative';
            block.style.width = '12px';
            block.style.display = 'block';
            block.style.flex = '0 0 auto';

            // transform rotation doesn't affect layout size; reserve height using measured width.
            const measuredW = measureTextWidthPx(t, refEl);
            const reserveH = Math.max(14, Math.ceil(measuredW) + 2);
            block.style.height = `${reserveH}px`;

            const span = document.createElement('span');
            span.textContent = t;
            span.style.position = 'absolute';
            span.style.left = '50%';
            span.style.top = '50%';
            span.style.whiteSpace = 'nowrap';
            // Match sideways-rl: rotate clockwise.
            span.style.transform = 'translate(-50%, -50%) rotate(90deg)';
            span.style.transformOrigin = 'center';
            block.appendChild(span);
            return block;
        };

        const setExportTypeheadContent = (el) => {
            const text = toText(el.textContent);
            if (!text) return;

            const orig = {
                el,
                html: el.innerHTML,
                cssText: el.style.cssText
            };

            // Force a stable layout for html2canvas (writing-mode is flaky there).
            el.innerHTML = '';
            el.classList.add('is-export-typehead');
            el.style.writingMode = 'horizontal-tb';
            el.style.textOrientation = 'mixed';
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'flex-end';
            el.style.paddingLeft = '0';
            el.style.lineHeight = '1';

            const chunks = splitTypeHeadTextChunks(text);
            for (const c of Array.isArray(chunks) ? chunks : []) {
                const kind = toText(c?.kind);
                const t = toText(c?.text);
                if (!t) continue;
                if (kind === 'en') {
                    el.appendChild(makeRotatedEnBlock(t, el));
                    continue;
                }
                // Upright CJK / other: one glyph per line.
                for (const ch of Array.from(t)) {
                    const span = document.createElement('span');
                    span.textContent = ch === ' ' ? '\u00A0' : ch;
                    span.style.display = 'block';
                    span.style.lineHeight = '1';
                    el.appendChild(span);
                }
            }

            typeheadPatches.push(orig);
        };

        for (const el of nodes) {
            if (!(el instanceof HTMLElement)) continue;
            // Skip already-patched nodes.
            if (el.classList.contains('is-export-typehead')) continue;
            setExportTypeheadContent(el);
        }
    };

    const restoreTypeheadExportPatch = () => {
        for (let i = typeheadPatches.length - 1; i >= 0; i -= 1) {
            const p = typeheadPatches[i];
            const el = p?.el;
            if (!(el instanceof HTMLElement)) continue;
            el.classList.remove('is-export-typehead');
            el.innerHTML = p.html;
            el.style.cssText = p.cssText;
        }
        typeheadPatches.length = 0;

        if (exportMeasureSpan) {
            try { exportMeasureSpan.remove(); } catch { /* ignore */ }
            exportMeasureSpan = null;
        }
    };
    try {
        if (btn) btn.disabled = true;
        const html2canvas = await ensureHtml2canvas();
        const states = collectScrollableState(element);
        await nextFrame();
        await nextFrame();
        let blob = null;
        try {
            document.documentElement.classList.add(EXPORT_CLASS);
            if (!document.querySelector(`style[data-route-map-export-style="1"]`)) {
                exportStyleEl = document.createElement('style');
                exportStyleEl.setAttribute('data-route-map-export-style', '1');
                exportStyleEl.textContent = `
                    html.${EXPORT_CLASS} .route-map-popover,
                    html.${EXPORT_CLASS} .route-map-grid-header,
                    html.${EXPORT_CLASS} .route-map-section,
                    html.${EXPORT_CLASS} .route-map-body {
                        background: #fff !important;
                        --route-map-bg: #fff !important;
                    }
                    html.${EXPORT_CLASS} .panel-capture-btn {
                        display: none !important;
                    }
                    html.${EXPORT_CLASS} .route-map-popover {
                        border-radius: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                        overflow: visible !important;
                    }
                    html.${EXPORT_CLASS} .route-map-grid-header {
                        display: flex !important;
                        justify-content: flex-end !important;
                        overflow: visible !important;
                        padding-left: 18px !important;
                        padding-right: 18px !important;
                        padding-bottom: 5px !important;
                    }
                    html.${EXPORT_CLASS} .route-map-grid-header .route-map-grid {
                        align-items: end !important;
                    }
                    html.${EXPORT_CLASS} .route-map-typehead {
                        padding-left: 0 !important;
                        height: auto !important;
                        min-height: 35px !important;
                        align-items: center !important;
                        justify-content: flex-end !important;
                        box-sizing: border-box !important;
                    }
                    html.${EXPORT_CLASS} .route-map-typehead.is-export-typehead {
                        writing-mode: horizontal-tb !important;
                        text-orientation: mixed !important;
                    }
                    html.${EXPORT_CLASS} .route-map-cell {
                        background: transparent !important;
                    }
                    html.${EXPORT_CLASS} .route-map-cell::before {
                        content: "" !important;
                        position: absolute !important;
                        top: -1px !important;
                        bottom: -1px !important;
                        left: 1px !important;
                        right: 1px !important;
                        background-color: var(--tt-color, #888) !important;
                        z-index: -1 !important;
                        pointer-events: none !important;
                    }
                    html.${EXPORT_CLASS} .route-map-station.is-through-label,
                    html.${EXPORT_CLASS} .route-map-through-items,
                    html.${EXPORT_CLASS} .route-map-through-item {
                        overflow: visible !important;
                    }
                    html.${EXPORT_CLASS} .route-map-through-item {
                        align-items: center !important;
                    }
                    html.${EXPORT_CLASS} .route-map-through-line {
                        display: inline-block !important;
                        line-height: 1.2 !important;
                        vertical-align: middle !important;
                    }
                    html.${EXPORT_CLASS} .route-map-station .rw-station-code-badge {
                        line-height: 20px !important;
                    }
                    html.${EXPORT_CLASS} .route-map-through-branch {
                        left: calc(10% + var(--branch-start-offset, 0px)) !important;
                    }

                `;
                document.head.appendChild(exportStyleEl);
            }

            applyTypeheadExportPatch(element);

            await nextFrame();

            const canvas = await html2canvas(element, {
                useCORS: true,
                backgroundColor: '#fff',
                logging: false,
                scale: Math.max(2, Math.ceil(window.devicePixelRatio || 1))
            });
            blob = await canvasToBlobPng(canvas);
        } finally {
            restoreTypeheadExportPatch();
            document.documentElement.classList.remove(EXPORT_CLASS);
            if (exportStyleEl) {
                try { exportStyleEl.remove(); } catch { /* ignore */ }
                exportStyleEl = null;
            }
            restoreScrollableState(states);
        }
        const base = sanitizeFilePart(filenameBase) || 'route-map';
        downloadBlob(blob, `${base}-${nowIsoCompact()}.png`);
    } catch (err) {
        console.error('[route-map] export png failed', err);
    } finally {
        if (btn) btn.disabled = !!prevDisabled;
    }
};

const ensureStyleInstalled = () => {
    if (document.querySelector('style[data-route-map-style="1"]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-route-map-style', '1');
    style.textContent = `
        .route-map-popover {
            min-width: 100px;
            max-width: calc(100vw - 40px);
            max-height: 60vh;
            background: rgba(255, 255, 255, 0.96);
            --route-map-bg: rgba(255, 255, 255, 0.96);
            --route-map-head-divider: #e3e5e7;
            border: 1px solid #e3e5e7;
            border-radius: 12px;
            box-shadow: 0 0 30px rgba(0, 0, 0, .12);
            overflow: hidden;
            opacity: 1;
            transition: opacity 0.15s ease, transform 0.15s ease;
            transform: translateX(0);
            pointer-events: auto;
            display: flex;
            flex-direction: column;
        }
        .route-map-popover.is-hidden {
            opacity: 0;
            transform: translateX(8px);
            pointer-events: none;
        }
        .route-map-header {
            display: flex;
            align-items: center;
            padding: 8px 10px;
            border-bottom: 1px solid #e3e5e7;
            gap: 6px;
        }
        .route-map-title {
            flex: 1 1 auto;
            min-width: 0;
            font-size: 20px;
            font-weight: 700;
            color: #111;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .route-map-actions {
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .panel-capture-btn {
            width: 18px;
            height: 18px;
            border: none;
            border-radius: 6px;
            background: transparent;
            padding: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            flex: 0 0 auto;
        }
        .panel-capture-btn:hover {
            background: #f3f7ff;
        }
        .route-map-branch-btn.is-active {
            background: #e7f4ff;
        }
        .route-map-branch-btn.is-busy {
            opacity: 0.7;
        }
        .panel-capture-btn:disabled {
            opacity: 0.6;
            cursor: default;
        }
        .panel-capture-icon {
            width: 12px;
            height: 12px;
            display: block;
            pointer-events: none;
        }
        .route-map-body {
            max-height: calc(60vh - 36px);
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            flex: 1 1 auto;
        }
        .route-map-body::-webkit-scrollbar {
            width: 0;
            height: 0;
            display: none;
        }
        .route-map {
            min-width: 100px;
            max-height: 72vh;
            overflow: hidden;
        }
        .route-map .route-map-body {
            overflow: auto;
            max-height: calc(72vh - 44px);
        }
        .route-map.is-panel-placement .route-map-body {
            height: 100%;
            max-height: none;
            box-sizing: border-box;
        }
        .route-map-meta {
            padding: 10px 12px;
            border-bottom: 1px solid var(--ui-border);
            font-size: 12px;
            line-height: 1.4;
            display:none;
        }
        .route-map-section {
            padding-left:18px;
            padding-right:18px;
            padding-bottom: 12px;
            box-sizing: border-box;
            background: var(--route-map-bg);
        }
        .route-map.is-panel-placement .route-map-section {
            min-height: 100%;
        }
        .route-map-section-title {
            font-weight: 700;
            font-size: 13px;
            margin-bottom: 8px;
            display:none;
        }
        .route-map-empty {
            font-size: 12px;
            padding: 8px 0;
        }
        .route-map-grid {
            display: grid;
            align-items: center;
            gap: 0;
            justify-content: start;
            width: max-content;
        }
        .route-map-grid-header {
            display: flex;
            justify-content: flex-end;
            flex: 0 0 auto;
            padding: 10px 18px 3px;
            background: var(--route-map-bg);
            overflow: hidden;
        }
        .route-map-grid-header .route-map-grid {
            display: grid;
            align-items: end;
            gap: 0;
            justify-content: start;
            width: max-content;
        }
        .route-map-station {
            font-size: 13px;
            text-align: left;
            padding: 2px 0 2px 6px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .route-map-typehead {
            font-size: 12px;
            font-weight: 700;
            text-align: center;
            writing-mode: vertical-rl;
            text-orientation: upright;
            letter-spacing: 1px;
            line-height: 1;
            width: 12px;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            background: transparent;
        }
        .route-map-typehead.is-sideways-rl {
            writing-mode: sideways-rl;
            text-orientation: mixed;
        }
        .route-map-typehead.is-mixed-writing {
            writing-mode: horizontal-tb;
            text-orientation: mixed;
            flex-direction: column;
            justify-content: flex-end;
            align-items: center;
            gap: 1px;
        }
        .route-map-typehead-chunk {
            display: inline-block;
            line-height: 1;
            white-space: pre;
        }
        .route-map-typehead-chunk.is-en {
            writing-mode: sideways-rl;
            text-orientation: mixed;
        }
        .route-map-typehead-chunk.is-other {
            writing-mode: vertical-rl;
            text-orientation: upright;
        }
        .route-map-headspacer {
            min-height: 30px;
            background: transparent;
        }
        .route-map-cell {
            height: var(--route-row-height, 35px);
            width: 12px;
            position: relative;
            background: linear-gradient(var(--tt-color, #888), var(--tt-color, #888)) center/10px calc(100% + 2px) no-repeat;
            z-index:100;
        }
        .route-map-cell.is-through-row {
            height: 50px;
            background-size: 10px 100%;
            overflow: visible;
            transform: translateY(var(--through-row-translate-y, 0px));
            z-index: var(--through-z, 0);
        }
        .route-map-through-empty {
            width: 12px;
            height: 18px;
        }
        .route-map-cell.is-hidden-tail {
            visibility: hidden;
        }
        .route-map-cell.is-stop::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            width: 9px;
            height: 9px;
            border-radius: 999px;
            transform: translate(-50%, -50%);
            background: #fff;
            box-sizing: border-box;
        }
        .route-map-transfer-line {
            height: 2px;
            background: #000;
            pointer-events: none;
            align-self: center;
            z-index: 101;
            position: relative;
            left: -8px;
            width: calc(100% + 2px);
        }
        .route-map-cell.is-stop.is-transfer::after {
            width: 4px;
            height: 4px;
            background: #000;
            border: 2.5px solid #fff;
            box-sizing: content-box;
        }
        .route-map-cell.is-stop-up::after,
        .route-map-cell.is-stop-down::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 0;
            height: 0;
            background: transparent;
            box-sizing: border-box;
        }
        .route-map-cell.is-stop-up::after {
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-bottom: 8px solid #fff;
        }
        .route-map-cell.is-stop-down::after {
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 8px solid #fff;
        }
        .route-map-through-branch {
            position: relative;
            left: calc(10% + var(--branch-start-offset, 0px));
            width: var(--branch-total-width, var(--through-line-width, 14px));
            height: var(--through-branch-height, 5px);
            border-radius: 0;
            align-self: start;
            pointer-events: none;
            z-index: 999;
            overflow: visible;
            transform: translate(0, var(--branch-top-y, 15px));
        }
        .route-map-through-branch-svg {
            display: block;
            width: 100%;
            height: 100%;
            overflow: visible;
        }
        .route-map-station.is-through-label {
            font-size: 12px;
            display: flex;
            align-items: center;
            min-height: 18px;
            white-space: normal;
            overflow-x: hidden;
            overflow-y: visible;
            padding-left:30px;
        }
        .route-map-station.is-transfer-label {
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            white-space: normal;
            overflow-x: hidden;
            overflow-y: visible;
            padding-left: 0;
            padding-right: 10px;
            padding-top: 5px;
            padding-bottom: 5px;
        }
        .route-map-transfer-items {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 4px;
        }
        .route-map-transfer-items.is-two-rows {
            gap: 2px;
        }
        .route-map-transfer-items.is-multi-rows {
            gap: 2px;
        }
        .route-map-transfer-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: nowrap;
            justify-content: flex-end;
        }
        .route-map-transfer-item {
            display: flex;
            align-items: center;
            flex: 0 0 auto;
            justify-content: flex-end;
        }
        .route-map-transfer-line-name {
            font-weight: 600;
            text-align: right;
        }
        .route-map-through-prefix {
            color: var(--ui-text-subtle, #666);
            flex: 0 0 auto;
        }
        .route-map-through-items {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 4px;
            width: 100%;
        }
        .route-map-through-items.is-two-rows {
            gap: 2px;
        }
        .route-map-through-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: nowrap;
            justify-content: flex-end;
            width: 100%;
        }
        .route-map-through-item {
            display: flex;
            align-items: center;
            flex: 0 0 auto;
            justify-content: flex-end;
        }
        .route-map-through-logo {
            width: 18px;
            height: 18px;
            object-fit: contain;
            border-radius: 2px;
            background: transparent;
            flex: 0 0 18px;
        }
        .route-map-through-line-icon {
            margin-right: 2px;
            transform: translateY(-1px);
            flex: 0 0 auto;
        }
        .route-map-through-line {
            font-weight: 600;
            text-align: right;
        }
        .route-map-divider {
            height: 1px;
            background: var(--ui-border);
            margin: 0;
        }
        html[data-theme='dark'] .route-map-popover {
            background: rgba(24, 27, 33, 0.94);
            --route-map-bg: rgba(24, 27, 33, 0.94);
            --route-map-head-divider: #5a5d62;
            border-color: #5a5d62;
            box-shadow: 0 0 30px rgba(0, 0, 0, .35);
        }
        html[data-theme='dark'] .route-map-header {
            border-bottom-color: #5a5d62;
        }
        html[data-theme='dark'] .route-map-title,
        html[data-theme='dark'] .route-map-station {
            color: #f2f2f2;
        }
        html[data-theme='dark'] .panel-capture-btn:hover {
            background: #2d323a;
        }
        html[data-theme='dark'] .panel-capture-icon {
            filter: invert(1) brightness(1.1);
        }
        html[data-theme='dark'] .route-map-through-prefix {
            color: #b9bec8;
        }
    
        html[data-theme='dark'] .route-map-cell.is-stop::after,
        html[data-theme='dark'] .route-map-cell.is-stop-up::after,
        html[data-theme='dark'] .route-map-cell.is-stop-down::after {
            background: #111;
        }

        html[data-theme='dark'] .route-map-cell.is-stop-up::after {
            background: transparent;
            border-bottom-color: #111;
        }
        html[data-theme='dark'] .route-map-cell.is-stop-down::after {
            background: transparent;
            border-top-color: #111;
        }
        html[data-theme='dark'] .route-map-cell.is-stop.is-transfer::after {
            background: #000;
            border-color: #fff;
        }
    `;
    document.head.appendChild(style);
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
    iconEl.style.width = '20px';
    iconEl.style.height = '20px';
    iconEl.style.fontSize = '8px';
    iconEl.style.padding = '0px 0px 1px';
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

    const topHeader = document.createElement('div');
    topHeader.className = 'route-map-header';

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

    const captureBtn = document.createElement('button');
    captureBtn.type = 'button';
    captureBtn.className = 'panel-capture-btn route-map-capture-btn';
    captureBtn.setAttribute('aria-label', '截图');
    captureBtn.title = '截图';
    const captureIcon = document.createElement('img');
    captureIcon.className = 'panel-capture-icon route-map-capture-icon';
    captureIcon.alt = '';
    setImageElementFromCache(captureIcon, getIconCandidates('camera.svg'), {
        cacheKey: 'icon:camera.svg',
        fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('camera.svg'), { cacheKey: 'icon:camera.svg' })
    }).catch(() => null);
    captureBtn.appendChild(captureIcon);
    topActions.appendChild(captureBtn);
    topHeader.appendChild(topActions);

    const gridHeader = document.createElement('div');
    gridHeader.className = 'route-map-grid-header';

    const body = document.createElement('div');
    body.className = 'route-map-body';

    root.appendChild(topHeader);
    root.appendChild(gridHeader);
    root.appendChild(body);
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
                fitMode: 'commit'
            });
            const ok = result?.ok === true;
            branchPreviewLineId = ok ? lid : '';
            setBranchButtonState({ active: ok, busy: false });
        } catch {
            branchPreviewLineId = '';
            setBranchButtonState({ active: false, busy: false });
        }
    }, { passive: false });

    captureBtn.addEventListener('click', async (evt) => {
        stopEvent(evt);
        pinned = true;
        clearTimers();
        const baseName = `route-map-${toText(activeLineName) || toText(activeLineId) || 'line'}`;
        await exportElementToPng(root, baseName, captureBtn);
    }, { passive: false });

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
            activeLineId = '';
            activeLineName = '';
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
        if (lastPlacement === 'panel') {
            const rect = getPanelLikePlacementRect();
            if (rect) {
                root.classList.add('is-panel-placement');
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
        root.style.right = '';
        root.style.width = '';
        root.style.height = '';
        root.style.maxHeight = '';
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
        const transferItemHtmlByRouteId = new Map();
        const buildTransferItemHtml = async (routeId) => {
            const rid = toText(routeId);
            if (!rid) return '';
            if (transferItemHtmlByRouteId.has(rid)) return transferItemHtmlByRouteId.get(rid);

            const railwayMeta = railwayMetaIndex instanceof Map ? railwayMetaIndex.get(rid) : null;
            const lineName =
                toText(railwayMeta?.title?.['zh-Hans']) ||
                toText(railwayMeta?.title?.zh) ||
                toText(railwayMeta?.title?.ja) ||
                rid;
            const lineColor = resolveColorForTheme(toText(railwayMeta?.color) || '#888', '#888');

            let lineIconHtml = '';
            const iconMeta = await getResolvedRouteIconMeta(rid);
            if (iconMeta && (iconMeta.code || iconMeta.color)) {
                const iconEl = createLineIconElement({ routeId: iconMeta.id, code: iconMeta.code, color: iconMeta.color });
                if (iconEl) {
                    lineIconHtml = formatRouteMapLineIconHtml(iconEl);
                }
            }

            const html = `<span class="route-map-transfer-item">${lineIconHtml}<span class="route-map-transfer-line-name" style="color:${escapeHtml(lineColor)}">${escapeHtml(lineName)}</span></span>`;
            transferItemHtmlByRouteId.set(rid, html);
            return html;
        };

        const MAX_TRANSFER_ROWS = 8
        const MAX_TRANSFER_ITEMS_PER_ROW = 2;
        const transferDisplayByStationId = new Map();
        let transferColumnCount = 0;
        for (const sidRaw of orderedStationIds) {
            const sid = toText(sidRaw);
            if (!sid) continue;

            const transferStationIds = await getTransferStationIdsByStationId(sid);
            if (!(transferStationIds instanceof Set) || transferStationIds.size <= 1) continue;

            const selfRouteId = getRouteIdFromStationId(sid);
            const routeIds = [];
            const seenRouteIds = new Set();
            for (const transferSid of transferStationIds) {
                const rid = getRouteIdFromStationId(transferSid);
                if (!rid || rid === selfRouteId || seenRouteIds.has(rid)) continue;
                seenRouteIds.add(rid);
                routeIds.push(rid);
            }

            const itemHtmlsRaw = (await Promise.all(routeIds.map((rid) => buildTransferItemHtml(rid)))).filter(Boolean);
            if (!itemHtmlsRaw.length) continue;

            const itemHtmls = itemHtmlsRaw.slice(0, MAX_TRANSFER_ROWS * MAX_TRANSFER_ITEMS_PER_ROW);
            const rowCount = Math.min(MAX_TRANSFER_ROWS, Math.max(1, Math.ceil(itemHtmls.length / MAX_TRANSFER_ITEMS_PER_ROW)));
            const maxColsInRow = Math.min(MAX_TRANSFER_ITEMS_PER_ROW, itemHtmls.length);
            transferColumnCount = Math.max(transferColumnCount, maxColsInRow);
            transferDisplayByStationId.set(sid, { itemHtmls, rowCount });
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
            const dirOrientationSign = dirKey && preferredSecondaryDir && dirKey === preferredSecondaryDir
                ? -1
                : 1;
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
            const rowHeightPx = transferRowCount > 1 ? 50 : 35;
            const stName = toText(orderedStationNames?.[si]) || toText(orderedStationIds[si]) || '';

            if (transferColumnCount > 0) {
                let transferLabelHtml = '';
                if (transferDisplay && Array.isArray(transferDisplay.itemHtmls) && transferDisplay.itemHtmls.length) {
                    const itemHtmls = transferDisplay.itemHtmls;
                    const transferItemsClass = transferDisplay.rowCount > 2
                        ? 'route-map-transfer-items is-multi-rows'
                        : (transferDisplay.rowCount > 1 ? 'route-map-transfer-items is-two-rows' : 'route-map-transfer-items');
                    const rowsHtml = [];
                    for (let start = 0; start < itemHtmls.length && rowsHtml.length < transferDisplay.rowCount; start += MAX_TRANSFER_ITEMS_PER_ROW) {
                        const rowHtml = itemHtmls.slice(start, start + MAX_TRANSFER_ITEMS_PER_ROW).join('');
                        rowsHtml.push(`<span class="route-map-transfer-row">${rowHtml}</span>`);
                    }
                    transferLabelHtml = `<span class="${transferItemsClass}">${rowsHtml.join('')}</span>`;
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
            rows.push(`<div class="route-map-station" data-station-id="${escapeHtml(sid)}" title="${escapeHtml(stName)}" style="grid-row:${currentGridRow};grid-column:${stationColumnIndex};min-height:${rowHeightPx}px;display:flex;align-items:center;">${escapeHtml(stName)}</div>`);

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

    const showForLine = async ({ lineId, lineName, anchorRect, placement = 'anchor' }) => {
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
        lastPlacement = toText(placement) === 'panel' ? 'panel' : 'anchor';

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
        gridHeader.innerHTML = rendered?.headHtml || '';
        body.innerHTML = rendered?.bodyHtml || '';
        await enhanceRouteMapStationCodeBadges(body, {
            lineId: lid,
            lineColor: toText(payload?.selectedLine?.lineColor || '')
        });
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

    body.addEventListener('pointerdown', (evt) => {
        const stationEl = getRouteMapStationTarget(evt?.target);
        if (!stationEl) return;
        const sid = toText(stationEl.getAttribute('data-station-id'));
        if (!sid) return;
        showRouteMapStationIndicator(sid);
    }, { passive: true });

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
        showForLine({ lineId, lineName, anchorRect });
    }, true);

    window.addEventListener('__TokyoRailShowRouteMapPanel', (evt) => {
        const d = evt?.detail || {};
        const lineId = toText(d?.lineId);
        if (!lineId) return;
        const lineName = toText(d?.lineName) || lineId;
        const placement = toText(d?.placement) === 'panel' ? 'panel' : 'anchor';

        pinned = true;
        clearTimers();
        showForLine({ lineId, lineName, anchorRect: null, placement });
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
