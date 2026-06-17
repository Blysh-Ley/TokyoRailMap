import { shareOrDownloadArtifact } from './nativeExportShareService.js';

const toText = (v) => String(v ?? '').trim();

let html2canvasPromise = null;

const loadScript = (src) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-html2canvas-lib="${src}"]`);
    if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load: ${src}`)), { once: true });
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
    s.addEventListener('error', () => reject(new Error(`Failed to load: ${src}`)), { once: true });
    document.head.appendChild(s);
});

const ensureHtml2canvas = async () => {
    if (html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = (async () => {
        await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
        if (!window.html2canvas) throw new Error('html2canvas is not loaded');
        return window.html2canvas;
    })();
    return html2canvasPromise;
};

const sanitizeFilePart = (s) => String(s || '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.\-\u4e00-\u9fa5]/g, '_')
    .slice(0, 120);

const ROUTE_MAP_EXPORT_DESKTOP_VIEWPORT_WIDTH_PX = 1280;
const ROUTE_MAP_EXPORT_DESKTOP_VIEWPORT_MIN_HEIGHT_PX = 900;

const applyDesktopExportLayout = (element) => {
    if (!(element instanceof HTMLElement)) return () => {};

    const wasMobilePlacement = element.classList.contains('is-mobile-panel-placement')
        || element.getAttribute('data-route-map-mobile-state') != null;
    if (!wasMobilePlacement) return () => {};

    const styleProps = [
        'position',
        'left',
        'right',
        'top',
        'bottom',
        'width',
        'minWidth',
        'maxWidth',
        'height',
        'maxHeight',
        'overflow',
        'transform',
        'transition',
        'pointerEvents',
        'paddingBottom'
    ];
    const savedStyles = Object.fromEntries(styleProps.map((prop) => [prop, element.style[prop] || '']));
    const savedAttrs = {
        mobileState: element.getAttribute('data-route-map-mobile-state'),
        mobileDragging: element.getAttribute('data-route-map-mobile-dragging')
    };
    const hadMobileClass = element.classList.contains('is-mobile-panel-placement');
    const hadPanelClass = element.classList.contains('is-panel-placement');

    element.classList.remove('is-mobile-panel-placement');
    element.classList.remove('is-panel-placement');
    element.classList.add('is-route-map-desktop-export-layout');
    element.removeAttribute('data-route-map-mobile-state');
    element.removeAttribute('data-route-map-mobile-dragging');

    element.style.position = 'fixed';
    element.style.left = '-100000px';
    element.style.right = 'auto';
    element.style.top = '0';
    element.style.bottom = 'auto';
    element.style.width = 'max-content';
    element.style.minWidth = '100px';
    element.style.maxWidth = 'none';
    element.style.height = 'auto';
    element.style.maxHeight = 'none';
    element.style.overflow = 'visible';
    element.style.transform = 'none';
    element.style.transition = 'none';
    element.style.pointerEvents = 'none';
    element.style.paddingBottom = '0';

    return () => {
        element.classList.remove('is-route-map-desktop-export-layout');
        if (hadMobileClass) element.classList.add('is-mobile-panel-placement');
        if (hadPanelClass) element.classList.add('is-panel-placement');
        if (savedAttrs.mobileState == null) element.removeAttribute('data-route-map-mobile-state');
        else element.setAttribute('data-route-map-mobile-state', savedAttrs.mobileState);
        if (savedAttrs.mobileDragging == null) element.removeAttribute('data-route-map-mobile-dragging');
        else element.setAttribute('data-route-map-mobile-dragging', savedAttrs.mobileDragging);
        for (const [prop, value] of Object.entries(savedStyles)) {
            element.style[prop] = value;
        }
    };
};

const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

const canvasToBlobPng = (canvas) => new Promise((resolve, reject) => {
    try {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('toBlob returned an empty result'));
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

const splitTypeHeadTextChunks = (value) => {
    const s = toText(value);
    if (!s) return [];

    const chunks = [];
    const isAsciiWordChar = (ch) => /[A-Za-z0-9]/.test(ch);
    const isAsciiConnectorChar = (ch) => /[\s\-+&\/().,']/.test(ch);

    let i = 0;
    while (i < s.length) {
        const ch = s[i];
        if (isAsciiWordChar(ch)) {
            let j = i + 1;
            while (j < s.length) {
                const c = s[j];
                if (isAsciiWordChar(c) || isAsciiConnectorChar(c)) {
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

export const captureRouteMapElementAsPng = async ({ element, filenameBase, buttonEl } = {}) => {
    if (!(element instanceof HTMLElement)) return;
    const btn = buttonEl instanceof HTMLButtonElement ? buttonEl : null;
    const prevDisabled = btn?.disabled;
    const EXPORT_CLASS = 'is-route-map-exporting';
    let exportStyleEl = null;
    let restoreDesktopExportLayout = () => {};

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

            const measuredW = measureTextWidthPx(t, refEl);
            const reserveH = Math.max(14, Math.ceil(measuredW) + 2);
            block.style.height = `${reserveH}px`;

            const span = document.createElement('span');
            span.textContent = t;
            span.style.position = 'absolute';
            span.style.left = '50%';
            span.style.top = '50%';
            span.style.whiteSpace = 'nowrap';
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
        restoreDesktopExportLayout = applyDesktopExportLayout(element);
        const states = collectScrollableState(element);
        await nextFrame();
        await nextFrame();
        let blob = null;
        try {
            document.documentElement.classList.add(EXPORT_CLASS);
            if (!document.querySelector('style[data-route-map-export-style="1"]')) {
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

                    html.${EXPORT_CLASS}[data-theme='dark'] .route-map-popover,
                    html.${EXPORT_CLASS}[data-theme='dark'] .route-map-grid-header,
                    html.${EXPORT_CLASS}[data-theme='dark'] .route-map-section,
                    html.${EXPORT_CLASS}[data-theme='dark'] .route-map-body {
                        background: #000 !important;
                        --route-map-bg: #000 !important;
                    }


                    html.${EXPORT_CLASS} .panel-capture-btn {
                        display: none !important;
                    }
                    html.${EXPORT_CLASS} .route-map-popover {
                        border-radius: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                        overflow: visible !important;
                        max-width: none !important;
                        max-height: none !important;
                    }
                    html.${EXPORT_CLASS} .route-map-popover.is-route-map-desktop-export-layout {
                        border-radius: 0 !important;
                        transform: none !important;
                        width: max-content !important;
                        min-width: 100px !important;
                        max-width: none !important;
                    }
                    html.${EXPORT_CLASS} .route-map-popover.is-route-map-desktop-export-layout .route-map-mobile-drag-bar {
                        display: none !important;
                    }
                    html.${EXPORT_CLASS} .route-map-popover.is-route-map-desktop-export-layout .route-map-body,
                    html.${EXPORT_CLASS} .route-map-popover.is-route-map-desktop-export-layout .route-map-grid-header {
                        overflow: visible !important;
                        max-height: none !important;
                    }
                    html.${EXPORT_CLASS} .route-map-popover.is-route-map-desktop-export-layout .route-map-body {
                        padding-bottom: 0 !important;
                    }
                    html.${EXPORT_CLASS} .route-map-grid-header .route-map-grid {
                        align-items: end !important;
                        justify-content: start !important;
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
                    html.${EXPORT_CLASS} .route-map-transfer-items-main {
                        display: none !important;
                    }
                    html.${EXPORT_CLASS} .route-map-transfer-hover-panel {
                        display: inline-flex !important;
                    }
                    html.${EXPORT_CLASS} .route-map-transfer-hover-portal {
                        display: none !important;
                    }
                    html.${EXPORT_CLASS} .route-map-transfer-hover-panel .route-map-transfer-line-name {
                        display: inline !important;
                    }
                    html.${EXPORT_CLASS} .route-map-station .rw-station-code-badge {
                        line-height: 1 !important;
                    }
                    html.${EXPORT_CLASS} .route-map-through-branch {
                        left: calc(10% + var(--branch-start-offset, 0px)) !important;
                    }
                    html.${EXPORT_CLASS} .route-map-through-line-icon {
                        padding-bottom: 3.5px !important;
                    }
                    html.${EXPORT_CLASS} .route-map-through-line-icon.route-map-through-line-icon-seibu {
                        padding-bottom: 10.5px !important;
                    }
                    html.${EXPORT_CLASS} .rw-station-code-badge{
                        padding-bottom: 0 !important;
                    }

                `;
                document.head.appendChild(exportStyleEl);
            }

            applyTypeheadExportPatch(element);

            await nextFrame();

            const exportRect = element.getBoundingClientRect?.();
            const exportWindowWidth = ROUTE_MAP_EXPORT_DESKTOP_VIEWPORT_WIDTH_PX;
            const exportWindowHeight = Math.max(
                ROUTE_MAP_EXPORT_DESKTOP_VIEWPORT_MIN_HEIGHT_PX,
                Math.ceil(element.scrollHeight || exportRect?.height || 0)
            );

            const canvas = await html2canvas(element, {
                useCORS: true,
                backgroundColor: '#fff',
                logging: false,
                scale: Math.max(2, Math.ceil(window.devicePixelRatio || 1)),
                windowWidth: exportWindowWidth,
                windowHeight: exportWindowHeight
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
            restoreDesktopExportLayout();
            restoreDesktopExportLayout = () => {};
        }
        const base = sanitizeFilePart(filenameBase) || 'route-map';
        await shareOrDownloadArtifact({
            blob,
            filename: `${base}.png`,
            mimeType: 'image/png',
            title: 'TokyoRailMap',
            dialogTitle: '分享路线图截图',
            fallbackDownload: downloadBlob
        });
    } catch (err) {
        console.error('[route-map] export png failed', err);
    } finally {
        restoreDesktopExportLayout();
        if (btn) btn.disabled = !!prevDisabled;
    }
};
