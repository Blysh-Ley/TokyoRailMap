/**
 * 右侧弹出界面：点击站点/站名时展示站名标题。
 * 约束：不引入新配色/主题；panel 样式使用 panel-* 前缀与 search/popup/menu 隔离。
 */

import { TYPE_BASE_SEQUENCE, sortTypeNamesByBaseAndStopCount } from '../../lib/train-type-sort.js';
import { createTripPreviewScheduler } from '../../lib/trip-preview.js';
import {
    getCachedJson,
    getCompanyLogoSrc,
    getIconCandidates,
    getPreferredCachedImageSrc,
    setImageElementFromCache
} from '../../lib/fetch.js';
import {
    buildTemporaryThroughServicePanelPlan,
    detectThroughServiceCategoryFromTrips,
    THROUGH_SERVICE_TEMP_LINE_IDS,
    THROUGH_SERVICE_DISPLAY,
    THROUGH_SERVICE_CONFIGS,
    THROUGH_SERVICE_CONFIGS_OBJECT,
} from '../../lib/throughServiceManager.js';
import { buildTimetableStationText, renderTimetableNoteRowHtml, renderTimetablePlainNoteRowHtml } from './timetable-table.js';
import {
    renderPanelPrintableTimetableListHtml,
    renderPanelTimetableListHtml
} from './panelTimetableRenderer.js';
import { createPanelSelectionStateController } from './panelSelectionStateController.js';
import {
    createEmptyDirFilterState,
    filterRowsByDirFilterState,
    hasDirFilterRowValue,
    toDirFilterRow
} from './panelDirFilterModel.js';
import { createPanelDirFilterPopoverController } from './panelDirFilterPopoverController.js';
import {
    createPanelTimePickerController,
    normalizeTimePickerHHMM
} from './panelTimePickerController.js';
import { createPanelMapSelectController } from './panelMapSelectController.js';
import { createPanelMarqueeController } from './panelMarqueeController.js';
import {
    collectLinePrintPayloads,
    createPanelPrintRequestController
} from './panelPrintRequestController.js';
import { createPanelIntentController } from './panelIntentController.js';
import { createPanelCrossFeatureBridgeController } from './panelCrossFeatureBridgeController.js';
import { createPanelRoutePreviewController } from './panelRoutePreviewController.js';
import { renderPanelTripDetailStationCellHtml, renderPanelTripDetailStopRowHtml } from './panelTripDetailStationRenderer.js';
import {
    applyTripDetailPastState,
    buildTripDetailEndpointContext,
    getTripDetailStationAKey,
    markRowsPastByStation,
    matchesTripDetailEndpointStop,
    mergeTripDetailSegmentsAtBoundaries
} from './panelTripDetailViewModel.js';
import {
    buildTimetablePrintPayload,
    deriveDirectionStats,
    mergeDuplicateTimetableRows,
    normalizeTimetableAllowedTripKeys,
    normalizeTimetableSourceLineIds
} from './panelTimetableViewModel.js';
import {
    buildPanelCompaniesHtml,
    collectPanelCatalogEntries,
    renderPanelCatalogEntriesHtml
} from './panelCompanyCatalogRenderer.js';
import { enhancePanelLineHeaderIcons } from './panelLineHeaderEnhancer.js';
import { exportElementToPng } from './panelExportCapture.js';
import { installPanelTimetablePrintPayloadBuilder } from './panelPrintPayloadBridge.js';
import { createPanelScrollRuntime } from './panelScrollRuntime.js';
import { hydrateRenderedTimetable } from './panelTimetablePostRenderHydrator.js';
import { buildPanelTripPreviewScheduleArgs } from './panelTripDetailPreviewPayloadBuilder.js';
import {
    buildTransferLineStationNameMap,
    getStationGroupsIndex,
    getStationsIndex,
    getTrainTypeColorIndex,
    getTrainTypesIndex,
    readStationName
} from './panelStationMetadata.js';
import {
    panelIsDarkThemeActive,
    resolvePanelBadgeTextColor,
    resolveTrainTypeColorForTheme
} from './panelThemeHelpers.js';
import {
    createPanelEventDelegationCoordinator,
    resolvePanelCompanyTarget,
    resolvePanelDirFilterButtonTarget,
    resolvePanelDirPrintButtonTarget,
    resolvePanelDirTitleTarget,
    resolvePanelDirTriangleTarget,
    resolvePanelLineTarget,
    resolveTripDetailStationTarget
} from './panelEventDelegationCoordinator.js';
import {
    buildPanelLineMergeInfo,
    normalizeArrayLike
} from './panelServingLineMerge.js';
import {
    applyTemporarySourceLineOverrides,
    createEmptyPanelThroughServiceState,
    resolvePanelThroughServiceSetup
} from './panelThroughServiceSetup.js';
import {
    preparePanelStationRenderBootstrap,
    resetPanelStationRenderTransientState
} from './panelStationRenderBootstrap.js';
import { createPanelHoverRestoreRuntime } from './panelHoverRestoreRuntime.js';
import {
    dispatchPanelDirectionToggleIntent,
    dispatchPanelDirFilterIntent,
    dispatchPanelPrimarySelectionIntent
} from './panelIntentDispatcher.js';
import { buildPanelTripDetailTitleHtml } from './panelTripDetailTitleRenderer.js';
import {
    renderPanelTripDetailGridMarkerCell,
} from './panelTripDetailGridHelpers.js';
import { renderPanelTripDetailGridLaneBlock } from './panelTripDetailGridLaneBlockRenderer.js';
import { renderPanelTripDetailBranchBreakRow } from './panelTripDetailBranchBreakRowRenderer.js';
import { renderPanelTripDetailBranchGridRows } from './panelTripDetailBranchGridRenderer.js';
import { collectPanelTripDetailBranchLanesFromRefs } from './panelTripDetailBranchLaneCollector.js';
import {
    collectPanelTripDetailRefChainTripsFromRef,
    resolvePanelTripDetailFirstMultiRefsAlongChain
} from './panelTripDetailRefChainCollector.js';
import { collectPanelTripDetailTripChainByTrip } from './panelTripDetailTripChainWalker.js';
import { derivePanelTripDetailThroughServiceDirection } from './panelTripDetailThroughServiceDirectionResolver.js';
import {
    getPanelTripDetailStationIds,
    resolvePanelTripDetailThroughServiceEndpointIds
} from './panelTripDetailThroughServiceEndpointResolver.js';
import {
    derivePanelTripDetailBranchRuntime,
    resolvePanelTripDetailBranchRefIds
} from './panelTripDetailBranchRuntime.js';
import { preparePanelTripDetailBranchMainFlow } from './panelTripDetailBranchMainFlow.js';
import { buildPanelTripDetailSegmentBlocks } from './panelTripDetailSegmentBlockBuilder.js';
import { renderPanelTripDetailLinearRows } from './panelTripDetailLinearRowsRenderer.js';
import { buildPanelTripDetailLayoutShell } from './panelTripDetailLayoutShell.js';
import {
    getPanelTripDetailSegmentFirstRow,
    getPanelTripDetailSegmentLastRow,
    isPanelTripDetailBoundaryPast,
    renderPanelTripDetailLoopMarkerRow,
    renderPanelTripDetailNoteRow
} from './panelTripDetailSegmentHelpers.js';
import { buildPanelStationRenderInputs } from './panelStationRenderInputs.js';
import { createPanelPinnedTripDetailState } from './panelPinnedTripDetailState.js';
import {
    findPanelTripTarget,
    resolvePanelInteractionKeyFromTarget,
    resolvePanelMousePrimaryTarget
} from './panelIntentTargetParser.js';
import { createPanelCatalogController } from './panelCatalogController.js';
import { createDesktopPanelShell } from './panelShellDesktop.js';
import {
    createPanelTouchInteractionController,
    isTouchLikePointer
} from './panelTouchInteractionController.js';
import { composePanelShellWithContent, createPanelContentApi } from './panelContentApi.js';
import {
    getSpecialTripDetailStationAKey,
    isExcludedLineType,
    shouldUseExactTripDetailEndpointIds
} from '../../lib/special-condition.js';

const toText = (v) => String(v ?? '').trim();

const isSaturdayHoliday = (day) => {
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const isHoliday = (typeof JapaneseHolidays !== 'undefined' && typeof JapaneseHolidays.isHoliday === 'function')
        ? JapaneseHolidays.isHoliday(day)
        : false;
    const month = day.getMonth() + 1;
    const date = day.getDate();
    const isNewYearHoliday = (month === 12 && date >= 30) || (month === 1 && date <= 3);
    const isSH = isWeekend || isHoliday || isNewYearHoliday;
    return isSH ? 'SaturdayHoliday' : 'Weekday';
}

const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

function stopEvent(evt) {
    evt?.preventDefault?.();
    evt?.stopPropagation?.();
}

function stopPropagationOnly(evt) {
    evt?.stopPropagation?.();
}

const escapeHtml = (s) =>
    String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const SERVICE_DAY_BOUNDARY_HOUR = 3;
const PRINT_SERVICE_DAYS = ['Weekday', 'SaturdayHoliday'];

const getServiceDayStartMs = (now = new Date()) => {
    const d = new Date(now.getTime());
    // service day starts at 03:00
    const candidate = new Date(d.getTime());
    candidate.setHours(SERVICE_DAY_BOUNDARY_HOUR, 0, 0, 0);
    // If it's before 03:00, service day started yesterday at 03:00
    if (d.getTime() < candidate.getTime()) {
        candidate.setDate(candidate.getDate() - 1);
    }
    return candidate.getTime();
};

const parseHHMMToServiceDayMs = (hhmm, serviceDayStartMs) => {
    const s = toText(hhmm);
    const m = s.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);

    const d = new Date(serviceDayStartMs);
    d.setHours(h, min, 0, 0);

    // Times between 00:00–02:59 belong to the next calendar day segment of the same service day.
    const isNextDaySegment = h < SERVICE_DAY_BOUNDARY_HOUR;
    if (isNextDaySegment) d.setDate(d.getDate() + 1);

    return { ms: d.getTime(), isNextDaySegment };
};

const parseTripServiceDayFromId = (tripId) => {
    const id = toText(tripId);
    if (!id) return '';
    const m = id.match(/\.(Weekday|SaturdayHoliday)(?:\.[0-9]+)?$/);
    if (m?.[1]) return m[1];
    if (id.includes('.Weekday')) return 'Weekday';
    if (id.includes('.SaturdayHoliday')) return 'SaturdayHoliday';
    return '';
};

const formatTimeWithPlus = (hhmm, isNextDaySegment) => {
    const s = toText(hhmm);
    if (!s) return '';
    return isNextDaySegment ? `${s}` : s;
};

const parseTripDetailTimeMinutes = (hhmm) => {
    const match = toText(hhmm).match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
};

const getTripDetailStopDwellMinutes = (stop = {}) => {
    const arrMinutes = parseTripDetailTimeMinutes(stop.arr);
    const depMinutes = parseTripDetailTimeMinutes(stop.dep);
    if (!Number.isFinite(arrMinutes) || !Number.isFinite(depMinutes)) return 0;

    const arrTotal = arrMinutes + (stop.arrPlus ? 1440 : 0);
    let depTotal = depMinutes + (stop.depPlus ? 1440 : 0);
    if (depTotal < arrTotal) depTotal += 1440;

    const dwellMinutes = depTotal - arrTotal;
    return Number.isFinite(dwellMinutes) ? Math.max(0, dwellMinutes) : 0;
};

const renderTripDetailMomentHtml = (stop = {}) => {
    const timeText = stop.arr
        ? formatTimeWithPlus(stop.arr, stop.arrPlus)
        : (stop.dep ? formatTimeWithPlus(stop.dep, stop.depPlus) : '');
    if (!timeText) return '';

    const extras = [];
    if (stop.showOriginLabel) {
        extras.push({ className: 'panel-trip-detail-time-extra is-origin', text: '始发' });
    }
    if (stop.showTerminalLabel) {
        extras.push({ className: 'panel-trip-detail-time-extra is-terminal', text: '终到' });
    }

    const dwellMinutes = getTripDetailStopDwellMinutes(stop);
    if (dwellMinutes > 2) {
        extras.push({ className: 'panel-trip-detail-time-extra is-dwell', text: `+${dwellMinutes}'` });
    }

    return [
        `<span class="panel-trip-detail-time-main panel-time-arrive">${escapeHtml(timeText)}</span>`,
        ...extras.map((item) => `<span class="${item.className}">${escapeHtml(item.text)}</span>`)
    ].join('');
};

/*
    for (const id of ids) {
        // 先拿“理论主线”，再按 serving 内是否存在该主线来决定是否并线。
        const resolved = toText(resolveMainLineIdForIcon(id)) || id;

        let mainId = id;
        if (resolved && resolved !== id && idIndex.has(resolved)) {
            const srcCompany = toText(safeGetLineMeta(id)?.company);
            const dstCompany = toText(safeGetLineMeta(resolved)?.company);
            const sameCompany = !srcCompany || !dstCompany || srcCompany === dstCompany;
            if (sameCompany) mainId = resolved;
        }

        if (!lineGroupByMainId.has(mainId)) {
            lineGroupByMainId.set(mainId, []);
            displayLineIds.push(mainId);
        }
        lineGroupByMainId.get(mainId).push(id);
    }

    for (const [mainId, grouped] of lineGroupByMainId.entries()) {
        const deduped = Array.from(new Set(grouped));
        if (deduped.includes(mainId)) {
            deduped.sort((a, b) => {
                if (a === mainId) return -1;
                if (b === mainId) return 1;
                return 0;
            });
        }
        lineGroupByMainId.set(mainId, deduped);
    }

    return { displayLineIds, lineGroupByMainId };
};
*/

export function createPanel(options = {}) {
    const TIMETABLE_PRINT_EVENT = '__TokyoRailPrintTimetableRequested';
    const TIMETABLE_PRINT_ALL_EVENT = '__TokyoRailPrintAllTimetablesRequested';
    const widthPx = Number.isFinite(options.widthPx) ? options.widthPx : 320;
    const rightPx = Number.isFinite(options.rightPx) ? options.rightPx : 20;
    const zIndex = Number.isFinite(options.zIndex) ? options.zIndex : 9999;

    const hoverDelayMs = Number.isFinite(options.hoverDelayMs) ? options.hoverDelayMs : 50;
    const primaryHoverDelayMs = 500;
    const getLineMetaBase = typeof options.getLineMeta === 'function' ? options.getLineMeta : (() => null);
    let temporaryPanelLineMetaById = new Map();
    let temporaryPanelSourceLineIdsByDisplayLineId = new Map();
    let temporaryPanelAllowedTripKeysByDisplayLineId = new Map();
    const getLineMeta = (lineId) => {
        const id = toText(lineId);
        if (!id) return null;
        const temp = temporaryPanelLineMetaById.get(id);
        if (temp) return temp;
        return getLineMetaBase(id);
    };
    const companyLogoMap = options.companyLogoMap || {};
    const railwaysOrderIndex = options.railwaysOrderIndex instanceof Map ? options.railwaysOrderIndex : null;
    const onSelectCompany = typeof options.onSelectCompany === 'function' ? options.onSelectCompany : null;
    const onSelectLine = typeof options.onSelectLine === 'function' ? options.onSelectLine : null;
    const onRestoreStationLines = typeof options.onRestoreStationLines === 'function' ? options.onRestoreStationLines : null;
    const onTripPreview = typeof options.onTripPreview === 'function' ? options.onTripPreview : null;
    const onTripClear = typeof options.onTripClear === 'function' ? options.onTripClear : null;
    const onTripCurrentStationShow = typeof options.onTripCurrentStationShow === 'function' ? options.onTripCurrentStationShow : null;
    const onTripCurrentStationHide = typeof options.onTripCurrentStationHide === 'function' ? options.onTripCurrentStationHide : null;
    const onTripDetailStationIndicator = typeof options.onTripDetailStationIndicator === 'function' ? options.onTripDetailStationIndicator : null;
    const onTripDetailStationIndicatorClear = typeof options.onTripDetailStationIndicatorClear === 'function' ? options.onTripDetailStationIndicatorClear : null;
    const onDirPreviewEnter = typeof options.onDirPreviewEnter === 'function' ? options.onDirPreviewEnter : null;
    const onDirPreviewLeave = typeof options.onDirPreviewLeave === 'function' ? options.onDirPreviewLeave : null;
    const settingsContentEl = options.settingsContentEl && options.settingsContentEl.appendChild ? options.settingsContentEl : null;
    const getTimetableViewMode = typeof options.getTimetableViewMode === 'function' ? options.getTimetableViewMode : null;
    const onTimetableViewModeChanged = typeof options.onTimetableViewModeChanged === 'function' ? options.onTimetableViewModeChanged : null;
    const getHoverPreviewEnabled = typeof options.getHoverPreviewEnabled === 'function' ? options.getHoverPreviewEnabled : null;
    const getMultiSelectModeEnabled = typeof options.getMultiSelectModeEnabled === 'function' ? options.getMultiSelectModeEnabled : null;
    let hoverPreviewEnabled = getHoverPreviewEnabled ? getHoverPreviewEnabled() !== false : true;
    const isHoverPreviewEnabled = () => hoverPreviewEnabled !== false;
    const isMultiSelectModeEnabled = () => getMultiSelectModeEnabled ? getMultiSelectModeEnabled() === true : false;
    const panelSelectionState = createPanelSelectionStateController({ toText });

    let currentLineGroupByMainId = new Map();
    let currentStationsIndex = null;
    let currentLineStationMetaByLineId = new Map();

    const buildTransferLineStationNameMapLegacy = async ({ stationId, stationNameZh, servingLineIds, lineGroupByMainId }) => {
        const sid = toText(stationId);
        const clickedName = toText(stationNameZh);
        const lineIds = Array.isArray(servingLineIds) ? servingLineIds.map((x) => toText(x)).filter(Boolean) : [];
        const grouped = lineGroupByMainId instanceof Map ? lineGroupByMainId : new Map();
        const out = new Map();
        if (!sid || !lineIds.length) return out;

        const getGroupNameCount = (stationsIndex, ids) => {
            const list = Array.isArray(ids) ? ids : [];
            return new Set(
                list
                    .map((id) => toText(stationsIndex?.idToNameZh?.get?.(id) || ''))
                    .filter(Boolean)
            ).size;
        };

        try {
            const [groupsIndex, stationsIndex] = await Promise.all([getStationGroupsIndex(), getStationsIndex()]);
            const groupIdsRaw = groupsIndex?.get?.(sid);
            const groupIds = Array.isArray(groupIdsRaw) && groupIdsRaw.length
                ? groupIdsRaw.map((x) => toText(x)).filter(Boolean)
                : [sid];
            const currentStationHasMultipleNames = getGroupNameCount(stationsIndex, groupIds) > 1;

            for (const lineId of lineIds) {
                const sourceLineIds = Array.from(new Set([
                    lineId,
                    ...(Array.isArray(grouped.get(lineId)) ? grouped.get(lineId) : [])
                ].map((x) => toText(x)).filter(Boolean)));

                let candidateId = '';
                for (const srcLineId of sourceLineIds) {
                    candidateId = toText(groupIds.find((gid) => gid === srcLineId || gid.startsWith(`${srcLineId}.`)) || '');
                    if (candidateId) break;
                }

                // 兜底：若组内没找到，用“线路 + 当前站名”反查 station id（用于同名非换乘后缀场景）
                if (!candidateId && clickedName) {
                    for (const srcLineId of sourceLineIds) {
                        const k = `${srcLineId}||${clickedName}`;
                        candidateId = toText(stationsIndex?.stationIdByRailwayAndNameZh?.get?.(k) || '');
                        if (candidateId) break;
                    }
                }

                if (!candidateId) continue;

                const candidateGroupIdsRaw = groupsIndex?.get?.(candidateId);
                const candidateGroupIds = Array.isArray(candidateGroupIdsRaw) && candidateGroupIdsRaw.length
                    ? candidateGroupIdsRaw.map((x) => toText(x)).filter(Boolean)
                    : [candidateId];
                const transferNameRaw = toText(stationsIndex?.idToNameZh?.get?.(candidateId) || '');
                const transferCode = toText(stationsIndex?.idToCode?.get?.(candidateId) || '');
                const transferHasMultipleNames = getGroupNameCount(stationsIndex, candidateGroupIds) > 1;
                const transferName = currentStationHasMultipleNames && transferHasMultipleNames
                    ? transferNameRaw
                    : '';

                // 保留 stationId，供目录滚动时同步标题使用；name/code 继续只影响副标题展示
                out.set(lineId, { stationId: candidateId, name: transferName, code: transferCode, actualName: transferNameRaw });
            }
        } catch {
            return out;
        }

        return out;
    };

    const panelShell = createDesktopPanelShell({ rightPx, widthPx });
    const panelContentApi = createPanelContentApi();
    const panelComposition = composePanelShellWithContent({ contentApi: panelContentApi, shell: panelShell });
    const root = panelComposition.root;
    const touchInteraction = createPanelTouchInteractionController({ now: nowMs });
    const panelIntents = createPanelIntentController({
        captureElement: exportElementToPng
    });
    const crossFeatureBridge = createPanelCrossFeatureBridgeController();
    const panelRoutePreview = createPanelRoutePreviewController({
        clearTripPathPreviewBySource: (source) => crossFeatureBridge.clearTripPathPreviewBySource(source),
        toText
    });

    // 从右侧滑入/滑出

    // 面板主体：视觉同 search-results，但 class 使用 panel-* 隔离
    const panel = panelComposition.panel;

    // 标题栏
    const header = document.createElement('div');
    header.setAttribute('data-panel-header', '');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'flex-start';
    header.style.gap = '8px';
    header.style.padding = '10px 12px';
    header.style.borderBottom = '1px solid var(--ui-border, #e3e5e7)';

    const title = document.createElement('div');
    title.setAttribute('data-panel-title', '');
    title.style.flex = '1 1 auto';
    title.style.display = 'flex';
    title.style.flexDirection = 'column';
    title.style.alignItems = 'flex-start';
    title.style.minWidth = '0';
    title.style.overflow = 'hidden';

    const titleMain = document.createElement('div');
    titleMain.className = 'panel-title-main';

    const titleSub = document.createElement('div');
    titleSub.className = 'panel-title-sub';

    title.appendChild(titleMain);
    title.appendChild(titleSub);
    header.appendChild(title);

    // 右侧控件区：工作日/休息日 + 时间
    const controls = document.createElement('div');
    controls.className = 'panel-controls';

    // 工作日/休息日切换（两段式圆角滑块）
    const dayToggle = document.createElement('div');
    dayToggle.className = 'panel-day-toggle';

    const daySeg = document.createElement('div');
    daySeg.className = 'panel-day-seg';

    const btnWeekday = document.createElement('button');
    btnWeekday.type = 'button';
    btnWeekday.textContent = '工作日';
    btnWeekday.setAttribute('data-day', 'Weekday');

    const btnHoliday = document.createElement('button');
    btnHoliday.type = 'button';
    btnHoliday.textContent = '休息日';
    btnHoliday.setAttribute('data-day', 'SaturdayHoliday');

    daySeg.appendChild(btnWeekday);
    daySeg.appendChild(btnHoliday);

    const dayPrintBtn = document.createElement('button');
    dayPrintBtn.type = 'button';
    dayPrintBtn.className = 'panel-day-print-btn is-hidden';
    dayPrintBtn.setAttribute('data-day-print-btn', '1');
    dayPrintBtn.setAttribute('aria-label', '打印本站全部方向时刻表');
    const dayPrintIcon = document.createElement('img');
    dayPrintIcon.className = 'panel-day-print-icon';
    dayPrintIcon.alt = '';
    setImageElementFromCache(dayPrintIcon, getIconCandidates('print.svg'), {
        cacheKey: 'icon:print.svg',
        fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('print.svg'), { cacheKey: 'icon:print.svg' })
    }).catch(() => null);
    dayPrintBtn.appendChild(dayPrintIcon);

    // 站点快速加入行程：作为起点/终点（map-select dropdown）
    const applyStationToJourneyField = (field) => {
        const stationId = toText(currentStationId);
        const stationName = toText(currentStationNameZh) || toText(titleMain.textContent);
        if (!stationId && !stationName) return;

        crossFeatureBridge.setJourneyStation({ field, stationId, stationName });

        // 取消当前站点高亮（不影响行程 map pick 的抑制逻辑）
        crossFeatureBridge.clearStationSelection();
    };

    const mapSelectController = createPanelMapSelectController({
        stopEvent,
        loadIcon: (iconEl) => setImageElementFromCache(iconEl, getIconCandidates('map-select.svg'), {
            cacheKey: 'icon:map-select.svg',
            fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('map-select.svg'), { cacheKey: 'icon:map-select.svg' })
        }).catch(() => null),
        onSelectField: applyStationToJourneyField,
        labels: {
            button: '将本站加入行程（起点/终点）',
            menu: '将本站作为起点或终点',
            origin: '作为起点',
            destination: '作为终点'
        }
    });

    // 打印按钮 + map-select 按钮同行（位于 daySeg 下方）
    const dayActionRow = document.createElement('div');
    dayActionRow.className = 'panel-day-action-row';
    dayActionRow.style.display = 'inline-flex';
    dayActionRow.style.alignItems = 'center';
    dayActionRow.style.gap = '8px';
    dayActionRow.appendChild(mapSelectController.el);
    dayActionRow.appendChild(dayPrintBtn);

    dayToggle.appendChild(dayActionRow);

    // 时间控件：覆盖 panel 中的“当前时间”（用于判断已过/未来与默认定位）
    const timeControl = document.createElement('div');
    timeControl.className = 'settings-item-control settings-time-control';

    const timeInput = document.createElement('input');
    timeInput.className = 'settings-time-input';
    timeInput.type = 'text';
    timeInput.inputMode = 'numeric';
    timeInput.placeholder = 'HH:MM';
    timeInput.maxLength = 5;
    timeInput.value = '';

    const btnAutoNow = document.createElement('button');
    btnAutoNow.type = 'button';
    btnAutoNow.className = 'settings-time-reset';
    btnAutoNow.title = '恢复自动时间';
    btnAutoNow.setAttribute('aria-label', '恢复自动时间');
    const autoNowIcon = document.createElement('img');
    autoNowIcon.className = 'settings-time-reset-icon';
    autoNowIcon.alt = '';
    setImageElementFromCache(autoNowIcon, getIconCandidates('clockwise.svg'), {
        cacheKey: 'icon:clockwise.svg',
        fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('clockwise.svg'), { cacheKey: 'icon:clockwise.svg' })
    }).catch(() => null);
    btnAutoNow.appendChild(autoNowIcon);

    const timeOps = document.createElement('div');
    timeOps.className = 'settings-time-ops';
    timeOps.appendChild(timeInput);
    timeOps.appendChild(btnAutoNow);

    const setTimePickerOpenState = (open) => {
        crossFeatureBridge.setTimePickerOpenState(open);
    };

    const timePickerController = createPanelTimePickerController({
        timeInput,
        timeOps,
        zIndex,
        stopEvent,
        stopPropagationOnly,
        setOpenState: setTimePickerOpenState
    });

    timeControl.appendChild(timeOps);

    controls.appendChild(dayToggle);
    header.appendChild(controls);

    const viewToggle = document.createElement('div');
    viewToggle.className = 'panel-view-toggle';
    viewToggle.setAttribute('role', 'tablist');
    viewToggle.setAttribute('aria-label', '班次视图');

    const btnViewList = document.createElement('button');
    btnViewList.type = 'button';
    btnViewList.className = 'panel-view-toggle-btn';
    btnViewList.textContent = '列表';
    btnViewList.setAttribute('data-panel-view-mode', 'list');
    btnViewList.setAttribute('role', 'tab');

    const btnViewGrid = document.createElement('button');
    btnViewGrid.type = 'button';
    btnViewGrid.className = 'panel-view-toggle-btn';
    btnViewGrid.textContent = '一览';
    btnViewGrid.setAttribute('data-panel-view-mode', 'grid');
    btnViewGrid.setAttribute('role', 'tab');

    viewToggle.appendChild(btnViewList);
    viewToggle.appendChild(btnViewGrid);

    // 内容区：承载 popup 同结构的公司/线路列表
    const body = document.createElement('div');
    body.setAttribute('data-panel-body', '');
    body.className = 'panel-list';
    body.style.flex = '1 1 auto';
    body.style.paddingLeft = '10px';
    body.style.paddingRight = '10px';
    body.style.overflowY = 'auto';
    body.style.overflowX = 'hidden';
    /*

    // 当 panel 内容出现纵向滚动时，自动在标题左侧显示“目录”子面板。
            <span class="panel-catalog-title-text">目录</span>
            <button type="button" class="panel-catalog-close-btn" data-panel-catalog-close-btn="1" aria-label="关闭目录">
                <img class="panel-catalog-close-icon" alt="" />
            </button>
        </div>
        <div class="panel-catalog-body" data-panel-catalog-body="1"></div>
    */
    let panelCatalogController = null;

    const scheduleCatalogRefresh = () => {
        panelCatalogController?.scheduleRefresh();
    };

    panelContentApi.appendContent(header);
    panelContentApi.appendContent(viewToggle);
    panelContentApi.appendContent(body);
    panelComposition.mountContent();
    const panelScrollRuntime = createPanelScrollRuntime({
        body,
        toText,
        syncActiveTitle: (activeLineId = '') => {
            panelCatalogController?.syncTitleForActiveLine(activeLineId);
        }
    });
    panelCatalogController = createPanelCatalogController({
        body,
        documentRef: document,
        mountShellOverlay: (node) => panelComposition.mountShellOverlay(node),
        panelShell,
        titleElement: title,
        collectEntries: () => collectPanelCatalogEntries(body, { toText }),
        renderEntries: (catalogBody, entries) => {
            if (!(catalogBody instanceof Element)) return;
            catalogBody.innerHTML = renderPanelCatalogEntriesHtml(entries, { toText });
        },
        hydrateCloseIcon: (catalogCloseIcon) => {
            if (!(catalogCloseIcon instanceof HTMLImageElement)) return;
            setImageElementFromCache(catalogCloseIcon, getIconCandidates('x.svg'), {
                cacheKey: 'icon:x.svg',
                fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('x.svg'), { cacheKey: 'icon:x.svg' })
            }).catch(() => null);
        },
        getCurrentLineStationMetaByLineId: () => currentLineStationMetaByLineId,
        getCurrentStationId: () => currentStationId,
        getCurrentStationNameZh: () => currentStationNameZh,
        getCurrentStationsIndex: () => currentStationsIndex,
        setTitle: (...args) => setTitle(...args),
        scrollToLineId: (...args) => panelScrollRuntime.scrollToLineId(...args),
        stopEvent,
        toText
    });

    // 防止点击面板穿透到地图（触发“点击空白处恢复/收起搜索”等）
    // 用 bubble 阶段拦截，避免阻断面板内部的点击/触屏事件处理
    root.addEventListener('pointerdown', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('pointermove', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('touchmove', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('click', (e) => stopEvent(e), { passive: false });

    document.body.appendChild(root);

    // 地图右上：站名开关下方的时间控件浮层（z-index 高于 panel）
    const startupTimeOverlay = typeof document.getElementById === 'function'
        ? document.getElementById('startup-timebar')
        : null;
    const timeOverlay = startupTimeOverlay && typeof startupTimeOverlay.appendChild === 'function'
        ? startupTimeOverlay
        : document.createElement('div');
    timeOverlay.className = 'settings-top-timebar';
    timeOverlay.removeAttribute?.('data-startup-lcp');
    timeOverlay.style.display = 'flex';
    timeOverlay.appendChild(daySeg);

    // 新增：在原 panel-day-seg 位置插入日期面板（显示 MM月DD日），并保留原 panel-day-seg（已隐藏）
    const startupDatePanel = typeof document.getElementById === 'function'
        ? document.getElementById('startup-panel-date')
        : null;
    const datePanel = startupDatePanel && typeof startupDatePanel.setAttribute === 'function'
        ? startupDatePanel
        : document.createElement('div');
    datePanel.className = 'panel-date';
    datePanel.setAttribute('role', 'button');
    datePanel.setAttribute('tabindex', '0');
    datePanel.setAttribute('aria-label', '选择日期');

    const formatPanelDateText = (date) => {
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const dayType = (typeof isSaturdayHoliday === 'function' && isSaturdayHoliday(date) === 'SaturdayHoliday') ? '休息日' : '工作日';
        return `${dayType} ${mm}月${dd}日`;
    };

    const formatDateInputValue = (date) => {
        const y = String(date.getFullYear());
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${y}-${mm}-${dd}`;
    };

    const parseDateInputValue = (value) => {
        const s = toText(value);
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
        if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
        const parsed = new Date(y, mo - 1, d);
        if (parsed.getFullYear() !== y || (parsed.getMonth() + 1) !== mo || parsed.getDate() !== d) return null;
        return parsed;
    };

    const datePickerInput = document.createElement('input');
    datePickerInput.type = 'date';
    datePickerInput.className = 'panel-date-picker-input';

    const initialDate = new Date();
    const initialDateText = formatPanelDateText(initialDate);
    if (datePanel.textContent !== initialDateText) {
        datePanel.textContent = initialDateText;
    }
    datePickerInput.value = formatDateInputValue(initialDate);

    timeOverlay.appendChild(datePanel);
    timeOverlay.appendChild(datePickerInput);

    timeOverlay.appendChild(timeControl);
    timeOverlay.addEventListener('pointerdown', (e) => stopPropagationOnly(e), { passive: true });
    timeOverlay.addEventListener('pointermove', (e) => stopPropagationOnly(e), { passive: true });
    timeOverlay.addEventListener('touchmove', (e) => stopPropagationOnly(e), { passive: true });
    timeOverlay.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    timeOverlay.addEventListener('click', (e) => stopEvent(e), { passive: false });
    timeOverlay.style.position = 'fixed';
    timeOverlay.style.zIndex = 5000;
    if (!timeOverlay.parentNode) {
        document.body.appendChild(timeOverlay);
    }

    const tripDetailRoot = document.createElement('div');
    tripDetailRoot.className = 'panel-trip-detail is-hidden';
    tripDetailRoot.setAttribute('data-panel-trip-detail', '');
    tripDetailRoot.style.position = 'fixed';
    tripDetailRoot.style.zIndex = String(zIndex + 1);

    const tripDetailHeader = document.createElement('div');
    tripDetailHeader.className = 'panel-trip-detail-header';

    const tripDetailTitle = document.createElement('div');
    tripDetailTitle.className = 'panel-trip-detail-title';
    tripDetailHeader.appendChild(tripDetailTitle);

    const tripDetailCaptureBtn = document.createElement('button');
    tripDetailCaptureBtn.type = 'button';
    tripDetailCaptureBtn.className = 'panel-capture-btn panel-trip-detail-capture-btn';
    tripDetailCaptureBtn.setAttribute('aria-label', '截图');
    tripDetailCaptureBtn.title = '截图';
    const tripDetailCaptureIcon = document.createElement('img');
    tripDetailCaptureIcon.className = 'panel-capture-icon panel-trip-detail-capture-icon';
    tripDetailCaptureIcon.alt = '';
    setImageElementFromCache(tripDetailCaptureIcon, getIconCandidates('camera.svg'), {
        cacheKey: 'icon:camera.svg',
        fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('camera.svg'), { cacheKey: 'icon:camera.svg' })
    }).catch(() => null);
    tripDetailCaptureBtn.appendChild(tripDetailCaptureIcon);
    tripDetailCaptureBtn.addEventListener('click', async (evt) => {
        stopEvent(evt);
        tripDetailPinned = true;
        clearTripDetailHideTimer();
        const baseName = `trip-detail-${toText(currentStationNameZh) || 'line'}`;
        await panelIntents.captureTripDetail({
            root: tripDetailRoot,
            filenameBase: baseName,
            buttonEl: tripDetailCaptureBtn
        });
    }, { passive: false });
    tripDetailHeader.appendChild(tripDetailCaptureBtn);

    const tripDetailBody = document.createElement('div');
    tripDetailBody.className = 'panel-trip-detail-body';

    tripDetailRoot.appendChild(tripDetailHeader);
    tripDetailRoot.appendChild(tripDetailBody);
    document.body.appendChild(tripDetailRoot);

    tripDetailRoot.addEventListener('pointerdown', (e) => {
        tripDetailPinned = true;
        clearTripDetailHideTimer();
        stopPropagationOnly(e);
    }, { passive: true });
    tripDetailRoot.addEventListener('click', (e) => {
        // 仅阻止冒泡：避免点详情面板触发“空白处点击=恢复选择”等全局逻辑
        tripDetailPinned = true;
        clearTripDetailHideTimer();
        stopPropagationOnly(e);
    }, { passive: true });
    tripDetailRoot.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    tripDetailRoot.addEventListener('mouseenter', () => {
        if (touchInteraction.isLastPointerTouchLike()) return;
        tripDetailPinned = true;
        clearTripDetailHideTimer();
    });
    tripDetailRoot.addEventListener('mouseleave', () => {
        if (touchInteraction.isLastPointerTouchLike()) return;
        if (tripLocked) {
            tripDetailPinned = true;
            clearTripDetailHideTimer();
            return;
        }
        tripDetailPinned = false;
        scheduleTripDetailHide();
    });

    // ===== 交互状态（对齐 popup 的逻辑） =====
    let hoverCandidateKey = null;
    let lastFiredHoverKey = null;
    let lastMousePrimaryKey = '';
    let routeMapPopoverHoverActive = false;

    let lastAppliedHoverKey = null;
    const restoreDelayMs = Math.max(hoverDelayMs, 60);

    let currentStationServingIds = [];
    let currentStationId = null;
    let currentStationNameZh = '';
    let stationRenderToken = 0;
    let currentServiceDay = 'SaturdayHoliday';

    let day = new Date();
    currentServiceDay = isSaturdayHoliday(day);

    let currentNowOverrideHHMM = '';
    let isAutoNowClock = true;
    let autoNowClockTimerId = null;
    let currentPanelDate = new Date();
    const getDisplayNowMs = () => {
        const baseNowMs = Date.now();
        const hhmm = toText(currentNowOverrideHHMM);
        if (!hhmm) return baseNowMs;
        const serviceDayStartMs = getServiceDayStartMs(new Date(baseNowMs));
        const parsed = parseHHMMToServiceDayMs(hhmm, serviceDayStartMs);
        return parsed?.ms || baseNowMs;
    };

    const formatNowHHMM = (d = new Date()) => {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    const syncAutoNowClock = ({ forceRender = false } = {}) => {
        if (!isAutoNowClock) return;
        const hhmm = formatNowHHMM(new Date());
        if (toText(timeInput.value) !== hhmm) {
            timeInput.value = hhmm;
        }

        const changed = toText(currentNowOverrideHHMM) !== hhmm;
        currentNowOverrideHHMM = hhmm;

        if ((changed || forceRender) && toText(currentStationId)) {
            if (forceRender || !panelShell.isVisible()) {
                renderAllTimetables();
            }
        }
    };

    const startAutoNowClock = () => {
        if (autoNowClockTimerId != null) return;
        syncAutoNowClock({ forceRender: false });
        autoNowClockTimerId = setInterval(() => {
            syncAutoNowClock({ forceRender: false });
        }, 15000);
    };

    const restoreAutoNowClock = () => {
        isAutoNowClock = true;
        applyPanelDateSelection(new Date());
        syncAutoNowClock({ forceRender: true });
    };

    let timetableRenderToken = 0;
    let lastTripDetailKey = null;
    let tripLocked = false;
    let lockedTripKey = null;
    const tripPreviewScheduler = createTripPreviewScheduler({
        onPreview: onTripPreview,
        getHoverPreviewEnabled: isHoverPreviewEnabled,
        delayMs: 500
    });

    let tripDetailToken = 0;
    let tripDetailPinned = false;
    let tripDetailHideTimer = null;
    let timetableViewMode = 'list';
    let pendingGridDataDebugLog = false;
    const gridDataDebugByLineId = new Map();

    const normalizeTimetableViewMode = (mode) => (mode === 'grid' ? 'grid' : 'list');

    const hasLatin = (text) => /[A-Za-z]/.test(toText(text));
    const hasCjk = (text) => /[\u3400-\u9FFF]/.test(toText(text));

    const extractDisplayChars = (text) => {
        const s = toText(text);
        if (!s) return [];
        return Array.from(s).filter((ch) => /[A-Za-z0-9\u3400-\u9FFF]/.test(ch));
    };

    const buildTypeAbbr = (typeNameRaw) => {
        const typeName = toText(typeNameRaw);
        if (!typeName) return '';

        const latin = hasLatin(typeName);
        const cjk = hasCjk(typeName);

        if (latin && cjk) {
            const englishParts = typeName.match(/[A-Za-z]+/g) || [];
            const enAbbr = englishParts.map((part) => part[0]?.toUpperCase?.() || '').join('');
            const zhChars = Array.from(typeName).filter((ch) => /[\u3400-\u9FFF]/.test(ch));
            const zhAbbr = zhChars.length ? zhChars[0] : '';
            const mixed = `${enAbbr}${zhAbbr}`;
            return mixed || typeName;
        }

        if (latin && !cjk) {
            const m = typeName.match(/[A-Za-z]/);
            return m ? m[0].toUpperCase() : typeName;
        }

        if (cjk && !latin) {
            const chars = Array.from(typeName).filter((ch) => /[\u3400-\u9FFF]/.test(ch));
            const len = chars.length;
            if (len >= 4) return `${chars[0]}${chars[2]}`;
            if (len > 0 && len <= 3) return typeName;
        }

        const fallbackChars = extractDisplayChars(typeName);
        return fallbackChars.length ? fallbackChars[0].toUpperCase?.() || fallbackChars[0] : typeName;
    };

    const buildUniqueLeadAbbrMap = (orderedNames) => {
        const names = Array.isArray(orderedNames) ? orderedNames.map((x) => toText(x)).filter(Boolean) : [];
        const tokens = names.map((name) => {
            const chars = extractDisplayChars(name);
            return chars.length ? chars : Array.from(name);
        });
        const idx = new Array(tokens.length).fill(0);

        const pick = (tokenChars, i) => {
            if (!Array.isArray(tokenChars) || !tokenChars.length) return '';
            const pos = Math.max(0, Math.min(i, tokenChars.length - 1));
            return tokenChars[pos] || tokenChars[tokenChars.length - 1] || '';
        };

        for (let round = 0; round < 12; round += 1) {
            const bucket = new Map();
            for (let i = 0; i < tokens.length; i += 1) {
                const abbr = pick(tokens[i], idx[i]);
                if (!bucket.has(abbr)) bucket.set(abbr, []);
                bucket.get(abbr).push(i);
            }

            let changed = false;
            for (const [, indices] of bucket.entries()) {
                if (!Array.isArray(indices) || indices.length <= 1) continue;
                for (const i of indices) {
                    if (idx[i] < tokens[i].length - 1) {
                        idx[i] += 1;
                        changed = true;
                    }
                }
            }
            if (!changed) break;
        }

        const out = new Map();
        for (let i = 0; i < names.length; i += 1) {
            out.set(names[i], pick(tokens[i], idx[i]));
        }
        return out;
    };

    const deriveSpecialSp = (nameRaw) => {
        const name = toText(nameRaw);
        if (!name) return '';
        const sp = name.split(/\s+/).filter(Boolean)[0] || name;
        return toText(sp);
    };

    const buildUniqueSpecialAbbrMap = (orderedSpecialSp) => {
        const names = Array.isArray(orderedSpecialSp) ? orderedSpecialSp.map((x) => toText(x)).filter(Boolean) : [];
        const tokens = names.map((sp) => {
            const chars = Array.from(sp);
            return chars.length ? chars : Array.from(toText(sp));
        });
        const lengths = tokens.map((chars) => (chars.length >= 2 ? 2 : 1));

        const pick = (chars, len) => {
            if (!Array.isArray(chars) || !chars.length) return '';
            const n = Math.max(1, Math.min(len, chars.length));
            return chars.slice(0, n).join('');
        };

        for (let round = 0; round < 16; round += 1) {
            const bucket = new Map();
            for (let i = 0; i < tokens.length; i += 1) {
                const abbr = pick(tokens[i], lengths[i]);
                if (!bucket.has(abbr)) bucket.set(abbr, []);
                bucket.get(abbr).push(i);
            }

            let changed = false;
            for (const [, indices] of bucket.entries()) {
                if (!Array.isArray(indices) || indices.length <= 1) continue;
                for (const i of indices) {
                    const maxLen = Math.max(1, Math.min(tokens[i].length, 4));
                    if (lengths[i] < maxLen) {
                        lengths[i] += 1;
                        changed = true;
                    }
                }
            }
            if (!changed) break;
        }

        const out = new Map();
        for (let i = 0; i < names.length; i += 1) {
            out.set(names[i], pick(tokens[i], lengths[i]));
        }
        return out;
    };

    const NO_MARK_TYPE_NAMES = new Set(['各站停车', '普通']);
    const BASE_TYPE_KEYWORDS = TYPE_BASE_SEQUENCE
        .map((kw) => toText(kw))
        .filter(Boolean);

    const isNoMarkTypeName = (typeNameRaw) => NO_MARK_TYPE_NAMES.has(toText(typeNameRaw));

    const resolveTypeBaseName = (typeNameRaw) => {
        const typeName = toText(typeNameRaw);
        if (!typeName) return '';
        for (const base of BASE_TYPE_KEYWORDS) {
            if (typeName.includes(base)) return base;
        }
        return '';
    };

    const buildStationTypeSummaryItems = ({
        allTypeColorByName,
        stopTypeColorByName,
        stopTypeNameSet,
        typeCountByName,
        typeStopCountByName
    }) => {
        const allColorMap = allTypeColorByName instanceof Map ? allTypeColorByName : new Map();
        const stopColorMap = stopTypeColorByName instanceof Map ? stopTypeColorByName : new Map();
        const stopSet = stopTypeNameSet instanceof Set ? stopTypeNameSet : new Set();
        const stopCountMap = typeStopCountByName instanceof Map ? typeStopCountByName : new Map();

        const filteredTypeNames = Array.from(allColorMap.keys())
            .map((x) => toText(x))
            .filter((name) => !!resolveTypeBaseName(name));
        const typeNames = sortTypeNamesByBaseAndStopCount(filteredTypeNames, null, stopCountMap);
        const stopFallbackColor = '#555';

        const out = [];
        for (const typeName of typeNames) {
            const name = toText(typeName);
            if (!name) continue;
            const isStop = stopSet.has(name);
            out.push({
                name,
                isStop,
                color: isStop
                    ? (toText(stopColorMap.get(name)) || toText(allColorMap.get(name)) || stopFallbackColor)
                    : ''
            });
        }
        return out;
    };

    const buildTerminalDisplayLabel = (names) => {
        const list = Array.isArray(names)
            ? Array.from(new Set(names.map((x) => toText(x)).filter(Boolean)))
            : [];
        return list.join('·');
    };

    const buildDirectionGridHints = (rowsForDir) => {
        const rows = Array.isArray(rowsForDir) ? rowsForDir : [];

        const typeCount = new Map();
        const typeColorByName = new Map();
        const typeStopCountByName = new Map();
        const terminalCount = new Map();
        const terminalNamesByLabel = new Map();
        const terminalAtomicCount = new Map();
        const splitMergeTerminalNames = new Set();
        const splitNtMultiDestTerminalNames = new Set();
        const specialBySp = new Map();

        for (const row of rows) {
            const typeName = toText(row?.typeName);
            if (typeName) {
                typeCount.set(typeName, (typeCount.get(typeName) || 0) + 1);
                if (!typeColorByName.has(typeName)) {
                    const c = resolveTrainTypeColorForTheme(row?.typeColor);
                    if (c) typeColorByName.set(typeName, c);
                }
                const stopCount = Number(row?.stopCount);
                if (Number.isFinite(stopCount) && stopCount > 0) {
                    const prev = Number(typeStopCountByName.get(typeName));
                    typeStopCountByName.set(
                        typeName,
                        Number.isFinite(prev) ? Math.min(prev, stopCount) : stopCount
                    );
                }
            }

            const terminalNames = Array.isArray(row?.terminalNames)
                ? row.terminalNames.map((x) => toText(x)).filter(Boolean)
                : [];
            const displayName = toText(row?.terminalDisplayName || row?.terminalName || row?.destName) || buildTerminalDisplayLabel(terminalNames);
            if (displayName) {
                terminalCount.set(displayName, (terminalCount.get(displayName) || 0) + 1);
                terminalNamesByLabel.set(displayName, terminalNames.length ? terminalNames : [displayName]);
            }

            for (const terminalName of terminalNames) {
                terminalAtomicCount.set(terminalName, (terminalAtomicCount.get(terminalName) || 0) + 1);
            }

            const isSplitMergeTrip = Number(row?.originIdsCount) > 1 || Number(row?.terminalIdsCount) > 1;
            if (isSplitMergeTrip) {
                for (const terminalName of terminalNames) splitMergeTerminalNames.add(terminalName);
            }

            const isSplitByNtMultiDestTrip = !!row?.hasNt && Number(row?.resolvedTerminalIdsCount) > 1;
            if (isSplitByNtMultiDestTrip) {
                for (const terminalName of terminalNames) splitNtMultiDestTerminalNames.add(terminalName);
            }

            const specialNames = Array.isArray(row?.specialNames)
                ? row.specialNames.map((x) => toText(x)).filter(Boolean)
                : [];
            const seenSpInRow = new Set();
            for (const specialName of specialNames) {
                const sp = deriveSpecialSp(specialName);
                if (!sp || seenSpInRow.has(sp)) continue;
                seenSpInRow.add(sp);
                const prev = specialBySp.get(sp) || { sp, full: specialName, count: 0 };
                specialBySp.set(sp, {
                    sp,
                    full: prev.full || specialName,
                    count: Number(prev.count || 0) + 1
                });
            }
        }

        let maxTerminalAtomicCount = 0;
        for (const [, count] of terminalAtomicCount.entries()) {
            const n = Number(count) || 0;
            if (n > maxTerminalAtomicCount) maxTerminalAtomicCount = n;
        }

        const topTerminalNames = new Set();
        if (maxTerminalAtomicCount > 0) {
            for (const [name, count] of terminalAtomicCount.entries()) {
                if ((Number(count) || 0) === maxTerminalAtomicCount) topTerminalNames.add(name);
            }
        }

        const topSplitNtMultiDestTerminalNames = new Set(
            Array.from(topTerminalNames).filter((name) => splitNtMultiDestTerminalNames.has(name))
        );

        const noMarkModeByTerminalName = new Map();
        for (const name of topTerminalNames) {
            noMarkModeByTerminalName.set(name, topSplitNtMultiDestTerminalNames.has(name) ? 'dual' : 'label');
        }

        const typeNames = sortTypeNamesByBaseAndStopCount(Array.from(typeCount.keys()), typeCount, typeStopCountByName);
        const typeHints = typeNames.map((name) => ({
            full: name,
            abbr: buildTypeAbbr(name),
            color: toText(typeColorByName.get(name)) || '#888',
            count: Number(typeCount.get(name) || 0)
        }));

        const terminalNames = Array.from(terminalCount.entries())
            .sort((a, b) => {
                const dc = Number(b[1] || 0) - Number(a[1] || 0);
                if (dc) return dc;
                return String(a[0]).localeCompare(String(b[0]));
            })
            .map(([name]) => name);
        const terminalAtomicNames = Array.from(new Set(
            terminalNames
                .flatMap((name) => terminalNamesByLabel.get(name) || [name])
                .map((x) => toText(x))
                .filter(Boolean)
        ));
        const terminalAbbrMap = buildUniqueLeadAbbrMap(terminalAtomicNames);
        const terminalHints = terminalNames.map((name) => ({
            full: name,
            abbr: (() => {
                const fullNames = terminalNamesByLabel.get(name) || [name];
                const parts = fullNames
                    .map((fullName) => toText(terminalAbbrMap.get(fullName)) || toText(fullName).slice(0, 1))
                    .filter(Boolean);
                if (!parts.length) return toText(name).slice(0, 1);
                return parts.join('·');
            })(),
            hintParts: (() => {
                const fullNames = terminalNamesByLabel.get(name) || [name];
                return fullNames
                    .map((fullName) => {
                        const normalized = toText(fullName);
                        if (!normalized) return null;
                        return {
                            full: normalized,
                            abbr: toText(terminalAbbrMap.get(normalized)) || normalized.slice(0, 1),
                            noMarkMode: toText(noMarkModeByTerminalName.get(normalized))
                        };
                    })
                    .filter(Boolean);
            })(),
            count: Number(terminalCount.get(name) || 0)
        }));

        const specialEntries = Array.from(specialBySp.values())
            .sort((a, b) => {
                const dc = Number(b?.count || 0) - Number(a?.count || 0);
                if (dc) return dc;
                return String(a?.sp || '').localeCompare(String(b?.sp || ''));
            });
        const specialSpList = specialEntries.map((x) => toText(x?.sp)).filter(Boolean);
        const specialAbbrMap = buildUniqueSpecialAbbrMap(specialSpList);
        const specialHints = specialEntries.map((entry) => ({
            full: toText(entry?.full),
            sp: toText(entry?.sp),
            abbr: toText(specialAbbrMap.get(toText(entry?.sp))) || toText(entry?.sp).slice(0, 1),
            count: Number(entry?.count || 0)
        }));

        return { typeHints, terminalHints, specialHints };
    };

    const applyTimetableViewMode = (mode, { rerender = true } = {}) => {
        const next = normalizeTimetableViewMode(mode);
        timetableViewMode = next;
        btnViewList.classList.toggle('is-active', next === 'list');
        btnViewGrid.classList.toggle('is-active', next === 'grid');
        btnViewList.setAttribute('aria-selected', next === 'list' ? 'true' : 'false');
        btnViewGrid.setAttribute('aria-selected', next === 'grid' ? 'true' : 'false');
        btnViewList.tabIndex = next === 'list' ? 0 : -1;
        btnViewGrid.tabIndex = next === 'grid' ? 0 : -1;
        body.setAttribute('data-timetable-view', next);
        body.classList.toggle('is-timetable-view-list', next === 'list');
        body.classList.toggle('is-timetable-view-grid', next === 'grid');
        dayPrintBtn.classList.toggle('is-hidden', next !== 'grid');
        if (rerender && toText(currentStationId)) renderAllTimetables();
    };

    const setTimetableViewModeFromPanel = (mode) => {
        const next = normalizeTimetableViewMode(mode);
        onTimetableViewModeChanged?.(next);
        applyTimetableViewMode(next, { rerender: true });
    };

    const clearTripDetailHideTimer = () => {
        if (tripDetailHideTimer != null) {
            clearTimeout(tripDetailHideTimer);
            tripDetailHideTimer = null;
        }
    };

    const clearTripHighlightTimer = () => {
        tripPreviewScheduler.clearPending();
    };

    const showTripCurrentStationHint = async ({ lineId, token } = {}) => {
        if (!onTripCurrentStationShow) return;

        let sid = toText(currentStationId);
        const lid = toText(lineId);
        if (lid) {
            const resolved = await resolveStationIdForLine(lid);
            sid = toText(resolved) || sid;
        }

        if (token != null && token !== tripDetailToken) return;
        if (!sid) return;

        try {
            onTripCurrentStationShow({ stationId: sid });
        } catch {
            // ignore
        }
    };

    const hideTripCurrentStationHint = () => {
        if (!onTripCurrentStationHide) return;
        try {
            onTripCurrentStationHide();
        } catch {
            // ignore
        }
    };

    const showTripDetailStationIndicator = (stationId) => {
        if (!onTripDetailStationIndicator) return;
        const sid = toText(stationId);
        if (!sid) return;
        try {
            onTripDetailStationIndicator({ stationId: sid });
        } catch {
            // ignore
        }
    };

    const clearTripDetailStationIndicator = () => {
        if (!onTripDetailStationIndicatorClear) return;
        try {
            onTripDetailStationIndicatorClear();
        } catch {
            // ignore
        }
    };

    const scheduleTripPreview = ({ previewKey, payload, immediate }) => {
        tripPreviewScheduler.schedule({ previewKey, payload, immediate });
    };

    let scheduleTripDetailHide = () => {};
    let lockTripPreview = () => {};
    let unlockTripPreview = () => {};

    // expanded state per (lineId, direction)
    let expandedDirKeys = new Set();
    const dirFilterStateByKey = new Map(); // lineId||dir -> { origins:Set, terminals:Set, types:Set }
    const dirFilterRowsByKey = new Map(); // lineId||dir -> Array<{origin,terminal,type}>
    const dirFilteredTripKeysByKey = new Map(); // lineId||dir -> Array<tripKey|baseTripKey>
    const dirPrintPayloadByKey = new Map(); // lineId||dir -> export payload for print-timetables.js
    const dirPreviewMetaByKey = new Map(); // lineId||dir -> { lineId, originStationIds:string[], terminalStationIds:string[] }
    const makeLineDirKey = (lineId, dirKey) => `${toText(lineId)}||${toText(dirKey) || 'Unknown'}`;
    const dirKeyOf = (lineId, dir) => `${toText(lineId)}||${toText(dir) || 'Unknown'}`;
    const isLoopLine = (lineId) => {
        const s = toText(lineId);
        return s === 'JR-East.Yamanote' || s === 'Toei.Oedo';
    };
    const isDirExpanded = (lineId, dir) => expandedDirKeys.has(dirKeyOf(lineId, dir));
    const setDirExpanded = (lineId, dir, expanded) => {
        const k = dirKeyOf(lineId, dir);
        if (!k) return;
        if (expanded) expandedDirKeys.add(k);
        else expandedDirKeys.delete(k);
    };

    const applyDirPreviewByKey = async (lineDirKey, { force = false, fitMode } = {}) => {
        if (isMultiSelectModeEnabled()) return;
        const key = toText(lineDirKey);
        if (!key) return;
        const meta = dirPreviewMetaByKey.get(key);
        if (!meta) return;

        const currentStationIds = (() => {
            const out = [];
            const sid = toText(currentStationId);
            if (sid) out.push(sid);
            return out;
        })();
        try {
            const resolved = await resolveStationIdForLine(toText(meta.lineId));
            const rid = toText(resolved);
            if (rid && !currentStationIds.includes(rid)) currentStationIds.push(rid);
        } catch {
            // ignore
        }

        const sourceLineIds = (() => {
            const temp = temporaryPanelSourceLineIdsByDisplayLineId.get(toText(meta.lineId));
            if (Array.isArray(temp) && temp.length) return Array.from(new Set(temp.map(x => toText(x)).filter(Boolean)));
            return [];
        })();

        const tripKeys = Array.isArray(dirFilteredTripKeysByKey.get(key))
            ? dirFilteredTripKeysByKey.get(key)
            : [];

        const targetId = toText(meta.lineId);
        const throughServiceCategory = THROUGH_SERVICE_CONFIGS.find(info => 
            info.lineId === targetId 
        )?.category || '';

        panelRoutePreview.applyDirectionPreview({
            currentStationIds,
            fitMode,
            force,
            key,
            meta,
            onEnter: onDirPreviewEnter,
            sourceLineIds,
            targetTripKeys: tripKeys,
            throughServiceCategory
        });
    };

    const clearDirPreview = () => {
        panelRoutePreview.clearDirectionPreview({ onLeave: onDirPreviewLeave });
    };

    const pinDirPreviewByKey = (lineDirKey) => {
        panelSelectionState.setPinnedDirPreviewKey(lineDirKey);
    };

    const unpinDirPreview = () => {
        panelSelectionState.clearPinnedDirPreviewKey();
    };

    const clearPinnedDirPreview = () => {
        unpinDirPreview();
        clearDirPreview();
    };

    const setPinnedPanelSelection = (kind, key) => {
        const nextSelection = panelSelectionState.setPinnedPanelSelection(kind, key);
        if (!nextSelection) {
            body.classList.remove('is-pinned');
            return;
        }
        body.classList.add('is-pinned');
    };

    let getCurrentPinnedInteractionKey = () => '';
    let hasPinnedPanelState = () => false;

    const isDirFilterPinned = () => {
        // 仅“方向筛选按钮点击后”的固定态允许被时刻表 hover 打断。
        // 其他固定态（公司/线路/车次锁定）仍然禁止 hover 变更。
        return panelSelectionState.isDirFilterPinned();
    };

    // 从 timetable row/grid-cell 向上查找所属 lineId + dirKey，判断是否与 pinnedDirPreviewKey 同方向
    const isTripRowInPinnedDir = (rowEl) => {
        if (!(rowEl instanceof Element)) return false;
        const pinnedDir = toText(panelSelectionState.getPinnedDirPreviewKey());
        if (!pinnedDir) return false;

        const dirBody = rowEl.closest?.('[data-dir-body][data-dir-key]');
        const lineEl = rowEl.closest?.('[data-line-id]');
        if (!dirBody || !lineEl) return false;

        const dirKey = toText(dirBody.getAttribute('data-dir-key'));
        const lineId = toText(lineEl.getAttribute('data-line-id'));
        if (!dirKey || !lineId) return false;

        return makeLineDirKey(lineId, dirKey) === pinnedDir;
    };

    const getInteractionKeyFromTarget = (target) => resolvePanelInteractionKeyFromTarget(target, {
        body,
        findTripTarget,
        getDirFilterButtonTarget,
        getDirPrintButtonTarget,
        getDirTitleTarget,
        getDirTriangleTarget,
        getLineTarget,
        getCompanyTarget,
        makeLineDirKey,
        toText
    });

    const restoreStationDefaultSelection = () => {
        if (!onRestoreStationLines) return;
        try {
            onRestoreStationLines(
                Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : [],
                { stationId: toText(currentStationId) || null }
            );
        } catch {
            // ignore
        }
    };

    const panelPinnedTripDetailState = createPanelPinnedTripDetailState({
        toText,
        clearTripDetailHideTimer,
        scheduleTripDetailHideTimer: (callback, delayMs) => {
            tripDetailHideTimer = setTimeout(() => {
                tripDetailHideTimer = null;
                callback?.();
            }, delayMs);
        },
        hideTripDetail: () => hideTripDetail(),
        panelSelectionState,
        body,
        clearPinnedDirPreview,
        restoreStationDefaultSelection,
        getTripLocked: () => tripLocked,
        setTripLocked: (value) => {
            tripLocked = value;
        },
        getLockedTripKey: () => lockedTripKey,
        setLockedTripKey: (value) => {
            lockedTripKey = value;
        },
        getTripDetailPinned: () => tripDetailPinned,
        setTripDetailPinned: (value) => {
            tripDetailPinned = value;
        },
        setLastTripDetailKey: (value) => {
            lastTripDetailKey = value;
        },
        setLastAppliedHoverKey: (value) => {
            lastAppliedHoverKey = value;
        }
    });
    scheduleTripDetailHide = (delayMs = 220) => panelPinnedTripDetailState.scheduleTripDetailHide(delayMs);
    lockTripPreview = (tripKey) => panelPinnedTripDetailState.lockTripPreview(tripKey);
    unlockTripPreview = () => panelPinnedTripDetailState.unlockTripPreview();
    getCurrentPinnedInteractionKey = () => panelPinnedTripDetailState.getCurrentPinnedInteractionKey();
    hasPinnedPanelState = () => panelPinnedTripDetailState.hasPinnedPanelState();
    const clearPinnedPanelState = ({ restoreStation = true } = {}) =>
        panelPinnedTripDetailState.clearPinnedPanelState({ restoreStation });

    const applyDayToggleUi = () => {
        const day = currentServiceDay;
        daySeg.classList.remove('Weekday', 'SaturdayHoliday');
        daySeg.classList.add(day === 'Weekday' ? 'Weekday' : 'SaturdayHoliday');
        btnWeekday.classList.toggle('is-active', day === 'Weekday');
        btnHoliday.classList.toggle('is-active', day === 'SaturdayHoliday');
    };

    const notifyJourneyRecompute = () => {
        crossFeatureBridge.recomputeJourney();
    };

    const setServiceDay = (day) => {
        const v = String(day || '').trim();
        if (v !== 'Weekday' && v !== 'SaturdayHoliday') return;
        if (currentServiceDay === v) return;
        currentServiceDay = v;
        applyDayToggleUi();
        renderAllTimetables();
        notifyJourneyRecompute();
    };

    btnWeekday.addEventListener('click', (e) => {
        stopEvent(e);
        setServiceDay('Weekday');
    });
    btnHoliday.addEventListener('click', (e) => {
        stopEvent(e);
        setServiceDay('SaturdayHoliday');
    });
    applyDayToggleUi();

    const applyPanelDateSelection = (pickedDate) => {
        if (!(pickedDate instanceof Date) || Number.isNaN(pickedDate.getTime())) return;
        currentPanelDate = new Date(pickedDate.getTime());
        datePanel.textContent = formatPanelDateText(currentPanelDate);
        datePickerInput.value = formatDateInputValue(currentPanelDate);
        setServiceDay(isSaturdayHoliday(currentPanelDate));
    };

    const openDatePicker = (evt) => {
        stopEvent(evt);
        datePickerInput.showPicker();
    };

    datePanel.addEventListener('click', openDatePicker, { passive: false });
    datePanel.addEventListener('keydown', (evt) => {
        const key = toText(evt?.key);
        if (key !== 'Enter' && key !== ' ') return;
        openDatePicker(evt);
    }, { passive: false });

    datePickerInput.addEventListener('change', (evt) => {
        const picked = parseDateInputValue(evt?.target?.value);
        if (!picked) return;
        applyPanelDateSelection(picked);
    });

    timeInput.addEventListener('input', (e) => {
        stopEvent(e);
        const normalized = normalizeTimePickerHHMM(timeInput.value, { toText });
        const v = normalized || toText(timeInput.value) || '';
        if (!v) {
            isAutoNowClock = true;
            syncAutoNowClock({ forceRender: true });
            return;
        }

        isAutoNowClock = false;
        currentNowOverrideHHMM = v;
        renderAllTimetables();
        notifyJourneyRecompute();
    });
    timeInput.addEventListener('blur', () => {
        const normalized = normalizeTimePickerHHMM(timeInput.value, { toText });
        if (normalized) timeInput.value = normalized;
    });
    btnAutoNow.addEventListener('click', (e) => {
        stopEvent(e);
        timePickerController.close();
        restoreAutoNowClock();
        notifyJourneyRecompute();
    }, { passive: false });

    const loadTimetableForLineId = async (lineId) => {
        const id = toText(lineId);
        if (!id) return null;
        return crossFeatureBridge.loadTimetableForLineId(id);
    };

    const refTripCache = new Map(); // refId -> trip|null
    const getRefLineId = (refId) => {
        const s = toText(refId);
        if (!s) return null;
        const parts = s.split('.').map((x) => x.trim()).filter(Boolean);
        if (parts.length < 2) return null;
        return `${parts[0]}.${parts[1]}`;
    };
    const loadTripByRefId = async (refId) => {
        const key = toText(refId);
        if (!key) return null;
        if (refTripCache.has(key)) return refTripCache.get(key);

        const refLineId = getRefLineId(key);
        if (!refLineId) {
            refTripCache.set(key, null);
            return null;
        }

        const data = await loadTimetableForLineId(refLineId);
        const list = Array.isArray(data) ? data : [];
        let hit = list.find((t) => toText(t?.id) === key) || null;
        if (!hit) {
            const parts = key.split('.').map((x) => x.trim()).filter(Boolean);
            const maybeNoDay = parts.length >= 2 ? parts.slice(0, -1).join('.') : key;
            hit =
                list.find((t) => toText(t?.t) === maybeNoDay) ||
                list.find((t) => toText(t?.id) === maybeNoDay) ||
                list.find((t) => {
                    const id = toText(t?.id);
                    return id ? id.startsWith(`${maybeNoDay}.`) : false;
                }) ||
                null;
        }

        refTripCache.set(key, hit);
        return hit;
    };

    const extractTripSpecialNames = (tripLike) => {
        const list = Array.isArray(tripLike?.nm) ? tripLike.nm : [];
        const out = [];
        for (const item of list) {
            const name = toText(item?.['zh-Hans'] || item?.['zh-Hnas'] || item?.ja || item?.en);
            if (name) out.push(name);
        }
        return Array.from(new Set(out));
    };

    const tripSpecialNamesCache = new Map();
    const collectTripSpecialNames = async (trip) => {
        const rootKey = toText(trip?.id) || toText(trip?.t);
        if (rootKey && tripSpecialNamesCache.has(rootKey)) {
            return tripSpecialNamesCache.get(rootKey) || [];
        }

        const visitedTripKeys = new Set();
        const visitedRefs = new Set();
        const queue = [trip];
        const names = new Set();

        while (queue.length) {
            const cur = queue.shift();
            if (!cur) continue;

            const curKey = toText(cur?.id) || toText(cur?.t);
            if (curKey) {
                if (visitedTripKeys.has(curKey)) continue;
                visitedTripKeys.add(curKey);
            }

            for (const name of extractTripSpecialNames(cur)) {
                names.add(name);
            }

            const refs = [
                ...(Array.isArray(cur?.pt) ? cur.pt : (cur?.pt ? [cur.pt] : [])),
                ...(Array.isArray(cur?.nt) ? cur.nt : (cur?.nt ? [cur.nt] : []))
            ]
                .map((x) => toText(x))
                .filter(Boolean);

            for (const refId of refs) {
                if (visitedRefs.has(refId)) continue;
                visitedRefs.add(refId);
                const refTrip = await loadTripByRefId(refId);
                if (refTrip) queue.push(refTrip);
            }
        }

        const result = Array.from(names);
        if (rootKey) tripSpecialNamesCache.set(rootKey, result);
        return result;
    };

    const buildTripFilterKeys = (trip) => {
        const keys = [];
        const id = toText(trip?.id);
        const t = toText(trip?.t);
        const baseFromId = id ? id.replace(/\.(Weekday|SaturdayHoliday)(\.[0-9]+)?$/, '') : '';
        if (id) keys.push(id);
        if (t) keys.push(t);
        if (baseFromId) keys.push(baseFromId);
        return keys;
    };
    const getNtFirstDepartTime = async (refId) => {
        const trip = await loadTripByRefId(refId);
        const tt = Array.isArray(trip?.tt) ? trip.tt : [];
        const first = tt.length ? tt[0] : null;
        return toText(first?.d) || toText(first?.a) || null;
    };
    const getPtLastArriveTime = async (refId) => {
        const trip = await loadTripByRefId(refId);
        const tt = Array.isArray(trip?.tt) ? trip.tt : [];
        const last = tt.length ? tt[tt.length - 1] : null;
        return toText(last?.a) || toText(last?.d) || null;
    };

        // 如果不是特殊的直通线路，或者没有配置测向规则（如常磐线），直接退出
    const getStationIds = (value) => getPanelTripDetailStationIds(value, { toText });

    const resolveThroughServiceEndpointIds = (trip) => resolvePanelTripDetailThroughServiceEndpointIds({
        trip,
        loadTripByRefId,
        toText
    });

    const findTripByKey = async (lineId, tripKey) => {
        const key = toText(tripKey);
        if (!key) return null;

        const candidateLineIds = Array.from(new Set([
            toText(getRefLineId(key)),
            toText(lineId),
            ...((Array.isArray(currentLineGroupByMainId?.get?.(toText(lineId)))
                ? currentLineGroupByMainId.get(toText(lineId))
                : [])
                .map((x) => toText(x))
                .filter(Boolean))
        ].filter(Boolean)));
        if (!candidateLineIds.length) return null;

        let fallback = null;
        for (const candLineId of candidateLineIds) {
            const data = await loadTimetableForLineId(candLineId);
            const list = Array.isArray(data) ? data : [];
            if (!list.length) continue;

            const candidates = list.filter((t) => {
                const id = toText(t?.id);
                const tkey = toText(t?.t);
                if (id === key || tkey === key) return true;
                return id ? id.startsWith(`${key}.`) : false;
            });
            if (!candidates.length) continue;

            const withDay = candidates.find((t) => parseTripServiceDayFromId(t?.id) === currentServiceDay);
            if (withDay) return withDay;
            if (!fallback) fallback = candidates[0] || null;
        }

        return fallback;
    };

    const resolveStationIdForLine = async (lineId) => {
        const rid = toText(lineId);
        if (!rid) return null;

        // 如果当前站点 id 本身就是该线路的站点 id，则直接用
        const sid = toText(currentStationId);
        if (sid && (sid === rid || sid.startsWith(`${rid}.`))) return sid;

        // 优先：用 station-groups.json 反查换乘组内“该线路对应的 station id”
        try {
            const groupsIndex = await getStationGroupsIndex();
            const groupIds = sid ? groupsIndex.get(sid) : null;
            if (Array.isArray(groupIds) && groupIds.length) {
                for (const candidate of groupIds) {
                    const c = toText(candidate);
                    if (!c) continue;
                    if (c === rid || c.startsWith(`${rid}.`)) return c;
                }
            }
        } catch {
            // ignore
        }

        // 换乘站：用 (railwayId + stationName.zh-Hans) 反查该线路对应的 station id
        const name = toText(currentStationNameZh);
        if (!name) return sid || null;

        const idx = await getStationsIndex();
        const hit = idx?.stationIdByRailwayAndNameZh?.get?.(`${rid}||${name}`);
        return hit || sid || null;
    };

    const toServiceHourIndex = (timeMs, serviceDayStartMs) => {
        const ms = Number(timeMs);
        const base = Number(serviceDayStartMs);
        if (!Number.isFinite(ms) || !Number.isFinite(base)) return null;
        return Math.floor((ms - base) / 3600000);
    };

    const formatServiceHourLabel = (serviceHourIndex) => {
        const idx = Number(serviceHourIndex);
        if (!Number.isFinite(idx)) return '';
        const hour = (SERVICE_DAY_BOUNDARY_HOUR + idx) % 24;
        return String((hour + 24) % 24).padStart(2, '0');
    };

    const chooseHourWindow = ({ minHour, maxHour, currentHour, expanded }) => {
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

        const size = 10;
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

    const buildGridHintsHtml = ({ typeHints, terminalHints, specialHints }) => {
        const typeLegendItems = (Array.isArray(typeHints) ? typeHints : [])
            .map((item) => {
                const full = toText(item?.full);
                const abbr = toText(item?.abbr);
                const color = toText(item?.color) || '#888';
                if (!full || !abbr) return '';
                if (isNoMarkTypeName(full)) {
                    return `<span class="panel-grid-hint-item panel-grid-hint-item-type" style="color:${escapeHtml(color)}"><i>无标</i>=${escapeHtml(full)}</span>`;
                }
                const sameLabel = full === abbr;
                const text = sameLabel ? full : `${full}=${abbr}`;
                return `<span class="panel-grid-hint-item panel-grid-hint-item-type" style="color:${escapeHtml(color)}">${escapeHtml(text)}</span>`;
            })
            .filter(Boolean)
            .join('<span class="panel-grid-hint-sep"> / </span>');

        const terminalPairHtml = [];
        const seenTerminalPair = new Set();
        for (const item of (Array.isArray(terminalHints) ? terminalHints : [])) {
            const hintParts = Array.isArray(item?.hintParts)
                ? item.hintParts
                    .map((part) => ({
                        full: toText(part?.full),
                        abbr: toText(part?.abbr),
                        noMarkMode: toText(part?.noMarkMode)
                    }))
                    .filter((part) => part.full && part.abbr)
                : [];

            if (hintParts.length) {
                for (const part of hintParts) {
                    const noMarkMode = part.noMarkMode;
                    if (noMarkMode === 'label' || noMarkMode === 'dual') {
                        const nmKey = `nm||${part.full}`;
                        if (!seenTerminalPair.has(nmKey)) {
                            seenTerminalPair.add(nmKey);
                            terminalPairHtml.push(`<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888"><i>无标</i>-${escapeHtml(part.full)}</span>`);
                        }
                    }

                    if (noMarkMode === 'label') continue;

                    const abbrKey = `${part.abbr}||${part.full}`;
                    if (seenTerminalPair.has(abbrKey)) continue;
                    seenTerminalPair.add(abbrKey);
                    terminalPairHtml.push(`<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888">${escapeHtml(part.abbr)}-${escapeHtml(part.full)}</span>`);
                }
                continue;
            }

            const full = toText(item?.full);
            const abbr = toText(item?.abbr);
            if (!full || !abbr) continue;

            const fullParts = full.split(/[\/·]/).map((x) => toText(x)).filter(Boolean);
            const abbrParts = abbr.split(/[\/·]/).map((x) => toText(x)).filter(Boolean);
            const pairLen = Math.max(fullParts.length, abbrParts.length);

            if (pairLen <= 1) {
                const key = `${abbr}||${full}`;
                if (seenTerminalPair.has(key)) continue;
                seenTerminalPair.add(key);
                terminalPairHtml.push(`<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888">${escapeHtml(abbr)}-${escapeHtml(full)}</span>`);
                continue;
            }

            for (let i = 0; i < pairLen; i += 1) {
                const fullPart = toText(fullParts[i] || fullParts[fullParts.length - 1]);
                const abbrPart = toText(abbrParts[i] || abbrParts[abbrParts.length - 1]);
                if (!fullPart || !abbrPart) continue;
                const key = `${abbrPart}||${fullPart}`;
                if (seenTerminalPair.has(key)) continue;
                seenTerminalPair.add(key);
                terminalPairHtml.push(`<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888">${escapeHtml(abbrPart)}-${escapeHtml(fullPart)}</span>`);
            }
        }

        const terminalLegendItems = terminalPairHtml.join('<span class="panel-grid-hint-sep"> / </span>');
        const specialLegendItems = (Array.isArray(specialHints) ? specialHints : [])
            .map((item) => {
                const full = toText(item?.full);
                const abbr = toText(item?.abbr);
                const sp = full.split(" ")[0];
                if (!full || !abbr) return '';
                return `<span class="panel-grid-hint-item panel-grid-hint-item-special" style="color:#888">${escapeHtml(abbr)}-${escapeHtml(sp)}</span>`;
            })
            .filter(Boolean)
            .join('<span class="panel-grid-hint-sep"> / </span>');

        return `
            <div class="panel-grid-hints">
                <div class="panel-grid-hint-line">
                    <span class="panel-grid-hint-label">种别：</span>
                    <span class="panel-grid-hint-content">${typeLegendItems || '<span class="panel-grid-hint-item" style="color:#888">无</span>'}</span>
                </div>
                <div class="panel-grid-hint-line">
                    <span class="panel-grid-hint-label">终点站：</span>
                    <span class="panel-grid-hint-content">${terminalLegendItems || '<span class="panel-grid-hint-item" style="color:#888">无</span>'}</span>
                </div>
                ${specialLegendItems ? `<div class="panel-grid-hint-line"><span class="panel-grid-hint-label">特殊班次：</span><span class="panel-grid-hint-content">${specialLegendItems}</span></div>` : ''}
            </div>
        `;
    };

    const buildGridTableHtmlForDirection = ({
        rowsForDir,
        typeHints,
        terminalHints,
        specialHints,
        expanded,
        nowMs,
        serviceDayStartMs
    }) => {
        const rows = Array.isArray(rowsForDir) ? rowsForDir.slice().sort((a, b) => (Number(a?.timeMs) || 0) - (Number(b?.timeMs) || 0)) : [];
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

        const currentHour = toServiceHourIndex(nowMs, serviceDayStartMs);
        const currentHourForFocus = Number.isFinite(currentHour)
            ? Math.max(minHour, Math.min(maxHour, currentHour))
            : minHour;
        const focusStartHour = currentHourForFocus;
        const hourWindow = expanded
            ? Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i)
            : chooseHourWindow({ minHour, maxHour, currentHour, expanded: false });
        if (!hourWindow.length) return '<div class="panel-timetable-empty">当前无班次</div>';

        const typeAbbrByName = new Map((Array.isArray(typeHints) ? typeHints : []).map((x) => [toText(x?.full), toText(x?.abbr)]));
        const terminalAbbrByName = new Map((Array.isArray(terminalHints) ? terminalHints : []).map((x) => [toText(x?.full), toText(x?.abbr)]));
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
        const specialAbbrBySp = new Map((Array.isArray(specialHints) ? specialHints : []).map((x) => [toText(x?.sp), toText(x?.abbr)]));

        const rowHtml = hourWindow.map((hour, idx) => {
            const trips = Array.isArray(byHour.get(hour)) ? byHour.get(hour) : [];
            const bgClass = idx % 2 === 0 ? 'is-alt-a' : 'is-alt-b';
            const focusAttr = expanded && hour === focusStartHour ? ' data-grid-focus-start="1"' : '';
            const currentAttr = (!expanded && hour === currentHourForFocus) ? ' data-grid-current-hour="1"' : '';

                const cellsHtml = trips.length
                ? trips.map((trip, tripIndex) => {
                const typeName = toText(trip?.typeName);
                const destName = toText(trip?.terminalDisplayName || trip?.terminalName || trip?.destName);
                const typeAbbr = toText(typeAbbrByName.get(typeName)) || buildTypeAbbr(typeName);
                const rawDestAbbr = toText(terminalAbbrByName.get(destName)) || toText(destName).slice(0, 1);
                const rowTerminalNames = Array.isArray(trip?.terminalNames)
                    ? trip.terminalNames.map((x) => toText(x)).filter(Boolean)
                    : [];
                const rowHasSplitByNtMultiDest = !!trip?.hasNt && Number(trip?.resolvedTerminalIdsCount) > 1;
                const rowNoMarkModes = rowTerminalNames
                    .map((name) => toText(terminalNoMarkModeByName.get(name)))
                    .filter(Boolean);
                const shouldHideDestAbbr = rowNoMarkModes.length > 0
                    && !(rowHasSplitByNtMultiDest && rowNoMarkModes.some((mode) => mode === 'dual'));
                const destAbbr = shouldHideDestAbbr ? '' : rawDestAbbr;
                const minute = toText(trip?.minuteLabel).slice(0, 2);
                const tripKey = toText(trip?.realOriginId);
                const color = resolveTrainTypeColorForTheme(trip?.typeColor) || 'var(--ui-text, #111)';
                const tripAttr = tripKey ? ` data-trip-key="${escapeHtml(tripKey)}"` : '';
                const lastClass = tripIndex === trips.length - 1 ? ' is-hour-last' : '';
                
                const showTypeAbbr = !isNoMarkTypeName(typeName);
                const showDestAbbr = !!destAbbr;
                const specialNames = Array.isArray(trip?.specialNames)
                    ? trip.specialNames.map((x) => toText(x)).filter(Boolean)
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
                const realOriginId = toText(trip?.realOriginId || trip?.id);

                    const isTerminal = !!trip?.showTerminalLabel;
                    const isOrigin = !!trip?.showOriginLabel;

                    const pastClass = trip?.isPast ? ' is-past' : '';

                    return `
                        <div class="panel-grid-cell panel-grid-cell-trip${useSpecialBackground ? ' has-special' : ''}${pastClass}${lastClass}"${tripAttr}>
                            <span class="panel-grid-trip${pastClass}" style="color:${escapeHtml(color)}">
                                ${tripAbbrHtml}
                                <span class="panel-grid-trip-minute"><span class="panel-grid-trip-minute-text">${escapeHtml(minute)}</span>${
                                    isTerminal ? '<span class="panel-grid-trip-minute-flag is-terminal-flag" aria-label="终点站">终</span>' : 
                                    isOrigin ? '<span class="panel-grid-trip-minute-flag is-origin-flag" aria-label="起点站">始</span>' : 
                                    ''}</span>
                            </span>
                        </div>
                    `;
                }).join('')
                : '<div class="panel-grid-cell is-empty is-hour-last"></div>';

            return `
                <div class="panel-grid-row ${bgClass}"${focusAttr}${currentAttr} data-grid-hour="${escapeHtml(String(hour))}">
                    <div class="panel-grid-hour">${escapeHtml(formatServiceHourLabel(hour))}</div>
                    <div class="panel-grid-trips">
                        ${cellsHtml}
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="panel-timetable-grid">${rowHtml}</div>`;
    };

    const findTripTarget = (target) => findPanelTripTarget(target);

    const buildTimetableRowsHtml = async ({
        lineId,
        stationId,
        sourceLineIds,
        allowedTripKeySet,
        printStationName,
        printTitleText,
        timetableViewModeOverride
    }) => {
        const fallbackStationKey = toText(stationId);
        const allowedKeys = normalizeTimetableAllowedTripKeys(allowedTripKeySet, { toText });
        const effectiveTimetableViewMode = toText(timetableViewModeOverride) || timetableViewMode;
        const effectivePrintStationName = toText(printStationName) || toText(currentStationNameZh);
        const effectivePrintTitleText = toText(printTitleText) || toText(titleMain.textContent);

        const [stationsIndex, trainTypesIndex, trainTypeColorIndex] = await Promise.all([
            getStationsIndex(),
            getTrainTypesIndex(),
            getTrainTypeColorIndex()
        ]);

        const mergedSourceLineIds = normalizeTimetableSourceLineIds({ lineId, sourceLineIds, toText });
        if (!mergedSourceLineIds.length) {
            return {
                html: '',
                stationInfo: { typeItems: [] }
            };
        }

        const sourceDatas = await Promise.all(mergedSourceLineIds.map(async (sourceLineId) => {
            const [resolvedStationId, data] = await Promise.all([
                resolveStationIdForLine(sourceLineId),
                loadTimetableForLineId(sourceLineId)
            ]);
            const stationKey = toText(resolvedStationId) || fallbackStationKey;
            return {
                sourceLineId,
                stationKey,
                list: Array.isArray(data) ? data : []
            };
        }));

        if (!sourceDatas.some((x) => x.stationKey && x.list.length)) {
            return {
                html: '',
                stationInfo: { typeItems: [] }
            };
        }

        const now = getDisplayNowMs();
        const serviceDayStartMs = getServiceDayStartMs(new Date(now));
        const rows = [];
        const rowsForPreview = [];
        const printRowsByServiceDay = new Map(PRINT_SERVICE_DAYS.map((day) => [day, []]));
        const throughDirectionCache = new Map();
        const allTypeColorByName = new Map();
        const stopTypeColorByName = new Map();
        const stopTypeNameSet = new Set();
        const typeCountByName = new Map();
        const typeStopCountByName = new Map();
        const typeStopStationSetByName = new Map();
        const sg = await getStationGroupsIndex();

        const collectRowsFromTripList = async ({
            tripList,
            sourceLineId,
            stationKey,
            serviceDay = currentServiceDay,
            trackTypeSummary
        }) => {
            const out = [];
            const list = Array.isArray(tripList) ? tripList : [];
            const targetServiceDay = toText(serviceDay) || currentServiceDay;
            for (const trip of list) {
            // 按 timetables 的 id 最后一段区分工作日/休息日
                const tripId = toText(trip?.id);
                const tripServiceDay = parseTripServiceDayFromId(tripId);
                if (tripServiceDay && tripServiceDay !== targetServiceDay) continue;

                const typeId = toText(trip?.y);
                const isTypeExcludedForSummary = isExcludedLineType(lineId, typeId);
                let typeName = typeId ? (trainTypesIndex.get(typeId) || typeId) : '';
                let typeColor = typeId ? resolveTrainTypeColorForTheme(trainTypeColorIndex.get(typeId)) : '';


                const typeBaseName = resolveTypeBaseName(typeName);
                if (trackTypeSummary && typeBaseName && !isTypeExcludedForSummary) {
                    typeCountByName.set(typeName, (Number(typeCountByName.get(typeName) || 0)) + 1);
                    if (!allTypeColorByName.has(typeName)) {
                        allTypeColorByName.set(typeName, toText(typeColor));
                    }
                }

                const tt = Array.isArray(trip?.tt) ? trip.tt : [];
                if (!tt.length) continue;
                if (trackTypeSummary && typeBaseName && !isTypeExcludedForSummary) {
                    if (!typeStopStationSetByName.has(typeName)) {
                        typeStopStationSetByName.set(typeName, new Set());
                    }
                    const stopSet = typeStopStationSetByName.get(typeName);
                    for (const ttRow of tt) {
                        const sid = toText(ttRow?.s);
                        if (!sid) continue;
                        stopSet.add(sid);
                    }
                    typeStopCountByName.set(typeName, stopSet.size);
                }
                const stop = tt.find((x) => {
                    const currentSid = toText(x?.s);
                    if (!currentSid) return false;

                    // 1. 首先判断 ID 是否完全一致（最快且最直接）
                    if (currentSid === stationKey) return true;

                    // 2. 如果不一致，再查换乘组索引
                    return sg?.get?.(currentSid)?.includes?.(stationKey);
                });

                if (trackTypeSummary && typeBaseName && !isTypeExcludedForSummary) {
                    if (stop) {
                        stopTypeNameSet.add(typeName);
                        if (!stopTypeColorByName.has(typeName) && toText(typeColor)) {
                            stopTypeColorByName.set(typeName, toText(typeColor));
                        }
                    }
                }

                if (allowedKeys && allowedKeys.size) {
                    const hit = buildTripFilterKeys(trip).some((k) => allowedKeys.has(k));
                    if (!hit) continue;
                }
                if (!stop) continue;

                let arr = toText(stop?.a);
                let dep = toText(stop?.d);

                const os = Array.isArray(trip?.os) ? trip.os : (trip?.os ? [trip.os] : []);
                const ds = Array.isArray(trip?.ds) ? trip.ds : (trip?.ds ? [trip.ds] : []);
                const ptRefs = Array.isArray(trip?.pt) ? trip.pt : (trip?.pt ? [trip.pt] : []);
                const ntRefs = Array.isArray(trip?.nt) ? trip.nt : (trip?.nt ? [trip.nt] : []);
                const hasPt = ptRefs.some((x) => !!toText(x));
                const hasNt = ntRefs.some((x) => !!toText(x));
                const tripDirectionCacheKey = `${toText(lineId)}||${toText(trip?.id) || toText(trip?.t)}`;
                const isOriginStation = sg?.get?.(trip.tt?.[0]?.s)?.includes?.(stationKey) || trip.tt?.[0]?.s === stationKey;
                const isTerminalStation = sg?.get?.(trip.tt.at(-1)?.s)?.includes?.(stationKey) || trip.tt.at(-1)?.s === stationKey;

                let derivedThroughDirection = throughDirectionCache.get(tripDirectionCacheKey);
                if (derivedThroughDirection === undefined) {
                    derivedThroughDirection = await derivePanelTripDetailThroughServiceDirection({
                        trip,
                        displayLineId: lineId,
                        throughServiceConfigs: THROUGH_SERVICE_CONFIGS,
                        loadTripByRefId,
                        isTokenCurrent: () => true,
                        toText
                    });
                    throughDirectionCache.set(tripDirectionCacheKey, derivedThroughDirection);
                }
                const dir = toText(derivedThroughDirection || trip?.d);
                const isLoopDirection = /Loop/i.test(dir);
                const skipCrossTripFillForLoop = isLoopDirection && (hasPt || hasNt);
                // 真始发/真终点：没有 pt/nt 的端点站，不补全时间
                const showOriginLabel = isOriginStation && !hasPt;
                const showTerminalLabel = isTerminalStation && !hasNt;
                const allowMirrorFill = !(showOriginLabel || showTerminalLabel);


                // (2) Segment boundary: only terminal stops borrow nt's first departure.
                if (!dep && isTerminalStation && !skipCrossTripFillForLoop) {
                    const ntRefId = toText(ntRefs?.[0]);
                    if (ntRefId) dep = await getNtFirstDepartTime(ntRefId);
                }

                // (2) Segment boundary: only origin stops borrow pt's last arrival.
                if (!arr && isOriginStation && !skipCrossTripFillForLoop) {
                    const ptRefId = toText(ptRefs?.[0]);
                    if (ptRefId) arr = await getPtLastArriveTime(ptRefId);
                }

                // (1) If only one side exists, mirror it (except true endpoints)
                if (allowMirrorFill) {
                    if (!arr && dep) arr = dep;
                    if (!dep && arr) dep = arr;
                }

                const timeStr = dep || arr;
                const parsed = parseHHMMToServiceDayMs(timeStr, serviceDayStartMs);
                if (!timeStr || !parsed) continue;
                const timeMs = parsed.ms;

                const throughEndpoints = await resolveThroughServiceEndpointIds(trip);
                const destId = toText(ds?.[0]);
                const loopDest = (dir === 'InnerLoop' ? '内环' : (dir === 'OuterLoop' ? '外环' : ''));
                const resolvedTerminalIds = Array.isArray(throughEndpoints?.terminalIds)
                    ? throughEndpoints.terminalIds.map((x) => toText(x)).filter(Boolean)
                    : [];
                const primaryTerminalId = toText(resolvedTerminalIds[0]) || toText(throughEndpoints?.terminalId) || destId;
                const secondaryTerminalId = toText(resolvedTerminalIds[1]) || '';
                const primaryTerminalName = loopDest || (primaryTerminalId ? (stationsIndex?.idToNameZh?.get?.(primaryTerminalId) || primaryTerminalId) : '');
                const secondaryTerminalName = loopDest || (secondaryTerminalId ? (stationsIndex?.idToNameZh?.get?.(secondaryTerminalId) || secondaryTerminalId) : '');
                const terminalNames = loopDest
                    ? [loopDest]
                    : Array.from(new Set([primaryTerminalName, secondaryTerminalName].map((x) => toText(x)).filter(Boolean)));
                const terminalDisplayName = buildTerminalDisplayLabel(terminalNames);
                const destName = terminalDisplayName || primaryTerminalName;
                const originId = toText(throughEndpoints?.originId) || toText(os?.[0]);
                const originName = originId ? (stationsIndex?.idToNameZh?.get?.(originId) || originId) : '';
                const terminalIdForFilter = primaryTerminalId || destId;
                const terminalName = destName || (loopDest || (terminalIdForFilter ? (stationsIndex?.idToNameZh?.get?.(terminalIdForFilter) || terminalIdForFilter) : ''));

                const destNamesForDir = (() => {
                    if (loopDest) return [loopDest];
                    if (terminalNames.length) return terminalNames;
                    const outNames = [];
                    for (const x of ds) {
                        const id = toText(x);
                        if (!id) continue;
                        outNames.push(stationsIndex?.idToNameZh?.get?.(id) || id);
                    }
                    return outNames.length ? outNames : (destName ? [destName] : []);
                })();

                const specialNames = await collectTripSpecialNames(trip);

                const tripKey = tripId || toText(trip?.t) || '';
                const baseTripKey = toText(trip?.n) //|| (tripId ? tripId.replace(/\.(Weekday|SaturdayHoliday)(\.[0-9]+)?$/, '') : '');

                const arrParsed = arr ? parseHHMMToServiceDayMs(arr, serviceDayStartMs) : null;
                const depParsed = dep ? parseHHMMToServiceDayMs(dep, serviceDayStartMs) : null;

                out.push({
                    destName,
                    destId,
                    arr: arr || null,
                    dep: dep || null,
                    arrPlus: !!arrParsed?.isNextDaySegment,
                    depPlus: !!depParsed?.isNextDaySegment,
                    timeMs,
                    serviceHourIndex: toServiceHourIndex(timeMs, serviceDayStartMs),
                    minuteLabel: toText(timeStr).slice(3, 5),
                    isPast: timeMs < now,
                    typeName,
                    typeColor,
                    specialNames,
                    hasNameMeta: Array.isArray(trip?.nm) && trip.nm.length > 0,
                    originId,
                    originName,
                    terminalId: terminalIdForFilter,
                    throughEndpoints,
                    terminalName,
                    terminalDisplayName,
                    terminalNames,
                    originIdsCount: os.length,
                    terminalIdsCount: ds.length,
                    hasNt,
                    resolvedTerminalIdsCount: resolvedTerminalIds.length,
                    terminalIds: resolvedTerminalIds.length ? resolvedTerminalIds : (terminalIdForFilter ? [terminalIdForFilter] : []),
                    dir,
                    destNamesForDir,
                    showOriginLabel,
                    showTerminalLabel,
                    tripKey,
                    baseTripKey,
                    realOriginId: toText(trip?.realOriginId || trip?.id),
                    stopCount: Array.isArray(tt) ? tt.length : null,
                    rawStopNames: (Array.isArray(tt) ? tt : []).map(x => stationsIndex?.idToNameZh?.get?.(toText(x?.s)) || toText(x?.s)),
                    sourceLineId: toText(sourceLineId)
                });
            }
            return out;
        };

        for (const sourceData of sourceDatas) {
            const sourceLineId = toText(sourceData?.sourceLineId);
            const stationKey = toText(sourceData?.stationKey);
            const rawList = Array.isArray(sourceData?.list) ? sourceData.list : [];
            if (!stationKey || !rawList.length) continue;
            let displayList = rawList.slice();
            
            // 1. 使用 Set 收集所有终到车次的下一步线路前缀
            const nextLinePrefixes = new Set();
            const previousLinePrefixes = new Set();
            const currentLineDirctionForNext = new Set();
            const currentLineDirectionForPrevious = new Set();

            
            for (const trip of rawList) {
                if (/Loop/i.test(toText(trip?.d))) continue; 
                const isTerminal = trip.tt.at(-1)?.s === stationKey;
                const isOrigin = trip.tt?.[0]?.s === stationKey;
                const nt = trip.nt;
                const pt = trip.pt;
                
                if (isTerminal && nt) {
                    // 统一转为数组处理，并提取前缀（例如 "JR-East.Yamanote"）
                    const refs = Array.isArray(nt) ? nt : [nt];
                    refs.forEach(ref => {
                        const prefix = ref.split('.').slice(0, 2).join('.');
                        const direction = trip.d;
                        if (prefix) nextLinePrefixes.add(prefix);
                        if (direction) currentLineDirctionForNext.add(direction);
                    });
                }

                if (isOrigin && pt) {
                    const refs = Array.isArray(pt) ? pt : [pt];
                    refs.forEach(ref => {
                        const prefix = ref.split('.').slice(0, 2).join('.');
                        const direction = trip.d;
                        if (prefix) previousLinePrefixes.add(prefix);
                        if (direction) currentLineDirectionForPrevious.add(direction);
                    });
                }
            }

            
            // 2. 如果去向唯一，则过滤掉所有在本站终到且有去向的的 trip,并插入下一条线路的data
            if (nextLinePrefixes.size === 1) {
                displayList = displayList.filter(trip => {
                    const isTerminal = trip.tt.at(-1)?.s === stationKey;
                    return !(isTerminal && trip.nt);
                });
                const nextLineId = Array.from(nextLinePrefixes)[0];
                const currentLineDirc = Array.from(currentLineDirctionForNext)[0];
                const nextLineSourceData = await loadTimetableForLineId(nextLineId);
                nextLineSourceData.forEach(trip => {
                    let shouldAdd = false;
                    const originStation = trip.tt?.[0]?.s;
                    const isOrigin = originStation && sg?.get?.(originStation)?.includes(stationKey);
                    const pt = trip?.pt;
                    if(isOrigin && !pt) shouldAdd = true;
                    if (isOrigin && pt) {
                        const ptLength = pt.length
                        if(ptLength==1 && pt[0].split('.').slice(0, 2).join('.') === sourceLineId ){
                            shouldAdd = true;
                        }
                    }
                    // 2. 执行插入与 ID 归化
                    if (shouldAdd) {
                        // 使用深拷贝防止污染共享时刻表缓存
                        const newTrip = structuredClone(trip);
                        // 替换 Trip ID：确保运行日过滤、缓存 Key 匹配正常
                        if (typeof newTrip.id === 'string') {
                            newTrip.realOriginId = newTrip.id;
                            newTrip.id = newTrip.id.replace(nextLineId, sourceLineId);
                        }

                        if (typeof newTrip.d === 'string') {
                            newTrip.originD = newTrip.d;
                            newTrip.d = currentLineDirc;
                        }

                        displayList.push(newTrip);
                    }
                    })
            }

            if (previousLinePrefixes.size === 1) {
                const previousLineId = Array.from(previousLinePrefixes)[0];
                const currentLineDirc = Array.from(currentLineDirectionForPrevious)[0];
                const previousLineSourceData = await loadTimetableForLineId(previousLineId);
                previousLineSourceData.forEach(trip => {
                    let shouldAdd = false;
                    const destStation = trip.tt?.at(-1)?.s;
                    const isTerminal = destStation && sg?.get?.(destStation)?.includes(stationKey);
                    const nt = trip?.nt;
                    if(isTerminal && !nt) shouldAdd = true;
                    if (shouldAdd) {
                        const newTrip = structuredClone(trip);
                        if (typeof newTrip.id === 'string') {
                            newTrip.realOriginId = newTrip.id;
                            newTrip.id = newTrip.id.replace(previousLineId, sourceLineId);
                        }
                        if (typeof newTrip.d === 'string') {
                            newTrip.originD = newTrip.d;
                            newTrip.d = currentLineDirc;
                        }
                        displayList.push(newTrip);
                    }
                })
            }

            displayList = displayList.map(trip => {
                if (trip.realOriginId === undefined) {
                    trip.realOriginId = trip.id;
                }
                return trip;
            })

            const displayRows = await collectRowsFromTripList({
                tripList: displayList,
                sourceLineId,
                stationKey,
                serviceDay: currentServiceDay,
                trackTypeSummary: true
            });
            rows.push(...displayRows);
            printRowsByServiceDay.get(currentServiceDay)?.push(...displayRows);

            for (const serviceDay of PRINT_SERVICE_DAYS) {
                if (serviceDay === currentServiceDay) continue;
                const printRows = await collectRowsFromTripList({
                    tripList: displayList,
                    sourceLineId,
                    stationKey,
                    serviceDay,
                    trackTypeSummary: false
                });
                printRowsByServiceDay.get(serviceDay)?.push(...printRows);
            }

            const previewRows = await collectRowsFromTripList({
                tripList: rawList,
                sourceLineId,
                stationKey,
                serviceDay: currentServiceDay,
                trackTypeSummary: false
            });
            rowsForPreview.push(...previewRows);
        }

        const stationTypeSummaryItems = buildStationTypeSummaryItems({
            allTypeColorByName,
            stopTypeColorByName,
            stopTypeNameSet,
            typeCountByName,
            typeStopCountByName
        });

        if (!rows.length) {
            return {
                html: '',
                stationInfo: {
                    typeItems: stationTypeSummaryItems
                }
            };
        }

        // 去重：同一物理班次在同一站点可能被拆成多个记录（如 *.Weekday.1 / *.Weekday.2），
        // 且种别 y 可能不同，导致 UI 同一时刻出现“多条不同种别”。
        // 这里按 (baseTripKey + dir + timeMs) 合并，优先保留“有 dep 的记录”（更符合站点时刻表的上车语义）。
        rows.splice(0, rows.length, ...mergeDuplicateTimetableRows(rows, { toText }));

        rows.sort((a, b) => a.timeMs - b.timeMs);
        rowsForPreview.sort((a, b) => a.timeMs - b.timeMs);
        for (const serviceDay of PRINT_SERVICE_DAYS) {
            const dayRows = printRowsByServiceDay.get(serviceDay) || [];
            printRowsByServiceDay.set(
                serviceDay,
                mergeDuplicateTimetableRows(dayRows, { toText })
                    .sort((a, b) => a.timeMs - b.timeMs)
            );
        }

        // 统计每条线路的所有方向 d，并聚合/计数该方向下所有对应 ds 的中文名
        const DEST_NAME_MIN_COUNT = 0; // 方向下目的地名称至少出现x次才显示
        const {
            anyDestAboveThreshold,
            dirOrder,
            dirToDestCounts
        } = deriveDirectionStats({
            destNameMinCount: DEST_NAME_MIN_COUNT,
            rows,
            toText
        });

        const renderTime = (r) => {
            const a = toText(r.arr);
            const d = toText(r.dep);
            if (!a && !d) return '';

            const base = (() => {
                if (!a) return `<span class="panel-time-depart">${escapeHtml(formatTimeWithPlus(d, r.depPlus))}</span>`;
                if (!d) return `<span class="panel-time-arrive">${escapeHtml(formatTimeWithPlus(a, r.arrPlus))}</span>`;
                // 到达/发车时间相同也统一显示两者
                return `<span class="panel-time-arrive">${escapeHtml(formatTimeWithPlus(a, r.arrPlus))}</span> <span class="panel-time-depart">${escapeHtml(formatTimeWithPlus(d, r.depPlus))}</span>`;
            })();

            const originCls = `panel-time-label panel-time-label-origin${r.isPast ? ' is-past' : ''}`;
            const terminalCls = `panel-time-label panel-time-label-terminal${r.isPast ? ' is-past' : ''}`;
            if (r.showOriginLabel && r.showTerminalLabel) {
                return `<span class="${originCls}">始发站</span> ${base} <span class="${terminalCls}">终点站</span>`;
            }
            if (r.showOriginLabel) return `<span class="${originCls}">始发站</span> ${base}`;
            if (r.showTerminalLabel) return `${base} <span class="${terminalCls}">终点站</span>`;
            return base;
        };

        const renderTimeForPrint = (r) => renderTime({ ...(r || {}), isPast: false });

        // 分组显示：默认显示所有方向；方向内默认展示 3 条未来班次
        let html = '';
        const directionDebug = [];
        for (const dirKey of dirOrder) {
            const counts = dirToDestCounts.get(dirKey) || new Map();
            // If no destination anywhere met threshold, show all destinations sorted by frequency
            const useAllIfBelowThreshold = !anyDestAboveThreshold;
            const entries = Array.from(counts.entries());
            const filteredNames = entries
                .filter(([name, c]) => useAllIfBelowThreshold ? true : Number(c) >= DEST_NAME_MIN_COUNT)
                .sort((a, b) => {
                    const dc = Number(b[1]) - Number(a[1]);
                    if (dc) return dc;
                    return String(a[0]).localeCompare(String(b[0]));
                })
                .map(([name]) => name);
            const lineDirKey = makeLineDirKey(lineId, dirKey);
            const expanded = isDirExpanded(lineId, dirKey);
            const tri = expanded ? '▾' : '▸';

            const rowsForDir = rows.filter((r) => (toText(r.dir) || 'Unknown') === dirKey);
            const { typeHints, terminalHints, specialHints } = buildDirectionGridHints(rowsForDir);
            const filterRowsForDir = rowsForDir
                .map((r) => toDirFilterRow(r, { toText }))
                .filter(hasDirFilterRowValue);
            dirFilterRowsByKey.set(lineDirKey, filterRowsForDir);

            const state = dirFilterStateByKey.get(lineDirKey) || createEmptyDirFilterState();
            if (!dirFilterStateByKey.has(lineDirKey)) {
                dirFilterStateByKey.set(lineDirKey, state);
            }

            const filteredRowsForDir = filterRowsByDirFilterState(rowsForDir, state);

            const rowsForDirPreview = rowsForPreview.filter((r) => (toText(r.dir) || 'Unknown') === dirKey);
            const filteredRowsForDirPreview = filterRowsByDirFilterState(rowsForDirPreview, state);

            const filteredTripKeys = Array.from(new Set(
                filteredRowsForDirPreview
                    .flatMap((r) => [toText(r.tripKey), toText(r.baseTripKey)])
                    .filter(Boolean)
            ));
            dirFilteredTripKeysByKey.set(lineDirKey, filteredTripKeys);

            const uniqueIds = (arr) => Array.from(new Set((Array.isArray(arr) ? arr : []).map((x) => toText(x)).filter(Boolean)));
            dirPreviewMetaByKey.set(lineDirKey, {
                lineId: toText(lineId),
                originStationIds: uniqueIds(filteredRowsForDirPreview.flatMap((r) => {
                    if (r?.throughEndpoints?.originIds?.length) return r.throughEndpoints.originIds;
                    if (r?.throughEndpoints?.originId) return [r.throughEndpoints.originId];
                    return [r.originId];
                })),
                terminalStationIds: uniqueIds(filteredRowsForDirPreview.flatMap((r) => {
                    if (r?.throughEndpoints?.terminalIds?.length) return r.throughEndpoints.terminalIds;
                    if (r?.throughEndpoints?.terminalId) return [r.throughEndpoints.terminalId];
                    const ids = Array.isArray(r?.terminalIds) ? r.terminalIds : [];
                    return ids.length ? ids : [r.terminalId || r.destId];
                }))
            });

            const labelRows = filteredRowsForDir.length ? filteredRowsForDir : rowsForDir;
            const labelCount = new Map();
            for (const item of labelRows) {
                const names = Array.isArray(item.destNamesForDir) ? item.destNamesForDir : [];
                for (const n of names) {
                    const s = toText(n);
                    if (!s) continue;
                    labelCount.set(s, (labelCount.get(s) || 0) + 1);
                }
            }

            const lineMetaStations = getLineMeta?.(lineId)?.stations || [];
            const lineStationNamesSet = new Set(lineMetaStations.map(x => toText(stationsIndex?.idToNameZh?.get?.(toText(x)) || toText(x))));

            const labelEntries = Array.from(labelCount.entries())
                .filter(([name, count]) => {
                    if (count >= 20) return true;
                    if (count <= 5) return false;
                    if (lineStationNamesSet.has(name)) return true;

                    for (const row of labelRows) {
                        const rowDests = Array.isArray(row.destNamesForDir) ? row.destNamesForDir : [];
                        if (rowDests.includes(name)) continue;

                        const validOtherDest = rowDests.some(d => (labelCount.get(d) || 0) > 5);
                        if (!validOtherDest) continue;

                        const rawStopNames = Array.isArray(row.rawStopNames) ? row.rawStopNames : [];
                        if (rawStopNames.includes(name)) {
                            return false;
                        }
                    }

                    return true;
                })
                .sort((a, b) => {
                    const dc = Number(b[1]) - Number(a[1]);
                    if (dc) return dc;
                    return String(a[0]).localeCompare(String(b[0]));
                })
                .map(([name]) => name);

            const label = labelEntries.length ? labelEntries.join('，') : (filteredNames.length ? filteredNames.slice(0, 1).join('，') : dirKey);

            directionDebug.push({
                dirKey,
                dirLabel: label,
                typeHints,
                terminalHints,
                specialHints
            });

            const timetableViewClass = effectiveTimetableViewMode === 'grid' ? 'panel-timetable-view-grid' : 'panel-timetable-view-list';
            const gridHintsHtml = effectiveTimetableViewMode === 'grid'
                ? buildGridHintsHtml({ typeHints, terminalHints, specialHints })
                : '';
            const rowsForListView = filteredRowsForDir.map((row) => {
                const displayTime = toText(row?.arr) || toText(row?.dep);
                const parsedDisplayTime = displayTime ? parseHHMMToServiceDayMs(displayTime, serviceDayStartMs) : null;
                if (!parsedDisplayTime) return row;
                return {
                    ...(row || {}),
                    isPast: parsedDisplayTime.ms < now
                };
            });
            const future = rowsForListView.filter((r) => !r.isPast);
            const visible = expanded ? rowsForListView : future.slice(0, 3);

            const printableRowsForDir = filteredRowsForDir.map((r) => ({ ...(r || {}), isPast: false }));
            const printableListHtml = renderPanelPrintableTimetableListHtml({
                rows: printableRowsForDir,
                renderTime: renderTimeForPrint,
                resolveBadgeTextColor: resolvePanelBadgeTextColor
            });
            const printableGridHtml = buildGridTableHtmlForDirection({
                rowsForDir: printableRowsForDir,
                typeHints,
                terminalHints,
                specialHints,
                expanded: true,
                nowMs: now,
                serviceDayStartMs
            });

            const buildPrintPayloadForServiceDay = (serviceDay) => {
                const serviceRowsForDir = (printRowsByServiceDay.get(serviceDay) || [])
                    .filter((r) => (toText(r.dir) || 'Unknown') === dirKey);
                const {
                    typeHints: serviceTypeHints,
                    terminalHints: serviceTerminalHints,
                    specialHints: serviceSpecialHints
                } = buildDirectionGridHints(serviceRowsForDir);
                const serviceRowsPrintable = serviceRowsForDir.map((r) => ({ ...(r || {}), isPast: false }));
                const serviceGridHintsHtml = effectiveTimetableViewMode === 'grid'
                    ? buildGridHintsHtml({
                        typeHints: serviceTypeHints,
                        terminalHints: serviceTerminalHints,
                        specialHints: serviceSpecialHints
                    })
                    : '';
                const serviceListHtml = renderPanelPrintableTimetableListHtml({
                    rows: serviceRowsPrintable,
                    renderTime: renderTimeForPrint,
                    resolveBadgeTextColor: resolvePanelBadgeTextColor
                });
                const serviceGridHtml = buildGridTableHtmlForDirection({
                    rowsForDir: serviceRowsPrintable,
                    typeHints: serviceTypeHints,
                    terminalHints: serviceTerminalHints,
                    specialHints: serviceSpecialHints,
                    expanded: true,
                    nowMs: now,
                    serviceDayStartMs
                });

                return buildTimetablePrintPayload({
                    companyLogoMap,
                    currentStationName: effectivePrintStationName,
                    getCompanyLogoSrc,
                    gridHintsHtml: serviceGridHintsHtml,
                    gridHtml: serviceGridHtml,
                    lineId,
                    lineMeta: getLineMeta?.(lineId) || {},
                    listHtml: serviceListHtml,
                    dirKey,
                    dirLabel: label,
                    serviceDay,
                    timetableViewMode: effectiveTimetableViewMode,
                    titleText: effectivePrintTitleText,
                    toText
                });
            };

            const currentPrintPayload = buildTimetablePrintPayload({
                companyLogoMap,
                currentStationName: effectivePrintStationName,
                getCompanyLogoSrc,
                gridHintsHtml,
                gridHtml: printableGridHtml,
                lineId,
                lineMeta: getLineMeta?.(lineId) || {},
                listHtml: printableListHtml,
                dirKey,
                dirLabel: label,
                serviceDay: currentServiceDay,
                timetableViewMode: effectiveTimetableViewMode,
                titleText: effectivePrintTitleText,
                toText
            });
            dirPrintPayloadByKey.set(lineDirKey, {
                ...currentPrintPayload,
                serviceDayVariants: PRINT_SERVICE_DAYS.map((serviceDay) => buildPrintPayloadForServiceDay(serviceDay))
            });

            const timetableHtml = effectiveTimetableViewMode === 'grid'
                ? buildGridTableHtmlForDirection({
                    rowsForDir: filteredRowsForDir,
                    typeHints,
                    terminalHints,
                    specialHints,
                    expanded,
                    nowMs: now,
                    serviceDayStartMs
                })
                : renderPanelTimetableListHtml({
                    rows: visible,
                    renderTime,
                    resolveBadgeTextColor: resolvePanelBadgeTextColor
                });

            html += `
                <div class="panel-dir">
                    <div class="panel-dir-header" data-dir-toggle="1" data-dir-key="${escapeHtml(dirKey)}">
                        <span class="panel-dir-title">
                            <span class="panel-dir-prefix" aria-hidden="true">往</span>
                            <span class="panel-dir-marquee" aria-label="往 ${escapeHtml(label)} 方向">
                                <span class="panel-dir-marquee-inner">${escapeHtml(label)}</span>
                            </span>
                            <span class="panel-dir-suffix" aria-hidden="true">方向</span>
                        </span>
                        <span class="panel-dir-actions">
                            <span class="panel-dir-triangle" aria-hidden="true">${tri}</span>
                            ${isLoopLine(lineId) ? '' : `<button type="button" class="panel-dir-filter-btn" data-dir-filter-btn="1" data-line-id="${escapeHtml(lineId)}" data-dir-key="${escapeHtml(dirKey)}" aria-label="筛选">
                                <img class="panel-dir-filter-icon" alt="" src="${escapeHtml(getPreferredCachedImageSrc(getIconCandidates('filter.svg'), { cacheKey: 'icon:filter.svg' }))}" />
                            </button>`}
                            ${effectiveTimetableViewMode === 'grid' ? `<button type="button" class="panel-dir-print-btn" data-dir-print-btn="1" data-line-id="${escapeHtml(lineId)}" data-dir-key="${escapeHtml(dirKey)}" aria-label="打印时刻表">
                                <img class="panel-dir-print-icon" alt="" src="${escapeHtml(getPreferredCachedImageSrc(getIconCandidates('print.svg'), { cacheKey: 'icon:print.svg' }))}" />
                            </button>` : ''}
                        </span>
                    </div>
                    ${gridHintsHtml}
                    <div class="panel-timetable ${timetableViewClass} ${expanded ? 'is-expanded' : 'is-collapsed'}" data-dir-body="1" data-dir-key="${escapeHtml(dirKey)}">
                        ${timetableHtml}
                    </div>
                </div>
            `;
        }

        const lineMeta = getLineMeta?.(lineId) || {};
        gridDataDebugByLineId.set(toText(lineId), {
            lineId: toText(lineId),
            lineName: toText(lineMeta?.name) || toText(lineId),
            directions: directionDebug
        });

        return {
            html,
            stationInfo: {
                typeItems: stationTypeSummaryItems
            }
        };
    };

    const formatStationTypeBadgeLabel = (typeNameRaw) => {
        const name = toText(typeNameRaw);
        if (!name) return '';
        if (/\s/.test(name)) return name;
        const chars = Array.from(name);
        if (chars.length !== 2) return name;
        return `${chars[0]}      ${chars[1]}`;
    };

    const shouldUseSmallStationTypeBadgeFont = (typeNameRaw) => {
        const plain = toText(typeNameRaw).replace(/\s+/g, '');
        if (!plain) return false;
        return Array.from(plain).length > 4;
    };

    const applyLineStationInfo = (lineEl, stationInfo) => {
        if (!(lineEl instanceof Element)) return;
        const infoEl = lineEl.querySelector('[data-station-info]');
        if (!(infoEl instanceof Element)) return;
        const infoLeftEl = infoEl.querySelector('.panel-station-info-left');
        const typesEl = infoEl.querySelector('[data-station-type-summary]');
        if (!(typesEl instanceof Element)) return;

        const hasBadge = !!infoLeftEl?.querySelector?.('.rw-station-code-badge');
        const hasSuffix = !!lineEl.querySelector?.('[data-line-suffix-row] .panel-line-name-suffix');
        infoEl.classList.toggle('is-badge-only-no-suffix', hasBadge && !hasSuffix);

        const typeItems = Array.isArray(stationInfo?.typeItems)
            ? stationInfo.typeItems
                .map((item) => ({
                    name: toText(item?.name),
                    isStop: item?.isStop === true,
                    color: toText(item?.color)
                }))
                .filter((item) => item.name)
            : [];

        if (!typeItems.length) {
            typesEl.innerHTML = '';
            return;
        }

        const html = typeItems.map((item) => {
            const cls = item.isStop ? 'panel-station-info-type is-stop' : 'panel-station-info-type is-pass';
            const bgColor = item.isStop ? (toText(item.color) || '#555') : '#ddd';
            const smallFontStyle = shouldUseSmallStationTypeBadgeFont(item.name) ? ';font-size:10px' : '';
            const style = ` style="background-color:${escapeHtml(bgColor)}${smallFontStyle}"`;
            const label = formatStationTypeBadgeLabel(item.name);
            return `<span class="${cls}"${style}>${escapeHtml(label)}</span>`;
        }).join('');

        typesEl.innerHTML = html;
    };

    const snapshotPrintPayloadState = () => ({
        dirFilteredTripKeysByKey: new Map(dirFilteredTripKeysByKey),
        dirFilterRowsByKey: new Map(dirFilterRowsByKey),
        dirFilterStateByKey: new Map(dirFilterStateByKey),
        dirPreviewMetaByKey: new Map(dirPreviewMetaByKey),
        dirPrintPayloadByKey: new Map(dirPrintPayloadByKey),
        gridDataDebugByLineId: new Map(gridDataDebugByLineId)
    });

    const restorePrintPayloadState = (snapshot) => {
        const restoreMap = (target, source) => {
            target.clear();
            for (const [key, value] of source instanceof Map ? source.entries() : []) {
                target.set(key, value);
            }
        };
        restoreMap(dirFilteredTripKeysByKey, snapshot?.dirFilteredTripKeysByKey);
        restoreMap(dirFilterRowsByKey, snapshot?.dirFilterRowsByKey);
        restoreMap(dirFilterStateByKey, snapshot?.dirFilterStateByKey);
        restoreMap(dirPreviewMetaByKey, snapshot?.dirPreviewMetaByKey);
        restoreMap(dirPrintPayloadByKey, snapshot?.dirPrintPayloadByKey);
        restoreMap(gridDataDebugByLineId, snapshot?.gridDataDebugByLineId);
    };

    const buildLineStationPrintPayloadWithContext = async ({
        lineId,
        stationId,
        requestedTimetableViewMode = 'grid',
        stationsIndex
    } = {}) => {
        const lid = toText(lineId);
        const sid = toText(stationId);
        if (!lid || !sid || typeof document === 'undefined' || !document?.createElement) return null;

        const resolvedStationsIndex = stationsIndex || await getStationsIndex();
        const stationName = toText(resolvedStationsIndex?.idToNameZh?.get?.(sid)) || sid;
        const lineStationNameByLineId = await buildTransferLineStationNameMap({
            stationId: sid,
            stationNameZh: stationName,
            servingLineIds: [lid],
            lineGroupByMainId: new Map([[lid, [lid]]])
        });
        if (!lineStationNameByLineId.has(lid)) {
            lineStationNameByLineId.set(lid, {
                stationId: sid,
                name: '',
                code: toText(resolvedStationsIndex?.idToCode?.get?.(sid)),
                actualName: stationName
            });
        }
        const tempHost = document.createElement('div');

        tempHost.innerHTML = buildPanelCompaniesHtml({
            id: sid,
            name_zh: stationName,
            display_serving_ids: [lid],
            serving_ids: [lid]
        }, {
            companyLogoMap,
            getLineMeta,
            lineStationNameByLineId,
            railwaysOrderIndex,
            toText
        });

        await enhancePanelLineHeaderIcons(tempHost);

        const lineEl = Array.from(tempHost.querySelectorAll?.('[data-line-id]') || [])
            .find((el) => toText(el.getAttribute?.('data-line-id')) === lid) || null;
        if (!(lineEl instanceof Element)) return null;
        if (!toText(lineEl.getAttribute('data-station-name'))) {
            lineEl.setAttribute('data-station-name', stationName);
        }

        const rendered = await buildTimetableRowsHtml({
            lineId: lid,
            stationId: sid,
            sourceLineIds: [lid],
            allowedTripKeySet: null,
            printStationName: stationName,
            printTitleText: stationName,
            timetableViewModeOverride: toText(requestedTimetableViewMode) || 'grid'
        });
        const timetableRoot = lineEl.querySelector('[data-timetable-root]');
        if (timetableRoot instanceof Element) {
            timetableRoot.innerHTML = toText(rendered?.html);
        }
        applyLineStationInfo(lineEl, rendered?.stationInfo || null);

        return collectLinePrintPayloads({
            lineEl,
            lineId: lid,
            dirPrintPayloadByKey,
            makeLineDirKey,
            toText
        });
    };

    const buildLineStationPrintPayload = async ({
        lineId,
        stationId,
        timetableViewMode: requestedTimetableViewMode = 'grid'
    } = {}) => {
        const snapshot = snapshotPrintPayloadState();
        try {
            return await buildLineStationPrintPayloadWithContext({
                lineId,
                stationId,
                requestedTimetableViewMode
            });
        } finally {
            restorePrintPayloadState(snapshot);
        }
    };

    const createLineStationPrintPayloadSession = async ({
        lineId,
        timetableViewMode: requestedTimetableViewMode = 'grid'
    } = {}) => {
        const lid = toText(lineId);
        if (!lid) return null;

        const snapshot = snapshotPrintPayloadState();
        const stationsIndex = await getStationsIndex();
        let closed = false;

        return {
            async build(stationId) {
                if (closed) return null;
                return buildLineStationPrintPayloadWithContext({
                    lineId: lid,
                    stationId,
                    requestedTimetableViewMode,
                    stationsIndex
                });
            },
            close() {
                if (closed) return;
                closed = true;
                restorePrintPayloadState(snapshot);
            }
        };
    };

    installPanelTimetablePrintPayloadBuilder({
        buildLineStationPrintPayload,
        createLineStationPrintPayloadSession
    });

    const renderTimetableForLineEl = async (lineEl, stationId, token) => {
        if (!lineEl || !(lineEl instanceof Element)) return;
        if (token !== timetableRenderToken) return;

        const lineId = toText(lineEl.getAttribute('data-line-id'));
        if (!lineId) return;

        const ttEl = lineEl.querySelector('[data-timetable-root]');
        if (!ttEl) return;

        const sourceLineIds = (() => {
            const temp = temporaryPanelSourceLineIdsByDisplayLineId.get(lineId);
            if (Array.isArray(temp) && temp.length) {
                return Array.from(new Set(temp.map((x) => toText(x)).filter(Boolean)));
            }
            const grouped = currentLineGroupByMainId?.get?.(lineId);
            const list = Array.isArray(grouped) && grouped.length ? grouped : [lineId];
            return Array.from(new Set(list.map((x) => toText(x)).filter(Boolean)));
        })();

        const resolvedStationId = sourceLineIds.length === 1
            ? await resolveStationIdForLine(sourceLineIds[0])
            : toText(stationId);
        if (token !== timetableRenderToken) return;

        const rendered = await buildTimetableRowsHtml({
            lineId,
            stationId: resolvedStationId || stationId,
            sourceLineIds,
            allowedTripKeySet: temporaryPanelAllowedTripKeysByDisplayLineId.get(lineId) || null
        });

        if (token !== timetableRenderToken) return;
        ttEl.innerHTML = toText(rendered?.html) || '';
        applyLineStationInfo(lineEl, rendered?.stationInfo || null);

        hydrateRenderedTimetable(ttEl, {
            ElementRef: Element,
            HTMLImageElementRef: HTMLImageElement,
            getIconCandidates,
            getPreferredCachedImageSrc,
            setImageElementFromCache
        });
        /*

        // 方向展开态：默认把各方向可视区域滚到“最后一条已过班次”处（1 past + 9 future 的视觉效果）
        try {
            const expandedBodies = Array.from(ttEl.querySelectorAll('.panel-timetable.is-expanded'));
            for (const bodyEl of expandedBodies) {
                if (bodyEl.classList.contains('panel-timetable-view-grid')) {
                    bodyEl.style.maxHeight = '';

                    const pastCells = Array.from(bodyEl.querySelectorAll('.panel-grid-cell-trip.is-past'));
                    const lastPastCell = pastCells.length ? pastCells[pastCells.length - 1] : null;
                    if (lastPastCell instanceof Element) {
                        const bodyRect = bodyEl.getBoundingClientRect();
                        const cellRect = lastPastCell.getBoundingClientRect();
                        const naturalTop = bodyEl.scrollTop + (cellRect.top - bodyRect.top);
                        const desired = Math.max(0, Math.floor(naturalTop) - 10);
                        const maxScroll = Math.max(0, (bodyEl.scrollHeight || 0) - (bodyEl.clientHeight || 0));
                        bodyEl.scrollTop = Math.max(0, Math.min(desired, maxScroll));
                    } else {
                        const focusRow = bodyEl.querySelector('[data-grid-focus-start="1"]');
                        if (focusRow instanceof Element) {
                            bodyEl.scrollTop = Math.max(0, focusRow.offsetTop || 0);
                        } else {
                            bodyEl.scrollTop = 0;
                        }
                    }
                    continue;
                }

                const rows = Array.from(bodyEl.querySelectorAll('.panel-timetable-row'));
                if (!rows.length) continue;

                let lastPastIndex = -1;
                for (let i = rows.length - 1; i >= 0; i -= 1) {
                    if (rows[i]?.classList?.contains('is-past')) {
                        lastPastIndex = i;
                        break;
                    }
                }

                if (lastPastIndex > 0) {
                    const rowH = rows[0]?.offsetHeight || 18;
                    const desired = lastPastIndex * rowH;
                    const maxScroll = Math.max(0, (bodyEl.scrollHeight || 0) - (bodyEl.clientHeight || 0));
                    bodyEl.scrollTop = Math.max(0, Math.min(desired, maxScroll));
                } else {
                    bodyEl.scrollTop = 0;
                }
            }

            const collapsedGridBodies = Array.from(ttEl.querySelectorAll('.panel-timetable.panel-timetable-view-grid.is-collapsed'));
            for (const bodyEl of collapsedGridBodies) {
                const collapsedBaseHeight = 70; // 两行车次（不按小时数）
                bodyEl.style.maxHeight = `${collapsedBaseHeight}px`;

                const currentHourRow = bodyEl.querySelector('[data-grid-current-hour="1"]') || bodyEl.querySelector('.panel-grid-row');
                if (!(currentHourRow instanceof Element)) continue;

                const currentHourFullHeight = Math.ceil((currentHourRow.offsetHeight || 0) + 1);
                const targetHeight = Math.max(collapsedBaseHeight, currentHourFullHeight);
                bodyEl.style.maxHeight = `${targetHeight}px`;
                bodyEl.scrollTop = 0;
            }
        } catch {
            // ignore
        }

        // 超长方向标题/班次终点站：自动滚动（等待布局稳定 + 已完成默认定位滚动后再测量）
        */
        scheduleMarqueeApply(ttEl);
    };

    const buildTripStops = (trip, stationsIndex, serviceDayStartMs, realOriginId = '') => {
        const tt = Array.isArray(trip?.tt) ? trip.tt : [];
        const out = [];
        for (const stop of tt) {
            const sid = toText(stop?.s);
            if (!sid) continue;
            const name = stationsIndex?.idToNameZh?.get?.(sid) || sid;
            const arr = toText(stop?.a);
            const dep = toText(stop?.d);
            const arrParsed = arr ? parseHHMMToServiceDayMs(arr, serviceDayStartMs) : null;
            const depParsed = dep ? parseHHMMToServiceDayMs(dep, serviceDayStartMs) : null;
            const timeMs = (depParsed?.ms || arrParsed?.ms || null);

            out.push({
                stationId: sid,
                stationName: name,
                arr: arr || null,
                dep: dep || null,
                arrPlus: !!arrParsed?.isNextDaySegment,
                depPlus: !!depParsed?.isNextDaySegment,
                timeMs,
                realOriginId: toText(realOriginId || trip?.realOriginId || trip?.id)
            });
        }
        return out;
    };

    const normalizeTripStops = (stops, serviceDayStartMs, { allowEndpointAKeyFallback = true, originIds, terminalIds, originAKeys, terminalAKeys, showOriginLabel, showTerminalLabel }) => {
        const out = [];
        for (const s of Array.isArray(stops) ? stops : []) {
            let arr = toText(s?.arr) || '';
            let dep = toText(s?.dep) || '';

            const stationId = toText(s?.stationId);
            const stationAKey = getStationAKey(stationId);
            const isOriginStop = !!showOriginLabel && matchesTripDetailEndpointStop({
                allowAKeyFallback: allowEndpointAKeyFallback,
                endpointAKeys: originAKeys,
                endpointIds: originIds,
                stationAKey,
                stationId,
                toText
            });
            const isTerminalStop = !!showTerminalLabel && matchesTripDetailEndpointStop({
                allowAKeyFallback: allowEndpointAKeyFallback,
                endpointAKeys: terminalAKeys,
                endpointIds: terminalIds,
                stationAKey,
                stationId,
                toText
            });
            const allowMirrorFill = !(isOriginStop || isTerminalStop);

            if (allowMirrorFill) {
                if (!arr && dep) arr = dep;
                if (!dep && arr) dep = arr;
            }

            const arrParsed = arr ? parseHHMMToServiceDayMs(arr, serviceDayStartMs) : null;
            const depParsed = dep ? parseHHMMToServiceDayMs(dep, serviceDayStartMs) : null;
            const timeMs = depParsed?.ms || arrParsed?.ms || null;

            out.push({
                stationId,
                stationName: toText(s?.stationName),
                arr: arr || null,
                dep: dep || null,
                arrPlus: !!arrParsed?.isNextDaySegment,
                depPlus: !!depParsed?.isNextDaySegment,
                timeMs,
                isPast: false,
                showOriginLabel: isOriginStop,
                showTerminalLabel: isTerminalStop
            });
        }
        return out;
    };

    const mergeStops = (base, next) => {
        const out = Array.isArray(base) ? base.slice() : [];
        const arr = Array.isArray(next) ? next : [];
        if (!arr.length) return out;
        if (!out.length) return arr.slice();

        const last = out[out.length - 1];
        const first = arr[0];
        const sameStation = last?.stationId && first?.stationId && last.stationId === first.stationId;
        const sameTime = toText(last?.arr) === toText(first?.arr) && toText(last?.dep) === toText(first?.dep);
        if (sameStation && sameTime) {
            return out.concat(arr.slice(1));
        }
        return out.concat(arr);
    };

    const sameStopTime = (a, b) => {
        if (!a || !b) return false;
        return toText(a.stationId) === toText(b.stationId)
            && toText(a.arr) === toText(b.arr)
            && toText(a.dep) === toText(b.dep);
    };

    const getStationAKey = (stationId) => {
        return getTripDetailStationAKey(stationId, toText);
    };

    const getStationAKeyForLine = (lineId, stationId) => {
        return getSpecialTripDetailStationAKey(lineId, stationId) || getStationAKey(stationId);
    };

    const getTripLineId = (trip) => {
        const rid = toText(trip?.r);
        if (rid) return rid;
        const id = toText(trip?.id) || toText(trip?.t);
        if (!id) return '';
        const parts = id.split('.').map((x) => x.trim()).filter(Boolean);
        if (parts.length < 2) return '';
        return `${parts[0]}.${parts[1]}`;
    };

    const buildLineDescriptor = (lineIdRaw) => {
        const lineId = toText(lineIdRaw);
        if (!lineId) return null;
        const meta = getLineMeta(lineId) || {};
        const company = toText(meta?.company);
        const abb = toText(companyLogoMap?.[company]?.abb || companyLogoMap?.[company]?.zh || company);
        let lineName = toText(meta?.name || lineId);
        if (abb && lineName.startsWith(abb)) {
            lineName = lineName.slice(abb.length).trim();
        }
        const text = `${abb}${lineName}`.trim() || lineId;
        const color = toText(meta?.color);
        return {
            lineId,
            text,
            color: color || null
        };
    };

    const isSameLineName = (lineIdA, lineIdB) => {
        const a = buildLineDescriptor(lineIdA);
        const b = buildLineDescriptor(lineIdB);
        const an = toText(a?.text || lineIdA);
        const bn = toText(b?.text || lineIdB);
        return !!an && !!bn && an === bn;
    };

    const buildRefLineDescriptor = (refId) => {
        const lineId = getRefLineId(refId);
        return buildLineDescriptor(lineId);
    };

    const getTripDestName = (trip, stationsIndex) => {
        const dir = toText(trip?.d);
        if (dir === 'InnerLoop') return '内环';
        if (dir === 'OuterLoop') return '外环';
        const ds = Array.isArray(trip?.ds) ? trip.ds : (trip?.ds ? [trip.ds] : []);
        const destId = toText(ds?.[0]);
        return destId ? (stationsIndex?.idToNameZh?.get?.(destId) || destId) : '';
    };

    const getTripTypeName = (trip, trainTypesIndex) => {
        const typeId = toText(trip?.y);
        if (!typeId) return '';
        return toText(trainTypesIndex?.get?.(typeId) || typeId);
    };

    const getTripTypeColor = (trip, trainTypeColorIndex) => {
        const typeId = toText(trip?.y);
        if (!typeId) return '';
        return resolveTrainTypeColorForTheme(trainTypeColorIndex?.get?.(typeId));
    };

    const renderTripDetail = async ({ lineId, tripKey, clientX, clientY, pinned, fitMode }) => {
        const token = ++tripDetailToken;
        tripDetailPinned = !!pinned;
        clearTripDetailHideTimer();
        clearTripDetailStationIndicator();

        const trip = await findTripByKey(lineId, tripKey);
        if (token !== tripDetailToken) return;
        if (!trip) {
            tripDetailRoot.classList.add('is-hidden');
            return;
        }

        const tripLineId = getTripLineId(trip) || toText(lineId);
        const getTripStationAKey = (stationId) => getStationAKeyForLine(tripLineId, stationId);
        const allowEndpointAKeyFallback = !shouldUseExactTripDetailEndpointIds(tripLineId);

        await showTripCurrentStationHint({ lineId: tripLineId, token });
        if (token !== tripDetailToken) return;

        const now = getDisplayNowMs();
        const serviceDayStartMs = getServiceDayStartMs(new Date(now));

        const [stationsIndex, trainTypesIndex, trainTypeColorIndex] = await Promise.all([
            getStationsIndex(),
            getTrainTypesIndex(),
            getTrainTypeColorIndex()
        ]);
        if (token !== tripDetailToken) return;

        const {
            allowEndpointAKeyFallback: endpointAKeyFallback,
            hasNt,
            hideThroughSegmentsForLoop,
            ntRefIds,
            ntRefs,
            originAKeys,
            originIds,
            ptRefIds,
            ptRefs,
            showOriginLabel,
            showTerminalLabel,
            terminalAKeys,
            terminalIds
        } = buildTripDetailEndpointContext({
            allowEndpointAKeyFallback,
            trip,
            getStationAKey: getTripStationAKey,
            toText
        });
        // Trip detail 展示包含直通( pt/nt )链路：始发/终点标记应始终显示在全链路端点，
        // 且需兼容“同名换乘站不同线路 stationId”场景（用 AKey 兜底匹配）。
        const ptChain = await collectPanelTripDetailTripChainByTrip({
            startTrip: trip,
            key: 'pt',
            loadTripByRefId,
            isTokenCurrent: () => token === tripDetailToken,
            toText
        });
        if (token !== tripDetailToken) return;
        const ntChain = await collectPanelTripDetailTripChainByTrip({
            startTrip: trip,
            key: 'nt',
            loadTripByRefId,
            isTokenCurrent: () => token === tripDetailToken,
            toText
        });
        if (token !== tripDetailToken) return;

        const segments = [];

        const mainRowsRaw = normalizeTripStops(buildTripStops(trip, stationsIndex, serviceDayStartMs, trip?.realOriginId || trip?.id), serviceDayStartMs, {
            allowEndpointAKeyFallback: endpointAKeyFallback,
            originIds,
            terminalIds,
            originAKeys,
            terminalAKeys,
            showOriginLabel,
            showTerminalLabel
        }).map((s) => ({ ...s, seg: 'main', isMain: true }));

        if (hideThroughSegmentsForLoop && mainRowsRaw.length) {
            const firstMain = mainRowsRaw[0];
            const lastMain = mainRowsRaw[mainRowsRaw.length - 1];

            const ptRefId = toText(ptRefs?.[0]);
            if (ptRefId && firstMain) {
                const ptArr = await getPtLastArriveTime(ptRefId);
                if (token !== tripDetailToken) return;
                const parsed = ptArr ? parseHHMMToServiceDayMs(ptArr, serviceDayStartMs) : null;
                if (ptArr) {
                    firstMain.arr = ptArr;
                    firstMain.arrPlus = !!parsed?.isNextDaySegment;
                }
            }

            const ntRefId = toText(ntRefs?.[0]);
            if (ntRefId && lastMain) {
                const ntDep = await getNtFirstDepartTime(ntRefId);
                if (token !== tripDetailToken) return;
                const parsed = ntDep ? parseHHMMToServiceDayMs(ntDep, serviceDayStartMs) : null;
                if (ntDep) {
                    lastMain.dep = ntDep;
                    lastMain.depPlus = !!parsed?.isNextDaySegment;
                }
            }
        }

        if (!hideThroughSegmentsForLoop) {
            for (const ptTrip of (Array.isArray(ptChain) ? ptChain.slice().reverse() : [])) {
                const rows = normalizeTripStops(buildTripStops(ptTrip, stationsIndex, serviceDayStartMs, ptTrip?.realOriginId || ptTrip?.id), serviceDayStartMs, {
                    allowEndpointAKeyFallback: endpointAKeyFallback,
                    originIds,
                    terminalIds,
                    originAKeys,
                    terminalAKeys,
                    showOriginLabel,
                    showTerminalLabel
                }).map((s) => ({ ...s, seg: 'pt', isMain: false }));
                segments.push({
                    kind: 'pt',
                    lineId: getTripLineId(ptTrip),
                    r: getTripLineId(ptTrip),
                    d: toText(ptTrip?.d),
                    rows,
                    typeName: getTripTypeName(ptTrip, trainTypesIndex),
                    typeColor: getTripTypeColor(ptTrip, trainTypeColorIndex)
                });
            }
        }

        segments.push({
            kind: 'main',
            lineId: getTripLineId(trip),
            r: getTripLineId(trip),
            d: toText(trip?.d),
            rows: mainRowsRaw,
            typeName: getTripTypeName(trip, trainTypesIndex),
            typeColor: getTripTypeColor(trip, trainTypeColorIndex)
        });

        if (!hideThroughSegmentsForLoop) {
            for (const ntTrip of (Array.isArray(ntChain) ? ntChain : [])) {
                const rows = normalizeTripStops(buildTripStops(ntTrip, stationsIndex, serviceDayStartMs, ntTrip?.realOriginId || ntTrip?.id), serviceDayStartMs, {
                    allowEndpointAKeyFallback: endpointAKeyFallback,
                    originIds,
                    terminalIds,
                    originAKeys,
                    terminalAKeys,
                    showOriginLabel,
                    showTerminalLabel
                }).map((s) => ({ ...s, seg: 'nt', isMain: false }));
                segments.push({
                    kind: 'nt',
                    lineId: getTripLineId(ntTrip),
                    r: getTripLineId(ntTrip),
                    d: toText(ntTrip?.d),
                    rows,
                    typeName: getTripTypeName(ntTrip, trainTypesIndex),
                    typeColor: getTripTypeColor(ntTrip, trainTypeColorIndex)
                });
            }
        }

        const mergedSegments = mergeTripDetailSegmentsAtBoundaries({
            getStationAKey: getTripStationAKey,
            segments,
            toText
        });

        const stationIdForLine = await resolveStationIdForLine(tripLineId);
        if (token !== tripDetailToken) return;
        const { segmentsWithPast } = applyTripDetailPastState({
            currentStationId: stationIdForLine,
            getStationAKey: getTripStationAKey,
            segments: mergedSegments,
            toText
        });
        const markRowsPastByCurrentStation = (rowsInput, fallbackPast = false) => markRowsPastByStation({
            currentStationId: stationIdForLine,
            fallbackPast,
            getStationAKey: getTripStationAKey,
            rows: rowsInput,
            toText
        });

        tripDetailTitle.innerHTML = await buildPanelTripDetailTitleHtml({
            trip,
            stationsIndex,
            trainTypesIndex,
            trainTypeColorIndex,
            resolveThroughServiceEndpointIds,
            getStationIds,
            buildTerminalDisplayLabel,
            getTripDestName,
            resolveTrainTypeColorForTheme,
            collectTripSpecialNames,
            escapeHtml,
            toText
        });
        if (token !== tripDetailToken) return;
        const currentLineDesc = buildLineDescriptor(getTripLineId(trip) || lineId);

        const renderStopRow = (s) => {
            const rowCls = s.isPast ? 'panel-trip-detail-row is-past' : 'panel-trip-detail-row';
            const stationId = toText(s.stationId);
            return renderPanelTripDetailStopRowHtml({
                rowClass: rowCls,
                stationClass: 'panel-trip-detail-station',
                timeCellClass: 'panel-trip-detail-time panel-trip-detail-moment',
                timeHtml: renderTripDetailMomentHtml(s),
                stationId,
                stationCode: toText(stationsIndex?.idToCode?.get?.(stationId) || ''),
                stationName: toText(s.stationName || stationId),
                lineColor: toText(s.lineColor || '')
            });
        };

        const pickPrimaryLaneIndex = (lanes, mainLineId) => {
            const list = Array.isArray(lanes) ? lanes : [];
            if (!list.length) return 0;
            const mainId = toText(mainLineId);
            const byMain = list.findIndex((lane) => isSameLineName(toText(lane?.lineId), mainId));
            if (byMain >= 0) return byMain;

            const byRef = list.findIndex((lane) => /\.(1|2)(?:\.|$)/.test(toText(lane?.sourceRefId)));
            if (byRef >= 0) return byRef;

            return 0;
        };

        const effectiveNtRefIds = await resolvePanelTripDetailBranchRefIds({
            refIds: ntRefIds,
            token,
            key: 'nt',
            resolveFirstMultiRefsAlongChain: (startRefId, _token, key) => resolvePanelTripDetailFirstMultiRefsAlongChain({
                startRefId,
                key,
                loadTripByRefId,
                isTokenCurrent: () => token === tripDetailToken,
                toText
            }),
            isTokenCurrent: () => token === tripDetailToken,
            toText
        });
        if (token !== tripDetailToken) return;

        const effectivePtRefIds = await resolvePanelTripDetailBranchRefIds({
            refIds: ptRefIds,
            token,
            key: 'pt',
            resolveFirstMultiRefsAlongChain: (startRefId, _token, key) => resolvePanelTripDetailFirstMultiRefsAlongChain({
                startRefId,
                key,
                loadTripByRefId,
                isTokenCurrent: () => token === tripDetailToken,
                toText
            }),
            isTokenCurrent: () => token === tripDetailToken,
            toText
        });
        if (token !== tripDetailToken) return;

        const buildBranchLaneRowsForTrip = (laneTrip) => normalizeTripStops(
            buildTripStops(laneTrip, stationsIndex, serviceDayStartMs),
            serviceDayStartMs,
            {
                allowEndpointAKeyFallback: endpointAKeyFallback,
                originIds,
                terminalIds,
                originAKeys,
                terminalAKeys,
                showOriginLabel,
                showTerminalLabel
            }
        );
        const collectBranchLanes = (refIds, kind) => collectPanelTripDetailBranchLanesFromRefs({
            refIds,
            kind,
            collectRefChainTripsFromRef: (refId, branchKind) => collectPanelTripDetailRefChainTripsFromRef({
                startRefId: refId,
                key: branchKind,
                loadTripByRefId,
                isTokenCurrent: () => token === tripDetailToken,
                toText
            }),
            isTokenCurrent: () => token === tripDetailToken,
            buildRowsForTrip: buildBranchLaneRowsForTrip,
            mergeStops,
            getTripLineId,
            buildLineDescriptor,
            buildRefLineDescriptor,
            getTripTypeName,
            getTripTypeColor,
            trainTypesIndex,
            trainTypeColorIndex,
            toText
        });

        const ntBranchLanes = await collectBranchLanes(effectiveNtRefIds, 'nt');
        if (token !== tripDetailToken) return;
        const ptBranchLanes = await collectBranchLanes(effectivePtRefIds, 'pt');
        if (token !== tripDetailToken) return;

        const {
            activeBranchLanes,
            branchCount,
            branchMode
        } = derivePanelTripDetailBranchRuntime({
            ntBranchLanes,
            ptBranchLanes
        });
        const throughCategory = detectThroughServiceCategoryFromTrips([
            ...(Array.isArray(ptChain) ? ptChain : []),
            trip,
            ...(Array.isArray(ntChain) ? ntChain : [])
        ]);

        const THROUGH_CATEGORY_COLOR = THROUGH_SERVICE_CONFIGS.reduce((acc, info) => {
            acc[info.category] = info.color;
            return acc;
        }, {});

        const currentSuInfo = THROUGH_SERVICE_CONFIGS.find(info => info.category === throughCategory);
        const throughCategoryLabel = currentSuInfo ? currentSuInfo.lineName : '';

        const throughCategoryColor = toText(THROUGH_CATEGORY_COLOR[throughCategory] || '');
        const useBranchGridLayout = branchCount >= 2 && !throughCategoryLabel;
        let rowsHtml = '';
        const {
            tripDetailTableClass,
            tripDetailTableInlineStyle,
            headerHtml,
            spacerHtml,
            totalCols,
            primaryTimeColStart,
            firstBranchMarkerCol
        } = buildPanelTripDetailLayoutShell({
            useBranchGridLayout,
            branchCount
        });

        if (!useBranchGridLayout) {
            const segmentBlocks = buildPanelTripDetailSegmentBlocks({
                segmentsWithPast,
                throughCategoryLabel,
                throughCategoryColor,
                currentLineDesc,
                buildLineDescriptor,
                isSameLineName,
                toText
            });
            rowsHtml += renderPanelTripDetailLinearRows({
                segmentBlocks,
                hideThroughSegmentsForLoop,
                renderPanelTripDetailLoopMarkerRow: ({ text }) => renderPanelTripDetailLoopMarkerRow({
                    text,
                    renderTimetablePlainNoteRowHtml,
                    toText
                }),
                getPanelTripDetailSegmentFirstRow,
                getPanelTripDetailSegmentLastRow,
                isPanelTripDetailBoundaryPast,
                renderPanelTripDetailNoteRow: ({ descriptor, typeName, typeColor, isPast }) => renderPanelTripDetailNoteRow({
                    descriptor,
                    typeName,
                    typeColor,
                    isPast,
                    renderTimetableNoteRowHtml,
                    toText
                }),
                renderStopRow
            });

        } else {
            const {
                mainDescriptor,
                mainRows,
                primaryLane,
                secondaryLanes
            } = preparePanelTripDetailBranchMainFlow({
                activeBranchLanes,
                buildLineDescriptor,
                currentLineDesc,
                fallbackLineId: lineId,
                pickPrimaryLaneIndex,
                segmentsWithPast,
                toText,
                tripLineId: getTripLineId(trip)
            });
            rowsHtml += renderPanelTripDetailBranchGridRows({
                branchMode,
                buildTimetableStationText,
                escapeHtml,
                firstBranchMarkerCol,
                mainDescriptor,
                mainRows,
                markRowsPastByCurrentStation,
                primaryLane,
                primaryTimeColStart,
                renderPanelTripDetailBranchBreakRow,
                renderPanelTripDetailGridLaneBlock,
                renderPanelTripDetailGridMarkerCell,
                renderPanelTripDetailStationCellHtml,
                renderTripDetailMomentHtml,
                resolveStationCode: (stationId) => toText(stationsIndex?.idToCode?.get?.(stationId) || ''),
                secondaryLanes,
                toText,
                totalCols,
                typeColor,
                typeName
            });
        }

        try {
            scheduleTripPreview(buildPanelTripPreviewScheduleArgs({
                trip,
                tripKey,
                lineId,
                typeName,
                typeColor,
                hasNt,
                fitMode,
                throughCategoryColor,
                throughCategoryLabel,
                segmentsWithPast,
                activeBranchLanes,
                branchMode,
                pinned,
                tripLocked,
                getTripLineId,
                getLineMeta,
                toText
            }));
        } catch {
            // ignore
        }

        tripDetailBody.innerHTML = `
            <div class="${tripDetailTableClass}"${tripDetailTableInlineStyle}>
                ${headerHtml}
                ${rowsHtml}
                ${spacerHtml}
            </div>
        `;

        tripDetailRoot.classList.remove('is-hidden');

        const panelW = tripDetailRoot.offsetWidth || 280;
        const panelH = tripDetailRoot.offsetHeight || 240;
        const pad = 12;
        const panelRect = root.getBoundingClientRect?.();
        const panelLeft = panelRect?.left ?? (window.innerWidth - panelW - pad);
        const x = Math.max(pad, Math.min(panelLeft - panelW - pad + 10, window.innerWidth - panelW - pad + 10));
        const y = Math.max(pad, Math.min((clientY || 0) - 20, window.innerHeight - panelH - pad));
        tripDetailRoot.style.left = `${x}px`;
        tripDetailRoot.style.top = `${y}px`;
        scheduleMarqueeApply(tripDetailRoot);
    };

    const hideTripDetail = () => {
        clearTripHighlightTimer();
        tripPreviewScheduler.clearApplied();
        unlockTripPreview();
        tripDetailToken += 1;
        clearTripDetailHideTimer();
        hideTripCurrentStationHint();
        clearTripDetailStationIndicator();
        tripDetailRoot.classList.add('is-hidden');
        try {
            onTripClear?.();
        } catch {
            // ignore
        }
    };

    const panelMarqueeController = createPanelMarqueeController({ maxAnimations: 30 });
    const scheduleMarqueeApply = panelMarqueeController.schedule;

    const renderAllTimetables = async () => {
        closeDirFilterPopover();
        const token = ++timetableRenderToken;
        const stationId = currentStationId;
        if (pendingGridDataDebugLog) gridDataDebugByLineId.clear();
        const lineEls = Array.from(body.querySelectorAll('[data-line-id]'));
        for (const el of lineEls) {
            await renderTimetableForLineEl(el, stationId, token);
        }

        if (pendingGridDataDebugLog) {
            const lines = Array.from(gridDataDebugByLineId.values()).sort((a, b) => String(a?.lineName || '').localeCompare(String(b?.lineName || '')));
            /*
            console.log('[班次视图][grid-data]', {
                stationId: toText(currentStationId),
                stationName: toText(currentStationNameZh),
                serviceDay: currentServiceDay,
                lines
            });
            */
            pendingGridDataDebugLog = false;
        }
    };

    const rerenderLineById = async (lineId) => {
        const lineEl = body.querySelector(`[data-line-id="${escapeHtml(String(lineId))}"]`);
        if (!lineEl) return;
        const token = ++timetableRenderToken;
        await renderTimetableForLineEl(lineEl, currentStationId, token);
    };

    const dirFilterPopoverController = createPanelDirFilterPopoverController({
        body,
        toText,
        escapeHtml,
        stopEvent,
        stopPropagationOnly,
        isLoopLine,
        makeLineDirKey,
        getRows: (lineDirKey) => dirFilterRowsByKey.get(lineDirKey) || [],
        getState: (lineDirKey) => dirFilterStateByKey.get(lineDirKey) || null,
        setState: (lineDirKey, state) => dirFilterStateByKey.set(lineDirKey, state),
        rerenderLineById,
        applyDirPreviewByKey,
        clearPinnedDirPreview
    });

    const closeDirFilterPopover = (options = {}) => dirFilterPopoverController.close(options);
    const toggleDirFilterPopoverFromButton = (btnEl) => dirFilterPopoverController.toggleFromButton(btnEl);

    startAutoNowClock();
    applyTimetableViewMode(getTimetableViewMode ? getTimetableViewMode() : 'list', { rerender: false });

    const panelHoverRestoreRuntime = createPanelHoverRestoreRuntime({
        setTimeoutFn: setTimeout,
        clearTimeoutFn: clearTimeout,
        restoreDelayMs,
        getLastAppliedHoverKey: () => lastAppliedHoverKey,
        setLastAppliedHoverKey: (value) => {
            lastAppliedHoverKey = value;
        },
        onRestoreStationLines,
        getCurrentStationServingIds: () => currentStationServingIds,
        getCurrentStationId: () => currentStationId,
        toText
    });
    const clearHoverTimer = () => panelHoverRestoreRuntime.clearHoverTimer();
    const clearRestoreTimer = () => panelHoverRestoreRuntime.clearRestoreTimer();
    const restoreStationLinesIfNeeded = () => panelHoverRestoreRuntime.restoreStationLinesIfNeeded();
    const scheduleRestoreStationLines = () => panelHoverRestoreRuntime.scheduleRestoreStationLines();

    const getCompanyTarget = (target) => {
        return resolvePanelCompanyTarget(target, { body, toText });
    };

    const getLineTarget = (target) => {
        return resolvePanelLineTarget(target, { body, toText });
    };

    const getDirTitleTarget = (target) => {
        return resolvePanelDirTitleTarget(target, { body, toText });
    };

    const getDirTriangleTarget = (target) => {
        return resolvePanelDirTriangleTarget(target, { body, toText });
    };

    const getDirFilterButtonTarget = (target) => {
        return resolvePanelDirFilterButtonTarget(target, { body, toText });
    };

    const getDirPrintButtonTarget = (target) => {
        return resolvePanelDirPrintButtonTarget(target, { body, toText });
    };

    const panelPrintRequests = createPanelPrintRequestController({
        body,
        dirPrintPayloadByKey,
        makeLineDirKey,
        printAllEventName: TIMETABLE_PRINT_ALL_EVENT,
        toText,
        getStationName: () => toText(currentStationNameZh) || toText(titleMain.textContent),
        getServiceDay: () => currentServiceDay,
        getTimetableViewMode: () => timetableViewMode,
        dispatchEvent: (event) => window.dispatchEvent(event),
        createCustomEvent: (name, init) => new CustomEvent(name, init)
    });

    const requestPrintTimetable = (lineId, dirKey) => {
        panelIntents.requestDirectionPrint(panelPrintRequests, lineId, dirKey);
    };

    dayPrintBtn.addEventListener('click', (evt) => {
        stopEvent(evt);
        panelIntents.requestAllPrint(panelPrintRequests);
    }, { passive: false });

    viewToggle.addEventListener('click', (evt) => {
        stopEvent(evt);
        const btn = evt?.target?.closest?.('[data-panel-view-mode]');
        if (!btn || !viewToggle.contains(btn)) return;
        setTimetableViewModeFromPanel(btn.getAttribute('data-panel-view-mode'));
    }, { passive: false });

    const resolveMousePrimaryTarget = (target) => resolvePanelMousePrimaryTarget(target, {
        getDirTitleTarget,
        getLineTarget,
        getCompanyTarget,
        makeLineDirKey
    });

    const applyLineHoverSelection = (lineId) => {
        const id = toText(lineId);
        if (!id || !onSelectLine) return;
        onSelectLine(id, { source: 'panel-hover' });
        lastAppliedHoverKey = `line:${id}`;
    };

    const applyCompanyHoverSelection = (companyName) => {
        const name = toText(companyName);
        if (!name || !onSelectCompany) return;
        onSelectCompany(name, {
            source: 'panel-hover',
            stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
        });
        lastAppliedHoverKey = `company:${name}`;
    };

    const armCancelInteractionSuppression = () => {
        touchInteraction.armCancelInteractionSuppression();
        // 取消固定后 1s 内不响应 hover，避免鼠标仍在面板上立即重新触发预览
    };

    const expandDirectionTimetable = (lineId, dirKey) => {
        const lid = toText(lineId);
        const dkey = toText(dirKey);
        if (!lid || !dkey) return;
        if (isDirExpanded(lid, dkey)) return;
        setDirExpanded(lid, dkey, true);
        const lineEl = body.querySelector(`[data-line-id="${escapeHtml(String(lid))}"]`);
        const token = ++timetableRenderToken;
        renderTimetableForLineEl(lineEl, currentStationId, token);
    };

    const toggleDirectionTimetable = (lineId, dirKey) => {
        const lid = toText(lineId);
        const dkey = toText(dirKey);
        if (!lid || !dkey) return;
        const nextExpanded = !isDirExpanded(lid, dkey);
        setDirExpanded(lid, dkey, nextExpanded);
        const lineEl = body.querySelector(`[data-line-id="${escapeHtml(String(lid))}"]`);
        const token = ++timetableRenderToken;
        renderTimetableForLineEl(lineEl, currentStationId, token);
    };

    const onBodyPointerDown = (evt) => {
        const pointerState = touchInteraction.beginPointer(evt);
        const pt = pointerState.pointerType;

        if (evt?.target instanceof Element && body.contains(evt.target) && hasPinnedPanelState()) {
            const pinnedKey = getCurrentPinnedInteractionKey();
            const hitKey = getInteractionKeyFromTarget(evt.target);
            stopEvent(evt);
            if (pinnedKey && hitKey && pinnedKey === hitKey) return;
            clearPinnedPanelState({ restoreStation: true });
            armCancelInteractionSuppression();
            return;
        }

        if (tripLocked) {
            const t = evt?.target;
            const rowEl = findTripTarget(t);
            const lineEl = rowEl?.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const tripKey = rowEl?.getAttribute?.('data-trip-key');
            const rowKey = lineId && tripKey ? `${String(lineId)}||${String(tripKey)}` : null;
                if (rowKey && rowKey === lockedTripKey) {
                clearTripDetailHideTimer();
            } else if (!(t && tripDetailRoot.contains(t))) {
                hideTripDetail();
                lastTripDetailKey = null;
                // 点到其他位置即取消固定；本次触摸不继续触发其他车次预览
                if (rowKey && rowKey !== lockedTripKey) {
                    stopPropagationOnly(evt);
                    return;
                }
            }
        }

        if (!pointerState.isTouchLike) return;

        const filterTarget = getDirFilterButtonTarget(evt?.target);
        if (filterTarget) {
            stopEvent(evt);
            dispatchPanelDirFilterIntent({
                filterTarget,
                fitMode: 'commit',
                makeLineDirKey,
                applyDirPreviewByKey,
                pinDirPreviewByKey,
                setPinnedPanelSelection,
                toggleDirFilterPopoverFromButton
            });
            return;
        }

        const rowEl = findTripTarget(evt?.target);
        if (rowEl && body.contains(rowEl)) {
            clearTripHighlightTimer();
            const lineEl = rowEl.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const tripKey = rowEl.getAttribute?.('data-trip-key');
            if (lineId && tripKey) {
                stopPropagationOnly(evt);
                touchInteraction.startTripTap(evt, {
                    lineId: String(lineId),
                    tripKey: String(tripKey)
                });
                return;
            }
        }

        const dirTriangle = getDirTriangleTarget(evt?.target);
        if (dirTriangle) {
            stopEvent(evt);
            dispatchPanelDirectionToggleIntent({
                dirTarget: dirTriangle,
                toggleDirectionTimetable
            });
            return;
        }

        const dirTitle = getDirTitleTarget(evt?.target);
        if (dirTitle) {
            stopEvent(evt);
            dispatchPanelDirectionToggleIntent({
                dirTarget: dirTitle,
                toggleDirectionTimetable
            });
            return;
        }

        const touchPrimaryTarget = resolveMousePrimaryTarget(evt?.target);
        if (touchPrimaryTarget && (touchPrimaryTarget.kind === 'line' || touchPrimaryTarget.kind === 'company')) {
            stopEvent(evt);
            const touchPrimaryResult = dispatchPanelPrimarySelectionIntent({
                primaryTarget: touchPrimaryTarget,
                mode: 'touch',
                clearHoverTimer,
                resetHoverState: () => {
                    hoverCandidateKey = null;
                    lastFiredHoverKey = null;
                    lastAppliedHoverKey = null;
                },
                clearPinnedDirPreview,
                setPinnedPanelSelection,
                onSelectLine,
                onSelectCompany,
                currentStationServingIds
            });
            if (touchPrimaryResult.handled) return;
        }

        if (!evt?.target || !(evt.target instanceof Element) || !body.contains(evt.target)) {
            // 触屏在非交互区域（例如时间表滚动区）按下：允许默认滚动，但不要把事件传到地图
            stopPropagationOnly(evt);
            return;
        }

        stopPropagationOnly(evt);
    };

    const onBodyPointerMoveTouchTap = (evt) => {
        touchInteraction.moveTripTap(evt);
    };

    const onBodyPointerCancelTouchTap = () => {
        touchInteraction.cancelTripTap();
    };

    const onBodyPointerUpTouchTap = (evt) => {
        const completed = touchInteraction.finishTripTap(evt);
        if (!completed.handled || completed.moved) return;
        const pending = completed.tap;

        stopPropagationOnly(evt);

        const key = `${pending.lineId}||${pending.tripKey}`;
        if (tripLocked && key !== lockedTripKey) {
            hideTripDetail();
            lastTripDetailKey = null;
            return;
        }

        lockTripPreview(key);
        setPinnedPanelSelection('trip', key);
        renderTripDetail({
            lineId: pending.lineId,
            tripKey: pending.tripKey,
            clientX: completed.clientX,
            clientY: completed.clientY,
            pinned: true,
            fitMode: 'commit'
        });
        lastTripDetailKey = key;
    };

    const onBodyMove = (evt) => {
        if (touchInteraction.shouldSuppressMouseHover()) {
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            return;
        }
        if (isMultiSelectModeEnabled()) {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            if (!panelSelectionState.getPinnedDirPreviewKey()) clearDirPreview();
            return;
        }
        if (hasPinnedPanelState()) {
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            return;
        }
        if (tripLocked) return;
        if (touchInteraction.isLastPointerTouchLike()) return;
        if (!isHoverPreviewEnabled()) {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            if (!panelSelectionState.getPinnedDirPreviewKey()) clearDirPreview();
            return;
        }

        const target = resolveMousePrimaryTarget(evt?.target);
        if (!target) {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            lastMousePrimaryKey = '';
            if (!(evt?.relatedTarget && dirFilterPopoverController.contains(evt.relatedTarget)) && !panelSelectionState.getPinnedDirPreviewKey()) {
                clearDirPreview();
            }
            return;
        }

        clearRestoreTimer();

        const key = target.key;
        if (key === hoverCandidateKey) return;

        clearHoverTimer();
        hoverCandidateKey = key;

        if (key === lastFiredHoverKey) return;

        panelHoverRestoreRuntime.scheduleHoverTimer(() => {
            if (hoverCandidateKey !== key) return;
            lastFiredHoverKey = key;

            if (target.kind === 'dir' && !target.key.includes('Loop')) {
                applyDirPreviewByKey(target.lineDirKey, { fitMode: 'preview' });
                lastMousePrimaryKey = key;
            } else if (target.kind === 'line' || target.key.includes('Loop')) {
                applyLineHoverSelection(target.lineId);
                lastMousePrimaryKey = key;
            } else if (target.kind === 'company') {
                applyCompanyHoverSelection(target.companyName);
                lastMousePrimaryKey = key;
            }
        }, primaryHoverDelayMs);
    };

    const onBodyClick = (evt) => {
        // 触屏：由 pointerdown 接管两段式逻辑
        if (touchInteraction.isLastPointerTouchLike() || touchInteraction.shouldSuppressMouseEvents()) {
            stopEvent(evt);
            return;
        }

        const earlyPrintTarget = getDirPrintButtonTarget(evt?.target);
        if (earlyPrintTarget) {
            stopEvent(evt);
            requestPrintTimetable(earlyPrintTarget.lineId, earlyPrintTarget.dirKey);
            return;
        }

        if (touchInteraction.shouldSuppressMouseClick()) {
            stopEvent(evt);
            return;
        }

        if (evt?.target instanceof Element && body.contains(evt.target) && hasPinnedPanelState()) {
            const pinnedKey = getCurrentPinnedInteractionKey();
            const hitKey = getInteractionKeyFromTarget(evt.target);
            stopEvent(evt);
            if (pinnedKey && hitKey && pinnedKey === hitKey) return;
            clearPinnedPanelState({ restoreStation: true });
            armCancelInteractionSuppression();
            return;
        }

        const rowEl = findTripTarget(evt?.target);
        if (rowEl && body.contains(rowEl)) {
            clearTripHighlightTimer();
            const lineEl = rowEl.closest?.('[data-line-id]');
            const lineId = rowEl.getAttribute?.('data-line-id') || lineEl?.getAttribute?.('data-line-id');
            const tripKey = rowEl.getAttribute?.('data-trip-key');
            if (lineId && tripKey) {
                const key = `${String(lineId)}||${String(tripKey)}`;
                stopEvent(evt);
                if (tripLocked && key !== lockedTripKey) {
                    hideTripDetail();
                    lastTripDetailKey = null;
                    return;
                }

                lockTripPreview(key);
                setPinnedPanelSelection('trip', key);
                const fitMode = tripPreviewScheduler.isAppliedKey(key) ? 'none' : 'commit';
                renderTripDetail({
                    lineId: String(lineId),
                    tripKey: String(tripKey),
                    clientX: evt?.clientX || 0,
                    clientY: evt?.clientY || 0,
                    pinned: true,
                    fitMode
                });
                lastTripDetailKey = key;
                return;
            }
        }

        if (tripLocked) {
            const t = evt?.target;
            if (!(t && tripDetailRoot.contains(t))) {
                hideTripDetail();
                lastTripDetailKey = null;
            }
        }

        const filterTarget = getDirFilterButtonTarget(evt?.target);
        if (filterTarget) {
            stopEvent(evt);
            dispatchPanelDirFilterIntent({
                filterTarget,
                fitMode: 'preview',
                makeLineDirKey,
                applyDirPreviewByKey,
                pinDirPreviewByKey,
                setPinnedPanelSelection,
                toggleDirFilterPopoverFromButton
            });
            return;
        }

        const dirTriangle = getDirTriangleTarget(evt?.target);
        if (dirTriangle) {
            stopEvent(evt);
            dispatchPanelDirectionToggleIntent({
                dirTarget: dirTriangle,
                toggleDirectionTimetable
            });
            return;
        }

        const dirTitle = getDirTitleTarget(evt?.target);
        if (dirTitle) {
            stopEvent(evt);
            dispatchPanelDirectionToggleIntent({
                dirTarget: dirTitle,
                toggleDirectionTimetable
            });
            return;
        }

        const primaryTarget = resolveMousePrimaryTarget(evt?.target);
        if (!primaryTarget || (primaryTarget.kind !== 'line' && primaryTarget.kind !== 'company')) return;

        stopEvent(evt);
        const primaryResult = dispatchPanelPrimarySelectionIntent({
            primaryTarget,
            mode: 'mouse',
            lastMousePrimaryKey,
            clearHoverTimer,
            resetHoverState: () => {
                hoverCandidateKey = null;
                lastFiredHoverKey = null;
            },
            clearPinnedDirPreview,
            setPinnedPanelSelection,
            applyLineHoverSelection,
            applyCompanyHoverSelection
        });
        lastMousePrimaryKey = primaryResult.lastMousePrimaryKey;
    };

    const onBodyLeave = (evt) => {
        clearTripHighlightTimer();
        clearHoverTimer();
        clearRestoreTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        lastMousePrimaryKey = '';
        const toEl = evt?.relatedTarget;
        if (routeMapPopoverHoverActive || (toEl instanceof Element && toEl.closest?.('[data-route-map]'))) {
            return;
        }
        if (hasPinnedPanelState()) return;
        restoreStationLinesIfNeeded();
        if (tripLocked) return;
        if (toEl && tripDetailRoot.contains(toEl)) return;
        if (!(toEl && dirFilterPopoverController.contains(toEl)) && !panelSelectionState.getPinnedDirPreviewKey()) {
            clearDirPreview();
        }
        if (!tripDetailPinned) scheduleTripDetailHide();
    };

    const onBodyTripMouseOver = (evt) => {
        if (!isHoverPreviewEnabled()) return;
        if (touchInteraction.isLastPointerTouchLike()) return;
        const rowEl = findTripTarget(evt?.target);
        if (!rowEl || !body.contains(rowEl)) return;
        // 有固定态时：仅当 dir-filter 固定 且 row 属于同一方向 才允许 hover 打断
        if (hasPinnedPanelState()) {
            if (!isDirFilterPinned() || !isTripRowInPinnedDir(rowEl)) return;
        }
        const lineEl = rowEl.closest?.('[data-line-id]');
        const lineId = lineEl?.getAttribute?.('data-line-id');
        const tripKey = rowEl.getAttribute?.('data-trip-key');
        if (!lineId || !tripKey) return;
        const key = `${lineId}||${tripKey}`;
        if (tripLocked && key !== lockedTripKey) return;
        if (key === lastTripDetailKey && !tripDetailPinned) {
            const pendingSame = tripPreviewScheduler.isPendingKey(key);
            const appliedSame = tripPreviewScheduler.isAppliedKey(key);
            if (pendingSame || appliedSame) return;
        }

        // 若 dir-filter 固定态被同方向 row hover 打断，清除方向高亮
        if (isDirFilterPinned()) {
            clearDirPreview();
        }

        clearTripDetailHideTimer();
        clearTripHighlightTimer();
        renderTripDetail({
            lineId: String(lineId),
            tripKey: String(tripKey),
            clientX: evt?.clientX || 0,
            clientY: evt?.clientY || 0,
            pinned: false,
            fitMode: 'preview'
        });
        lastTripDetailKey = key;
    };

    const onBodyTripMouseOut = (evt) => {
        if (!isHoverPreviewEnabled()) return;
        clearTripHighlightTimer();
        if (tripLocked) return;
        if (tripDetailPinned) return;
        const rowEl = findTripTarget(evt?.target);
        if (!rowEl || !body.contains(rowEl)) return;
        if (hasPinnedPanelState()) {
            if (!isDirFilterPinned() || !isTripRowInPinnedDir(rowEl)) return;
        }
        const toEl = evt?.relatedTarget;
        if (toEl && (rowEl.contains(toEl) || tripDetailRoot.contains(toEl))) return;
        // dir-filter 固定态下 row mouseout：恢复方向高亮并隐藏 trip detail
        if (isDirFilterPinned()) {
            applyDirPreviewByKey(panelSelectionState.getPinnedDirPreviewKey(), { force: true });
        }
        scheduleTripDetailHide();
    };

    panelIntents.bindRouteMapPopoverHover(window, {
        onEnter: () => {
            routeMapPopoverHoverActive = true;
            clearRestoreTimer();
        },
        onLeave: () => {
            routeMapPopoverHoverActive = false;
            if (hasPinnedPanelState()) return;
            restoreStationLinesIfNeeded();
            if (!panelSelectionState.getPinnedDirPreviewKey()) {
                clearDirPreview();
            }
        }
    });

    const getTripDetailStationTarget = (target) => resolveTripDetailStationTarget(target, { rootEl: tripDetailBody });

    const onTripDetailMouseOver = (evt) => {
        if (touchInteraction.isLastPointerTouchLike()) return;
        const stationEl = getTripDetailStationTarget(evt?.target);
        if (!stationEl) return;
        const sid = toText(stationEl.getAttribute('data-station-id'));
        if (!sid) return;
        showTripDetailStationIndicator(sid);
    };

    const onTripDetailMouseOut = (evt) => {
        if (touchInteraction.isLastPointerTouchLike()) return;
        const fromEl = getTripDetailStationTarget(evt?.target);
        if (!fromEl) return;
        const toEl = evt?.relatedTarget;
        const toStation = getTripDetailStationTarget(toEl);
        if (toStation) return;
        clearTripDetailStationIndicator();
    };

    const onTripDetailMouseLeave = () => {
        clearTripDetailStationIndicator();
    };

    const onTripDetailPointerDown = (evt) => {
        const pt = touchInteraction.markPointer(evt);
        if (!isTouchLikePointer(pt)) return;
        const stationEl = getTripDetailStationTarget(evt?.target);
        if (!stationEl) return;
        const sid = toText(stationEl.getAttribute('data-station-id'));
        if (!sid) return;
        showTripDetailStationIndicator(sid);
    };

    const panelEventDelegation = createPanelEventDelegationCoordinator({
        body,
        bodyHandlers: {
            click: onBodyClick,
            mouseleave: onBodyLeave,
            mousemove: onBodyMove,
            mouseout: onBodyTripMouseOut,
            mouseover: onBodyTripMouseOver,
            pointercancel: onBodyPointerCancelTouchTap,
            pointerdown: onBodyPointerDown,
            pointermove: onBodyPointerMoveTouchTap,
            pointerup: onBodyPointerUpTouchTap
        },
        tripDetailBody,
        tripDetailHandlers: {
            mouseleave: onTripDetailMouseLeave,
            mouseout: onTripDetailMouseOut,
            mouseover: onTripDetailMouseOver,
            pointerdown: onTripDetailPointerDown
        }
    });

    document.addEventListener('click', (evt) => {
        const target = evt?.target;
        const clickRegion = panelShell.getClickRegion(target, {
            ignoredElements: [settingsContentEl, timeOverlay],
            ignoredSelectors: ['.settings-content', '.settings-ui'],
            insidePredicates: [(node) => dirFilterPopoverController.contains(node)]
        });

        // 点击设置区域不应触发“取消固定”或关闭详情
        if (target instanceof Element && clickRegion.ignored) return;

        if (panelSelectionState.getPinnedDirPreviewKey()) {
            if (!clickRegion.insidePanelOrExtra) {
                clearPinnedDirPreview();
            }
        }

        if (hasPinnedPanelState()) {
            if (!clickRegion.insidePanelOrExtra) {
                clearPinnedPanelState({ restoreStation: true });
                return;
            }
        }

        if (!tripDetailPinned && !tripLocked) return;
        if (target && tripDetailRoot.contains(target)) return;
        if (clickRegion.insidePanel) {
            const rowEl = findTripTarget(target);
            const lineEl = rowEl?.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const tripKey = rowEl?.getAttribute?.('data-trip-key');
            const key = lineId && tripKey ? `${String(lineId)}||${String(tripKey)}` : null;
            if (tripLocked && key && key === lockedTripKey) return;
            // panel 内除“已锁定同一车次”外，其他位置都取消固定
            hideTripDetail();
            lastTripDetailKey = null;
            return;
        }
        hideTripDetail();
        lastTripDetailKey = null;
    });

    // 布局：高度与 menu 一致（80% 屏高），top 为 10% 屏高
    const layout = () => {
        panelShell.layout();

        // 时间控件浮层：置于右上功能区同一行，位于 ms-fab 左侧
        timeOverlay.style.top = '10px';
        timeOverlay.style.right = '194px';

        // 保持可配置：允许通过 CSS 调整圆角
        try {
            const br = window.getComputedStyle(panel).borderRadius;
            if (br) {
                panel.style.borderRadius = br;
            }
        } catch {
            // ignore
        }

        scheduleCatalogRefresh();
    };

    layout();
    window.addEventListener('resize', layout);

    const show = () => {
        layout();
        panelShell.show();
        scheduleCatalogRefresh();
    };

    const hide = () => {
        timePickerController.close();
        closeDirFilterPopover();
        clearPinnedPanelState({ restoreStation: false });
        hideTripDetail();
        dirPrintPayloadByKey.clear();
        dirFilterStateByKey.clear();
        ({
            temporaryLineMetaById: temporaryPanelLineMetaById,
            temporarySourceLineIdsByDisplayLineId: temporaryPanelSourceLineIdsByDisplayLineId,
            temporaryAllowedTripKeysByDisplayLineId: temporaryPanelAllowedTripKeysByDisplayLineId
        } = createEmptyPanelThroughServiceState());
        panelShell.hide();
        scheduleCatalogRefresh();
    };

    const setTitle = (text, subtitle = '') => {
        const mainText = typeof text === 'object' && text !== null ? toText(text.main || text.text || text.name || '') : toText(text);
        const subText = typeof text === 'object' && text !== null ? toText(text.sub || text.subtitle || '') : toText(subtitle);
        titleMain.textContent = mainText;
        titleSub.textContent = subText;
        titleSub.hidden = !subText;
        try {
            adjustPanelTitleFit(titleMain);
        } catch {
            // ignore
        }
    };

    const adjustPanelTitleFit = (el) => {
        if (!el || !(el instanceof Element)) return;
        // Reset to single-line nowrap to test fitting
        el.classList.remove('is-multiline');
        el.style.whiteSpace = 'pre-wrap';
        // Start from configured 30px down to 20px
        const maxFs = 30;
        const minFs = 20;
        let fitted = false;
        for (let fs = maxFs; fs >= minFs; fs -= 1) {
            el.style.fontSize = `${fs}px`;
            // Force layout
            const fits = (el.scrollWidth || 0) <= (el.clientWidth || 0) + 1;
            if (fits) {
                fitted = true;
                break;
            }
        }

        if (!fitted) {
            // Set min font size and allow two lines with clamp
            el.style.fontSize = `${minFs}px`;
            el.style.whiteSpace = 'normal';
            el.classList.add('is-multiline');
        }
    };

    const showForStationProps = async (props) => {
        const renderToken = ++stationRenderToken;
        const name = readStationName(props);
        panelCatalogController?.resetTransientUiState();

        currentStationId = toText(props?.id);
        currentStationNameZh = toText(props?.name_zh || props?.['name:zh'] || name);
        const stationIndex = await getStationsIndex();
        currentStationsIndex = stationIndex;
        const currentStationNameEn = toText(stationIndex?.idToNameEn?.get?.(currentStationId) || props?.title?.en || props?.title?.['en-US'] || '');
        setTitle({ main: name, sub: currentStationNameEn });

        // 用 serving_ids 驱动交互恢复/公司过滤
        ({
            pendingGridDataDebugLog,
            expandedDirKeys,
            lastAppliedHoverKey,
            lastMousePrimaryKey,
            lastTripDetailKey
        } = resetPanelStationRenderTransientState({
            dirPrintPayloadByKey,
            dirFilterStateByKey,
            clearHoverTimer,
            clearRestoreTimer,
            clearTripHighlightTimer,
            hideTripDetail,
            closeDirFilterPopover,
            clearPinnedPanelState
        }));

        const stationRenderBootstrap = preparePanelStationRenderBootstrap({
            props,
            normalizeArrayLike,
            buildPanelLineMergeInfo,
            getLineMeta,
            createEmptyPanelThroughServiceState,
            toText
        });
        currentStationServingIds = stationRenderBootstrap.currentStationServingIds;
        const mergeInfo = stationRenderBootstrap.mergeInfo;

        ({
            temporaryLineMetaById: temporaryPanelLineMetaById,
            temporarySourceLineIdsByDisplayLineId: temporaryPanelSourceLineIdsByDisplayLineId,
            temporaryAllowedTripKeysByDisplayLineId: temporaryPanelAllowedTripKeysByDisplayLineId
        } = stationRenderBootstrap.throughServiceState);

        let displayServingIds = stationRenderBootstrap.displayServingIds;

        const throughPlan = await buildTemporaryThroughServicePanelPlan({
            stationId: currentStationId,
            servingLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : [],
            currentServiceDay,
            loadTimetableForLineId,
            resolveStationIdForLine,
            loadTripByRefId,
            parseTripServiceDayFromId,
            isStillCurrentStation: () => (
                renderToken === stationRenderToken &&
                toText(currentStationId) === toText(props?.id)
            )
        });
        if (renderToken !== stationRenderToken) return;
        ({
            temporaryLineMetaById: temporaryPanelLineMetaById,
            temporarySourceLineIdsByDisplayLineId: temporaryPanelSourceLineIdsByDisplayLineId,
            temporaryAllowedTripKeysByDisplayLineId: temporaryPanelAllowedTripKeysByDisplayLineId,
            displayServingIds
        } = resolvePanelThroughServiceSetup({
            throughPlan,
            displayServingIds
        }));
        /* if (throughPlan) {
                    // 1. 初始化 Map
                    temporaryPanelLineMetaById = throughPlan.temporaryLineMetaById instanceof Map 
                        ? throughPlan.temporaryLineMetaById : new Map();
                    temporaryPanelSourceLineIdsByDisplayLineId = throughPlan.temporarySourceLineIdsByDisplayLineId instanceof Map 
                        ? throughPlan.temporarySourceLineIdsByDisplayLineId : new Map();
                    temporaryPanelAllowedTripKeysByDisplayLineId = throughPlan.temporaryAllowedTripKeysByDisplayLineId instanceof Map 
                        ? throughPlan.temporaryAllowedTripKeysByDisplayLineId : new Map();

                    if (Array.isArray(throughPlan.displayServingIds)) {
                        displayServingIds = throughPlan.displayServingIds;
                    }
                } */

        const stationRenderInputs = await buildPanelStationRenderInputs({
            stationId: currentStationId,
            stationNameZh: currentStationNameZh,
            displayServingIds,
            getLineMeta,
            temporarySourceLineIdsByDisplayLineId: temporaryPanelSourceLineIdsByDisplayLineId,
            buildPanelLineMergeInfo,
            applyTemporarySourceLineOverrides,
            buildTransferLineStationNameMap
        });
        displayServingIds = stationRenderInputs.displayServingIds;
        currentLineGroupByMainId = stationRenderInputs.lineGroupByMainId;
        const lineStationNameByLineId = stationRenderInputs.lineStationNameByLineId;
        currentLineStationMetaByLineId = lineStationNameByLineId;
        if (renderToken !== stationRenderToken) return;

        // 渲染 popup 同结构的内容（公司分组 + 线路）
        body.innerHTML = buildPanelCompaniesHtml({ ...(props || {}), display_serving_ids: displayServingIds }, { getLineMeta, companyLogoMap, lineStationNameByLineId, railwaysOrderIndex, toText });
        await enhancePanelLineHeaderIcons(body);
        scheduleCatalogRefresh();

        show();

        // 默认折叠态：填充每条线路的“未来最近 3 条”班次
        // 这里等待渲染完成，避免外部随后执行的 scrollToLineId 被后续异步渲染“拉回顶部”。
        await renderAllTimetables();
        scheduleCatalogRefresh();
        panelScrollRuntime.syncPanelTitleForActiveLine();
    };

    const setHoverPreviewEnabled = (enabled) => {
        const next = enabled !== false;
        if (hoverPreviewEnabled === next) return;
        hoverPreviewEnabled = next;
        if (hoverPreviewEnabled) return;

        clearHoverTimer();
        clearRestoreTimer();
        clearTripHighlightTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        lastMousePrimaryKey = '';
        restoreStationLinesIfNeeded();
        clearPinnedPanelState({ restoreStation: false });
        hideTripCurrentStationHint();
        clearTripDetailStationIndicator();
        if (!tripLocked) {
            hideTripDetail();
            lastTripDetailKey = null;
        }
    };

    return {
        el: root,
        show,
        hide,
        setTitle,
        setHoverPreviewEnabled,
        setTimetableViewMode: (mode) => applyTimetableViewMode(mode, { rerender: true }),
        showForStationProps,
        scrollToLineId: (...args) => panelScrollRuntime.scrollToLineId(...args),
        getScrollTop: (...args) => panelScrollRuntime.getScrollTop(...args),
        setScrollTop: (...args) => panelScrollRuntime.setScrollTop(...args),
        layout,
        destroy: () => {
            panelCatalogController?.destroy();
            panelEventDelegation.destroy();
        }
    };
}
