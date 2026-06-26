import {
    formatPanelServiceHourLabel,
    toPanelServiceHourIndex
} from './panelTimetableCore.js';
import { resolveTimetablePrintPalette } from '../../lib/timetable-print-palette.js';

import { resolvePanelTimetableTripKey } from './panelTimetableCore.js';



// panelTimePickerController.js
const defaultToText_panelTimePickerController = (value) => String(value ?? '').trim();

export const formatTimePickerTwoDigits = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '00';
    return String(number).padStart(2, '0');
};

export const normalizeTimePickerHHMM = (value, { toText = defaultToText_panelTimePickerController } = {}) => {
    const source = toText(value);
    const match = source.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return '';

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
    return `${formatTimePickerTwoDigits(hour)}:${formatTimePickerTwoDigits(minute)}`;
};

export const parseTimePickerSeed = (value, { now = new Date(), toText = defaultToText_panelTimePickerController } = {}) => {
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

const createEvent_panelTimePickerController = (doc, type, init) => {
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
        if (defaultToText_panelTimePickerController(timeInput.value) !== value) {
            timeInput.value = value;
            timeInput.dispatchEvent(createEvent_panelTimePickerController(doc, 'input', { bubbles: true }));
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

// panelTimetableGridHintsRenderer.js
const defaultToText_panelTimetableGridHintsRenderer = (value) => String(value ?? '').trim();

const formatPanelGridLegendPair = ({
    full,
    label,
    separator = '-',
    escapeHtml = defaultToText_panelTimetableGridHintsRenderer,
    toText = defaultToText_panelTimetableGridHintsRenderer
} = {}) => {
    const fullText = toText(full);
    const labelText = toText(label);
    if (!fullText) return '';
    if (!labelText || labelText === fullText) return escapeHtml(fullText);
    return `${escapeHtml(labelText)}${escapeHtml(separator)}${escapeHtml(fullText)}`;
};

export const buildPanelTimetableGridHintsHtml = ({
    typeHints,
    terminalHints,
    specialHints,
    escapeHtml = defaultToText_panelTimetableGridHintsRenderer,
    isNoMarkTypeName = () => false,
    toText = defaultToText_panelTimetableGridHintsRenderer
} = {}) => {
    const typeLegendItems = (Array.isArray(typeHints) ? typeHints : [])
        .map((item) => {
            const full = toText(item?.full);
            const abbr = toText(item?.abbr);
            const color = toText(item?.color) || '#888';
            if (!full || !abbr) return '';
            if (isNoMarkTypeName(full)) {
                return `<span class="panel-grid-hint-item panel-grid-hint-item-type" style="color:${escapeHtml(color)}"><i>无标</i>=${escapeHtml(full)}</span>`;
            }
            const sameLabel = full === abbr;
            const text = sameLabel ? full : `${full}=${abbr}`;
            return `<span class="panel-grid-hint-item panel-grid-hint-item-type" style="color:${escapeHtml(color)}">${escapeHtml(text)}</span>`;
        })
        .filter(Boolean)
        .join('<span class="panel-grid-hint-sep"> / </span>');

    const terminalPairHtml = [];
    const seenTerminalPair = new Set();
    for (const item of (Array.isArray(terminalHints) ? terminalHints : [])) {
        const hintParts = Array.isArray(item?.hintParts)
            ? item.hintParts
                .map((part) => ({
                    full: toText(part?.full),
                    abbr: toText(part?.abbr),
                    noMarkMode: toText(part?.noMarkMode)
                }))
                .filter((part) => part.full && part.abbr)
            : [];

        if (hintParts.length) {
            for (const part of hintParts) {
                const noMarkMode = part.noMarkMode;
                if (noMarkMode === 'label' || noMarkMode === 'dual') {
                    const nmKey = `nm||${part.full}`;
                    if (!seenTerminalPair.has(nmKey)) {
                        seenTerminalPair.add(nmKey);
                        terminalPairHtml.push(`<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888"><i>无标</i>-${escapeHtml(part.full)}</span>`);
                    }
                }

                if (noMarkMode === 'label') continue;

                const terminalLabel = buildPanelGridDestLabel(part.full, { fallbackAbbr: part.abbr, toText });
                const abbrKey = `${terminalLabel}||${part.full}`;
                if (seenTerminalPair.has(abbrKey)) continue;
                seenTerminalPair.add(abbrKey);
                terminalPairHtml.push(`<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888">${formatPanelGridLegendPair({
                    full: part.full,
                    label: terminalLabel,
                    escapeHtml,
                    toText
                })}</span>`);
            }
            continue;
        }

        const full = toText(item?.full);
        const abbr = toText(item?.abbr);
        if (!full || !abbr) continue;

        const fullParts = full.split(/[\/·]/).map((value) => toText(value)).filter(Boolean);
        const abbrParts = abbr.split(/[\/·]/).map((value) => toText(value)).filter(Boolean);
        const pairLen = Math.max(fullParts.length, abbrParts.length);

        if (pairLen <= 1) {
            const terminalLabel = buildPanelGridDestLabel(full, { fallbackAbbr: abbr, toText });
            const key = `${terminalLabel}||${full}`;
            if (seenTerminalPair.has(key)) continue;
            seenTerminalPair.add(key);
            terminalPairHtml.push(`<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888">${formatPanelGridLegendPair({
                full,
                label: terminalLabel,
                escapeHtml,
                toText
            })}</span>`);
            continue;
        }

        for (let index = 0; index < pairLen; index += 1) {
            const fullPart = toText(fullParts[index] || fullParts[fullParts.length - 1]);
            const abbrPart = toText(abbrParts[index] || abbrParts[abbrParts.length - 1]);
            if (!fullPart || !abbrPart) continue;
            const terminalLabel = buildPanelGridDestLabel(fullPart, { fallbackAbbr: abbrPart, toText });
            const key = `${terminalLabel}||${fullPart}`;
            if (seenTerminalPair.has(key)) continue;
            seenTerminalPair.add(key);
            terminalPairHtml.push(`<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888">${formatPanelGridLegendPair({
                full: fullPart,
                label: terminalLabel,
                escapeHtml,
                toText
            })}</span>`);
        }
    }

    const terminalLegendItems = terminalPairHtml.join('<span class="panel-grid-hint-sep"> / </span>');
    const seenSpecialPair = new Set();
    const specialLegendItems = (Array.isArray(specialHints) ? specialHints : [])
        .map((item) => {
            const full = toText(item?.full);
            const abbr = toText(item?.abbr);
            const sp = toText(item?.sp) || full.split(' ')[0];
            if (!sp || !abbr) return '';
            const key = `${abbr === sp ? sp : `${abbr}||${sp}`}`;
            if (seenSpecialPair.has(key)) return '';
            seenSpecialPair.add(key);
            return `<span class="panel-grid-hint-item panel-grid-hint-item-special" style="color:#888">${formatPanelGridLegendPair({
                full: sp,
                label: abbr,
                escapeHtml,
                toText
            })}</span>`;
        })
        .filter(Boolean)
        .join('<span class="panel-grid-hint-sep"> / </span>');

    return `
            <div class="panel-grid-hints">
                <div class="panel-grid-hint-line">
                    <span class="panel-grid-hint-label">种别：</span>
                    <span class="panel-grid-hint-content">${typeLegendItems || '<span class="panel-grid-hint-item" style="color:#888">无</span>'}</span>
                </div>
                <div class="panel-grid-hint-line">
                    <span class="panel-grid-hint-label">终点站：</span>
                    <span class="panel-grid-hint-content">${terminalLegendItems || '<span class="panel-grid-hint-item" style="color:#888">无</span>'}</span>
                </div>
                ${specialLegendItems ? `<div class="panel-grid-hint-line"><span class="panel-grid-hint-label">特殊班次：</span><span class="panel-grid-hint-content">${specialLegendItems}</span></div>` : ''}
            </div>
        `;
};

// panelTimetableGridRenderer.js
const defaultToText_panelTimetableGridRenderer = (value) => String(value ?? '').trim();
const COLLAPSED_PANEL_GRID_TRIPS_PER_ROW = 5;
const MAX_PANEL_GRID_DEST_LABEL_CHARS = 3;
const MAX_PANEL_GRID_DEST_ABBR_CHARS = 2;

const clampPanelServiceHour_panelTimetableGridRenderer = (value, minHour, maxHour) => {
    const hour = Number(value);
    if (!Number.isFinite(hour)) return null;
    return Math.max(minHour, Math.min(maxHour, hour));
};

const resolveCollapsedPanelGridFocus = ({
    rows,
    minHour,
    maxHour,
    nowMs,
    serviceDayStartMs
} = {}) => {
    if (!Number.isFinite(minHour) || !Number.isFinite(maxHour)) return { hour: null, row: null };
    const now = Number(nowMs);
    const futureRow = (Array.isArray(rows) ? rows : []).find((row) => {
        const timeMs = Number(row?.timeMs);
        return Number.isFinite(timeMs) && Number.isFinite(now) && timeMs >= now;
    });
    const futureHour = clampPanelServiceHour_panelTimetableGridRenderer(
        futureRow?.serviceHourIndex,
        minHour,
        maxHour
    );
    if (Number.isFinite(futureHour)) return { hour: futureHour, row: futureRow || null };

    const currentHour = clampPanelServiceHour_panelTimetableGridRenderer(
        toPanelServiceHourIndex(nowMs, serviceDayStartMs),
        minHour,
        maxHour
    );
    const fallbackHour = Number.isFinite(currentHour) ? currentHour : maxHour;
    const fallbackRows = (Array.isArray(rows) ? rows : []).filter((row) => {
        const hour = Number(row?.serviceHourIndex);
        return Number.isFinite(hour) && hour === fallbackHour;
    });
    return {
        hour: fallbackHour,
        row: fallbackRows.length ? fallbackRows[fallbackRows.length - 1] : null
    };
};

const buildPanelGridDestLabel = (destNameRaw, {
    fallbackAbbr = '',
    toText = defaultToText_panelTimetableGridRenderer
} = {}) => {
    const destName = toText(destNameRaw);
    if (!destName) return '';

    const chars = Array.from(destName).filter((ch) => /\S/.test(ch));
    if (chars.length <= MAX_PANEL_GRID_DEST_LABEL_CHARS) return chars.join('');

    const fallbackText = toText(fallbackAbbr);
    if (/[\/·]/.test(fallbackText)) return fallbackText;

    const abbrChars = Array.from(fallbackText).filter((ch) => /\S/.test(ch));
    if (abbrChars.length >= MAX_PANEL_GRID_DEST_ABBR_CHARS) {
        return abbrChars.slice(0, MAX_PANEL_GRID_DEST_ABBR_CHARS).join('');
    }

    return [chars[0], chars[2] || chars[1]]
        .map((ch) => toText(ch))
        .filter(Boolean)
        .join('');
};

export const buildPanelTimetableGridHtmlForDirection = ({
    rowsForDir,
    typeHints,
    terminalHints,
    specialHints,
    expanded,
    nowMs,
    serviceDayStartMs,
    lineColor = '',
    serviceDayColorMode = '',
    serviceDayBoundaryHour = 3,
    buildTypeAbbr = (value) => defaultToText_panelTimetableGridRenderer(value).slice(0, 1),
    deriveSpecialSp = () => '',
    escapeHtml = defaultToText_panelTimetableGridRenderer,
    isNoMarkTypeName = () => false,
    resolveTrainTypeColorForTheme = (value) => defaultToText_panelTimetableGridRenderer(value),
    toText = defaultToText_panelTimetableGridRenderer
} = {}) => {
    const rows = Array.isArray(rowsForDir)
        ? rowsForDir.slice().sort((a, b) => (Number(a?.timeMs) || 0) - (Number(b?.timeMs) || 0))
        : [];
    if (!rows.length) return '<div class="panel-timetable-empty">当前无班次</div>';

    const byHour = new Map();
    let minHour = Number.POSITIVE_INFINITY;
    let maxHour = Number.NEGATIVE_INFINITY;

    for (const row of rows) {
        const hour = Number(row?.serviceHourIndex);
        if (!Number.isFinite(hour)) continue;
        if (!byHour.has(hour)) byHour.set(hour, []);
        byHour.get(hour).push(row);
        if (hour < minHour) minHour = hour;
        if (hour > maxHour) maxHour = hour;
    }

    if (!Number.isFinite(minHour) || !Number.isFinite(maxHour)) {
        return '<div class="panel-timetable-empty">当前无班次</div>';
    }

    const currentHour = toPanelServiceHourIndex(nowMs, serviceDayStartMs);
    const currentHourForFocus = Number.isFinite(currentHour)
        ? Math.max(minHour, Math.min(maxHour, currentHour))
        : minHour;
    const focusStartHour = currentHourForFocus;
    const collapsedFocus = resolveCollapsedPanelGridFocus({
        rows,
        minHour,
        maxHour,
        nowMs,
        serviceDayStartMs
    });
    const collapsedFocusHour = collapsedFocus.hour;
    const collapsedFocusRow = collapsedFocus.row;
    const hourWindow = expanded
        ? Array.from({ length: maxHour - minHour + 1 }, (_, index) => minHour + index)
        : (Number.isFinite(collapsedFocusHour) ? [collapsedFocusHour] : [minHour]);
    if (!hourWindow.length) return '<div class="panel-timetable-empty">当前无班次</div>';
    const lightTimetablePalette = resolveTimetablePrintPalette({
        lineColor,
        serviceDayColorMode,
        isDarkTheme: false
    });
    const darkTimetablePalette = resolveTimetablePrintPalette({
        lineColor,
        serviceDayColorMode,
        isDarkTheme: true
    });

    const typeAbbrByName = new Map((Array.isArray(typeHints) ? typeHints : []).map((item) => [toText(item?.full), toText(item?.abbr)]));
    const terminalAbbrByName = new Map((Array.isArray(terminalHints) ? terminalHints : []).map((item) => [toText(item?.full), toText(item?.abbr)]));
    const terminalNoMarkModeByName = new Map();
    for (const hint of (Array.isArray(terminalHints) ? terminalHints : [])) {
        const parts = Array.isArray(hint?.hintParts) ? hint.hintParts : [];
        for (const part of parts) {
            const full = toText(part?.full);
            const noMarkMode = toText(part?.noMarkMode);
            if (!full || !noMarkMode) continue;
            terminalNoMarkModeByName.set(full, noMarkMode);
        }
    }
    const specialAbbrBySp = new Map((Array.isArray(specialHints) ? specialHints : []).map((item) => [toText(item?.sp), toText(item?.abbr)]));

    const rowHtml = hourWindow.map((hour, index) => {
        const trips = Array.isArray(byHour.get(hour)) ? byHour.get(hour) : [];
        const visibleTrips = (() => {
            if (expanded || hour !== collapsedFocusHour) return trips;
            const focusIndex = trips.indexOf(collapsedFocusRow);
            if (focusIndex < 0) return trips.slice(0, COLLAPSED_PANEL_GRID_TRIPS_PER_ROW);
            const start = Math.floor(focusIndex / COLLAPSED_PANEL_GRID_TRIPS_PER_ROW) * COLLAPSED_PANEL_GRID_TRIPS_PER_ROW;
            return trips.slice(start, start + COLLAPSED_PANEL_GRID_TRIPS_PER_ROW);
        })();
        const bgClass = index % 2 === 0 ? 'is-alt-a' : 'is-alt-b';
        const lightGridTripsBackground = index % 2 === 1 ? lightTimetablePalette.gridRowTripsColor : lightTimetablePalette.gridBaseTripsColor;
        const darkGridTripsBackground = index % 2 === 1 ? darkTimetablePalette.gridRowTripsColor : darkTimetablePalette.gridBaseTripsColor;
        const rowStyle = [
            `--panel-grid-hour-bg-light:${lightTimetablePalette.serviceDayHourColor}`,
            `--panel-grid-hour-color-light:${lightTimetablePalette.serviceDayHourTextColor}`,
            `--panel-grid-trips-bg-light:${lightGridTripsBackground}`,
            `--panel-grid-hour-bg-dark:${darkTimetablePalette.serviceDayHourColor}`,
            `--panel-grid-hour-color-dark:${darkTimetablePalette.serviceDayHourTextColor}`,
            `--panel-grid-trips-bg-dark:${darkGridTripsBackground}`
        ].join(';');
        const focusAttr = expanded && hour === focusStartHour ? ' data-grid-focus-start="1"' : '';
        const currentAttr = (!expanded && hour === collapsedFocusHour) ? ' data-grid-collapsed-focus-hour="1"' : '';

        const cellsHtml = visibleTrips.length
            ? visibleTrips.map((trip, tripIndex) => {
                const typeName = toText(trip?.typeName);
                const destName = toText(trip?.terminalDisplayName || trip?.terminalName || trip?.destName);
                const typeAbbr = toText(typeAbbrByName.get(typeName)) || buildTypeAbbr(typeName);
                const rawDestAbbr = toText(terminalAbbrByName.get(destName));
                const rowTerminalNames = Array.isArray(trip?.terminalNames)
                    ? trip.terminalNames.map((value) => toText(value)).filter(Boolean)
                    : [];
                const rowHasSplitByNtMultiDest = !!trip?.hasNt && Number(trip?.resolvedTerminalIdsCount) > 1;
                const rowNoMarkModes = rowTerminalNames
                    .map((name) => toText(terminalNoMarkModeByName.get(name)))
                    .filter(Boolean);
                const shouldHideDestAbbr = rowNoMarkModes.length > 0
                    && !(rowHasSplitByNtMultiDest && rowNoMarkModes.some((mode) => mode === 'dual'));
                const destAbbr = shouldHideDestAbbr
                    ? ''
                    : buildPanelGridDestLabel(destName, { fallbackAbbr: rawDestAbbr, toText });
                const minute = toText(trip?.minuteLabel).slice(0, 2);
                const tripKey = resolvePanelTimetableTripKey(trip, { toText });
                const color = resolveTrainTypeColorForTheme(trip?.typeColor) || 'var(--ui-text, #111)';
                const tripAttr = tripKey ? ` data-trip-key="${escapeHtml(tripKey)}"` : '';
                const lastClass = tripIndex === visibleTrips.length - 1 ? ' is-hour-last' : '';

                const showTypeAbbr = !isNoMarkTypeName(typeName);
                const showDestAbbr = !!destAbbr;
                const specialNames = Array.isArray(trip?.specialNames)
                    ? trip.specialNames.map((value) => toText(value)).filter(Boolean)
                    : [];
                const specialSps = Array.from(new Set(
                    specialNames.map((name) => deriveSpecialSp(name)).filter(Boolean)
                ));
                const specialAbbrs = Array.from(new Set(
                    specialSps.map((sp) => toText(specialAbbrBySp.get(sp)) || sp.slice(0, 1)).filter(Boolean)
                ));
                const hasSpecialNames = specialAbbrs.length > 0;
                const useSpecialBackground = hasSpecialNames || !!trip?.hasNameMeta;

                let typeLabel = showTypeAbbr ? `[${typeAbbr}]` : '';
                let destLabel = showDestAbbr ? destAbbr : '';
                if (hasSpecialNames) {
                    typeLabel = `[${specialAbbrs.join('·')}]`;
                }

                const typeLabelLen = Array.from(toText(typeLabel)).length;
                const destLabelLen = Array.from(toText(destLabel)).length;
                const typeNeedScale = specialAbbrs.length >= 2 || typeLabelLen > 4;
                const destNeedScale = destLabelLen > 3;
                const typeStyle = typeLabelLen > 8
                    ? ' style="transform:scale(0.45,1)"'
                    : (typeNeedScale ? ' style="transform:scale(0.7,1)"' : '');
                const destStyle = destLabelLen > 8
                    ? ' style="transform:scale(0.45,1)"'
                    : (destNeedScale ? ' style="transform:scale(0.7,1)"' : '');
                const typeHtml = typeLabel
                    ? `<span class="panel-grid-trip-type"${typeStyle}>${escapeHtml(typeLabel)}</span>`
                    : '<span class="panel-grid-trip-type" aria-hidden="true">&nbsp;</span>';
                const destHtml = destLabel
                    ? `<span class="panel-grid-trip-dest"${destStyle}>${escapeHtml(destLabel)}</span>`
                    : '<span class="panel-grid-trip-dest" aria-hidden="true">&nbsp;</span>';

                const isTerminal = !!trip?.showTerminalLabel;
                const isOrigin = !!trip?.showOriginLabel;
                const pastClass = trip?.isPast ? ' is-past' : '';

                return `
                        <div class="panel-grid-cell panel-grid-cell-trip${useSpecialBackground ? ' has-special' : ''}${pastClass}${lastClass}"${tripAttr}>
                            <span class="panel-grid-trip${pastClass}" style="color:${escapeHtml(color)}">
                                ${typeHtml}
                                <span class="panel-grid-trip-minute"><span class="panel-grid-trip-minute-text">${escapeHtml(minute)}</span>${
                                    isTerminal ? '<span class="panel-grid-trip-minute-flag is-terminal-flag" aria-label="终点站">终</span>' :
                                    isOrigin ? '<span class="panel-grid-trip-minute-flag is-origin-flag" aria-label="始发站">始</span>' :
                                    ''}</span>
                                ${destHtml}
                            </span>
                        </div>
                    `;
            }).join('')
            : '<div class="panel-grid-cell is-empty is-hour-last"></div>';

        return `
                <div class="panel-grid-row ${bgClass}" style="${escapeHtml(rowStyle)}"${focusAttr}${currentAttr} data-grid-hour="${escapeHtml(String(hour))}">
                    <div class="panel-grid-hour">${escapeHtml(formatPanelServiceHourLabel(hour, { serviceDayBoundaryHour }))}</div>
                    <div class="panel-grid-trips">
                        ${cellsHtml}
                    </div>
                </div>
            `;
    }).join('');

    return `<div class="panel-timetable-grid">${rowHtml}</div>`;
};

// panelTimetablePostRenderHydrator.js
const applyCachedIcon_panelTimetablePostRenderHydrator = (icon, iconName, {
    HTMLImageElementRef = globalThis.HTMLImageElement,
    getIconCandidates,
    getPreferredCachedImageSrc,
    setImageElementFromCache
} = {}) => {
    if (!HTMLImageElementRef || !(icon instanceof HTMLImageElementRef)) return;
    const candidates = getIconCandidates?.(iconName) || [];
    setImageElementFromCache?.(icon, candidates, {
        cacheKey: `icon:${iconName}`,
        fallbackSrc: getPreferredCachedImageSrc?.(candidates, { cacheKey: `icon:${iconName}` })
    })?.catch?.(() => null);
};

export const hydrateTimetableActionIcons = (ttEl, deps = {}) => {
    try {
        const filterIcons = Array.from(ttEl?.querySelectorAll?.('.panel-dir-filter-icon') || []);
        for (const icon of filterIcons) {
            applyCachedIcon_panelTimetablePostRenderHydrator(icon, 'filter.svg', deps);
        }

        const printIcons = Array.from(ttEl?.querySelectorAll?.('.panel-dir-print-icon') || []);
        for (const icon of printIcons) {
            applyCachedIcon_panelTimetablePostRenderHydrator(icon, 'print.svg', deps);
        }

        const focusIcons = Array.from(ttEl?.querySelectorAll?.('.panel-dir-focus-icon') || []);
        for (const icon of focusIcons) {
            const iconName = icon?.getAttribute?.('data-focus-icon') || 'fs.svg';
            applyCachedIcon_panelTimetablePostRenderHydrator(icon, iconName, deps);
        }
    } catch {
        // ignore
    }
};

const clampScrollTop_panelTimetablePostRenderHydrator = (node, nextTop) => {
    const maxScroll = Math.max(0, (node?.scrollHeight || 0) - (node?.clientHeight || 0));
    return Math.max(0, Math.min(Math.floor(Number(nextTop) || 0), maxScroll));
};

const scrollExpandedGridBody_panelTimetablePostRenderHydrator = (bodyEl, ElementRef = globalThis.Element) => {
    bodyEl.style.maxHeight = '';

    const pastCells = Array.from(bodyEl.querySelectorAll?.('.panel-grid-cell-trip.is-past') || []);
    const lastPastCell = pastCells.length ? pastCells[pastCells.length - 1] : null;
    if (ElementRef && lastPastCell instanceof ElementRef) {
        const bodyRect = bodyEl.getBoundingClientRect?.() || { top: 0 };
        const cellRect = lastPastCell.getBoundingClientRect?.() || { top: 0 };
        const naturalTop = (bodyEl.scrollTop || 0) + (cellRect.top - bodyRect.top);
        bodyEl.scrollTop = clampScrollTop_panelTimetablePostRenderHydrator(bodyEl, naturalTop - 10);
        return;
    }

    const focusRow = bodyEl.querySelector?.('[data-grid-focus-start="1"]');
    if (ElementRef && focusRow instanceof ElementRef) {
        bodyEl.scrollTop = Math.max(0, Number(focusRow.offsetTop) || 0);
        return;
    }

    bodyEl.scrollTop = 0;
};

const scrollExpandedListBody_panelTimetablePostRenderHydrator = (bodyEl) => {
    const rows = Array.from(bodyEl.querySelectorAll?.('.panel-timetable-row') || []);
    if (!rows.length) return;

    let lastPastIndex = -1;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index]?.classList?.contains?.('is-past')) {
            lastPastIndex = index;
            break;
        }
    }

    if (lastPastIndex > 0) {
        const rowHeight = rows[0]?.offsetHeight || 18;
        bodyEl.scrollTop = clampScrollTop_panelTimetablePostRenderHydrator(bodyEl, lastPastIndex * rowHeight);
        return;
    }

    bodyEl.scrollTop = 0;
};

export const applyTimetableBodyScrollState = (ttEl, {
    ElementRef = globalThis.Element
} = {}) => {
    try {
        const expandedBodies = Array.from(ttEl?.querySelectorAll?.('.panel-timetable.is-expanded') || []);
        for (const bodyEl of expandedBodies) {
            if (bodyEl?.classList?.contains?.('panel-timetable-view-grid')) {
                scrollExpandedGridBody_panelTimetablePostRenderHydrator(bodyEl, ElementRef);
                continue;
            }
            scrollExpandedListBody_panelTimetablePostRenderHydrator(bodyEl);
        }

        const collapsedGridBodies = Array.from(
            ttEl?.querySelectorAll?.('.panel-timetable.panel-timetable-view-grid.is-collapsed') || []
        );
        for (const bodyEl of collapsedGridBodies) {
            const currentHourRow = bodyEl.querySelector?.('[data-grid-collapsed-focus-hour="1"]')
                || bodyEl.querySelector?.('.panel-grid-row');
            if (!ElementRef || !(currentHourRow instanceof ElementRef)) continue;

            const currentHourFullHeight = Math.ceil((currentHourRow.offsetHeight || 0) + 1);
            bodyEl.style.maxHeight = `${Math.max(54, currentHourFullHeight)}px`;
            bodyEl.scrollTop = 0;
        }
    } catch {
        // ignore
    }
};

export const hydrateRenderedTimetable = (ttEl, deps = {}) => {
    hydrateTimetableActionIcons(ttEl, deps);
    applyTimetableBodyScrollState(ttEl, deps);
};
