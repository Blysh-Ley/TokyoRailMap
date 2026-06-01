const defaultToText = (value) => String(value ?? '').trim();

const isElementLike = (target) => !!target && typeof target.closest === 'function';

const isContained = (rootEl, target) => {
    if (!rootEl || !target || typeof rootEl.contains !== 'function') return false;
    return rootEl.contains(target);
};

const closestInside = (target, selector, rootEl) => {
    if (!isElementLike(target)) return null;
    const hit = target.closest?.(selector);
    if (!hit || (rootEl && !isContained(rootEl, hit))) return null;
    return hit;
};

export const resolvePanelCompanyTarget = (target, {
    body,
    toText = defaultToText
} = {}) => {
    const hit = closestInside(target, '.panel-company-logo, .panel-company-name', body);
    if (!hit) return null;
    const companyEl = hit.closest?.('.panel-company-header[data-company]');
    const company = toText(companyEl?.getAttribute?.('data-company'));
    return company || null;
};

export const resolvePanelLineTarget = (target, {
    body,
    toText = defaultToText
} = {}) => {
    const hit = closestInside(target, '.panel-line-name', body);
    if (!hit) return null;
    const lineEl = hit.closest?.('[data-line-id]');
    const lineId = toText(lineEl?.getAttribute?.('data-line-id'));
    return lineId || null;
};

const resolveLineDirTarget = (target, {
    body,
    triggerSelector,
    toText = defaultToText
} = {}) => {
    const triggerEl = closestInside(target, triggerSelector, body);
    if (!triggerEl) return null;
    const dirEl = triggerEl.closest?.('[data-dir-toggle]');
    const lineEl = triggerEl.closest?.('[data-line-id]');
    const lineId = toText(lineEl?.getAttribute?.('data-line-id'));
    const dirKey = toText(dirEl?.getAttribute?.('data-dir-key'));
    if (!lineId || !dirKey) return null;
    return { lineId, dirKey };
};

export const resolvePanelDirTitleTarget = (target, options = {}) => resolveLineDirTarget(target, {
    ...options,
    triggerSelector: '.panel-dir-title'
});

export const resolvePanelDirTriangleTarget = (target, options = {}) => resolveLineDirTarget(target, {
    ...options,
    triggerSelector: '.panel-dir-triangle'
});

const resolveDirButtonTarget = (target, {
    body,
    selector,
    toText = defaultToText
} = {}) => {
    const buttonEl = closestInside(target, selector, body);
    if (!buttonEl) return null;
    const lineId = toText(buttonEl.getAttribute?.('data-line-id'));
    const dirKey = toText(buttonEl.getAttribute?.('data-dir-key'));
    if (!lineId || !dirKey) return null;
    return { buttonEl, lineId, dirKey };
};

export const resolvePanelDirFilterButtonTarget = (target, options = {}) => resolveDirButtonTarget(target, {
    ...options,
    selector: '.panel-dir-filter-btn[data-dir-filter-btn]'
});

export const resolvePanelDirPrintButtonTarget = (target, options = {}) => resolveDirButtonTarget(target, {
    ...options,
    selector: '.panel-dir-print-btn[data-dir-print-btn]'
});

export const resolveTripDetailStationTarget = (target, {
    rootEl = null
} = {}) => closestInside(target, '.panel-trip-detail-station[data-station-id]', rootEl);

const bind = (target, type, handler, options) => {
    if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') {
        return () => {};
    }
    target.addEventListener(type, handler, options);
    return () => target.removeEventListener?.(type, handler, options);
};

export const createPanelEventDelegationCoordinator = ({
    body,
    bodyHandlers = {},
    tripDetailBody = null,
    tripDetailHandlers = {}
} = {}) => {
    const unbinders = [
        bind(body, 'pointerdown', bodyHandlers.pointerdown, { passive: false }),
        bind(body, 'pointermove', bodyHandlers.pointermove, { passive: true }),
        bind(body, 'pointerup', bodyHandlers.pointerup, { passive: true }),
        bind(body, 'pointercancel', bodyHandlers.pointercancel, { passive: true }),
        bind(body, 'mousemove', bodyHandlers.mousemove),
        bind(body, 'mouseleave', bodyHandlers.mouseleave),
        bind(body, 'click', bodyHandlers.click, { passive: false }),
        bind(body, 'mouseover', bodyHandlers.mouseover),
        bind(body, 'mouseout', bodyHandlers.mouseout),
        bind(tripDetailBody, 'mouseover', tripDetailHandlers.mouseover),
        bind(tripDetailBody, 'mouseout', tripDetailHandlers.mouseout),
        bind(tripDetailBody, 'mouseleave', tripDetailHandlers.mouseleave),
        bind(tripDetailBody, 'pointerdown', tripDetailHandlers.pointerdown, { passive: true })
    ];

    return {
        destroy() {
            while (unbinders.length) {
                const unbind = unbinders.pop();
                try {
                    unbind?.();
                } catch {
                    // ignore teardown errors from detached test doubles or DOM nodes
                }
            }
        }
    };
};
