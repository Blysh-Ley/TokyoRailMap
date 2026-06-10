

// panelExportCapture.js
const HTML2CANVAS_SRC_panelExportCapture = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
const defaultToText_panelExportCapture = (value) => String(value ?? '').trim();

let html2canvasPromise_panelExportCapture = null;

export const resetPanelHtml2canvasLoaderForTest = () => {
    html2canvasPromise_panelExportCapture = null;
};

export const loadPanelExportScript = (src, {
    documentRef = globalThis.document
} = {}) => new Promise((resolve, reject) => {
    const existing = documentRef?.querySelector?.(`script[data-html2canvas-lib="${src}"]`);
    if (existing) {
        if (existing.dataset?.loaded === '1') return resolve();
        existing.addEventListener?.('load', () => resolve(), { once: true });
        existing.addEventListener?.('error', () => reject(new Error(`load failed: ${src}`)), { once: true });
        return;
    }

    const script = documentRef?.createElement?.('script');
    if (!script || !documentRef?.head?.appendChild) {
        reject(new Error(`cannot create script: ${src}`));
        return;
    }

    script.src = src;
    script.async = true;
    if (!script.dataset) script.dataset = {};
    script.dataset.html2canvasLib = src;
    script.addEventListener?.('load', () => {
        script.dataset.loaded = '1';
        resolve();
    }, { once: true });
    script.addEventListener?.('error', () => reject(new Error(`load failed: ${src}`)), { once: true });
    documentRef.head.appendChild(script);
});

export const ensurePanelHtml2canvas = async ({
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    loadScript = loadPanelExportScript,
    src = HTML2CANVAS_SRC_panelExportCapture
} = {}) => {
    if (windowRef?.html2canvas) return windowRef.html2canvas;
    if (html2canvasPromise_panelExportCapture) return html2canvasPromise_panelExportCapture;

    html2canvasPromise_panelExportCapture = (async () => {
        await loadScript(src, { documentRef });
        if (!windowRef?.html2canvas) {
            throw new Error('html2canvas not available');
        }
        return windowRef.html2canvas;
    })();

    try {
        return await html2canvasPromise_panelExportCapture;
    } catch (error) {
        html2canvasPromise_panelExportCapture = null;
        throw error;
    }
};

export const nowIsoCompact = (date = new Date()) => {
    const value = date instanceof Date ? date : new Date(date);
    const pad = (number) => String(number).padStart(2, '0');
    return [
        value.getFullYear(),
        pad(value.getMonth() + 1),
        pad(value.getDate()),
        '-',
        pad(value.getHours()),
        pad(value.getMinutes()),
        pad(value.getSeconds())
    ].join('');
};

export const sanitizePanelExportFilePart = (value) => String(value || '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.\-\u4e00-\u9fa5]/g, '_')
    .slice(0, 120);

export const nextFrame = (requestFrame = globalThis.window?.requestAnimationFrame?.bind(globalThis.window)) => new Promise((resolve) => {
    if (typeof requestFrame === 'function') {
        requestFrame(() => resolve());
        return;
    }
    setTimeout(resolve, 16);
});

export const canvasToBlobPng = (canvas) => new Promise((resolve, reject) => {
    try {
        canvas?.toBlob?.((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('toBlob returned empty result'));
        }, 'image/png');
    } catch (error) {
        reject(error);
    }
});

export const collectScrollableState = (rootEl, {
    HTMLElementRef = globalThis.HTMLElement,
    windowRef = globalThis.window,
    toText = defaultToText_panelExportCapture
} = {}) => {
    const states = [];
    if (!HTMLElementRef || !(rootEl instanceof HTMLElementRef)) return states;

    const nodes = [rootEl, ...Array.from(rootEl.querySelectorAll?.('*') || [])];
    for (const node of nodes) {
        if (!(node instanceof HTMLElementRef)) continue;
        const computedStyle = windowRef?.getComputedStyle?.(node) || {};
        const overflowY = toText(computedStyle.overflowY || computedStyle.overflow).toLowerCase();
        const overflowX = toText(computedStyle.overflowX || computedStyle.overflow).toLowerCase();
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

export const restoreScrollableState = (states, {
    HTMLElementRef = globalThis.HTMLElement
} = {}) => {
    for (const state of Array.isArray(states) ? states : []) {
        const node = state?.node;
        if (!HTMLElementRef || !(node instanceof HTMLElementRef)) continue;
        node.style.height = state.height;
        node.style.maxHeight = state.maxHeight;
        node.style.overflowY = state.overflowY;
        node.style.overflowX = state.overflowX;
        node.scrollTop = Number(state.scrollTop) || 0;
        node.scrollLeft = Number(state.scrollLeft) || 0;
    }
};

export const downloadBlob = (blob, filename, {
    URLRef = globalThis.URL,
    documentRef = globalThis.document,
    windowRef = globalThis.window
} = {}) => {
    const url = URLRef.createObjectURL(blob);
    const anchor = documentRef.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    documentRef.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    windowRef?.setTimeout?.(() => URLRef.revokeObjectURL(url), 1000);
};

export const exportElementToPng = async (element, filenameBase, buttonEl, {
    HTMLElementRef = globalThis.HTMLElement,
    HTMLButtonElementRef = globalThis.HTMLButtonElement,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    ensureHtml2canvas = ensurePanelHtml2canvas,
    collectScrollableStateFn = collectScrollableState,
    restoreScrollableStateFn = restoreScrollableState,
    nextFrameFn = nextFrame,
    canvasToBlobPngFn = canvasToBlobPng,
    downloadBlobFn = downloadBlob,
    sanitizeFilePartFn = sanitizePanelExportFilePart,
    nowIsoCompactFn = nowIsoCompact,
    logger = console
} = {}) => {
    if (!HTMLElementRef || !(element instanceof HTMLElementRef)) return;

    const button = HTMLButtonElementRef && buttonEl instanceof HTMLButtonElementRef ? buttonEl : null;
    const previousDisabled = button?.disabled;
    const exportClass = 'is-panel-trip-detail-exporting';
    let exportStyleEl = null;

    try {
        if (button) button.disabled = true;
        const html2canvas = await ensureHtml2canvas({ documentRef, windowRef });
        const states = collectScrollableStateFn(element, { HTMLElementRef, windowRef });
        await nextFrameFn(windowRef?.requestAnimationFrame?.bind?.(windowRef));
        await nextFrameFn(windowRef?.requestAnimationFrame?.bind?.(windowRef));
        let blob = null;

        try {
            documentRef?.documentElement?.classList?.add?.(exportClass);
            if (!documentRef?.querySelector?.('style[data-panel-trip-detail-export-style="1"]')) {
                exportStyleEl = documentRef?.createElement?.('style');
                exportStyleEl?.setAttribute?.('data-panel-trip-detail-export-style', '1');
                if (exportStyleEl) {
                    exportStyleEl.textContent = `
                        html.${exportClass} .panel-trip-detail { border-radius: 0 !important; border: none !important; box-shadow: none !important; width: max-content !important; max-width: none !important; }
                        html.${exportClass} .panel-trip-detail-body { max-height: none !important; overflow: visible !important; }
                        html.${exportClass} .panel-trip-detail-table { width: max-content !important; max-width: none !important; }
                        html.${exportClass} .panel-trip-detail-station,
                        html.${exportClass} .panel-trip-detail-station-marquee { max-width: none !important; overflow: visible !important; }
                        html.${exportClass} .panel-trip-detail-station-name { transform: none !important; }
                        html.${exportClass} .panel-trip-detail .panel-trip-detail-capture-btn { display: none !important; }
                    `;
                    documentRef?.head?.appendChild?.(exportStyleEl);
                }
            }

            const canvas = await html2canvas(element, {
                useCORS: true,
                backgroundColor: '#fff',
                logging: false,
                scale: Math.max(2, Math.ceil(windowRef?.devicePixelRatio || 1))
            });
            blob = await canvasToBlobPngFn(canvas);
        } finally {
            documentRef?.documentElement?.classList?.remove?.(exportClass);
            if (exportStyleEl) {
                try {
                    exportStyleEl.remove?.();
                } catch {
                    // ignore teardown errors
                }
            }
            restoreScrollableStateFn(states, { HTMLElementRef });
        }

        const base = sanitizeFilePartFn(filenameBase) || 'panel';
        downloadBlobFn(blob, `${base}-${nowIsoCompactFn()}.png`, {
            documentRef,
            windowRef,
            URLRef: globalThis.URL
        });
    } catch (error) {
        logger?.error?.('[panel] export png failed', error);
    } finally {
        if (button) button.disabled = !!previousDisabled;
    }
};

// panelPrintPayloadBridge.js
export const installPanelTimetablePrintPayloadBuilder = ({
    windowRef = globalThis.window,
    buildLineStationPrintPayload,
    createLineStationPrintPayloadSession
} = {}) => {
    try {
        if (!windowRef) return false;
        windowRef.TokyoRailPanelTimetablePrintPayloadBuilder = {
            buildLineStationPrintPayload,
            createLineStationPrintPayloadSession
        };
        return true;
    } catch {
        return false;
    }
};

// panelPrintRequestController.js
const defaultToText_panelPrintRequestController = (value) => String(value ?? '').trim();

export const collectLinePrintPayloads = ({
    lineEl,
    lineId,
    dirPrintPayloadByKey,
    makeLineDirKey,
    toText = defaultToText_panelPrintRequestController
} = {}) => {
    if (!lineEl || !lineId || !(dirPrintPayloadByKey instanceof Map)) return null;

    const lineSuffixHtml = toText(lineEl.querySelector?.('[data-line-suffix-row]')?.outerHTML || '');
    const stationInfoHtml = toText(lineEl.querySelector?.('[data-station-info]')?.outerHTML || '');
    const lineHeaderHtml = toText(lineEl.querySelector?.('.panel-line-header')?.outerHTML || '');
    const stationName = toText(lineEl?.getAttribute?.('data-station-name') || '');
    const dirs = [];
    const dirEls = Array.from(lineEl.querySelectorAll?.('[data-dir-toggle][data-dir-key]') || []);

    for (const dirEl of dirEls) {
        const dirKey = toText(dirEl.getAttribute?.('data-dir-key'));
        const lineDirKey = makeLineDirKey(lineId, dirKey);
        const payload = dirPrintPayloadByKey.get(lineDirKey);
        if (!payload) continue;
        const nextPayload = {
            ...payload,
            stationName,
            lineId,
            lineHeaderHtml,
            lineSuffixHtml,
            stationInfoHtml
        };
        dirs.push(nextPayload);
    }

    return {
        dirs,
        lineHeaderHtml,
        lineId,
        lineSuffixHtml,
        stationInfoHtml
    };
};

export const createPanelPrintRequestController = ({
    body,
    dirPrintPayloadByKey,
    makeLineDirKey,
    printAllEventName,
    toText = defaultToText_panelPrintRequestController,
    getStationName = () => '',
    getServiceDay = () => '',
    getTimetableViewMode = () => 'list',
    dispatchEvent = (event) => globalThis.window?.dispatchEvent?.(event),
    createCustomEvent = (name, init) => new CustomEvent(name, init)
} = {}) => {
    const findLineEl = (lineId) => {
        const targetId = toText(lineId);
        if (!targetId) return null;
        return Array.from(body?.querySelectorAll?.('[data-line-id]') || [])
            .find((el) => toText(el.getAttribute?.('data-line-id')) === targetId) || null;
    };

    const collectForLine = (lineId) => collectLinePrintPayloads({
        lineEl: findLineEl(lineId),
        lineId: toText(lineId),
        dirPrintPayloadByKey,
        makeLineDirKey,
        toText
    });

    const requestLineTimetableImage = (lineId) => {
        const payload = collectForLine(lineId);
        if (!payload?.dirs?.length) return false;
        try {
            dispatchEvent(createCustomEvent('__TokyoRailPrintLineTimetableImageRequested', {
                detail: payload
            }));
            return true;
        } catch {
            return false;
        }
    };

    const requestDirectionTimetable = (lineId) => requestLineTimetableImage(lineId);

    const collectAllDirectionPrintPayloads = () => {
        const out = [];
        const lineEls = Array.from(body?.querySelectorAll?.('[data-line-id]') || []);
        for (const lineEl of lineEls) {
            const lineId = toText(lineEl.getAttribute?.('data-line-id'));
            if (!lineId) continue;
            const linePayload = collectLinePrintPayloads({
                lineEl,
                lineId,
                dirPrintPayloadByKey,
                makeLineDirKey,
                toText
            });
            if (!linePayload?.dirs?.length) continue;
            out.push(...linePayload.dirs);
        }
        return out;
    };

    const requestAllTimetables = () => {
        const pages = collectAllDirectionPrintPayloads();
        if (!pages.length) return false;
        try {
            dispatchEvent(createCustomEvent(printAllEventName, {
                detail: {
                    stationName: toText(getStationName()),
                    serviceDay: toText(getServiceDay()),
                    timetableViewMode: getTimetableViewMode(),
                    pages
                }
            }));
            return true;
        } catch {
            return false;
        }
    };

    return {
        collectAllDirectionPrintPayloads,
        requestAllTimetables,
        requestDirectionTimetable,
        requestLineTimetableImage
    };
};

