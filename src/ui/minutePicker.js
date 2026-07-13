const clampMinutes = (value) => Math.max(0, Math.min(120, Math.round(Number(value) || 0)));

export const bindMinutePicker = ({
    anchor,
    getValue,
    onConfirm,
    options = [],
    title = '时间'
} = {}) => {
    if (!(anchor instanceof HTMLElement)) {
        throw new Error('bindMinutePicker requires an anchor element');
    }

    const pickerRoot = document.createElement('div');
    pickerRoot.className = 'settings-time-picker journey-wait-picker search-heatmap-picker is-hidden';
    pickerRoot.style.position = 'fixed';
    pickerRoot.style.zIndex = '10020';

    const titleNode = document.createElement('div');
    titleNode.className = 'journey-wait-picker-title';
    titleNode.textContent = title;

    const col = document.createElement('div');
    col.className = 'settings-time-picker-col journey-wait-picker-col';
    const list = document.createElement('div');
    list.className = 'settings-time-picker-list journey-wait-picker-list';
    col.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'settings-time-picker-actions journey-wait-picker-actions';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'settings-time-picker-btn settings-time-picker-btn-cancel';
    cancelButton.textContent = '取消';
    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'settings-time-picker-btn settings-time-picker-btn-confirm';
    confirmButton.textContent = '确认';
    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);

    const state = {
        minutes: clampMinutes(getValue?.()),
        open: false,
        optionButtons: []
    };

    const applySelection = () => {
        for (const button of state.optionButtons) {
            button.classList.toggle('is-selected', Number(button.dataset.value) === state.minutes);
        }
    };

    const scrollSelectionIntoView = () => {
        const selected = state.optionButtons.find((button) => Number(button.dataset.value) === state.minutes);
        selected?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    };

    const position = () => {
        if (!state.open) return;
        const rect = anchor.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const pickerRect = pickerRoot.getBoundingClientRect();
        const pickerWidth = Math.max(120, Math.ceil(pickerRect.width || 120));
        const pickerHeight = Math.max(150, Math.ceil(pickerRect.height || 230));
        const gap = 6;
        let left = rect.left + (rect.width / 2) - (pickerWidth / 2);
        left = Math.max(8, Math.min(left, Math.max(8, viewportWidth - pickerWidth - 8)));
        const canShowBelow = rect.bottom + gap + pickerHeight <= viewportHeight - 8;
        const top = canShowBelow
            ? Math.min(viewportHeight - pickerHeight - 8, rect.bottom + gap)
            : Math.max(8, rect.top - gap - pickerHeight);
        pickerRoot.style.left = `${Math.round(left)}px`;
        pickerRoot.style.top = `${Math.round(top)}px`;
    };

    const close = () => {
        if (!state.open) return;
        state.open = false;
        pickerRoot.classList.add('is-hidden');
        anchor.setAttribute('aria-expanded', 'false');
    };

    const open = () => {
        state.minutes = clampMinutes(getValue?.());
        applySelection();
        pickerRoot.classList.remove('is-hidden');
        state.open = true;
        anchor.setAttribute('aria-expanded', 'true');
        scrollSelectionIntoView();
        position();
    };

    const commit = () => {
        const minutes = state.minutes;
        close();
        onConfirm?.(minutes);
    };

    for (const value of options) {
        const minutes = clampMinutes(value);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'settings-time-picker-option journey-wait-picker-option';
        button.textContent = `${minutes}分`;
        button.dataset.value = String(minutes);
        button.addEventListener('click', (event) => {
            event.preventDefault?.();
            event.stopPropagation?.();
            state.minutes = minutes;
            applySelection();
            scrollSelectionIntoView();
        }, { passive: false });
        state.optionButtons.push(button);
        list.appendChild(button);
    }

    pickerRoot.appendChild(titleNode);
    pickerRoot.appendChild(col);
    pickerRoot.appendChild(actions);
    document.body.appendChild(pickerRoot);
    applySelection();

    const onAnchorPointerDown = (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
    };
    const onAnchorClick = (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        if (state.open) close();
        else open();
    };
    const onDocumentPointerDown = (event) => {
        if (!state.open) return;
        const target = event?.target;
        if (target && (anchor.contains(target) || pickerRoot.contains(target))) return;
        close();
    };
    const onDocumentKeyDown = (event) => {
        if (!state.open) return;
        if (event?.key === 'Escape') close();
        if (event?.key === 'Enter') commit();
    };

    anchor.addEventListener('pointerdown', onAnchorPointerDown);
    anchor.addEventListener('click', onAnchorClick, { passive: false });
    pickerRoot.addEventListener('pointerdown', (event) => event.stopPropagation?.(), { passive: true });
    pickerRoot.addEventListener('wheel', (event) => event.stopPropagation?.(), { passive: true });
    pickerRoot.addEventListener('click', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
    }, { passive: false });
    cancelButton.addEventListener('click', close);
    confirmButton.addEventListener('click', commit);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('keydown', onDocumentKeyDown);

    return Object.freeze({
        close,
        destroy: () => {
            close();
            anchor.removeEventListener('pointerdown', onAnchorPointerDown);
            anchor.removeEventListener('click', onAnchorClick);
            window.removeEventListener('resize', position);
            window.removeEventListener('scroll', position, true);
            document.removeEventListener('pointerdown', onDocumentPointerDown, true);
            document.removeEventListener('keydown', onDocumentKeyDown);
            pickerRoot.remove();
        },
        open
    });
};
