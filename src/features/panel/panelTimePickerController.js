const defaultToText = (value) => String(value ?? '').trim();

export const formatTimePickerTwoDigits = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '00';
    return String(number).padStart(2, '0');
};

export const normalizeTimePickerHHMM = (value, { toText = defaultToText } = {}) => {
    const source = toText(value);
    const match = source.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return '';

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
    return `${formatTimePickerTwoDigits(hour)}:${formatTimePickerTwoDigits(minute)}`;
};

export const parseTimePickerSeed = (value, { now = new Date(), toText = defaultToText } = {}) => {
    const normalized = normalizeTimePickerHHMM(value, { toText });
    if (normalized) {
        const [hour, minute] = normalized.split(':').map((part) => Number(part));
        return { hour, minute };
    }

    return {
        hour: now instanceof Date && !Number.isNaN(now.getTime()) ? now.getHours() : 0,
        minute: now instanceof Date && !Number.isNaN(now.getTime()) ? now.getMinutes() : 0
    };
};

const createEvent = (doc, type, init) => {
    const EventCtor = doc?.defaultView?.Event || globalThis.Event;
    return new EventCtor(type, init);
};

export const createPanelTimePickerController = ({
    timeInput,
    timeOps,
    zIndex = 0,
    doc = globalThis.document,
    win = globalThis.window,
    stopEvent = (event) => event?.preventDefault?.(),
    stopPropagationOnly = (event) => event?.stopPropagation?.(),
    setOpenState = () => {}
} = {}) => {
    const pickerRoot = doc.createElement('div');
    pickerRoot.className = 'settings-time-picker is-hidden';
    pickerRoot.style.position = 'fixed';
    pickerRoot.style.zIndex = String(zIndex + 3);

    const hourCol = doc.createElement('div');
    hourCol.className = 'settings-time-picker-col';
    const hourList = doc.createElement('div');
    hourList.className = 'settings-time-picker-list';
    hourCol.appendChild(hourList);

    const minuteCol = doc.createElement('div');
    minuteCol.className = 'settings-time-picker-col';
    const minuteList = doc.createElement('div');
    minuteList.className = 'settings-time-picker-list';
    minuteCol.appendChild(minuteList);

    const state = {
        open: false,
        hour: null,
        minute: null,
        hourButtons: [],
        minuteButtons: []
    };

    const applySelectionUi = () => {
        for (const button of state.hourButtons) {
            const selected = Number(button?.dataset?.value) === state.hour;
            button.classList.toggle('is-selected', selected);
        }
        for (const button of state.minuteButtons) {
            const selected = Number(button?.dataset?.value) === state.minute;
            button.classList.toggle('is-selected', selected);
        }
    };

    const scrollSelectionIntoView = () => {
        const hourButton = state.hourButtons.find((button) => Number(button?.dataset?.value) === state.hour);
        const minuteButton = state.minuteButtons.find((button) => Number(button?.dataset?.value) === state.minute);
        hourButton?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        minuteButton?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    };

    const applyValueToInput = () => {
        if (!Number.isFinite(state.hour) || !Number.isFinite(state.minute)) return;
        const value = `${formatTimePickerTwoDigits(state.hour)}:${formatTimePickerTwoDigits(state.minute)}`;
        if (defaultToText(timeInput.value) !== value) {
            timeInput.value = value;
            timeInput.dispatchEvent(createEvent(doc, 'input', { bubbles: true }));
        }
    };

    const position = () => {
        if (!state.open) return;
        const rect = timeInput.getBoundingClientRect();
        const viewportW = win.innerWidth || doc.documentElement.clientWidth || 0;
        const viewportH = win.innerHeight || doc.documentElement.clientHeight || 0;
        const pickerRect = pickerRoot.getBoundingClientRect();
        const pickerW = Math.max(168, Math.ceil(pickerRect.width || 168));
        const pickerH = Math.max(120, Math.ceil(pickerRect.height || 196));
        const gap = 6;

        let left = rect.right - pickerW;
        left = Math.max(8, Math.min(left, Math.max(8, viewportW - pickerW - 8)));

        const canShowBelow = rect.bottom + gap + pickerH <= viewportH - 8;
        const top = canShowBelow
            ? Math.min(viewportH - pickerH - 8, rect.bottom + gap)
            : Math.max(8, rect.top - gap - pickerH);

        pickerRoot.style.left = `${Math.round(left)}px`;
        pickerRoot.style.top = `${Math.round(top)}px`;
    };

    const close = () => {
        if (!state.open) return;
        state.open = false;
        pickerRoot.classList.add('is-hidden');
        setOpenState(false);
    };

    const open = () => {
        const seed = parseTimePickerSeed(timeInput.value);
        state.hour = seed.hour;
        state.minute = seed.minute;
        applySelectionUi();
        pickerRoot.classList.remove('is-hidden');
        state.open = true;
        setOpenState(true);
        scrollSelectionIntoView();
        position();
    };

    const confirm = () => {
        applyValueToInput();
        close();
    };

    const buildOptionButton = (value, type) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'settings-time-picker-option';
        button.textContent = formatTimePickerTwoDigits(value);
        button.dataset.value = String(value);
        button.dataset.type = type;
        button.addEventListener('click', (event) => {
            stopEvent(event);
            if (type === 'hour') state.hour = value;
            else state.minute = value;
            applySelectionUi();
            scrollSelectionIntoView();
        }, { passive: false });
        return button;
    };

    const actions = doc.createElement('div');
    actions.className = 'settings-time-picker-actions';

    const cancelButton = doc.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'settings-time-picker-btn settings-time-picker-btn-cancel';
    cancelButton.textContent = '取消';
    cancelButton.addEventListener('click', (event) => {
        stopEvent(event);
        close();
    }, { passive: false });

    const confirmButton = doc.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'settings-time-picker-btn settings-time-picker-btn-confirm';
    confirmButton.textContent = '确认';
    confirmButton.addEventListener('click', (event) => {
        stopEvent(event);
        confirm();
    }, { passive: false });

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);

    for (let hour = 0; hour < 24; hour += 1) {
        const button = buildOptionButton(hour, 'hour');
        state.hourButtons.push(button);
        hourList.appendChild(button);
    }
    for (let minute = 0; minute < 60; minute += 1) {
        const button = buildOptionButton(minute, 'minute');
        state.minuteButtons.push(button);
        minuteList.appendChild(button);
    }

    pickerRoot.appendChild(hourCol);
    pickerRoot.appendChild(minuteCol);
    pickerRoot.appendChild(actions);
    pickerRoot.addEventListener('pointerdown', (event) => stopPropagationOnly(event), { passive: true });
    pickerRoot.addEventListener('wheel', (event) => stopPropagationOnly(event), { passive: true });
    pickerRoot.addEventListener('click', (event) => stopEvent(event), { passive: false });
    doc.body.appendChild(pickerRoot);

    timeInput.addEventListener('click', (event) => {
        stopEvent(event);
        open();
    }, { passive: false });
    timeInput.addEventListener('focus', () => {
        open();
    });
    win.addEventListener('resize', position);
    win.addEventListener('scroll', position, true);
    doc.addEventListener('pointerdown', (event) => {
        if (!state.open) return;
        const target = event?.target;
        if (target && (timeOps.contains(target) || pickerRoot.contains(target))) return;
        close();
    }, true);
    doc.addEventListener('keydown', (event) => {
        if (!state.open) return;
        if (event?.key === 'Escape') {
            close();
            return;
        }
        if (event?.key === 'Enter') {
            stopEvent(event);
            confirm();
        }
    });

    return {
        close,
        confirm,
        el: pickerRoot,
        isOpen: () => state.open,
        open,
        position
    };
};
