import { getIconCandidates, setImageElementFromCache } from '../lib/fetch.js';
import { bindMinutePicker } from './minutePicker.js';

const make = (tag, className, text = '') => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
};

const iconButton = (className, label, icon) => {
    const button = make('button', className);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    const image = make('img', 'search-heatmap-control-icon');
    image.alt = '';
    setImageElementFromCache(image, getIconCandidates(icon), { cacheKey: `icon:${icon}` }).catch(() => {});
    button.appendChild(image);
    return button;
};

const createDefaultHistoryItemView = (item) => {
    const row = make('div', 'search-result-item');
    const icon = make('span', 'search-result-icon');
    if (item?.id) {
        const dot = make('span', 'search-result-icon--station');
        const isTransfer = item?.isTransfer === true;
        dot.style.width = `${isTransfer ? 18 : 12}px`;
        dot.style.height = `${isTransfer ? 18 : 12}px`;
        dot.style.borderWidth = `${isTransfer ? 4 : 0.5}px`;
        icon.appendChild(dot);
    }
    const text = make('div', 'search-result-text search-result-text--station journey-station-result-text');
    text.appendChild(make('span', 'journey-station-result-name', item?.text ?? ''));
    row.append(icon, text);
    return row;
};

const createHistoryFavoriteButton = (item, onToggle) => {
    const favorite = item?.favorite === true;
    const button = make('button', 'search-history-favorite', favorite ? '★' : '☆');
    button.type = 'button';
    button.setAttribute('aria-label', favorite ? '取消收藏' : '收藏');
    button.style.marginLeft = '8px';
    button.style.background = 'transparent';
    button.style.border = 'none';
    button.style.padding = '0 2px';
    button.style.cursor = 'pointer';
    button.style.color = favorite ? '#f5a400' : 'inherit';
    button.style.fontSize = '16px';
    button.style.lineHeight = '1';
    button.style.opacity = favorite ? '1' : '0.6';
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle?.(item);
    });
    return button;
};

const createHistoryDeleteButton = (item, onDelete) => {
    const button = make('button', 'search-heatmap-history-delete');
    button.type = 'button';
    button.setAttribute('aria-label', '删除记录');
    const icon = make('img', 'search-heatmap-history-delete-icon');
    icon.alt = '';
    setImageElementFromCache(icon, getIconCandidates('x.svg'), { cacheKey: 'icon:x.svg' })
        .catch(() => { button.textContent = 'x'; });
    button.appendChild(icon);
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onDelete?.(item);
    });
    return button;
};

// View only: station resolution, request lifecycle and history stay in the interaction feature.
export const createSearchHeatmapFormView = ({ interaction, historyView = {}, onClose } = {}) => {
    const form = make('form', 'search-heatmap-form');
    form.setAttribute('aria-label', '出行热图');
    form.hidden = true;
    const card = make('div', 'search-heatmap-card');
    const stationRow = make('div', 'search-heatmap-row');
    const stationWrap = make('div', 'search-heatmap-input-wrap');
    const stationInput = make('input', 'search-heatmap-input search-heatmap-station-input');
    stationInput.type = 'text';
    stationInput.autocomplete = 'off';
    stationInput.spellcheck = false;
    stationInput.placeholder = '选择站点';
    stationInput.setAttribute('role', 'searchbox');
    stationInput.setAttribute('aria-label', '热力图站点');
    stationInput.setAttribute('aria-controls', 'search-heatmap-station-options');
    stationWrap.appendChild(stationInput);
    const mapPickButton = iconButton('search-heatmap-map-pick', '地图选择热力图站点', 'map-select.svg');
    const collapseButton = make('button', 'search-heatmap-collapse', '−');
    collapseButton.type = 'button';
    collapseButton.setAttribute('aria-label', '收起出行热图');
    stationRow.append(stationWrap, mapPickButton, collapseButton);

    const timeRow = make('div', 'search-heatmap-row');
    const timeWrap = make('div', 'search-heatmap-input-wrap search-heatmap-time-wrap');
    const timeInput = make('input', 'search-heatmap-input search-heatmap-time-input');
    timeInput.type = 'text';
    timeInput.readOnly = true;
    timeInput.inputMode = 'none';
    timeInput.placeholder = '请选择出行时长';
    timeInput.setAttribute('aria-label', '出行时长（分钟）');
    timeWrap.setAttribute('aria-haspopup', 'dialog');
    timeWrap.appendChild(timeInput);
    timeRow.appendChild(timeWrap);
    card.append(stationRow, timeRow);

    const submitButton = iconButton('search-heatmap-submit', '搜索出行热图', 'search.svg');
    submitButton.type = 'submit';
    submitButton.firstChild.className = 'search-heatmap-submit-icon';
    const spinner = make('span', 'search-heatmap-spinner');
    spinner.setAttribute('aria-hidden', 'true');
    submitButton.appendChild(spinner);
    const results = make('div', 'search-heatmap-results');
    results.hidden = true;
    const list = make('ul', 'search-heatmap-results-list search-results-list');
    list.id = 'search-heatmap-station-options';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', '热力图站点候选');
    const message = make('li', 'search-empty search-heatmap-message');
    message.setAttribute('role', 'status');
    results.appendChild(list);
    form.append(card, submitButton, results);

    const send = (type, payload) => interaction.dispatch({ type, payload });
    const picker = bindMinutePicker({
        anchor: timeWrap,
        title: '出行时长',
        options: [15, 30, 45, 60, 90, 120],
        getValue: () => interaction.getState().minutes,
        onConfirm: (minutes) => send('minutes', minutes)
    });
    const rerenderHistory = async (action, item) => {
        try {
            await action?.(item);
        } catch {
            // History persistence is best effort, matching the existing route planner.
        }
        try { await send('suggest'); } catch {}
    };
    const render = (state) => {
        const loading = state.status === 'loading';
        const historyMode = state.suggestionsVisible && !state.text.trim() && !state.error;
        const resultsVisible = state.visible && Boolean(
            state.error || (state.suggestionsVisible && (!historyMode || state.items.length > 0))
        );
        form.hidden = !state.visible;
        if (stationInput.value !== state.text) stationInput.value = state.text;
        stationInput.disabled = loading;
        timeInput.value = state.minutes > 0 ? String(state.minutes) : '';
        timeInput.disabled = loading;
        timeWrap.classList.toggle('is-disabled', loading);
        mapPickButton.disabled = loading;
        mapPickButton.classList.toggle('is-active', state.picking);
        mapPickButton.setAttribute('aria-pressed', String(state.picking));
        submitButton.disabled = loading || !state.text.trim() || state.minutes <= 0;
        submitButton.classList.toggle('is-ready', !submitButton.disabled);
        submitButton.classList.toggle('is-loading', loading);
        submitButton.setAttribute('aria-busy', String(loading));
        submitButton.setAttribute('aria-label', loading ? '正在搜索出行热图' : '搜索出行热图');
        stationInput.setAttribute('aria-expanded', String(resultsVisible));
        results.hidden = !resultsVisible;
        list.replaceChildren();
        const messageText = state.error
            || (state.suggestionsVisible && !historyMode && !state.items.length ? '暂无结果' : '');
        if (messageText) {
            message.textContent = messageText;
            list.appendChild(message);
        }
        if (historyMode && state.items.length) {
            const headingItem = make('li', '');
            const heading = make('div', 'search-empty', '搜索记录');
            heading.style.fontSize = '12px';
            heading.style.fontWeight = '600';
            heading.style.paddingTop = '8px';
            heading.style.paddingBottom = '8px';
            headingItem.appendChild(heading);
            list.appendChild(headingItem);
        }
        for (const item of state.items) {
            const li = make('li', '');
            if (historyMode) {
                let row = null;
                try { row = historyView.createItem?.(item) || null; } catch {}
                if (!row) row = createDefaultHistoryItemView(item);
                row.setAttribute('role', 'option');
                row.querySelector?.('.search-result-text')?.style?.setProperty('flex', '1 1 auto');
                if (typeof historyView.onToggleFavorite === 'function') {
                    row.appendChild(createHistoryFavoriteButton(
                        item,
                        () => rerenderHistory(historyView.onToggleFavorite, item)
                    ));
                }
                if (typeof historyView.onDelete === 'function') {
                    row.appendChild(createHistoryDeleteButton(
                        item,
                        () => rerenderHistory(historyView.onDelete, item)
                    ));
                }
                row.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    send('selectStation', item);
                    stationInput.blur();
                });
                li.appendChild(row);
                list.appendChild(li);
                continue;
            }
            const option = make('button', 'search-heatmap-result', item.text);
            option.type = 'button';
            option.setAttribute('role', 'option');
            option.addEventListener('click', () => {
                send('selectStation', item);
                stationInput.blur();
            });
            li.appendChild(option);
            list.appendChild(li);
        }
        if (historyMode && state.items.length && typeof historyView.onClear === 'function') {
            const footerItem = make('li', '');
            const footer = make('div', 'search-empty search-heatmap-history-footer');
            const clearButton = make('button', 'search-heatmap-history-clear', '删除所有记录');
            clearButton.type = 'button';
            clearButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                rerenderHistory(historyView.onClear);
            });
            footer.appendChild(clearButton);
            footerItem.appendChild(footer);
            list.appendChild(footerItem);
        }
        if (historyMode && state.items.length) {
            window.requestAnimationFrame(() => {
                try { historyView.onRendered?.(list); } catch {}
            });
        }
        if (!state.visible || loading) picker.close();
    };
    let composing = false;
    stationInput.addEventListener('compositionstart', () => { composing = true; });
    stationInput.addEventListener('compositionend', () => { composing = false; send('text', stationInput.value); });
    stationInput.addEventListener('input', () => { if (!composing) send('text', stationInput.value); });
    stationInput.addEventListener('focus', () => send('suggest'));
    timeWrap.addEventListener('pointerdown', () => send('hideSuggestions'));
    timeInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (timeWrap.getAttribute('aria-expanded') === 'true') return;
        event.preventDefault();
        event.stopPropagation();
        picker.open();
    });
    form.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && timeWrap.getAttribute('aria-expanded') === 'true') {
            // Let the existing picker confirm, but do not also submit its surrounding form.
            event.preventDefault();
        }
    }, true);
    mapPickButton.addEventListener('click', () => { picker.close(); stationInput.blur(); send('togglePick'); });
    collapseButton.addEventListener('click', onClose);
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (composing) return;
        stationInput.blur();
        picker.close();
        send('submit');
    });
    form.addEventListener('pointerdown', (event) => event.stopPropagation());
    form.addEventListener('click', (event) => event.stopPropagation());
    const onOutsidePress = (event) => {
        if (!form.contains(event.target)) send('hideSuggestions');
    };
    document.addEventListener('pointerdown', onOutsidePress, true);
    const unsubscribe = interaction.subscribe(render);
    render(interaction.getState());
    return {
        form,
        closePicker: picker.close,
        focusStationInput() {
            try {
                stationInput.focus({ preventScroll: true });
            } catch {
                stationInput.focus();
            }
        },
        destroy() {
            unsubscribe();
            picker.destroy();
            document.removeEventListener('pointerdown', onOutsidePress, true);
            form.remove();
        }
    };
};
