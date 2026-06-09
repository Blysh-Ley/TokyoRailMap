import {
    choosePanelHourWindow,
    formatPanelServiceHourLabel,
    toPanelServiceHourIndex
} from './panelTimetableHourWindow.js';
import { resolvePanelTimetableTripKey } from './panelTimetableTripKey.js';

const defaultToText = (value) => String(value ?? '').trim();

export const buildPanelTimetableGridHtmlForDirection = ({
    rowsForDir,
    typeHints,
    terminalHints,
    specialHints,
    expanded,
    nowMs,
    serviceDayStartMs,
    serviceDayBoundaryHour = 3,
    buildTypeAbbr = (value) => defaultToText(value).slice(0, 1),
    deriveSpecialSp = () => '',
    escapeHtml = defaultToText,
    isNoMarkTypeName = () => false,
    resolveTrainTypeColorForTheme = (value) => defaultToText(value),
    toText = defaultToText
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
    const hourWindow = expanded
        ? Array.from({ length: maxHour - minHour + 1 }, (_, index) => minHour + index)
        : choosePanelHourWindow({ minHour, maxHour, currentHour, expanded: false });
    if (!hourWindow.length) return '<div class="panel-timetable-empty">当前无班次</div>';

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
        const bgClass = index % 2 === 0 ? 'is-alt-a' : 'is-alt-b';
        const focusAttr = expanded && hour === focusStartHour ? ' data-grid-focus-start="1"' : '';
        const currentAttr = (!expanded && hour === currentHourForFocus) ? ' data-grid-current-hour="1"' : '';

        const cellsHtml = trips.length
            ? trips.map((trip, tripIndex) => {
                const typeName = toText(trip?.typeName);
                const destName = toText(trip?.terminalDisplayName || trip?.terminalName || trip?.destName);
                const typeAbbr = toText(typeAbbrByName.get(typeName)) || buildTypeAbbr(typeName);
                const rawDestAbbr = toText(terminalAbbrByName.get(destName)) || toText(destName).slice(0, 1);
                const rowTerminalNames = Array.isArray(trip?.terminalNames)
                    ? trip.terminalNames.map((value) => toText(value)).filter(Boolean)
                    : [];
                const rowHasSplitByNtMultiDest = !!trip?.hasNt && Number(trip?.resolvedTerminalIdsCount) > 1;
                const rowNoMarkModes = rowTerminalNames
                    .map((name) => toText(terminalNoMarkModeByName.get(name)))
                    .filter(Boolean);
                const shouldHideDestAbbr = rowNoMarkModes.length > 0
                    && !(rowHasSplitByNtMultiDest && rowNoMarkModes.some((mode) => mode === 'dual'));
                const destAbbr = shouldHideDestAbbr ? '' : rawDestAbbr;
                const minute = toText(trip?.minuteLabel).slice(0, 2);
                const tripKey = resolvePanelTimetableTripKey(trip, { toText });
                const color = resolveTrainTypeColorForTheme(trip?.typeColor) || 'var(--ui-text, #111)';
                const tripAttr = tripKey ? ` data-trip-key="${escapeHtml(tripKey)}"` : '';
                const lastClass = tripIndex === trips.length - 1 ? ' is-hour-last' : '';

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

                let tripAbbrText = `${showTypeAbbr ? `[${typeAbbr}]` : ''}${showDestAbbr ? destAbbr : ''}`;
                if (hasSpecialNames) {
                    const specialPrefix = `[${specialAbbrs.join('·')}]`;
                    if (specialAbbrs.length >= 2) {
                        const multiDestAbbr = toText(rawDestAbbr);
                        const fallbackDest = toText(trip?.terminalDisplayName || trip?.terminalName || trip?.destName);
                        tripAbbrText = `${specialPrefix}${multiDestAbbr || fallbackDest}`;
                    } else {
                        tripAbbrText = `${specialPrefix}${toText(rawDestAbbr)}`;
                    }
                }

                const tripAbbrLen = Array.from(toText(tripAbbrText)).length;
                const needScale = specialAbbrs.length >= 2 || tripAbbrLen > 5;
                const tripAbbrStyle = tripAbbrLen > 8
                    ? ' style="transform:scale(0.45,1)"'
                    : (needScale ? ' style="transform:scale(0.7,1)"' : '');
                const tripAbbrHtml = tripAbbrText
                    ? `<span class="panel-grid-trip-abbr"${tripAbbrStyle}>${escapeHtml(tripAbbrText)}</span>`
                    : '<span class="panel-grid-trip-abbr" aria-hidden="true">&nbsp;</span>';

                const isTerminal = !!trip?.showTerminalLabel;
                const isOrigin = !!trip?.showOriginLabel;
                const pastClass = trip?.isPast ? ' is-past' : '';

                return `
                        <div class="panel-grid-cell panel-grid-cell-trip${useSpecialBackground ? ' has-special' : ''}${pastClass}${lastClass}"${tripAttr}>
                            <span class="panel-grid-trip${pastClass}" style="color:${escapeHtml(color)}">
                                ${tripAbbrHtml}
                                <span class="panel-grid-trip-minute"><span class="panel-grid-trip-minute-text">${escapeHtml(minute)}</span>${
                                    isTerminal ? '<span class="panel-grid-trip-minute-flag is-terminal-flag" aria-label="终点站">终</span>' :
                                    isOrigin ? '<span class="panel-grid-trip-minute-flag is-origin-flag" aria-label="始发站">始</span>' :
                                    ''}</span>
                            </span>
                        </div>
                    `;
            }).join('')
            : '<div class="panel-grid-cell is-empty is-hour-last"></div>';

        return `
                <div class="panel-grid-row ${bgClass}"${focusAttr}${currentAttr} data-grid-hour="${escapeHtml(String(hour))}">
                    <div class="panel-grid-hour">${escapeHtml(formatPanelServiceHourLabel(hour, { serviceDayBoundaryHour }))}</div>
                    <div class="panel-grid-trips">
                        ${cellsHtml}
                    </div>
                </div>
            `;
    }).join('');

    return `<div class="panel-timetable-grid">${rowHtml}</div>`;
};
