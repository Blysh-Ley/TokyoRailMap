export const toPanelServiceHourIndex = (timeMs, serviceDayStartMs) => {
    const ms = Number(timeMs);
    const base = Number(serviceDayStartMs);
    if (!Number.isFinite(ms) || !Number.isFinite(base)) return null;
    return Math.floor((ms - base) / 3600000);
};

export const formatPanelServiceHourLabel = (serviceHourIndex, {
    serviceDayBoundaryHour = 3
} = {}) => {
    const index = Number(serviceHourIndex);
    if (!Number.isFinite(index)) return '';
    const hour = (Number(serviceDayBoundaryHour) + index) % 24;
    return String((hour + 24) % 24).padStart(2, '0');
};

export const choosePanelHourWindow = ({
    minHour,
    maxHour,
    currentHour,
    expanded,
    expandedWindowSize = 10
} = {}) => {
    if (!Number.isFinite(minHour) || !Number.isFinite(maxHour)) return [];
    if (maxHour < minHour) return [];

    if (!expanded) {
        let start = Number.isFinite(currentHour) ? currentHour : minHour;
        if (start < minHour) start = minHour;
        if (start > maxHour) start = maxHour;
        const out = [];
        for (let hour = start; hour <= maxHour; hour += 1) out.push(hour);
        return out;
    }

    const size = Number.isFinite(expandedWindowSize) && expandedWindowSize > 0
        ? Math.floor(expandedWindowSize)
        : 10;
    let start = currentHour - 1;
    if (!Number.isFinite(start)) start = minHour;

    if (start < minHour) start = minHour;
    if (start > maxHour) start = Math.max(minHour, maxHour - size + 1);

    let end = Math.min(maxHour, start + size - 1);
    if ((end - start + 1) < size) start = Math.max(minHour, end - size + 1);

    const out = [];
    for (let hour = start; hour <= end; hour += 1) out.push(hour);
    return out;
};
