import { shareOrDownloadArtifact } from '../../services/nativeExportShareService.js';

const normalizeText = (value) => String(value ?? '').trim();

let html2canvasPromise = null;

const loadExternalScript = (src) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-html2canvas-lib="${src}"]`);
    if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`加载失败: ${src}`)), { once: true });
        return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.html2canvasLib = src;
    script.addEventListener('load', () => {
        script.dataset.loaded = '1';
        resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`加载失败: ${src}`)), { once: true });
    document.head.appendChild(script);
});

export const ensureJourneyHtml2canvas = async () => {
    if (typeof window !== 'undefined' && typeof window.html2canvas === 'function') {
        return window.html2canvas;
    }
    if (html2canvasPromise) return html2canvasPromise;

    html2canvasPromise = (async () => {
        await loadExternalScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
        if (typeof window === 'undefined' || typeof window.html2canvas !== 'function') {
            throw new Error('html2canvas 未加载');
        }
        return window.html2canvas;
    })();

    return html2canvasPromise;
};

export const formatJourneyExportTimestamp = (date = new Date()) => {
    const pad = (n) => String(n).padStart(2, '0');
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        '-',
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join('');
};

export const sanitizeJourneyExportFilePart = (value) => String(value || '')
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
        const computedStyle = window.getComputedStyle(node);
        const overflowY = normalizeText(computedStyle.overflowY || computedStyle.overflow).toLowerCase();
        const overflowX = normalizeText(computedStyle.overflowX || computedStyle.overflow).toLowerCase();
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
    for (const state of Array.isArray(states) ? states : []) {
        const node = state?.node;
        if (!(node instanceof HTMLElement)) continue;
        node.style.height = state.height;
        node.style.maxHeight = state.maxHeight;
        node.style.overflowY = state.overflowY;
        node.style.overflowX = state.overflowX;
        node.scrollTop = Number(state.scrollTop) || 0;
        node.scrollLeft = Number(state.scrollLeft) || 0;
    }
};

export const downloadJourneyBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportJourneyPopoverToPng = async (element, filenameBase, buttonEl) => {
    if (!(element instanceof HTMLElement)) return;
    const button = buttonEl instanceof HTMLButtonElement ? buttonEl : null;
    const prevDisabled = button?.disabled;
    const exportClass = 'is-journey-trip-exporting';
    let exportStyleEl = null;
    try {
        if (button) button.disabled = true;
        const html2canvas = await ensureJourneyHtml2canvas();
        const states = collectScrollableState(element);
        await nextFrame();
        await nextFrame();
        let blob = null;
        try {
            document.documentElement.classList.add(exportClass);
            if (!document.querySelector('style[data-journey-trip-export-style="1"]')) {
                exportStyleEl = document.createElement('style');
                exportStyleEl.setAttribute('data-journey-trip-export-style', '1');
                exportStyleEl.textContent = `
                    html.${exportClass} .journey-trip-popover {
                        border-radius: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                    }
                    html.${exportClass} .journey-trip-popover .journey-trip-capture-btn {
                        display: none !important;
                    }
                `;
                document.head.appendChild(exportStyleEl);
            }

            const canvas = await html2canvas(element, {
                useCORS: true,
                backgroundColor: '#fff',
                logging: false,
                scale: Math.max(2, Math.ceil(window.devicePixelRatio || 1))
            });
            blob = await canvasToBlobPng(canvas);
        } finally {
            document.documentElement.classList.remove(exportClass);
            if (exportStyleEl) {
                try { exportStyleEl.remove(); } catch { /* ignore */ }
                exportStyleEl = null;
            }
            restoreScrollableState(states);
        }

        const base = sanitizeJourneyExportFilePart(filenameBase) || 'journey-detail';
        const filename = `${base}-${formatJourneyExportTimestamp()}.png`;
        await shareOrDownloadArtifact({
            blob,
            filename,
            mimeType: 'image/png',
            title: 'TokyoRailMap',
            dialogTitle: '分享行程截图',
            fallbackDownload: downloadJourneyBlob
        });
    } catch {
        // Preserve legacy behavior: export failures do not surface in the UI.
    } finally {
        if (button) button.disabled = !!prevDisabled;
    }
};
