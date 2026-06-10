import {
    createLineIconElement as defaultCreateLineIconElement,
    createStationCodeBadgeElement as defaultCreateStationCodeBadgeElement,
    getResolvedRouteIconMeta as defaultGetResolvedRouteIconMeta
} from '../../lib/line-icons.js';

import { THROUGH_SERVICE_CONFIGS } from '../../lib/throughServiceManager.js';



// panelDirFilterModel.js
const defaultToText_panelDirFilterModel = (value) => String(value ?? '').trim();

export const DIR_FILTER_FIELDS = ['origins', 'terminals', 'types'];

export const DIR_FILTER_FIELD_TO_ROW_KEY = {
    origins: 'origin',
    terminals: 'terminal',
    types: 'type'
};

export const createEmptyDirFilterState = () => ({
    origins: new Set(),
    terminals: new Set(),
    types: new Set()
});

export const normalizeDirFilterState = (state) => {
    const next = createEmptyDirFilterState();
    for (const field of DIR_FILTER_FIELDS) {
        const source = state?.[field];
        if (!(source instanceof Set)) continue;
        for (const value of source) {
            const text = defaultToText_panelDirFilterModel(value);
            if (text) next[field].add(text);
        }
    }
    return next;
};

export const toDirFilterRow = (row, { toText = defaultToText_panelDirFilterModel } = {}) => ({
    origin: toText(row?.origin ?? row?.originName),
    terminal: toText(row?.terminal ?? row?.terminalDisplayName ?? row?.terminalName ?? row?.destName),
    type: toText(row?.type ?? row?.typeName)
});

export const hasDirFilterRowValue = (row) => {
    const filterRow = toDirFilterRow(row);
    return !!(filterRow.origin || filterRow.terminal || filterRow.type);
};

export const collectDirFilterOptionSets = (rows) => {
    const list = Array.isArray(rows) ? rows : [];
    const out = createEmptyDirFilterState();
    for (const row of list) {
        const filterRow = toDirFilterRow(row);
        if (filterRow.origin) out.origins.add(filterRow.origin);
        if (filterRow.terminal) out.terminals.add(filterRow.terminal);
        if (filterRow.type) out.types.add(filterRow.type);
    }
    return out;
};

export const createAllSelectedDirFilterState = (rows) => collectDirFilterOptionSets(rows);

export const syncDirFilterStateWithRows = (state, rows) => {
    const source = normalizeDirFilterState(state);
    const allValues = collectDirFilterOptionSets(rows);
    const next = createEmptyDirFilterState();
    for (const field of DIR_FILTER_FIELDS) {
        for (const value of source[field]) {
            if (allValues[field].has(value)) next[field].add(value);
        }
    }
    return next;
};

export const isAllSelectedDirFilterState = (state, rows) => {
    const allValues = collectDirFilterOptionSets(rows);
    const current = normalizeDirFilterState(state);
    for (const field of DIR_FILTER_FIELDS) {
        if (current[field].size !== allValues[field].size) return false;
        for (const value of allValues[field]) {
            if (!current[field].has(value)) return false;
        }
    }
    return true;
};

export const doesDirFilterRowMatchState = (row, state, { ignoreField = '' } = {}) => {
    const filterRow = toDirFilterRow(row);
    const current = state || createEmptyDirFilterState();
    for (const field of DIR_FILTER_FIELDS) {
        if (ignoreField === field) continue;
        const selected = current[field];
        if (!(selected instanceof Set) || !selected.size) continue;
        const rowKey = DIR_FILTER_FIELD_TO_ROW_KEY[field];
        if (!selected.has(filterRow[rowKey])) return false;
    }
    return true;
};

export const filterRowsByDirFilterState = (rows, state, options = {}) => {
    const list = Array.isArray(rows) ? rows : [];
    return list.filter((row) => doesDirFilterRowMatchState(row, state, options));
};

export const getDirFilterRowsForFacet = ({ rows, state, ignoreField = '' } = {}) => (
    filterRowsByDirFilterState(rows, state, { ignoreField })
);

export const buildDirFilterFacetEntries = ({ rows, field, state }) => {
    const rowKey = DIR_FILTER_FIELD_TO_ROW_KEY[field];
    if (!rowKey) return [];

    const scopedRows = getDirFilterRowsForFacet({ rows, state, ignoreField: field });
    const sourceRows = scopedRows.length ? scopedRows : (Array.isArray(rows) ? rows : []);
    const counts = new Map();
    for (const row of sourceRows) {
        const value = toDirFilterRow(row)[rowKey];
        if (!value) continue;
        counts.set(value, (counts.get(value) || 0) + 1);
    }

    const selected = state?.[field] instanceof Set ? state[field] : new Set();
    for (const value of selected) {
        const text = defaultToText_panelDirFilterModel(value);
        if (!text || counts.has(text)) continue;
        counts.set(text, 0);
    }

    return Array.from(counts.entries())
        .map(([value, count]) => ({ value, count: Number(count) || 0 }))
        .sort((a, b) => {
            const countDelta = b.count - a.count;
            if (countDelta) return countDelta;
            return String(a.value).localeCompare(String(b.value));
        });
};

export const setDirFilterAllSelected = (rows, checked) => (
    checked ? createAllSelectedDirFilterState(rows) : createEmptyDirFilterState()
);

export const toggleDirFilterFieldValue = (state, { field, value, checked }) => {
    if (!DIR_FILTER_FIELDS.includes(field)) return normalizeDirFilterState(state);
    const text = defaultToText_panelDirFilterModel(value);
    if (!text) return normalizeDirFilterState(state);

    const next = normalizeDirFilterState(state);
    if (checked) next[field].add(text);
    else next[field].delete(text);
    return next;
};

// panelDirFilterPopoverController.js
const defaultToText_panelDirFilterPopoverController = (value) => String(value ?? '').trim();

export const createPanelDirFilterPopoverController = ({
    body,
    doc = globalThis.document,
    win = globalThis.window,
    toText = defaultToText_panelDirFilterPopoverController,
    escapeHtml = (value) => String(value ?? ''),
    stopEvent = (event) => event?.preventDefault?.(),
    stopPropagationOnly = (event) => event?.stopPropagation?.(),
    isLoopLine = () => false,
    makeLineDirKey = (lineId, dirKey) => `${toText(lineId)}||${toText(dirKey) || 'Unknown'}`,
    getRows = () => [],
    getState = () => null,
    setState = () => {},
    rerenderLineById = async () => {},
    applyDirPreviewByKey = () => {},
    clearPinnedDirPreview = () => {}
} = {}) => {
    const root = doc.createElement('div');
    root.className = 'panel-dir-filter-popover is-hidden';
    root.innerHTML = `
        <div class="panel-dir-filter-popover-head">
            <span class="panel-dir-filter-popover-title">筛选</span>
            <span class="panel-dir-filter-popover-head-actions">
                <label class="panel-dir-filter-toggle-all" data-dir-filter-toggle-all-wrap="1">
                    <input type="checkbox" data-dir-filter-toggle-all="1" checked />
                    <span>全选</span>
                </label>
                <button type="button" class="panel-dir-filter-popover-clear" data-dir-filter-clear="1" aria-label="清除筛选">清除筛选</button>
                <button type="button" class="panel-dir-filter-popover-close" data-dir-filter-close="1" aria-label="关闭">x</button>
            </span>
        </div>
        <div class="panel-dir-filter-popover-body" data-dir-filter-popover-body="1"></div>
    `;
    root.addEventListener('pointerdown', (event) => stopPropagationOnly(event), { passive: true });
    root.addEventListener('click', (event) => stopPropagationOnly(event), { passive: true });
    doc.body.appendChild(root);

    let activeKey = '';

    const isOpen = () => !root.classList.contains('is-hidden');
    const contains = (target) => !!(target && root.contains(target));
    const getActiveKey = () => activeKey;

    const close = ({ clearPreview = false } = {}) => {
        activeKey = '';
        root.classList.add('is-hidden');
        if (clearPreview) clearPinnedDirPreview();
    };

    const position = (anchorEl) => {
        const ElementCtor = win?.Element || globalThis.Element;
        if (!anchorEl || !(anchorEl instanceof ElementCtor)) return;
        const rect = anchorEl.getBoundingClientRect();
        const popRect = root.getBoundingClientRect();
        const popW = Math.max(360, Math.ceil(popRect.width || 360));
        const popH = Math.max(180, Math.ceil(popRect.height || 260));
        const viewportW = win.innerWidth || doc.documentElement.clientWidth || 0;
        const viewportH = win.innerHeight || doc.documentElement.clientHeight || 0;
        const gap = 8;

        let left = rect.right - popW;
        left = Math.max(8, Math.min(left, Math.max(8, viewportW - popW - 8)));

        const canShowAbove = rect.top - gap - popH >= 8;
        const top = canShowAbove
            ? rect.top - gap - popH
            : Math.min(viewportH - popH - 8, rect.bottom + gap);

        root.style.left = `${Math.round(left)}px`;
        root.style.top = `${Math.round(Math.max(8, top))}px`;
    };

    const buildColumnHtml = ({ title, field, entries, selected }) => {
        const items = Array.isArray(entries) ? entries : [];
        const rowsHtml = items.length
            ? items.map(({ value, count }) => {
                const checked = selected?.has?.(value) ? ' checked' : '';
                return `
                    <label class="panel-dir-filter-option">
                        <input type="checkbox" data-dir-filter-field="${escapeHtml(field)}" value="${escapeHtml(value)}"${checked} />
                        <span class="panel-dir-filter-option-name">${escapeHtml(value)}</span>
                        <span class="panel-dir-filter-option-count">（${escapeHtml(String(count))}）</span>
                    </label>
                `;
            }).join('')
            : '<div class="panel-dir-filter-empty">无可选项</div>';

        return `
            <div class="panel-dir-filter-col">
                <div class="panel-dir-filter-col-title">${escapeHtml(title)}</div>
                <div class="panel-dir-filter-col-body">${rowsHtml}</div>
            </div>
        `;
    };

    const renderBody = ({ rows, state }) => {
        const bodyEl = root.querySelector('[data-dir-filter-popover-body]');
        if (!bodyEl) return false;
        const originEntries = buildDirFilterFacetEntries({ rows, field: 'origins', state });
        const terminalEntries = buildDirFilterFacetEntries({ rows, field: 'terminals', state });
        const typeEntries = buildDirFilterFacetEntries({ rows, field: 'types', state });
        bodyEl.innerHTML = [
            buildColumnHtml({ title: '始发站', field: 'origins', entries: originEntries, selected: state.origins }),
            buildColumnHtml({ title: '终点站', field: 'terminals', entries: terminalEntries, selected: state.terminals }),
            buildColumnHtml({ title: '种别', field: 'types', entries: typeEntries, selected: state.types })
        ].join('');

        const toggleAllInput = root.querySelector('[data-dir-filter-toggle-all="1"]');
        if (toggleAllInput instanceof (win?.HTMLInputElement || globalThis.HTMLInputElement)) {
            toggleAllInput.checked = isAllSelectedDirFilterState(state, rows);
        }
        return true;
    };

    const updateInPlace = ({ rows, state }) => {
        const bodyEl = root.querySelector('[data-dir-filter-popover-body]');
        if (!bodyEl) return;
        for (const field of DIR_FILTER_FIELDS) {
            const entries = buildDirFilterFacetEntries({ rows, field, state });
            const countMap = new Map();
            for (const entry of entries) countMap.set(entry.value, entry.count);

            const checkboxes = bodyEl.querySelectorAll(`input[data-dir-filter-field="${field}"]`);
            for (const checkbox of checkboxes) {
                if (!(checkbox instanceof (win?.HTMLInputElement || globalThis.HTMLInputElement))) continue;
                const value = toText(checkbox.value);
                if (!value) continue;
                const label = checkbox.closest('.panel-dir-filter-option');
                const countSpan = label?.querySelector?.('.panel-dir-filter-option-count');
                if (countSpan) {
                    const newCount = countMap.get(value) ?? 0;
                    countSpan.textContent = `（${newCount}）`;
                }
                const selected = state?.[field];
                checkbox.checked = !!(selected instanceof Set && selected.size && selected.has(value));
            }
        }

        const toggleAllInput = root.querySelector('[data-dir-filter-toggle-all="1"]');
        if (toggleAllInput instanceof (win?.HTMLInputElement || globalThis.HTMLInputElement)) {
            toggleAllInput.checked = isAllSelectedDirFilterState(state, rows);
        }
    };

    const open = ({ lineId, dirKey, anchorEl }) => {
        if (isLoopLine(lineId)) return;

        const lineDirKey = makeLineDirKey(lineId, dirKey);
        const rows = getRows(lineDirKey) || [];
        let state = getState(lineDirKey);
        if (!state) {
            state = createEmptyDirFilterState();
            setState(lineDirKey, state);
        } else {
            state = syncDirFilterStateWithRows(state, rows);
            setState(lineDirKey, state);
        }

        if (!renderBody({ rows, state })) return;

        activeKey = lineDirKey;
        root.classList.remove('is-hidden');
        position(anchorEl);
        applyDirPreviewByKey(lineDirKey, { force: true });
    };

    const toggleFromButton = (buttonEl) => {
        const ElementCtor = win?.Element || globalThis.Element;
        if (!buttonEl || !(buttonEl instanceof ElementCtor)) return;
        const lineId = toText(buttonEl.getAttribute('data-line-id'));
        const dirKey = toText(buttonEl.getAttribute('data-dir-key'));
        if (!lineId || !dirKey) return;
        const lineDirKey = makeLineDirKey(lineId, dirKey);
        if (isOpen() && activeKey === lineDirKey) {
            close();
            return;
        }
        open({ lineId, dirKey, anchorEl: buttonEl });
    };

    const refreshAnchorPosition = () => {
        if (!isOpen() || !activeKey) return;
        const [lineId, dirKey] = activeKey.split('||');
        const anchorEl = body?.querySelector?.(`.panel-dir-filter-btn[data-line-id="${escapeHtml(String(lineId))}"][data-dir-key="${escapeHtml(String(dirKey))}"]`);
        if (anchorEl) position(anchorEl);
    };

    root.addEventListener('change', async (event) => {
        const target = event?.target;
        if (!(target instanceof (win?.HTMLInputElement || globalThis.HTMLInputElement))) return;
        if (target.type !== 'checkbox' || !activeKey) return;
        const [lineId] = activeKey.split('||');
        if (isLoopLine(lineId)) return;

        const rows = getRows(activeKey) || [];
        let state = getState(activeKey) || createEmptyDirFilterState();
        if (!getState(activeKey)) setState(activeKey, state);

        if (target.hasAttribute('data-dir-filter-toggle-all')) {
            state = setDirFilterAllSelected(rows, target.checked);
            setState(activeKey, state);
        } else {
            const field = toText(target.getAttribute('data-dir-filter-field'));
            const value = toText(target.value);
            if (!DIR_FILTER_FIELDS.includes(field) || !value) return;
            state = toggleDirFilterFieldValue(state, { field, value, checked: target.checked });
            setState(activeKey, state);
        }

        await rerenderLineById(lineId);
        const updatedRows = getRows(activeKey) || rows;
        updateInPlace({ rows: updatedRows, state });
        applyDirPreviewByKey(activeKey, { force: true });
        refreshAnchorPosition();
    });

    root.addEventListener('mouseenter', () => {
        if (!activeKey) return;
        applyDirPreviewByKey(activeKey, { force: true });
    });

    root.addEventListener('pointerdown', (event) => {
        const ElementCtor = win?.Element || globalThis.Element;
        if (!(event?.target instanceof ElementCtor) || !activeKey) return;
        applyDirPreviewByKey(activeKey, { force: true });
    }, { passive: true });

    root.addEventListener('click', async (event) => {
        const clearBtn = event?.target?.closest?.('[data-dir-filter-clear]');
        if (clearBtn) {
            stopEvent(event);
            if (!activeKey) return;
            const [lineId, dirKey] = activeKey.split('||');
            const state = createEmptyDirFilterState();
            setState(activeKey, state);
            await rerenderLineById(lineId);
            const anchorEl = body?.querySelector?.(`.panel-dir-filter-btn[data-line-id="${escapeHtml(String(lineId))}"][data-dir-key="${escapeHtml(String(dirKey))}"]`);
            if (anchorEl) open({ lineId, dirKey, anchorEl });
            else close();
            return;
        }

        const closeBtn = event?.target?.closest?.('[data-dir-filter-close]');
        if (!closeBtn) return;
        stopEvent(event);
        close();
    }, { passive: false });

    doc.addEventListener('pointerdown', (event) => {
        if (!isOpen()) return;
        const target = event?.target;
        const ElementCtor = win?.Element || globalThis.Element;
        if (target instanceof ElementCtor) {
            if (target.closest('.maplibregl-canvas-container, .maplibregl-canvas, .maplibregl-ctrl, #map')) return;
            if (target.closest('.panel-dir-filter-btn')) return;
        }
        if (contains(target)) return;
        close();
    }, true);

    doc.addEventListener('keydown', (event) => {
        if (event?.key !== 'Escape' || !isOpen()) return;
        close();
    });

    win?.addEventListener?.('resize', refreshAnchorPosition);

    return {
        close,
        contains,
        el: root,
        getActiveKey,
        isOpen,
        open,
        position,
        toggleFromButton
    };
};

// panelLineHeaderEnhancer.js
const defaultToText_panelLineHeaderEnhancer = (value) => String(value ?? '').trim();

const applyLineIconStyle_panelLineHeaderEnhancer = (icon, { marginRight = '4px' } = {}) => {
    if (!icon?.style) return;
    icon.style.marginRight = marginRight;
    icon.style.verticalAlign = 'middle';
};

const applyStationBadgeStyle_panelLineHeaderEnhancer = (badge) => {
    if (!badge?.style) return;
    badge.style.marginLeft = '0';
    badge.style.marginRight = '0';
    badge.style.verticalAlign = 'middle';
    badge.style.transform = 'none';
};

export const enhancePanelLineHeaderIcons = async (rootEl, {
    documentRef = globalThis.document,
    ElementRef = globalThis.Element,
    HTMLElementRef = globalThis.HTMLElement,
    throughServiceConfigs = THROUGH_SERVICE_CONFIGS,
    createLineIconElement = defaultCreateLineIconElement,
    createStationCodeBadgeElement = defaultCreateStationCodeBadgeElement,
    getResolvedRouteIconMeta = defaultGetResolvedRouteIconMeta,
    toText = defaultToText_panelLineHeaderEnhancer
} = {}) => {
    if (!ElementRef || !(rootEl instanceof ElementRef)) return;

    const names = rootEl.querySelectorAll?.('.panel-line-name') || [];
    for (const nameEl of names) {
        if (HTMLElementRef && !(nameEl instanceof HTMLElementRef)) continue;

        const lineEl = nameEl.closest?.('.panel-line');
        const lineId = toText(lineEl?.getAttribute?.('data-line-id'));
        if (!lineId) continue;

        const throughInfo = Array.isArray(throughServiceConfigs)
            ? throughServiceConfigs.find((item) => lineId === item?.tempId)
            : null;

        if (throughInfo && !nameEl.querySelector?.('.rw-line-icon')) {
            const fragment = documentRef?.createDocumentFragment?.();
            for (let index = 0; index < throughInfo.codes.length; index += 1) {
                const code = throughInfo.codes[index];
                const iconRouteId = throughInfo.routeIds[index];
                const icon = createLineIconElement?.({
                    routeId: iconRouteId,
                    code,
                    color: throughInfo.color
                });
                if (!icon) continue;
                applyLineIconStyle_panelLineHeaderEnhancer(icon, {
                    marginRight: index === throughInfo.codes.length - 1 ? '4px' : '3px'
                });
                fragment?.appendChild?.(icon);
            }
            if (fragment) nameEl.prepend?.(fragment);
            continue;
        }

        const meta = await getResolvedRouteIconMeta?.(lineId);
        if (!meta || (!meta.code && !meta.color)) continue;

        if (!nameEl.querySelector?.('.rw-line-icon')) {
            const icon = createLineIconElement?.({
                routeId: meta.id,
                code: meta.code,
                color: meta.color
            });
            if (icon) {
                applyLineIconStyle_panelLineHeaderEnhancer(icon);
                nameEl.prepend?.(icon);
            }
        }

        const stationInfoLeftEl = lineEl?.querySelector?.('.panel-station-info-left') || null;
        const suffixRowEl = lineEl?.querySelector?.('[data-line-suffix-row]') || null;
        const suffixInNameEl = nameEl.querySelector?.('.panel-line-name-suffix');

        if (suffixInNameEl) {
            if (suffixRowEl) suffixRowEl.appendChild?.(suffixInNameEl);
            else if (stationInfoLeftEl) stationInfoLeftEl.appendChild?.(suffixInNameEl);
        }

        const stationCode = toText(nameEl.getAttribute?.('data-transfer-station-code'));
        if (!stationCode) continue;

        const stationInfoHostEl = suffixRowEl || stationInfoLeftEl || nameEl;
        if (stationInfoHostEl?.querySelector?.('.rw-station-code-badge')) continue;

        const stationBadge = createStationCodeBadgeElement?.({
            code: stationCode,
            color: meta.color
        });
        if (!stationBadge) continue;

        applyStationBadgeStyle_panelLineHeaderEnhancer(stationBadge);

        const suffixEl = stationInfoHostEl.querySelector?.('.panel-line-name-suffix');
        if (suffixEl) {
            stationInfoHostEl.insertBefore?.(stationBadge, suffixEl);
            continue;
        }

        const mainEl = nameEl.querySelector?.('.panel-line-name-main');
        if (stationInfoHostEl !== nameEl) stationInfoHostEl.prepend?.(stationBadge);
        else if (mainEl && mainEl.nextSibling) nameEl.insertBefore?.(stationBadge, mainEl.nextSibling);
        else nameEl.appendChild?.(stationBadge);
    }
};

// panelMarqueeController.js
export const getPanelMarqueeKeyframes = ({ distancePx, holdMs, speedPxPerSec, minTravelMs }) => {
    const distance = Math.max(0, Number(distancePx) || 0);
    const hold = Math.max(0, Number(holdMs) || 0);
    const speed = Math.max(1, Number(speedPxPerSec) || 1);
    const minTravel = Math.max(0, Number(minTravelMs) || 0);
    const travelMs = Math.max(minTravel, Math.round((distance / speed) * 1000));
    const totalMs = hold + travelMs + hold + hold;
    const startHoldOffset = totalMs ? hold / totalMs : 0;
    const endMoveOffset = totalMs ? (hold + travelMs) / totalMs : 0;
    const endHoldOffset = totalMs ? (hold + travelMs + hold) / totalMs : 0;
    const resetOffset = Math.min(0.999, endHoldOffset + 0.001);

    return {
        duration: totalMs,
        keyframes: [
            { transform: 'translateX(0px)', offset: 0 },
            { transform: 'translateX(0px)', offset: startHoldOffset },
            { transform: `translateX(${-distance}px)`, offset: endMoveOffset },
            { transform: `translateX(${-distance}px)`, offset: endHoldOffset },
            { transform: 'translateX(0px)', offset: resetOffset },
            { transform: 'translateX(0px)', offset: 1 }
        ]
    };
};

export const createPanelMarqueeController = ({
    win = globalThis.window,
    maxAnimations = 30
} = {}) => {
    const getElementCtor = () => win?.Element || globalThis.Element;
    const isElement = (value) => {
        const ElementCtor = getElementCtor();
        return !!(ElementCtor && value instanceof ElementCtor);
    };
    const canAnimate = (innerEl) => typeof innerEl?.animate === 'function';
    const getRectWidth = (el) => {
        try {
            const rect = el?.getBoundingClientRect?.();
            const width = Number(rect?.width);
            return Number.isFinite(width) && width > 0 ? width : 0;
        } catch {
            return 0;
        }
    };
    const getWidth = (...values) => {
        for (const value of values) {
            const width = Number(value);
            if (Number.isFinite(width) && width > 0) return width;
        }
        return 0;
    };
    const measureMarquee = (marqueeEl, innerEl) => {
        const viewportW = getWidth(
            marqueeEl?.clientWidth,
            marqueeEl?.offsetWidth,
            getRectWidth(marqueeEl)
        );
        const contentW = getWidth(
            innerEl?.scrollWidth,
            innerEl?.offsetWidth,
            getRectWidth(innerEl)
        );
        return { viewportW, contentW };
    };
    const isReducedMotion = () => !!win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    const applyMarqueeAnimation = ({
        marqueeEl,
        innerEl,
        viewportW,
        contentW,
        holdMs,
        speedPxPerSec,
        minTravelMs
    }) => {
        if (!marqueeEl || !innerEl) return false;
        try {
            marqueeEl.__panelMarqueeAnim?.cancel?.();
        } catch {
            // ignore
        }

        innerEl.style.transform = '';
        marqueeEl.__panelMarqueeAnim = null;

        if (!canAnimate(innerEl)) return false;
        if (!viewportW || contentW <= viewportW + 1) return false;
        const distancePx = Math.max(0, contentW - viewportW);
        if (!distancePx) return false;

        const { keyframes, duration } = getPanelMarqueeKeyframes({
            distancePx,
            holdMs,
            speedPxPerSec,
            minTravelMs
        });
        const anim = innerEl.animate(keyframes, {
            duration,
            iterations: Infinity,
            easing: 'linear'
        });
        marqueeEl.__panelMarqueeAnim = anim;
        return true;
    };

    const applyDirHeaderMarquees = (rootEl, maxAnims = Number.POSITIVE_INFINITY) => {
        try {
            if (!isElement(rootEl)) return 0;

            const marquees = Array.from(rootEl.querySelectorAll('.panel-dir-marquee'));
            let started = 0;
            for (const marqueeEl of marquees) {
                if (started >= maxAnims) break;
                const innerEl = marqueeEl.querySelector('.panel-dir-marquee-inner');
                const measurement = measureMarquee(marqueeEl, innerEl);
                const didStart = applyMarqueeAnimation({
                    marqueeEl,
                    innerEl,
                    viewportW: measurement.viewportW,
                    contentW: measurement.contentW,
                    holdMs: 2000,
                    speedPxPerSec: 35,
                    minTravelMs: 1500
                });
                if (didStart) started += 1;
            }
            return started;
        } catch {
            return 0;
        }
    };

    const applyTimetableDestMarquees = (rootEl, maxAnims = maxAnimations) => {
        try {
            if (!isElement(rootEl)) return 0;

            const reducedMotion = isReducedMotion();
            const marquees = Array.from(rootEl.querySelectorAll('.panel-timetable-dest-marquee, .panel-timetable-type-marquee'));
            const candidates = [];
            for (const marqueeEl of marquees) {
                const isDestMarquee = marqueeEl.classList?.contains?.('panel-timetable-dest-marquee');
                if (!isDestMarquee && reducedMotion) continue;

                const innerEl = marqueeEl.querySelector('.panel-timetable-dest-marquee-inner, .panel-timetable-type-marquee-inner');
                if (!innerEl) continue;

                try {
                    marqueeEl.__panelMarqueeAnim?.cancel?.();
                } catch {
                    // ignore
                }
                innerEl.style.transform = '';
                marqueeEl.__panelMarqueeAnim = null;

                if (!canAnimate(innerEl)) continue;
                const { viewportW, contentW } = measureMarquee(marqueeEl, innerEl);
                if (!viewportW || contentW <= viewportW + 1) continue;

                const rowEl = marqueeEl.closest?.('.panel-timetable-row');
                const containerEl = marqueeEl.closest?.('.panel-timetable');
                let score = 1e9;
                if (rowEl && containerEl) {
                    const rowRect = rowEl.getBoundingClientRect?.();
                    const containerRect = containerEl.getBoundingClientRect?.();
                    if (rowRect && containerRect) {
                        const visible = rowRect.bottom > containerRect.top && rowRect.top < containerRect.bottom;
                        if (visible) score = 0;
                        else score = Math.min(Math.abs(rowRect.top - containerRect.bottom), Math.abs(rowRect.bottom - containerRect.top));
                    }
                }
                candidates.push({
                    marqueeEl,
                    innerEl,
                    viewportW,
                    contentW,
                    score,
                    holdMs: 2000,
                    speedPxPerSec: isDestMarquee ? 35 : 30,
                    minTravelMs: isDestMarquee ? 1500 : 1200
                });
            }

            candidates.sort((a, b) => a.score - b.score);

            let started = 0;
            for (const candidate of candidates) {
                if (started >= maxAnims) break;
                const didStart = applyMarqueeAnimation({
                    ...candidate
                });
                if (didStart) started += 1;
            }
            return started;
        } catch {
            return 0;
        }
    };

    const hookTimetableScrollMarquee = (rootEl) => {
        try {
            if (!isElement(rootEl)) return;
            const raf = win?.requestAnimationFrame;
            if (typeof raf !== 'function') return;

            const bodies = Array.from(rootEl.querySelectorAll('.panel-timetable.is-expanded'));
            for (const bodyEl of bodies) {
                if (bodyEl.__panelDestMarqueeHooked) continue;
                bodyEl.__panelDestMarqueeHooked = true;

                let pending = false;
                bodyEl.addEventListener('scroll', () => {
                    if (pending) return;
                    pending = true;
                    raf(() => {
                        pending = false;
                        const used = applyDirHeaderMarquees(bodyEl, maxAnimations);
                        const remain = Math.max(0, maxAnimations - used);
                        applyTimetableDestMarquees(bodyEl, remain);
                    });
                }, { passive: true });
            }
        } catch {
            // ignore
        }
    };

    const schedule = (rootEl) => {
        try {
            if (!isElement(rootEl)) return;
            const raf = win?.requestAnimationFrame;
            if (typeof raf !== 'function') return;

            if (rootEl.__panelMarqueeRafId) {
                try {
                    win?.cancelAnimationFrame?.(rootEl.__panelMarqueeRafId);
                } catch {
                    // ignore
                }
                rootEl.__panelMarqueeRafId = 0;
            }

            rootEl.__panelMarqueeRafId = raf(() => {
                rootEl.__panelMarqueeRafId = raf(() => {
                    rootEl.__panelMarqueeRafId = 0;
                    const used = applyDirHeaderMarquees(rootEl, maxAnimations);
                    const remain = Math.max(0, maxAnimations - used);
                    applyTimetableDestMarquees(rootEl, remain);
                    hookTimetableScrollMarquee(rootEl);
                });
            });
        } catch {
            // ignore
        }
    };

    return {
        applyDirHeaderMarquees,
        applyTimetableDestMarquees,
        hookTimetableScrollMarquee,
        schedule
    };
};

// panelScrollRuntime.js
const defaultToText_panelScrollRuntime = (value) => String(value ?? '').trim();

export const createPanelScrollRuntime = ({
    body,
    toText = defaultToText_panelScrollRuntime,
    setTimeoutFn = globalThis.setTimeout,
    syncActiveTitle = () => {}
} = {}) => {
    const scrollToLineId = (lineId, options = {}) => {
        const id = toText(lineId);
        if (!id) return false;

        const behavior = options?.behavior === 'auto' ? 'auto' : 'smooth';
        const block = options?.block === 'center' ? 'center' : 'start';

        const findLineEl = () => {
            const all = body?.querySelectorAll?.('[data-line-id]') || [];
            for (const el of all) {
                if (!el?.getAttribute) continue;
                if (toText(el.getAttribute('data-line-id')) === id) return el;
            }
            return null;
        };

        const applyScroll = (lineEl) => {
            if (!lineEl?.getBoundingClientRect || !body?.getBoundingClientRect) return false;
            const bodyRect = body.getBoundingClientRect();
            const lineRect = lineEl.getBoundingClientRect();
            const bodyHeight = Math.max(0, Number(body.clientHeight) || 0);
            const lineHeight = Math.max(0, Number(lineRect.height) || 0);
            const naturalTop = (Number(body.scrollTop) || 0) + (Number(lineRect.top) - Number(bodyRect.top));
            const top = block === 'center'
                ? Math.max(0, naturalTop - Math.max(0, (bodyHeight / 2) - (lineHeight / 2)))
                : Math.max(0, naturalTop);

            try {
                body.scrollTo?.({ top, behavior });
            } catch {
                body.scrollTop = top;
            }
            return true;
        };

        const immediate = findLineEl();
        if (immediate && applyScroll(immediate)) return true;

        setTimeoutFn?.(() => {
            const retry = findLineEl();
            if (retry) applyScroll(retry);
        }, 120);
        return false;
    };

    const getScrollTop = () => {
        try {
            return Math.max(0, Number(body?.scrollTop) || 0);
        } catch {
            return 0;
        }
    };

    const setScrollTop = (top, options = {}) => {
        const next = Math.max(0, Number(top) || 0);
        const behavior = options?.behavior === 'smooth' ? 'smooth' : 'auto';
        try {
            body?.scrollTo?.({ top: next, behavior });
            return true;
        } catch {
            body.scrollTop = next;
            return true;
        }
    };

    const syncPanelTitleForActiveLine = (activeLineId = '') => {
        syncActiveTitle(activeLineId);
    };

    return {
        getScrollTop,
        scrollToLineId,
        setScrollTop,
        syncPanelTitleForActiveLine
    };
};

