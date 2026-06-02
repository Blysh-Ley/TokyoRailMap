import { createStationCodeBadgeElement } from '../../lib/line-icons.js';

const toText = (value) => String(value ?? '').trim();

const escapeHtml = (input) => String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderStationCodeBadgeHtml = ({ stationCode = '', lineColor = '' } = {}) => {
    const code = toText(stationCode);
    if (!code) return '';

    try {
        const badge = createStationCodeBadgeElement({ code, color: toText(lineColor) });
        return badge?.outerHTML || '';
    } catch {
        return '';
    }
};

export const renderPanelTripDetailStationContentHtml = ({
    stationCode = '',
    stationName = '',
    stationId = '',
    lineColor = ''
} = {}) => {
    const name = toText(stationName || stationId);
    const badgeHtml = renderStationCodeBadgeHtml({ stationCode, lineColor });
    const badgeWrapHtml = badgeHtml
        ? `<span class="panel-trip-detail-station-badge" aria-hidden="true">${badgeHtml}</span>`
        : '';

    return `
        ${badgeWrapHtml}
        <span class="panel-dir-marquee panel-trip-detail-station-marquee" aria-label="${escapeHtml(name)}">
            <span class="panel-dir-marquee-inner panel-trip-detail-station-name">${escapeHtml(name)}</span>
        </span>
    `;
};

export const renderPanelTripDetailStationCellHtml = ({
    className = 'panel-trip-detail-station',
    style = '',
    dataStationId = '',
    lineId = '',
    lineColor = '',
    stationCode = '',
    stationName = '',
    stationId = ''
} = {}) => {
    const attrs = [
        `class="${escapeHtml(toText(className))}"`,
        toText(style) ? `style="${escapeHtml(style)}"` : '',
        toText(dataStationId) ? `data-station-id="${escapeHtml(dataStationId)}"` : '',
        toText(lineId) ? `data-line-id="${escapeHtml(lineId)}"` : '',
        toText(lineColor) ? `data-line-color="${escapeHtml(lineColor)}"` : ''
    ].filter(Boolean).join(' ');

    return `<div ${attrs}>${renderPanelTripDetailStationContentHtml({
        stationCode,
        stationName,
        stationId,
        lineColor
    })}</div>`;
};

export const renderPanelTripDetailStopRowHtml = ({
    rowClass = '',
    stationClass = '',
    arriveCellClass = '',
    departCellClass = '',
    arriveTextClass = '',
    departTextClass = '',
    stationId = '',
    stationCode = '',
    stationName = '',
    lineColor = '',
    arrivalLabelHtml = '',
    departLabelHtml = '',
    arrivalText = '',
    departureText = ''
} = {}) => {
    const arriveHtml = toText(arrivalText) && toText(arriveTextClass)
        ? `<span class="${escapeHtml(arriveTextClass)}">${escapeHtml(arrivalText)}</span>`
        : '';
    const departHtml = toText(departureText) && toText(departTextClass)
        ? `<span class="${escapeHtml(departTextClass)}">${escapeHtml(departureText)}</span>`
        : '';

    return `
        <div class="${escapeHtml(rowClass)}">
            ${renderPanelTripDetailStationCellHtml({
                className: stationClass,
                dataStationId: stationId,
                lineColor,
                stationCode,
                stationName,
                stationId
            })}
            <div class="${escapeHtml(arriveCellClass)}">${arrivalLabelHtml || ''}${arriveHtml}</div>
            <div class="${escapeHtml(departCellClass)}">${departLabelHtml || ''}${departHtml}</div>
        </div>
    `;
};
