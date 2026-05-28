/**
 * 基于屏幕像素的简易“碰撞检测”。
 * 核心思想：
 * 1) 按 serving_ids.length 排序（越大优先级越高）
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

const resolveMapAdapter = (mapOrEngine) => ({
    getZoom: () => mapOrEngine?.getZoom?.(),
    hasLayer: (layerId) => (
        typeof mapOrEngine?.hasLayer === 'function'
            ? mapOrEngine.hasLayer(layerId)
            : Boolean(layerId && mapOrEngine?.getLayer?.(layerId))
    ),
    on: (...args) => mapOrEngine?.on?.(...args),
    project: (...args) => mapOrEngine?.project?.(...args),
    setFilter: (...args) => mapOrEngine?.setFilter?.(...args)
});

function getLabelBBox(mapAdapter, label) {
    const p = mapAdapter.project(label.coordinates);
    const w = label.width;
    const h = label.height;
    const left = p.x - w / 2;
    const right = p.x + w / 2;

    // 固定 popup：可将某个站名移动至站点正下方
    if (label && label.labelPosition === 'below') {
        const pad = Number.isFinite(label.labelBelowPadPx) ? label.labelBelowPadPx : 0;
        const top = p.y + pad;
        const bottom = top + h;
        return { left, right, top, bottom };
    }

    const dy = Number.isFinite(label.labelDyPx) ? label.labelDyPx : 0;
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
    // priority === serving_ids.length
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
export function setupCollisions(mapOrEngine, stationLabels, stationCircles, options = {}) {
    const mapAdapter = resolveMapAdapter(mapOrEngine);
    const gridCellPx = options.gridCellPx ?? 80;
    const getEnabledLineIds = options.getEnabledLineIds;
    const getLabelsVisible = options.getLabelsVisible;
    const getLabelMode = options.getLabelMode;
    const getCircleMode = options.getCircleMode;
    const getVisibleStationIds = options.getVisibleStationIds;
    const getPinnedStationId = options.getPinnedStationId;
    const shouldHideStation = typeof options.shouldHideStation === 'function'
        ? options.shouldHideStation
        : null;
    const onCircleCollisionResolved = typeof options.onCircleCollisionResolved === 'function'
        ? options.onCircleCollisionResolved
        : null;
    const shouldThinAutoLabels = typeof options.shouldThinAutoLabels === 'function'
        ? options.shouldThinAutoLabels
        : null;
    const lowZoomLabelThinMaxZoom = Number.isFinite(options.lowZoomLabelThinMaxZoom)
        ? Number(options.lowZoomLabelThinMaxZoom)
        : 13;
    const lowZoomLabelKeepRatioRaw = Number.isFinite(options.lowZoomLabelKeepRatio)
        ? Number(options.lowZoomLabelKeepRatio)
        : 0.5;
    const lowZoomLabelKeepRatio = Math.min(1, Math.max(0, lowZoomLabelKeepRatioRaw));
    const transferGroupByStationId = options.transferGroupByStationId instanceof Map
        ? options.transferGroupByStationId
        : null;
    // 线路联动作用范围：
    // - 'labels'：只影响站名显示（不影响圆点）
    // - 'labels_and_circles'：同时影响站名与圆点（默认）
    const lineFilterTarget = options.lineFilterTarget ?? 'labels_and_circles';

    let rafId = null;

    const toTransferGroupKey = (groupSet) => {
        if (!(groupSet instanceof Set) || !groupSet.size) return '';
        return Array.from(groupSet).map((x) => String(x || '').trim()).filter(Boolean).sort().join('|');
    };

    const applyTransferCapsuleGroupFilter = (groupIds) => {
        const ids = Array.isArray(groupIds) ? groupIds.filter(Boolean) : [];
        const has = ids.length > 0;
        const lineFilter = has
            ? ['all', ['!=', ['get', 'fallbackCircle'], 1], ['in', ['get', 'groupId'], ['literal', ids]]]
            : ['all', ['!=', ['get', 'fallbackCircle'], 1], ['==', ['get', 'groupId'], '']];
        const fallbackFilter = has
            ? ['all', ['==', ['get', 'fallbackCircle'], 1], ['in', ['get', 'groupId'], ['literal', ids]]]
            : ['all', ['==', ['get', 'fallbackCircle'], 1], ['==', ['get', 'groupId'], '']];

        try {
            if (mapAdapter.hasLayer('transfer-capsule-outline-layer')) mapAdapter.setFilter('transfer-capsule-outline-layer', lineFilter);
            if (mapAdapter.hasLayer('transfer-capsule-inner-layer')) mapAdapter.setFilter('transfer-capsule-inner-layer', lineFilter);
            if (mapAdapter.hasLayer('transfer-capsule-fallback-circle-outline-layer')) mapAdapter.setFilter('transfer-capsule-fallback-circle-outline-layer', fallbackFilter);
            if (mapAdapter.hasLayer('transfer-capsule-fallback-circle-inner-layer')) mapAdapter.setFilter('transfer-capsule-fallback-circle-inner-layer', fallbackFilter);
        } catch {
            // ignore
        }
    };

    function isStationEnabledByLines(servingLineIds, enabledLineIdsSet) {
        // 未提供 enabledLineIds 时，默认不做线路联动限制
        if (!enabledLineIdsSet) return true;
        if (!Array.isArray(servingLineIds) || servingLineIds.length === 0) return false;
        for (const lineId of servingLineIds) {
            if (enabledLineIdsSet.has(lineId)) return true;
        }
        return false;
    }

    function isStationEnabledByExplicitIds(stationId, explicitIdsSet) {
        if (!explicitIdsSet) return true;
        const id = String(stationId ?? '').trim();
        if (!id) return false;
        return explicitIdsSet.has(id);
    }

    function shouldHideByOpacity(stationLike, explicitIdsSet) {
        if (!stationLike?.hiddenByOpacityZero) return false;
        // 车次预览显式要求展示的站点，允许显示站名（用于 opacity:0 线段上的停靠站）
        if (explicitIdsSet && isStationEnabledByExplicitIds(stationLike.stationId, explicitIdsSet)) return false;
        return true;
    }

    function shouldHideByExternalRule(stationLike, explicitIdsSet) {
        if (!shouldHideStation) return false;
        try {
            return shouldHideStation(stationLike, { explicitIdsSet }) === true;
        } catch {
            return false;
        }
    }

    function updateStationLabelVisibility() {
        if (!stationLabels.length) return;

        const pinnedId = typeof getPinnedStationId === 'function' ? getPinnedStationId() : null;

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
        const explicitIdsSet = typeof getVisibleStationIds === 'function' ? getVisibleStationIds() : null;

        if (mode === 'all') {
            stationLabels.forEach((label) => {
                if (label.forceHiddenByTransferCollapse) {
                    label.el.style.display = 'none';
                    return;
                }
                if (!label.priority) {
                    label.el.style.display = 'none';
                    return;
                }
                if (shouldHideByExternalRule(label, explicitIdsSet)) {
                    label.el.style.display = 'none';
                    return;
                }
                if (shouldHideByOpacity(label, explicitIdsSet)) {
                    label.el.style.display = 'none';
                    return;
                }
                if (!isStationEnabledByLines(label.servingLineIds, enabledLineIdsSet)) {
                    label.el.style.display = 'none';
                    return;
                }
                if (!isStationEnabledByExplicitIds(label.stationId, explicitIdsSet)) {
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
            .sort((a, b) => {
                const aPinned = pinnedId != null && String(a.stationId) === String(pinnedId);
                const bPinned = pinnedId != null && String(b.stationId) === String(pinnedId);
                if (aPinned && !bPinned) return -1;
                if (!aPinned && bPinned) return 1;
                const aBoost = Number(a.collisionPriorityBoost) || 0;
                const bBoost = Number(b.collisionPriorityBoost) || 0;
                if (aBoost !== bBoost) return bBoost - aBoost;
                return (b.priority - a.priority) || String(a.el.textContent).localeCompare(String(b.el.textContent));
            });

        const grid = new Map();
        const visibleAfterCollision = [];

        sorted.forEach((label) => {
            if (label.forceHiddenByTransferCollapse) {
                label.el.style.display = 'none';
                return;
            }
            if (!label.priority) {
                label.el.style.display = 'none';
                return;
            }

            if (shouldHideByExternalRule(label, explicitIdsSet)) {
                label.el.style.display = 'none';
                return;
            }

            if (shouldHideByOpacity(label, explicitIdsSet)) {
                label.el.style.display = 'none';
                return;
            }

            if (!isStationEnabledByLines(label.servingLineIds, enabledLineIdsSet)) {
                label.el.style.display = 'none';
                return;
            }
            if (!isStationEnabledByExplicitIds(label.stationId, explicitIdsSet)) {
                label.el.style.display = 'none';
                return;
            }

            const bbox = getLabelBBox(mapAdapter, label);
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

            visibleAfterCollision.push(label);
            for (let cx = minCx; cx <= maxCx; cx++) {
                for (let cy = minCy; cy <= maxCy; cy++) {
                    const key = gridKey(cx, cy);
                    if (!grid.has(key)) grid.set(key, []);
                    grid.get(key).push(bbox);
                }
            }
        });

        const shouldApplyLowZoomThin = shouldThinAutoLabels?.() === true
            && mapAdapter.getZoom() < lowZoomLabelThinMaxZoom
            && visibleAfterCollision.length > 0;

        if (!shouldApplyLowZoomThin) {
            visibleAfterCollision.forEach((label) => {
                label.el.style.display = 'block';
            });
            return;
        }

        const keepCount = Math.ceil(visibleAfterCollision.length * lowZoomLabelKeepRatio);
        visibleAfterCollision.forEach((label, index) => {
            label.el.style.display = index < keepCount ? 'block' : 'none';
        });
    }

    function updateStationCircleVisibility() {
        if (!stationCircles.length) return;
        if (!mapAdapter.hasLayer('stations-layer')) return;

        const hiddenExpr = ['!=', ['get', 'hidden_by_opacity_zero'], 1];

        const circleMode = (typeof getCircleMode === 'function' ? getCircleMode() : null) ?? 'collide';

        const enabledLineIdsSet =
            lineFilterTarget === 'labels_and_circles'
                ? (typeof getEnabledLineIds === 'function' ? getEnabledLineIds() : null)
                : null;
        const explicitIdsSet = typeof getVisibleStationIds === 'function' ? getVisibleStationIds() : null;

        // 在需要“全部显示圆点”时，跳过碰撞计算（避免缩小地图后圆点被隐藏）
        if (circleMode === 'all') {
            const visibleIds = [];
            const visibleCapsuleGroupKeys = new Set();
            for (const station of stationCircles) {
                if (!station.priority) continue;
                if (station.hiddenByOpacityZero) continue;
                if (shouldHideByExternalRule(station, explicitIdsSet)) continue;
                if (!isStationEnabledByLines(station.servingLineIds, enabledLineIdsSet)) continue;
                if (!isStationEnabledByExplicitIds(station.stationId, explicitIdsSet)) continue;
                visibleIds.push(station.stationId);

                const transferGroup = transferGroupByStationId?.get?.(station.stationId);
                const groupKey = toTransferGroupKey(transferGroup);
                if (groupKey) visibleCapsuleGroupKeys.add(groupKey);
            }

            if (!visibleIds.length) {
                mapAdapter.setFilter('stations-layer', ['all', hiddenExpr, ['==', ['get', 'id'], '']]);
                applyTransferCapsuleGroupFilter([]);
                try {
                    onCircleCollisionResolved?.({
                        visibleStationIds: new Set(),
                        visibleCapsuleGroupKeys: new Set()
                    });
                } catch {
                    // ignore
                }
                return;
            }

            mapAdapter.setFilter('stations-layer', ['all', hiddenExpr, ['in', ['get', 'id'], ['literal', visibleIds]]]);
            applyTransferCapsuleGroupFilter(Array.from(visibleCapsuleGroupKeys));
            try {
                onCircleCollisionResolved?.({
                    visibleStationIds: new Set(visibleIds),
                    visibleCapsuleGroupKeys: new Set(visibleCapsuleGroupKeys)
                });
            } catch {
                // ignore
            }
            return;
        }

        const entityByKey = new Map();
        for (const station of stationCircles) {
            if (!station.priority) continue;
            if (station.hiddenByOpacityZero) continue;
            if (shouldHideByExternalRule(station, explicitIdsSet)) continue;
            if (!isStationEnabledByLines(station.servingLineIds, enabledLineIdsSet)) continue;
            if (!isStationEnabledByExplicitIds(station.stationId, explicitIdsSet)) continue;

            const transferGroup = transferGroupByStationId?.get?.(station.stationId);
            const transferIds = transferGroup instanceof Set && transferGroup.size > 1
                ? Array.from(transferGroup).map((x) => String(x || '').trim()).filter(Boolean).sort()
                : [String(station.stationId || '').trim()];
            const key = transferIds.join('|');
            if (!key) continue;

            if (!entityByKey.has(key)) {
                entityByKey.set(key, {
                    key,
                    stationIds: transferIds,
                    transferCount: transferIds.length,
                    priority: Number(station.priority) || 1,
                    points: []
                });
            }

            const entity = entityByKey.get(key);
            entity.priority = Math.max(entity.priority, Number(station.priority) || 1);
            if (Array.isArray(station.coordinates) && station.coordinates.length >= 2) {
                entity.points.push(station.coordinates);
            }
        }

        const sorted = Array.from(entityByKey.values())
            .sort((a, b) => (b.transferCount - a.transferCount) || (b.priority - a.priority) || String(a.key).localeCompare(String(b.key)));

        const zoom = mapAdapter.getZoom();
        const grid = new Map();
        const visibleIds = new Set();
        const visibleCapsuleGroupKeys = new Set();

        sorted.forEach((entity) => {
            if (!entity?.stationIds?.length || !entity?.points?.length) return;

            let bbox = null;
            if (entity.transferCount > 1) {
                // 将换乘胶囊整体作为一个碰撞元素：包围盒覆盖整组站点并加上胶囊线宽余量。
                let minX = Number.POSITIVE_INFINITY;
                let maxX = Number.NEGATIVE_INFINITY;
                let minY = Number.POSITIVE_INFINITY;
                let maxY = Number.NEGATIVE_INFINITY;
                for (const c of entity.points) {
                    const p = mapAdapter.project(c);
                    minX = Math.min(minX, p.x);
                    maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y);
                    maxY = Math.max(maxY, p.y);
                }
                if (![minX, maxX, minY, maxY].every(Number.isFinite)) return;
                const capsulePadding = Math.max(2, circleRadiusPxForStation(zoom, Math.max(2, entity.priority)) + 4);
                bbox = {
                    left: minX - capsulePadding,
                    right: maxX + capsulePadding,
                    top: minY - capsulePadding,
                    bottom: maxY + capsulePadding
                };
            } else {
                const radius = circleRadiusPxForStation(zoom, entity.priority);
                const strokePadding = circleStrokeWidthPxForStation(entity.priority);
                const r = radius + strokePadding;
                const p = mapAdapter.project(entity.points[0]);
                bbox = {
                    left: p.x - r,
                    right: p.x + r,
                    top: p.y - r,
                    bottom: p.y + r
                };
            }

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

            for (const sid of entity.stationIds) {
                if (sid) visibleIds.add(sid);
            }
            if (entity.transferCount > 1) {
                visibleCapsuleGroupKeys.add(entity.key);
            }

            for (let cx = minCx; cx <= maxCx; cx++) {
                for (let cy = minCy; cy <= maxCy; cy++) {
                    const key = gridKey(cx, cy);
                    if (!grid.has(key)) grid.set(key, []);
                    grid.get(key).push(bbox);
                }
            }
        });

        if (!visibleIds.size) {
            mapAdapter.setFilter('stations-layer', ['all', hiddenExpr, ['==', ['get', 'id'], '']]);
            applyTransferCapsuleGroupFilter([]);
            try {
                onCircleCollisionResolved?.({
                    visibleStationIds: new Set(),
                    visibleCapsuleGroupKeys: new Set()
                });
            } catch {
                // ignore
            }
            return;
        }

        mapAdapter.setFilter('stations-layer', ['all', hiddenExpr, ['in', ['get', 'id'], ['literal', Array.from(visibleIds)]]]);
        applyTransferCapsuleGroupFilter(Array.from(visibleCapsuleGroupKeys));
        try {
            onCircleCollisionResolved?.({
                visibleStationIds: new Set(visibleIds),
                visibleCapsuleGroupKeys: new Set(visibleCapsuleGroupKeys)
            });
        } catch {
            // ignore
        }
    }

    function scheduleUpdate() {
        if (rafId != null) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            // updateStationCircleVisibility();
            updateStationLabelVisibility();
        });
    }

    scheduleUpdate();
    mapAdapter.on('move', scheduleUpdate);
    mapAdapter.on('zoom', scheduleUpdate);
    mapAdapter.on('resize', scheduleUpdate);

    return { scheduleUpdate };
}
