/**
 * 右侧弹出界面：点击站点/站名时展示站名标题。
 * 约束：不引入新配色/主题；panel 样式使用 panel-* 前缀与 search/popup/menu 隔离。
 */

import {
    filterPreferredLocalStopTypeNames,
    isLocalStopTypeName,
    TYPE_BASE_SEQUENCE,
    sortTypeNamesByBaseAndStopCount
} from '../../lib/train-type-sort.js';
import { createTripPreviewScheduler } from '../../lib/trip-preview.js';
import {
    getCachedJson,
    getCompanyLogoSrc,
    getIconCandidates,
    getPreferredCachedImageSrc,
    setImageElementFromCache
} from '../../lib/fetch.js';
import { previewBranchesForLineRequests } from '../../map/analyze_branch.js';
import {
    buildTemporaryThroughServicePanelPlan,
    detectThroughServiceCategoryFromTrips,
    THROUGH_SERVICE_CONFIGS,
    THROUGH_SERVICE_CONFIGS_OBJECT,
} from '../../lib/throughServiceManager.js';
import { createPanelMainView } from '../../ui/panelMainView.js';
import { createPanelShell } from '../../ui/panelShellView.js';
import { createPanelRouteMapBridge } from './panelRouteMapBridge.js';
import { buildTimetableStationText, renderTimetableNoteRowHtml, renderTimetablePlainNoteRowHtml } from './panelTimetableCore.js';
import { buildDirectionEndpointLabelCounts } from '../../domain/stationLabelDisplay.js';
import { resolvePanelStationInfoTypePlacement } from '../../domain/panelStationInfoTypePlacement.js';
import {
    renderPanelPrintableTimetableListHtml,
    renderPanelTimetableListHtml
} from './panelTimetableCore.js';
import { buildPanelTimetableGridHintsHtml } from './panelTimetableUi.js';
import { createPanelSelectionStateController } from './panelInteractionCore.js';
import {
    createEmptyDirFilterState,
    filterRowsByDirFilterState,
    hasDirFilterRowValue,
    toDirFilterRow
} from './panelInteractionView.js';
import { createPanelDirFilterPopoverController } from './panelInteractionView.js';
import {
    createPanelTimePickerController,
    normalizeTimePickerHHMM
} from './panelTimetableUi.js';
import { createPanelMapSelectController } from './panelInteractionCore.js';
import { createPanelMarqueeController } from './panelInteractionView.js';
import {
    collectLinePrintPayloads,
    createPanelPrintRequestController
} from './panelExport.js';
import { createPanelIntentController } from './panelInteractionCore.js';
import { createPanelCrossFeatureBridgeController } from './panelInteractionCore.js';
import { createPanelRoutePreviewController } from './panelInteractionCore.js';
import { renderPanelTripDetailStationCellHtml, renderPanelTripDetailStopRowHtml } from './panelTripDetailRender.js';
import {
    applyTripDetailPastState,
    buildTripDetailEndpointContext,
    getTripDetailStationAKey,
    markRowsPastByStation,
    matchesTripDetailEndpointStop,
    mergeTripDetailSegmentsAtBoundaries
} from './panelTripDetailRender.js';
import {
    buildTimetablePrintPayload,
    deriveDirectionStats,
    mergeDuplicateTimetableRows,
    normalizeTimetableAllowedTripKeys,
    normalizeTimetableSourceLineIds
} from './panelTimetableCore.js';
import { buildAlternateTripSourceIndex, getAlternateTripSources } from '../../domain/alternateLineMembership.js';
import { hasTripNmMarker } from '../../domain/timetableTripMarkers.js';
import {
    formatBusinessDateInputValue,
    formatBusinessDateLabel,
    getBusinessDateParts,
    getDisplayServiceDayStartMs,
    getServiceDayStartMs,
    inferServiceDayFromDate,
    parseDisplayHHMMToMs,
    parseHHMMToServiceDayMs,
    readBusinessTimezoneMode,
    SERVICE_DAY_BOUNDARY_HOUR,
    toHHMMForTimezone
} from '../../domain/routePlanning/time.js';
import { toPanelServiceHourIndex } from './panelTimetableCore.js';
import { postprocessPanelTimetableTrips } from './panelTimetablePostprocess.js';
import { buildPanelTimetableGridHtmlForDirection } from './panelTimetableUi.js';
import {
    buildPanelCompaniesHtml,
    collectPanelCatalogEntries,
    renderPanelCatalogEntriesHtml
} from './panelCatalogShell.js';
import { enhancePanelLineHeaderIcons } from './panelInteractionView.js';
import { exportElementToPng } from './panelExport.js';
import { installPanelTimetablePrintPayloadBuilder } from './panelExport.js';
import { createPanelScrollRuntime } from './panelInteractionView.js';
import { hydrateRenderedTimetable } from './panelTimetableUi.js';
import { buildPanelTripPreviewScheduleArgs } from './panelTripDetailRuntime.js';
import {
    buildTransferLineStationNameMap,
    getStationGroupsIndex,
    getStationsIndex,
    getTrainTypeColorIndex,
    getTrainTypesIndex,
    readStationName,
    createPanelStationRestoreContext
} from './panelStation.js';
import { resolvePanelStationIdForLine } from './panelStation.js';
import {
    panelIsDarkThemeActive,
    resolvePanelBadgeTextColor,
    resolveTrainTypeColorForTheme
} from './panelCatalogShell.js';
import {
    createPanelDismissController,
    createPanelEventDelegationCoordinator,
    createPanelInteractionPolicy,
    resolvePanelDirFocusButtonTarget,
    resolvePanelDirFilterButtonTarget,
    resolvePanelDirPrintButtonTarget,
    resolvePanelDirTitleTarget,
    resolvePanelDirTriangleTarget,
    resolveTripDetailStationTarget
} from './panelInteractionCore.js';
import {
    buildPanelLineMergeInfo,
    normalizeArrayLike
} from './panelStation.js';
import {
    applyTemporarySourceLineOverrides,
    createEmptyPanelThroughServiceState,
    reorderPanelThroughServiceLinesAfterHtml,
    resolvePanelThroughServiceSetup
} from './panelStation.js';
import {
    preparePanelStationRenderBootstrap,
    resetPanelStationRenderTransientState
} from './panelStation.js';
import {
    createPanelHoverRestoreRuntime,
    createPanelStationRestoreController
} from './panelInteractionCore.js';
import {
    dispatchPanelDirectionFocusIntent,
    dispatchPanelDirectionToggleIntent,
    dispatchPanelDirFilterIntent,
    dispatchPanelPrimarySelectionIntent
} from './panelInteractionCore.js';
import {
    createPanelMobileStackController,
    PANEL_MOBILE_STACK_SCREENS
} from './panelMobileStackController.js';
import { resolvePanelStationJumpIntent } from './panelStationJump.js';
import {
    buildPanelTripDetailMobileHeaderViewModel,
    buildPanelTripDetailTitleHtml
} from './panelTripDetailRender.js';
import {
    renderPanelTripDetailGridMarkerCell,
} from './panelTripDetailRender.js';
import { renderPanelTripDetailGridLaneBlock } from './panelTripDetailRender.js';
import { renderPanelTripDetailBranchBreakRow } from './panelTripDetailRender.js';
import { renderPanelTripDetailBranchGridRows } from './panelTripDetailRender.js';
import { collectPanelTripDetailBranchLanesFromRefs } from './panelTripDetailRuntime.js';
import {
    collectPanelTripDetailRefChainTripsFromRef,
    resolvePanelTripDetailFirstMultiRefsAlongChain
} from './panelTripDetailRuntime.js';
import { collectPanelTripDetailTripChainByTrip } from './panelTripDetailRuntime.js';
import { derivePanelTripDetailThroughServiceDirection } from './panelTripDetailRuntime.js';
import {
    getPanelTripDetailStationIds,
    resolvePanelTripDetailThroughServiceEndpointIds
} from './panelTripDetailRuntime.js';
import { findPanelTripByKey } from './panelTripDetailRuntime.js';
import {
    derivePanelTripDetailBranchRuntime,
    mergePanelTripDetailBoundaryStops,
    resolvePanelTripDetailBranchRefIds
} from './panelTripDetailRuntime.js';
import { preparePanelTripDetailBranchMainFlow } from './panelTripDetailRuntime.js';
import { buildPanelTripDetailSegmentBlocks, renderPanelTripDetailLinearRows, buildPanelTripDetailLayoutShell } from './panelTripDetailRender.js';
import { applyPanelTripDetailAlternateBodyTransferDisplay, applyPanelTripDetailAlternateBodyDisplayToLanes, renderPanelTripDetailAlternateBodyStopRow, splitPanelTripDetailAlternateBodySegmentsByDisplayLine } from './panelTripDetailAlternateBody.js';
import {
    getPanelTripDetailSegmentFirstRow,
    getPanelTripDetailSegmentLastRow,
    isPanelTripDetailBoundaryPast,
    renderPanelTripDetailLoopMarkerRow,
    renderPanelTripDetailNoteRow
} from './panelTripDetailRender.js';
import { buildTripDetailTransferDisplayByStationId } from './panelTripDetailTransfers.js';
import { buildPanelStationRenderInputs } from './panelStation.js';
import { createPanelPinnedTripDetailState } from './panelInteractionCore.js';
import {
    findPanelTripTarget,
    resolvePanelInteractionKeyFromTarget,
    resolvePanelMousePrimaryTarget
} from './panelInteractionCore.js';
import { createPanelCatalogController } from './panelCatalogShell.js';
import {
    createPanelTouchInteractionController,
    isTouchLikePointer
} from './panelInteractionCore.js';
import { composePanelShellWithContent, createPanelContentApi } from './panelCatalogShell.js';
import {
    getSpecialTripDetailStationAKey,
    isExcludedLineType,
    shouldUseExactTripDetailEndpointIds
} from '../../lib/special-condition.js';

const toText = (v) => String(v ?? '').trim();

const isSaturdayHoliday = (day, { timezoneMode = readBusinessTimezoneMode() } = {}) => {
    const isHoliday = (typeof JapaneseHolidays !== 'undefined' && typeof JapaneseHolidays.isHoliday === 'function')
        ? (date) => JapaneseHolidays.isHoliday(date)
        : null;
    return inferServiceDayFromDate(day, {
        isHoliday,
        timezoneMode
    });
}

const getTimezoneMode = () => readBusinessTimezoneMode();

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

const PRINT_SERVICE_DAYS = ['Weekday', 'SaturdayHoliday'];
const PANEL_TIMETABLE_ALTERNATE_OVERLAY_ENABLED = true;

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

const buildDisplayTimeFromSourceHHMM = (hhmm, serviceDayStartMs) => {
    const parsed = parseHHMMToServiceDayMs(hhmm, serviceDayStartMs);
    if (!parsed) return {
        isNextDaySegment: false,
        ms: null,
        text: ''
    };
    return {
        isNextDaySegment: parsed.isNextDaySegment,
        ms: parsed.ms,
        text: toHHMMForTimezone(parsed.ms, { timezoneMode: getTimezoneMode() })
    };
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
    if (dwellMinutes >= 2) {
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
    const STATION_THROUGH_PREVIEW_SOURCE = 'station-through-branch';
    const widthPx = Number.isFinite(options.widthPx) ? options.widthPx : 380;
    const rightPx = Number.isFinite(options.rightPx) ? options.rightPx : 20;
    const zIndex = Number.isFinite(options.zIndex) ? options.zIndex : 9999;
    const panelPresentation = options.panelPresentation === 'mobile' ? 'mobile' : 'desktop';

    const hoverDelayMs = Number.isFinite(options.hoverDelayMs) ? options.hoverDelayMs : 50;
    const primaryHoverDelayMs = 500;
    const getLineMetaBase = typeof options.getLineMeta === 'function' ? options.getLineMeta : (() => null);
    let temporaryPanelLineMetaById = new Map();
    let temporaryPanelSourceLineIdsByDisplayLineId = new Map();
    let temporaryPanelAllowedTripKeysByDisplayLineId = new Map();
    let throughServiceDirectionsByEntityLineId = new Map();
    const getLineMeta = (lineId) => {
        const id = toText(lineId);
        if (!id) return null;
        const temp = temporaryPanelLineMetaById.get(id);
        if (temp) return temp;
        return getLineMetaBase(id);
    };
    const companyLogoMap = options.companyLogoMap || {};
    const onSelectCompany = typeof options.onSelectCompany === 'function' ? options.onSelectCompany : null;
    const onSelectLine = typeof options.onSelectLine === 'function' ? options.onSelectLine : null;
    const onRestoreStationLines = typeof options.onRestoreStationLines === 'function' ? options.onRestoreStationLines : null;
    const onTripPreview = typeof options.onTripPreview === 'function' ? options.onTripPreview : null;
    const onTripClear = typeof options.onTripClear === 'function' ? options.onTripClear : null;
    const onTripCurrentStationShow = typeof options.onTripCurrentStationShow === 'function' ? options.onTripCurrentStationShow : null;
    const onTripCurrentStationHide = typeof options.onTripCurrentStationHide === 'function' ? options.onTripCurrentStationHide : null;
    const onTripDetailStationIndicator = typeof options.onTripDetailStationIndicator === 'function' ? options.onTripDetailStationIndicator : null;
    const onTripDetailStationIndicatorClear = typeof options.onTripDetailStationIndicatorClear === 'function' ? options.onTripDetailStationIndicatorClear : null;
    const onTripDetailStationJump = typeof options.onTripDetailStationJump === 'function' ? options.onTripDetailStationJump : null;
    const onDirPreviewEnter = typeof options.onDirPreviewEnter === 'function' ? options.onDirPreviewEnter : null;
    const onDirPreviewLeave = typeof options.onDirPreviewLeave === 'function' ? options.onDirPreviewLeave : null;
    const onAndroidBackPanelHidden = typeof options.onAndroidBackPanelHidden === 'function' ? options.onAndroidBackPanelHidden : null;
    const settingsContentEl = options.settingsContentEl && options.settingsContentEl.appendChild ? options.settingsContentEl : null;
    const getTimetableViewMode = typeof options.getTimetableViewMode === 'function' ? options.getTimetableViewMode : null;
    const onTimetableViewModeChanged = typeof options.onTimetableViewModeChanged === 'function' ? options.onTimetableViewModeChanged : null;
    const getAlternateLineMembership = typeof options.getAlternateLineMembership === 'function' ? options.getAlternateLineMembership : (async () => null);
    const getHoverPreviewEnabled = typeof options.getHoverPreviewEnabled === 'function' ? options.getHoverPreviewEnabled : null;
    const getMultiSelectModeEnabled = typeof options.getMultiSelectModeEnabled === 'function' ? options.getMultiSelectModeEnabled : null;
    let hoverPreviewEnabled = getHoverPreviewEnabled ? getHoverPreviewEnabled() !== false : true;
    const isHoverPreviewEnabled = () => hoverPreviewEnabled !== false;
    const isMultiSelectModeEnabled = () => getMultiSelectModeEnabled ? getMultiSelectModeEnabled() === true : false;
    const panelSelectionState = createPanelSelectionStateController({ toText });

    let currentLineGroupByMainId = new Map();
    let currentStationsIndex = null;
    let currentLineStationMetaByLineId = new Map();

    const panelShell = createPanelShell({ presentation: panelPresentation, rightPx, widthPx });
    const panelContentApi = createPanelContentApi();
    const panelComposition = composePanelShellWithContent({ contentApi: panelContentApi, shell: panelShell });
    const touchInteraction = createPanelTouchInteractionController({ now: nowMs });
    const panelInteractionPolicy = createPanelInteractionPolicy({
        getPresentation: () => panelPresentation,
        touchInteraction
    });
    const panelIntents = createPanelIntentController({
        captureElement: exportElementToPng
    });
    const crossFeatureBridge = createPanelCrossFeatureBridgeController();
    const panelRoutePreview = createPanelRoutePreviewController({
        clearTripPathPreviewBySource: (source) => crossFeatureBridge.clearTripPathPreviewBySource(source),
        toText
    });
    const mobilePanelStack = createPanelMobileStackController();
    const isMobilePanelPresentation = () => panelPresentation === 'mobile';

    // 从右侧滑入/滑出

    // 面板主体：视觉同 search-results，但 class 使用 panel-* 隔离
    const panelMainView = createPanelMainView({
        panelComposition,
        panelContentApi,
        panelShell,
        createPanelMapSelectController,
        createPanelTimePickerController,
        getIconCandidates,
        getPreferredCachedImageSrc,
        setImageElementFromCache,
        formatDateInputValue: (date) => formatBusinessDateInputValue(date, { timezoneMode: getTimezoneMode() }),
        formatPanelDateText: (date) => formatBusinessDateLabel(date, {
            isHoliday: (holidayDate) => globalThis?.JapaneseHolidays?.isHoliday?.(holidayDate),
            timezoneMode: getTimezoneMode()
        }),
        getInitialPanelDate: () => Date.now(),
        isSaturdayHoliday,
        stopEvent,
        stopPropagationOnly,
        setTimePickerOpenState: (open) => {
            crossFeatureBridge.setTimePickerOpenState(open);
        },
        getJourneyStationContext: ({ titleMain }) => ({
            stationId: currentStationId,
            stationName: toText(currentStationNameZh) || toText(titleMain.textContent)
        }),
        getJourneyWaypointOptions: () => crossFeatureBridge.getJourneyWaypointOptions(),
        isJourneyPlannerOpen: () => crossFeatureBridge.isJourneyPlannerOpen(),
        onJourneyStationSelect: ({ field, stationId, stationName, waypointIndex }) => {
            crossFeatureBridge.setJourneyStation({ field, waypointIndex, stationId, stationName });
            crossFeatureBridge.clearStationSelection();
        },
        toText,
        zIndex
    });
    const {
        body,
        btnAutoNow,
        btnHoliday,
        btnViewGrid,
        btnViewList,
        btnWeekday,
        datePanel,
        datePickerInput,
        dayPrintBtn,
        daySeg,
        formatDateInputValue,
        formatPanelDateText,
        header,
        mapSelectController,
        panel,
        parseDateInputValue,
        root,
        timeInput,
        timeOverlay,
        timePickerController,
        title,
        titleMain,
        titleSub,
        tripDetailBackBtn,
        tripDetailBody,
        tripDetailCaptureBtn,
        tripDetailRoot,
        tripDetailView,
        viewToggle
    } = panelMainView;
    const panelRouteMapBridge = createPanelRouteMapBridge();

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

    tripDetailBackBtn?.addEventListener?.('click', (evt) => {
        stopEvent(evt);
        hideTripDetail();
        lastTripDetailKey = null;
    }, { passive: false });

    let panelCatalogController = null;

    const scheduleCatalogRefresh = () => {
        panelCatalogController?.scheduleRefresh();
    };

    const panelScrollRuntime = createPanelScrollRuntime({
        body,
        toText,
        syncActiveTitle: (activeLineId = '') => {
            panelCatalogController?.syncTitleForActiveLine(activeLineId);
        }
    });

    /*
     * PC panel catalog is intentionally disabled.
     * Keep the controller wiring here for future restore, but do not mount it.
     *
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
     */

    tripDetailRoot.addEventListener('pointerdown', (e) => {
        tripDetailPinned = true;
        setTripDetailInteractive(true);
        clearTripDetailHideTimer();
        stopPropagationOnly(e);
    }, { passive: true });
    tripDetailRoot.addEventListener('click', (e) => {
        // 仅阻止冒泡：避免点详情面板触发“空白处点击=恢复选择”等全局逻辑
        tripDetailPinned = true;
        setTripDetailInteractive(true);
        clearTripDetailHideTimer();
        stopPropagationOnly(e);
    }, { passive: true });
    tripDetailRoot.addEventListener('focusin', () => {
        tripDetailPinned = true;
        setTripDetailInteractive(true);
        clearTripDetailHideTimer();
    });
    tripDetailRoot.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    tripDetailRoot.addEventListener('mouseenter', () => {
        if (panelInteractionPolicy.shouldSkipDesktopHover()) return;
        tripDetailPinned = true;
        clearTripDetailHideTimer();
    });
    tripDetailRoot.addEventListener('mouseleave', () => {
        if (panelInteractionPolicy.shouldSkipDesktopHover()) return;
        if (tripLocked) {
            tripDetailPinned = true;
            clearTripDetailHideTimer();
            return;
        }
        tripDetailPinned = false;
        scheduleTripDetailHide();
    });

    panelRouteMapBridge.onReturn(() => {
        if (!isMobilePanelPresentation()) return;
        panelStationRestoreController.clearPinnedStateAndRestore();
        panelShell.expand?.();
        scheduleCatalogRefresh();
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
    let currentStationProps = null;
    let stationThroughPreviewSuppressed = false;
    const stationRestoreContext = createPanelStationRestoreContext({ toText });

    const invalidateStationRestoreSession = ({ cancelRender = false } = {}) => {
        if (cancelRender) stationRenderToken += 1;
        stationRestoreContext.invalidate();
        lastAppliedHoverKey = null;
    };

    const cancelStationThroughPreview = () => {
        stationThroughPreviewSuppressed = true;
        stationRenderToken += 1;
        try {
            crossFeatureBridge.clearTripPathPreviewBySource(STATION_THROUGH_PREVIEW_SOURCE);
        } catch {
            // ignore cross-feature cleanup failures
        }
    };

    const getMobilePanelStationContext = () => ({
        stationId: toText(currentStationId),
        stationName: toText(currentStationNameZh) || toText(titleMain.textContent)
    });

    const syncMobilePanelStackUi = () => {
        const state = mobilePanelStack.getState();
        const screen = toText(state?.screen) || PANEL_MOBILE_STACK_SCREENS.STATION_OVERVIEW;
        root.setAttribute('data-panel-mobile-stack-screen', screen);
        root.setAttribute('data-panel-mobile-stack-open', state?.isOpen ? '1' : '0');
        body.setAttribute('data-panel-mobile-stack-screen', screen);
        body.setAttribute('data-panel-mobile-stack-open', state?.isOpen ? '1' : '0');
        body.setAttribute('data-panel-mobile-active-line-id', toText(state?.lineId));

        const activeLineId = toText(state?.lineId);
        const shouldMarkLines = isMobilePanelPresentation()
            && state?.isOpen
            && screen !== PANEL_MOBILE_STACK_SCREENS.STATION_OVERVIEW
            && activeLineId;
        const lineEls = Array.from(body.querySelectorAll?.('.panel-line[data-line-id]') || []);
        for (const lineEl of lineEls) {
            const lineId = toText(lineEl.getAttribute?.('data-line-id'));
            const isActive = shouldMarkLines && lineId === activeLineId;
            lineEl.classList.toggle('is-mobile-stack-active-line', Boolean(isActive));
            lineEl.classList.toggle('is-mobile-stack-dimmed-line', Boolean(shouldMarkLines && !isActive));
        }

        const companyEls = Array.from(body.querySelectorAll?.('.panel-company') || []);
        for (const companyEl of companyEls) {
            const hasActiveLine = shouldMarkLines
                && Boolean(companyEl.querySelector?.('.panel-line.is-mobile-stack-active-line'));
            companyEl.classList.toggle('is-mobile-stack-active-company', Boolean(hasActiveLine));
            companyEl.classList.toggle('is-mobile-stack-dimmed-company', Boolean(shouldMarkLines && !hasActiveLine));
        }
    };

    const openMobileStationOverview = () => {
        if (!isMobilePanelPresentation()) return;
        mobilePanelStack.openStationOverview(getMobilePanelStationContext());
        syncMobilePanelStackUi();
    };

    const collapseMobilePanelForMapContext = () => {
        if (!isMobilePanelPresentation()) return false;
        if (typeof panelShell.collapseHalf === 'function') {
            return panelShell.collapseHalf();
        }
        return panelShell.collapse?.() === true;
    };

    const expandMobilePanelAfterTripDetailReturn = () => {
        if (!isMobilePanelPresentation()) return false;
        return panelShell.expand?.() === true;
    };

    const hideMobilePanelForRouteMapContext = () => {
        if (!isMobilePanelPresentation()) return false;
        panelShell.hide?.();
        return true;
    };
    let stationRenderToken = 0;
    let currentServiceDay = 'SaturdayHoliday';

    let day = Date.now();
    currentServiceDay = isSaturdayHoliday(day);

    let currentNowOverrideHHMM = '';
    let hasTemporaryTimeOverride = false;
    let isAutoNowClock = true;
    let autoNowClockTimerId = null;
    let currentPanelDate = new Date();
    const getDisplayNowMs = () => {
        const baseNowMs = Date.now();
        const hhmm = toText(currentNowOverrideHHMM);
        if (!hhmm) return baseNowMs;
        const parsed = parseDisplayHHMMToMs(hhmm, {
            referenceMs: baseNowMs,
            timezoneMode: getTimezoneMode()
        });
        return parsed?.ms || baseNowMs;
    };

    const formatNowHHMM = (d = Date.now()) => {
        const parts = getBusinessDateParts(d, { timezoneMode: getTimezoneMode() });
        const hh = String(parts.hour).padStart(2, '0');
        const mm = String(parts.minute).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    const syncAutoNowClock = ({ forceRender = false } = {}) => {
        if (!isAutoNowClock) return;
        const hhmm = formatNowHHMM(Date.now());
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
        hasTemporaryTimeOverride = false;
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
    let tripDetailStationJumpEnabled = false;
    let tripDetailStationPointerIntent = null;
    let tripDetailHideTimer = null;
    let timetableViewMode = 'list';
    let focusedDirectionKey = '';
    let mobileTripDetailReturnContext = null;
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
        const parts = name.split(/\s+/).map((part) => toText(part)).filter(Boolean);
        if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
            parts.pop();
        }
        return toText(parts.join(' ') || name);
    };

    const buildUniqueSpecialAbbrMap = (orderedSpecialSp) => {
        const names = Array.isArray(orderedSpecialSp) ? orderedSpecialSp.map((x) => toText(x)).filter(Boolean) : [];
        const tokenEntries = names.map((sp) => {
            const chars = Array.from(sp);
            const firstSignificantChar = chars.find((ch) => /\S/.test(ch)) || '';
            const latinInitials = (sp.match(/[A-Za-z]+/g) || [])
                .map((part) => part[0]?.toUpperCase?.() || '')
                .filter(Boolean);
            const cjkChars = Array.from(sp).filter((ch) => /[\u3400-\u9FFF]/.test(ch));
            if (latinInitials.length && /^[A-Za-z]$/.test(firstSignificantChar)) {
                const prefix = latinInitials.join('');
                if (cjkChars.length) {
                    return {
                        chars: cjkChars,
                        prefix,
                        initialLength: 1,
                        maxLength: Math.max(1, Math.min(cjkChars.length, 4))
                    };
                }
                const latinWords = sp.match(/[A-Za-z]+/g) || [];
                if (latinWords.length === 1) {
                    const wordChars = Array.from(latinWords[0].toUpperCase());
                    const pureLatinLength = wordChars.length <= 4 ? wordChars.length : 3;
                    return {
                        chars: wordChars,
                        prefix: '',
                        initialLength: Math.max(1, pureLatinLength),
                        maxLength: Math.max(1, pureLatinLength)
                    };
                }
                const pureLatinLength = latinInitials.length <= 4 ? latinInitials.length : 3;
                return {
                    chars: latinInitials,
                    prefix: '',
                    initialLength: Math.max(1, pureLatinLength),
                    maxLength: Math.max(1, pureLatinLength)
                };
            }

            return {
                chars,
                prefix: '',
                initialLength: chars.length >= 2 ? 2 : 1,
                maxLength: Math.max(1, Math.min(chars.length, 4))
            };
        });
        const lengths = tokenEntries.map((entry) => Number(entry?.initialLength) || 1);

        const pick = (entry, len) => {
            const chars = Array.isArray(entry?.chars) ? entry.chars : [];
            if (!chars.length) return toText(entry?.prefix);
            const n = Math.max(1, Math.min(len, chars.length));
            return `${toText(entry?.prefix)}${chars.slice(0, n).join('')}`;
        };

        for (let round = 0; round < 16; round += 1) {
            const bucket = new Map();
            for (let i = 0; i < tokenEntries.length; i += 1) {
                const abbr = pick(tokenEntries[i], lengths[i]);
                if (!bucket.has(abbr)) bucket.set(abbr, []);
                bucket.get(abbr).push(i);
            }

            let changed = false;
            for (const [, indices] of bucket.entries()) {
                if (!Array.isArray(indices) || indices.length <= 1) continue;
                for (const i of indices) {
                    const maxLen = Number(tokenEntries[i]?.maxLength) || 1;
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
            out.set(names[i], pick(tokenEntries[i], lengths[i]));
        }
        return out;
    };

    const BASE_TYPE_KEYWORDS = TYPE_BASE_SEQUENCE
        .map((kw) => toText(kw))
        .filter(Boolean);

    const isNoMarkTypeName = isLocalStopTypeName;

    const hasPanelTripNmMarker = hasTripNmMarker;

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
        currentLineId,
        stopTypeColorByName,
        stopTypeNameSet,
        typeCountByName,
        typeIdsByTypeName,
        typeStopCountByName
    }) => {
        const allColorMap = allTypeColorByName instanceof Map ? allTypeColorByName : new Map();
        const stopColorMap = stopTypeColorByName instanceof Map ? stopTypeColorByName : new Map();
        const stopSet = stopTypeNameSet instanceof Set ? stopTypeNameSet : new Set();
        const stopCountMap = typeStopCountByName instanceof Map ? typeStopCountByName : new Map();

        const filteredTypeNames = Array.from(allColorMap.keys())
            .map((x) => toText(x))
            .filter((name) => !!resolveTypeBaseName(name));
        const typeNames = sortTypeNamesByBaseAndStopCount(
            filterPreferredLocalStopTypeNames(filteredTypeNames, {
                currentLineId,
                typeIdsByTypeName
            }),
            null,
            stopCountMap
        );
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

    const buildTerminalDisplayAbbr = (nameRaw) => {
        const chars = Array.from(toText(nameRaw)).filter((ch) => /\S/.test(ch));
        if (chars.length <= 3) return chars.join('');
        return [chars[0], chars[2] || chars[1]]
            .map((ch) => toText(ch))
            .filter(Boolean)
            .join('');
    };

    const buildDirectionGridHints = (rowsForDir, { currentLineId = '' } = {}) => {
        const rows = Array.isArray(rowsForDir) ? rowsForDir : [];

        const typeCount = new Map();
        const typeColorByName = new Map();
        const typeIdsByName = new Map();
        const typeStopCountByName = new Map();
        const terminalCount = new Map();
        const terminalNamesByLabel = new Map();
        const terminalAtomicCount = new Map();
        const splitMergeTerminalNames = new Set();
        const splitNtMultiDestTerminalNames = new Set();
        const specialBySp = new Map();

        for (const row of rows) {
            const typeName = toText(row?.typeName);
            if (typeName && !row?.hasNm) {
                typeCount.set(typeName, (typeCount.get(typeName) || 0) + 1);
                if (!typeIdsByName.has(typeName)) typeIdsByName.set(typeName, new Set());
                const typeId = toText(row?.typeId);
                if (typeId) typeIdsByName.get(typeName).add(typeId);
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

        const typeNames = sortTypeNamesByBaseAndStopCount(
            filterPreferredLocalStopTypeNames(Array.from(typeCount.keys()), {
                currentLineId,
                typeIdsByTypeName: typeIdsByName
            }),
            typeCount,
            typeStopCountByName
        );
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
                    .map((fullName) => {
                        const normalized = toText(fullName);
                        if (!normalized) return '';
                        if (fullNames.length > 1) return buildTerminalDisplayAbbr(normalized);
                        return toText(terminalAbbrMap.get(normalized)) || buildTerminalDisplayAbbr(normalized);
                    })
                    .filter(Boolean);
                if (!parts.length) return buildTerminalDisplayAbbr(name);
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
                            abbr: fullNames.length > 1
                                ? buildTerminalDisplayAbbr(normalized)
                                : (toText(terminalAbbrMap.get(normalized)) || buildTerminalDisplayAbbr(normalized)),
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

    const syncDocumentDirectionFocusState = (active) => {
        const shouldMark = active === true && isMobilePanelPresentation();
        const documentRef = typeof document !== 'undefined' ? document : null;
        const docEl = documentRef?.documentElement || null;
        const pageBody = documentRef?.body || null;
        if (shouldMark) {
            docEl?.setAttribute?.('data-mobile-panel-direction-focus', '1');
            pageBody?.setAttribute?.('data-mobile-panel-direction-focus', '1');
            return;
        }
        docEl?.removeAttribute?.('data-mobile-panel-direction-focus');
        pageBody?.removeAttribute?.('data-mobile-panel-direction-focus');
    };

    const syncDirectionFocusVisibility = () => {
        const focusedLineId = getFocusedDirectionLineId();
        const active = !!focusedLineId;
        const mobileStackScreen = toText(mobilePanelStack.getState?.()?.screen);
        const shouldUseFullscreenFocus = active
            && !(isMobilePanelPresentation() && mobileStackScreen === PANEL_MOBILE_STACK_SCREENS.TRIP_DETAIL);
        body.classList.toggle('is-direction-focused', !!focusedLineId);
        body.setAttribute('data-direction-focus', focusedDirectionKey || '');
        root.setAttribute('data-panel-direction-focus', shouldUseFullscreenFocus ? '1' : '0');
        syncDocumentDirectionFocusState(shouldUseFullscreenFocus);
        if (!focusedLineId) {
            body.style.removeProperty('--panel-focus-line-header-height');
            body.style.removeProperty('--panel-focus-dir-header-height');
        }

        const lineEls = Array.from(body.querySelectorAll?.('.panel-line[data-line-id]') || []);
        for (const lineEl of lineEls) {
            const lineId = toText(lineEl.getAttribute?.('data-line-id'));
            lineEl.classList.toggle('is-direction-focus-hidden', !!focusedLineId && lineId !== focusedLineId);
        }

        const companyEls = Array.from(body.querySelectorAll?.('.panel-company') || []);
        for (const companyEl of companyEls) {
            const lines = Array.from(companyEl.querySelectorAll?.('.panel-line[data-line-id]') || []);
            const hasVisibleLine = !focusedLineId || lines.some((lineEl) => !lineEl.classList.contains('is-direction-focus-hidden'));
            companyEl.classList.toggle('is-direction-focus-hidden', !hasVisibleLine);
        }

        scheduleCatalogRefresh();
    };

    const syncDirectionFocusStickyMetrics = () => {
        if (!getFocusedDirectionLineId()) {
            body.style.removeProperty('--panel-focus-line-header-height');
            body.style.removeProperty('--panel-focus-dir-header-height');
            return;
        }

        const lineHeaderEl = body.querySelector?.('.panel-line:not(.is-direction-focus-hidden) .panel-line-header');
        const lineHeaderHeight = Math.ceil(Number(lineHeaderEl?.getBoundingClientRect?.()?.height) || 0);
        if (lineHeaderHeight > 0) {
            body.style.setProperty('--panel-focus-line-header-height', `${lineHeaderHeight}px`);
        } else {
            body.style.removeProperty('--panel-focus-line-header-height');
        }

        const dirHeaderEl = body.querySelector?.('.panel-line:not(.is-direction-focus-hidden) .panel-dir-header[data-dir-key]');
        const dirHeaderHeight = Math.ceil(Number(dirHeaderEl?.getBoundingClientRect?.()?.height) || 0);
        if (dirHeaderHeight > 0) {
            body.style.setProperty('--panel-focus-dir-header-height', `${dirHeaderHeight}px`);
        } else {
            body.style.removeProperty('--panel-focus-dir-header-height');
        }
    };

    const clearDirectionFocus = ({ rerender = true } = {}) => {
        if (!focusedDirectionKey) {
            syncDirectionFocusVisibility();
            syncDirectionFocusStickyMetrics();
            return false;
        }
        focusedDirectionKey = '';
        mobileTripDetailReturnContext = null;
        syncDirectionFocusVisibility();
        syncDirectionFocusStickyMetrics();
        if (rerender) renderAllTimetables();
        return true;
    };

    const clearMobileTripDetailReturnContext = () => {
        mobileTripDetailReturnContext = null;
    };

    const captureMobileTripDetailReturnContext = ({
        lineId = '',
        dirKey = ''
    } = {}) => {
        if (!isMobilePanelPresentation()) {
            clearMobileTripDetailReturnContext();
            return null;
        }

        const focusKey = toText(focusedDirectionKey);
        const focusLineId = getFocusedDirectionLineId();
        const focusDirKey = getFocusedDirectionDirKey();
        const lid = toText(lineId);
        const dkey = toText(dirKey) || focusDirKey;
        const isFocusedTrip = Boolean(
            focusKey
            && lid
            && focusLineId === lid
            && makeLineDirKey(lid, dkey) === focusKey
        );

        if (!isFocusedTrip) {
            clearMobileTripDetailReturnContext();
            return null;
        }

        mobileTripDetailReturnContext = {
            source: 'direction-focus',
            focusedDirectionKey: focusKey,
            lineId: lid,
            dirKey: dkey,
            scrollTop: Number(body?.scrollTop || 0),
            timetableViewMode
        };
        return mobileTripDetailReturnContext;
    };

    const restorePanelBodyScrollTop = (scrollTop) => {
        const nextScrollTop = Number(scrollTop);
        if (!Number.isFinite(nextScrollTop) || nextScrollTop < 0) return;

        const applyScrollTop = () => {
            body.scrollTop = nextScrollTop;
            syncDirectionFocusStickyMetrics();
        };

        const requestFrame = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (callback) => setTimeout(callback, 0);
        requestFrame(() => requestFrame(applyScrollTop));
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
    const linePrintPayloadsByLineId = new Map(); // lineId -> raw export payloads before through-service panel split
    const dirPreviewMetaByKey = new Map(); // lineId||dir -> { lineId, originStationIds:string[], terminalStationIds:string[] }
    const makeLineDirKey = (lineId, dirKey) => `${toText(lineId)}||${toText(dirKey) || 'Unknown'}`;
    const dirKeyOf = (lineId, dir) => `${toText(lineId)}||${toText(dir) || 'Unknown'}`;
    const getFocusedDirectionLineId = () => toText(focusedDirectionKey).split('||')[0] || '';
    const getFocusedDirectionDirKey = () => {
        const parts = toText(focusedDirectionKey).split('||');
        return parts.length > 1 ? parts.slice(1).join('||') : '';
    };
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

    const updatePanelCompanyCollapseState = (companyEl) => {
        if (!(companyEl instanceof Element)) return;
        const lineEls = Array.from(companyEl.querySelectorAll?.('.panel-line[data-line-id]') || []);
        const allCollapsed = lineEls.length > 0 && lineEls.every((lineEl) => lineEl.getAttribute('data-panel-line-collapsed') === '1');
        companyEl.setAttribute('data-panel-company-collapsed', allCollapsed ? '1' : '0');
        const toggleEl = companyEl.querySelector?.('[data-panel-company-toggle-btn]');
        if (toggleEl instanceof Element) {
            toggleEl.setAttribute('aria-expanded', allCollapsed ? 'false' : 'true');
            toggleEl.setAttribute('aria-label', allCollapsed ? '展开运营商线路' : '收起运营商线路');
        }
        const iconEl = toggleEl?.querySelector?.('.panel-company-toggle-icon');
        if (iconEl instanceof Element) iconEl.textContent = allCollapsed ? '▸' : '▾';
    };

    const setPanelLineCollapsed = (lineEl, collapsed) => {
        if (!(lineEl instanceof Element)) return;
        const wasCollapsed = lineEl.getAttribute('data-panel-line-collapsed') === '1';
        const nextCollapsed = collapsed === true;
        lineEl.setAttribute('data-panel-line-collapsed', nextCollapsed ? '1' : '0');
        const toggleEl = lineEl.querySelector?.('[data-panel-line-toggle]');
        if (toggleEl instanceof Element) {
            toggleEl.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
            toggleEl.setAttribute('aria-label', nextCollapsed ? '展开线路' : '收起线路');
        }
        const iconEl = toggleEl?.querySelector?.('.panel-line-toggle-icon');
        if (iconEl instanceof Element) iconEl.textContent = nextCollapsed ? '▸' : '▾';
        updatePanelCompanyCollapseState(lineEl.closest?.('.panel-company'));
        if (wasCollapsed && !nextCollapsed) scheduleMarqueeApply(lineEl);
    };

    const applyDefaultPanelLineCollapse = (rootEl, shouldCollapse) => {
        if (!(rootEl instanceof Element)) return;
        const lineEls = Array.from(rootEl.querySelectorAll?.('.panel-line[data-line-id]') || []);
        for (const lineEl of lineEls) {
            setPanelLineCollapsed(lineEl, shouldCollapse);
        }
        const companyEls = Array.from(rootEl.querySelectorAll?.('.panel-company') || []);
        for (const companyEl of companyEls) updatePanelCompanyCollapseState(companyEl);
    };

    const getPanelLineToggleTarget = (target) => {
        if (!(target instanceof Element) || !body?.contains?.(target)) return null;
        const toggleEl = target.closest?.('[data-panel-line-toggle]');
        if (!(toggleEl instanceof Element) || !body.contains(toggleEl)) return null;
        const lineEl = toggleEl.closest?.('.panel-line[data-line-id]');
        if (!(lineEl instanceof Element)) return null;
        return { toggleEl, lineEl };
    };

    const getPanelLineHeaderToggleTarget = (target) => {
        if (!(target instanceof Element) || !body?.contains?.(target)) return null;
        const headerEl = target.closest?.('.panel-line-header');
        if (!(headerEl instanceof Element) || !body.contains(headerEl)) return null;
        const lineEl = headerEl.closest?.('.panel-line[data-line-id]');
        if (!(lineEl instanceof Element)) return null;
        return { headerEl, lineEl };
    };

    const togglePanelLineCollapsed = (lineEl) => {
        if (!(lineEl instanceof Element)) return;
        setPanelLineCollapsed(lineEl, lineEl.getAttribute('data-panel-line-collapsed') !== '1');
    };

    const collapsePanelLineAfterFocusExit = (lineEl) => {
        if (!(lineEl instanceof Element)) return;
        const lineId = toText(lineEl.getAttribute?.('data-line-id'));
        if (lineId && getFocusedDirectionLineId() === lineId) {
            clearDirectionFocus({ rerender: true });
            setPanelLineCollapsed(lineEl, true);
            return;
        }
        togglePanelLineCollapsed(lineEl);
    };

    const collapsePanelLineAfterFocusExitById = (lineId) => {
        const lid = toText(lineId);
        if (!lid) return;
        const lineEl = body.querySelector?.(`.panel-line[data-line-id="${escapeHtml(String(lid))}"]`);
        collapsePanelLineAfterFocusExit(lineEl);
    };

    const togglePanelLineCollapsedById = (lineId) => {
        const lid = toText(lineId);
        if (!lid) return;
        const lineEl = body.querySelector?.(`.panel-line[data-line-id="${escapeHtml(String(lid))}"]`);
        togglePanelLineCollapsed(lineEl);
    };

    const getPanelCompanyToggleTarget = (target) => {
        if (!(target instanceof Element) || !body?.contains?.(target)) return null;
        const companyHeaderEl = target.closest?.('.panel-company-header[data-panel-company-toggle]');
        if (!(companyHeaderEl instanceof Element) || !body.contains(companyHeaderEl)) return null;
        const companyEl = companyHeaderEl.closest?.('.panel-company');
        if (!(companyEl instanceof Element)) return null;
        return { companyHeaderEl, companyEl };
    };

    const togglePanelCompanyLinesCollapsed = (companyEl) => {
        if (!(companyEl instanceof Element)) return;
        const lineEls = Array.from(companyEl.querySelectorAll?.('.panel-line[data-line-id]') || []);
        if (!lineEls.length) return;
        const shouldCollapse = lineEls.some((lineEl) => lineEl.getAttribute('data-panel-line-collapsed') !== '1');
        for (const lineEl of lineEls) setPanelLineCollapsed(lineEl, shouldCollapse);
        updatePanelCompanyCollapseState(companyEl);
    };

    const getCollapsedPanelLineTarget = (target) => {
        if (!(target instanceof Element) || !body?.contains?.(target)) return null;
        const lineEl = target.closest?.('.panel-line[data-line-id][data-panel-line-collapsed="1"]');
        if (!(lineEl instanceof Element) || !body.contains(lineEl)) return null;
        return lineEl;
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
            const fromMeta = Array.isArray(meta.sourceLineIds) ? meta.sourceLineIds : [];
            if (fromMeta.length) return Array.from(new Set(fromMeta.map(x => toText(x)).filter(Boolean)));
            return [];
        })();

        const tripKeys = Array.isArray(dirFilteredTripKeysByKey.get(key))
            ? dirFilteredTripKeysByKey.get(key)
            : [];

        const targetId = toText(meta.lineId);
        const throughServiceCategory = toText(meta.throughServiceCategory) || THROUGH_SERVICE_CONFIGS.find(info => 
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
        getDirFocusButtonTarget,
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
        const restoreContext = stationRestoreContext.getSnapshot(currentStationId);
        if (!restoreContext) return;
        try {
            onRestoreStationLines(
                restoreContext.servingIds,
                {
                    stationId: restoreContext.stationId,
                    restoreSessionId: restoreContext.sessionId
                }
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

    const setServiceDay = (day) => {
        const v = String(day || '').trim();
        if (v !== 'Weekday' && v !== 'SaturdayHoliday') return;
        if (currentServiceDay === v) return;
        currentServiceDay = v;
        applyDayToggleUi();
        renderAllTimetables();
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
        hasTemporaryTimeOverride = false;
        currentNowOverrideHHMM = v;
        renderAllTimetables();
    });
    timeInput.addEventListener('blur', () => {
        const normalized = normalizeTimePickerHHMM(timeInput.value, { toText });
        if (normalized) timeInput.value = normalized;
    });

    const setTimeOverride = (value, {
        rerender = true,
        temporary = false
    } = {}) => {
        const normalized = normalizeTimePickerHHMM(value, { toText });
        if (!normalized) return false;

        isAutoNowClock = false;
        hasTemporaryTimeOverride = temporary === true;
        currentNowOverrideHHMM = normalized;
        timeInput.value = normalized;
        timePickerController.close();
        if (rerender && toText(currentStationId)) renderAllTimetables();
        return true;
    };

    const resetTemporaryTimeOverride = () => {
        if (!hasTemporaryTimeOverride) return false;
        restoreAutoNowClock();
        return true;
    };

    btnAutoNow.addEventListener('click', (e) => {
        stopEvent(e);
        timePickerController.close();
        restoreAutoNowClock();
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
    const collectTerminalThroughLineIds = ({
        isTerminalStation,
        ntRefs,
        sourceLineId,
        displayLineId
    } = {}) => {
        if (!isTerminalStation) return [];
        const currentLineIds = new Set([sourceLineId, displayLineId].map((x) => toText(x)).filter(Boolean));
        const out = [];
        for (const refId of Array.isArray(ntRefs) ? ntRefs : []) {
            const nextLineId = toText(getRefLineId(refId));
            if (!nextLineId || currentLineIds.has(nextLineId)) continue;
            out.push(nextLineId);
        }
        return Array.from(new Set(out));
    };
    const resolveThroughLineLabel = (lineId) => {
        const id = toText(lineId);
        if (!id) return '';
        return toText(getLineMeta?.(id)?.name) || id;
    };
    const buildDirectionThroughLabel = (rowsForDir) => {
        const ids = new Set();
        for (const row of Array.isArray(rowsForDir) ? rowsForDir : []) {
            const nextLineIds = Array.isArray(row?.terminalThroughLineIds) ? row.terminalThroughLineIds : [];
            for (const lineId of nextLineIds) {
                const id = toText(lineId);
                if (id) ids.add(id);
            }
        }
        const labels = Array.from(ids).map(resolveThroughLineLabel).filter(Boolean);
        return labels.length ? `直通 ${labels.join('、')}` : '';
    };
    const throughServicePanelDirectionDisplayNames = Object.freeze({});
    const getThroughServiceDirectionKey = (dirKey) => {
        const parts = toText(dirKey).split(':').map((part) => toText(part));
        return parts[0] === 'through' ? parts[2] || '' : toText(dirKey);
    };
    const resolveThroughServicePanelDirectionDisplayName = ({
        category = '',
        dirKey = '',
        rowsForDir = [],
        stationId = ''
    } = {}) => {
        const cat = toText(category);
        const station = toText(stationId);
        const direction = getThroughServiceDirectionKey(dirKey);
        const custom = throughServicePanelDirectionDisplayNames?.[cat]?.[station]?.[direction]
            || throughServicePanelDirectionDisplayNames?.[cat]?.[station]?.default
            || throughServicePanelDirectionDisplayNames?.[cat]?.default?.[direction]
            || throughServicePanelDirectionDisplayNames?.[cat]?.default?.default;
        if (toText(custom)) return toText(custom);

        for (const row of Array.isArray(rowsForDir) ? rowsForDir : []) {
            const name = toText(row?.throughServiceName);
            if (name) return name;
        }
        return '';
    };
    const parsePanelThroughServiceDirKey = (dirKey) => {
        const parts = toText(dirKey).split(':').map((part) => toText(part));
        if (parts[0] !== 'through') return null;
        return {
            category: parts[1] || '',
            direction: parts.slice(2).join(':') || 'Unknown'
        };
    };
    const sortPanelDirectionOrder = (dirOrder = []) => {
        const categoryOrder = new Map(
            THROUGH_SERVICE_CONFIGS.map((config, index) => [toText(config?.category), index])
        );
        const originalIndex = new Map(
            (Array.isArray(dirOrder) ? dirOrder : []).map((dirKey, index) => [toText(dirKey), index])
        );

        return (Array.isArray(dirOrder) ? dirOrder.slice() : []).sort((left, right) => {
            const leftInfo = parsePanelThroughServiceDirKey(left);
            const rightInfo = parsePanelThroughServiceDirKey(right);
            if (leftInfo && !rightInfo) return -1;
            if (!leftInfo && rightInfo) return 1;
            if (leftInfo && rightInfo) {
                const leftOrder = categoryOrder.has(leftInfo.category)
                    ? categoryOrder.get(leftInfo.category)
                    : Number.MAX_SAFE_INTEGER;
                const rightOrder = categoryOrder.has(rightInfo.category)
                    ? categoryOrder.get(rightInfo.category)
                    : Number.MAX_SAFE_INTEGER;
                if (leftOrder !== rightOrder) return leftOrder - rightOrder;
            }
            return (originalIndex.get(toText(left)) ?? 0) - (originalIndex.get(toText(right)) ?? 0);
        });
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

    const getStationIds = (value) => getPanelTripDetailStationIds(value, { toText });

    const resolveThroughServiceEndpointIds = (trip) => resolvePanelTripDetailThroughServiceEndpointIds({
        trip,
        loadTripByRefId,
        toText
    });

    const findTripByKey = (lineId, tripKey) => findPanelTripByKey({
        lineId,
        tripKey,
        currentLineGroupByMainId,
        currentServiceDay,
        getRefLineId,
        loadTimetableForLineId,
        parseTripServiceDayFromId,
        toText
    });

    const resolveStationIdForLine = (lineId) => resolvePanelStationIdForLine({
        lineId,
        currentStationId,
        currentStationNameZh,
        getStationGroupsIndex,
        getStationsIndex,
        toText
    });

    const buildThroughServicePanelServingLineIds = async ({
        currentServingLineIds = [],
        displayLineIds = [],
        stationId = ''
    } = {}) => {
        const baseLineIds = Array.from(new Set([
            ...(Array.isArray(currentServingLineIds) ? currentServingLineIds : []),
            ...(Array.isArray(displayLineIds) ? displayLineIds : [])
        ].map((value) => toText(value)).filter(Boolean)));
        if (!baseLineIds.length) return [];

        const out = new Set(baseLineIds);
        const alternateLineMembership = await getAlternateLineMembership();
        const alternateSourcePlanIndex = buildAlternateTripSourceIndex(alternateLineMembership);
        if (!alternateSourcePlanIndex?.size) return Array.from(out);

        for (const lineId of baseLineIds) {
            const lineStationId = toText(await resolveStationIdForLine(lineId)) || toText(stationId);
            const sourceRequests = getAlternateTripSources(
                alternateSourcePlanIndex,
                lineStationId,
                lineId
            );
            for (const source of sourceRequests) {
                const sourceLineId = toText(source?.sourceLineId);
                if (sourceLineId) out.add(sourceLineId);
            }
        }

        return Array.from(out);
    };

    const buildStationThroughPreviewRequests = () => {
        if (!(dirPreviewMetaByKey instanceof Map) || !dirPreviewMetaByKey.size) return [];

        const configByLineId = new Map(
            THROUGH_SERVICE_CONFIGS
                .map((config) => [toText(config?.lineId), config])
                .filter(([lineId]) => lineId)
        );
        const out = [];
        const seenRequestKeys = new Set();

        for (const [lineDirKeyRaw, meta] of dirPreviewMetaByKey.entries()) {
            const lineDirKey = toText(lineDirKeyRaw);
            const displayLineId = toText(meta?.lineId);
            if (!lineDirKey || !displayLineId) continue;

            const targetTripKeys = Array.from(new Set(
                (Array.isArray(dirFilteredTripKeysByKey.get(lineDirKey)) ? dirFilteredTripKeysByKey.get(lineDirKey) : [])
                    .map((key) => toText(key))
                    .filter(Boolean)
            ));
            if (!targetTripKeys.length) continue;

            const sourceLineIds = Array.from(new Set(
                (Array.isArray(meta?.sourceLineIds) ? meta.sourceLineIds : [])
                    .map((lineId) => toText(lineId))
                    .filter(Boolean)
            ));

            const config = configByLineId.get(displayLineId);
            const throughServiceCategory = toText(meta?.throughServiceCategory) || toText(config?.category);
            const lineMeta = getLineMeta(displayLineId) || {};
            const requestKey = [
                displayLineId,
                sourceLineIds.join('|'),
                throughServiceCategory,
                targetTripKeys.join('|')
            ].join('##');
            if (seenRequestKeys.has(requestKey)) continue;
            seenRequestKeys.add(requestKey);

            out.push({
                lineId: displayLineId,
                lineName: toText(config?.lineName) || toText(lineMeta?.name) || displayLineId,
                sourceLineIds,
                targetTripKeys,
                throughServiceCategory,
                highlightColor: toText(config?.color) || toText(lineMeta?.color)
            });
        }

        return out;
    };

    const collectStationThroughPreviewHighlightIds = async (stationId, requests) => {
        const out = new Set();
        const sid = toText(stationId);
        if (sid) out.add(sid);

        const sourceLineIds = new Set();
        for (const request of Array.isArray(requests) ? requests : []) {
            for (const lineId of Array.isArray(request?.sourceLineIds) ? request.sourceLineIds : []) {
                const id = toText(lineId);
                if (id) sourceLineIds.add(id);
            }
        }

        for (const lineId of sourceLineIds) {
            try {
                const resolved = toText(await resolveStationIdForLine(lineId));
                if (resolved) out.add(resolved);
            } catch {
                // 单条来源线路解析失败不应取消整个站点直通预览。
            }
        }

        return Array.from(out);
    };

    const scheduleStationThroughPreview = async ({
        renderToken,
        stationId = ''
    } = {}) => {
        const sid = toText(stationId);
        if (!sid || renderToken !== stationRenderToken) return false;
        if (stationThroughPreviewSuppressed) return false;

        const requests = buildStationThroughPreviewRequests();
        if (!requests.length) {
            crossFeatureBridge.clearTripPathPreviewBySource(STATION_THROUGH_PREVIEW_SOURCE);
            return false;
        }

        const highlightStationIds = await collectStationThroughPreviewHighlightIds(sid, requests);
        if (stationThroughPreviewSuppressed || renderToken !== stationRenderToken || sid !== toText(currentStationId)) return false;

        try {
            await previewBranchesForLineRequests({
                requests,
                fitMode: 'commit',
                highlightStationIds,
                isStillActive: () => !stationThroughPreviewSuppressed && renderToken === stationRenderToken && sid === toText(currentStationId),
                previewSource: STATION_THROUGH_PREVIEW_SOURCE
            });
            return true;
        } catch {
            if (renderToken === stationRenderToken && sid === toText(currentStationId)) {
                crossFeatureBridge.clearTripPathPreviewBySource(STATION_THROUGH_PREVIEW_SOURCE);
            }
            return false;
        }
    };

    const restoreStationThroughPreviewDefault = () => {
        if (panelShell.isVisible?.() !== true) return false;
        if (stationThroughPreviewSuppressed) return false;
        const sid = toText(currentStationId);
        if (!sid) return false;
        scheduleStationThroughPreview({
            renderToken: stationRenderToken,
            stationId: sid
        }).catch(() => null);
        return true;
    };

    const buildGridHintsHtml = ({ typeHints, terminalHints, specialHints }) => buildPanelTimetableGridHintsHtml({
        typeHints,
        terminalHints,
        specialHints,
        escapeHtml,
        isNoMarkTypeName,
        toText
    });

    const buildGridTableHtmlForDirection = ({
        rowsForDir,
        typeHints,
        terminalHints,
        specialHints,
        expanded,
        nowMs,
        serviceDayStartMs,
        lineColor = '',
        serviceDayColorMode = ''
    }) => buildPanelTimetableGridHtmlForDirection({
        rowsForDir,
        typeHints,
        terminalHints,
        specialHints,
        expanded,
        nowMs,
        serviceDayStartMs,
        lineColor,
        serviceDayColorMode,
        serviceDayBoundaryHour: SERVICE_DAY_BOUNDARY_HOUR,
        buildTypeAbbr,
        deriveSpecialSp,
        escapeHtml,
        isNoMarkTypeName,
        resolveTrainTypeColorForTheme,
        toText
    });
    const findTripTarget = (target) => findPanelTripTarget(target);

    const buildTimetableRowsHtml = async ({
        lineId,
        stationId,
        sourceLineIds,
        allowedTripKeySet,
        throughServiceEntries,
        printStationName,
        printTitleText,
        timetableViewModeOverride
    }) => {
        const fallbackStationKey = toText(stationId);
        const allowedKeys = normalizeTimetableAllowedTripKeys(allowedTripKeySet, { toText });
        const normalizeThroughServiceEntriesForLine = (entries) => (
            (Array.isArray(entries) ? entries : [])
                .map((entry) => {
                    const allowedTripKeys = normalizeTimetableAllowedTripKeys(entry?.allowedTripKeys, { toText });
                    const sourceLineIdsForEntry = Array.isArray(entry?.sourceLineIds)
                        ? Array.from(new Set(entry.sourceLineIds.map((value) => toText(value)).filter(Boolean)))
                        : [];
                    return {
                        category: toText(entry?.category),
                        throughLineId: toText(entry?.throughLineId),
                        sourceLineIds: sourceLineIdsForEntry,
                        allowedTripKeys,
                        lineName: toText(entry?.lineName),
                        color: toText(entry?.color)
                    };
                })
                .filter((entry) => (
                    entry.category &&
                    entry.throughLineId &&
                    entry.sourceLineIds.length &&
                    entry.allowedTripKeys.size
                ))
        );
        const currentThroughServiceEntries = normalizeThroughServiceEntriesForLine(throughServiceEntries);
        const throughTripKeySets = currentThroughServiceEntries.map((entry) => entry.allowedTripKeys);
        const effectiveTimetableViewMode = toText(timetableViewModeOverride) || timetableViewMode;
        const effectivePrintStationName = toText(printStationName) || toText(currentStationNameZh);
        const effectivePrintTitleText = toText(printTitleText) || toText(titleMain.textContent);

        const [stationsIndex, trainTypesIndex, trainTypeColorIndex, alternateLineMembership] = await Promise.all([
            getStationsIndex(),
            getTrainTypesIndex(),
            getTrainTypeColorIndex(),
            getAlternateLineMembership()
        ]);
        const alternateSourcePlanIndex = buildAlternateTripSourceIndex(alternateLineMembership);

        const mergedSourceLineIds = normalizeTimetableSourceLineIds({ lineId, sourceLineIds, toText });
        if (!mergedSourceLineIds.length) {
            return {
                html: '',
                stationInfo: { typeItems: [] }
            };
        }

        const sourceRequests = [];
        const sourceRequestKeys = new Set();
        const addSourceRequest = ({ sourceLineId, stationId: sourceStationId, resolveStation = true }) => {
            const sourceId = toText(sourceLineId);
            const sourceStationKey = toText(sourceStationId);
            if (!sourceId) return;
            const key = `${sourceId}||${sourceStationKey}||${resolveStation ? 'resolve' : 'fixed'}`;
            if (sourceRequestKeys.has(key)) return;
            sourceRequestKeys.add(key);
            sourceRequests.push({
                sourceLineId: sourceId,
                stationId: sourceStationKey,
                resolveStation
            });
        };
        for (const sourceLineId of mergedSourceLineIds) {
            addSourceRequest({ sourceLineId, resolveStation: true });
        }

        const resolveStationKeyForSourceLine = async (sourceLineId) => {
            const sourceId = toText(sourceLineId);
            if (fallbackStationKey && sourceId && (
                fallbackStationKey === sourceId ||
                fallbackStationKey.startsWith(`${sourceId}.`)
            )) {
                return fallbackStationKey;
            }
            return resolveStationIdForLine(sourceId);
        };

        const sourceDatas = await Promise.all(sourceRequests.map(async (sourceRequest) => {
            const sourceLineId = toText(sourceRequest?.sourceLineId);
            const [resolvedStationId, data] = await Promise.all([
                sourceRequest?.resolveStation === false
                    ? Promise.resolve(toText(sourceRequest?.stationId))
                    : resolveStationKeyForSourceLine(sourceLineId),
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
        const serviceDayStartMs = getServiceDayStartMs(now);
        const displayServiceDayStartMs = getDisplayServiceDayStartMs(now, { timezoneMode: getTimezoneMode() });
        const lineMetaForTimetablePalette = getLineMeta?.(lineId) || {};
        const lineColorForTimetablePalette = toText(lineMetaForTimetablePalette?.color);
        const panelServiceDayColorMode = 'base';
        const currentPrintServiceDayColorMode = currentServiceDay === 'SaturdayHoliday' ? 'complementary' : 'base';
        const rows = [];
        const rowsForPreview = [];
        const rowsForThroughLabel = [];
        const rowsForPrintOriginal = [];
        const printRowsByServiceDayOriginal = new Map(PRINT_SERVICE_DAYS.map((day) => [day, []]));
        const throughDirectionCache = new Map();
        const allTypeColorByName = new Map();
        const stopTypeColorByName = new Map();
        const stopTypeNameSet = new Set();
        const typeCountByName = new Map();
        const typeIdsByName = new Map();
        const typeStopCountByName = new Map();
        const typeStopStationSetByName = new Map();
        const sg = await getStationGroupsIndex();
        const postprocessDebug = [];

        const createTypeSummaryState = () => ({
            allTypeColorByName: new Map(),
            stopTypeColorByName: new Map(),
            stopTypeNameSet: new Set(),
            typeCountByName: new Map(),
            typeIdsByName: new Map(),
            typeStopCountByName: new Map(),
            typeStopStationSetByName: new Map()
        });

        const lineTypeSummaryState = {
            allTypeColorByName,
            stopTypeColorByName,
            stopTypeNameSet,
            typeCountByName,
            typeIdsByName,
            typeStopCountByName,
            typeStopStationSetByName
        };

        const recordTypeSummaryForTrip = (summary, {
            stop,
            tt,
            typeColor,
            typeId,
            typeName
        } = {}) => {
            if (!summary) return;
            const name = toText(typeName);
            if (!name) return;

            summary.typeCountByName.set(name, (Number(summary.typeCountByName.get(name) || 0)) + 1);
            if (!summary.typeIdsByName.has(name)) summary.typeIdsByName.set(name, new Set());
            if (typeId) summary.typeIdsByName.get(name).add(typeId);
            if (!summary.allTypeColorByName.has(name)) {
                summary.allTypeColorByName.set(name, toText(typeColor));
            }

            if (Array.isArray(tt) && tt.length) {
                if (!summary.typeStopStationSetByName.has(name)) {
                    summary.typeStopStationSetByName.set(name, new Set());
                }
                const stopSet = summary.typeStopStationSetByName.get(name);
                for (const ttRow of tt) {
                    const sid = toText(ttRow?.s);
                    if (!sid) continue;
                    stopSet.add(sid);
                }
                summary.typeStopCountByName.set(name, stopSet.size);
            }

            if (stop) {
                summary.stopTypeNameSet.add(name);
                if (!summary.stopTypeColorByName.has(name) && toText(typeColor)) {
                    summary.stopTypeColorByName.set(name, toText(typeColor));
                }
            }
        };

        const collectRowsFromTripList = async ({
            tripList,
            sourceLineId,
            stationKey,
            serviceDay = currentServiceDay,
            trackTypeSummary,
            allowedTripKeys = allowedKeys,
            excludedTripKeySets = [],
            throughServiceEntry = null
        }) => {
            const out = [];
            const list = Array.isArray(tripList) ? tripList : [];
            const targetServiceDay = toText(serviceDay) || currentServiceDay;
            const activeAllowedKeys = allowedTripKeys instanceof Set ? allowedTripKeys : null;
            const activeExcludedTripKeySets = (Array.isArray(excludedTripKeySets) ? excludedTripKeySets : [])
                .filter((item) => item instanceof Set && item.size);
            const throughCategory = toText(throughServiceEntry?.category);
            const throughLineId = toText(throughServiceEntry?.throughLineId);
            const throughLineName = toText(throughServiceEntry?.lineName);
            for (const trip of list) {
            // 按 timetables 的 id 最后一段区分工作日/休息日
                const tripId = toText(trip?.id);
                const tripServiceDay = parseTripServiceDayFromId(tripId);
                if (tripServiceDay && tripServiceDay !== targetServiceDay) continue;

                const tripFilterKeys = buildTripFilterKeys(trip);
                if (activeAllowedKeys && activeAllowedKeys.size) {
                    const hit = tripFilterKeys.some((k) => activeAllowedKeys.has(k));
                    if (!hit) continue;
                }
                if (activeExcludedTripKeySets.some((keySet) => tripFilterKeys.some((key) => keySet.has(key)))) {
                    continue;
                }

                const typeId = toText(trip?.y);
                const isTypeExcludedForSummary = isExcludedLineType(lineId, typeId);
                const hasNm = hasPanelTripNmMarker(trip);
                let typeName = typeId ? (trainTypesIndex.get(typeId) || typeId) : '';
                let typeColor = typeId ? resolveTrainTypeColorForTheme(trainTypeColorIndex.get(typeId)) : '';


                const typeBaseName = resolveTypeBaseName(typeName);
                const tt = Array.isArray(trip?.tt) ? trip.tt : [];
                if (!tt.length) continue;

                const os = Array.isArray(trip?.os) ? trip.os : (trip?.os ? [trip.os] : []);
                const ds = Array.isArray(trip?.ds) ? trip.ds : (trip?.ds ? [trip.ds] : []);
                const ptRefs = Array.isArray(trip?.pt) ? trip.pt : (trip?.pt ? [trip.pt] : []);
                const ntRefs = Array.isArray(trip?.nt) ? trip.nt : (trip?.nt ? [trip.nt] : []);
                const hasPt = ptRefs.some((x) => !!toText(x));
                const hasNt = ntRefs.some((x) => !!toText(x));
                const tripRefIds = Array.from(new Set([
                    toText(trip?.realOriginId || trip?.id),
                    ...ptRefs.map((x) => toText(x)),
                    ...ntRefs.map((x) => toText(x))
                ].filter(Boolean)));
                const directionDisplayLineId = throughLineId || lineId;
                const tripDirectionCacheKey = `${toText(directionDisplayLineId)}||${toText(trip?.id) || toText(trip?.t)}`;
                let derivedThroughDirection = throughDirectionCache.get(tripDirectionCacheKey);
                if (derivedThroughDirection === undefined) {
                    derivedThroughDirection = await derivePanelTripDetailThroughServiceDirection({
                        trip,
                        displayLineId: directionDisplayLineId,
                        throughServiceConfigs: THROUGH_SERVICE_CONFIGS,
                        loadTripByRefId,
                        isTokenCurrent: () => true,
                        toText
                    });
                    throughDirectionCache.set(tripDirectionCacheKey, derivedThroughDirection);
                }
                const baseDir = toText(derivedThroughDirection || trip?.d);
                const dir = throughCategory
                    ? `through:${throughCategory}:${baseDir || 'Unknown'}`
                    : baseDir;

                const stop = tt.find((x) => {
                    const currentSid = toText(x?.s);
                    if (!currentSid) return false;

                    // 1. 首先判断 ID 是否完全一致（最快且最直接）
                    if (currentSid === stationKey) return true;

                    // 2. 如果不一致，再查换乘组索引
                    return sg?.get?.(currentSid)?.includes?.(stationKey);
                });

                if (trackTypeSummary && typeBaseName && !isTypeExcludedForSummary && !hasNm) {
                    const typeSummaryPayload = {
                        stop,
                        tt,
                        typeColor,
                        typeId,
                        typeName
                    };
                    recordTypeSummaryForTrip(lineTypeSummaryState, typeSummaryPayload);
                }

                if (!stop) continue;

                let arr = toText(stop?.a);
                let dep = toText(stop?.d);
                const stationHasNativeArrival = !!arr;
                const stationHasNativeDeparture = !!dep;

                const isOriginStation = sg?.get?.(trip.tt?.[0]?.s)?.includes?.(stationKey) || trip.tt?.[0]?.s === stationKey;
                const isTerminalStation = sg?.get?.(trip.tt.at(-1)?.s)?.includes?.(stationKey) || trip.tt.at(-1)?.s === stationKey;
                const terminalThroughLineIds = collectTerminalThroughLineIds({
                    isTerminalStation,
                    ntRefs,
                    sourceLineId,
                    displayLineId: lineId
                });

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

                const arrDisplay = arr ? buildDisplayTimeFromSourceHHMM(arr, serviceDayStartMs) : null;
                const depDisplay = dep ? buildDisplayTimeFromSourceHHMM(dep, serviceDayStartMs) : null;
                const displayTimeMs = (depDisplay?.ms || arrDisplay?.ms || timeMs);
                const displayTimeText = toHHMMForTimezone(displayTimeMs, { timezoneMode: getTimezoneMode() });

                out.push({
                    destName,
                    destId,
                    arr: arrDisplay?.text || null,
                    dep: depDisplay?.text || null,
                    arrPlus: !!arrDisplay?.isNextDaySegment,
                    depPlus: !!depDisplay?.isNextDaySegment,
                    timeMs,
                    serviceHourIndex: toPanelServiceHourIndex(displayTimeMs, displayServiceDayStartMs),
                    minuteLabel: toText(displayTimeText).slice(3, 5),
                    isPast: timeMs < now,
                    typeId,
                    typeName,
                    typeColor,
                    specialNames,
                    hasNm,
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
                    terminalThroughLineIds,
                    resolvedTerminalIdsCount: resolvedTerminalIds.length,
                    terminalIds: resolvedTerminalIds.length ? resolvedTerminalIds : (terminalIdForFilter ? [terminalIdForFilter] : []),
                    dir,
                    destNamesForDir,
                    showOriginLabel,
                    showTerminalLabel,
                    tripKey,
                    baseTripKey,
                    realOriginId: toText(trip?.realOriginId || trip?.id),
                    tripRefIds,
                    ptRefIds: ptRefs.map((x) => toText(x)).filter(Boolean),
                    ntRefIds: ntRefs.map((x) => toText(x)).filter(Boolean),
                    stationHasNativeArrival,
                    stationHasNativeDeparture,
                    stopCount: Array.isArray(tt) ? tt.length : null,
                    rawStopNames: (Array.isArray(tt) ? tt : []).map(x => stationsIndex?.idToNameZh?.get?.(toText(x?.s)) || toText(x?.s)),
                    sourceLineId: toText(sourceLineId),
                    throughServiceCategory: throughCategory,
                    throughLineId,
                    throughServiceName: throughLineName,
                    throughServiceSourceLineIds: Array.isArray(throughServiceEntry?.sourceLineIds)
                        ? throughServiceEntry.sourceLineIds.slice()
                        : []
                });
            }
            return out;
        };

        for (const sourceData of sourceDatas) {
            const sourceLineId = toText(sourceData?.sourceLineId);
            const stationKey = toText(sourceData?.stationKey);
            const rawList = Array.isArray(sourceData?.list) ? sourceData.list : [];
            if (!stationKey || !rawList.length) continue;
            const {
                displayList,
                postprocessDebug: currentPostprocessDebug,
                previewList
            } = await postprocessPanelTimetableTrips({
                alternateSourcePlanIndex,
                displayLineId: lineId,
                enableAlternateOverlay: PANEL_TIMETABLE_ALTERNATE_OVERLAY_ENABLED,
                loadTimetableForLineId,
                rawList,
                sourceLineId,
                stationGroupsIndex: sg,
                stationKey
            });
            if (currentPostprocessDebug) postprocessDebug.push(currentPostprocessDebug);

            const originalDisplayRows = await collectRowsFromTripList({
                tripList: displayList,
                sourceLineId,
                stationKey,
                serviceDay: currentServiceDay,
                trackTypeSummary: false
            });
            rowsForPrintOriginal.push(...originalDisplayRows);
            printRowsByServiceDayOriginal.get(currentServiceDay)?.push(...originalDisplayRows);

            for (const serviceDay of PRINT_SERVICE_DAYS) {
                if (serviceDay === currentServiceDay) continue;
                const originalPrintRows = await collectRowsFromTripList({
                    tripList: displayList,
                    sourceLineId,
                    stationKey,
                    serviceDay,
                    trackTypeSummary: false
                });
                printRowsByServiceDayOriginal.get(serviceDay)?.push(...originalPrintRows);
            }

            const displayRows = await collectRowsFromTripList({
                tripList: displayList,
                sourceLineId,
                stationKey,
                serviceDay: currentServiceDay,
                trackTypeSummary: true,
                excludedTripKeySets: throughTripKeySets
            });
            rows.push(...displayRows);

            const previewRows = await collectRowsFromTripList({
                tripList: previewList,
                sourceLineId,
                stationKey,
                serviceDay: currentServiceDay,
                trackTypeSummary: false,
                excludedTripKeySets: throughTripKeySets
            });
            rowsForPreview.push(...previewRows);

            const throughLabelRows = await collectRowsFromTripList({
                tripList: previewList,
                sourceLineId,
                stationKey,
                serviceDay: currentServiceDay,
                trackTypeSummary: false
            });
            rowsForThroughLabel.push(...throughLabelRows);

            for (const throughEntry of currentThroughServiceEntries) {
                if (!throughEntry.sourceLineIds.includes(sourceLineId)) continue;

                const throughDisplayRows = await collectRowsFromTripList({
                    tripList: displayList,
                    sourceLineId,
                    stationKey,
                    serviceDay: currentServiceDay,
                    trackTypeSummary: true,
                    allowedTripKeys: throughEntry.allowedTripKeys,
                    throughServiceEntry: throughEntry
                });
                rows.push(...throughDisplayRows);

                const throughPreviewRows = await collectRowsFromTripList({
                    tripList: previewList,
                    sourceLineId,
                    stationKey,
                    serviceDay: currentServiceDay,
                    trackTypeSummary: false,
                    allowedTripKeys: throughEntry.allowedTripKeys,
                    throughServiceEntry: throughEntry
                });
                rowsForPreview.push(...throughPreviewRows);
            }
        }

        const stationTypeSummaryItems = buildStationTypeSummaryItems({
            allTypeColorByName,
            currentLineId: lineId,
            stopTypeColorByName,
            stopTypeNameSet,
            typeCountByName,
            typeIdsByTypeName: typeIdsByName,
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
        rowsForPrintOriginal.splice(0, rowsForPrintOriginal.length, ...mergeDuplicateTimetableRows(rowsForPrintOriginal, { toText }));

        rows.sort((a, b) => a.timeMs - b.timeMs);
        rowsForPreview.sort((a, b) => a.timeMs - b.timeMs);
        rowsForThroughLabel.sort((a, b) => a.timeMs - b.timeMs);
        rowsForPrintOriginal.sort((a, b) => a.timeMs - b.timeMs);
        for (const serviceDay of PRINT_SERVICE_DAYS) {
            const originalDayRows = printRowsByServiceDayOriginal.get(serviceDay) || [];
            printRowsByServiceDayOriginal.set(
                serviceDay,
                mergeDuplicateTimetableRows(originalDayRows, { toText })
                    .sort((a, b) => a.timeMs - b.timeMs)
            );
        }

        // 统计每条线路的所有方向 d，并聚合/计数该方向下所有对应 ds 的中文名
        const DEST_NAME_MIN_COUNT = 0; // 方向下目的地名称至少出现x次才显示
        const directionStats = deriveDirectionStats({
            destNameMinCount: DEST_NAME_MIN_COUNT,
            rows,
            toText
        });
        const {
            anyDestAboveThreshold,
            dirToDestCounts
        } = directionStats;
        const dirOrder = sortPanelDirectionOrder(directionStats.dirOrder);
        const visibleDirOrder = focusedDirectionKey
            ? dirOrder.filter((dirKey) => focusedDirectionKey === makeLineDirKey(lineId, dirKey))
            : dirOrder.slice();
        const buildTypeSummaryItemsFromState = (summary) => buildStationTypeSummaryItems({
            allTypeColorByName: summary?.allTypeColorByName,
            currentLineId: lineId,
            stopTypeColorByName: summary?.stopTypeColorByName,
            stopTypeNameSet: summary?.stopTypeNameSet,
            typeCountByName: summary?.typeCountByName,
            typeIdsByTypeName: summary?.typeIdsByName,
            typeStopCountByName: summary?.typeStopCountByName
        });
        const buildTypeSummaryItemsFromDirectionRows = (rowsForDir) => {
            const summary = createTypeSummaryState();
            for (const row of (Array.isArray(rowsForDir) ? rowsForDir : [])) {
                const typeName = toText(row?.typeName);
                const typeId = toText(row?.typeId);
                if (!typeName || row?.hasNm || isExcludedLineType(lineId, typeId) || !resolveTypeBaseName(typeName)) {
                    continue;
                }

                summary.typeCountByName.set(typeName, (Number(summary.typeCountByName.get(typeName) || 0)) + 1);
                if (!summary.typeIdsByName.has(typeName)) summary.typeIdsByName.set(typeName, new Set());
                if (typeId) summary.typeIdsByName.get(typeName).add(typeId);
                if (!summary.allTypeColorByName.has(typeName)) {
                    summary.allTypeColorByName.set(typeName, toText(row?.typeColor));
                }
                summary.stopTypeNameSet.add(typeName);
                if (!summary.stopTypeColorByName.has(typeName) && toText(row?.typeColor)) {
                    summary.stopTypeColorByName.set(typeName, toText(row?.typeColor));
                }

                const stopCount = Number(row?.stopCount);
                if (Number.isFinite(stopCount) && stopCount > 0) {
                    const prev = Number(summary.typeStopCountByName.get(typeName));
                    summary.typeStopCountByName.set(
                        typeName,
                        Number.isFinite(prev) ? Math.min(prev, stopCount) : stopCount
                    );
                }
            }
            return buildTypeSummaryItemsFromState(summary);
        };
        const rowsByVisibleDir = new Map(visibleDirOrder.map((dirKey) => [
            dirKey,
            rows.filter((r) => (toText(r.dir) || 'Unknown') === dirKey)
        ]));
        const stationInfoTypePlacement = resolvePanelStationInfoTypePlacement({
            globalTypeItems: stationTypeSummaryItems,
            directionTypeGroups: visibleDirOrder.map((dirKey) => ({
                dirKey,
                typeItems: buildTypeSummaryItemsFromDirectionRows(rowsByVisibleDir.get(dirKey))
            }))
        });
        const displayStationTypeSummaryItems = stationInfoTypePlacement.mode === 'split'
            ? (stationInfoTypePlacement.primaryTypeItems || [])
            : stationTypeSummaryItems;
        const directionStationInfoTypeItemsByDirKey = new Map();
        if (stationInfoTypePlacement.mode === 'split' && visibleDirOrder.length === 2) {
            directionStationInfoTypeItemsByDirKey.set(visibleDirOrder[1], stationInfoTypePlacement.secondaryTypeItems || []);
        }

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

        const originalDirectionStats = deriveDirectionStats({
            destNameMinCount: DEST_NAME_MIN_COUNT,
            rows: rowsForPrintOriginal,
            toText
        });
        const buildOriginalDirectionLabel = (dirKey) => {
            const counts = originalDirectionStats.dirToDestCounts.get(dirKey) || new Map();
            const entries = Array.from(counts.entries());
            const names = entries
                .filter(([name, count]) => originalDirectionStats.anyDestAboveThreshold ? Number(count) >= DEST_NAME_MIN_COUNT : !!name)
                .sort((a, b) => {
                    const dc = Number(b[1]) - Number(a[1]);
                    if (dc) return dc;
                    return String(a[0]).localeCompare(String(b[0]));
                })
                .map(([name]) => toText(name))
                .filter(Boolean);
            return names.length ? names.slice(0, 1).join('，') : dirKey;
        };
        const printableStationInfoHtmlForExport = renderPrintableStationInfoHtml({
            typeItems: stationTypeSummaryItems
        });
        const buildOriginalPrintPayload = ({
            dirKey,
            serviceDay,
            rowsForDir
        } = {}) => {
            const printableRows = (Array.isArray(rowsForDir) ? rowsForDir : [])
                .map((r) => ({ ...(r || {}), isPast: false }));
            if (!printableRows.length) return null;

            const {
                typeHints: originalTypeHints,
                terminalHints: originalTerminalHints,
                specialHints: originalSpecialHints
            } = buildDirectionGridHints(printableRows, { currentLineId: lineId });
            const originalGridHintsHtml = effectiveTimetableViewMode === 'grid'
                ? buildGridHintsHtml({
                    typeHints: originalTypeHints,
                    terminalHints: originalTerminalHints,
                    specialHints: originalSpecialHints
                })
                : '';
            const originalListHtml = renderPanelPrintableTimetableListHtml({
                rows: printableRows,
                renderTime: renderTimeForPrint,
                resolveBadgeTextColor: resolvePanelBadgeTextColor
            });
            const originalGridHtml = buildGridTableHtmlForDirection({
                rowsForDir: printableRows,
                typeHints: originalTypeHints,
                terminalHints: originalTerminalHints,
                specialHints: originalSpecialHints,
                expanded: true,
                nowMs: now,
                serviceDayStartMs: displayServiceDayStartMs,
                lineColor: lineColorForTimetablePalette,
                serviceDayColorMode: serviceDay === 'SaturdayHoliday' ? 'complementary' : 'base'
            });

            return buildTimetablePrintPayload({
                companyLogoMap,
                currentStationName: effectivePrintStationName,
                getCompanyLogoSrc,
                gridHintsHtml: originalGridHintsHtml,
                gridHtml: originalGridHtml,
                lineId,
                lineMeta: getLineMeta?.(lineId) || {},
                listHtml: originalListHtml,
                dirKey,
                dirLabel: buildOriginalDirectionLabel(dirKey),
                serviceDay,
                stationInfoHtml: printableStationInfoHtmlForExport,
                timetableViewMode: effectiveTimetableViewMode,
                titleText: effectivePrintTitleText,
                toText
            });
        };
        const originalLinePrintPayloads = originalDirectionStats.dirOrder
            .map((dirKey) => {
                const currentRowsForDir = rowsForPrintOriginal
                    .filter((r) => (toText(r.dir) || 'Unknown') === dirKey);
                const currentPayload = buildOriginalPrintPayload({
                    dirKey,
                    serviceDay: currentServiceDay,
                    rowsForDir: currentRowsForDir
                });
                if (!currentPayload) return null;
                return {
                    ...currentPayload,
                    serviceDayVariants: PRINT_SERVICE_DAYS
                        .map((serviceDay) => buildOriginalPrintPayload({
                            dirKey,
                            serviceDay,
                            rowsForDir: (printRowsByServiceDayOriginal.get(serviceDay) || [])
                                .filter((r) => (toText(r.dir) || 'Unknown') === dirKey)
                        }))
                        .filter(Boolean)
                };
            })
            .filter(Boolean);
        if (originalLinePrintPayloads.length) {
            linePrintPayloadsByLineId.set(toText(lineId), { dirs: originalLinePrintPayloads });
        } else {
            linePrintPayloadsByLineId.delete(toText(lineId));
        }

        // 分组显示：默认显示所有方向；方向内默认展示 3 条未来班次
        let html = '';
        const directionDebug = [];
        for (const dirKey of visibleDirOrder) {
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
            const focused = focusedDirectionKey === lineDirKey;
            const expanded = focused || isDirExpanded(lineId, dirKey);
            const tri = expanded ? '▾' : '▸';

            const rowsForDir = rowsByVisibleDir.get(dirKey) || [];
            const throughServiceCategory = toText(rowsForDir.find((row) => toText(row?.throughServiceCategory))?.throughServiceCategory);
            const isThroughServiceDirection = !!throughServiceCategory;
            const { typeHints, terminalHints, specialHints } = buildDirectionGridHints(rowsForDir, { currentLineId: lineId });
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
            const previewRowsForMeta = filteredRowsForDirPreview.length ? filteredRowsForDirPreview : rowsForDirPreview;
            const rowsForDirThroughLabel = isThroughServiceDirection
                ? []
                : rowsForThroughLabel.filter((r) => (toText(r.dir) || 'Unknown') === dirKey);
            const filteredRowsForDirThroughLabel = isThroughServiceDirection
                ? []
                : filterRowsByDirFilterState(rowsForDirThroughLabel, state);

            const filteredTripKeys = Array.from(new Set(
                filteredRowsForDirPreview
                    .flatMap((r) => [toText(r.tripKey), toText(r.baseTripKey)])
                    .filter(Boolean)
            ));
            dirFilteredTripKeysByKey.set(lineDirKey, filteredTripKeys);

            const uniqueIds = (arr) => Array.from(new Set((Array.isArray(arr) ? arr : []).map((x) => toText(x)).filter(Boolean)));
            const getDirPreviewOriginIds = (row) => {
                if (row?.throughEndpoints?.originIds?.length) return row.throughEndpoints.originIds;
                if (row?.throughEndpoints?.originId) return [row.throughEndpoints.originId];
                return [row.originId];
            };
            const getDirPreviewTerminalIds = (row) => {
                if (row?.throughEndpoints?.terminalIds?.length) return row.throughEndpoints.terminalIds;
                if (row?.throughEndpoints?.terminalId) return [row.throughEndpoints.terminalId];
                const ids = Array.isArray(row?.terminalIds) ? row.terminalIds : [];
                return ids.length ? ids : [row.terminalId || row.destId];
            };
            dirPreviewMetaByKey.set(lineDirKey, {
                lineId: toText(lineId),
                throughServiceCategory,
                sourceLineIds: uniqueIds(previewRowsForMeta.flatMap((r) => (
                    Array.isArray(r?.throughServiceSourceLineIds) ? r.throughServiceSourceLineIds : []
                ))),
                originStationIds: uniqueIds(previewRowsForMeta.flatMap(getDirPreviewOriginIds)),
                terminalStationIds: uniqueIds(previewRowsForMeta.flatMap(getDirPreviewTerminalIds)),
                endpointLabelCounts: buildDirectionEndpointLabelCounts(previewRowsForMeta, {
                    getOriginStationIds: getDirPreviewOriginIds,
                    getTerminalStationIds: getDirPreviewTerminalIds,
                    toText
                })
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

            const visibleDirFallback = (() => {
                if (!dirKey.startsWith('through:')) return dirKey;
                const parts = dirKey.split(':').map((part) => toText(part));
                return parts[2] || dirKey;
            })();
            const label = labelEntries.length ? labelEntries.join('，') : (filteredNames.length ? filteredNames.slice(0, 1).join('，') : visibleDirFallback);
            const throughLabel = isThroughServiceDirection
                ? ''
                : buildDirectionThroughLabel(
                    filteredRowsForDirThroughLabel.length ? filteredRowsForDirThroughLabel : rowsForDirThroughLabel
                );
            const throughServiceDirectionName = isThroughServiceDirection
                ? resolveThroughServicePanelDirectionDisplayName({
                    category: throughServiceCategory,
                    dirKey,
                    rowsForDir,
                    stationId: currentStationId
                })
                : '';

            directionDebug.push({
                dirKey,
                dirLabel: label,
                throughLabel,
                throughServiceDirectionName,
                typeHints,
                terminalHints,
                specialHints
            });

            const timetableViewClass = effectiveTimetableViewMode === 'grid' ? 'panel-timetable-view-grid' : 'panel-timetable-view-list';
            const gridHintsHtml = effectiveTimetableViewMode === 'grid' && expanded
                ? buildGridHintsHtml({ typeHints, terminalHints, specialHints })
                : '';
            const rowsForListView = filteredRowsForDir;
            const future = rowsForListView.filter((r) => !r.isPast);
            const visible = expanded ? rowsForListView : future.slice(0, 3);

            const originalPrintRowsForDir = isThroughServiceDirection
                ? []
                : rowsForPrintOriginal
                    .filter((r) => (toText(r.dir) || 'Unknown') === dirKey)
                    .map((r) => ({ ...(r || {}), isPast: false }));
            const {
                typeHints: originalPrintTypeHints,
                terminalHints: originalPrintTerminalHints,
                specialHints: originalPrintSpecialHints
            } = buildDirectionGridHints(originalPrintRowsForDir, { currentLineId: lineId });
            const originalPrintGridHintsHtml = effectiveTimetableViewMode === 'grid'
                ? buildGridHintsHtml({
                    typeHints: originalPrintTypeHints,
                    terminalHints: originalPrintTerminalHints,
                    specialHints: originalPrintSpecialHints
                })
                : '';
            const printableListHtml = renderPanelPrintableTimetableListHtml({
                rows: originalPrintRowsForDir,
                renderTime: renderTimeForPrint,
                resolveBadgeTextColor: resolvePanelBadgeTextColor
            });
            const printableGridHtml = buildGridTableHtmlForDirection({
                rowsForDir: originalPrintRowsForDir,
                typeHints: originalPrintTypeHints,
                terminalHints: originalPrintTerminalHints,
                specialHints: originalPrintSpecialHints,
                expanded: true,
                nowMs: now,
                serviceDayStartMs: displayServiceDayStartMs,
                lineColor: lineColorForTimetablePalette,
                serviceDayColorMode: currentPrintServiceDayColorMode
            });
            const printableStationInfoHtml = renderPrintableStationInfoHtml({
                typeItems: stationTypeSummaryItems
            });

            const buildPrintPayloadForServiceDay = (serviceDay) => {
                const serviceRowsForDir = (printRowsByServiceDayOriginal.get(serviceDay) || [])
                    .filter((r) => (toText(r.dir) || 'Unknown') === dirKey);
                const {
                    typeHints: serviceTypeHints,
                    terminalHints: serviceTerminalHints,
                    specialHints: serviceSpecialHints
                } = buildDirectionGridHints(serviceRowsForDir, { currentLineId: lineId });
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
                    serviceDayStartMs: displayServiceDayStartMs,
                    lineColor: lineColorForTimetablePalette,
                    serviceDayColorMode: serviceDay === 'SaturdayHoliday' ? 'complementary' : 'base'
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
                    stationInfoHtml: printableStationInfoHtml,
                    timetableViewMode: effectiveTimetableViewMode,
                    titleText: effectivePrintTitleText,
                    toText
                });
            };

            const currentPrintPayload = buildTimetablePrintPayload({
                companyLogoMap,
                currentStationName: effectivePrintStationName,
                getCompanyLogoSrc,
                gridHintsHtml: originalPrintGridHintsHtml,
                gridHtml: printableGridHtml,
                lineId,
                lineMeta: getLineMeta?.(lineId) || {},
                listHtml: printableListHtml,
                dirKey,
                dirLabel: label,
                serviceDay: currentServiceDay,
                stationInfoHtml: printableStationInfoHtml,
                timetableViewMode: effectiveTimetableViewMode,
                titleText: effectivePrintTitleText,
                toText
            });
            if (isThroughServiceDirection) {
                dirPrintPayloadByKey.delete(lineDirKey);
            } else {
                dirPrintPayloadByKey.set(lineDirKey, {
                    ...currentPrintPayload,
                    serviceDayVariants: PRINT_SERVICE_DAYS.map((serviceDay) => buildPrintPayloadForServiceDay(serviceDay))
                });
            }

            const timetableHtml = effectiveTimetableViewMode === 'grid'
                ? buildGridTableHtmlForDirection({
                    rowsForDir: filteredRowsForDir,
                    typeHints,
                    terminalHints,
                    specialHints,
                    expanded,
                    nowMs: now,
                    serviceDayStartMs: displayServiceDayStartMs,
                    lineColor: lineColorForTimetablePalette,
                    serviceDayColorMode: panelServiceDayColorMode
                })
                : renderPanelTimetableListHtml({
                    rows: visible,
                    renderTime,
                    resolveBadgeTextColor: resolvePanelBadgeTextColor
                });
            const focusIconName = focused ? 'fullscreen-exit.svg' : 'fs.svg';
            const focusButtonLabel = focused ? '退出方向聚焦' : '只看该方向班次';
            const directionStationInfoHtml = directionStationInfoTypeItemsByDirKey.has(dirKey)
                ? renderDirectionStationInfoHtml(directionStationInfoTypeItemsByDirKey.get(dirKey))
                : '';

            html += `
                ${directionStationInfoHtml}
                <div class="panel-dir">
                    <div class="panel-dir-header" data-dir-toggle="1" data-dir-key="${escapeHtml(dirKey)}">
                        <span class="panel-dir-title">
                            ${throughServiceDirectionName ? `<span class="panel-dir-through-service-name">${escapeHtml(throughServiceDirectionName)}</span>` : ''}
                            <span class="panel-dir-main">
                                <span class="panel-dir-prefix" aria-hidden="true">往</span>
                                <span class="panel-dir-marquee" aria-label="往 ${escapeHtml(label)} 方向">
                                    <span class="panel-dir-marquee-inner">${escapeHtml(label)}</span>
                                </span>
                                <span class="panel-dir-suffix" aria-hidden="true">方向</span>
                            </span>
                            ${throughLabel ? `<span class="panel-dir-through">${escapeHtml(throughLabel)}</span>` : ''}
                        </span>
                        <span class="panel-dir-actions">
                            <span class="panel-dir-triangle" aria-hidden="true">${tri}</span>
                            ${isLoopLine(lineId) ? '' : `<button type="button" class="panel-dir-filter-btn" data-dir-filter-btn="1" data-line-id="${escapeHtml(lineId)}" data-dir-key="${escapeHtml(dirKey)}" aria-label="筛选">
                                <img class="panel-dir-filter-icon" alt="" src="${escapeHtml(getPreferredCachedImageSrc(getIconCandidates('filter.svg'), { cacheKey: 'icon:filter.svg' }))}" />
                            </button>`}
                            ${effectiveTimetableViewMode === 'grid' ? `<button type="button" class="panel-dir-print-btn" data-dir-print-btn="1" data-line-id="${escapeHtml(lineId)}" data-dir-key="${escapeHtml(dirKey)}" aria-label="打印时刻表">
                                <img class="panel-dir-print-icon" alt="" src="${escapeHtml(getPreferredCachedImageSrc(getIconCandidates('print.svg'), { cacheKey: 'icon:print.svg' }))}" />
                            </button>` : ''}
                            <button type="button" class="panel-dir-focus-btn${focused ? ' is-active' : ''}" data-dir-focus-btn="1" data-line-id="${escapeHtml(lineId)}" data-dir-key="${escapeHtml(dirKey)}" aria-label="${escapeHtml(focusButtonLabel)}" aria-pressed="${focused ? 'true' : 'false'}">
                                <img class="panel-dir-focus-icon" alt="" src="${escapeHtml(getPreferredCachedImageSrc(getIconCandidates(focusIconName), { cacheKey: `icon:${focusIconName}` }))}" data-focus-icon="${escapeHtml(focusIconName)}" />
                            </button>
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
            postprocess: postprocessDebug,
            directions: directionDebug
        });

        return {
            html,
            stationInfo: {
                typeItems: displayStationTypeSummaryItems
            }
        };
    };

    const formatStationTypeBadgeLabel = (typeNameRaw) => {
        const name = toText(typeNameRaw);
        if (!name) return '';
        if (/\s/.test(name)) return name;
        const chars = Array.from(name);
        if (chars.length !== 2) return name;
        return `${chars[0]}     ${chars[1]}`;
    };

    const shouldUseSmallStationTypeBadgeFont = (typeNameRaw) => {
        const plain = toText(typeNameRaw).replace(/\s+/g, '');
        if (!plain) return false;
        return Array.from(plain).length > 4;
    };

    const normalizeStationInfoTypeItems = (typeItemsRaw) => (
        Array.isArray(typeItemsRaw)
            ? typeItemsRaw
                .map((item) => ({
                    name: toText(item?.name),
                    isStop: item?.isStop === true,
                    color: toText(item?.color)
                }))
                .filter((item) => item.name)
            : []
    );

    const renderLiveStationInfoTypesHtml = (typeItemsRaw) => (
        normalizeStationInfoTypeItems(typeItemsRaw).map((item) => {
            const baseStopClass = item.isStop && isNoMarkTypeName(item.name) ? ' is-base-stop' : '';
            const cls = item.isStop ? `panel-station-info-type is-stop${baseStopClass}` : 'panel-station-info-type is-pass';
            const bgColor = item.isStop ? (toText(item.color) || '#555') : '#ddd';
            const smallFontStyle = shouldUseSmallStationTypeBadgeFont(item.name) ? ';font-size:10px' : '';
            const style = ` style="background-color:${escapeHtml(bgColor)}${smallFontStyle}"`;
            const label = formatStationTypeBadgeLabel(item.name);
            return `<span class="${cls}"${style}>${escapeHtml(label)}</span>`;
        }).join('')
    );

    const renderDirectionStationInfoHtml = (typeItemsRaw) => {
        const typesHtml = renderLiveStationInfoTypesHtml(typeItemsRaw);
        if (!typesHtml) return '';
        return `
            <div class="panel-station-info panel-station-info-between-directions" data-station-info-direction-types="1">
                <span class="panel-station-info-left"></span>
                <span class="panel-station-info-types" data-station-type-summary="1">${typesHtml}</span>
            </div>
        `;
    };

    const renderPrintableStationInfoHtml = (stationInfo) => {
        const typeItems = normalizeStationInfoTypeItems(stationInfo?.typeItems);

        if (!typeItems.length) return '';

        const typesHtml = typeItems.map((item) => {
            const baseStopClass = item.isStop && isNoMarkTypeName(item.name) ? ' is-base-stop' : '';
            const cls = `panel-station-info-type${item.isStop ? ` is-stop${baseStopClass}` : ''}`;
            const bgColor = toText(item.color) || '#555';
            const smallFontStyle = shouldUseSmallStationTypeBadgeFont(item.name) ? ';font-size:10px' : '';
            const style = ` style="background-color:${escapeHtml(bgColor)}${smallFontStyle}"`;
            const label = formatStationTypeBadgeLabel(item.name);
            return `<span class="${cls}"${style}>${escapeHtml(label)}</span>`;
        }).join('');

        return `
            <div class="panel-station-info" data-station-info="1">
                <span class="panel-station-info-left"></span>
                <span class="panel-station-info-types" data-station-type-summary="1">${typesHtml}</span>
            </div>
        `;
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

        const typeItems = normalizeStationInfoTypeItems(stationInfo?.typeItems);

        if (!typeItems.length) {
            typesEl.innerHTML = '';
            return;
        }

        const html = typeItems.map((item) => {
            const baseStopClass = item.isStop && isNoMarkTypeName(item.name) ? ' is-base-stop' : '';
            const cls = item.isStop ? `panel-station-info-type is-stop${baseStopClass}` : 'panel-station-info-type is-pass';
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
        linePrintPayloadsByLineId: new Map(linePrintPayloadsByLineId),
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
        restoreMap(linePrintPayloadsByLineId, snapshot?.linePrintPayloadsByLineId);
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
            linePrintPayloadsByLineId,
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
            allowedTripKeySet: temporaryPanelAllowedTripKeysByDisplayLineId.get(lineId) || null,
            throughServiceEntries: throughServiceDirectionsByEntityLineId.get(lineId) || []
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
            const arrDisplay = arrParsed ? buildDisplayTimeFromSourceHHMM(arr, serviceDayStartMs) : null;
            const depDisplay = depParsed ? buildDisplayTimeFromSourceHHMM(dep, serviceDayStartMs) : null;

            out.push({
                stationId,
                stationName: toText(s?.stationName),
                arr: arrDisplay?.text || null,
                dep: depDisplay?.text || null,
                arrPlus: !!arrDisplay?.isNextDaySegment,
                depPlus: !!depDisplay?.isNextDaySegment,
                timeMs,
                isPast: false,
                showOriginLabel: isOriginStop,
                showTerminalLabel: isTerminalStop
            });
        }
        return out;
    };

    const mergeStops = (base, next) => {
        return mergePanelTripDetailBoundaryStops(base, next, {
            getStationAKey,
            toText
        });
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
    const buildTripDetailThroughLineHeader = ({ ptChain, trip, ntChain }) => {
        const orderedTrips = [
            ...(Array.isArray(ptChain) ? ptChain.slice().reverse() : []),
            trip,
            ...(Array.isArray(ntChain) ? ntChain : [])
        ];
        const lines = [];
        const seen = new Set();
        for (const item of orderedTrips) {
            const lineId = getTripLineId(item);
            const descriptor = buildLineDescriptor(lineId);
            const name = toText(descriptor?.text || lineId);
            if (!name || seen.has(name)) continue;
            seen.add(name);
            lines.push({
                color: toText(descriptor?.color),
                name
            });
        }
        if (!lines.length) {
            return { html: '', text: '' };
        }
        if (lines.length === 1) {
            const [line] = lines;
            const style = line.color ? ` style="color:${escapeHtml(line.color)}"` : '';
            return {
                html: `<span class="panel-trip-detail-through-line"${style}>${escapeHtml(line.name)}</span>`,
                text: line.name
            };
        }
        const text = `${lines.map((item) => item.name).join('·')} 直通`;
        const lineHtml = lines.map((item) => {
            const style = item.color ? ` style="color:${escapeHtml(item.color)}"` : '';
            return `<span class="panel-trip-detail-through-line"${style}>${escapeHtml(item.name)}</span>`;
        }).join('<span class="panel-trip-detail-through-sep">·</span>');
        return {
            html: `${lineHtml}<span class="panel-trip-detail-through-suffix"> 直通</span>`,
            text
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

    const setTripDetailInteractive = (enabled) => {
        tripDetailStationJumpEnabled = enabled === true;
        tripDetailRoot.toggleAttribute('data-panel-station-jump-enabled', tripDetailStationJumpEnabled);
    };

    const renderTripDetail = async ({ lineId, tripKey, clientX, clientY, pinned, fitMode }) => {
        const token = ++tripDetailToken;
        tripDetailPinned = !!pinned;
        setTripDetailInteractive(!!pinned || isMobilePanelPresentation());
        clearTripDetailHideTimer();
        clearTripDetailStationIndicator();
        tripDetailStationPointerIntent = null;

        const openedMobileTripDetailEarly = !!pinned && isMobilePanelPresentation();
        if (openedMobileTripDetailEarly) {
            openMobileTripDetail({ lineId, tripKey });
            tripDetailView.render({
                titleHtml: '<div class="panel-trip-detail-title-main">加载中</div>',
                bodyHtml: '<div class="panel-timetable-empty">正在加载班次详情</div>',
                clientY,
                mobileHeader: {
                    main: '加载中',
                    sub: '正在加载班次详情'
                },
                presentation: panelPresentation
            });
        }

        const trip = await findTripByKey(lineId, tripKey);
        if (token !== tripDetailToken) return;
        if (!trip) {
            if (openedMobileTripDetailEarly) {
                hideTripDetail();
            } else {
                tripDetailView.hide();
            }
            return;
        }

        const tripLineId = getTripLineId(trip) || toText(lineId);
        const getTripStationAKey = (stationId) => getStationAKeyForLine(tripLineId, stationId);
        const allowEndpointAKeyFallback = !shouldUseExactTripDetailEndpointIds(tripLineId);

        await showTripCurrentStationHint({ lineId: tripLineId, token });
        if (token !== tripDetailToken) return;

        const now = getDisplayNowMs();
        const serviceDayStartMs = getServiceDayStartMs(now);

        const [stationsIndex, trainTypesIndex, trainTypeColorIndex, alternateLineMembership] = await Promise.all([
            getStationsIndex(),
            getTrainTypesIndex(),
            getTrainTypeColorIndex(),
            getAlternateLineMembership()
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
                    firstMain.arr = parsed ? toHHMMForTimezone(parsed.ms, { timezoneMode: getTimezoneMode() }) : ptArr;
                    firstMain.arrPlus = !!parsed?.isNextDaySegment;
                    firstMain.timeMs = firstMain.timeMs || parsed?.ms || null;
                }
            }

            const ntRefId = toText(ntRefs?.[0]);
            if (ntRefId && lastMain) {
                const ntDep = await getNtFirstDepartTime(ntRefId);
                if (token !== tripDetailToken) return;
                const parsed = ntDep ? parseHHMMToServiceDayMs(ntDep, serviceDayStartMs) : null;
                if (ntDep) {
                    lastMain.dep = parsed ? toHHMMForTimezone(parsed.ms, { timezoneMode: getTimezoneMode() }) : ntDep;
                    lastMain.depPlus = !!parsed?.isNextDaySegment;
                    lastMain.timeMs = lastMain.timeMs || parsed?.ms || null;
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
        const segmentsWithTransferDisplay = await applyPanelTripDetailAlternateBodyTransferDisplay({
            alternateLineMembership,
            getLineMeta,
            segments: segmentsWithPast,
            stationsIndex,
            toText,
            resolveTransferDisplayByStationIds: (stationIds) => buildTripDetailTransferDisplayByStationId({
                stationIds,
                currentLineId: tripLineId,
                escapeHtml,
                getLineMeta,
                getStationCode: (stationId) => toText(stationsIndex?.idToCode?.get?.(stationId) || ''),
                getStationGroupsIndex,
                toText
            })
        });
        if (token !== tripDetailToken) return;
        const markRowsPastByCurrentStation = (rowsInput, fallbackPast = false) => markRowsPastByStation({
            currentStationId: stationIdForLine,
            fallbackPast,
            getStationAKey: getTripStationAKey,
            rows: rowsInput,
            toText
        });

        const tripDetailTitleHtml = await buildPanelTripDetailTitleHtml({
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
        const tripDetailMobileHeader = await buildPanelTripDetailMobileHeaderViewModel({
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
            toText
        });
        if (token !== tripDetailToken) return;
        const tripDetailThroughLineHeader = buildTripDetailThroughLineHeader({
            ptChain,
            trip,
            ntChain
        });
        const currentLineDesc = buildLineDescriptor(getTripLineId(trip) || lineId);
        const typeName = getTripTypeName(trip, trainTypesIndex);
        const typeColor = getTripTypeColor(trip, trainTypeColorIndex);

        const renderStopRow = (s) => renderPanelTripDetailAlternateBodyStopRow({ lineId, renderPanelTripDetailStopRowHtml, renderTripDetailMomentHtml, stationsIndex, stop: s, toText, tripLineId });

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
        const activeBranchLanesForBody = applyPanelTripDetailAlternateBodyDisplayToLanes({ alternateLineMembership, buildLineDescriptor, getLineMeta, lanes: activeBranchLanes, stationsIndex, toText });
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
        const useBranchGridLayout = branchCount >= 2;
        let rowsHtml = '';
        const {
            tripDetailTableClass,
            tripDetailTableInlineStyle,
            headerHtml,
            spacerHtml,
            totalCols,
            primaryTimeColStart,
            firstBranchMarkerCol,
            transferColStart,
            stationColStart
        } = buildPanelTripDetailLayoutShell({
            useBranchGridLayout,
            branchCount
        });

        if (!useBranchGridLayout) {
            const bodyDisplaySegmentBlocks = splitPanelTripDetailAlternateBodySegmentsByDisplayLine({ segments: segmentsWithTransferDisplay, toText });
            const segmentBlocks = buildPanelTripDetailSegmentBlocks({
                segmentsWithPast: bodyDisplaySegmentBlocks,
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
                activeBranchLanes: activeBranchLanesForBody,
                buildLineDescriptor,
                currentLineDesc,
                fallbackLineId: lineId,
                pickPrimaryLaneIndex,
                segmentsWithPast: segmentsWithTransferDisplay,
                toText,
                tripLineId: getTripLineId(trip)
            });
            const buildThroughBranchDescriptor = (descriptor = null, fallbackLineId = '') => {
                if (!throughCategoryLabel) return descriptor;
                return {
                    ...(descriptor || {}),
                    lineId: toText(descriptor?.lineId || fallbackLineId),
                    text: throughCategoryLabel,
                    name: throughCategoryLabel,
                    lineName: throughCategoryLabel,
                    color: throughCategoryColor || toText(descriptor?.color)
                };
            };
            const applyThroughCategoryIdentityToBranchLane = (lane = null) => {
                if (!throughCategoryLabel || !lane) return lane;
                const laneDescriptor = buildThroughBranchDescriptor(lane.descriptor, lane.lineId);
                return {
                    ...lane,
                    descriptor: laneDescriptor,
                    typeColor: throughCategoryColor || toText(lane.typeColor),
                    rows: (Array.isArray(lane.rows) ? lane.rows : []).map((row) => ({
                        ...row,
                        displayLineDescriptor: buildThroughBranchDescriptor(
                            row?.displayLineDescriptor || lane.descriptor,
                            row?.displayLineId || lane.lineId
                        ),
                        displayLineColor: throughCategoryColor || toText(row?.displayLineColor),
                        lineColor: throughCategoryColor || toText(row?.lineColor)
                    }))
                };
            };
            const applyThroughCategoryIdentityToBranchRows = (rows = [], descriptor = null, fallbackLineId = '') => (
                !throughCategoryLabel
                    ? rows
                    : (Array.isArray(rows) ? rows : []).map((row) => ({
                        ...row,
                        displayLineDescriptor: buildThroughBranchDescriptor(
                            row?.displayLineDescriptor || descriptor,
                            row?.displayLineId || fallbackLineId
                        ),
                        displayLineColor: throughCategoryColor || toText(row?.displayLineColor),
                        lineColor: throughCategoryColor || toText(row?.lineColor)
                    }))
            );
            const displayMainDescriptor = buildThroughBranchDescriptor(mainDescriptor, getTripLineId(trip) || lineId);
            const displayMainRows = applyThroughCategoryIdentityToBranchRows(mainRows, mainDescriptor, getTripLineId(trip) || lineId);
            const displayPrimaryLane = applyThroughCategoryIdentityToBranchLane(primaryLane);
            const displaySecondaryLanes = throughCategoryLabel
                ? secondaryLanes.map((lane) => applyThroughCategoryIdentityToBranchLane(lane))
                : secondaryLanes;
            rowsHtml += renderPanelTripDetailBranchGridRows({
                branchMode,
                buildTimetableStationText,
                escapeHtml,
                firstBranchMarkerCol,
                mainDescriptor: displayMainDescriptor,
                mainRows: displayMainRows,
                markRowsPastByCurrentStation,
                primaryLane: displayPrimaryLane,
                primaryTimeColStart,
                stationColStart,
                transferColStart,
                renderPanelTripDetailBranchBreakRow,
                renderPanelTripDetailGridLaneBlock,
                renderPanelTripDetailGridMarkerCell,
                renderPanelTripDetailStationCellHtml,
                renderTimetableNoteRowHtml,
                renderTripDetailMomentHtml,
                resolveStationCode: (stationId) => toText(stationsIndex?.idToCode?.get?.(stationId) || ''),
                secondaryLanes: displaySecondaryLanes,
                toText,
                totalCols,
                typeColor: throughCategoryColor || typeColor,
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

        const tripDetailBodyHtml = `
            <div class="${tripDetailTableClass}"${tripDetailTableInlineStyle}>
                ${headerHtml}
                ${rowsHtml}
                ${spacerHtml}
            </div>
        `;

        if (pinned && !openedMobileTripDetailEarly) {
            openMobileTripDetail({ lineId: tripLineId || lineId, tripKey });
        }
        tripDetailView.render({
            titleHtml: tripDetailTitleHtml,
            bodyHtml: tripDetailBodyHtml,
            clientY,
            mobileHeader: {
                main: tripDetailMobileHeader.routeText,
                sub: tripDetailThroughLineHeader.text,
                subHtml: tripDetailThroughLineHeader.html
            },
            presentation: panelPresentation,
            scrollToCurrentStation: true
        });
        scheduleMarqueeApply(tripDetailRoot);
        scheduleMarqueeApply(header);
    };

    const hideTripDetail = ({
        restoreMobileLine = true,
        restoreStationThroughPreview = restoreMobileLine
    } = {}) => {
        clearTripHighlightTimer();
        tripPreviewScheduler.clearApplied();
        unlockTripPreview();
        tripDetailToken += 1;
        setTripDetailInteractive(false);
        tripDetailStationPointerIntent = null;
        clearTripDetailHideTimer();
        hideTripCurrentStationHint();
        clearTripDetailStationIndicator();
        tripDetailView.hide();
        try {
            onTripClear?.();
        } catch {
            // ignore
        }
        if (restoreMobileLine) {
            restoreMobileLineAfterTripDetail();
        }
        if (restoreStationThroughPreview) {
            restoreStationThroughPreviewDefault();
        }
    };

    const clearUnpinnedTripPreview = () => {
        if (tripLocked || tripDetailPinned) return;
        clearTripHighlightTimer();
        tripPreviewScheduler.clearApplied();
        try {
            onTripClear?.();
        } catch {
            // ignore
        }
        restoreStationThroughPreviewDefault();
    };

    const panelMarqueeController = createPanelMarqueeController({ maxAnimations: 30 });
    const scheduleMarqueeApply = panelMarqueeController.schedule;

    const renderAllTimetables = async () => {
        closeDirFilterPopover();
        syncDirectionFocusVisibility();
        const token = ++timetableRenderToken;
        const stationRenderTokenAtStart = stationRenderToken;
        const stationId = toText(currentStationId);
        dirFilterRowsByKey.clear();
        dirFilteredTripKeysByKey.clear();
        dirPreviewMetaByKey.clear();
        if (pendingGridDataDebugLog) gridDataDebugByLineId.clear();
        const lineEls = Array.from(body.querySelectorAll('[data-line-id]'));
        for (const el of lineEls) {
            await renderTimetableForLineEl(el, stationId, token);
            if (
                token !== timetableRenderToken
                || stationRenderTokenAtStart !== stationRenderToken
                || stationId !== toText(currentStationId)
            ) {
                return;
            }
        }
        syncDirectionFocusStickyMetrics();
        scheduleStationThroughPreview({
            renderToken: stationRenderTokenAtStart,
            stationId
        }).catch(() => null);

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
        clearPinnedDirPreview: () => {
            panelStationRestoreController.clearPinnedStateAndRestore();
            restoreStationThroughPreviewDefault();
        }
    });

    const closeDirFilterPopover = (options = {}) => dirFilterPopoverController.close(options);
    const toggleDirFilterPopoverFromButton = (btnEl) => dirFilterPopoverController.toggleFromButton(btnEl);
    let suppressNextDirFilterPopoverPanelClick = false;

    const isDirFilterPopoverOpen = () => dirFilterPopoverController.isOpen?.() === true;

    const clearDirFilterPopoverPanelHoverState = () => {
        clearTripHighlightTimer();
        clearHoverTimer();
        clearRestoreTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        lastAppliedHoverKey = null;
        lastMousePrimaryKey = '';
    };

    const getOpenDirFilterPreviewKey = () => (
        toText(dirFilterPopoverController.getActiveKey?.())
        || toText(panelSelectionState.getPinnedDirPreviewKey())
    );

    const restoreOpenDirFilterPreview = (lineDirKey = '') => {
        const key = toText(lineDirKey) || getOpenDirFilterPreviewKey();
        if (!key) return;
        applyDirPreviewByKey(key, { force: true });
    };

    const isPanelTargetOutsideDirFilterPopover = (target) => (
        target instanceof Element
        && body.contains(target)
        && !dirFilterPopoverController.contains(target)
    );

    const guardOpenDirFilterPopoverHover = (evt) => {
        if (!isDirFilterPopoverOpen()) return false;
        if (!isPanelTargetOutsideDirFilterPopover(evt?.target)) return false;
        clearDirFilterPopoverPanelHoverState();
        restoreOpenDirFilterPreview();
        return true;
    };

    const consumeOpenDirFilterPopoverPanelEvent = (evt, { suppressClick = false } = {}) => {
        if (!isDirFilterPopoverOpen()) return false;
        if (!isPanelTargetOutsideDirFilterPopover(evt?.target)) return false;
        clearDirFilterPopoverPanelHoverState();
        panelInteractionPolicy.cancelTripTap();
        closeDirFilterPopover({ clearPreview: true });
        if (suppressClick) suppressNextDirFilterPopoverPanelClick = true;
        stopEvent(evt);
        return true;
    };

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
        onRestoreStationLines: (lineIds, meta = {}) => {
            const stationId = toText(meta?.stationId) || toText(currentStationId) || null;
            const restoreContext = stationRestoreContext.getSnapshot(stationId);
            if (!restoreContext) return;
            if (!stationRestoreContext.canRestore({
                stationId,
                lineIds,
                sessionId: restoreContext.sessionId
            })) {
                return;
            }
            onRestoreStationLines?.(restoreContext.servingIds, {
                ...meta,
                stationId: restoreContext.stationId,
                restoreSessionId: restoreContext.sessionId
            });
        },
        getCurrentStationServingIds: () => currentStationServingIds,
        getCurrentStationId: () => currentStationId,
        toText
    });
    const clearHoverTimer = () => panelHoverRestoreRuntime.clearHoverTimer();
    const clearRestoreTimer = () => panelHoverRestoreRuntime.clearRestoreTimer();
    const restoreStationLinesIfNeeded = () => panelHoverRestoreRuntime.restoreStationLinesIfNeeded();
    const scheduleRestoreStationLines = () => panelHoverRestoreRuntime.scheduleRestoreStationLines();
    const panelStationRestoreController = createPanelStationRestoreController({
        clearPinnedPanelState,
        restoreStationDefaultSelection,
        restoreStationLinesIfNeeded
    });

    const getCompanyTarget = () => '';

    const getLineTarget = () => '';

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

    const getDirFocusButtonTarget = (target) => {
        return resolvePanelDirFocusButtonTarget(target, { body, toText });
    };

    const panelPrintRequests = createPanelPrintRequestController({
        body,
        dirPrintPayloadByKey,
        linePrintPayloadsByLineId,
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
        panelInteractionPolicy.armCancelInteractionSuppression();
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

    const toggleDirectionFocus = (lineId, dirKey) => {
        const lid = toText(lineId);
        const dkey = toText(dirKey);
        if (!lid || !dkey) return;

        const nextKey = makeLineDirKey(lid, dkey);
        focusedDirectionKey = focusedDirectionKey === nextKey ? '' : nextKey;
        if (focusedDirectionKey) setDirExpanded(lid, dkey, true);
        if (focusedDirectionKey && isMobilePanelPresentation()) {
            panelShell.expand?.();
        }
        syncDirectionFocusVisibility();
        renderAllTimetables();
    };

    const expandMobileLineTimetableDirections = (lineId) => {
        const lid = toText(lineId);
        if (!lid) return;
        const lineEl = body.querySelector?.(`.panel-line[data-line-id="${escapeHtml(String(lid))}"]`);
        if (!lineEl) return;

        let changed = false;
        const directionHeaders = Array.from(lineEl.querySelectorAll?.('.panel-dir-header[data-dir-key]') || []);
        for (const headerEl of directionHeaders) {
            const dirKey = toText(headerEl.getAttribute?.('data-dir-key'));
            if (!dirKey || isDirExpanded(lid, dirKey)) continue;
            setDirExpanded(lid, dirKey, true);
            changed = true;
        }

        if (!changed) return;
        const token = ++timetableRenderToken;
        renderTimetableForLineEl(lineEl, currentStationId, token);
    };

    const showMobileLineRouteMapPanel = (lineId) => {
        if (!isMobilePanelPresentation()) return false;
        const lid = toText(lineId);
        if (!lid) return false;
        const lineEl = body.querySelector?.(`.panel-line[data-line-id="${escapeHtml(String(lid))}"]`);
        const lineName = toText(lineEl?.querySelector?.('.panel-line-name')?.getAttribute?.('data-line-name'))
            || toText(lineEl?.querySelector?.('.panel-line-name-main')?.textContent)
            || lid;

        panelRouteMapBridge.requestLineRouteMapPanel({
            lineId: lid,
            lineName,
            placement: 'mobile-panel',
            returnTarget: 'panel'
        });
        hideMobilePanelForRouteMapContext();
        scheduleCatalogRefresh();
        return true;
    };

    const openMobileLineTimetable = (lineId) => {
        if (!isMobilePanelPresentation()) return;
        const lid = toText(lineId);
        if (!lid) return;

        showMobileLineRouteMapPanel(lid);
    };

    const openMobileTripDetail = ({ lineId, tripKey } = {}) => {
        if (!isMobilePanelPresentation()) return;
        const lid = toText(lineId);
        const key = toText(tripKey);
        if (!lid || !key) return;

        mobilePanelStack.openTripDetail({
            ...getMobilePanelStationContext(),
            lineId: lid,
            tripKey: key
        });
        syncMobilePanelStackUi();
        syncDirectionFocusVisibility();
        collapseMobilePanelForMapContext();
    };

    const restoreMobileLineAfterTripDetail = () => {
        if (!isMobilePanelPresentation()) return;
        const state = mobilePanelStack.getState();
        if (state?.screen !== PANEL_MOBILE_STACK_SCREENS.TRIP_DETAIL) return;

        const returnContext = mobileTripDetailReturnContext;
        clearMobileTripDetailReturnContext();

        if (returnContext?.source === 'direction-focus') {
            const lid = toText(returnContext.lineId);
            const dkey = toText(returnContext.dirKey);
            if (lid && dkey && toText(returnContext.focusedDirectionKey) === makeLineDirKey(lid, dkey)) {
                focusedDirectionKey = returnContext.focusedDirectionKey;
                setDirExpanded(lid, dkey, true);
                applyTimetableViewMode(returnContext.timetableViewMode, { rerender: false });
                mobilePanelStack.openLineTimetable({
                    ...getMobilePanelStationContext(),
                    lineId: lid
                });
                syncMobilePanelStackUi();
                panelShell.expand?.();
                syncDirectionFocusVisibility();
                const renderPromise = renderAllTimetables();
                Promise.resolve(renderPromise).then(
                    () => restorePanelBodyScrollTop(returnContext.scrollTop),
                    () => restorePanelBodyScrollTop(returnContext.scrollTop)
                );
                scheduleCatalogRefresh();
                return;
            }
        }

        mobilePanelStack.openStationOverview(getMobilePanelStationContext());
        syncMobilePanelStackUi();
        panelStationRestoreController.restoreDefaultSelection();
        expandMobilePanelAfterTripDetailReturn();
        scheduleCatalogRefresh();
    };

    const resolveTripRowPayload = (rowEl) => {
        if (!rowEl || !body.contains(rowEl)) return null;
        const lineEl = rowEl.closest?.('[data-line-id]');
        const dirBody = rowEl.closest?.('[data-dir-body][data-dir-key]');
        const lineId = rowEl.getAttribute?.('data-line-id') || lineEl?.getAttribute?.('data-line-id');
        const tripKey = rowEl.getAttribute?.('data-trip-key');
        const dirKey = dirBody?.getAttribute?.('data-dir-key') || '';
        if (!lineId || !tripKey) return null;
        return {
            key: `${String(lineId)}||${String(tripKey)}`,
            lineId: String(lineId),
            dirKey: String(dirKey || ''),
            tripKey: String(tripKey)
        };
    };

    const openTripDetailFromPayload = ({
        clientX = 0,
        clientY = 0,
        fitMode = 'commit',
        key = '',
        lineId = '',
        dirKey = '',
        tripKey = ''
    } = {}) => {
        if (!lineId || !tripKey || !key) return false;

        captureMobileTripDetailReturnContext({ lineId, dirKey });

        if (!isMobilePanelPresentation() && tripLocked && key !== lockedTripKey) {
            hideTripDetail({ restoreMobileLine: false });
        }

        if (!isMobilePanelPresentation()) {
            lockTripPreview(key);
            setPinnedPanelSelection('trip', key);
        }

        renderTripDetail({
            lineId,
            tripKey,
            clientX,
            clientY,
            pinned: true,
            fitMode
        });
        lastTripDetailKey = key;
        return true;
    };

    const openTripDetailFromRowClick = (rowEl, evt, {
        fitMode = 'commit'
    } = {}) => {
        const payload = resolveTripRowPayload(rowEl);
        if (!payload) return false;
        return openTripDetailFromPayload({
            ...payload,
            clientX: evt?.clientX || 0,
            clientY: evt?.clientY || 0,
            fitMode
        });
    };

    const onBodyPointerDown = (evt) => {
        const pointerState = panelInteractionPolicy.beginPointer(evt);
        if (consumeOpenDirFilterPopoverPanelEvent(evt, { suppressClick: true })) return;
        const pt = pointerState.pointerType;
        const pointerTripRowEl = findTripTarget(evt?.target);
        const pointerHitsTripRow = pointerTripRowEl && body.contains(pointerTripRowEl);

        if (!isMobilePanelPresentation() && evt?.target instanceof Element && body.contains(evt.target) && hasPinnedPanelState()) {
            if (pointerHitsTripRow) {
                // Let timetable taps/clicks replace an existing pinned preview instead of only clearing it.
            } else {
                const pinnedKey = getCurrentPinnedInteractionKey();
                const hitKey = getInteractionKeyFromTarget(evt.target);
                stopEvent(evt);
                if (pinnedKey && hitKey && pinnedKey === hitKey) return;
                panelStationRestoreController.clearPinnedStateAndRestore();
                armCancelInteractionSuppression();
                return;
            }
        }

        if (!isMobilePanelPresentation() && tripLocked) {
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

        const lineToggleTarget = getPanelLineToggleTarget(evt?.target);
        if (lineToggleTarget) {
            stopPropagationOnly(evt);
            panelInteractionPolicy.startTripTap(evt, {
                kind: 'line-toggle',
                lineId: lineToggleTarget.lineEl.getAttribute?.('data-line-id')
            });
            return;
        }

        const lineHeaderToggleTarget = getPanelLineHeaderToggleTarget(evt?.target);
        if (lineHeaderToggleTarget) {
            stopPropagationOnly(evt);
            panelInteractionPolicy.startTripTap(evt, {
                kind: 'line-header-toggle',
                lineId: lineHeaderToggleTarget.lineEl.getAttribute?.('data-line-id')
            });
            return;
        }

        const companyToggleTarget = getPanelCompanyToggleTarget(evt?.target);
        if (companyToggleTarget) {
            stopPropagationOnly(evt);
            panelInteractionPolicy.startTripTap(evt, {
                kind: 'company-toggle',
                companyEl: companyToggleTarget.companyEl
            });
            return;
        }

        const filterTarget = getDirFilterButtonTarget(evt?.target);
        if (filterTarget) {
            stopPropagationOnly(evt);
            panelInteractionPolicy.startTripTap(evt, {
                kind: 'dir-filter',
                lineId: filterTarget.lineId,
                dirKey: filterTarget.dirKey,
                buttonEl: filterTarget.buttonEl
            });
            return;
        }

        const printTarget = getDirPrintButtonTarget(evt?.target);
        if (printTarget) {
            stopEvent(evt);
            requestPrintTimetable(printTarget.lineId, printTarget.dirKey);
            return;
        }

        const focusTarget = getDirFocusButtonTarget(evt?.target);
        if (focusTarget) {
            stopEvent(evt);
            dispatchPanelDirectionFocusIntent({
                dirTarget: focusTarget,
                toggleDirectionFocus
            });
            return;
        }

        const rowEl = findTripTarget(evt?.target);
        if (rowEl && body.contains(rowEl)) {
            clearTripHighlightTimer();
            const payload = resolveTripRowPayload(rowEl);
            if (payload) {
                stopPropagationOnly(evt);
                panelInteractionPolicy.startTripTap(evt, {
                    lineId: payload.lineId,
                    dirKey: payload.dirKey,
                    tripKey: payload.tripKey
                });
                return;
            }
        }

        const dirTriangle = getDirTriangleTarget(evt?.target);
        if (dirTriangle) {
            stopPropagationOnly(evt);
            panelInteractionPolicy.startTripTap(evt, {
                kind: 'dir-triangle-toggle',
                lineId: dirTriangle.lineId,
                dirKey: dirTriangle.dirKey
            });
            return;
        }

        const dirTitle = getDirTitleTarget(evt?.target);
        if (dirTitle) {
            stopPropagationOnly(evt);
            panelInteractionPolicy.startTripTap(evt, {
                kind: 'dir-title-toggle',
                lineId: dirTitle.lineId,
                dirKey: dirTitle.dirKey
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
                setPinnedPanelSelection: isMobilePanelPresentation() ? () => null : setPinnedPanelSelection,
                onSelectLine,
                onSelectCompany,
                currentStationServingIds
            });
            if (touchPrimaryResult.handled) {
                if (touchPrimaryTarget.kind === 'line') {
                    openMobileLineTimetable(touchPrimaryTarget.lineId);
                }
                return;
            }
        }

        if (!evt?.target || !(evt.target instanceof Element) || !body.contains(evt.target)) {
            // 触屏在非交互区域（例如时间表滚动区）按下：允许默认滚动，但不要把事件传到地图
            stopPropagationOnly(evt);
            return;
        }

        stopPropagationOnly(evt);
    };

    const onBodyPointerMoveTouchTap = (evt) => {
        panelInteractionPolicy.moveTripTap(evt);
    };

    const onBodyPointerCancelTouchTap = () => {
        panelInteractionPolicy.cancelTripTap();
    };

    const onBodyPointerUpTouchTap = (evt) => {
        const completed = panelInteractionPolicy.finishTripTap(evt);
        if (!completed.handled || completed.eligible !== true) return;
        const pending = completed.tap;

        stopPropagationOnly(evt);

        const pendingKind = toText(pending?.kind);
        if (pendingKind === 'line-toggle') {
            collapsePanelLineAfterFocusExitById(pending.lineId);
            return;
        }

        if (pendingKind === 'line-header-toggle') {
            if (getFocusedDirectionLineId() === toText(pending.lineId)) {
                collapsePanelLineAfterFocusExitById(pending.lineId);
            } else {
                togglePanelLineCollapsedById(pending.lineId);
            }
            return;
        }

        if (pendingKind === 'company-toggle') {
            togglePanelCompanyLinesCollapsed(pending.companyEl);
            return;
        }

        if (pendingKind === 'dir-title-toggle' || pendingKind === 'dir-triangle-toggle') {
            dispatchPanelDirectionToggleIntent({
                dirTarget: {
                    lineId: pending.lineId,
                    dirKey: pending.dirKey
                },
                toggleDirectionTimetable
            });
            return;
        }

        if (pendingKind === 'dir-filter') {
            dispatchPanelDirFilterIntent({
                filterTarget: {
                    lineId: pending.lineId,
                    dirKey: pending.dirKey,
                    buttonEl: pending.buttonEl
                },
                fitMode: 'commit',
                makeLineDirKey,
                applyDirPreviewByKey,
                pinDirPreviewByKey,
                setPinnedPanelSelection,
                toggleDirFilterPopoverFromButton
            });
            return;
        }

        openTripDetailFromPayload({
            lineId: pending.lineId,
            dirKey: pending.dirKey,
            tripKey: pending.tripKey,
            key: `${pending.lineId}||${pending.tripKey}`,
            clientX: completed.clientX,
            clientY: completed.clientY,
            fitMode: 'commit'
        });
    };

    const onBodyMove = (evt) => {
        if (guardOpenDirFilterPopoverHover(evt)) return;

        if (getCollapsedPanelLineTarget(evt?.target)) {
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            lastAppliedHoverKey = null;
            stopPropagationOnly(evt);
            return;
        }

        if (panelInteractionPolicy.shouldSuppressMouseHover()) {
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
        if (panelInteractionPolicy.shouldSkipDesktopHover()) return;
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
        if (suppressNextDirFilterPopoverPanelClick) {
            suppressNextDirFilterPopoverPanelClick = false;
            stopEvent(evt);
            return;
        }
        if (consumeOpenDirFilterPopoverPanelEvent(evt)) return;

        // 触屏：由 pointerdown 接管两段式逻辑
        if (panelInteractionPolicy.isLastPointerTouchLike() || panelInteractionPolicy.shouldSuppressMouseEvents()) {
            stopEvent(evt);
            return;
        }

        const earlyLineToggleTarget = getPanelLineToggleTarget(evt?.target);
        if (earlyLineToggleTarget) {
            stopEvent(evt);
            collapsePanelLineAfterFocusExit(earlyLineToggleTarget.lineEl);
            return;
        }

        const lineHeaderToggleTarget = getPanelLineHeaderToggleTarget(evt?.target);
        if (lineHeaderToggleTarget) {
            stopEvent(evt);
            togglePanelLineCollapsed(lineHeaderToggleTarget.lineEl);
            return;
        }

        const earlyPrintTarget = getDirPrintButtonTarget(evt?.target);
        if (earlyPrintTarget) {
            stopEvent(evt);
            requestPrintTimetable(earlyPrintTarget.lineId, earlyPrintTarget.dirKey);
            return;
        }

        const earlyFocusTarget = getDirFocusButtonTarget(evt?.target);
        if (earlyFocusTarget) {
            stopEvent(evt);
            dispatchPanelDirectionFocusIntent({
                dirTarget: earlyFocusTarget,
                toggleDirectionFocus
            });
            return;
        }

        if (panelInteractionPolicy.shouldSuppressMouseClick()) {
            stopEvent(evt);
            return;
        }

        const lineToggleTarget = getPanelLineToggleTarget(evt?.target);
        if (lineToggleTarget) {
            stopEvent(evt);
            collapsePanelLineAfterFocusExit(lineToggleTarget.lineEl);
            return;
        }

        const companyToggleTarget = getPanelCompanyToggleTarget(evt?.target);
        if (companyToggleTarget) {
            stopEvent(evt);
            togglePanelCompanyLinesCollapsed(companyToggleTarget.companyEl);
            return;
        }

        const rowEl = findTripTarget(evt?.target);
        if (rowEl && body.contains(rowEl)) {
            clearTripHighlightTimer();
            stopEvent(evt);
            const fitMode = tripPreviewScheduler.isAppliedKey(resolveTripRowPayload(rowEl)?.key || '') ? 'none' : 'commit';
            openTripDetailFromRowClick(rowEl, evt, { fitMode });
            return;
        }

        if (evt?.target instanceof Element && body.contains(evt.target) && hasPinnedPanelState()) {
            const pinnedKey = getCurrentPinnedInteractionKey();
            const hitKey = getInteractionKeyFromTarget(evt.target);
            stopEvent(evt);
            if (pinnedKey && hitKey && pinnedKey === hitKey) return;
            panelStationRestoreController.clearPinnedStateAndRestore();
            armCancelInteractionSuppression();
            return;
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
        panelStationRestoreController.restoreHoverSelectionIfNeeded();
        if (tripLocked) return;
        if (toEl && tripDetailRoot.contains(toEl)) return;
        if (!(toEl && dirFilterPopoverController.contains(toEl)) && !panelSelectionState.getPinnedDirPreviewKey()) {
            clearDirPreview();
        }
        if (!tripDetailPinned) {
            clearUnpinnedTripPreview();
            scheduleTripDetailHide();
        }
    };

    const onBodyTripMouseOver = (evt) => {
        if (guardOpenDirFilterPopoverHover(evt)) return;
        if (!isHoverPreviewEnabled()) return;
        if (panelInteractionPolicy.shouldSkipDesktopHover()) return;
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
        if (guardOpenDirFilterPopoverHover(evt)) return;
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
        } else {
            clearUnpinnedTripPreview();
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
            panelStationRestoreController.restoreHoverSelectionIfNeeded();
            if (!panelSelectionState.getPinnedDirPreviewKey()) {
                clearDirPreview();
            }
        }
    });

    const getTripDetailStationTarget = (target) => resolveTripDetailStationTarget(target, { rootEl: tripDetailBody });

    const rememberTripDetailStationPointerIntent = (evt, stationId) => {
        const sid = toText(stationId);
        if (!sid) {
            tripDetailStationPointerIntent = null;
            return;
        }
        tripDetailStationPointerIntent = {
            pointerId: evt?.pointerId != null ? String(evt.pointerId) : '',
            stationId: sid,
            startedAt: nowMs(),
            token: tripDetailToken
        };
    };

    const consumeTripDetailStationPointerIntent = (evt, stationId) => {
        const intent = tripDetailStationPointerIntent;
        tripDetailStationPointerIntent = null;
        if (!intent) return false;
        if (intent.token !== tripDetailToken) return false;
        if (toText(intent.stationId) !== toText(stationId)) return false;
        if (nowMs() - Number(intent.startedAt || 0) > 1200) return false;
        const eventPointerId = evt?.pointerId != null ? String(evt.pointerId) : '';
        if (eventPointerId && intent.pointerId && eventPointerId !== intent.pointerId) return false;
        return true;
    };

    const onTripDetailMouseOver = (evt) => {
        if (panelInteractionPolicy.shouldSkipDesktopHover()) return;
        const stationEl = getTripDetailStationTarget(evt?.target);
        if (!stationEl) return;
        const sid = toText(stationEl.getAttribute('data-station-id'));
        if (!sid) return;
        showTripDetailStationIndicator(sid);
    };

    const onTripDetailMouseOut = (evt) => {
        if (panelInteractionPolicy.shouldSkipDesktopHover()) return;
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
        const pt = panelInteractionPolicy.markPointer(evt);
        const stationEl = getTripDetailStationTarget(evt?.target);
        if (!stationEl) {
            tripDetailStationPointerIntent = null;
            return;
        }
        const sid = toText(stationEl.getAttribute('data-station-id'));
        if (!sid) {
            tripDetailStationPointerIntent = null;
            return;
        }
        rememberTripDetailStationPointerIntent(evt, sid);
        if (isTouchLikePointer(pt)) showTripDetailStationIndicator(sid);
    };

    const jumpToTripDetailStation = (target, {
        adjustTime = true,
        requirePointerIntent = false,
        sourceEvent = null
    } = {}) => {
        if (!tripDetailStationJumpEnabled) return false;
        const intent = resolvePanelStationJumpIntent(target, {
            adjustTime,
            rootEl: tripDetailBody,
            toText
        });
        if (!intent) return false;
        if (requirePointerIntent && !consumeTripDetailStationPointerIntent(sourceEvent, intent.stationId)) return false;

        hideTripDetail({ restoreMobileLine: false });
        lastTripDetailKey = null;
        try {
            onTripDetailStationJump?.(intent);
        } catch {
            // ignore
        }
        return true;
    };

    const onTripDetailStationClick = (evt) => {
        const requirePointerIntent = isMobilePanelPresentation();
        if (!jumpToTripDetailStation(evt?.target, {
            adjustTime: true,
            requirePointerIntent,
            sourceEvent: evt
        })) {
            if (requirePointerIntent && getTripDetailStationTarget(evt?.target)) stopEvent(evt);
            return;
        }
        stopEvent(evt);
    };

    const onTripDetailStationKeyDown = (evt) => {
        const key = toText(evt?.key);
        if (key !== 'Enter' && key !== ' ') return;
        if (!jumpToTripDetailStation(evt?.target, { adjustTime: true })) return;
        stopEvent(evt);
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
            click: onTripDetailStationClick,
            keydown: onTripDetailStationKeyDown,
            mouseleave: onTripDetailMouseLeave,
            mouseout: onTripDetailMouseOut,
            mouseover: onTripDetailMouseOver,
            pointerdown: onTripDetailPointerDown
        }
    });

    const panelDismissController = createPanelDismissController({
        clearPinnedDirPreview,
        clearPinnedPanelState,
        findTripTarget,
        getLockedTripKey: () => lockedTripKey,
        getTripDetailPinned: () => tripDetailPinned,
        getTripLocked: () => tripLocked,
        hasPinnedPanelState,
        hideTripDetail,
        ignoredElements: [settingsContentEl, timeOverlay],
        ignoredSelectors: ['.settings-content', '.settings-ui'],
        insidePredicates: [(node) => dirFilterPopoverController.contains(node)],
        panelSelectionState,
        panelShell,
        restorePinnedPanelState: () => panelStationRestoreController.clearPinnedStateAndRestore(),
        setLastTripDetailKey: (value) => {
            lastTripDetailKey = value;
        },
        tripDetailRoot
    });

    document.addEventListener('click', panelDismissController.handleDocumentClick);

    const layout = () => {
        panelMainView.layout({ presentation: panelPresentation });
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
        invalidateStationRestoreSession({ cancelRender: true });
        clearDirectionFocus({ rerender: false });
        timePickerController.close();
        closeDirFilterPopover({ clearPreview: false });
        clearPinnedPanelState({ restoreStation: false });
        hideTripDetail({ restoreMobileLine: false });
        mobilePanelStack.close();
        syncMobilePanelStackUi();
        dirPrintPayloadByKey.clear();
        linePrintPayloadsByLineId.clear();
        dirFilterStateByKey.clear();
        ({
            temporaryLineMetaById: temporaryPanelLineMetaById,
            temporarySourceLineIdsByDisplayLineId: temporaryPanelSourceLineIdsByDisplayLineId,
            temporaryAllowedTripKeysByDisplayLineId: temporaryPanelAllowedTripKeysByDisplayLineId,
            throughServiceDirectionsByEntityLineId
        } = createEmptyPanelThroughServiceState());
        panelShell.hide();
        scheduleCatalogRefresh();
    };

    const handlePanelBackIntent = ({ source = '' } = {}) => {
        if (!isMobilePanelPresentation()) return false;
        const isAndroidBack = source === 'android-back';

        const state = mobilePanelStack.getState();
        if (state?.screen === PANEL_MOBILE_STACK_SCREENS.TRIP_DETAIL) {
            hideTripDetail();
            lastTripDetailKey = null;
            return true;
        }

        if (clearDirectionFocus({ rerender: true })) {
            return true;
        }

        if (panelShell.isHalfCollapsed?.() || panelShell.isCollapsed?.()) {
            if (isAndroidBack) {
                hide();
                onAndroidBackPanelHidden?.();
                return true;
            }
            panelShell.expand?.();
            return true;
        }

        if (panelShell.isVisible?.()) {
            hide();
            if (isAndroidBack) {
                onAndroidBackPanelHidden?.();
            }
            return true;
        }

        return false;
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
        stationThroughPreviewSuppressed = false;
        invalidateStationRestoreSession();
        panelCatalogController?.resetTransientUiState();

        currentStationProps = props || null;
        currentStationId = toText(props?.id);
        currentStationNameZh = toText(props?.name_zh || props?.['name:zh'] || name);
        const stationIndex = await getStationsIndex();
        if (renderToken !== stationRenderToken) return;
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
            dirFilterRowsByKey,
            dirFilteredTripKeysByKey,
            dirPreviewMetaByKey,
            clearHoverTimer,
            clearRestoreTimer,
            clearTripHighlightTimer,
            hideTripDetail: () => hideTripDetail({ restoreMobileLine: false }),
            closeDirFilterPopover,
            clearPinnedPanelState
        }));
        clearDirectionFocus({ rerender: false });

        const stationRenderBootstrap = preparePanelStationRenderBootstrap({
            props,
            normalizeArrayLike,
            buildPanelLineMergeInfo,
            getLineMeta,
            createEmptyPanelThroughServiceState,
            toText
        });
        currentStationServingIds = stationRenderBootstrap.currentStationServingIds;
        stationRestoreContext.set(currentStationId, currentStationServingIds);
        const mergeInfo = stationRenderBootstrap.mergeInfo;

        ({
            temporaryLineMetaById: temporaryPanelLineMetaById,
            temporarySourceLineIdsByDisplayLineId: temporaryPanelSourceLineIdsByDisplayLineId,
            temporaryAllowedTripKeysByDisplayLineId: temporaryPanelAllowedTripKeysByDisplayLineId,
            throughServiceDirectionsByEntityLineId
        } = stationRenderBootstrap.throughServiceState);

        let displayServingIds = stationRenderBootstrap.displayServingIds;

        const throughServicePanelServingLineIds = await buildThroughServicePanelServingLineIds({
            currentServingLineIds: currentStationServingIds,
            displayLineIds: displayServingIds,
            stationId: currentStationId
        });
        if (renderToken !== stationRenderToken) return;

        const throughPlan = await buildTemporaryThroughServicePanelPlan({
            stationId: currentStationId,
            servingLineIds: throughServicePanelServingLineIds,
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
            throughServiceDirectionsByEntityLineId,
            displayServingIds
        } = resolvePanelThroughServiceSetup({
            throughPlan,
            displayServingIds,
            throughServiceConfigs: THROUGH_SERVICE_CONFIGS
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
        body.innerHTML = buildPanelCompaniesHtml({ ...(props || {}), display_serving_ids: displayServingIds }, { getLineMeta, companyLogoMap, lineStationNameByLineId, toText });
        reorderPanelThroughServiceLinesAfterHtml(body, {
            temporarySourceLineIdsByDisplayLineId: temporaryPanelSourceLineIdsByDisplayLineId,
            throughServiceConfigs: THROUGH_SERVICE_CONFIGS,
            toText
        });
        await enhancePanelLineHeaderIcons(body);
        applyDefaultPanelLineCollapse(body, displayServingIds.length > 3);
        openMobileStationOverview();
        scheduleCatalogRefresh();

        show();

        // 默认折叠态：填充每条线路的“未来最近 3 条”班次
        // 这里等待渲染完成，避免外部随后执行的 scrollToLineId 被后续异步渲染“拉回顶部”。
        await renderAllTimetables();
        scheduleCatalogRefresh();
        panelScrollRuntime.syncPanelTitleForActiveLine();
    };

    const refreshPanelThemeColors = async () => {
        if (toText(currentStationId) && currentStationProps && panelShell.isVisible?.()) {
            const scrollTop = panelScrollRuntime.getScrollTop();
            await showForStationProps(currentStationProps);
            panelScrollRuntime.setScrollTop(scrollTop);
            return;
        }

        const lineEls = Array.from(body.querySelectorAll('.panel-line[data-line-id]'));
        for (const lineEl of lineEls) {
            const lineId = toText(lineEl.getAttribute('data-line-id'));
            const color = toText(getLineMeta(lineId)?.color);
            if (color) {
                lineEl.style.color = color;
                lineEl.style.setProperty('--panel-line-accent', color);
            } else {
                lineEl.style.removeProperty('color');
                lineEl.style.removeProperty('--panel-line-accent');
            }
        }
        if (toText(currentStationId)) {
            await renderAllTimetables();
        } else {
            scheduleCatalogRefresh();
        }
    };

    const refreshBusinessTime = async () => {
        const scrollTop = panelScrollRuntime.getScrollTop();
        applyPanelDateSelection(new Date());
        if (isAutoNowClock) {
            syncAutoNowClock({ forceRender: true });
        } else if (toText(currentStationId)) {
            await renderAllTimetables();
        }
        const activeTripKey = toText(lastTripDetailKey);
        if (activeTripKey) {
            const [lineId, tripKey] = activeTripKey.split('||');
            if (toText(lineId) && toText(tripKey)) {
                renderTripDetail({
                    lineId,
                    tripKey,
                    pinned: tripDetailPinned,
                    fitMode: 'none'
                });
            }
        }
        panelScrollRuntime.setScrollTop(scrollTop);
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
        panelStationRestoreController.restoreHoverSelectionIfNeeded();
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
        setTimeOverride,
        invalidateStationRestoreSession,
        cancelStationThroughPreview,
        canRestoreStationLines: (payload = {}) => stationRestoreContext.canRestore(payload),
        resetTemporaryTimeOverride,
        handlePanelBackIntent,
        refreshBusinessTime,
        refreshThemeColors: refreshPanelThemeColors,
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
