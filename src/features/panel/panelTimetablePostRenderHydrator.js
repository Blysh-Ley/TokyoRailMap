const applyCachedIcon = (icon, iconName, {
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
            applyCachedIcon(icon, 'filter.svg', deps);
        }

        const printIcons = Array.from(ttEl?.querySelectorAll?.('.panel-dir-print-icon') || []);
        for (const icon of printIcons) {
            applyCachedIcon(icon, 'print.svg', deps);
        }
    } catch {
        // ignore
    }
};

const clampScrollTop = (node, nextTop) => {
    const maxScroll = Math.max(0, (node?.scrollHeight || 0) - (node?.clientHeight || 0));
    return Math.max(0, Math.min(Math.floor(Number(nextTop) || 0), maxScroll));
};

const scrollExpandedGridBody = (bodyEl, ElementRef = globalThis.Element) => {
    bodyEl.style.maxHeight = '';

    const pastCells = Array.from(bodyEl.querySelectorAll?.('.panel-grid-cell-trip.is-past') || []);
    const lastPastCell = pastCells.length ? pastCells[pastCells.length - 1] : null;
    if (ElementRef && lastPastCell instanceof ElementRef) {
        const bodyRect = bodyEl.getBoundingClientRect?.() || { top: 0 };
        const cellRect = lastPastCell.getBoundingClientRect?.() || { top: 0 };
        const naturalTop = (bodyEl.scrollTop || 0) + (cellRect.top - bodyRect.top);
        bodyEl.scrollTop = clampScrollTop(bodyEl, naturalTop - 10);
        return;
    }

    const focusRow = bodyEl.querySelector?.('[data-grid-focus-start="1"]');
    if (ElementRef && focusRow instanceof ElementRef) {
        bodyEl.scrollTop = Math.max(0, Number(focusRow.offsetTop) || 0);
        return;
    }

    bodyEl.scrollTop = 0;
};

const scrollExpandedListBody = (bodyEl) => {
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
        bodyEl.scrollTop = clampScrollTop(bodyEl, lastPastIndex * rowHeight);
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
                scrollExpandedGridBody(bodyEl, ElementRef);
                continue;
            }
            scrollExpandedListBody(bodyEl);
        }

        const collapsedGridBodies = Array.from(
            ttEl?.querySelectorAll?.('.panel-timetable.panel-timetable-view-grid.is-collapsed') || []
        );
        for (const bodyEl of collapsedGridBodies) {
            const collapsedBaseHeight = 70;
            bodyEl.style.maxHeight = `${collapsedBaseHeight}px`;

            const currentHourRow = bodyEl.querySelector?.('[data-grid-current-hour="1"]')
                || bodyEl.querySelector?.('.panel-grid-row');
            if (!ElementRef || !(currentHourRow instanceof ElementRef)) continue;

            const currentHourFullHeight = Math.ceil((currentHourRow.offsetHeight || 0) + 1);
            const targetHeight = Math.max(collapsedBaseHeight, currentHourFullHeight);
            bodyEl.style.maxHeight = `${targetHeight}px`;
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
