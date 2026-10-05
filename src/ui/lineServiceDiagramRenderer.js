import { createLineIconElement, createStationCodeBadgeElement, getResolvedRouteIconMeta, getRoutesIndex } from '../lib/line-icons.js';
import { appendStationJumpClass } from './stationJump.js';
import { buildServiceTrackPath, layoutLineServiceDiagram } from './lineServiceDiagramLayout.js';
import { getRouteIdFromStationId } from '../domain/transferBadgeDisplay.js';

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
        labelWidth: Math.ceil(measure.measureText(station.name).width) + (station.code ? 26 : 0),
        transferWidth: Math.min(5, station.transfers.length) * 22,
        height: Math.max(22, Math.ceil(station.transfers.length / 5) * 22)
    }]));
    const routesIndex = await getRoutesIndex();
    const stationLineIds = new Map(data.topology.stations.map((station) => [station.id, getRouteIdFromStationId(station.displayStationId)]));
    const lineMeta = new Map();
    await Promise.all([...new Set(stationLineIds.values())].map(async (id) => lineMeta.set(id, await getResolvedRouteIconMeta(id))));
    measure.font = '500 19.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    const lineSizes = new Map(data.topology.lineOrders.map((line) => [line.lineId, {
        width: Math.ceil(measure.measureText(line.name).width) + (routesIndex.get(line.lineId)?.code ? 36 : 0), height: 30
    }]));
    const layout = layoutLineServiceDiagram(data, sizes, lineSizes);
    const types = data.trainTypes;
    const laneOffset = (index) => (index - (types.length - 1) / 2) * 12;
    const directions = data.directions.slice();
    const primary = directions.find((direction) => direction.id === 'Outbound') || directions[0];
    const secondary = directions.find((direction) => direction.id !== primary.id);
    const tracks = [], markers = [], connectors = [], transferDots = [], labels = [], transfers = [];
    const mainStations = new Set(data.selectedLine.stationOrder);
    const edgeTypes = new Map(data.topology.edges.map((edge) => [edge.id, new Set()]));
    const stopsByType = types.map((type) => new Map(type.directions.map((direction) => [direction.id, new Set(direction.stopStationIds)])));
    for (const type of types) for (const direction of type.directions) for (const edgeId of direction.edgeIds) edgeTypes.get(edgeId).add(type.id);
    // 先画直行区段，再画转弯区段；主线描边不能擦掉分岔的连接和弧线。
    const drawingEdges = data.topology.edges.slice().sort((a, b) => Number(layout.bends.has(a.id)) - Number(layout.bends.has(b.id)));
    for (const edge of drawingEdges) {
        const a = layout.positions.get(edge.from), b = layout.positions.get(edge.to);
        const edgeTracks = [], clearances = [];
        for (let index = 0; index < types.length; index += 1) {
            const type = types[index];
            if (!edgeTypes.get(edge.id).has(type.id)) continue;
            const path = buildServiceTrackPath(a, b, laneOffset(index), layout.loops.has(edge.id) ? layout.loopX : null, layout.bends.get(edge.id));
            clearances.push(`<path class="route-map-service-track-clearance" d="${path}"/>`);
            edgeTracks.push(`<path class="route-map-service-track" data-type-id="${escapeHtml(type.id)}" data-edge-id="${edge.id}" data-source-color="${escapeHtml(type.color)}" d="${path}" stroke="${escapeHtml(resolveColor(type.color))}"/>`);
        }
        // 背景描边让几何交叉保留断口，避免把无连接的边看成分岔。
        tracks.push(`<g>${clearances.join('')}${edgeTracks.join('')}</g>`);
    }
    for (const station of data.topology.stations) {
        const point = layout.positions.get(station.id), metrics = sizes.get(station.id);
        const isTransfer = station.transfers.length > 0;
        if (isTransfer) connectors.push(`<line class="route-map-diagram-transfer-line" x1="${point.x - layout.laneWidth / 2 - 8}" y1="${point.y}" x2="${point.x + point.rightTrackOffset}" y2="${point.y}"/>`);
        for (let index = 0; index < types.length; index += 1) {
            const stops = stopsByType[index];
            const up = stops.get(primary.id)?.has(station.id), down = secondary && stops.get(secondary.id)?.has(station.id);
            // 单方向种别在顶部统一说明方向，图内停站标记使用圆形。
            const roundStop = stops.size === 1 || (up && (down || !secondary));
            const x = point.x + laneOffset(index), y = point.y;
            const description = `${station.name}，${types[index].name}：${directions.map((direction) => `${direction.name}${stops.get(direction.id)?.has(station.id) ? '停车' : '不停车'}`).join('，')}`;
            if ((up || down) && roundStop) markers.push(`<circle data-stop-type="${escapeHtml(types[index].id)}" data-stop-station="${escapeHtml(station.id)}" class="route-map-diagram-stop${isTransfer ? ' is-transfer' : ''}" cx="${x}" cy="${y}" r="3.5"><title>${escapeHtml(description)}</title></circle>`);
            else if (up || down) {
                const sign = up ? -1 : 1;
                markers.push(`<path data-stop-type="${escapeHtml(types[index].id)}" data-stop-station="${escapeHtml(station.id)}" class="route-map-diagram-direction-stop${isTransfer ? ' is-transfer' : ''}" d="M${x},${y + sign * 5.2}L${x - 4.4},${y - sign * 3.1}L${x + 4.4},${y - sign * 3.1}Z"><title>${escapeHtml(description)}</title></path>`);
            }
            if (isTransfer && (up || down)) {
                // 黑点放在圆心或三角形重心，保持上下朝向的视觉平衡。
                const dotY = roundStop ? y : y + (up ? 1 : -1) / 3;
                transferDots.push(`<circle class="route-map-diagram-transfer-dot" cx="${x}" cy="${dotY}" r="1"/>`);
            }
        }
        const meta = lineMeta.get(stationLineIds.get(station.id));
        const badge = station.code ? createStationCodeBadgeElement({ code: station.code, color: mainStations.has(station.id) ? data.selectedLine.color : meta?.color, routeId: meta?.id || stationLineIds.get(station.id) }) : null;
        labels.push(`<span class="${appendStationJumpClass('route-map-station route-map-diagram-station')}${mainStations.has(station.id) ? ' is-main-line' : ''}" data-station-id="${escapeHtml(station.displayStationId)}" data-panel-station-jump="1" role="button" tabindex="0" title="${escapeHtml(station.name)}" style="left:${point.x + point.rightTrackOffset + 6}px;top:${point.y}px">${iconHtml(badge)}<span>${escapeHtml(station.name)}</span></span>`);
        if (isTransfer) {
            const rows = transferRows(station.transfers.map(transferItem));
            transfers.push(`<span class="route-map-diagram-transfers" data-transfer-station="${escapeHtml(station.id)}" style="left:${point.x - layout.laneWidth / 2 - 14 - metrics.transferWidth}px;top:${point.y}px;width:${metrics.transferWidth}px"><span class="route-map-transfer-items-shell" tabindex="0" aria-label="${escapeHtml(station.name)}，换乘线路：${station.transfers.length}条"><span class="route-map-transfer-items route-map-transfer-items-main">${rows}</span><span class="route-map-transfer-hover-panel" role="tooltip"><span class="route-map-transfer-items route-map-transfer-items-popover">${rows}</span></span></span></span>`);
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
        const direction = type.directions.length === 1 ? directions.find((entry) => entry.id === type.directions[0].id) : null;
        const directionLabel = direction ? `仅${direction.name}运行` : '';
        const symbol = direction ? `<span class="route-map-diagram-type-direction" role="img" title="${escapeHtml(directionLabel)}" aria-label="${escapeHtml(directionLabel)}">${direction.id === primary.id ? '△' : '▽'}</span>` : '';
        return `<span class="route-map-diagram-type" data-type-id="${escapeHtml(type.id)}" data-source-color="${escapeHtml(type.color)}" style="color:${escapeHtml(resolveColor(type.color))}"><i></i>${escapeHtml(type.name)}${symbol}</span>`;
    }).join('');
    return {
        layout,
        headHtml: `<div class="route-map-diagram-legend">${legend}</div>`,
        bodyHtml: `<div class="route-map-diagram-viewport" tabindex="0" aria-label="${escapeHtml(data.selectedLine.name)}种别停站图，可拖动和缩放"><div class="route-map-grid route-map-diagram-canvas" style="width:${layout.width}px;height:${layout.height}px"><svg class="route-map-diagram-svg" xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="全部种别、分支与停站轨迹"><g>${tracks.join('')}</g><g>${markers.join('')}</g><g>${connectors.join('')}${transferDots.join('')}</g></svg>${labels.join('')}${transfers.join('')}${lineLabels.join('')}</div></div>`
    };
};
