import {
    DIR_FILTER_FIELDS,
    buildDirFilterFacetEntries,
    createEmptyDirFilterState,
    isAllSelectedDirFilterState,
    setDirFilterAllSelected,
    syncDirFilterStateWithRows,
    toggleDirFilterFieldValue
} from './panelDirFilterModel.js';

const defaultToText = (value) => String(value ?? '').trim();

export const createPanelDirFilterPopoverController = ({
    body,
    doc = globalThis.document,
    win = globalThis.window,
    toText = defaultToText,
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
