const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const PICKER_EDGE_GAP = 10;
const PICKER_ANCHOR_GAP = 10;

const createElement = (doc, tagName, className, textContent = '') => {
    const element = doc.createElement(tagName);
    if (className) element.className = className;
    if (textContent) element.textContent = textContent;
    return element;
};

const formatTwoDigits = (value) => String(Number(value) || 0).padStart(2, '0');

export const createPanelDateTimePickerView = ({
    anchor,
    dateTrigger,
    timeTrigger,
    doc = globalThis.document,
    win = globalThis.window,
    loadArrowIcon = null,
    setOpenState = () => {}
} = {}) => {
    let intentHandler = () => {};
    let viewModel = { open: false };
    let wasOpen = false;
    let hourScrollTimer = null;
    let minuteScrollTimer = null;
    const unbinders = [];

    const backdrop = createElement(doc, 'div', 'panel-datetime-picker-backdrop is-hidden');
    backdrop.setAttribute('aria-hidden', 'true');

    const root = createElement(doc, 'div', 'settings-time-picker panel-datetime-picker is-hidden');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '日期和时间');
    root.setAttribute('tabindex', '-1');

    const calendarSection = createElement(doc, 'section', 'panel-datetime-picker-calendar');
    const monthNavigation = createElement(doc, 'div', 'panel-datetime-picker-month-nav');
    const previousMonthButton = createElement(doc, 'button', 'panel-datetime-picker-month-btn panel-datetime-picker-month-btn-prev');
    previousMonthButton.type = 'button';
    previousMonthButton.setAttribute('aria-label', '上个月');
    const previousMonthIcon = createElement(doc, 'img', 'panel-datetime-picker-month-icon panel-datetime-picker-month-icon-prev');
    previousMonthIcon.alt = '';
    previousMonthIcon.src = './assets/icons/arrow-right.svg';
    const monthLabel = createElement(doc, 'div', 'panel-datetime-picker-month-label');
    monthLabel.setAttribute('aria-live', 'polite');
    const nextMonthButton = createElement(doc, 'button', 'panel-datetime-picker-month-btn panel-datetime-picker-month-btn-next');
    nextMonthButton.type = 'button';
    nextMonthButton.setAttribute('aria-label', '下个月');
    const nextMonthIcon = createElement(doc, 'img', 'panel-datetime-picker-month-icon');
    nextMonthIcon.alt = '';
    nextMonthIcon.src = './assets/icons/arrow-right.svg';
    if (typeof loadArrowIcon === 'function') {
        loadArrowIcon(previousMonthIcon);
        loadArrowIcon(nextMonthIcon);
    }
    previousMonthButton.appendChild(previousMonthIcon);
    nextMonthButton.appendChild(nextMonthIcon);
    monthNavigation.appendChild(previousMonthButton);
    monthNavigation.appendChild(monthLabel);
    monthNavigation.appendChild(nextMonthButton);

    const weekdayRow = createElement(doc, 'div', 'panel-datetime-picker-weekdays');
    WEEKDAY_LABELS.forEach((label) => {
        const item = createElement(doc, 'div', 'panel-datetime-picker-weekday', label);
        item.setAttribute('aria-hidden', 'true');
        weekdayRow.appendChild(item);
    });
    const dayGrid = createElement(doc, 'div', 'panel-datetime-picker-days');
    calendarSection.appendChild(monthNavigation);
    calendarSection.appendChild(weekdayRow);
    calendarSection.appendChild(dayGrid);

    const timeSection = createElement(doc, 'section', 'panel-datetime-picker-time');
    timeSection.setAttribute('aria-label', '时间');
    const timeLabels = createElement(doc, 'div', 'panel-datetime-picker-time-labels');
    timeLabels.appendChild(createElement(doc, 'div', 'panel-datetime-picker-time-label', '时'));
    timeLabels.appendChild(createElement(doc, 'div', 'panel-datetime-picker-time-label', '分'));
    const timeWheels = createElement(doc, 'div', 'panel-datetime-picker-wheels');
    const hourList = createElement(doc, 'div', 'panel-datetime-picker-wheel panel-datetime-picker-hour-wheel');
    hourList.setAttribute('role', 'listbox');
    hourList.setAttribute('aria-label', '小时');
    const timeSeparator = createElement(doc, 'div', 'panel-datetime-picker-time-separator', ':');
    timeSeparator.setAttribute('aria-hidden', 'true');
    const minuteList = createElement(doc, 'div', 'panel-datetime-picker-wheel panel-datetime-picker-minute-wheel');
    minuteList.setAttribute('role', 'listbox');
    minuteList.setAttribute('aria-label', '分钟');
    timeWheels.appendChild(hourList);
    timeWheels.appendChild(timeSeparator);
    timeWheels.appendChild(minuteList);
    timeSection.appendChild(timeLabels);
    timeSection.appendChild(timeWheels);

    const footer = createElement(doc, 'footer', 'panel-datetime-picker-footer');
    const resetButton = createElement(doc, 'button', 'panel-datetime-picker-action panel-datetime-picker-reset', '恢复现在');
    resetButton.type = 'button';
    const footerEnd = createElement(doc, 'div', 'panel-datetime-picker-footer-end');
    const cancelButton = createElement(doc, 'button', 'panel-datetime-picker-action panel-datetime-picker-cancel', '取消');
    cancelButton.type = 'button';
    const confirmButton = createElement(doc, 'button', 'panel-datetime-picker-action panel-datetime-picker-confirm', '确定');
    confirmButton.type = 'button';
    footerEnd.appendChild(cancelButton);
    footerEnd.appendChild(confirmButton);
    footer.appendChild(resetButton);
    footer.appendChild(footerEnd);

    root.appendChild(calendarSection);
    root.appendChild(timeSection);
    root.appendChild(footer);
    doc.body.appendChild(backdrop);
    doc.body.appendChild(root);

    const emit = (intent) => intentHandler(intent);
    const listen = (target, type, listener, options) => {
        target?.addEventListener?.(type, listener, options);
        unbinders.push(() => target?.removeEventListener?.(type, listener, options));
    };

    const createTimeOption = (value, type) => {
        const button = createElement(doc, 'button', 'panel-datetime-picker-time-option', formatTwoDigits(value));
        button.type = 'button';
        button.dataset.value = String(value);
        button.dataset.type = type;
        button.setAttribute('role', 'option');
        listen(button, 'click', (event) => {
            event.preventDefault?.();
            event.stopPropagation?.();
            emit({ type: type === 'hour' ? 'selectHour' : 'selectMinute', value });
        });
        return button;
    };

    Array.from({ length: 24 }, (_, value) => hourList.appendChild(createTimeOption(value, 'hour')));
    Array.from({ length: 60 }, (_, value) => minuteList.appendChild(createTimeOption(value, 'minute')));

    const getViewport = () => {
        const viewport = win?.visualViewport;
        if (viewport) {
            return {
                left: Number(viewport.offsetLeft) || 0,
                top: Number(viewport.offsetTop) || 0,
                width: Number(viewport.width) || win.innerWidth || 0,
                height: Number(viewport.height) || win.innerHeight || 0
            };
        }
        return {
            left: 0,
            top: 0,
            width: Number(win?.innerWidth) || doc.documentElement?.clientWidth || 0,
            height: Number(win?.innerHeight) || doc.documentElement?.clientHeight || 0
        };
    };

    const position = () => {
        if (!viewModel.open || !anchor?.getBoundingClientRect) return;
        const anchorRect = anchor.getBoundingClientRect();
        const viewport = getViewport();
        const pickerRect = root.getBoundingClientRect();
        const pickerWidth = Math.min(
            Math.max(280, Number(pickerRect.width) || 540),
            Math.max(280, viewport.width - (PICKER_EDGE_GAP * 2))
        );
        const minLeft = viewport.left + PICKER_EDGE_GAP;
        const maxLeft = viewport.left + viewport.width - pickerWidth - PICKER_EDGE_GAP;
        const left = Math.max(minLeft, Math.min(anchorRect.right - pickerWidth, maxLeft));
        const top = Math.max(viewport.top + PICKER_EDGE_GAP, anchorRect.bottom + PICKER_ANCHOR_GAP);
        const maxHeight = Math.max(320, viewport.top + viewport.height - top - PICKER_EDGE_GAP);
        const anchorCenter = anchorRect.left + (anchorRect.width / 2);
        const anchorX = Math.max(24, Math.min(anchorCenter - left, pickerWidth - 24));

        root.style.left = `${Math.round(left)}px`;
        root.style.top = `${Math.round(top)}px`;
        root.style.maxHeight = `${Math.round(maxHeight)}px`;
        root.style.setProperty?.('--panel-datetime-anchor-x', `${Math.round(anchorX)}px`);
    };

    const scrollOptionIntoView = (list, selectedValue, behavior = 'auto') => {
        const selected = Array.from(list.children || []).find((button) => Number(button.dataset?.value) === Number(selectedValue));
        selected?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior });
    };

    const syncWheelSelection = (list, selectedValue) => {
        Array.from(list.children || []).forEach((button) => {
            const selected = Number(button.dataset?.value) === Number(selectedValue);
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
    };

    const emitClosestWheelOption = (list, type) => {
        if (!viewModel.open) return;
        const center = Number(list.scrollTop) + (Number(list.clientHeight) / 2);
        let closest = null;
        let closestDistance = Infinity;
        Array.from(list.children || []).forEach((button) => {
            const buttonCenter = Number(button.offsetTop) + (Number(button.offsetHeight) / 2);
            const distance = Math.abs(buttonCenter - center);
            if (distance < closestDistance) {
                closest = button;
                closestDistance = distance;
            }
        });
        const value = Number(closest?.dataset?.value);
        const current = type === 'hour' ? viewModel.selectedHour : viewModel.selectedMinute;
        if (Number.isInteger(value) && value !== Number(current)) {
            emit({ type: type === 'hour' ? 'selectHour' : 'selectMinute', value });
        }
    };

    const scheduleWheelIntent = (list, type) => {
        const key = type === 'hour' ? 'hour' : 'minute';
        const currentTimer = key === 'hour' ? hourScrollTimer : minuteScrollTimer;
        if (currentTimer) win.clearTimeout(currentTimer);
        const timer = win.setTimeout(() => emitClosestWheelOption(list, type), 90);
        if (key === 'hour') hourScrollTimer = timer;
        else minuteScrollTimer = timer;
    };

    const renderCalendar = () => {
        monthLabel.textContent = viewModel.monthLabel || '';
        dayGrid.replaceChildren();
        (viewModel.calendarCells || []).forEach((cell) => {
            const button = createElement(doc, 'button', 'panel-datetime-picker-day');
            button.type = 'button';
            button.dataset.dateKey = cell.dateKey;
            button.classList.toggle('is-outside-month', !cell.inCurrentMonth);
            button.classList.toggle('is-selected', cell.selected === true);
            button.classList.toggle('is-today', cell.today === true);
            button.setAttribute('aria-label', cell.dateKey);
            button.setAttribute('aria-pressed', cell.selected ? 'true' : 'false');
            const number = createElement(doc, 'span', 'panel-datetime-picker-day-number', String(cell.day));
            button.appendChild(number);
            if (cell.serviceDayLabel) {
                button.appendChild(createElement(
                    doc,
                    'span',
                    'panel-datetime-picker-day-service',
                    cell.serviceDayLabel
                ));
            }
            dayGrid.appendChild(button);
        });
    };

    const setTriggerExpanded = (expanded) => {
        const value = expanded ? 'true' : 'false';
        dateTrigger?.setAttribute?.('aria-expanded', value);
        timeTrigger?.setAttribute?.('aria-expanded', value);
    };

    const focusPicker = () => {
        const selectedDay = dayGrid.querySelector?.('.panel-datetime-picker-day.is-selected');
        (selectedDay || root)?.focus?.({ preventScroll: true });
    };

    const render = (nextViewModel = {}) => {
        viewModel = nextViewModel;
        const open = viewModel.open === true;
        renderCalendar();
        syncWheelSelection(hourList, viewModel.selectedHour);
        syncWheelSelection(minuteList, viewModel.selectedMinute);
        root.classList.toggle('is-hidden', !open);
        backdrop.classList.toggle('is-hidden', !open);
        anchor?.classList?.toggle('is-datetime-picker-open', open);
        setTriggerExpanded(open);

        if (open) {
            position();
            const requestFrame = win?.requestAnimationFrame || ((callback) => win?.setTimeout?.(callback, 0));
            requestFrame?.(() => {
                position();
                scrollOptionIntoView(hourList, viewModel.selectedHour);
                scrollOptionIntoView(minuteList, viewModel.selectedMinute);
                if (!wasOpen) focusPicker();
            });
        } else if (wasOpen) {
            dateTrigger?.focus?.({ preventScroll: true });
        }

        if (open !== wasOpen) setOpenState(open);
        wasOpen = open;
    };

    const requestOpen = (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (!viewModel.open) emit({ type: 'open' });
    };
    const requestOpenFromKey = (event) => {
        if (event?.key !== 'Enter' && event?.key !== ' ') return;
        requestOpen(event);
    };

    listen(dateTrigger, 'click', requestOpen, { passive: false });
    listen(dateTrigger, 'keydown', requestOpenFromKey, { passive: false });
    listen(timeTrigger, 'click', requestOpen, { passive: false });
    listen(timeTrigger, 'focus', requestOpen);
    listen(timeTrigger, 'keydown', requestOpenFromKey, { passive: false });
    listen(dayGrid, 'click', (event) => {
        const button = event?.target?.closest?.('.panel-datetime-picker-day[data-date-key]');
        if (!button || !dayGrid.contains?.(button)) return;
        event.preventDefault?.();
        event.stopPropagation?.();
        emit({ type: 'selectDate', dateKey: button.dataset?.dateKey });
    });
    listen(previousMonthButton, 'click', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        emit({ type: 'shiftMonth', delta: -1 });
    });
    listen(nextMonthButton, 'click', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        emit({ type: 'shiftMonth', delta: 1 });
    });
    listen(resetButton, 'click', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        emit({ type: 'resetNow' });
    });
    listen(cancelButton, 'click', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        emit({ type: 'cancel' });
    });
    listen(confirmButton, 'click', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        emit({ type: 'confirm' });
    });
    listen(backdrop, 'pointerdown', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        emit({ type: 'cancel' });
    }, { passive: false });
    listen(root, 'pointerdown', (event) => event.stopPropagation?.());
    listen(root, 'click', (event) => event.stopPropagation?.());
    listen(root, 'wheel', (event) => event.stopPropagation?.(), { passive: true });
    listen(hourList, 'scroll', () => scheduleWheelIntent(hourList, 'hour'), { passive: true });
    listen(minuteList, 'scroll', () => scheduleWheelIntent(minuteList, 'minute'), { passive: true });
    listen(doc, 'keydown', (event) => {
        if (!viewModel.open || event?.key !== 'Escape') return;
        event.preventDefault?.();
        event.stopPropagation?.();
        emit({ type: 'cancel' });
    }, true);
    listen(win, 'resize', position);
    listen(win, 'scroll', position, true);
    listen(win?.visualViewport, 'resize', position);
    listen(win?.visualViewport, 'scroll', position);

    return {
        backdrop,
        contains: (node) => Boolean(node && (root.contains?.(node) || backdrop.contains?.(node))),
        destroy() {
            if (hourScrollTimer) win.clearTimeout(hourScrollTimer);
            if (minuteScrollTimer) win.clearTimeout(minuteScrollTimer);
            while (unbinders.length) unbinders.pop()?.();
            root.remove?.();
            backdrop.remove?.();
        },
        el: root,
        position,
        render,
        setIntentHandler(handler) {
            intentHandler = typeof handler === 'function' ? handler : () => {};
        }
    };
};
