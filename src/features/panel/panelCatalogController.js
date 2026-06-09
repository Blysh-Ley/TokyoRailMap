const defaultToText = (value) => String(value ?? '').trim();

const bind = (target, type, handler, options) => {
    if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') {
        return () => {};
    }
    target.addEventListener(type, handler, options);
    return () => target.removeEventListener?.(type, handler, options);
};

const getLineElements = (body) => Array.from(body?.querySelectorAll?.('[data-line-id]') || []);

export const resolvePanelCatalogTitle = ({
    activeLineId = '',
    currentLineStationMetaByLineId,
    currentStationId = '',
    currentStationNameZh = '',
    currentStationsIndex,
    toText = defaultToText
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
    toText = defaultToText
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

    const lineEls = getLineElements(body);
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
    toText = defaultToText
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
        bind(body, 'scroll', () => {
            syncCatalogActiveLine();
        }, { passive: true }),
        bind(catalogPanel, 'click', (evt) => {
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
        bind(catalogPanel, 'mouseenter', () => {
            catalogHoverEnteredOnce = true;
            setCatalogCompactMode(false);
        }),
        bind(catalogPanel, 'mouseleave', () => {
            if (!catalogHoverEnteredOnce) return;
            if (!catalogPanel.classList.contains('is-visible')) return;
            setCatalogCompactMode(true);
        }),
        bind(titleElement, 'click', () => {
            reopenCatalogPanelByTitleIntent();
        }),
        bind(catalogCloseBtn, 'click', (evt) => {
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
