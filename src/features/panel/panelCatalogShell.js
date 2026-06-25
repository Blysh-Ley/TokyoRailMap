import { removeCompanyAbbFromLineName, resolveMainLineIdForIcon } from '../../lib/line-icons.js';

import { getCompanyLogoSrc } from '../../lib/fetch.js';

import {
    THROUGH_SERVICE_CONFIGS,
    THROUGH_SERVICE_SEGMENT_LINE_IDS
} from '../../lib/throughServiceManager.js';



// panelContentHost.js
export const createPanelContentHost = ({
    documentRef = globalThis.document
} = {}) => {
    if (!documentRef?.createElement) {
        throw new Error('createPanelContentHost requires documentRef');
    }

    const panel = documentRef.createElement('div');
    panel.className = 'panel-container';
    panel.style.marginTop = '0';
    panel.style.maxHeight = 'none';
    panel.style.height = '100%';
    panel.style.opacity = '1';
    panel.style.overflow = 'hidden';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';

    return {
        panel,
        mount(host) {
            if (!host?.appendChild) return false;
            host.appendChild(panel);
            return true;
        }
    };
};

// panelContentApi.js
const resolveShellRoot_panelContentApi = (shellOrRoot) => shellOrRoot?.root || shellOrRoot || null;

export const createPanelContentApi = ({
    createContentHost = createPanelContentHost,
    documentRef = globalThis.document
} = {}) => {
    const contentHost = createContentHost({ documentRef });
    const panel = contentHost.panel;

    return {
        kind: 'panel-content-api',
        panel,
        contentRoot: panel,
        appendContent(node) {
            if (!node || !panel?.appendChild) return false;
            panel.appendChild(node);
            return true;
        },
        mountInto(shellOrRoot) {
            const root = resolveShellRoot_panelContentApi(shellOrRoot);
            if (!root) return false;
            return contentHost.mount(root);
        }
    };
};

export const composePanelShellWithContent = ({
    contentApi,
    shell
} = {}) => {
    const root = resolveShellRoot_panelContentApi(shell);
    const panel = contentApi?.panel || contentApi?.contentRoot || null;

    return {
        contentApi,
        panel,
        root,
        shell,
        mountContent() {
            if (!contentApi?.mountInto || !root) return false;
            return contentApi.mountInto(root);
        },
        mountShellOverlay(node) {
            if (!node || !root?.appendChild) return false;
            root.appendChild(node);
            return true;
        }
    };
};

// panelCatalogController.js
const defaultToText_panelCatalogController = (value) => String(value ?? '').trim();

const bind_panelCatalogController = (target, type, handler, options) => {
    if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') {
        return () => {};
    }
    target.addEventListener(type, handler, options);
    return () => target.removeEventListener?.(type, handler, options);
};

const getLineElements_panelCatalogController = (body) => Array.from(body?.querySelectorAll?.('[data-line-id]') || []);

export const resolvePanelCatalogTitle = ({
    activeLineId = '',
    currentLineStationMetaByLineId,
    currentStationId = '',
    currentStationNameZh = '',
    currentStationsIndex,
    toText = defaultToText_panelCatalogController
} = {}) => {
    const lineId = toText(activeLineId);
    const meta = lineId ? currentLineStationMetaByLineId?.get?.(lineId) : null;
    const stationId = toText(meta?.stationId || currentStationId);
    return {
        main: toText(currentStationsIndex?.idToNameZh?.get?.(stationId) || currentStationNameZh || ''),
        sub: toText(currentStationsIndex?.idToNameEn?.get?.(stationId) || '')
    };
};

export const resolvePanelCatalogActiveLineState = ({
    body,
    forcedActiveLineId = '',
    forcedActiveUntilMs = 0,
    nowMs = () => Date.now(),
    thresholdOffsetPx = 100,
    toText = defaultToText_panelCatalogController
} = {}) => {
    let nextForcedActiveLineId = toText(forcedActiveLineId);
    let nextForcedActiveUntilMs = Number(forcedActiveUntilMs) || 0;
    const now = typeof nowMs === 'function' ? Number(nowMs()) || Date.now() : Date.now();

    if (nextForcedActiveLineId && now < nextForcedActiveUntilMs) {
        return {
            activeLineId: nextForcedActiveLineId,
            forcedActiveLineId: nextForcedActiveLineId,
            forcedActiveUntilMs: nextForcedActiveUntilMs,
            usedForced: true
        };
    }

    if (nextForcedActiveLineId && now >= nextForcedActiveUntilMs) {
        nextForcedActiveLineId = '';
        nextForcedActiveUntilMs = 0;
    }

    const lineEls = getLineElements_panelCatalogController(body);
    if (!lineEls.length) {
        return {
            activeLineId: '',
            forcedActiveLineId: nextForcedActiveLineId,
            forcedActiveUntilMs: nextForcedActiveUntilMs,
            usedForced: false
        };
    }

    const bodyRect = body?.getBoundingClientRect?.() || { top: 0 };
    const activeTopThreshold = Number(bodyRect.top) - Math.max(0, Number(thresholdOffsetPx) || 0);
    let activeLineId = '';

    for (const lineEl of lineEls) {
        if (!(lineEl instanceof Element) && typeof lineEl?.getAttribute !== 'function') continue;
        const rect = lineEl?.getBoundingClientRect?.() || { top: Number.NEGATIVE_INFINITY };
        if (Number(rect.top) >= activeTopThreshold) {
            activeLineId = toText(lineEl.getAttribute?.('data-line-id'));
            break;
        }
    }

    if (!activeLineId) {
        const last = lineEls[lineEls.length - 1];
        activeLineId = toText(last?.getAttribute?.('data-line-id'));
    }

    return {
        activeLineId,
        forcedActiveLineId: nextForcedActiveLineId,
        forcedActiveUntilMs: nextForcedActiveUntilMs,
        usedForced: false
    };
};

export const shouldShowPanelCatalog = ({
    body,
    dismissedByUser = false,
    entries = [],
    panelVisible = false
} = {}) => {
    const hasOverflowY = ((Number(body?.scrollHeight) || 0) - (Number(body?.clientHeight) || 0)) > 1;
    return panelVisible === true && hasOverflowY && Array.isArray(entries) && entries.length > 0 && dismissedByUser !== true;
};

export const createPanelCatalogController = ({
    body,
    documentRef = globalThis.document,
    mountShellOverlay,
    panelShell,
    titleElement,
    collectEntries = () => [],
    renderEntries = () => {},
    hydrateCloseIcon = () => {},
    getCurrentLineStationMetaByLineId = () => null,
    getCurrentStationId = () => '',
    getCurrentStationNameZh = () => '',
    getCurrentStationsIndex = () => null,
    setTitle = () => {},
    scrollToLineId = () => false,
    stopEvent = () => {},
    requestFrame = globalThis.requestAnimationFrame,
    cancelFrame = globalThis.cancelAnimationFrame,
    createMutationObserver = (typeof MutationObserver !== 'undefined')
        ? (callback) => new MutationObserver(callback)
        : null,
    createResizeObserver = (typeof ResizeObserver !== 'undefined')
        ? (callback) => new ResizeObserver(callback)
        : null,
    nowMs = () => Date.now(),
    toText = defaultToText_panelCatalogController
} = {}) => {
    if (!body || !documentRef?.createElement || typeof mountShellOverlay !== 'function') {
        throw new Error('panelCatalogController requires body, documentRef, and mountShellOverlay');
    }

    const catalogPanel = documentRef.createElement('div');
    catalogPanel.className = 'panel-catalog-subpanel';
    catalogPanel.setAttribute('data-panel-catalog', '');

    const catalogTitle = documentRef.createElement('div');
    catalogTitle.className = 'panel-catalog-title';

    const catalogTitleText = documentRef.createElement('span');
    catalogTitleText.className = 'panel-catalog-title-text';
    catalogTitleText.textContent = '目录';

    const catalogCloseBtn = documentRef.createElement('button');
    catalogCloseBtn.type = 'button';
    catalogCloseBtn.className = 'panel-catalog-close-btn';
    catalogCloseBtn.setAttribute('data-panel-catalog-close-btn', '1');
    catalogCloseBtn.setAttribute('aria-label', '关闭目录');

    const catalogCloseIcon = documentRef.createElement('img');
    catalogCloseIcon.className = 'panel-catalog-close-icon';
    catalogCloseIcon.alt = '';

    const catalogBody = documentRef.createElement('div');
    catalogBody.className = 'panel-catalog-body';
    catalogBody.setAttribute('data-panel-catalog-body', '1');

    catalogCloseBtn.appendChild(catalogCloseIcon);
    catalogTitle.append(catalogTitleText, catalogCloseBtn);
    catalogPanel.append(catalogTitle, catalogBody);

    let catalogRefreshRafId = null;
    let catalogMutationObserver = null;
    let catalogResizeObserver = null;
    let catalogDismissedByUser = false;
    let catalogForcedActiveLineId = '';
    let catalogForcedActiveUntilMs = 0;
    let catalogHoverEnteredOnce = false;
    let catalogCompactMode = false;

    const clearScheduledRefresh = () => {
        if (catalogRefreshRafId == null) return;
        if (typeof cancelFrame === 'function') cancelFrame(catalogRefreshRafId);
        else clearTimeout(catalogRefreshRafId);
        catalogRefreshRafId = null;
    };

    const setCatalogActiveLine = (activeLineId) => {
        const activeId = toText(activeLineId);
        const buttons = Array.from(catalogBody.querySelectorAll?.('.panel-catalog-line[data-panel-catalog-line-id]') || []);
        for (const btn of buttons) {
            if (!btn?.classList?.toggle) continue;
            const lineId = toText(btn.getAttribute?.('data-panel-catalog-line-id'));
            btn.classList.toggle('is-active', !!activeId && lineId === activeId);
        }
    };

    const syncPanelTitleForActiveLine = (activeLineId = '') => {
        const title = resolvePanelCatalogTitle({
            activeLineId,
            currentLineStationMetaByLineId: getCurrentLineStationMetaByLineId?.(),
            currentStationId: getCurrentStationId?.(),
            currentStationNameZh: getCurrentStationNameZh?.(),
            currentStationsIndex: getCurrentStationsIndex?.(),
            toText
        });
        setTitle(title);
        return title;
    };

    const syncCatalogActiveLine = () => {
        if (!catalogPanel.classList.contains('is-visible')) return '';

        const next = resolvePanelCatalogActiveLineState({
            body,
            forcedActiveLineId: catalogForcedActiveLineId,
            forcedActiveUntilMs: catalogForcedActiveUntilMs,
            nowMs,
            toText
        });

        catalogForcedActiveLineId = next.forcedActiveLineId;
        catalogForcedActiveUntilMs = next.forcedActiveUntilMs;
        setCatalogActiveLine(next.activeLineId);
        syncPanelTitleForActiveLine(next.activeLineId);
        return next.activeLineId;
    };

    const renderCatalogEntries = (entries) => {
        renderEntries(catalogBody, Array.isArray(entries) ? entries : []);
    };

    const setCatalogCompactMode = (compact) => {
        const next = compact === true;
        if (catalogCompactMode === next) return;
        catalogCompactMode = next;
        catalogPanel.classList.toggle('is-compact', next);
    };

    const refreshCatalogPanel = () => {
        const entries = collectEntries();
        renderCatalogEntries(entries);

        const shouldShow = shouldShowPanelCatalog({
            body,
            dismissedByUser: catalogDismissedByUser,
            entries,
            panelVisible: panelShell?.isVisible?.() === true
        });

        catalogPanel.classList.toggle('is-visible', shouldShow);
        if (!shouldShow) {
            catalogHoverEnteredOnce = false;
            setCatalogCompactMode(false);
            return false;
        }

        syncCatalogActiveLine();
        return true;
    };

    const scheduleCatalogRefresh = () => {
        if (catalogRefreshRafId != null) return;
        const schedule = typeof requestFrame === 'function'
            ? requestFrame
            : (callback) => setTimeout(callback, 16);
        catalogRefreshRafId = schedule(() => {
            catalogRefreshRafId = null;
            refreshCatalogPanel();
        });
    };

    const reopenCatalogPanelByTitleIntent = () => {
        if (!catalogDismissedByUser) return false;
        catalogDismissedByUser = false;
        catalogHoverEnteredOnce = false;
        setCatalogCompactMode(false);
        scheduleCatalogRefresh();
        return true;
    };

    const resetTransientUiState = () => {
        catalogHoverEnteredOnce = false;
        setCatalogCompactMode(false);
    };

    mountShellOverlay(catalogPanel);

    try {
        hydrateCloseIcon(catalogCloseIcon);
    } catch {
        // ignore icon hydration failures
    }

    const unbinders = [
        bind_panelCatalogController(body, 'scroll', () => {
            syncCatalogActiveLine();
        }, { passive: true }),
        bind_panelCatalogController(catalogPanel, 'click', (evt) => {
            const target = evt?.target;
            const btn = target?.closest?.('.panel-catalog-line[data-panel-catalog-line-id]');
            if (!btn) return;
            const lineId = toText(btn.getAttribute?.('data-panel-catalog-line-id'));
            if (!lineId) return;
            stopEvent(evt);
            catalogForcedActiveLineId = lineId;
            catalogForcedActiveUntilMs = (typeof nowMs === 'function' ? nowMs() : Date.now()) + 2000;
            setCatalogActiveLine(lineId);
            syncPanelTitleForActiveLine(lineId);
            scrollToLineId(lineId, { behavior: 'smooth', block: 'start' });
        }, { passive: false }),
        bind_panelCatalogController(catalogPanel, 'mouseenter', () => {
            catalogHoverEnteredOnce = true;
            setCatalogCompactMode(false);
        }),
        bind_panelCatalogController(catalogPanel, 'mouseleave', () => {
            if (!catalogHoverEnteredOnce) return;
            if (!catalogPanel.classList.contains('is-visible')) return;
            setCatalogCompactMode(true);
        }),
        bind_panelCatalogController(titleElement, 'click', () => {
            reopenCatalogPanelByTitleIntent();
        }),
        bind_panelCatalogController(catalogCloseBtn, 'click', (evt) => {
            stopEvent(evt);
            catalogDismissedByUser = true;
            catalogForcedActiveLineId = '';
            catalogForcedActiveUntilMs = 0;
            catalogHoverEnteredOnce = false;
            setCatalogCompactMode(false);
            scheduleCatalogRefresh();
        }, { passive: false })
    ];

    if (typeof createMutationObserver === 'function') {
        catalogMutationObserver = createMutationObserver(() => {
            scheduleCatalogRefresh();
        });
        catalogMutationObserver?.observe?.(body, {
            childList: true,
            subtree: true
        });
    }

    if (typeof createResizeObserver === 'function') {
        catalogResizeObserver = createResizeObserver(() => {
            scheduleCatalogRefresh();
        });
        catalogResizeObserver?.observe?.(body);
    }

    return {
        elements: {
            catalogBody,
            catalogCloseBtn,
            catalogCloseIcon,
            catalogPanel
        },
        destroy() {
            clearScheduledRefresh();
            while (unbinders.length) {
                const unbind = unbinders.pop();
                try {
                    unbind?.();
                } catch {
                    // ignore teardown errors
                }
            }
            try {
                catalogMutationObserver?.disconnect?.();
            } catch {
                // ignore
            }
            try {
                catalogResizeObserver?.disconnect?.();
            } catch {
                // ignore
            }
        },
        refresh: refreshCatalogPanel,
        reopenByTitleIntent: reopenCatalogPanelByTitleIntent,
        resetTransientUiState,
        scheduleRefresh: scheduleCatalogRefresh,
        syncActiveLine: syncCatalogActiveLine,
        syncTitleForActiveLine: syncPanelTitleForActiveLine
    };
};

// panelCompanyCatalogRenderer.js
const defaultToText_panelCompanyCatalogRenderer = (value) => String(value ?? '').trim();
const DEFAULT_COMPANY_NAME_panelCompanyCatalogRenderer = '\u672a\u77e5\u516c\u53f8';

const escapeHtml_panelCompanyCatalogRenderer = (input) => String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeArrayLike_panelCompanyCatalogRenderer = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value ? [value] : [];

    const text = value.trim();
    if (text.startsWith('[') && text.endsWith(']')) {
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : [value];
        } catch {
            return [value];
        }
    }
    return text ? [text] : [];
};

const toRailwaysOrderKey_panelCompanyCatalogRenderer = (lineId) => {
    const raw = String(lineId ?? '').trim();
    if (!raw) return '';
    const parts = raw.split('.');
    const company = String(parts[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const name = String(parts.slice(1).join('') ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!company || !name) return '';
    return `${company}-${name}`;
};

const sortCompanyLines_panelCompanyCatalogRenderer = (lines, { railwaysOrderIndex } = {}) => {
    const src = Array.isArray(lines) ? lines : [];
    const orderIndex = railwaysOrderIndex instanceof Map ? railwaysOrderIndex : null;
    if (!orderIndex || !orderIndex.size) return src;

    let maxTriggerRank = Number.NEGATIVE_INFINITY;
    for (const item of src) {
        if (item?.lineId && THROUGH_SERVICE_SEGMENT_LINE_IDS.has(item.lineId)) {
            const key = toRailwaysOrderKey_panelCompanyCatalogRenderer(item.lineId);
            const rank = key ? orderIndex.get(key) : undefined;
            if (typeof rank === 'number' && Number.isFinite(rank) && rank > maxTriggerRank) {
                maxTriggerRank = rank;
            }
        }
    }

    const decorated = src.map((line, idx) => {
        const key = toRailwaysOrderKey_panelCompanyCatalogRenderer(line?.lineId);
        let rank = key ? orderIndex.get(key) : undefined;

        if (!Number.isFinite(rank) && maxTriggerRank > Number.NEGATIVE_INFINITY) {
            const throughIndex = THROUGH_SERVICE_CONFIGS.findIndex((info) => info.lineId === line?.lineId);
            if (throughIndex !== -1) {
                rank = maxTriggerRank + ((THROUGH_SERVICE_CONFIGS.length - throughIndex) * 0.1);
            }
        }

        return {
            idx,
            line,
            rank: (typeof rank === 'number' && Number.isFinite(rank)) ? rank : Number.POSITIVE_INFINITY
        };
    });

    decorated.sort((a, b) => {
        const aFinite = Number.isFinite(a.rank);
        const bFinite = Number.isFinite(b.rank);
        if (aFinite !== bFinite) return aFinite ? -1 : 1;
        if (aFinite && bFinite && a.rank !== b.rank) return b.rank - a.rank;
        return a.idx - b.idx;
    });

    return decorated.map((item) => item.line);
};

export const buildPanelCompaniesHtml = (props = {}, {
    companyLogoMap,
    fallbackCompanyName = DEFAULT_COMPANY_NAME_panelCompanyCatalogRenderer,
    getLineMeta,
    lineStationNameByLineId,
    railwaysOrderIndex,
    toText = defaultToText_panelCompanyCatalogRenderer
} = {}) => {
    const servingIdsRaw = normalizeArrayLike_panelCompanyCatalogRenderer(props.display_serving_ids ?? props.serving_ids);
    const servingIds = servingIdsRaw.map(String).filter(Boolean);
    const servingIdSet = new Set(servingIds);
    const hiddenEntityLineIds = new Set();
    for (const info of THROUGH_SERVICE_CONFIGS) {
        if (!servingIdSet.has(info.lineId)) continue;
        for (const hiddenLineId of info.hiddenEntityLineIds || []) {
            const id = toText(hiddenLineId);
            if (id) hiddenEntityLineIds.add(id);
        }
    }
    const safeGetLineMeta = typeof getLineMeta === 'function' ? getLineMeta : (() => null);
    const logoMap = companyLogoMap || {};
    const groups = new Map();
    const seenLineIds = new Set();

    for (const lineId of servingIds) {
        const id = String(lineId);
        if (!id || seenLineIds.has(id)) continue;
        if (hiddenEntityLineIds.has(id)) continue;
        seenLineIds.add(id);

        const meta = safeGetLineMeta(id);
        const company = (meta?.company ? String(meta.company) : fallbackCompanyName).trim() || fallbackCompanyName;
        const color = meta?.color || null;
        const abb = logoMap?.[company]?.abb || logoMap?.[company]?.zh || company;

        let displayName = String(meta?.name || '').trim();
        if (!displayName) displayName = id;

        const resolvedMainId = toText(resolveMainLineIdForIcon(id));
        if (resolvedMainId && resolvedMainId !== id && !servingIdSet.has(resolvedMainId)) {
            const resolvedMeta = safeGetLineMeta(resolvedMainId);
            const srcCompany = toText(meta?.company);
            const dstCompany = toText(resolvedMeta?.company);
            const sameCompany = !srcCompany || !dstCompany || srcCompany === dstCompany;
            const resolvedName = toText(resolvedMeta?.name);
            const displayLooksLikeRawId = !displayName || displayName === id || displayName.includes('.');
            if (sameCompany && resolvedName && displayLooksLikeRawId) {
                displayName = resolvedName;
            }
        }

        displayName = removeCompanyAbbFromLineName(displayName, abb, { lineId: id, normalize: toText });

        if (!groups.has(company)) groups.set(company, []);
        groups.get(company).push({ lineId: id, displayName, color });
    }

    if (!groups.size) return '';

    let companiesHtml = '';
    for (const [company, lines] of groups) {
        const sortedLines = sortCompanyLines_panelCompanyCatalogRenderer(lines, { railwaysOrderIndex });
        const companyZh = logoMap?.[company]?.zh || null;
        const companyDisplay = String(companyZh || company);
        const logoSrc = getCompanyLogoSrc(company, logoMap) || null;
        const logoHtml = logoSrc
            ? `<img class="panel-company-logo" src="${escapeHtml_panelCompanyCatalogRenderer(logoSrc)}" alt="" />`
            : '';

        let linesHtml = '';
        for (const line of sortedLines) {
            const isVirtualThrough = line.lineId
                ? THROUGH_SERVICE_CONFIGS.some((info) => info.lineId === line.lineId)
                : false;
            const boldClass = isVirtualThrough ? ' panel-line-name-main-bold' : '';
            const safeLineColor = typeof line.color === 'string' ? line.color.trim() : '';
            const style = safeLineColor
                ? ` style="color:${escapeHtml_panelCompanyCatalogRenderer(safeLineColor)};--panel-line-accent:${escapeHtml_panelCompanyCatalogRenderer(safeLineColor)}"`
                : '';
            const transferMetaRaw = line.lineId
                ? (lineStationNameByLineId?.get?.(line.lineId) || lineStationNameByLineId?.[line.lineId] || null)
                : null;
            const transferStationName = typeof transferMetaRaw === 'string'
                ? toText(transferMetaRaw)
                : toText(transferMetaRaw?.name || '');
            const actualStationName = typeof transferMetaRaw === 'string'
                ? toText(transferMetaRaw)
                : toText(transferMetaRaw?.actualName || '');
            const idAttr = line.lineId
                ? ` data-line-id="${escapeHtml_panelCompanyCatalogRenderer(String(line.lineId))}" data-station-name="${escapeHtml_panelCompanyCatalogRenderer(actualStationName)}"`
                : '';
            const transferStationCode = typeof transferMetaRaw === 'string'
                ? ''
                : toText(transferMetaRaw?.code || '');
            const suffixHtml = transferStationName
                ? `<span class="panel-line-name-suffix">\uff08${escapeHtml_panelCompanyCatalogRenderer(transferStationName)}\u7ad9\uff09</span>`
                : '';
            const transferCodeAttr = transferStationCode
                ? ` data-transfer-station-code="${escapeHtml_panelCompanyCatalogRenderer(transferStationCode)}"`
                : '';

            linesHtml += `
                <div class="panel-line"${idAttr}${style}>
                    <div class="panel-line-top">
                        <div class="panel-line-header">
                            <span class="panel-line-name" data-line-name="${escapeHtml_panelCompanyCatalogRenderer(line.displayName)}"${transferCodeAttr}><span class="panel-line-name-main${boldClass}">${escapeHtml_panelCompanyCatalogRenderer(line.displayName)}</span></span>
                            <button type="button" class="panel-line-toggle" data-panel-line-toggle="1" aria-label="收起线路" aria-expanded="true">
                                <span class="panel-dir-triangle panel-line-toggle-icon" aria-hidden="true">▾</span>
                            </button>
                        </div>
                        <div class="panel-line-collapsible" data-panel-line-collapsible="1">
                            ${suffixHtml ? `<div class="panel-line-suffix-row" data-line-suffix-row="1">${suffixHtml}</div>` : ''}
                            <div class="panel-station-info" data-station-info="1">
                                <span class="panel-station-info-left"></span>
                                <span class="panel-station-info-types" data-station-type-summary="1"></span>
                            </div>
                            <div class="panel-timetable-root" data-timetable-root="1"></div>
                        </div>
                    </div>
                </div>
            `;
        }

        companiesHtml += `
            <div class="panel-company">
                <div class="panel-company-header" data-company="${escapeHtml_panelCompanyCatalogRenderer(company)}" data-panel-company-toggle="1">
                    <span class="panel-company-identity">${logoHtml}<span class="panel-company-name">${escapeHtml_panelCompanyCatalogRenderer(companyDisplay)}</span></span>
                    <button type="button" class="panel-company-toggle" data-panel-company-toggle-btn="1" aria-label="收起运营商线路" aria-expanded="true">
                        <span class="panel-dir-triangle panel-company-toggle-icon" aria-hidden="true">▾</span>
                    </button>
                </div>
                <div class="panel-company-lines">${linesHtml}</div>
            </div>
        `;
    }

    return `<div class="panel-popup is-interactive">${companiesHtml}</div>`;
};

export const collectPanelCatalogEntries = (body, {
    fallbackCompanyName = DEFAULT_COMPANY_NAME_panelCompanyCatalogRenderer,
    toText = defaultToText_panelCompanyCatalogRenderer
} = {}) => {
    const out = [];
    const companyEls = Array.from(body?.querySelectorAll?.('.panel-company') || []);
    for (const companyEl of companyEls) {
        const companyName = toText(companyEl.querySelector?.('.panel-company-name')?.textContent)
            || toText(companyEl.querySelector?.('.panel-company-header')?.getAttribute?.('data-company'))
            || fallbackCompanyName;
        const companyLinesEl = companyEl.querySelector?.('.panel-company-lines');
        const lineEls = companyLinesEl ? Array.from(companyLinesEl.children || []) : [];
        const lines = [];

        for (const lineEl of lineEls) {
            if (!lineEl?.classList?.contains?.('panel-line')) continue;
            const lineId = toText(lineEl.getAttribute?.('data-line-id'));
            const lineName = toText(lineEl.querySelector?.('.panel-line-name-main')?.textContent)
                || toText(lineEl.querySelector?.('.panel-line-name')?.textContent)
                || lineId;
            if (!lineName) continue;
            lines.push({ lineId, lineName });
        }

        if (lines.length) out.push({ companyName, lines });
    }
    return out;
};

export const renderPanelCatalogEntriesHtml = (entries, {
    fallbackCompanyName = DEFAULT_COMPANY_NAME_panelCompanyCatalogRenderer,
    toText = defaultToText_panelCompanyCatalogRenderer
} = {}) => {
    const safeEntries = Array.isArray(entries) ? entries : [];
    if (!safeEntries.length) return '';

    let html = '';
    for (const company of safeEntries) {
        const companyName = escapeHtml_panelCompanyCatalogRenderer(toText(company?.companyName) || fallbackCompanyName);
        const lines = Array.isArray(company?.lines) ? company.lines : [];
        const lineHtml = lines.map((line) => {
            const lineName = escapeHtml_panelCompanyCatalogRenderer(toText(line?.lineName));
            const lineId = toText(line?.lineId);
            if (lineId) {
                return `<button type="button" class="panel-catalog-line" data-panel-catalog-line-id="${escapeHtml_panelCompanyCatalogRenderer(lineId)}">${lineName}</button>`;
            }
            return `<div class="panel-catalog-line is-static">${lineName}</div>`;
        }).join('');

        html += `
            <div class="panel-catalog-company">
                <div class="panel-catalog-company-name">${companyName}</div>
                <div class="panel-catalog-lines">${lineHtml}</div>
            </div>
        `;
    }
    return html;
};

// panelThemeHelpers.js
const defaultToText_panelThemeHelpers = (value) => String(value ?? '').trim();

export const panelIsDarkThemeActive = ({
    documentRef = globalThis.document
} = {}) => {
    try {
        return documentRef?.documentElement?.getAttribute?.('data-theme') === 'dark';
    } catch {
        return false;
    }
};

export const panelParseCssColorToRgb = (input) => {
    const value = String(input || '').trim();
    if (!value) return null;

    const hex = value.match(/^#([0-9a-fA-F]{3,8})$/);
    if (hex) {
        const raw = hex[1];
        if (raw.length === 3 || raw.length === 4) {
            return {
                r: parseInt(raw[0] + raw[0], 16),
                g: parseInt(raw[1] + raw[1], 16),
                b: parseInt(raw[2] + raw[2], 16)
            };
        }
        if (raw.length === 6 || raw.length === 8) {
            return {
                r: parseInt(raw.slice(0, 2), 16),
                g: parseInt(raw.slice(2, 4), 16),
                b: parseInt(raw.slice(4, 6), 16)
            };
        }
    }

    const rgb = value.match(/^rgba?\(\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)(?:\s*,\s*([0-9]+(?:\.[0-9]+)?))?\s*\)$/i);
    if (!rgb) return null;

    return {
        r: Math.max(0, Math.min(255, Math.round(Number(rgb[1])))),
        g: Math.max(0, Math.min(255, Math.round(Number(rgb[2])))),
        b: Math.max(0, Math.min(255, Math.round(Number(rgb[3]))))
    };
};

export const panelRgbToHex = ({ r, g, b }) => {
    const to2 = (value) => Math.max(0, Math.min(255, Math.round(Number(value) || 0))).toString(16).padStart(2, '0');
    return `#${to2(r)}${to2(g)}${to2(b)}`;
};

export const panelRelativeLuminance = ({ r, g, b }) => {
    const toLinear = (value) => {
        const normalized = Math.max(0, Math.min(255, Number(value) || 0)) / 255;
        return normalized <= 0.03928 ? (normalized / 12.92) : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };

    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

export const getPanelDarkInvertTriggerLuminance = () => {
    const reference = panelParseCssColorToRgb('#005AAA');
    return reference ? panelRelativeLuminance(reference) : 0.102;
};

export const panelAdjustColorForDarkThemeIfNeeded = (color, {
    toText = defaultToText_panelThemeHelpers,
    invertTriggerLuminance = getPanelDarkInvertTriggerLuminance()
} = {}) => {
    const parsed = panelParseCssColorToRgb(color);
    if (!parsed) return toText(color);

    const luminance = panelRelativeLuminance(parsed);
    if (!(luminance < invertTriggerLuminance)) return toText(color);

    return panelRgbToHex({
        r: 255 - parsed.r,
        g: 255 - parsed.g,
        b: 255 - parsed.b
    });
};

export const resolveTrainTypeColorForTheme = (color, {
    toText = defaultToText_panelThemeHelpers,
    isDarkTheme = panelIsDarkThemeActive()
} = {}) => {
    const raw = toText(color);
    if (!raw) return raw;
    if (!isDarkTheme) return raw;
    return panelAdjustColorForDarkThemeIfNeeded(raw, { toText });
};

export const resolvePanelBadgeTextColor = (bgColor) => {
    const parsed = panelParseCssColorToRgb(bgColor);
    if (!parsed) return '#fff';
    return panelRelativeLuminance(parsed) > 0.55 ? '#111' : '#fff';
};
