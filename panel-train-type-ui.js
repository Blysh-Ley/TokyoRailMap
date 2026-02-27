/**
 * panel-train-type-ui.js
 *
 * UI feature:
 * 1) Hover on .panel-line-name shows a trip-detail-like floating panel.
 * 2) Click on .panel-line-name pins/unpins the panel.
 * 3) Renders a vertical (transposed) stop-pattern diagram for the current line only.
 *    - Type order follows the rendered .panel-grid-hint-content order (when available).
 *    - Local/All-stop use gray; missing colors also use gray.
 *    - Ignores small services: per direction+type, total trips per day < 5.
 */

import { computeLineStopDiagramData } from './panel-train-type.js';

const toText = (v) => String(v ?? '').trim();

const stopPropagationOnly = (evt) => {
    try {
        evt?.stopPropagation?.();
    } catch {
        // ignore
    }
};

const escapeHtml = (s) =>
    String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const ensureStyleInstalled = () => {
    if (document.querySelector('style[data-panel-train-type-style="1"]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-panel-train-type-style', '1');
    style.textContent = `
        .panel-train-type {
            min-width: 100px;
            max-height: 72vh;
            overflow: hidden;
        }
        .panel-train-type .panel-trip-detail-body {
            overflow: auto;
            max-height: calc(72vh - 44px);
        }
        .panel-train-type-meta {
            padding: 10px 12px;
            border-bottom: 1px solid var(--ui-border);
            font-size: 12px;
            line-height: 1.4;
            display:none;
        }
        .panel-train-type-section {
            padding: 10px 12px;
        }
        .panel-train-type-section-title {
            font-weight: 700;
            font-size: 13px;
            margin-bottom: 8px;
            display:none;
        }
        .panel-train-type-empty {
            font-size: 12px;
            padding: 8px 0;
        }
        .panel-train-type-grid {
            display: grid;
            align-items: center;
            gap: 0;
            justify-content: start;
            width: max-content;
        }
        .panel-train-type-station {
            font-size: 13px;
            text-align: left;
            padding: 2px 0 2px 6px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .panel-train-type-typehead {
            font-size: 11px;
            font-weight: 700;
            text-align: center;
            writing-mode: vertical-rl;
            text-orientation: upright;
            letter-spacing: 1px;
            line-height: 1;
            width: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
        }
        .panel-train-type-cell {
            height: 30px;
            width: 12px;
            position: relative;
            background: linear-gradient(var(--tt-color, #888), var(--tt-color, #888)) center/10px calc(100% + 2px) no-repeat;
        }
        .panel-train-type-cell.is-stop::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            width: 9px;
            height: 9px;
            border-radius: 999px;
            transform: translate(-50%, -50%);
            background: #fff;
            box-sizing: border-box;
        }
        .panel-train-type-cell.is-stop-up::after,
        .panel-train-type-cell.is-stop-down::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            width: 10px;
            height: 8px;
            transform: translate(-50%, -50%);
            background: #fff;
            box-sizing: border-box;
        }
        .panel-train-type-cell.is-stop-up::after {
            clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
        }
        .panel-train-type-cell.is-stop-down::after {
            clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
        }
        .panel-train-type-divider {
            height: 1px;
            background: var(--ui-border);
            margin: 0;
        }
    `;
    document.head.appendChild(style);
};

const getCurrentServiceDayFromPanelDom = () => {
    // panel.js toggles is-active on the two buttons
    const active = document.querySelector('.panel-day-seg button.is-active[data-day]');
    const day = toText(active?.getAttribute?.('data-day'));
    if (day === 'Weekday' || day === 'SaturdayHoliday') return day;
    return 'Weekday';
};

const TYPE_BASE_SEQUENCE = ['特急', '急行', '准急', '快速', '普通'];

const resolveTypeBaseIndex = (typeNameRaw) => {
    const typeName = toText(typeNameRaw);
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < TYPE_BASE_SEQUENCE.length; i += 1) {
        const kw = TYPE_BASE_SEQUENCE[i];
        if (!typeName.includes(kw)) continue;
        if (i < best) best = i;
    }
    return Number.isFinite(best) ? best : -1;
};

const sortTypeNamesForGridHint = (typeNames, countByType) => {
    const names = Array.from(new Set((Array.isArray(typeNames) ? typeNames : []).map((x) => toText(x)).filter(Boolean)));
    return names.sort((a, b) => {
        const ia = resolveTypeBaseIndex(a);
        const ib = resolveTypeBaseIndex(b);
        const aInBase = ia >= 0;
        const bInBase = ib >= 0;

        if (aInBase !== bInBase) return aInBase ? 1 : -1;

        if (!aInBase && !bInBase) {
            const dl = b.length - a.length;
            if (dl) return dl;
            const dc = (Number(countByType?.get?.(b) || 0)) - (Number(countByType?.get?.(a) || 0));
            if (dc) return dc;
            return String(a).localeCompare(String(b));
        }

        if (ia !== ib) return ia - ib;

        const baseKw = TYPE_BASE_SEQUENCE[ia] || '';
        const aExact = baseKw && a === baseKw;
        const bExact = baseKw && b === baseKw;
        if (aExact !== bExact) return aExact ? 1 : -1;

        const dl = b.length - a.length;
        if (dl) return dl;
        const dc = (Number(countByType?.get?.(b) || 0)) - (Number(countByType?.get?.(a) || 0));
        if (dc) return dc;
        return String(a).localeCompare(String(b));
    });
};

const setupPanelTrainTypeUi = () => {
    try {
        if (window.__TokyoRailPanelTrainTypeUiInstalled) return;
        window.__TokyoRailPanelTrainTypeUiInstalled = true;
    } catch {
        // ignore
    }

    ensureStyleInstalled();

    const root = document.createElement('div');
    root.className = 'panel-trip-detail panel-train-type is-hidden';
    root.setAttribute('data-panel-train-type', '');
    root.style.position = 'fixed';
    root.style.zIndex = '10000';

    const header = document.createElement('div');
    header.className = 'panel-trip-detail-header';
    const title = document.createElement('div');
    title.className = 'panel-trip-detail-title';
    header.appendChild(title);

    const body = document.createElement('div');
    body.className = 'panel-trip-detail-body';

    //root.appendChild(header);
    root.appendChild(body);
    document.body.appendChild(root);

    let pinned = false;
    let hoverInsidePanel = false;
    let activeLineId = '';
    let activeLineName = '';
    let lastAnchorRect = null;
    let lastPointer = { x: 0, y: 0 };
    let showTimer = 0;
    let hideTimer = 0;

    const cache = new Map(); // key: lineId||serviceDay -> payload

    const clearTimers = () => {
        if (showTimer) {
            clearTimeout(showTimer);
            showTimer = 0;
        }
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = 0;
        }
    };

    const scheduleHide = (delayMs = 220) => {
        clearTimers();
        hideTimer = setTimeout(() => {
            hideTimer = 0;
            if (pinned) return;
            if (hoverInsidePanel) return;
            root.classList.add('is-hidden');
            activeLineId = '';
            activeLineName = '';
        }, delayMs);
    };

    const positionPanel = () => {
        const panelW = root.offsetWidth || 420;
        const panelH = root.offsetHeight || 260;
        const pad = 12;

        const anchor = lastAnchorRect;
        const preferX = anchor ? anchor.left : lastPointer.x;
        const preferY = anchor ? anchor.top : lastPointer.y;

        // Prefer showing to the left of the anchor (like trip detail), else clamp.
        let x = preferX - panelW - pad;
        if (!Number.isFinite(x)) x = pad;
        x = Math.max(pad, Math.min(x, window.innerWidth - panelW - pad));

        let y = preferY;
        if (!Number.isFinite(y)) y = pad;
        y = Math.max(pad, Math.min(y, window.innerHeight - panelH - pad));

        root.style.left = `${x}px`;
        root.style.top = `${y}px`;
    };

    const pickUnifiedStationOrder = (stationIds, stationNames, directions) => {
        const ids = Array.isArray(stationIds) ? stationIds.slice() : [];
        const names = Array.isArray(stationNames) ? stationNames.slice() : [];
        const out = Array.isArray(directions) ? directions.find((d) => toText(d?.dir) === 'Outbound') : null;
        if (out) return { stationIds: ids, stationNames: names, anchorDir: 'Outbound' };
        const firstDir = (Array.isArray(directions) ? directions : []).find((d) => Array.isArray(d?.types) && d.types.length > 0) || null;
        return {
            stationIds: ids,
            stationNames: names,
            anchorDir: toText(firstDir?.dir) || 'Unknown'
        };
    };

    const renderDiagram = (payload) => {
        const lineStations = payload?.lineStations || {};
        const stationIds = Array.isArray(lineStations?.stationIds) ? lineStations.stationIds : [];
        const stationNames = Array.isArray(lineStations?.stationNames) ? lineStations.stationNames : stationIds;

        const directions = Array.isArray(payload?.directions) ? payload.directions : [];
        const { stationIds: orderedStationIds, stationNames: orderedStationNames } = pickUnifiedStationOrder(stationIds, stationNames, directions);

        const dirMap = new Map(directions.map((d) => [toText(d?.dir) || 'Unknown', d]));
        const outDir = dirMap.get('Outbound') || null;
        const inDir = dirMap.get('Inbound') || null;
        const hasBidirectional = !!outDir && !!inDir;
        const firstDir = directions.find((d) => Array.isArray(d?.types) && d.types.length > 0) || null;
        const anchorBlock = outDir || firstDir || null;

        const mergedTypeMap = new Map(); // typeKey -> { typeId, typeName, color, outMask, inMask }
        const addDirTypes = (dirBlock, dirKey) => {
            for (const t of Array.isArray(dirBlock?.types) ? dirBlock.types : []) {
                const typeId = toText(t?.typeId) || 'Unknown';
                const typeName = toText(t?.typeName) || typeId;
                const color = toText(t?.color) || '#888';
                const key = `${typeId}||${typeName}`;
                if (!mergedTypeMap.has(key)) {
                    mergedTypeMap.set(key, {
                        typeId,
                        typeName,
                        color,
                        outMask: new Array(orderedStationIds.length).fill(false),
                        inMask: new Array(orderedStationIds.length).fill(false),
                        anchorMask: new Array(orderedStationIds.length).fill(false)
                    });
                }
                const row = mergedTypeMap.get(key);
                const mask = Array.isArray(t?.pattern?.stopMask) ? t.pattern.stopMask : [];
                for (let i = 0; i < orderedStationIds.length; i += 1) {
                    const v = !!mask?.[i];
                    if (dirKey === 'Outbound') row.outMask[i] = row.outMask[i] || v;
                    if (dirKey === 'Inbound') row.inMask[i] = row.inMask[i] || v;
                    if (anchorBlock && toText(anchorBlock?.dir) === dirKey) row.anchorMask[i] = row.anchorMask[i] || v;
                }
            }
        };

        for (const d of directions) addDirTypes(d, toText(d?.dir) || 'Unknown');

        let types = Array.from(mergedTypeMap.values());
        if (!types.length) {
            return `
                <div class="panel-train-type-meta">当前无可用班次</div>
            `;
        }

        const typeCount = new Map();
        for (const t of types) {
            typeCount.set(toText(t?.typeName), Number(t?.totalTrips) || 0);
        }
        const orderedNames = sortTypeNamesForGridHint(types.map((t) => toText(t?.typeName)), typeCount);
        const orderIndex = new Map(orderedNames.map((n, i) => [n, i]));
        types.sort((a, b) => {
            const an = toText(a?.typeName);
            const bn = toText(b?.typeName);
            const ai = orderIndex.has(an) ? orderIndex.get(an) : Number.POSITIVE_INFINITY;
            const bi = orderIndex.has(bn) ? orderIndex.get(bn) : Number.POSITIVE_INFINITY;
            if (ai !== bi) return ai - bi;
            return an.localeCompare(bn, 'zh-Hans');
        });

        // grid: N type columns (left) + 1 station column (right)
        const gridStyle = `grid-template-columns: repeat(${types.length}, 12px) minmax(120px, max-content); column-gap: 1px;`;

        const headCells = types.map((t) => {
            const color = toText(t?.color) || '#888';
            const name = toText(t?.typeName) || '-';
            return `<div class="panel-train-type-typehead" style="color:${escapeHtml(color)}">${escapeHtml(name)}</div>`;
        }).concat(['<div></div>']).join('');

        const rows = [];
        for (let si = 0; si < orderedStationIds.length; si += 1) {
            const stName = toText(orderedStationNames?.[si]) || toText(orderedStationIds[si]) || '';
            for (let ti = 0; ti < types.length; ti += 1) {
                const t = types[ti];
                const color = toText(t?.color) || '#888';
                const outStop = !!t.outMask?.[si];
                const inStop = !!t.inMask?.[si];
                const anchorStop = !!t.anchorMask?.[si];

                let cls = 'panel-train-type-cell';
                if (hasBidirectional) {
                    if (outStop && inStop) cls += ' is-stop';
                    else if (inStop && !outStop) cls += ' is-stop-up';
                    else if (outStop && !inStop) cls += ' is-stop-down';
                } else if (anchorStop) {
                    cls += ' is-stop';
                }

                rows.push(`<div class="${cls}" style="--tt-color:${escapeHtml(color)}"></div>`);
            }
            rows.push(`<div class="panel-train-type-station" title="${escapeHtml(stName)}">${escapeHtml(stName)}</div>`);
        }

        const metaLine = (() => {
            const day = toText(payload?.serviceDay);
            const dayText = day === 'SaturdayHoliday' ? '休息日' : '工作日';
            return `<div class="panel-train-type-meta">${escapeHtml(dayText)}</div>`;
        })();

        return `${metaLine}
            <div class="panel-train-type-section">
                <div class="panel-train-type-section-title">站序</div>
                <div class="panel-train-type-grid" style="${gridStyle}">
                    ${headCells}
                    ${rows.join('')}
                </div>
            </div>`;
    };

    const showForLine = async ({ lineId, lineName, anchorRect }) => {
        const lid = toText(lineId);
        if (!lid) return;
        if (!window?.TokyoRailTimetableCache) return;

        const serviceDay = getCurrentServiceDayFromPanelDom();
        const cacheKey = `${lid}||${serviceDay}`;

        activeLineId = lid;
        activeLineName = toText(lineName) || lid;
        lastAnchorRect = anchorRect || null;

        title.textContent = activeLineName;
        body.innerHTML = '<div class="panel-train-type-meta">加载中…</div>';
        root.classList.remove('is-hidden');
        positionPanel();

        const payload = cache.has(cacheKey)
            ? cache.get(cacheKey)
            : await computeLineStopDiagramData(lid, { serviceDay, minTripsPerDay: 0 });
        if (!payload) {
            body.innerHTML = '<div class="panel-train-type-meta">无法生成（该线路无时刻表数据或尚未加载）</div>';
            positionPanel();
            return;
        }
        cache.set(cacheKey, payload);

        // If user already hovered to another line, drop this render.
        if (activeLineId !== lid) return;

        body.innerHTML = renderDiagram(payload);
        positionPanel();
    };

    const readLineIdAndNameFromTarget = (target) => {
        if (!(target instanceof Element)) return null;
        const hit = target.closest?.('.panel-line-name');
        if (!hit) return null;
        const lineEl = hit.closest?.('[data-line-id]');
        const lineId = toText(lineEl?.getAttribute?.('data-line-id'));
        if (!lineId) return null;
        const displayName = toText(hit.textContent) || lineId;
        return {
            lineId,
            lineName: displayName,
            lineEl,
            anchorRect: hit.getBoundingClientRect?.() || null
        };
    };

    // Keep panel open when pointer is inside it
    root.addEventListener('pointerdown', (e) => {
        pinned = true;
        clearTimers();
        stopPropagationOnly(e);
    }, { passive: true });
    root.addEventListener('click', (e) => {
        pinned = true;
        clearTimers();
        stopPropagationOnly(e);
    }, { passive: true });
    root.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('mouseenter', () => {
        hoverInsidePanel = true;
        clearTimers();
    });
    root.addEventListener('mouseleave', () => {
        hoverInsidePanel = false;
        if (!pinned) scheduleHide(180);
    });

    // Hover: show
    document.addEventListener('pointermove', (evt) => {
        lastPointer = { x: Number(evt?.clientX) || 0, y: Number(evt?.clientY) || 0 };
    }, true);

    document.addEventListener('pointerover', (evt) => {
        if (pinned) return;
        const info = readLineIdAndNameFromTarget(evt?.target);
        if (!info) return;
        const { lineId, lineName, anchorRect } = info;

        clearTimers();
        showTimer = setTimeout(() => {
            showTimer = 0;
            showForLine({ lineId, lineName, anchorRect });
        }, 140);
    }, true);

    document.addEventListener('pointerout', (evt) => {
        if (pinned) return;
        const fromLine = readLineIdAndNameFromTarget(evt?.target);
        if (!fromLine) return;
        // If pointer moves into the floating panel, do not hide.
        const related = evt?.relatedTarget;
        if (related instanceof Element && root.contains(related)) return;
        scheduleHide(200);
    }, true);

    // Click: pin/unpin
    document.addEventListener('click', (evt) => {
        const info = readLineIdAndNameFromTarget(evt?.target);
        if (!info) return;
        const { lineId, lineName, anchorRect } = info;

        // toggle pin for the same line
        const same = toText(lineId) && toText(lineId) === activeLineId;
        if (pinned && same) {
            pinned = false;
            // if not hovering on line-name or panel, hide
            scheduleHide(0);
            return;
        }

        pinned = true;
        clearTimers();
        showForLine({ lineId, lineName, anchorRect });
    }, true);

    // Click outside: unpin & hide
    document.addEventListener('pointerdown', (evt) => {
        if (!pinned) return;
        const t = evt?.target;
        if (t instanceof Element) {
            if (root.contains(t)) return;
            if (t.closest?.('.panel-line-name')) return;
        }
        pinned = false;
        root.classList.add('is-hidden');
        activeLineId = '';
        activeLineName = '';
    }, true);

    document.addEventListener('keydown', (evt) => {
        if (evt?.key !== 'Escape') return;
        if (root.classList.contains('is-hidden')) return;
        pinned = false;
        root.classList.add('is-hidden');
        activeLineId = '';
        activeLineName = '';
    });

    // Day toggle: refresh if panel is visible
    document.addEventListener('click', (evt) => {
        const t = evt?.target;
        if (!(t instanceof Element)) return;
        if (!t.closest?.('.panel-day-seg button[data-day]')) return;
        if (root.classList.contains('is-hidden')) return;
        if (!activeLineId) return;

        // Clear cache for this line for both days to avoid stale render
        cache.delete(`${activeLineId}||Weekday`);
        cache.delete(`${activeLineId}||SaturdayHoliday`);

        showForLine({
            lineId: activeLineId,
            lineName: activeLineName,
            anchorRect: lastAnchorRect
        });
    }, true);
};

setupPanelTrainTypeUi();
