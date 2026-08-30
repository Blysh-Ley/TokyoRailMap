import { createPanelTripDetailView } from './panelTripDetailView.js';
import { createMobileSheetPullDownController } from './mobileSheetPullDown.js';

const isInteractivePanelHeaderTarget = (target, header) => {
    if (!target?.closest || !header?.contains?.(target)) return false;
    const interactive = target.closest('button, input, select, textarea, a, [role="button"], [tabindex]');
    return Boolean(interactive && header.contains(interactive));
};

export const createPanelMainView = ({
    panelComposition,
    panelContentApi,
    panelShell,
    createPanelMapSelectController,
    createPanelDateTimePickerView = null,
    createPanelTimePickerController,
    getIconCandidates,
    getPreferredCachedImageSrc,
    setImageElementFromCache,
    formatDateInputValue: formatDateInputValueOption,
    formatPanelDateText: formatPanelDateTextOption,
    getInitialPanelDate,
    isSaturdayHoliday,
    stopEvent,
    stopPropagationOnly,
    setTimePickerOpenState,
    getJourneyStationContext,
    getJourneyWaypointOptions = () => [],
    isJourneyPlannerOpen = () => false,
    onJourneyStationSelect,
    onTravelHeatmapStation,
    toText = (value) => String(value ?? '').trim(),
    dateTimePickerMode = 'legacy',
    zIndex = 9999
} = {}) => {
    const root = panelComposition.root;
    const panel = panelComposition.panel;
    const usesCombinedDateTimePicker = dateTimePickerMode === 'combined'
        && typeof createPanelDateTimePickerView === 'function';

    const header = document.createElement('div');
    header.setAttribute('data-panel-header', '');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'flex-start';
    header.style.gap = '8px';
    header.style.padding = '10px 12px';
    header.style.borderBottom = '1px solid var(--ui-border, #e3e5e7)';
    header.style.flex = '0 0 auto';
    header.style.touchAction = 'none';

    const tripDetailBackBtn = document.createElement('button');
    tripDetailBackBtn.type = 'button';
    tripDetailBackBtn.className = 'panel-capture-btn panel-trip-detail-back-btn';
    tripDetailBackBtn.setAttribute('aria-label', '返回线路班次');
    tripDetailBackBtn.title = '返回';
    const tripDetailBackIcon = document.createElement('img');
    tripDetailBackIcon.className = 'panel-capture-icon panel-trip-detail-back-icon';
    tripDetailBackIcon.alt = '';
    setImageElementFromCache(tripDetailBackIcon, getIconCandidates('arrow-right.svg'), {
        cacheKey: 'icon:arrow-right.svg',
        fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('arrow-right.svg'), { cacheKey: 'icon:arrow-right.svg' })
    }).catch(() => null);
    tripDetailBackBtn.appendChild(tripDetailBackIcon);
    header.appendChild(tripDetailBackBtn);

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

    const controls = document.createElement('div');
    controls.className = 'panel-controls';

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

    const handleTravelHeatmap = () => {
        const context = typeof getJourneyStationContext === 'function'
            ? getJourneyStationContext({ titleMain })
            : {};
        onTravelHeatmapStation?.(context);
    };

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

    const applyStationToJourneyField = (action) => {
        const field = typeof action === 'string' ? action : toText(action?.field);
        const context = typeof getJourneyStationContext === 'function'
            ? getJourneyStationContext({ titleMain })
            : {};
        const stationId = toText(context?.stationId);
        const stationName = toText(context?.stationName) || toText(titleMain.textContent);
        if (!stationId && !stationName) return;
        onJourneyStationSelect?.({
            field,
            stationId,
            stationName,
            waypointIndex: Number.isFinite(Number(action?.waypointIndex)) ? Number(action.waypointIndex) : undefined
        });
    };

    const mapSelectController = createPanelMapSelectController({
        stopEvent,
        getWaypointOptions: () => {
            try {
                const options = getJourneyWaypointOptions();
                return Array.isArray(options) ? options : [];
            } catch {
                return [];
            }
        },
        isPlannerOpen: () => {
            try {
                return isJourneyPlannerOpen() === true;
            } catch {
                return false;
            }
        },
        loadIcon: (iconEl) => setImageElementFromCache(iconEl, getIconCandidates('map-select.svg'), {
            cacheKey: 'icon:map-select.svg',
            fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('map-select.svg'), { cacheKey: 'icon:map-select.svg' })
        }).catch(() => null),
        onSelectField: applyStationToJourneyField,
        onSelectHeatmap: handleTravelHeatmap,
        labels: {
            button: '将本站加入行程（起点/终点）',
            menu: '将本站作为起点、途径点或终点',
            origin: '作为起点',
            destination: '作为终点',
            newWaypoint: '作为新增途径点',
            heatmap: '出行热图'
        }
    });

    const dayActionRow = document.createElement('div');
    dayActionRow.className = 'panel-day-action-row';
    dayActionRow.style.display = 'inline-flex';
    dayActionRow.style.alignItems = 'center';
    dayActionRow.style.gap = '8px';
    dayActionRow.appendChild(mapSelectController.el);
    dayActionRow.appendChild(dayPrintBtn);

    dayToggle.appendChild(dayActionRow);

    const timeControl = document.createElement('div');
    timeControl.className = 'settings-item-control settings-time-control';

    const timeInput = document.createElement('input');
    timeInput.className = 'settings-time-input';
    timeInput.type = 'text';
    timeInput.inputMode = 'numeric';
    timeInput.placeholder = 'HH:MM';
    timeInput.maxLength = 5;
    timeInput.value = '';
    if (usesCombinedDateTimePicker) {
        timeInput.readOnly = true;
        timeInput.inputMode = 'none';
        timeInput.setAttribute('role', 'button');
        timeInput.setAttribute('aria-label', '选择时间');
        timeInput.setAttribute('aria-haspopup', 'dialog');
        timeInput.setAttribute('aria-expanded', 'false');
    }

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

    const timePickerController = usesCombinedDateTimePicker
        ? {
            close: () => {},
            confirm: () => {},
            isOpen: () => false,
            open: () => {},
            position: () => {}
        }
        : createPanelTimePickerController({
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
    viewToggle.style.flex = '0 0 auto';

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

    const body = document.createElement('div');
    body.setAttribute('data-panel-body', '');
    body.className = 'panel-list';
    body.style.flex = '1 1 auto';
    body.style.minHeight = '0';
    body.style.paddingLeft = '10px';
    body.style.paddingRight = '10px';
    body.style.overflowY = 'auto';
    body.style.overflowX = 'hidden';
    body.style.touchAction = 'pan-y';

    if (panel?.style) {
        panel.style.minHeight = '0';
    }
    if (root?.style) {
        root.style.minHeight = '0';
    }

    panelContentApi.appendContent(header);
    panelContentApi.appendContent(viewToggle);
    panelContentApi.appendContent(body);
    panelComposition.mountContent();

    root.addEventListener('pointerdown', (event) => stopPropagationOnly(event), { passive: true });
    root.addEventListener('pointermove', (event) => stopPropagationOnly(event), { passive: true });
    root.addEventListener('touchmove', (event) => stopPropagationOnly(event), { passive: true });
    root.addEventListener('wheel', (event) => stopPropagationOnly(event), { passive: true });
    root.addEventListener('click', (event) => stopEvent(event), { passive: false });

    document.body.appendChild(root);

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
    if (usesCombinedDateTimePicker) {
        datePanel.setAttribute('aria-haspopup', 'dialog');
        datePanel.setAttribute('aria-expanded', 'false');
    }

    const formatPanelDateText = (date) => {
        if (typeof formatPanelDateTextOption === 'function') return formatPanelDateTextOption(date);
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const dayType = (typeof isSaturdayHoliday === 'function' && isSaturdayHoliday(date) === 'SaturdayHoliday') ? '休息日' : '工作日';
        return `${dayType} ${mm}月${dd}日`;
    };

    const formatDateInputValue = (date) => {
        if (typeof formatDateInputValueOption === 'function') return formatDateInputValueOption(date);
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
    datePickerInput.type = usesCombinedDateTimePicker ? 'hidden' : 'date';
    datePickerInput.className = 'panel-date-picker-input';

    const initialDate = typeof getInitialPanelDate === 'function' ? getInitialPanelDate() : new Date();
    const initialDateText = formatPanelDateText(initialDate);
    if (datePanel.textContent !== initialDateText) {
        datePanel.textContent = initialDateText;
    }
    datePickerInput.value = formatDateInputValue(initialDate);

    timeOverlay.appendChild(datePanel);
    timeOverlay.appendChild(datePickerInput);
    timeOverlay.appendChild(timeControl);
    timeOverlay.addEventListener('pointerdown', (event) => stopPropagationOnly(event), { passive: true });
    timeOverlay.addEventListener('pointermove', (event) => stopPropagationOnly(event), { passive: true });
    timeOverlay.addEventListener('touchmove', (event) => stopPropagationOnly(event), { passive: true });
    timeOverlay.addEventListener('wheel', (event) => stopPropagationOnly(event), { passive: true });
    timeOverlay.addEventListener('click', (event) => stopEvent(event), { passive: false });
    timeOverlay.style.position = 'fixed';
    timeOverlay.style.zIndex = 5000;
    if (!timeOverlay.parentNode) {
        document.body.appendChild(timeOverlay);
    }

    const dateTimePickerView = usesCombinedDateTimePicker
        ? createPanelDateTimePickerView({
            anchor: timeOverlay,
            dateTrigger: datePanel,
            timeTrigger: timeInput,
            loadArrowIcon: (iconEl) => setImageElementFromCache(iconEl, getIconCandidates('arrow-right.svg'), {
                cacheKey: 'icon:arrow-right.svg',
                fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('arrow-right.svg'), { cacheKey: 'icon:arrow-right.svg' })
            }).catch(() => null),
            setOpenState: setTimePickerOpenState
        })
        : null;

    const syncMobileDrawerState = () => {
        const state = typeof panelShell?.getMobileState === 'function'
            ? panelShell.getMobileState()
            : '';
        const collapsed = state === 'collapsed';
        root.classList.toggle('is-panel-drawer-collapsed', collapsed);
        timeOverlay.classList.toggle('is-panel-drawer-collapsed', collapsed);
    };

    const isMobilePresentation = () => root.getAttribute?.('data-panel-presentation') === 'mobile';
    const canDragMobilePanel = () => isMobilePresentation() &&
        typeof panelShell?.beginMobileDrag === 'function' &&
        typeof panelShell?.updateMobileDrag === 'function' &&
        typeof panelShell?.endMobileDrag === 'function';
    const beginPanelSheetDragFromEvent = (event) => canDragMobilePanel() && panelShell.beginMobileDrag({
        startY: Number(event?.clientY) || 0,
        nowMs: Number(event?.timeStamp) || undefined
    }) === true;
    const updatePanelSheetDragFromEvent = (event, fallbackY = 0) => panelShell.updateMobileDrag({
        clientY: Number(event?.clientY) || fallbackY,
        nowMs: Number(event?.timeStamp) || undefined
    });
    const endPanelSheetDragFromEvent = (event, { cancelled = false, fallbackY = 0 } = {}) => {
        panelShell.endMobileDrag({
            clientY: cancelled ? fallbackY : (Number(event?.clientY) || fallbackY),
            nowMs: Number(event?.timeStamp) || undefined,
            cancelled
        });
        syncMobileDrawerState();
    };

    {
        let dragState = null;

        header.addEventListener('pointerdown', (event) => {
            if (!canDragMobilePanel()) return;
            if (event?.button != null && event.button !== 0) return;
            if (isInteractivePanelHeaderTarget(event?.target, header)) return;
            if (!beginPanelSheetDragFromEvent(event)) return;

            dragState = {
                pointerId: event?.pointerId,
                startY: Number(event?.clientY) || 0
            };
            try {
                header.setPointerCapture?.(event.pointerId);
            } catch {
                // ignore pointer-capture gaps in older webviews
            }
            event.preventDefault?.();
            event.stopPropagation?.();
        }, { passive: false });

        const updateDrag = (event) => {
            if (!dragState) return;
            if (dragState.pointerId != null && event?.pointerId !== dragState.pointerId) return;
            updatePanelSheetDragFromEvent(event, dragState.startY);
            event.preventDefault?.();
            event.stopPropagation?.();
        };

        header.addEventListener('pointermove', updateDrag, { passive: false });
        root.addEventListener('pointermove', updateDrag, { passive: false });
        document.addEventListener('pointermove', updateDrag, { capture: true, passive: false });

        const finishDrag = (event, { cancelled = false } = {}) => {
            if (!dragState) return;
            if (dragState.pointerId != null && event?.pointerId !== dragState.pointerId) return;
            endPanelSheetDragFromEvent(event, { cancelled, fallbackY: dragState.startY });
            try {
                header.releasePointerCapture?.(event.pointerId);
            } catch {
                // ignore pointer-capture gaps in older webviews
            }
            dragState = null;
            event.preventDefault?.();
            event.stopPropagation?.();
        };

        header.addEventListener('pointerup', finishDrag, { passive: false });
        root.addEventListener('pointerup', finishDrag, { passive: false });
        document.addEventListener('pointerup', finishDrag, { capture: true, passive: false });
        header.addEventListener('pointercancel', (event) => finishDrag(event, { cancelled: true }), { passive: false });
        root.addEventListener('pointercancel', (event) => finishDrag(event, { cancelled: true }), { passive: false });
        document.addEventListener('pointercancel', (event) => finishDrag(event, { cancelled: true }), { capture: true, passive: false });
        header.addEventListener('lostpointercapture', (event) => finishDrag(event, { cancelled: true }), { passive: false });
    }

    createMobileSheetPullDownController({
        scrollEl: body,
        doc: document,
        isEnabled: canDragMobilePanel,
        canStartGesture: (event) => !event?.target?.closest?.('.panel-timetable.is-expanded'),
        beginSheetDrag: beginPanelSheetDragFromEvent,
        updateSheetDrag: (event) => updatePanelSheetDragFromEvent(event),
        endSheetDrag: (event, options) => endPanelSheetDragFromEvent(event, options)
    });

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
    tripDetailHeader.appendChild(tripDetailCaptureBtn);

    const tripDetailBody = document.createElement('div');
    tripDetailBody.className = 'panel-trip-detail-body';

    createMobileSheetPullDownController({
        scrollEl: tripDetailBody,
        doc: document,
        isEnabled: canDragMobilePanel,
        beginSheetDrag: beginPanelSheetDragFromEvent,
        updateSheetDrag: (event) => updatePanelSheetDragFromEvent(event),
        endSheetDrag: (event, options) => endPanelSheetDragFromEvent(event, options)
    });

    tripDetailRoot.appendChild(tripDetailHeader);
    tripDetailRoot.appendChild(tripDetailBody);
    document.body.appendChild(tripDetailRoot);

    const tripDetailView = createPanelTripDetailView({
        mobileActionRow: dayActionRow,
        mobileCaptureButton: tripDetailCaptureBtn,
        root: tripDetailRoot,
        mobileHost: panel,
        panelRoot: root,
        mobileTitleMain: titleMain,
        mobileTitleSub: titleSub,
        title: tripDetailTitle,
        body: tripDetailBody
    });

    const layout = ({ presentation } = {}) => {
        const shellLayout = panelComposition.shell?.layout?.() || {};
        const activePresentation = presentation || shellLayout.presentation || root.getAttribute?.('data-panel-presentation') || 'desktop';

        if (activePresentation === 'mobile') {
            timeOverlay.style.top = 'calc(env(safe-area-inset-top, 0px) + 10px)';
            timeOverlay.style.right = '10px';
            timeOverlay.style.bottom = '';
            timeOverlay.style.left = 'auto';
        } else {
            timeOverlay.style.top = '10px';
            timeOverlay.style.right = '194px';
            timeOverlay.style.bottom = '';
            timeOverlay.style.left = '';
        }

        try {
            const br = window.getComputedStyle(panel).borderRadius;
            if (br) {
                panel.style.borderRadius = br;
            }
        } catch {
            // ignore
        }

        syncMobileDrawerState();
        return shellLayout;
    };

    return {
        body,
        btnAutoNow,
        btnHoliday,
        btnViewGrid,
        btnViewList,
        btnWeekday,
        datePanel,
        datePickerInput,
        dateTimePickerView,
        dayPrintBtn,
        daySeg,
        formatDateInputValue,
        formatPanelDateText,
        header,
        mapSelectController,
        panel,
        parseDateInputValue,
        root,
        timeControl,
        timeInput,
        timeOverlay,
        timePickerController,
        title,
        titleMain,
        titleSub,
        tripDetailBody,
        tripDetailBackBtn,
        tripDetailBackIcon,
        tripDetailCaptureBtn,
        tripDetailCaptureIcon,
        tripDetailHeader,
        tripDetailRoot,
        tripDetailTitle,
        tripDetailView,
        layout,
        viewToggle
    };
};
