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

// View only: station resolution, request lifecycle and history stay in the interaction feature.
export const createSearchHeatmapFormView = ({ interaction, onClose } = {}) => {
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
    const list = make('ul', 'search-heatmap-results-list');
    list.id = 'search-heatmap-station-options';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', '热力图站点候选');
    const message = make('div', 'search-heatmap-message');
    message.setAttribute('role', 'status');
    results.append(message, list);
    form.append(card, submitButton, results);

    const send = (type, payload) => interaction.dispatch({ type, payload });
    const picker = bindMinutePicker({
        anchor: timeWrap,
        title: '出行时长',
        options: [15, 30, 45, 60, 90, 120],
        getValue: () => interaction.getState().minutes,
        onConfirm: (minutes) => send('minutes', minutes)
    });
    const render = (state) => {
        const loading = state.status === 'loading';
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
        stationInput.setAttribute('aria-expanded', String(state.suggestionsVisible));
        results.hidden = !state.visible || (!state.suggestionsVisible && !state.error);
        message.textContent = state.error || (state.suggestionsVisible ? (state.text.trim() ? (state.items.length ? '' : '暂无结果') : '搜索记录') : '');
        message.hidden = !message.textContent;
        list.replaceChildren();
        for (const item of state.items) {
            const li = make('li', '');
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
        destroy() {
            unsubscribe();
            picker.destroy();
            document.removeEventListener('pointerdown', onOutsidePress, true);
            form.remove();
        }
    };
};
