export const createPanelMainView = ({
    panelComposition,
    panelContentApi,
    createPanelMapSelectController,
    createPanelTimePickerController,
    getIconCandidates,
    getPreferredCachedImageSrc,
    setImageElementFromCache,
    isSaturdayHoliday,
    stopEvent,
    stopPropagationOnly,
    setTimePickerOpenState,
    getJourneyStationContext,
    onJourneyStationSelect,
    toText = (value) => String(value ?? '').trim(),
    zIndex = 9999
} = {}) => {
    const root = panelComposition.root;
    const panel = panelComposition.panel;

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

    const applyStationToJourneyField = (field) => {
        const context = typeof getJourneyStationContext === 'function'
            ? getJourneyStationContext({ titleMain })
            : {};
        const stationId = toText(context?.stationId);
        const stationName = toText(context?.stationName) || toText(titleMain.textContent);
        if (!stationId && !stationName) return;
        onJourneyStationSelect?.({ field, stationId, stationName });
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

    const body = document.createElement('div');
    body.setAttribute('data-panel-body', '');
    body.className = 'panel-list';
    body.style.flex = '1 1 auto';
    body.style.paddingLeft = '10px';
    body.style.paddingRight = '10px';
    body.style.overflowY = 'auto';
    body.style.overflowX = 'hidden';

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

    tripDetailRoot.appendChild(tripDetailHeader);
    tripDetailRoot.appendChild(tripDetailBody);
    document.body.appendChild(tripDetailRoot);

    return {
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
        timeControl,
        timeInput,
        timeOverlay,
        timePickerController,
        title,
        titleMain,
        titleSub,
        tripDetailBody,
        tripDetailCaptureBtn,
        tripDetailCaptureIcon,
        tripDetailHeader,
        tripDetailRoot,
        tripDetailTitle,
        viewToggle
    };
};
