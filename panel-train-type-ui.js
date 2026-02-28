/**
 * panel-train-type-ui.js
 *
 * UI feature:
 * 1) Hover on .panel-line-name shows a trip-detail-like floating panel.
 * 2) Click on .panel-line-name pins/unpins the panel.
 * 3) Renders a vertical (transposed) stop-pattern diagram for the current line only.
 *    - Type order follows the rendered .panel-grid-hint-content order (when available).
 *    - Local/All-stop use gray; missing colors also use gray.
 */

import { computeLineStopDiagramData } from './panel-train-type.js';

const toText = (v) => String(v ?? '').trim();

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
    try {
        if (btn) btn.disabled = true;
        const html2canvas = await ensureHtml2canvas();
        const states = collectScrollableState(element);
        await nextFrame();
        await nextFrame();
        let blob = null;
        try {
            const canvas = await html2canvas(element, {
                useCORS: true,
                backgroundColor: null,
                logging: false,
                scale: Math.max(2, Math.ceil(window.devicePixelRatio || 1))
            });
            blob = await canvasToBlobPng(canvas);
        } finally {
            restoreScrollableState(states);
        }
        const base = sanitizeFilePart(filenameBase) || 'panel-train-type';
        downloadBlob(blob, `${base}-${nowIsoCompact()}.png`);
    } catch (err) {
        console.error('[panel-train-type] export png failed', err);
    } finally {
        if (btn) btn.disabled = !!prevDisabled;
    }
};

const ensureStyleInstalled = () => {
    if (document.querySelector('style[data-panel-train-type-style="1"]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-panel-train-type-style', '1');
    style.textContent = `
        .panel-train-type-popover {
            min-width: 100px;
            max-width: calc(100vw - 40px);
            max-height: 60vh;
            background: rgba(255, 255, 255, 0.96);
            --panel-train-type-bg: rgba(255, 255, 255, 0.96);
            --panel-train-type-head-divider: #e3e5e7;
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
        .panel-train-type-popover.is-hidden {
            opacity: 0;
            transform: translateX(8px);
            pointer-events: none;
        }
        .panel-train-type-header {
            display: flex;
            align-items: center;
            padding: 8px 10px;
            border-bottom: 1px solid #e3e5e7;
            gap: 6px;
        }
        .panel-train-type-title {
            flex: 1 1 auto;
            min-width: 0;
            font-size: 13px;
            font-weight: 700;
            color: #111;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .panel-train-type-actions {
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
        .panel-train-type-body {
            max-height: calc(60vh - 36px);
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            flex: 1 1 auto;
        }
        .panel-train-type {
            min-width: 100px;
            max-height: 72vh;
            overflow: hidden;
        }
        .panel-train-type .panel-train-type-body {
            overflow: auto;
            max-height: calc(72vh - 44px);
        }
        .panel-train-type.is-panel-placement .panel-train-type-body {
            height: 100%;
            max-height: none;
            box-sizing: border-box;
        }
        .panel-train-type-meta {
            padding: 10px 12px;
            border-bottom: 1px solid var(--ui-border);
            font-size: 12px;
            line-height: 1.4;
            display:none;
        }
        .panel-train-type-section {
            padding-left:18px;
            padding-right:18px;
            padding-bottom: 12px;
            box-sizing: border-box;
        }
        .panel-train-type.is-panel-placement .panel-train-type-section {
            min-height: 100%;
        }
        .panel-train-type-section-title {
            font-weight: 700;
            font-size: 13px;
            margin-bottom: 8px;
            display:none;
        }
        .panel-train-type-empty {
            font-size: 12px;
            padding: 8px 0;
        }
        .panel-train-type-grid {
            display: grid;
            align-items: center;
            gap: 0;
            justify-content: start;
            width: max-content;
        }
        .panel-train-type-grid-header {
            display: block;
            flex: 0 0 auto;
            padding: 10px 12px 0px;
            background: var(--panel-train-type-bg);
            overflow: hidden;
        }
        .panel-train-type-grid-header .panel-train-type-grid {
            display: grid;
            align-items: end;
            gap: 0;
            justify-content: start;
            width: max-content;
        }
        .panel-train-type-station {
            font-size: 13px;
            text-align: left;
            padding: 2px 0 2px 6px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .panel-train-type-typehead {
            font-size: 11px;
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
            padding-left: 6px;
            background: transparent;
        }
        .panel-train-type-typehead.is-sideways-rl {
            writing-mode: sideways-rl;
            text-orientation: mixed;
        }
        .panel-train-type-typehead.is-mixed-writing {
            writing-mode: horizontal-tb;
            text-orientation: mixed;
            flex-direction: column;
            justify-content: flex-end;
            align-items: center;
            gap: 1px;
        }
        .panel-train-type-typehead-chunk {
            display: inline-block;
            line-height: 1;
            white-space: pre;
        }
        .panel-train-type-typehead-chunk.is-en {
            writing-mode: sideways-rl;
            text-orientation: mixed;
        }
        .panel-train-type-typehead-chunk.is-other {
            writing-mode: vertical-rl;
            text-orientation: upright;
        }
        .panel-train-type-headspacer {
            min-height: 30px;
            background: transparent;
        }
        .panel-train-type-cell {
            height: 35px;
            width: 12px;
            position: relative;
            background: linear-gradient(var(--tt-color, #888), var(--tt-color, #888)) center/10px calc(100% + 2px) no-repeat;
            z-index:100;
        }
        .panel-train-type-cell.is-through-row {
            height: 50px;
            background-size: 10px 100%;
            overflow: visible;
            transform: translateY(var(--through-row-translate-y, 0px));
            z-index: var(--through-z, 0);
        }
        .panel-train-type-through-empty {
            width: 12px;
            height: 18px;
        }
        .panel-train-type-cell.is-hidden-tail {
            visibility: hidden;
        }
        .panel-train-type-cell.is-stop::after {
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
        .panel-train-type-cell.is-stop-up::after,
        .panel-train-type-cell.is-stop-down::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            width: 10px;
            height: 8px;
            transform: translate(-50%, -50%);
            background: #fff;
            box-sizing: border-box;
        }
        .panel-train-type-cell.is-stop-up::after {
            clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
        }
        .panel-train-type-cell.is-stop-down::after {
            clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
        }
        .panel-train-type-through-branch {
            position: absolute;
            top: 0;
            left: 10%;
            width: var(--through-line-width, 14px);
            height: 5px;
            border-radius: 0;
            background: var(--branch-color, var(--tt-color, #888));
            transform: translate(0, calc(var(--branch-top-y, 15px) - var(--through-row-translate-y, 0px)));
            pointer-events: none;
            z-index: 999;
        }
        .panel-train-type-station.is-through-label {
            font-size: 12px;
            display: flex;
            align-items: center;
            min-height: 18px;
            white-space: nowrap;
            overflow-x: auto;
            overflow-y: hidden;
            padding-left:20px;
        }
        .panel-train-type-through-prefix {
            color: var(--ui-text-subtle, #666);
            flex: 0 0 auto;
        }
        .panel-train-type-through-items {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .panel-train-type-through-item {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            flex: 0 0 auto;
        }
        .panel-train-type-through-logo {
            width: 18px;
            height: 18px;
            object-fit: contain;
            border-radius: 2px;
            background: transparent;
            flex: 0 0 18px;
        }
        .panel-train-type-through-line {
            font-weight: 600;
        }
        .panel-train-type-divider {
            height: 1px;
            background: var(--ui-border);
            margin: 0;
        }
        html[data-theme='dark'] .panel-train-type-popover {
            background: rgba(24, 27, 33, 0.94);
            --panel-train-type-bg: rgba(24, 27, 33, 0.94);
            --panel-train-type-head-divider: #5a5d62;
            border-color: #5a5d62;
            box-shadow: 0 0 30px rgba(0, 0, 0, .35);
        }
        html[data-theme='dark'] .panel-train-type-header {
            border-bottom-color: #5a5d62;
        }
        html[data-theme='dark'] .panel-train-type-title,
        html[data-theme='dark'] .panel-train-type-station {
            color: #f2f2f2;
        }
        html[data-theme='dark'] .panel-capture-btn:hover {
            background: #2d323a;
        }
        html[data-theme='dark'] .panel-capture-icon {
            filter: invert(1) brightness(1.1);
        }
        html[data-theme='dark'] .panel-train-type-through-prefix {
            color: #b9bec8;
        }
    
        html[data-theme='dark'] .panel-train-type-cell.is-stop::after,
        html[data-theme='dark'] .panel-train-type-cell.is-stop-up::after,
        html[data-theme='dark'] .panel-train-type-cell.is-stop-down::after {
            background: #111;
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

const TYPE_BASE_SEQUENCE = ['特急', '急行', '准急', '快速', '普通','各站停车'];

const resolveTypeBaseIndex = (typeNameRaw) => {
    const typeName = toText(typeNameRaw);
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < TYPE_BASE_SEQUENCE.length; i += 1) {
        const kw = TYPE_BASE_SEQUENCE[i];
        if (!typeName.includes(kw)) continue;
        if (i < best) best = i;
    }
    return Number.isFinite(best) ? best : -1;
};

const sortTypeNamesForGridHint = (typeNames, countByType) => {
    const names = Array.from(new Set((Array.isArray(typeNames) ? typeNames : []).map((x) => toText(x)).filter(Boolean)));
    return names.sort((a, b) => {
        const ia = resolveTypeBaseIndex(a);
        const ib = resolveTypeBaseIndex(b);
        const aInBase = ia >= 0;
        const bInBase = ib >= 0;

        if (aInBase !== bInBase) return aInBase ? 1 : -1;

        if (!aInBase && !bInBase) {
            const dl = b.length - a.length;
            if (dl) return dl;
            const dc = (Number(countByType?.get?.(b) || 0)) - (Number(countByType?.get?.(a) || 0));
            if (dc) return dc;
            return String(a).localeCompare(String(b));
        }

        if (ia !== ib) return ia - ib;

        const baseKw = TYPE_BASE_SEQUENCE[ia] || '';
        const aExact = baseKw && a === baseKw;
        const bExact = baseKw && b === baseKw;
        if (aExact !== bExact) return aExact ? 1 : -1;

        const dl = b.length - a.length;
        if (dl) return dl;
        const dc = (Number(countByType?.get?.(b) || 0)) - (Number(countByType?.get?.(a) || 0));
        if (dc) return dc;
        return String(a).localeCompare(String(b));
    });
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
    const base = toText(window?.TokyoRailCompanyLogoBasePath) || './companyLogos/';
    const file = toText(logoMap?.[key]?.img?.[0]);
    if (!file) return '';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return `${normalizedBase}${file}`;
};

const resolveColorForTheme = (color, fallback = '#888') => {
    const info = resolveTrainTypeColorInfoForTheme(toText(color) || fallback);
    return info.color || fallback;
};

const setupPanelTrainTypeUi = () => {
    try {
        if (window.__TokyoRailPanelTrainTypeUiInstalled) return;
        window.__TokyoRailPanelTrainTypeUiInstalled = true;
    } catch {
        // ignore
    }

    ensureStyleInstalled();

    const root = document.createElement('div');
    root.className = 'panel-train-type-popover panel-train-type is-hidden';
    root.setAttribute('data-panel-train-type', '');
    root.style.position = 'fixed';
    root.style.zIndex = '10000';

    const topHeader = document.createElement('div');
    topHeader.className = 'panel-train-type-header';

    const topTitle = document.createElement('div');
    topTitle.className = 'panel-train-type-title';
    topHeader.appendChild(topTitle);

    const topActions = document.createElement('div');
    topActions.className = 'panel-train-type-actions';
    const captureBtn = document.createElement('button');
    captureBtn.type = 'button';
    captureBtn.className = 'panel-capture-btn panel-train-type-capture-btn';
    captureBtn.setAttribute('aria-label', '截图');
    captureBtn.title = '截图';
    captureBtn.innerHTML = '<img class="panel-capture-icon panel-train-type-capture-icon" alt="" src="./icons/camera.svg" />';
    topActions.appendChild(captureBtn);
    topHeader.appendChild(topActions);

    const gridHeader = document.createElement('div');
    gridHeader.className = 'panel-train-type-grid-header';

    const body = document.createElement('div');
    body.className = 'panel-train-type-body';

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

    captureBtn.addEventListener('click', async (evt) => {
        stopEvent(evt);
        pinned = true;
        clearTimers();
        const baseName = `panel-train-type-${toText(activeLineName) || toText(activeLineId) || 'line'}`;
        await exportElementToPng(root, baseName, captureBtn);
    }, { passive: false });
    const captureIcon = captureBtn.querySelector('.panel-train-type-capture-icon');
    if (captureIcon instanceof HTMLImageElement) {
        captureIcon.addEventListener('error', () => {
            if (captureIcon.dataset.fallbackTried === '1') return;
            captureIcon.dataset.fallbackTried = '1';
            captureIcon.src = '/icons/camera.svg';
        });
    }

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

    const renderDiagram = (payload) => {
        const lineStations = payload?.lineStations || {};
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
        if (!types.length) {
            return {
                headHtml: '',
                bodyHtml: '<div class="panel-train-type-meta">当前无可用班次</div>'
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
        const orderedNames = sortTypeNamesForGridHint(types.map((t) => toText(t?.typeName)), typeCount);
        const orderIndex = new Map(orderedNames.map((n, i) => [n, i]));
        types.sort((a, b) => {
            const an = toText(a?.typeName);
            const bn = toText(b?.typeName);
            const ai = orderIndex.has(an) ? orderIndex.get(an) : Number.POSITIVE_INFINITY;
            const bi = orderIndex.has(bn) ? orderIndex.get(bn) : Number.POSITIVE_INFINITY;
            if (ai !== bi) return ai - bi;
            return an.localeCompare(bn, 'zh-Hans');
        });

        // grid: N type columns (left) + 1 station column (right)
        const gridStyle = `grid-template-columns: repeat(${types.length}, 12px) minmax(120px, max-content); column-gap: 1px;`;

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

        const headCells = types.map((t) => {
            const colorInfo = resolveTrainTypeColorInfoForTheme(toText(t?.color) || '#888');
            const color = colorInfo.color || '#888';
            const name = toText(t?.typeName) || '-';

            const clsBase = colorInfo.darkAdjusted
                ? 'panel-train-type-typehead is-dark-adjusted'
                : 'panel-train-type-typehead';

            if (isEnglishTypeHeadText(name)) {
                return `<div class="${clsBase} is-sideways-rl" style="color:${escapeHtml(color)}">${escapeHtml(name)}</div>`;
            }

            const chunks = splitTypeHeadTextChunks(name);
            const hasEn = chunks.some((c) => c.kind === 'en');
            const hasOther = chunks.some((c) => c.kind !== 'en');
            if (hasEn && hasOther) {
                const inner = chunks.map((c) => {
                    const cls = c.kind === 'en' ? 'panel-train-type-typehead-chunk is-en' : 'panel-train-type-typehead-chunk is-other';
                    return `<span class="${cls}">${escapeHtml(c.text)}</span>`;
                }).join('');
                return `<div class="${clsBase} is-mixed-writing" style="color:${escapeHtml(color)}">${inner}</div>`;
            }

            return `<div class="${clsBase}" style="color:${escapeHtml(color)}">${escapeHtml(name)}</div>`;
        }).concat(['<div class="panel-train-type-headspacer"></div>']).join('');

        const rows = [];

        const appendThroughGapRow = (si) => {
            const throughGap = throughGapMap.get(si);
            if (!throughGap) return;

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
            const THROUGH_BRANCH_HALF_HEIGHT_PX = THROUGH_BRANCH_HEIGHT_PX / 2;
            const THROUGH_ROW_CENTER_Y_PX = 25;
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

                let cls = 'panel-train-type-cell is-through-row';
                if (colorInfo.darkAdjusted) cls += ' is-dark-adjusted';
                if (isBottomThrough) cls += ' is-through-bottom';

                if (!activeIndexByTi.has(ti)) {
                    if (isTypePassingGap(t, si)) {
                        rows.push(`<div class="${cls}" style="--tt-color:${escapeHtml(color)}"></div>`);
                    } else {
                        rows.push('<div class="panel-train-type-through-empty"></div>');
                    }
                    continue;
                }

                const activeIdx = activeIndexByTi.get(ti);
                const branchCenterY = THROUGH_ROW_CENTER_Y_PX
                    + (activeIdx - (activeCount - 1) / 2) * THROUGH_BRANCH_HEIGHT_PX;
                const branchTopY = branchCenterY - THROUGH_BRANCH_HALF_HEIGHT_PX;
                const remainingCols = Math.max(0, types.length - ti - 1);
                const throughWidth = remainingCols * (12 + 1) + 26;
                const z = (types.length - ti) + 1;
                const endpointOrder = Number(endpointTypeIndexByTi.get(ti) || 0);
                const throughRowTranslateY = endpointOrder <= 0
                    ? '0px'
                    : (() => {
                        const rowSign = directionSign;
                        let signedBase;
                        signedBase = rowSign * THROUGH_ROW_CENTER_Y_PX + (activeIdx - stackCenter) * THROUGH_BRANCH_HEIGHT_PX;
                        let y = signedBase;
                        if (!shouldReverseBranchOrder) {
                            // For reversed rows, shift uniformly by -0.5px (e.g. -12.5 -> -13.0, -22.5 -> -23.0).
                            y += THROUGH_ROW_SEAM_FUDGE_PX;
                        } else {
                            y -= THROUGH_ROW_SEAM_FUDGE_PX;
                        }
                        return `${y.toFixed(2)}px`;
                    })();
                const branches = `<span class="panel-train-type-through-branch" style="--branch-color:${escapeHtml(color)};--through-line-width:${throughWidth.toFixed(2)}px;--branch-top-y:${branchTopY.toFixed(2)}px;"></span>`;

                rows.push(`<div class="${cls}" style="--tt-color:${escapeHtml(color)};--through-row-translate-y:${throughRowTranslateY};--through-z:${z}">${branches}</div>`);
            }

            const allTargets = Array.from(throughGap.allTargetsByKey.values());
            const lineMap = new Map();
            for (const target of allTargets) {
                const lineId = toText(target?.refLineId);
                if (!lineId || lineMap.has(lineId)) continue;
                lineMap.set(lineId, target);
            }
            const throughItems = Array.from(lineMap.values()).map((target) => {
                const company = toText(target?.refCompany);
                const logoUrl = resolveCompanyLogoUrl(company);
                const lineName = toText(target?.refLineName) || toText(target?.refLineId) || '';
                const lineColor = resolveColorForTheme(target?.refLineColor || '#888', '#888');
                const logoHtml = logoUrl
                    ? `<img class="panel-train-type-through-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(company || lineName)}" loading="lazy" decoding="async">`
                    : '';
                return `<span class="panel-train-type-through-item">${logoHtml}<span class="panel-train-type-through-line" style="color:${escapeHtml(lineColor)}">${escapeHtml(lineName)}</span></span>`;
            }).join('');

            const labelHtml = throughItems
                ? `<span class="panel-train-type-through-prefix">直通：</span><span class="panel-train-type-through-items">${throughItems}</span>`
                : '';
            rows.push(`<div class="panel-train-type-station is-through-label">${labelHtml}</div>`);
        };

        // before first station
        appendThroughGapRow(-1);

        for (let si = 0; si < orderedStationIds.length; si += 1) {
            const stName = toText(orderedStationNames?.[si]) || toText(orderedStationIds[si]) || '';
            for (let ti = 0; ti < types.length; ti += 1) {
                const t = types[ti];
                const colorInfo = resolveTrainTypeColorInfoForTheme(toText(t?.color) || '#888');
                const color = colorInfo.color || '#888';
                const firstStop = !!t?._primaryMask?.[si];
                const secondStop = !!t?._secondaryMask?.[si];
                const anyStop = !!t?._anyMask?.[si];
                const hideHead = Number.isFinite(t?._firstStopIndex) && t._firstStopIndex >= 0 && si < t._firstStopIndex;
                const hideTail = Number.isFinite(t?._lastStopIndex) && t._lastStopIndex >= 0 && si > t._lastStopIndex;

                let cls = 'panel-train-type-cell';
                if ((hideHead && (t?._hasPair ? (!firstStop && !secondStop) : !anyStop)) || hideTail) {
                    cls += ' is-hidden-tail';
                } else if (t?._hasPair) {
                    if (firstStop && secondStop) cls += ' is-stop';
                    else if (secondStop && !firstStop) cls += ' is-stop-up';
                    else if (firstStop && !secondStop) cls += ' is-stop-down';
                } else if (anyStop) {
                    cls += ' is-stop';
                }

                if (colorInfo.darkAdjusted) {
                    cls += ' is-dark-adjusted';
                }

                rows.push(`<div class="${cls}" style="--tt-color:${escapeHtml(color)}"></div>`);
            }
            const sid = toText(orderedStationIds?.[si]);
            rows.push(`<div class="panel-train-type-station" data-station-id="${escapeHtml(sid)}" title="${escapeHtml(stName)}">${escapeHtml(stName)}</div>`);

            appendThroughGapRow(si);
        }

        const metaLine = (() => {
            const day = toText(payload?.serviceDay);
            const dayText = day === 'SaturdayHoliday' ? '休息日' : '工作日';
            return `<div class="panel-train-type-meta">${escapeHtml(dayText)}</div>`;
        })();

        return {
            headHtml: `<div class="panel-train-type-grid" style="${gridStyle}">${headCells}</div>`,
            bodyHtml: `${metaLine}
                <div class="panel-train-type-section">
                    <div class="panel-train-type-section-title">站序</div>
                    <div class="panel-train-type-grid" style="${gridStyle}">
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
        topTitle.textContent = activeLineName;
        lastAnchorRect = anchorRect || null;
        lastPlacement = toText(placement) === 'panel' ? 'panel' : 'anchor';

        gridHeader.innerHTML = '';
        body.innerHTML = '<div class="panel-train-type-meta">加载中…</div>';
        root.classList.remove('is-hidden');
        positionPanel();

        const payload = cache.has(cacheKey)
            ? cache.get(cacheKey)
            : await computeLineStopDiagramData(lid, { serviceDay, minTripsPerDay });
        if (!payload) {
            gridHeader.innerHTML = '';
            body.innerHTML = '<div class="panel-train-type-meta">无法生成（该线路无时刻表数据或尚未加载）</div>';
            positionPanel();
            return;
        }
        cache.set(cacheKey, payload);

        // If user already hovered to another line, drop this render.
        if (activeLineId !== lid) return;

        const rendered = renderDiagram(payload);
        gridHeader.innerHTML = rendered?.headHtml || '';
        body.innerHTML = rendered?.bodyHtml || '';
        positionPanel();
    };

    const readLineIdAndNameFromTarget = (target) => {
        if (!(target instanceof Element)) return null;
        const hit = target.closest?.('.panel-line-name');
        if (!hit) return null;
        const lineEl = hit.closest?.('[data-line-id]');
        const lineId = toText(lineEl?.getAttribute?.('data-line-id'));
        if (!lineId) return null;
        const displayName = toText(hit.textContent) || lineId;
        return {
            lineId,
            lineName: displayName,
            lineEl,
            anchorRect: hit.getBoundingClientRect?.() || null
        };
    };

    const showTrainTypeStationIndicator = (stationId) => {
        const sid = toText(stationId);
        if (!sid) return;
        try {
            window.dispatchEvent(new CustomEvent('__TokyoRailTrainTypeStationIndicatorShow', {
                detail: { stationId: sid }
            }));
        } catch {
            // ignore
        }
    };

    const clearTrainTypeStationIndicator = () => {
        try {
            window.dispatchEvent(new CustomEvent('__TokyoRailTrainTypeStationIndicatorClear'));
        } catch {
            // ignore
        }
    };

    const notifyTrainTypePopoverHoverEnter = () => {
        try {
            window.dispatchEvent(new CustomEvent('__TokyoRailTrainTypePopoverHoverEnter'));
        } catch {
            // ignore
        }
    };

    const notifyTrainTypePopoverHoverLeave = () => {
        try {
            window.dispatchEvent(new CustomEvent('__TokyoRailTrainTypePopoverHoverLeave'));
        } catch {
            // ignore
        }
    };

    const getTrainTypeStationTarget = (target) => {
        if (!(target instanceof Element)) return null;
        return target.closest?.('.panel-train-type-station[data-station-id]') || null;
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
        notifyTrainTypePopoverHoverEnter();
    });
    root.addEventListener('mouseleave', () => {
        hoverInsidePanel = false;
        if (!pinned) scheduleHide(180);
        clearTrainTypeStationIndicator();
        notifyTrainTypePopoverHoverLeave();
    });

    body.addEventListener('mouseover', (evt) => {
        const stationEl = getTrainTypeStationTarget(evt?.target);
        if (!stationEl) return;
        const sid = toText(stationEl.getAttribute('data-station-id'));
        if (!sid) return;
        showTrainTypeStationIndicator(sid);
    });

    body.addEventListener('mouseout', (evt) => {
        const fromEl = getTrainTypeStationTarget(evt?.target);
        if (!fromEl) return;
        const toEl = evt?.relatedTarget;
        const toStation = getTrainTypeStationTarget(toEl);
        if (toStation) return;
        clearTrainTypeStationIndicator();
    });

    body.addEventListener('mouseleave', () => {
        clearTrainTypeStationIndicator();
    });

    body.addEventListener('pointerdown', (evt) => {
        const stationEl = getTrainTypeStationTarget(evt?.target);
        if (!stationEl) return;
        const sid = toText(stationEl.getAttribute('data-station-id'));
        if (!sid) return;
        showTrainTypeStationIndicator(sid);
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

    window.addEventListener('__TokyoRailShowTrainTypePanel', (evt) => {
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
        clearTrainTypeStationIndicator();
        notifyTrainTypePopoverHoverLeave();
    }, true);

    document.addEventListener('keydown', (evt) => {
        if (evt?.key !== 'Escape') return;
        if (root.classList.contains('is-hidden')) return;
        pinned = false;
        root.classList.add('is-hidden');
        activeLineId = '';
        activeLineName = '';
        clearTrainTypeStationIndicator();
        notifyTrainTypePopoverHoverLeave();
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

setupPanelTrainTypeUi();
