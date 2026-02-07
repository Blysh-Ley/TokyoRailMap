/**
 * 基于屏幕像素的简易“碰撞检测”。
 * 核心思想：
 * 1) 按 serving_lines.length 排序（越大优先级越高）
 * 2) 高优先级先放入网格；低优先级若与已放置元素重叠则隐藏
 *
 * 说明：这里的“网格”是用来加速碰撞判断（避免 O(n^2) 全量比对）。
 */

function bboxesIntersect(a, b) {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function gridKey(cx, cy) {
    return `${cx},${cy}`;
}

function measureLabelSize(label) {
    if (label.width != null && label.height != null) return;
    label.width = Math.max(1, label.el.offsetWidth);
    label.height = Math.max(1, label.el.offsetHeight);
}

function getLabelBBox(map, label) {
    const p = map.project(label.coordinates);
    const w = label.width;
    const h = label.height;
    const dy = Number.isFinite(label.labelDyPx) ? label.labelDyPx : 0;
    const left = p.x - w / 2;
    const right = p.x + w / 2;
    const bottom = p.y - dy;
    const top = bottom - h;
    return { left, right, top, bottom };
}

function circleRadiusPxAtZoom(zoom) {
    // 换乘站：随缩放变化 (6->0.5, 14->4, 22->4)
    if (zoom <= 6) return 0.5;
    if (zoom >= 14) return 4;
    const t = (zoom - 6) / (14 - 6);
    return 0.5 + t * (4 - 0.5);
}

function circleRadiusPxAtZoomNonTransfer(zoom) {
    // 非换乘站：更小一些 (6->0.5, 14->3.5, 22->3.5)
    if (zoom <= 6) return 0.5;
    if (zoom >= 14) return 3.5;
    const t = (zoom - 6) / (14 - 6);
    return 0.5 + t * (3.5 - 0.5);
}

function circleRadiusPxForStation(zoom, priority) {
    // priority === serving_lines.length
    if (priority === 1) return circleRadiusPxAtZoomNonTransfer(zoom);
    return circleRadiusPxAtZoom(zoom);
}

function circleStrokeWidthPxForStation(priority) {
    if (priority === 1) return 0;
    return 2;
}

/**
 * 绑定事件并执行碰撞计算。
 * - 文字：直接通过 DOM 的 display 控制显示/隐藏
 * - 圆点：通过 setFilter 过滤 stations-layer 中可见的站点 id
 */
export function setupCollisions(map, stationLabels, stationCircles, options = {}) {
    const gridCellPx = options.gridCellPx ?? 80;
    const getEnabledLineIds = options.getEnabledLineIds;
    const getLabelsVisible = options.getLabelsVisible;
    const getLabelMode = options.getLabelMode;
    // 线路联动作用范围：
    // - 'labels'：只影响站名显示（不影响圆点）
    // - 'labels_and_circles'：同时影响站名与圆点（默认）
    const lineFilterTarget = options.lineFilterTarget ?? 'labels_and_circles';

    let rafId = null;

    function isStationEnabledByLines(servingLineIds, enabledLineIdsSet) {
        // 未提供 enabledLineIds 时，默认不做线路联动限制
        if (!enabledLineIdsSet) return true;
        if (!Array.isArray(servingLineIds) || servingLineIds.length === 0) return false;
        for (const lineId of servingLineIds) {
            if (enabledLineIdsSet.has(lineId)) return true;
        }
        return false;
    }

    function updateStationLabelVisibility() {
        if (!stationLabels.length) return;

        const mode =
            (typeof getLabelMode === 'function' ? getLabelMode() : null) ??
            (typeof getLabelsVisible === 'function' ? (getLabelsVisible() ? 'auto' : 'off') : 'auto');

        if (mode === 'off') {
            stationLabels.forEach((label) => {
                label.el.style.display = 'none';
            });
            return;
        }

        const enabledLineIdsSet =
            lineFilterTarget === 'labels' || lineFilterTarget === 'labels_and_circles'
                ? (typeof getEnabledLineIds === 'function' ? getEnabledLineIds() : null)
                : null;

        if (mode === 'all') {
            stationLabels.forEach((label) => {
                if (!label.priority) {
                    label.el.style.display = 'none';
                    return;
                }
                if (!isStationEnabledByLines(label.servingLineIds, enabledLineIdsSet)) {
                    label.el.style.display = 'none';
                    return;
                }
                label.el.style.display = 'block';
            });
            return;
        }

        stationLabels.forEach((label) => {
            if (label.width == null || label.height == null || label.width <= 1 || label.height <= 1) {
                const prevDisplay = label.el.style.display;
                label.el.style.display = 'block';
                measureLabelSize(label);
                label.el.style.display = prevDisplay;
            }
        });

        const sorted = stationLabels
            .slice()
            .sort((a, b) => (b.priority - a.priority) || String(a.el.textContent).localeCompare(String(b.el.textContent)));

        const grid = new Map();

        sorted.forEach((label) => {
            if (!label.priority) {
                label.el.style.display = 'none';
                return;
            }

            if (!isStationEnabledByLines(label.servingLineIds, enabledLineIdsSet)) {
                label.el.style.display = 'none';
                return;
            }

            const bbox = getLabelBBox(map, label);
            const minCx = Math.floor(bbox.left / gridCellPx);
            const maxCx = Math.floor(bbox.right / gridCellPx);
            const minCy = Math.floor(bbox.top / gridCellPx);
            const maxCy = Math.floor(bbox.bottom / gridCellPx);

            let collides = false;
            for (let cx = minCx; cx <= maxCx && !collides; cx++) {
                for (let cy = minCy; cy <= maxCy && !collides; cy++) {
                    const key = gridKey(cx, cy);
                    const bucket = grid.get(key);
                    if (!bucket) continue;
                    for (let i = 0; i < bucket.length; i++) {
                        if (bboxesIntersect(bbox, bucket[i])) {
                            collides = true;
                            break;
                        }
                    }
                }
            }

            if (collides) {
                label.el.style.display = 'none';
                return;
            }

            label.el.style.display = 'block';
            for (let cx = minCx; cx <= maxCx; cx++) {
                for (let cy = minCy; cy <= maxCy; cy++) {
                    const key = gridKey(cx, cy);
                    if (!grid.has(key)) grid.set(key, []);
                    grid.get(key).push(bbox);
                }
            }
        });
    }

    function updateStationCircleVisibility() {
        if (!stationCircles.length) return;
        if (!map.getLayer('stations-layer')) return;

        const enabledLineIdsSet =
            lineFilterTarget === 'labels_and_circles'
                ? (typeof getEnabledLineIds === 'function' ? getEnabledLineIds() : null)
                : null;

        const sorted = stationCircles
            .slice()
            .sort((a, b) => (b.priority - a.priority) || String(a.stationId).localeCompare(String(b.stationId)));

        const zoom = map.getZoom();
        const grid = new Map();
        const visibleIds = [];

        sorted.forEach((station) => {
            if (!station.priority) return;

            if (!isStationEnabledByLines(station.servingLineIds, enabledLineIdsSet)) return;

            const radius = circleRadiusPxForStation(zoom, station.priority);
            const strokePadding = circleStrokeWidthPxForStation(station.priority);
            const r = radius + strokePadding;

            const p = map.project(station.coordinates);
            const bbox = {
                left: p.x - r,
                right: p.x + r,
                top: p.y - r,
                bottom: p.y + r
            };

            const minCx = Math.floor(bbox.left / gridCellPx);
            const maxCx = Math.floor(bbox.right / gridCellPx);
            const minCy = Math.floor(bbox.top / gridCellPx);
            const maxCy = Math.floor(bbox.bottom / gridCellPx);

            let collides = false;
            for (let cx = minCx; cx <= maxCx && !collides; cx++) {
                for (let cy = minCy; cy <= maxCy && !collides; cy++) {
                    const key = gridKey(cx, cy);
                    const bucket = grid.get(key);
                    if (!bucket) continue;
                    for (let i = 0; i < bucket.length; i++) {
                        if (bboxesIntersect(bbox, bucket[i])) {
                            collides = true;
                            break;
                        }
                    }
                }
            }

            if (collides) return;

            visibleIds.push(station.stationId);
            for (let cx = minCx; cx <= maxCx; cx++) {
                for (let cy = minCy; cy <= maxCy; cy++) {
                    const key = gridKey(cx, cy);
                    if (!grid.has(key)) grid.set(key, []);
                    grid.get(key).push(bbox);
                }
            }
        });

        if (!visibleIds.length) {
            map.setFilter('stations-layer', ['==', ['get', 'id'], '']);
            return;
        }

        map.setFilter('stations-layer', ['in', ['get', 'id'], ['literal', visibleIds]]);
    }

    function scheduleUpdate() {
        if (rafId != null) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            updateStationCircleVisibility();
            updateStationLabelVisibility();
        });
    }

    scheduleUpdate();
    map.on('move', scheduleUpdate);
    map.on('zoom', scheduleUpdate);
    map.on('resize', scheduleUpdate);

    return { scheduleUpdate };
}
