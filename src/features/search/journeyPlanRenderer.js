import { createStationCodeBadgeElement } from '../../lib/line-icons.js';

export const createJourneyPlanMessageItem = ({ createElement, message } = {}) => {
    const li = typeof createElement === 'function'
        ? createElement('li', 'journey-plan-item is-message')
        : document.createElement('li');
    if (!li.className) li.className = 'journey-plan-item is-message';
    const empty = typeof createElement === 'function'
        ? createElement('div', 'journey-plan-empty', { text: message })
        : document.createElement('div');
    if (!empty.className) empty.className = 'journey-plan-empty';
    if (!empty.textContent) empty.textContent = String(message ?? '');
    li.appendChild(empty);
    return li;
};

export const countJourneyPlanRideStations = ({ detailBlocks, normalizeText, transfers = 0 } = {}) => {
    const normalize = typeof normalizeText === 'function'
        ? normalizeText
        : (value) => String(value ?? '').trim();
    const seq = [];

    for (const block of Array.isArray(detailBlocks) ? detailBlocks : []) {
        if (block?.kind !== 'ride') continue;
        const rows = Array.isArray(block.rows) ? block.rows : [];
        for (const row of rows) {
            const stationId = normalize(row?.stationId || '');
            if (!stationId) continue;
            if (seq.length && seq[seq.length - 1] === stationId) continue;
            seq.push(stationId);
        }
    }

    return seq.length - 1 - (Number(transfers) || 0);
};

export const createJourneyPlanBrief = ({
    createElement,
    displayPlan,
    formatArrival,
    formatDuration,
    normalizeText,
    paginationEl,
    row,
    stationCount = null
} = {}) => {
    const normalize = typeof normalizeText === 'function'
        ? normalizeText
        : (value) => String(value ?? '').trim();
    const create = typeof createElement === 'function'
        ? createElement
        : (tag, className, attrs = {}) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (Object.prototype.hasOwnProperty.call(attrs, 'text')) node.textContent = attrs.text;
            return node;
        };

    const brief = create('div', 'journey-plan-brief');
    const head = create('div', 'journey-plan-head');
    const durationText = typeof formatDuration === 'function'
        ? formatDuration(displayPlan?.durationMs)
        : '';
    const arrivalText = typeof formatArrival === 'function'
        ? `${formatArrival(displayPlan?.arrivalMs)}到达`
        : '';
    const transferText = Number(displayPlan?.transfers) > 0
        ? `${Number(displayPlan.transfers)}次换乘`
        : '直达';

    head.appendChild(create('span', 'journey-plan-duration', { text: durationText }));
    head.appendChild(create('span', 'journey-plan-transfer', { text: transferText }));
    if (Number.isFinite(Number(stationCount))) {
        head.appendChild(create('span', 'journey-plan-stations-count', { text: `${Number(stationCount)}站` }));
    }
    head.appendChild(create('span', 'journey-plan-arrive', { text: arrivalText }));

    const tagLabels = Array.isArray(row?.tagLabels)
        ? row.tagLabels.map((x) => normalize(x)).filter(Boolean)
        : [normalize(row?.label)].filter(Boolean);
    const fareAmount = row?.fareEstimate?.totalAmount;
    const fareText = typeof fareAmount === 'number' && Number.isFinite(fareAmount)
        ? `JPY ${fareAmount}`
        : '';
    if (tagLabels.length || fareText) {
        const tagsWrap = create('div', 'journey-plan-tags');
        for (const tagText of tagLabels) {
            tagsWrap.appendChild(create('div', 'journey-plan-tag', { text: `${tagText}  ` }));
        }
        if (fareText) {
            tagsWrap.appendChild(create('div', 'journey-plan-fare', { text: fareText }));
        }
        brief.appendChild(tagsWrap);
    }

    brief.appendChild(head);
    const canAppendPagination = typeof Node !== 'undefined'
        ? paginationEl instanceof Node
        : !!paginationEl?.nodeType;
    if (canAppendPagination) brief.appendChild(paginationEl);
    return brief;
};

const resolveCreateElement = (createElement) => (
    typeof createElement === 'function'
        ? createElement
        : (tag, className, attrs = {}) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (Object.prototype.hasOwnProperty.call(attrs, 'text')) node.textContent = attrs.text;
            if (Object.prototype.hasOwnProperty.call(attrs, 'alt')) node.alt = attrs.alt;
            return node;
        }
);

export const createJourneyStationPathRow = ({
    createElement,
    rowClass = 'station-row',
    stationName,
    timeText
} = {}) => {
    const create = resolveCreateElement(createElement);
    const rowEl = create('div', rowClass || 'station-row');
    rowEl.appendChild(create('div', 'station-title-box', { text: stationName }));
    rowEl.appendChild(create('div', 'station-time-box', { text: timeText }));
    return rowEl;
};

const isInformativeJourneyTypeText = (typeText) => {
    const text = String(typeText ?? '').trim();
    if (!text) return false;
    return !['直通', 'through'].includes(text.toLowerCase());
};

export const createJourneyTrainPathRow = ({
    createElement,
    directionText,
    lineColor,
    lineText,
    resolveBadgeTextColor,
    resolveColor,
    stationCount = null,
    typeColor,
    typeText
} = {}) => {
    const create = resolveCreateElement(createElement);
    const rowEl = create('div', 'station-row');
    const title = create('div', 'train-title-box');
    const lineLabel = create('span', 'train-line-label', { text: lineText || '线路' });
    if (lineColor) lineLabel.style.color = String(lineColor);
    title.appendChild(lineLabel);

    if (isInformativeJourneyTypeText(typeText)) {
        title.appendChild(document.createTextNode(' '));
        const typeLabel = create('span', 'train-type-label', { text: typeText });
        if (typeColor) {
            const bg = typeof resolveColor === 'function'
                ? String(resolveColor(typeColor))
                : String(typeColor);
            typeLabel.style.background = bg;
            typeLabel.style.color = typeof resolveBadgeTextColor === 'function'
                ? resolveBadgeTextColor(bg)
                : '';
        }
        title.appendChild(typeLabel);
    }

    if (directionText) title.appendChild(document.createTextNode(` 往${directionText}`));
    if (Number.isFinite(Number(stationCount)) && Number(stationCount) > 0) {
        title.appendChild(document.createTextNode(` ${Number(stationCount)}站`));
    }

    rowEl.appendChild(title);
    return rowEl;
};

export const createJourneyWalkPathRow = ({
    createElement,
    isDestination = false,
    minutes,
    setIcon,
    toText
} = {}) => {
    if (!Number.isFinite(Number(minutes)) || Number(minutes) <= 0) return null;
    const create = resolveCreateElement(createElement);
    const rowEl = create('div', 'station-row is-walk');
    const title = create('div', 'train-title-box');
    const img = create('img', 'journey-walk-icon', { alt: '' });
    img.style.width = '14px';
    img.style.height = '14px';
    img.style.display = 'inline-block';
    img.style.verticalAlign = 'middle';
    try { setIcon?.(img, 'walk.svg'); } catch {}
    title.appendChild(img);
    const text = isDestination
        ? ` ${Math.max(0, Math.round(Number(minutes)))}分 至终点`
        : ` ${Math.max(0, Math.round(Number(minutes)))}分 至${toText || '起始站'}站`;
    title.appendChild(document.createTextNode(text));
    rowEl.appendChild(title);
    return rowEl;
};

export const createJourneySpecialLinePathRow = ({
    createElement,
    normalizeText,
    text
} = {}) => {
    const normalize = typeof normalizeText === 'function'
        ? normalizeText
        : (value) => String(value ?? '').trim();
    const specialText = normalize(text);
    if (!specialText) return null;
    const create = resolveCreateElement(createElement);
    const rowEl = create('div', 'station-row is-special');
    rowEl.appendChild(create('div', 'journey-plan-special-line', { text: specialText }));
    return rowEl;
};

export const createJourneyTransferPathRow = ({
    createElement,
    waitMinutes
} = {}) => {
    const create = resolveCreateElement(createElement);
    const rowEl = create('div', 'station-row is-transfer');
    const text = Number.isFinite(waitMinutes)
        ? `转车并等待 ${Math.max(0, Math.round(waitMinutes))}分`
        : '转车并等待';
    rowEl.appendChild(create('div', 'train-title-box', { text }));
    return rowEl;
};

export const createJourneyTripEmptyRow = ({
    createElement,
    message = '无详细停站信息'
} = {}) => {
    const create = resolveCreateElement(createElement);
    return create('div', 'journey-trip-empty', { text: message });
};

export const createJourneyTripTransferRow = ({
    createElement,
    label = '换乘'
} = {}) => {
    const create = resolveCreateElement(createElement);
    const transferRow = create('div', 'journey-trip-transfer-row');
    transferRow.appendChild(create('span', 'journey-trip-transfer-label', { text: label }));
    return transferRow;
};

export const createJourneyTripStationRow = ({
    departureText,
    isPast = false,
    lineColor = '',
    routeId = '',
    showDestination = false,
    stationCode = '',
    stationId,
    stationName = '',
    arrivalText
} = {}) => {
    const create = resolveCreateElement();
    const row = create('div', isPast ? 'journey-trip-row is-past' : 'journey-trip-row');
    const station = create('div', 'journey-trip-station');
    const safeStationId = String(stationId ?? '').trim();
    if (safeStationId) station.setAttribute('data-station-id', safeStationId);

    const code = String(stationCode ?? '').trim();
    if (code) {
        const badgeWrap = create('span', 'journey-trip-station-badge');
        const badge = createStationCodeBadgeElement({ code, color: lineColor, routeId, muted: isPast });
        if (badge) badgeWrap.appendChild(badge);
        station.appendChild(badgeWrap);
    }

    station.appendChild(create('span', 'journey-trip-station-name', { text: String(stationName || stationId || '') }));
    row.appendChild(station);

    const arrive = create('div', 'journey-trip-time journey-trip-arrive');
    if (arrivalText) arrive.appendChild(create('span', 'journey-trip-time-arrive', { text: arrivalText }));
    row.appendChild(arrive);

    const depart = create('div', 'journey-trip-time journey-trip-depart');
    if (showDestination) {
        depart.appendChild(create('span', 'journey-trip-time-arrive journey-trip-time-destination', { text: '目的地' }));
    } else if (departureText) {
        depart.appendChild(create('span', 'journey-trip-time-depart', { text: departureText }));
    }
    row.appendChild(depart);
    return row;
};
export const createJourneyPlanPageButton = ({
    active = false,
    createLabel,
    index,
    onClick
} = {}) => {
    const btn = document.createElement('button');
    btn.className = 'journey-plan-page-btn';
    btn.type = 'button';
    btn.textContent = String(createLabel?.(index) || '');
    if (active) btn.classList.add('is-active');
    if (typeof onClick === 'function') {
        btn.addEventListener('click', (evt) => {
            evt.preventDefault?.();
            evt.stopPropagation?.();
            onClick(index, evt);
        });
    }
    return btn;
};

export const createJourneyPaginationLabeler = ({ getRows, normalizeText } = {}) => {
    const normalize = typeof normalizeText === 'function'
        ? normalizeText
        : (value) => String(value ?? '').trim();

    return (label, index) => {
        const rows = typeof getRows === 'function' ? getRows() : [];
        const normalizedLabel = normalize(label);
        const labelMap = {};

        for (const row of Array.isArray(rows) ? rows : []) {
            const rowLabel = normalize(row?.label || '推荐');
            labelMap[rowLabel] = (labelMap[rowLabel] || 0) + 1;
        }

        if (labelMap[normalizedLabel] === 1) return normalizedLabel;

        let count = 0;
        for (let i = 0; i < index; i += 1) {
            const rowLabel = normalize(rows[i]?.label || '推荐');
            if (rowLabel === normalizedLabel) count += 1;
        }

        return `${normalizedLabel}${count + 1}`;
    };
};
