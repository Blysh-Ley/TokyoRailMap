import { createLineIconElement, createStationCodeBadgeElement, getResolvedRouteIconMeta, getRoutesIndex } from '../lib/line-icons.js';
import { appendStationJumpClass } from './stationJump.js';
import { layoutLineServiceDiagram } from './lineServiceDiagramLayout.js';

const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const iconHtml = (element, size = 20) => {
    if (!element) return '';
    element.classList.add('route-map-through-line-icon');
    element.style.width = element.style.height = `${size}px`;
    element.style.minWidth = element.style.minHeight = `${size}px`;
    return element.outerHTML;
};
const transferItem = (entry) => {
    const element = entry.stationCode
        ? createStationCodeBadgeElement({ code: entry.stationCode, color: entry.iconColor, routeId: entry.iconRouteId })
        : createLineIconElement({ routeId: entry.iconRouteId || entry.routeId, code: entry.iconCode, color: entry.iconColor || entry.lineColor });
    return `<span class="route-map-transfer-item">${iconHtml(element)}<span class="route-map-transfer-line-name" style="color:${escapeHtml(entry.lineColor)}">${escapeHtml(entry.displayName)}</span></span>`;
};
const transferRows = (items) => {
    const rows = [];
    for (let index = 0; index < items.length; index += 5) rows.push(`<span class="route-map-transfer-row">${items.slice(index, index + 5).join('')}</span>`);
    return rows.join('');
};

// 一次消费完整处理结果，生成全部种别与分支；不在绘图侧筛选班次。
export const renderLineServiceDiagram = async (data, { resolveColor = (color) => color } = {}) => {
    if (!data.trainTypes.length || !data.topology.stations.length) return { headHtml: '', bodyHtml: '<div class="route-map-empty">当前无可用班次</div>', layout: null };
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = '13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    const sizes = new Map(data.topology.stations.map((station) => [station.id, {
        labelWidth: Math.ceil(measure.measureText(station.name).width) + (station.stationBadges.length ? station.stationBadges.length * 22 + 4 : 0),
        transferWidth: Math.min(5, station.transfers.length) * 22,
        height: Math.max(22, Math.ceil(station.transfers.length / 5) * 24 - 4)
    }]));
    const routesIndex = await getRoutesIndex();
    const lineMeta = new Map();
    await Promise.all([...new Set(data.topology.stations.flatMap((station) => station.stationBadges.map((badge) => badge.lineId)))].map(async (id) => lineMeta.set(id, await getResolvedRouteIconMeta(id))));
    measure.font = '500 19.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    const lineSizes = new Map(data.topology.lineOrders.map((line) => [line.lineId, {
        width: Math.ceil(measure.measureText(line.name).width) + (routesIndex.get(line.lineId)?.code ? 36 : 0), height: 30
    }]));
    const layout = layoutLineServiceDiagram(data, sizes, lineSizes);
    const types = data.serviceLegend;
    const tracks = [], markers = [], connectors = [], transferDots = [], capsules = [], labels = [], transfers = [];
    const mainStations = new Set(data.selectedLine.stationOrder);
    // 先画直行区段，再画转弯区段；主线描边不能擦掉分岔的连接和弧线。
    const drawingEdges = data.topology.edges.slice().sort((a, b) => Number(layout.bends.has(a.id)) - Number(layout.bends.has(b.id)));
    for (const edge of drawingEdges) {
        const edgeTracks = [], clearances = [];
        for (const { type, path, lineIds } of layout.serviceTracks.get(edge.id)) {
            clearances.push(`<path class="route-map-service-track-clearance" d="${path}"/>`);
            edgeTracks.push(`<path class="route-map-service-track" data-type-id="${escapeHtml(type.id)}" data-source-type-ids="${escapeHtml(type.sourceTypeIds.join(' '))}" data-line-ids="${escapeHtml(lineIds.join(' '))}" data-edge-id="${edge.id}" data-source-color="${escapeHtml(type.color)}" d="${path}" stroke="${escapeHtml(resolveColor(type.color))}"/>`);
        }
        // 背景描边让几何交叉保留断口，避免把无连接的边看成分岔。
        tracks.push(`<g>${clearances.join('')}${edgeTracks.join('')}</g>`);
    }
    for (const station of data.topology.stations) {
        const point = layout.positions.get(station.id), metrics = sizes.get(station.id);
        const isTransfer = station.transfers.length > 0;
        const capsule = layout.stationCapsules.get(station.id);
        if (capsule) capsules.push(`<rect class="route-map-diagram-station-capsule" data-capsule-station="${escapeHtml(station.id)}" x="${capsule.x}" y="${capsule.y}" width="${capsule.width}" height="${capsule.height}" rx="6"><title>${escapeHtml(station.name)}，线路与种别区段接续</title></rect>`);
        const link = (layout.stationLinks || []).find((link) => link.from === station.id);
        if (!capsule && !point.hideLabel && (isTransfer || link)) {
            const end = link ? layout.positions.get(link.to) : point;
            // 同站连接与换乘连接共用一条水平线，换乘信息只显示一份。
            const fromX = isTransfer ? point.x + point.leftTrackOffset - 8 : point.x + point.leftTrackOffset;
            const relation = link ? ` data-station-link="${escapeHtml(station.id)}"` : '';
            connectors.push(`<line class="route-map-diagram-transfer-line${link ? ' route-map-diagram-station-link' : ''}"${relation} x1="${fromX}" y1="${point.y}" x2="${end.x + end.rightTrackOffset}" y2="${end.y}">${link ? `<title>${escapeHtml(station.name)}，同站的两个站序位置</title>` : ''}</line>`);
        }
        for (const marker of capsule ? [] : layout.serviceStops.get(station.id)) {
            const { type, x, y } = marker;
            const description = `${station.name}，${type.name}：${marker.directions.map((direction) => `${direction.names.join(' / ')}${direction.stops ? '停车' : '不停车'}`).join('，')}`;
            const attributes = `data-stop-type="${escapeHtml(type.id)}" data-source-type-ids="${escapeHtml(marker.sourceTypeIds.join(' '))}" data-stop-station="${escapeHtml(station.id)}"`;
            if (marker.round) markers.push(`<circle ${attributes} class="route-map-diagram-stop${isTransfer ? ' is-transfer' : ''}" cx="${x}" cy="${y}" r="3.5"><title>${escapeHtml(description)}</title></circle>`);
            else markers.push(`<path ${attributes} class="route-map-diagram-direction-stop${isTransfer ? ' is-transfer' : ''}" d="${marker.path}"><title>${escapeHtml(description)}</title></path>`);
            if (isTransfer) {
                transferDots.push(`<circle class="route-map-diagram-transfer-dot" cx="${x}" cy="${marker.dotY}" r="1"/>`);
            }
        }
        if (point.hideLabel) continue;
        const badges = station.stationBadges.map((badge) => {
            const meta = lineMeta.get(badge.lineId);
            const color = mainStations.has(station.id) && badge.stationId === station.displayStationId ? data.selectedLine.color : badge.color || meta?.color;
            return iconHtml(createStationCodeBadgeElement({ code: badge.code, color, routeId: meta?.id || badge.lineId }));
        }).join('');
        labels.push(`<span class="${appendStationJumpClass('route-map-station route-map-diagram-station')}${mainStations.has(station.id) ? ' is-main-line' : ''}" data-station-id="${escapeHtml(station.displayStationId)}" data-panel-station-jump="1" role="button" tabindex="0" title="${escapeHtml(station.name)}" style="left:${point.x + (point.labelOffset ?? point.rightTrackOffset + 6)}px;top:${point.y}px">${badges}<span>${escapeHtml(station.name)}</span></span>`);
        if (isTransfer) {
            const rows = transferRows(station.transfers.map(transferItem));
            transfers.push(`<span class="route-map-diagram-transfers" data-transfer-station="${escapeHtml(station.id)}" style="left:${point.x + point.leftTrackOffset - 14 - metrics.transferWidth}px;top:${point.y}px;width:${metrics.transferWidth}px"><span class="route-map-transfer-items-shell" tabindex="0" aria-label="${escapeHtml(station.name)}，换乘线路：${station.transfers.length}条"><span class="route-map-transfer-items route-map-transfer-items-main">${rows}</span><span class="route-map-transfer-hover-panel" role="tooltip"><span class="route-map-transfer-items route-map-transfer-items-popover">${rows}</span></span></span></span>`);
        }
    }
    const lineOrders = new Map(data.topology.lineOrders.map((line) => [line.lineId, line]));
    const lineLabels = layout.lineLabels.map((label) => {
        const line = lineOrders.get(label.lineId), meta = routesIndex.get(label.lineId);
        const color = meta?.color || data.selectedLine.color;
        const icon = meta?.code ? createLineIconElement({ routeId: label.lineId, code: meta.code, color }) : null;
        return `<span class="route-map-diagram-line-label is-${label.side}" data-line-id="${escapeHtml(label.lineId)}" data-source-color="${escapeHtml(color)}" style="left:${label.x}px;top:${label.y}px;color:${escapeHtml(resolveColor(color))}">${iconHtml(icon, 30)}<span>${escapeHtml(line.name)}</span></span>`;
    });
    const legend = types.map((type) => {
        const direction = type.directions.length === 1 ? type.directions[0] : null;
        const directionLabel = direction ? `仅${direction.names.join(' / ')}运行` : '';
        const symbol = direction ? `<span class="route-map-diagram-type-direction" role="img" title="${escapeHtml(directionLabel)}" aria-label="${escapeHtml(directionLabel)}">${direction.ascending ? '△' : '▽'}</span>` : '';
        return `<span class="route-map-diagram-type" data-type-id="${escapeHtml(type.id)}" data-source-color="${escapeHtml(type.color)}" style="color:${escapeHtml(resolveColor(type.color))}"><i></i>${escapeHtml(type.name)}${symbol}</span>`;
    }).join('');
    return {
        layout,
        headHtml: `<div class="route-map-diagram-legend">${legend}</div>`,
        bodyHtml: `<div class="route-map-diagram-viewport" tabindex="0" aria-label="${escapeHtml(data.selectedLine.name)}种别停站图，可拖动和缩放"><div class="route-map-grid route-map-diagram-canvas" style="width:${layout.width}px;height:${layout.height}px"><svg class="route-map-diagram-svg" xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="全部种别、分支与停站轨迹"><g>${tracks.join('')}</g><g>${markers.join('')}</g><g>${connectors.join('')}${transferDots.join('')}</g><g>${capsules.join('')}</g></svg>${labels.join('')}${transfers.join('')}${lineLabels.join('')}</div></div>`
    };
};
