/**
 * 右侧弹出界面：点击站点/站名时展示站名标题。
 * 约束：不引入新配色/主题；panel 样式使用 panel-* 前缀与 search/popup/menu 隔离。
 */

const toText = (v) => String(v ?? '').trim();

const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

const isTouchLikePointer = (pt) => pt === 'touch' || pt === 'pen';

const readPointerType = (evt) => {
    const pt = evt?.pointerType;
    if (pt) return String(pt);
    const t = evt?.type;
    if (t && String(t).startsWith('touch')) return 'touch';
    return 'mouse';
};

function readStationName(props) {
    const p = props || {};
    return toText(p.name_zh || p['name:zh'] || p.name || p.name_ja || p['name:ja'] || '');
}

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

const formatTimeWithPlus = (hhmm, isNextDaySegment) => {
    const s = toText(hhmm);
    if (!s) return '';
    return isNextDaySegment ? `${s}` : s;
};

const pickTitleZhHans = (titleObj) => {
    const t = titleObj || {};
    return toText(t['zh-Hans'] || t.zh || t.ja || t.en || '');
};

let stationsIndexPromise = null;
const getStationsIndex = async () => {
    if (stationsIndexPromise) return stationsIndexPromise;
    stationsIndexPromise = (async () => {
        try {
            const resp = await fetch('./data/stations.json');
            if (!resp.ok) return { idToNameZh: new Map(), stationIdByRailwayAndNameZh: new Map() };
            const list = await resp.json();
            const idToNameZh = new Map();
            const stationIdByRailwayAndNameZh = new Map();
            for (const s of Array.isArray(list) ? list : []) {
                const id = toText(s?.id);
                if (!id) continue;
                const railway = toText(s?.railway);
                const name = pickTitleZhHans(s?.title) || id;
                idToNameZh.set(id, name);

                if (railway && name) {
                    const k = `${railway}||${name}`;
                    if (!stationIdByRailwayAndNameZh.has(k)) {
                        stationIdByRailwayAndNameZh.set(k, id);
                    }
                }
            }
            return { idToNameZh, stationIdByRailwayAndNameZh };
        } catch {
            return { idToNameZh: new Map(), stationIdByRailwayAndNameZh: new Map() };
        }
    })();
    return stationsIndexPromise;
};

let stationGroupsIndexPromise = null;
const getStationGroupsIndex = async () => {
    if (stationGroupsIndexPromise) return stationGroupsIndexPromise;
    stationGroupsIndexPromise = (async () => {
        try {
            const resp = await fetch('./data/station-groups.json');
            if (!resp.ok) return new Map();
            const groups = await resp.json();
            const map = new Map(); // stationId -> string[] (all ids in same group)

            for (const g of Array.isArray(groups) ? groups : []) {
                if (!Array.isArray(g)) continue;
                const ids = [];
                for (const chunk of g) {
                    if (!Array.isArray(chunk)) continue;
                    for (const sid of chunk) {
                        const id = toText(sid);
                        if (id) ids.push(id);
                    }
                }
                if (!ids.length) continue;

                // de-dup while preserving order
                const seen = new Set();
                const unique = [];
                for (const id of ids) {
                    if (seen.has(id)) continue;
                    seen.add(id);
                    unique.push(id);
                }

                for (const id of unique) {
                    const existing = map.get(id);
                    if (!existing) {
                        map.set(id, unique);
                        continue;
                    }
                    // merge (just in case a station appears in multiple groups)
                    const mergedSeen = new Set(existing);
                    const merged = existing.slice();
                    for (const x of unique) {
                        if (mergedSeen.has(x)) continue;
                        mergedSeen.add(x);
                        merged.push(x);
                    }
                    map.set(id, merged);
                }
            }

            return map;
        } catch {
            return new Map();
        }
    })();
    return stationGroupsIndexPromise;
};

let trainTypesIndexPromise = null;
const getTrainTypesIndex = async () => {
    if (trainTypesIndexPromise) return trainTypesIndexPromise;
    trainTypesIndexPromise = (async () => {
        try {
            const resp = await fetch('./data/train-types.json');
            if (!resp.ok) return new Map();
            const list = await resp.json();
            const map = new Map();
            for (const t of Array.isArray(list) ? list : []) {
                const id = toText(t?.id);
                if (!id) continue;
                const name = pickTitleZhHans(t?.title) || id;
                map.set(id, name);
            }
            return map;
        } catch {
            return new Map();
        }
    })();
    return trainTypesIndexPromise;
};

let trainTypeColorIndexPromise = null;
const getTrainTypeColorIndex = async () => {
    if (trainTypeColorIndexPromise) return trainTypeColorIndexPromise;
    trainTypeColorIndexPromise = (async () => {
        try {
            const resp = await fetch('./data/train-types.json');
            if (!resp.ok) return new Map();
            const list = await resp.json();
            const map = new Map();
            for (const t of Array.isArray(list) ? list : []) {
                const id = toText(t?.id);
                if (!id) continue;
                const color = toText(t?.color);
                if (!color) continue;
                map.set(id, color);
            }
            return map;
        } catch {
            return new Map();
        }
    })();
    return trainTypeColorIndexPromise;
};

const normalizeArrayLike = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value ? [value] : [];

    const s = value.trim();
    if (s.startsWith('[') && s.endsWith(']')) {
        try {
            const parsed = JSON.parse(s);
            return Array.isArray(parsed) ? parsed : [value];
        } catch {
            return [value];
        }
    }
    return s ? [s] : [];
};

function buildCompaniesHtml(props = {}, { getLineMeta, companyLogoMap, lineStationNameByLineId } = {}) {
    const servingIdsRaw = normalizeArrayLike(props.serving_ids);
    const servingIds = servingIdsRaw.map(String).filter(Boolean);
    const servingLinesRaw = normalizeArrayLike(props.serving_lines);
    const servingLines = servingLinesRaw.map(String).filter(Boolean);

    const safeGetLineMeta = typeof getLineMeta === 'function' ? getLineMeta : (() => null);
    const logoMap = companyLogoMap || {};

    const groups = new Map(); // company -> [{ lineId, displayName, color }]
    const seenLineIds = new Set();

    for (const lineId of servingIds) {
        const id = String(lineId);
        if (!id || seenLineIds.has(id)) continue;
        seenLineIds.add(id);

        const meta = safeGetLineMeta(id);
        const company = (meta?.company ? String(meta.company) : '未知公司').trim() || '未知公司';
        const color = meta?.color || null;
        const abb = logoMap?.[company]?.abb || logoMap?.[company]?.zh || company;

        let displayName = String(meta?.name || '').trim();
        if (!displayName) {
            displayName = servingLines.find((s) => typeof s === 'string' && s.includes(abb)) || servingLines[0] || id;
            displayName = String(displayName).trim();
        }

        const isSpecial = displayName === `${abb}线` || displayName === `${abb}本线` || displayName === `${abb}新线`;
        if (!isSpecial && abb) displayName = displayName.replace(abb, '').trim();

        if (!groups.has(company)) groups.set(company, []);
        groups.get(company).push({ lineId: id, displayName, color });
    }

    if (!groups.size && servingLines.length) {
        const company = '未知公司';
        const lines = servingLines.map((s) => ({ displayName: String(s).trim(), color: null }));
        groups.set(company, lines);
    }

    let companiesHtml = '';
    for (const [company, lines] of groups) {
        const companyZh = logoMap?.[company]?.zh || null;
        const companyDisplay = String(companyZh || company);

        const logoFile = logoMap?.[company]?.img?.[0] || null;
        const logoBase = (() => {
            try {
                return window.TokyoRailCompanyLogoBasePath || './companyLogos/';
            } catch {
                return './companyLogos/';
            }
        })();
        const logoSrc = logoFile
            ? (String(logoBase).endsWith('/') ? `${logoBase}${logoFile}` : `${logoBase}/${logoFile}`)
            : null;
        const logoHtml = logoSrc
            ? `<img class="panel-company-logo" src="${escapeHtml(logoSrc)}" alt="" />`
            : '';

        let linesHtml = '';
        for (const line of lines) {
            const style = typeof line.color === 'string' && line.color.trim() ? ` style="color:${escapeHtml(line.color.trim())}"` : '';
            const idAttr = line.lineId ? ` data-line-id="${escapeHtml(String(line.lineId))}"` : '';
            const transferStationName = line.lineId
                ? toText(lineStationNameByLineId?.get?.(line.lineId) || lineStationNameByLineId?.[line.lineId])
                : '';
            const suffixHtml = transferStationName
                ? `<span class="panel-line-name-suffix">（${escapeHtml(transferStationName)}站）</span>`
                : '';

            // 线路条目：标题行 + 班次容器（内部按方向 d 分组；方向可展开/收回）
            linesHtml += `
                <div class="panel-line"${idAttr}${style}>
                    <div class="panel-line-header">
                        <span class="panel-line-name">${escapeHtml(line.displayName)}${suffixHtml}</span>
                    </div>
                    <div class="panel-timetable-root" data-timetable-root="1"></div>
                </div>
            `;
        }

        companiesHtml += `
            <div class="panel-company">
                <div class="panel-company-header" data-company="${escapeHtml(company)}">${logoHtml}<span class="panel-company-name">${escapeHtml(companyDisplay)}</span></div>
                <div class="panel-company-lines">${linesHtml}</div>
            </div>
        `;
    }

    return `<div class="panel-popup is-interactive">${companiesHtml}</div>`;
}

export function createPanel(options = {}) {
    const widthPx = Number.isFinite(options.widthPx) ? options.widthPx : 320;
    const rightPx = Number.isFinite(options.rightPx) ? options.rightPx : 20;
    const zIndex = Number.isFinite(options.zIndex) ? options.zIndex : 9999;

    const hoverDelayMs = Number.isFinite(options.hoverDelayMs) ? options.hoverDelayMs : 50;
    const getLineMeta = typeof options.getLineMeta === 'function' ? options.getLineMeta : (() => null);
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
    const onDirPreviewEnter = typeof options.onDirPreviewEnter === 'function' ? options.onDirPreviewEnter : null;
    const onDirPreviewLeave = typeof options.onDirPreviewLeave === 'function' ? options.onDirPreviewLeave : null;
    const settingsContentEl = options.settingsContentEl && options.settingsContentEl.appendChild ? options.settingsContentEl : null;
    const getTimetableViewMode = typeof options.getTimetableViewMode === 'function' ? options.getTimetableViewMode : null;
    const getHoverPreviewEnabled = typeof options.getHoverPreviewEnabled === 'function' ? options.getHoverPreviewEnabled : null;
    let hoverPreviewEnabled = getHoverPreviewEnabled ? getHoverPreviewEnabled() !== false : true;
    const isHoverPreviewEnabled = () => hoverPreviewEnabled !== false;

    const buildTransferLineStationNameMap = async ({ stationId, stationNameZh, servingLineIds }) => {
        const sid = toText(stationId);
        const clickedName = toText(stationNameZh);
        const lineIds = Array.isArray(servingLineIds) ? servingLineIds.map((x) => toText(x)).filter(Boolean) : [];
        const out = new Map();
        if (!sid || !lineIds.length) return out;

        try {
            const [groupsIndex, stationsIndex] = await Promise.all([getStationGroupsIndex(), getStationsIndex()]);
            const groupIdsRaw = groupsIndex?.get?.(sid);
            const groupIds = Array.isArray(groupIdsRaw) && groupIdsRaw.length
                ? groupIdsRaw.map((x) => toText(x)).filter(Boolean)
                : [sid];

            for (const lineId of lineIds) {
                const candidateId = groupIds.find((gid) => gid === lineId || gid.startsWith(`${lineId}.`));
                if (!candidateId) continue;
                const transferName = toText(stationsIndex?.idToNameZh?.get?.(candidateId) || '');
                if (!transferName) continue;
                if (clickedName && transferName === clickedName) continue;
                out.set(lineId, transferName);
            }
        } catch {
            return out;
        }

        return out;
    };

    const root = document.createElement('div');
    root.setAttribute('data-panel-root', '');
    root.style.position = 'fixed';
    root.style.right = `${rightPx}px`;
    root.style.zIndex = 9000;
    root.style.width = `${widthPx}px`;
    root.style.maxWidth = 'calc(100vw - 20px)';

    // 从右侧滑入/滑出
    root.style.transform = 'translateX(calc(100% + 24px))';
    root.style.transition = 'transform 0.2s ease';

    // 面板主体：视觉同 search-results，但 class 使用 panel-* 隔离
    const panel = document.createElement('div');
    panel.className = 'panel-container';
    panel.style.marginTop = '0';
    panel.style.maxHeight = 'none';
    panel.style.height = '100%';
    panel.style.opacity = '1';
    panel.style.overflow = 'hidden';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';

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
    title.style.fontSize = '30px';
    title.style.lineHeight = '1.2';
    title.style.fontWeight = '700';
    title.style.color = 'var(--ui-text, #111)';
    title.style.whiteSpace = 'nowrap';
    title.style.overflow = 'hidden';
    title.style.textOverflow = 'ellipsis';
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
    dayToggle.appendChild(daySeg);

    // 时间控件：覆盖 panel 中的“当前时间”（用于判断已过/未来与默认定位）
    const timeControl = document.createElement('div');
    timeControl.className = 'settings-item-control settings-time-control';

    const timeLabel = document.createElement('span');
    timeLabel.className = 'settings-item-title';
    timeLabel.textContent = '时间';

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
    {
        const candidates = ['./icons/clockwise.svg', '/icons/clockwise.svg'];
        let idx = 0;
        autoNowIcon.src = candidates[idx];
        autoNowIcon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) autoNowIcon.src = candidates[idx];
        });
    }
    btnAutoNow.appendChild(autoNowIcon);

    const timeOps = document.createElement('div');
    timeOps.className = 'settings-time-ops';
    timeOps.appendChild(timeInput);
    timeOps.appendChild(btnAutoNow);

    const timePicker = document.createElement('div');
    timePicker.className = 'settings-time-picker is-hidden';
    timePicker.style.position = 'fixed';
    timePicker.style.zIndex = String(zIndex + 3);

    const timePickerHourCol = document.createElement('div');
    timePickerHourCol.className = 'settings-time-picker-col';
    const timePickerHourList = document.createElement('div');
    timePickerHourList.className = 'settings-time-picker-list';
    timePickerHourCol.appendChild(timePickerHourList);

    const timePickerMinuteCol = document.createElement('div');
    timePickerMinuteCol.className = 'settings-time-picker-col';
    const timePickerMinuteList = document.createElement('div');
    timePickerMinuteList.className = 'settings-time-picker-list';
    timePickerMinuteCol.appendChild(timePickerMinuteList);

    const timePickerState = {
        open: false,
        hour: null,
        minute: null,
        hourButtons: [],
        minuteButtons: []
    };

    const setTimePickerOpenState = (open) => {
        try {
            window.__TokyoRailTimePickerOpen = !!open;
        } catch {
            // ignore
        }
    };

    const formatTwoDigits = (v) => String(Number(v)).padStart(2, '0');
    const normalizeHHMM = (value) => {
        const s = toText(value);
        const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
        if (!m) return '';
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
        return `${formatTwoDigits(hh)}:${formatTwoDigits(mm)}`;
    };

    const parsePickerSeed = () => {
        const normalized = normalizeHHMM(timeInput.value);
        if (normalized) {
            const [h, m] = normalized.split(':').map((x) => Number(x));
            return { hour: h, minute: m };
        }

        const now = new Date();
        return { hour: now.getHours(), minute: now.getMinutes() };
    };

    const applyPickerSelectionUi = () => {
        for (const btn of timePickerState.hourButtons) {
            const selected = Number(btn?.dataset?.value) === timePickerState.hour;
            btn.classList.toggle('is-selected', selected);
        }
        for (const btn of timePickerState.minuteButtons) {
            const selected = Number(btn?.dataset?.value) === timePickerState.minute;
            btn.classList.toggle('is-selected', selected);
        }
    };

    const scrollPickerSelectionIntoView = () => {
        const hourBtn = timePickerState.hourButtons.find((x) => Number(x?.dataset?.value) === timePickerState.hour);
        const minuteBtn = timePickerState.minuteButtons.find((x) => Number(x?.dataset?.value) === timePickerState.minute);
        hourBtn?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        minuteBtn?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    };

    const applyPickerValueToInput = () => {
        if (!Number.isFinite(timePickerState.hour) || !Number.isFinite(timePickerState.minute)) return;
        const value = `${formatTwoDigits(timePickerState.hour)}:${formatTwoDigits(timePickerState.minute)}`;
        if (toText(timeInput.value) !== value) {
            timeInput.value = value;
            timeInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    const positionTimePicker = () => {
        if (!timePickerState.open) return;
        const rect = timeInput.getBoundingClientRect();
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const pickerRect = timePicker.getBoundingClientRect();
        const pickerW = Math.max(168, Math.ceil(pickerRect.width || 168));
        const pickerH = Math.max(120, Math.ceil(pickerRect.height || 196));
        const gap = 6;

        let left = rect.right - pickerW;
        left = Math.max(8, Math.min(left, Math.max(8, viewportW - pickerW - 8)));

        const canShowBelow = rect.bottom + gap + pickerH <= viewportH - 8;
        const top = canShowBelow
            ? Math.min(viewportH - pickerH - 8, rect.bottom + gap)
            : Math.max(8, rect.top - gap - pickerH);

        timePicker.style.left = `${Math.round(left)}px`;
        timePicker.style.top = `${Math.round(top)}px`;
    };

    const closeTimePicker = () => {
        if (!timePickerState.open) return;
        timePickerState.open = false;
        timePicker.classList.add('is-hidden');
        setTimePickerOpenState(false);
    };

    const openTimePicker = () => {
        const seed = parsePickerSeed();
        timePickerState.hour = seed.hour;
        timePickerState.minute = seed.minute;
        applyPickerSelectionUi();
        timePicker.classList.remove('is-hidden');
        timePickerState.open = true;
        setTimePickerOpenState(true);
        scrollPickerSelectionIntoView();
        positionTimePicker();
    };

    const confirmTimePickerSelection = () => {
        applyPickerValueToInput();
        closeTimePicker();
    };

    const buildPickerOptionButton = (value, type) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'settings-time-picker-option';
        btn.textContent = formatTwoDigits(value);
        btn.dataset.value = String(value);
        btn.dataset.type = type;
        btn.addEventListener('click', (evt) => {
            stopEvent(evt);
            if (type === 'hour') timePickerState.hour = value;
            else timePickerState.minute = value;
            applyPickerSelectionUi();
            scrollPickerSelectionIntoView();
        }, { passive: false });
        return btn;
    };

    const timePickerActions = document.createElement('div');
    timePickerActions.className = 'settings-time-picker-actions';

    const timePickerCancelBtn = document.createElement('button');
    timePickerCancelBtn.type = 'button';
    timePickerCancelBtn.className = 'settings-time-picker-btn settings-time-picker-btn-cancel';
    timePickerCancelBtn.textContent = '取消';
    timePickerCancelBtn.addEventListener('click', (evt) => {
        stopEvent(evt);
        closeTimePicker();
    }, { passive: false });

    const timePickerConfirmBtn = document.createElement('button');
    timePickerConfirmBtn.type = 'button';
    timePickerConfirmBtn.className = 'settings-time-picker-btn settings-time-picker-btn-confirm';
    timePickerConfirmBtn.textContent = '确认';
    timePickerConfirmBtn.addEventListener('click', (evt) => {
        stopEvent(evt);
        confirmTimePickerSelection();
    }, { passive: false });

    timePickerActions.appendChild(timePickerCancelBtn);
    timePickerActions.appendChild(timePickerConfirmBtn);

    for (let h = 0; h < 24; h += 1) {
        const btn = buildPickerOptionButton(h, 'hour');
        timePickerState.hourButtons.push(btn);
        timePickerHourList.appendChild(btn);
    }
    for (let m = 0; m < 60; m += 1) {
        const btn = buildPickerOptionButton(m, 'minute');
        timePickerState.minuteButtons.push(btn);
        timePickerMinuteList.appendChild(btn);
    }

    timePicker.appendChild(timePickerHourCol);
    timePicker.appendChild(timePickerMinuteCol);
    timePicker.appendChild(timePickerActions);
    timePicker.addEventListener('pointerdown', (e) => stopPropagationOnly(e), { passive: true });
    timePicker.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    timePicker.addEventListener('click', (e) => stopEvent(e), { passive: false });
    document.body.appendChild(timePicker);

    timeControl.appendChild(timeLabel);
    timeControl.appendChild(timeOps);

    controls.appendChild(dayToggle);
    header.appendChild(controls);

    // 内容区：承载 popup 同结构的公司/线路列表
    const body = document.createElement('div');
    body.setAttribute('data-panel-body', '');
    body.className = 'panel-list';
    body.style.flex = '1 1 auto';
    body.style.paddingLeft = '10px';
    body.style.paddingRight = '10px';
    body.style.overflowY = 'auto';
    body.style.overflowX = 'hidden';

    panel.appendChild(header);
    panel.appendChild(body);
    root.appendChild(panel);

    // 防止点击面板穿透到地图（触发“点击空白处恢复/收起搜索”等）
    // 用 bubble 阶段拦截，避免阻断面板内部的点击/触屏事件处理
    root.addEventListener('pointerdown', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('pointermove', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('touchmove', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('click', (e) => stopEvent(e), { passive: false });

    document.body.appendChild(root);

    // 地图右上：站名开关下方的时间控件浮层（z-index 高于 panel）
    const timeOverlay = document.createElement('div');
    timeOverlay.className = 'settings-item settings-item-time';
    timeOverlay.style.display = 'flex';
    timeOverlay.appendChild(timeControl);
    timeOverlay.addEventListener('pointerdown', (e) => stopPropagationOnly(e), { passive: true });
    timeOverlay.addEventListener('pointermove', (e) => stopPropagationOnly(e), { passive: true });
    timeOverlay.addEventListener('touchmove', (e) => stopPropagationOnly(e), { passive: true });
    timeOverlay.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    timeOverlay.addEventListener('click', (e) => stopEvent(e), { passive: false });
    if (settingsContentEl) {
        settingsContentEl.appendChild(timeOverlay);
    } else {
        timeOverlay.style.position = 'fixed';
        timeOverlay.style.zIndex = String(zIndex + 2);
        document.body.appendChild(timeOverlay);
    }

    // 右侧 panel 左侧弹出的班次详情面板
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
    tripDetailRoot.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    tripDetailRoot.addEventListener('mouseenter', () => {
        if (isTouchLikePointer(lastPointerType)) return;
        tripDetailPinned = true;
        clearTripDetailHideTimer();
    });
    tripDetailRoot.addEventListener('mouseleave', () => {
        if (isTouchLikePointer(lastPointerType)) return;
        if (tripLocked) {
            tripDetailPinned = true;
            clearTripDetailHideTimer();
            return;
        }
        tripDetailPinned = false;
        scheduleTripDetailHide();
    });

    // ===== 交互状态（对齐 popup 的逻辑） =====
    let lastPointerType = 'mouse';
    let suppressMouseEventsUntilMs = 0;

    let tapArmedKey = null; // 触屏：线路两段式点击

    let hoverTimerId = null;
    let hoverCandidateKey = null;
    let lastFiredHoverKey = null;

    let lastAppliedHoverKey = null;
    let restoreTimerId = null;
    const restoreDelayMs = Math.max(hoverDelayMs, 60);

    let currentStationServingIds = [];
    let currentStationId = null;
    let currentStationNameZh = '';
    let stationRenderToken = 0;

    // 时刻表日类型过滤
    let currentServiceDay = 'Weekday'; // 'Weekday' | 'SaturdayHoliday'

    // 可选：覆盖显示的“当前时间”（HH:MM）；为空则使用真实时间
    let currentNowOverrideHHMM = '';
    let isAutoNowClock = true;
    let autoNowClockTimerId = null;
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
            renderAllTimetables();
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
        syncAutoNowClock({ forceRender: true });
    };

    let mouseArmedKey = null;
    let timetableRenderToken = 0;
    let lastTripDetailKey = null;
    let tripArmedKey = null;
    let tripLocked = false;
    let lockedTripKey = null;
    const tripHighlightDelayMs = 500;
    let tripHighlightTimerId = null;
    let tripHighlightCandidateKey = null;
    let tripHighlightAppliedKey = null;

    let tripDetailToken = 0;
    let tripDetailPinned = false;
    let tripDetailHideTimer = null;
    let timetableViewMode = 'list';
    let pendingGridDataDebugLog = false;
    const gridDataDebugByLineId = new Map();

    const TYPE_BASE_SEQUENCE = ['特急', '急行', '准急', '快速', '普通'];

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

    const buildDirectionGridHints = (rowsForDir) => {
        const rows = Array.isArray(rowsForDir) ? rowsForDir : [];

        const typeCount = new Map();
        const typeColorByName = new Map();
        const terminalCount = new Map();

        for (const row of rows) {
            const typeName = toText(row?.typeName);
            if (typeName) {
                typeCount.set(typeName, (typeCount.get(typeName) || 0) + 1);
                if (!typeColorByName.has(typeName)) {
                    const c = toText(row?.typeColor);
                    if (c) typeColorByName.set(typeName, c);
                }
            }

            const terminalName = toText(row?.terminalName || row?.destName);
            if (terminalName) terminalCount.set(terminalName, (terminalCount.get(terminalName) || 0) + 1);
        }

        const typeNames = sortTypeNamesForGridHint(Array.from(typeCount.keys()), typeCount);
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
        const terminalAbbrMap = buildUniqueLeadAbbrMap(terminalNames);
        const terminalHints = terminalNames.map((name) => ({
            full: name,
            abbr: toText(terminalAbbrMap.get(name)) || toText(name).slice(0, 1),
            count: Number(terminalCount.get(name) || 0)
        }));

        return { typeHints, terminalHints };
    };

    const applyTimetableViewMode = (mode, { rerender = true } = {}) => {
        const next = normalizeTimetableViewMode(mode);
        timetableViewMode = next;
        body.setAttribute('data-timetable-view', next);
        body.classList.toggle('is-timetable-view-list', next === 'list');
        body.classList.toggle('is-timetable-view-grid', next === 'grid');
        if (rerender && toText(currentStationId)) renderAllTimetables();
    };

    const clearTripDetailHideTimer = () => {
        if (tripDetailHideTimer != null) {
            clearTimeout(tripDetailHideTimer);
            tripDetailHideTimer = null;
        }
    };

    const clearTripHighlightTimer = () => {
        if (tripHighlightTimerId != null) {
            clearTimeout(tripHighlightTimerId);
            tripHighlightTimerId = null;
        }
        tripHighlightCandidateKey = null;
    };

    const dispatchTripPreview = (previewKey, payload) => {
        if (!onTripPreview) return;
        try {
            tripHighlightAppliedKey = toText(previewKey) || null;
            onTripPreview(payload);
        } catch {
            // ignore
        }
    };

    const showTripCurrentStationHint = () => {
        if (!onTripCurrentStationShow) return;
        const sid = toText(currentStationId);
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
        if (!onTripPreview) return;
        if (!immediate && !isHoverPreviewEnabled()) return;

        if (immediate) {
            clearTripHighlightTimer();
            dispatchTripPreview(previewKey, payload);
            return;
        }

        clearTripHighlightTimer();
        tripHighlightCandidateKey = toText(previewKey);
        const key = tripHighlightCandidateKey;
        tripHighlightTimerId = setTimeout(() => {
            tripHighlightTimerId = null;
            if (tripHighlightCandidateKey !== key) return;
            tripHighlightCandidateKey = null;
            dispatchTripPreview(previewKey, payload);
        }, tripHighlightDelayMs);
    };

    const scheduleTripDetailHide = (delayMs = 220) => {
        clearTripDetailHideTimer();
        tripDetailHideTimer = setTimeout(() => {
            tripDetailHideTimer = null;
            if (!tripDetailPinned) {
                hideTripDetail();
                lastTripDetailKey = null;
            }
        }, delayMs);
    };

    const lockTripPreview = (tripKey) => {
        tripLocked = true;
        lockedTripKey = toText(tripKey) || null;
        tripDetailPinned = true;
        clearTripDetailHideTimer();
    };

    const unlockTripPreview = () => {
        tripLocked = false;
        lockedTripKey = null;
        tripArmedKey = null;
        tripDetailPinned = false;
    };

    // expanded state per (lineId, direction)
    let expandedDirKeys = new Set();
    const dirFilterStateByKey = new Map(); // lineId||dir -> { origins:Set, terminals:Set, types:Set }
    const dirFilterToggleModeByKey = new Map(); // lineId||dir -> true:全选模式(显式), false:取消全选模式(隐式全量)
    const dirFilterRowsByKey = new Map(); // lineId||dir -> Array<{origin,terminal,type}>
    const dirPreviewMetaByKey = new Map(); // lineId||dir -> { lineId, originStationIds:string[], terminalStationIds:string[] }
    let activeDirPreviewKey = '';
    const makeLineDirKey = (lineId, dirKey) => `${toText(lineId)}||${toText(dirKey) || 'Unknown'}`;
    const dirKeyOf = (lineId, dir) => `${toText(lineId)}||${toText(dir) || 'Unknown'}`;
    const isDirExpanded = (lineId, dir) => expandedDirKeys.has(dirKeyOf(lineId, dir));
    const setDirExpanded = (lineId, dir, expanded) => {
        const k = dirKeyOf(lineId, dir);
        if (!k) return;
        if (expanded) expandedDirKeys.add(k);
        else expandedDirKeys.delete(k);
    };

    const applyDirPreviewByKey = (lineDirKey, { force = false } = {}) => {
        const key = toText(lineDirKey);
        if (!key) return;
        if (!force && activeDirPreviewKey === key) return;
        const meta = dirPreviewMetaByKey.get(key);
        if (!meta) return;
        activeDirPreviewKey = key;
        try {
            onDirPreviewEnter?.({
                lineId: toText(meta.lineId),
                originStationIds: Array.isArray(meta.originStationIds) ? meta.originStationIds.slice() : [],
                terminalStationIds: Array.isArray(meta.terminalStationIds) ? meta.terminalStationIds.slice() : []
            });
        } catch {
            // ignore
        }
    };

    const clearDirPreview = () => {
        if (!activeDirPreviewKey) return;
        activeDirPreviewKey = '';
        try {
            onDirPreviewLeave?.();
        } catch {
            // ignore
        }
    };

    const applyDayToggleUi = () => {
        const day = currentServiceDay;
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

    timeInput.addEventListener('input', (e) => {
        stopEvent(e);
        const normalized = normalizeHHMM(timeInput.value);
        const v = normalized || toText(timeInput.value) || '';
        if (!v) {
            isAutoNowClock = true;
            syncAutoNowClock({ forceRender: true });
            return;
        }

        isAutoNowClock = false;
        currentNowOverrideHHMM = v;
        renderAllTimetables();
    });
    timeInput.addEventListener('blur', () => {
        const normalized = normalizeHHMM(timeInput.value);
        if (normalized) timeInput.value = normalized;
    });
    timeInput.addEventListener('click', (e) => {
        stopEvent(e);
        openTimePicker();
    }, { passive: false });
    timeInput.addEventListener('focus', () => {
        openTimePicker();
    });
    window.addEventListener('resize', () => {
        positionTimePicker();
    });
    window.addEventListener('scroll', () => {
        positionTimePicker();
    }, true);
    document.addEventListener('pointerdown', (evt) => {
        if (!timePickerState.open) return;
        const t = evt?.target;
        if (t && (timeOps.contains(t) || timePicker.contains(t))) return;
        closeTimePicker();
    }, true);
    document.addEventListener('keydown', (evt) => {
        if (!timePickerState.open) return;
        if (evt?.key === 'Escape') {
            closeTimePicker();
            return;
        }
        if (evt?.key === 'Enter') {
            stopEvent(evt);
            confirmTimePickerSelection();
        }
    });
    btnAutoNow.addEventListener('click', (e) => {
        stopEvent(e);
        closeTimePicker();
        restoreAutoNowClock();
    }, { passive: false });

    const loadTimetableForLineId = async (lineId) => {
        const id = toText(lineId);
        if (!id) return null;
        try {
            // Use the global timetable cache instance created in app.js
            const cache = window?.TokyoRailTimetableCache;
            if (!cache) return null;
            const existing = cache.get(id);
            if (existing) return existing;
            await cache.preloadByLineIds([id]);
            return cache.get(id);
        } catch {
            return null;
        }
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

    const findTripByKey = async (lineId, tripKey) => {
        const key = toText(tripKey);
        if (!key) return null;
        const data = await loadTimetableForLineId(lineId);
        const list = Array.isArray(data) ? data : [];
        if (!list.length) return null;

        const candidates = list.filter((t) => {
            const id = toText(t?.id);
            const tkey = toText(t?.t);
            if (id === key || tkey === key) return true;
            return id ? id.startsWith(`${key}.`) : false;
        });

        if (!candidates.length) return null;
        const withDay = candidates.find((t) => {
            const id = toText(t?.id);
            return id.endsWith(`.${currentServiceDay}`);
        });
        return withDay || candidates[0] || null;
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
        return String((hour + 24) % 24);
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

    const buildGridHintsHtml = ({ typeHints, terminalHints }) => {
        const typeLegendItems = (Array.isArray(typeHints) ? typeHints : [])
            .map((item) => {
                const full = toText(item?.full);
                const abbr = toText(item?.abbr);
                const color = toText(item?.color) || '#888';
                if (!full || !abbr) return '';
                const sameLabel = full === abbr;
                const text = sameLabel ? full : `${full}=${abbr}`;
                return `<span class="panel-grid-hint-item panel-grid-hint-item-type" style="color:${escapeHtml(color)}">${escapeHtml(text)}</span>`;
            })
            .filter(Boolean)
            .join('<span class="panel-grid-hint-sep"> / </span>');

        const terminalLegendItems = (Array.isArray(terminalHints) ? terminalHints : [])
            .map((item) => {
                const full = toText(item?.full);
                const abbr = toText(item?.abbr);
                if (!full || !abbr) return '';
                return `<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888">${escapeHtml(abbr)}−${escapeHtml(full)}</span>`;
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
            </div>
        `;
    };

    const buildGridTableHtmlForDirection = ({
        rowsForDir,
        typeHints,
        terminalHints,
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

        const rowHtml = hourWindow.map((hour, idx) => {
            const trips = Array.isArray(byHour.get(hour)) ? byHour.get(hour) : [];
            const bgClass = idx % 2 === 0 ? 'is-alt-a' : 'is-alt-b';
            const focusAttr = expanded && hour === focusStartHour ? ' data-grid-focus-start="1"' : '';
            const currentAttr = (!expanded && hour === currentHourForFocus) ? ' data-grid-current-hour="1"' : '';

            const cellsHtml = trips.length
                ? trips.map((trip, tripIndex) => {
                const typeName = toText(trip?.typeName);
                const destName = toText(trip?.terminalName || trip?.destName);
                const typeAbbr = toText(typeAbbrByName.get(typeName)) || buildTypeAbbr(typeName);
                const destAbbr = toText(terminalAbbrByName.get(destName)) || toText(destName).slice(0, 1);
                const minute = toText(trip?.minuteLabel).slice(0, 2);
                const tripKey = toText(trip?.tripKey);
                const color = toText(trip?.typeColor) || 'var(--ui-text, #111)';
                const tripAttr = tripKey ? ` data-trip-key="${escapeHtml(tripKey)}"` : '';
                const lastClass = tripIndex === trips.length - 1 ? ' is-hour-last' : '';

                    return `
                        <div class="panel-grid-cell panel-grid-cell-trip${lastClass}"${tripAttr}>
                            <span class="panel-grid-trip" style="color:${escapeHtml(color)}">
                                <span class="panel-grid-trip-abbr">[${escapeHtml(typeAbbr)}]${escapeHtml(destAbbr)}</span>
                                <span class="panel-grid-trip-minute">${escapeHtml(minute)}</span>
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

    const findTripTarget = (target) => {
        if (!(target instanceof Element)) return null;
        return target.closest?.('[data-trip-key]') || null;
    };

    const buildTimetableRowsHtml = async ({ lineId, stationId }) => {
        const stationKey = toText(stationId);
        if (!stationKey) return '';

        const [stationsIndex, trainTypesIndex, trainTypeColorIndex, data] = await Promise.all([
            getStationsIndex(),
            getTrainTypesIndex(),
            getTrainTypeColorIndex(),
            loadTimetableForLineId(lineId)
        ]);

        const list = Array.isArray(data) ? data : [];
        if (!list.length) return '';

        const now = getDisplayNowMs();
        const serviceDayStartMs = getServiceDayStartMs(new Date(now));
        const rows = [];

        // Resolve pt/nt refs to get missing arrival/departure times.

        for (const trip of list) {
            // 按 timetables 的 id 最后一段区分工作日/休息日
            const tripId = toText(trip?.id);
            if (tripId) {
                const parts = tripId.split('.').map((x) => x.trim()).filter(Boolean);
                const day = parts.length ? parts[parts.length - 1] : '';
                if (day === 'Weekday' || day === 'SaturdayHoliday') {
                    if (day !== currentServiceDay) continue;
                }
            }

            const tt = Array.isArray(trip?.tt) ? trip.tt : [];
            if (!tt.length) continue;
            const stop = tt.find((x) => toText(x?.s) === stationKey);
            if (!stop) continue;

            let arr = toText(stop?.a);
            let dep = toText(stop?.d);

            const os = Array.isArray(trip?.os) ? trip.os : (trip?.os ? [trip.os] : []);
            const ds = Array.isArray(trip?.ds) ? trip.ds : (trip?.ds ? [trip.ds] : []);
            const ptRefs = Array.isArray(trip?.pt) ? trip.pt : (trip?.pt ? [trip.pt] : []);
            const ntRefs = Array.isArray(trip?.nt) ? trip.nt : (trip?.nt ? [trip.nt] : []);
            const hasPt = ptRefs.some((x) => !!toText(x));
            const hasNt = ntRefs.some((x) => !!toText(x));
            const dir = toText(trip?.d);
            const isLoopDirection = /Loop/i.test(dir);
            const skipCrossTripFillForLoop = isLoopDirection && (hasPt || hasNt);

            const isOriginStation = os.some((x) => toText(x) === stationKey);
            const isTerminalStation = ds.some((x) => toText(x) === stationKey);

            // 真始发/真终点：没有 pt/nt 的端点站，不补全时间
            const showOriginLabel = isOriginStation && !hasPt;
            const showTerminalLabel = isTerminalStation && !hasNt;
            const allowMirrorFill = !(showOriginLabel || showTerminalLabel);

            // (2) If dep missing but has nt, take nt's first stop time as dep.
            if (!dep && !skipCrossTripFillForLoop) {
                const ntRefId = toText(ntRefs?.[0]);
                if (ntRefId) dep = await getNtFirstDepartTime(ntRefId);
            }

            // (2) If arr missing but has pt, take pt's last stop time as arr.
            if (!arr && !skipCrossTripFillForLoop) {
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

            const destId = toText(ds?.[0]);
            const loopDest = (dir === 'InnerLoop' ? '内环' : (dir === 'OuterLoop' ? '外环' : ''));
            const destName = loopDest || (destId ? (stationsIndex?.idToNameZh?.get?.(destId) || destId) : '');
            const originId = toText(os?.[0]);
            const originName = originId ? (stationsIndex?.idToNameZh?.get?.(originId) || originId) : '';
            const terminalName = loopDest || (destId ? (stationsIndex?.idToNameZh?.get?.(destId) || destId) : '');

            const destNamesForDir = (() => {
                if (loopDest) return [loopDest];
                const out = [];
                for (const x of ds) {
                    const id = toText(x);
                    if (!id) continue;
                    out.push(stationsIndex?.idToNameZh?.get?.(id) || id);
                }
                return out.length ? out : (destName ? [destName] : []);
            })();

            const typeId = toText(trip?.y);
            const typeName = typeId ? (trainTypesIndex.get(typeId) || typeId) : '';
            const typeColor = typeId ? toText(trainTypeColorIndex.get(typeId)) : '';

            const tripKey = tripId || toText(trip?.t) || '';

            const arrParsed = arr ? parseHHMMToServiceDayMs(arr, serviceDayStartMs) : null;
            const depParsed = dep ? parseHHMMToServiceDayMs(dep, serviceDayStartMs) : null;

            rows.push({
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
                originId,
                originName,
                terminalId: destId,
                terminalName,
                dir,
                destNamesForDir,
                showOriginLabel,
                showTerminalLabel,
                tripKey
            });
        }

        if (!rows.length) return '';
        rows.sort((a, b) => a.timeMs - b.timeMs);

        // 统计每条线路的所有方向 d，并聚合/计数该方向下所有对应 ds 的中文名
        const DEST_NAME_MIN_COUNT = 0; // 方向下目的地名称至少出现x次才显示
        const dirToDestNames = new Map(); // dir -> Set<string>
        const dirToDestCounts = new Map(); // dir -> Map<string, number>
        for (const r of rows) {
            const k = toText(r.dir) || 'Unknown';
            if (!dirToDestNames.has(k)) dirToDestNames.set(k, new Set());
            if (!dirToDestCounts.has(k)) dirToDestCounts.set(k, new Map());
            const set = dirToDestNames.get(k);
            const counts = dirToDestCounts.get(k);
            const names = Array.isArray(r.destNamesForDir) ? r.destNamesForDir : [];
            for (const n of names) {
                const s = toText(n);
                if (!s) continue;
                set.add(s);
                counts.set(s, (counts.get(s) || 0) + 1);
            }
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

        // 分组显示：默认显示所有方向；方向内默认展示 3 条未来班次
        // Build direction order: collect unique dirs
        const dirOrder = [];
        const dirSeen = new Set();
        for (const r of rows) {
            const k = toText(r.dir) || 'Unknown';
            if (dirSeen.has(k)) continue;
            dirSeen.add(k);
            dirOrder.push(k);
        }

        // Determine if any destination across all directions meets the threshold
        let anyDestAboveThreshold = false;
        for (const [dkey, counts] of dirToDestCounts) {
            for (const [, c] of counts) {
                if (Number(c) >= DEST_NAME_MIN_COUNT) {
                    anyDestAboveThreshold = true;
                    break;
                }
            }
            if (anyDestAboveThreshold) break;
        }

        // Compute ranking metrics per direction: max dest count (primary), total trips (secondary)
        const dirMetrics = new Map();
        for (const dirKey of dirOrder) {
            const counts = dirToDestCounts.get(dirKey) || new Map();
            let maxCount = 0;
            let sumCount = 0;
            for (const [, c] of counts) {
                const n = Number(c) || 0;
                sumCount += n;
                if (n > maxCount) maxCount = n;
            }
            // Fallback: if counts map is empty, use rowsForDir length as estimate
            const rowsForDirLen = rows.filter((r) => (toText(r.dir) || 'Unknown') === dirKey).length;
            if (!sumCount) sumCount = rowsForDirLen;
            if (!maxCount) maxCount = rowsForDirLen ? Math.max(1, Math.floor(rowsForDirLen / 2)) : 0;
            dirMetrics.set(dirKey, { maxCount, sumCount });
        }

        // Sort directions by maxCount desc, then sumCount desc, then dirKey
        dirOrder.sort((a, b) => {
            const ma = dirMetrics.get(a) || { maxCount: 0, sumCount: 0 };
            const mb = dirMetrics.get(b) || { maxCount: 0, sumCount: 0 };
            if (mb.maxCount !== ma.maxCount) return mb.maxCount - ma.maxCount;
            if (mb.sumCount !== ma.sumCount) return mb.sumCount - ma.sumCount;
            return String(a).localeCompare(String(b));
        });

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
            if (!dirFilterToggleModeByKey.has(lineDirKey)) dirFilterToggleModeByKey.set(lineDirKey, true);

            const rowsForDir = rows.filter((r) => (toText(r.dir) || 'Unknown') === dirKey);
            const { typeHints, terminalHints } = buildDirectionGridHints(rowsForDir);
            const filterRowsForDir = rowsForDir
                .map((r) => ({
                    origin: toText(r.originName),
                    terminal: toText(r.terminalName || r.destName),
                    type: toText(r.typeName)
                }))
                .filter((r) => r.origin || r.terminal || r.type);
            dirFilterRowsByKey.set(lineDirKey, filterRowsForDir);

            const allOrigins = new Set(filterRowsForDir.map((r) => toText(r.origin)).filter(Boolean));
            const allTerminals = new Set(filterRowsForDir.map((r) => toText(r.terminal)).filter(Boolean));
            const allTypes = new Set(filterRowsForDir.map((r) => toText(r.type)).filter(Boolean));

            const explicitAllMode = dirFilterToggleModeByKey.get(lineDirKey) !== false;
            let state = dirFilterStateByKey.get(lineDirKey);
            if (!state) {
                state = explicitAllMode
                    ? {
                        origins: new Set(allOrigins),
                        terminals: new Set(allTerminals),
                        types: new Set(allTypes)
                    }
                    : {
                        origins: new Set(),
                        terminals: new Set(),
                        types: new Set()
                    };
                dirFilterStateByKey.set(lineDirKey, state);
            } else {
                const syncBucket = (selected, all) => {
                    const out = new Set();
                    const src = selected instanceof Set ? selected : new Set();
                    for (const value of src) {
                        if (all.has(value)) out.add(value);
                    }
                    return out;
                };
                const synced = {
                    origins: syncBucket(state.origins, allOrigins),
                    terminals: syncBucket(state.terminals, allTerminals),
                    types: syncBucket(state.types, allTypes)
                };
                state = synced;
                dirFilterStateByKey.set(lineDirKey, state);
            }

            const filteredRowsForDir = rowsForDir.filter((r) => {
                const originText = toText(r.originName);
                const terminalText = toText(r.terminalName || r.destName);
                const typeText = toText(r.typeName);
                const originOk = (!explicitAllMode && !state.origins.size) || state.origins.has(originText);
                const terminalOk = (!explicitAllMode && !state.terminals.size) || state.terminals.has(terminalText);
                const typeOk = (!explicitAllMode && !state.types.size) || state.types.has(typeText);
                return originOk && terminalOk && typeOk;
            });

            const uniqueIds = (arr) => Array.from(new Set((Array.isArray(arr) ? arr : []).map((x) => toText(x)).filter(Boolean)));
            dirPreviewMetaByKey.set(lineDirKey, {
                lineId: toText(lineId),
                originStationIds: uniqueIds(filteredRowsForDir.map((r) => r.originId)),
                terminalStationIds: uniqueIds(filteredRowsForDir.map((r) => r.terminalId || r.destId))
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
            const labelEntries = Array.from(labelCount.entries())
                .sort((a, b) => {
                    const dc = Number(b[1]) - Number(a[1]);
                    if (dc) return dc;
                    return String(a[0]).localeCompare(String(b[0]));
                })
                .map(([name]) => name);
            const label = labelEntries.length ? labelEntries.join('，') : (filteredNames.length ? filteredNames.join('，') : dirKey);

            directionDebug.push({
                dirKey,
                dirLabel: label,
                typeHints,
                terminalHints
            });

            const timetableViewClass = timetableViewMode === 'grid' ? 'panel-timetable-view-grid' : 'panel-timetable-view-list';
            const gridHintsHtml = timetableViewMode === 'grid'
                ? buildGridHintsHtml({ typeHints, terminalHints })
                : '';
            const future = filteredRowsForDir.filter((r) => !r.isPast);
            const visible = expanded ? filteredRowsForDir : future.slice(0, 3);
            const timetableHtml = timetableViewMode === 'grid'
                ? buildGridTableHtmlForDirection({
                    rowsForDir: filteredRowsForDir,
                    typeHints,
                    terminalHints,
                    expanded,
                    nowMs: now,
                    serviceDayStartMs
                })
                : (visible.length
                    ? visible
                        .map((r) => {
                            const klass = r.isPast ? 'panel-timetable-row is-past' : 'panel-timetable-row';
                            const tripAttr = r.tripKey ? ` data-trip-key="${escapeHtml(r.tripKey)}"` : '';
                            return `
                                <div class="${klass}"${tripAttr}>
                                    <div class="panel-timetable-dest">
                                        <span class="panel-timetable-dest-prefix" aria-hidden="true">to</span>
                                        <span class="panel-timetable-dest-marquee" aria-label="to ${escapeHtml(r.destName || '')}">
                                            <span class="panel-timetable-dest-marquee-inner">${escapeHtml(r.destName || '')}</span>
                                        </span>
                                    </div>
                                    <div class="panel-timetable-time">${renderTime(r)}</div>
                                    <div class="panel-timetable-type">${escapeHtml(r.typeName || '')}</div>
                                </div>
                            `;
                        })
                        .join('')
                    : '<div class="panel-timetable-empty">当前无班次</div>');

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
                            <button type="button" class="panel-dir-filter-btn" data-dir-filter-btn="1" data-line-id="${escapeHtml(lineId)}" data-dir-key="${escapeHtml(dirKey)}" aria-label="筛选">
                                <img class="panel-dir-filter-icon" alt="" src="./icons/filter.svg" />
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
            directions: directionDebug
        });

        return html;
    };

    const renderTimetableForLineEl = async (lineEl, stationId, token) => {
        if (!lineEl || !(lineEl instanceof Element)) return;
        if (token !== timetableRenderToken) return;

        const lineId = toText(lineEl.getAttribute('data-line-id'));
        if (!lineId) return;

        const ttEl = lineEl.querySelector('[data-timetable-root]');
        if (!ttEl) return;

        const resolvedStationId = await resolveStationIdForLine(lineId);
        if (token !== timetableRenderToken) return;

        const html = await buildTimetableRowsHtml({
            lineId,
            stationId: resolvedStationId || stationId
        });

        if (token !== timetableRenderToken) return;
        ttEl.innerHTML = html;

        try {
            const icons = Array.from(ttEl.querySelectorAll('.panel-dir-filter-icon'));
            for (const icon of icons) {
                if (icon.__panelFilterIconHooked) continue;
                icon.__panelFilterIconHooked = true;
                icon.addEventListener('error', () => {
                    if (icon.__panelFilterIconFallbackTried) return;
                    icon.__panelFilterIconFallbackTried = true;
                    icon.src = '/icons/filter.svg';
                });
            }
        } catch {
            // ignore
        }

        // 方向展开态：默认把各方向可视区域滚到“最后一条已过班次”处（1 past + 9 future 的视觉效果）
        try {
            const expandedBodies = Array.from(ttEl.querySelectorAll('.panel-timetable.is-expanded'));
            for (const bodyEl of expandedBodies) {
                if (bodyEl.classList.contains('panel-timetable-view-grid')) {
                    bodyEl.style.maxHeight = '';
                    const focusRow = bodyEl.querySelector('[data-grid-focus-start="1"]');
                    if (focusRow instanceof Element) {
                        bodyEl.scrollTop = Math.max(0, focusRow.offsetTop || 0);
                    } else {
                        bodyEl.scrollTop = 0;
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
        scheduleMarqueeApply(ttEl);
    };

    const buildTripStops = (trip, stationsIndex, serviceDayStartMs) => {
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
                timeMs
            });
        }
        return out;
    };

    const normalizeTripStops = (stops, serviceDayStartMs, { originIds, terminalIds, showOriginLabel, showTerminalLabel }) => {
        const out = [];
        for (const s of Array.isArray(stops) ? stops : []) {
            let arr = toText(s?.arr) || '';
            let dep = toText(s?.dep) || '';

            const isOriginStop = showOriginLabel && originIds?.has?.(toText(s?.stationId));
            const isTerminalStop = showTerminalLabel && terminalIds?.has?.(toText(s?.stationId));
            const allowMirrorFill = !(isOriginStop || isTerminalStop);

            if (allowMirrorFill) {
                if (!arr && dep) arr = dep;
                if (!dep && arr) dep = arr;
            }

            const arrParsed = arr ? parseHHMMToServiceDayMs(arr, serviceDayStartMs) : null;
            const depParsed = dep ? parseHHMMToServiceDayMs(dep, serviceDayStartMs) : null;
            const timeMs = depParsed?.ms || arrParsed?.ms || null;

            out.push({
                stationId: toText(s?.stationId),
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
        const s = toText(stationId);
        if (!s) return '';
        const parts = s.split('.').map((x) => x.trim()).filter(Boolean);
        return parts.length ? parts[parts.length - 1] : '';
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

    const collectRefChainTrips = async (startTrip, key, token) => {
        const out = [];
        const seenRefs = new Set();
        const seenTrips = new Set();
        let cursor = startTrip;

        for (let i = 0; i < 24; i += 1) {
            const refs = Array.isArray(cursor?.[key]) ? cursor[key] : (cursor?.[key] ? [cursor[key]] : []);
            const refId = toText(refs?.[0]);
            if (!refId) break;
            if (seenRefs.has(refId)) break;
            seenRefs.add(refId);

            const refTrip = await loadTripByRefId(refId);
            if (token !== tripDetailToken) return null;
            if (!refTrip) break;

            const sid = toText(refTrip?.id) || toText(refTrip?.t);
            if (sid && seenTrips.has(sid)) break;

            out.push(refTrip);

            if (sid) seenTrips.add(sid);

            cursor = refTrip;
        }

        return out;
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

    const renderTripDetail = async ({ lineId, tripKey, clientX, clientY, pinned }) => {
        const token = ++tripDetailToken;
        tripDetailPinned = !!pinned;
        clearTripDetailHideTimer();
        showTripCurrentStationHint();
        clearTripDetailStationIndicator();

        const trip = await findTripByKey(lineId, tripKey);
        if (token !== tripDetailToken) return;
        if (!trip) {
            tripDetailRoot.classList.add('is-hidden');
            return;
        }

        const now = getDisplayNowMs();
        const serviceDayStartMs = getServiceDayStartMs(new Date(now));

        const [stationsIndex, trainTypesIndex] = await Promise.all([getStationsIndex(), getTrainTypesIndex()]);
        if (token !== tripDetailToken) return;

        const ptRefs = Array.isArray(trip?.pt) ? trip.pt : (trip?.pt ? [trip.pt] : []);
        const ntRefs = Array.isArray(trip?.nt) ? trip.nt : (trip?.nt ? [trip.nt] : []);
        const hasPt = ptRefs.some((x) => !!toText(x));
        const hasNt = ntRefs.some((x) => !!toText(x));
        const dirRaw = toText(trip?.d);
        const isLoopDirection = /Loop/i.test(dirRaw);
        const hideThroughSegmentsForLoop = isLoopDirection && (hasPt || hasNt);
        const os = Array.isArray(trip?.os) ? trip.os : (trip?.os ? [trip.os] : []);
        const ds = Array.isArray(trip?.ds) ? trip.ds : (trip?.ds ? [trip.ds] : []);
        const originIds = new Set(os.map((x) => toText(x)).filter(Boolean));
        const terminalIds = new Set(ds.map((x) => toText(x)).filter(Boolean));
        const showOriginLabel = !!originIds.size && !hasPt;
        const showTerminalLabel = !!terminalIds.size && !hasNt;

        const ptChain = await collectRefChainTrips(trip, 'pt', token);
        if (token !== tripDetailToken) return;
        const ntChain = await collectRefChainTrips(trip, 'nt', token);
        if (token !== tripDetailToken) return;

        const segments = [];

        const mainRowsRaw = normalizeTripStops(buildTripStops(trip, stationsIndex, serviceDayStartMs), serviceDayStartMs, {
            originIds,
            terminalIds,
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
                const rows = normalizeTripStops(buildTripStops(ptTrip, stationsIndex, serviceDayStartMs), serviceDayStartMs, {
                    originIds,
                    terminalIds,
                    showOriginLabel,
                    showTerminalLabel
                }).map((s) => ({ ...s, seg: 'pt', isMain: false }));
                segments.push({
                    kind: 'pt',
                    lineId: getTripLineId(ptTrip),
                    rows,
                    typeName: getTripTypeName(ptTrip, trainTypesIndex)
                });
            }
        }

        segments.push({
            kind: 'main',
            lineId: getTripLineId(trip),
            rows: mainRowsRaw,
            typeName: getTripTypeName(trip, trainTypesIndex)
        });

        if (!hideThroughSegmentsForLoop) {
            for (const ntTrip of (Array.isArray(ntChain) ? ntChain : [])) {
                const rows = normalizeTripStops(buildTripStops(ntTrip, stationsIndex, serviceDayStartMs), serviceDayStartMs, {
                    originIds,
                    terminalIds,
                    showOriginLabel,
                    showTerminalLabel
                }).map((s) => ({ ...s, seg: 'nt', isMain: false }));
                segments.push({
                    kind: 'nt',
                    lineId: getTripLineId(ntTrip),
                    rows,
                    typeName: getTripTypeName(ntTrip, trainTypesIndex)
                });
            }
        }

        for (let i = 1; i < segments.length; i += 1) {
            const prevSeg = segments[i - 1] || null;
            const currSeg = segments[i] || null;
            const prevRows = prevSeg?.rows || [];
            const currRows = currSeg?.rows || [];
            if (!prevRows.length || !currRows.length) continue;

            const prevLast = prevRows[prevRows.length - 1];
            const currFirst = currRows[0];
            const prevSid = toText(prevLast?.stationId);
            const currSid = toText(currFirst?.stationId);
            const sameById = prevSid && prevSid === currSid;
            const prevA = getStationAKey(prevSid);
            const currA = getStationAKey(currSid);
            const sameByA = prevA && currA && prevA === currA;
            const sameStation = sameById || sameByA;
            if (!sameStation) continue;

            if (prevSeg?.kind === 'pt') {
                const merged = {
                    ...currFirst,
                    stationName: toText(currFirst?.stationName) || toText(prevLast?.stationName),
                    arr: toText(prevLast?.arr) || toText(currFirst?.arr) || null,
                    arrPlus: toText(prevLast?.arr) ? !!prevLast?.arrPlus : !!currFirst?.arrPlus,
                    dep: toText(currFirst?.dep) || toText(prevLast?.dep) || null,
                    depPlus: toText(currFirst?.dep) ? !!currFirst?.depPlus : !!prevLast?.depPlus
                };
                currRows[0] = merged;
                prevRows.pop();
                continue;
            }

            currRows.shift();
            const merged = {
                ...prevLast,
                stationName: toText(prevLast?.stationName) || toText(currFirst?.stationName),
                arr: toText(prevLast?.arr) || toText(currFirst?.arr) || null,
                arrPlus: toText(prevLast?.arr) ? !!prevLast?.arrPlus : !!currFirst?.arrPlus,
                dep: toText(currFirst?.dep) || toText(prevLast?.dep) || null,
                depPlus: toText(currFirst?.dep) ? !!currFirst?.depPlus : !!prevLast?.depPlus
            };
            prevRows[prevRows.length - 1] = merged;
        }

        const normalizedStops = segments.flatMap((x) => x.rows || []);

        const stationIdForLine = await resolveStationIdForLine(lineId);
        if (token !== tripDetailToken) return;
        const currentIdx = normalizedStops.findIndex((s) => toText(s.stationId) === toText(stationIdForLine) && !!s.isMain);
        const stopsWithPast = normalizedStops.map((s, idx) => ({
            ...s,
            isPast: currentIdx >= 0 ? idx < currentIdx : false
        }));

        let cursor = 0;
        const segmentsWithPast = segments.map((seg) => {
            const len = (seg.rows || []).length;
            const rows = stopsWithPast.slice(cursor, cursor + len);
            cursor += len;
            return { ...seg, rows };
        });

        const destName = getTripDestName(trip, stationsIndex) || '未知方向';
        const typeId = toText(trip?.y);
        const typeName = typeId ? (trainTypesIndex.get(typeId) || typeId) : '';
        tripDetailTitle.textContent = `往 ${destName}  ${typeName}`.trim();
        const currentLineDesc = buildLineDescriptor(getTripLineId(trip) || lineId);

        const renderStopRow = (s) => {
                const rowCls = s.isPast ? 'panel-trip-detail-row is-past' : 'panel-trip-detail-row';
                const arrText = s.arr ? formatTimeWithPlus(s.arr, s.arrPlus) : '';
                const depText = s.dep ? formatTimeWithPlus(s.dep, s.depPlus) : '';
                const originCls = `panel-time-label panel-time-label-origin${s.isPast ? ' is-past' : ''}`;
                const terminalCls = `panel-time-label panel-time-label-terminal${s.isPast ? ' is-past' : ''}`;
                const arrivalLabel = s.showOriginLabel ? `<span class=\"${originCls}\">始发站</span> ` : '';
                const departLabel = s.showTerminalLabel ? `<span class=\"${terminalCls}\">终点站</span> ` : '';

                return `
                    <div class="${rowCls}">
                        <div class="panel-trip-detail-station" data-station-id="${escapeHtml(toText(s.stationId))}">${escapeHtml(s.stationName || '')}</div>
                        <div class="panel-trip-detail-time panel-trip-detail-arrive">${arrivalLabel}${arrText ? `<span class=\"panel-time-arrive\">${escapeHtml(arrText)}</span>` : ''}</div>
                        <div class="panel-trip-detail-time panel-trip-detail-depart">${departLabel}${depText ? `<span class=\"panel-time-depart\">${escapeHtml(depText)}</span>` : ''}</div>
                    </div>
                `;
            };

        const renderNoteRow = (descriptor, typeName, isPast) => {
            if (!descriptor?.text) return '';
            const past = !!isPast;
            const colorStyle = past
                ? ' style="color:#ccc"'
                : (descriptor.color ? ` style="color:${escapeHtml(descriptor.color)}"` : '');
            const dotStyle = past
                ? ' style="background:#ccc"'
                : (descriptor.color ? ` style="background:${escapeHtml(descriptor.color)}"` : '');
            const typeText = toText(typeName);
            const typeHtml = typeText
                ? `<span class="panel-trip-detail-note-type">${escapeHtml(typeText)}</span>`
                : '';
            const rowCls = past ? 'panel-trip-detail-note-row is-past' : 'panel-trip-detail-note-row';
            return `
                <div class="${rowCls}">
                    <span class="panel-trip-detail-note-dot"${dotStyle}></span>
                    <span class="panel-trip-detail-note-line"${colorStyle}>${escapeHtml(descriptor.text)}</span>
                    ${typeHtml}
                </div>
            `;
        };

        const getSegmentFirstRow = (segment) => (Array.isArray(segment?.rows) && segment.rows.length ? segment.rows[0] : null);
        const getSegmentLastRow = (segment) => (Array.isArray(segment?.rows) && segment.rows.length ? segment.rows[segment.rows.length - 1] : null);
        const isBoundaryPast = (leftRow, rightRow) => {
            if (leftRow && rightRow) return !!(leftRow.isPast && rightRow.isPast);
            if (leftRow) return !!leftRow.isPast;
            if (rightRow) return !!rightRow.isPast;
            return false;
        };

        const renderLoopMarkerRow = (text) => {
            const label = toText(text);
            if (!label) return '';
            return `
                <div class="panel-trip-detail-note-row">
                    <span class="panel-trip-detail-note-line">${escapeHtml(label)}</span>
                </div>
            `;
        };

        let rowsHtml = '';
        if (hideThroughSegmentsForLoop) {
            rowsHtml += renderLoopMarkerRow('↑环线');
        }
        const segmentBlocks = [];
        for (const seg of segmentsWithPast) {
            const lastBlock = segmentBlocks.length ? segmentBlocks[segmentBlocks.length - 1] : null;
            const sameLine = !!lastBlock && isSameLineName(lastBlock.lineId, seg.lineId);
            if (!sameLine) {
                segmentBlocks.push({
                    lineId: seg.lineId,
                    descriptor: buildLineDescriptor(seg.lineId) || (seg.kind === 'main' ? currentLineDesc : null),
                    typeName: toText(seg.typeName),
                    segments: [seg]
                });
                continue;
            }

            lastBlock.segments.push(seg);
            if (!toText(lastBlock.typeName) && toText(seg.typeName)) {
                lastBlock.typeName = toText(seg.typeName);
            }
        }

        for (let i = 0; i < segmentBlocks.length; i += 1) {
            const block = segmentBlocks[i];
            const prevBlock = i > 0 ? segmentBlocks[i - 1] : null;

            const firstSeg = block.segments[0] || null;
            const prevLastSeg = prevBlock?.segments?.[prevBlock.segments.length - 1] || null;

            const prevLastRow = getSegmentLastRow(prevLastSeg);
            const firstRow = getSegmentFirstRow(firstSeg);

            rowsHtml += renderNoteRow(block.descriptor, block.typeName, isBoundaryPast(prevLastRow, firstRow));
            for (const seg of block.segments) {
                rowsHtml += (seg.rows || []).map(renderStopRow).join('');
            }
        }
        if (hideThroughSegmentsForLoop) {
            rowsHtml += renderLoopMarkerRow('↓环线');
        }

        try {
            const payloadSegments = segmentsWithPast.map((seg) => ({
                kind: seg.kind,
                lineId: toText(seg.lineId),
                stationIds: (seg.rows || []).map((r) => toText(r.stationId)).filter(Boolean)
            }));
            const mainSeg = segmentsWithPast.find((s) => s.kind === 'main') || null;
            const mainRows = Array.isArray(mainSeg?.rows) ? mainSeg.rows : [];
            const mainTerminalStationId = mainRows.length ? toText(mainRows[mainRows.length - 1]?.stationId) : '';
            const payload = {
                tripKey: toText(tripKey),
                selectedLineId: toText(lineId),
                mainLineId: toText(getTripLineId(trip) || lineId),
                mainTerminalStationId,
                hasNt,
                segments: payloadSegments
            };
            scheduleTripPreview({
                previewKey: `${toText(lineId)}||${toText(tripKey)}`,
                payload,
                immediate: !!pinned || tripLocked
            });
        } catch {
            // ignore
        }

        tripDetailBody.innerHTML = `
            <div class="panel-trip-detail-table">
                <div class="panel-trip-detail-head">
                    <div class="panel-trip-detail-station">车站</div>
                    <div class="panel-trip-detail-time panel-trip-detail-arrive">到站时间</div>
                    <div class="panel-trip-detail-time panel-trip-detail-depart">发车时间</div>
                </div>
                ${rowsHtml}
                <div class="panel-trip-detail-spacer"></div>
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
    };

    const hideTripDetail = () => {
        clearTripHighlightTimer();
        tripHighlightAppliedKey = null;
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

    const MAX_PANEL_MARQUEE_ANIMS = 30;

    const scheduleMarqueeApply = (rootEl) => {
        try {
            if (!rootEl || !(rootEl instanceof Element)) return;
            if (typeof window === 'undefined') return;
            const raf = window.requestAnimationFrame;
            if (typeof raf !== 'function') return;

            if (rootEl.__panelMarqueeRafId) {
                try {
                    window.cancelAnimationFrame?.(rootEl.__panelMarqueeRafId);
                } catch {
                    // ignore
                }
                rootEl.__panelMarqueeRafId = 0;
            }

            // One/two RAFs help ensure scrollWidth is correct for flex layouts.
            rootEl.__panelMarqueeRafId = raf(() => {
                rootEl.__panelMarqueeRafId = raf(() => {
                    rootEl.__panelMarqueeRafId = 0;
                    const used = applyDirHeaderMarquees(rootEl, MAX_PANEL_MARQUEE_ANIMS);
                    const remain = Math.max(0, MAX_PANEL_MARQUEE_ANIMS - used);
                    applyTimetableDestMarquees(rootEl, remain);
                    hookTimetableScrollMarquee(rootEl);
                });
            });
        } catch {
            // ignore
        }
    };

    const applyDirHeaderMarquees = (rootEl, maxAnims = Number.POSITIVE_INFINITY) => {
        try {
            if (!rootEl || !(rootEl instanceof Element)) return;
            if (typeof window === 'undefined') return;
            if (!('animate' in Element.prototype)) return;

            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
            if (reduceMotion) return 0;

            const marquees = Array.from(rootEl.querySelectorAll('.panel-dir-marquee'));
            let started = 0;
            for (const marqueeEl of marquees) {
                if (started >= maxAnims) break;
                const innerEl = marqueeEl.querySelector('.panel-dir-marquee-inner');
                if (!innerEl) continue;

                // cancel previous animation on this element (if any)
                try {
                    marqueeEl.__panelMarqueeAnim?.cancel?.();
                } catch {
                    // ignore
                }

                // reset
                innerEl.style.transform = '';
                marqueeEl.__panelMarqueeAnim = null;

                const viewportW = marqueeEl.clientWidth || 0;
                const contentW = innerEl.scrollWidth || 0;
                if (!viewportW || contentW <= viewportW + 1) continue;

                const distancePx = Math.max(0, contentW - viewportW);
                if (!distancePx) continue;

                const holdMs = 2000;
                const speedPxPerSec = 35; // readable pace
                const travelMs = Math.max(1500, Math.round((distancePx / speedPxPerSec) * 1000));
                const totalMs = holdMs + travelMs + holdMs + holdMs;

                const startHoldOffset = holdMs / totalMs;
                const endMoveOffset = (holdMs + travelMs) / totalMs;
                const endHoldOffset = (holdMs + travelMs + holdMs) / totalMs;
                const resetOffset = Math.min(0.999, endHoldOffset + 0.001);

                const anim = innerEl.animate(
                    [
                        { transform: 'translateX(0px)', offset: 0 },
                        { transform: 'translateX(0px)', offset: startHoldOffset },
                        { transform: `translateX(${-distancePx}px)`, offset: endMoveOffset },
                        { transform: `translateX(${-distancePx}px)`, offset: endHoldOffset },
                        { transform: 'translateX(0px)', offset: resetOffset },
                        { transform: 'translateX(0px)', offset: 1 }
                    ],
                    {
                        duration: totalMs,
                        iterations: Infinity,
                        easing: 'linear'
                    }
                );

                marqueeEl.__panelMarqueeAnim = anim;
                started += 1;
            }
            return started;
        } catch {
            // ignore
            return 0;
        }
    };

    const applyTimetableDestMarquees = (rootEl, maxAnims = MAX_PANEL_MARQUEE_ANIMS) => {
        try {
            if (!rootEl || !(rootEl instanceof Element)) return;
            if (typeof window === 'undefined') return;
            if (!('animate' in Element.prototype)) return;

            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
            if (reduceMotion) return;

            const marquees = Array.from(rootEl.querySelectorAll('.panel-timetable-dest-marquee'));
            const candidates = [];

            for (const marqueeEl of marquees) {
                const innerEl = marqueeEl.querySelector('.panel-timetable-dest-marquee-inner');
                if (!innerEl) continue;

                // cancel previous animation on this element (if any)
                try {
                    marqueeEl.__panelMarqueeAnim?.cancel?.();
                } catch {
                    // ignore
                }

                // reset
                innerEl.style.transform = '';
                marqueeEl.__panelMarqueeAnim = null;

                const viewportW = marqueeEl.clientWidth || 0;
                const contentW = innerEl.scrollWidth || 0;
                if (!viewportW || contentW <= viewportW + 1) continue;

                // Prefer visible rows (within the nearest timetable scroller) to get marquee first.
                const rowEl = marqueeEl.closest?.('.panel-timetable-row');
                const containerEl = marqueeEl.closest?.('.panel-timetable');
                let score = 1e9;
                if (rowEl && containerEl) {
                    const rr = rowEl.getBoundingClientRect?.();
                    const cr = containerEl.getBoundingClientRect?.();
                    if (rr && cr) {
                        const visible = rr.bottom > cr.top && rr.top < cr.bottom;
                        if (visible) score = 0;
                        else score = Math.min(Math.abs(rr.top - cr.bottom), Math.abs(rr.bottom - cr.top));
                    }
                }

                candidates.push({ marqueeEl, innerEl, viewportW, contentW, score });
            }

            candidates.sort((a, b) => a.score - b.score);

            let started = 0;
            for (const c of candidates) {
                if (started >= maxAnims) break;
                started += 1;

                const distancePx = Math.max(0, c.contentW - c.viewportW);
                if (!distancePx) continue;

                const holdMs = 2000;
                const speedPxPerSec = 30;
                const travelMs = Math.max(1200, Math.round((distancePx / speedPxPerSec) * 1000));
                const totalMs = holdMs + travelMs + holdMs + holdMs;

                const startHoldOffset = holdMs / totalMs;
                const endMoveOffset = (holdMs + travelMs) / totalMs;
                const endHoldOffset = (holdMs + travelMs + holdMs) / totalMs;
                const resetOffset = Math.min(0.999, endHoldOffset + 0.001);

                const anim = c.innerEl.animate(
                    [
                        { transform: 'translateX(0px)', offset: 0 },
                        { transform: 'translateX(0px)', offset: startHoldOffset },
                        { transform: `translateX(${-distancePx}px)`, offset: endMoveOffset },
                        { transform: `translateX(${-distancePx}px)`, offset: endHoldOffset },
                        { transform: 'translateX(0px)', offset: resetOffset },
                        { transform: 'translateX(0px)', offset: 1 }
                    ],
                    {
                        duration: totalMs,
                        iterations: Infinity,
                        easing: 'linear'
                    }
                );

                c.marqueeEl.__panelMarqueeAnim = anim;
            }
        } catch {
            // ignore
        }
    };

    const hookTimetableScrollMarquee = (rootEl) => {
        try {
            if (!rootEl || !(rootEl instanceof Element)) return;
            if (typeof window === 'undefined') return;
            const raf = window.requestAnimationFrame;
            if (typeof raf !== 'function') return;

            const bodies = Array.from(rootEl.querySelectorAll('.panel-timetable.is-expanded'));
            for (const bodyEl of bodies) {
                if (bodyEl.__panelDestMarqueeHooked) continue;
                bodyEl.__panelDestMarqueeHooked = true;

                let pending = false;
                bodyEl.addEventListener(
                    'scroll',
                    () => {
                        if (pending) return;
                        pending = true;
                        raf(() => {
                            pending = false;
                            const remain = Math.max(0, MAX_PANEL_MARQUEE_ANIMS - applyDirHeaderMarquees(bodyEl, MAX_PANEL_MARQUEE_ANIMS));
                            applyTimetableDestMarquees(bodyEl, remain);
                        });
                    },
                    { passive: true }
                );
            }
        } catch {
            // ignore
        }
    };

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
            console.log('[班次视图][grid-data]', {
                stationId: toText(currentStationId),
                stationName: toText(currentStationNameZh),
                serviceDay: currentServiceDay,
                lines
            });
            pendingGridDataDebugLog = false;
        }
    };

    const dirFilterPopover = document.createElement('div');
    dirFilterPopover.className = 'panel-dir-filter-popover is-hidden';
    dirFilterPopover.innerHTML = `
        <div class="panel-dir-filter-popover-head">
            <span class="panel-dir-filter-popover-title">筛选</span>
            <span class="panel-dir-filter-popover-head-actions">
                <label class="panel-dir-filter-toggle-all" data-dir-filter-toggle-all-wrap="1">
                    <input type="checkbox" data-dir-filter-toggle-all="1" checked />
                    <span>全选</span>
                </label>
                <button type="button" class="panel-dir-filter-popover-clear" data-dir-filter-clear="1" aria-label="清除筛选">清除筛选</button>
                <button type="button" class="panel-dir-filter-popover-close" data-dir-filter-close="1" aria-label="关闭">x</button>
            </span>
        </div>
        <div class="panel-dir-filter-popover-body" data-dir-filter-popover-body="1"></div>
    `;
    dirFilterPopover.addEventListener('pointerdown', (e) => stopPropagationOnly(e), { passive: true });
    dirFilterPopover.addEventListener('click', (e) => stopPropagationOnly(e), { passive: true });
    document.body.appendChild(dirFilterPopover);

    let activeDirFilterKey = '';

    const rerenderLineById = async (lineId) => {
        const lineEl = body.querySelector(`[data-line-id="${escapeHtml(String(lineId))}"]`);
        if (!lineEl) return;
        const token = ++timetableRenderToken;
        await renderTimetableForLineEl(lineEl, currentStationId, token);
    };

    const closeDirFilterPopover = () => {
        activeDirFilterKey = '';
        dirFilterPopover.classList.add('is-hidden');
        clearDirPreview();
    };

    const positionDirFilterPopover = (anchorEl) => {
        if (!anchorEl || !(anchorEl instanceof Element)) return;
        const rect = anchorEl.getBoundingClientRect();
        const popRect = dirFilterPopover.getBoundingClientRect();
        const popW = Math.max(360, Math.ceil(popRect.width || 360));
        const popH = Math.max(180, Math.ceil(popRect.height || 260));
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const gap = 8;

        let left = rect.right - popW;
        left = Math.max(8, Math.min(left, Math.max(8, viewportW - popW - 8)));

        const canShowAbove = rect.top - gap - popH >= 8;
        const top = canShowAbove
            ? rect.top - gap - popH
            : Math.min(viewportH - popH - 8, rect.bottom + gap);

        dirFilterPopover.style.left = `${Math.round(left)}px`;
        dirFilterPopover.style.top = `${Math.round(Math.max(8, top))}px`;
    };

    const FILTER_FIELD_TO_ROW_KEY = {
        origins: 'origin',
        terminals: 'terminal',
        types: 'type'
    };

    const createEmptyDirFilterState = () => ({ origins: new Set(), terminals: new Set(), types: new Set() });

    const collectDirFilterOptionSets = (rows) => {
        const list = Array.isArray(rows) ? rows : [];
        const out = createEmptyDirFilterState();
        for (const row of list) {
            const origin = toText(row?.origin);
            const terminal = toText(row?.terminal);
            const type = toText(row?.type);
            if (origin) out.origins.add(origin);
            if (terminal) out.terminals.add(terminal);
            if (type) out.types.add(type);
        }
        return out;
    };

    const createAllSelectedDirFilterState = (rows) => collectDirFilterOptionSets(rows);

    const syncDirFilterStateWithRows = (state, rows) => {
        const source = state || createEmptyDirFilterState();
        const allValues = collectDirFilterOptionSets(rows);
        const next = createEmptyDirFilterState();
        for (const key of ['origins', 'terminals', 'types']) {
            const selected = source[key] instanceof Set ? source[key] : new Set();
            for (const value of selected) {
                if (allValues[key].has(value)) next[key].add(value);
            }
        }
        return next;
    };

    const isAllSelectedDirFilterState = (state, rows) => {
        const allValues = collectDirFilterOptionSets(rows);
        const current = state || createEmptyDirFilterState();
        for (const key of ['origins', 'terminals', 'types']) {
            const selected = current[key] instanceof Set ? current[key] : new Set();
            if (selected.size !== allValues[key].size) return false;
            for (const value of allValues[key]) {
                if (!selected.has(value)) return false;
            }
        }
        return true;
    };

    const getFilterRowsForState = ({ rows, state, ignoreField = '', treatEmptyAsAll = false }) => {
        const list = Array.isArray(rows) ? rows : [];
        return list.filter((row) => {
            const origin = toText(row?.origin);
            const terminal = toText(row?.terminal);
            const type = toText(row?.type);
            const origins = state?.origins instanceof Set ? state.origins : new Set();
            const terminals = state?.terminals instanceof Set ? state.terminals : new Set();
            const types = state?.types instanceof Set ? state.types : new Set();
            const originOk = ignoreField === 'origins' || ((treatEmptyAsAll && !origins.size) || origins.has(origin));
            const terminalOk = ignoreField === 'terminals' || ((treatEmptyAsAll && !terminals.size) || terminals.has(terminal));
            const typeOk = ignoreField === 'types' || ((treatEmptyAsAll && !types.size) || types.has(type));
            return originOk && terminalOk && typeOk;
        });
    };

    const buildFilterFacetEntries = ({ rows, field, state, treatEmptyAsAll = false }) => {
        const rowKey = FILTER_FIELD_TO_ROW_KEY[field];
        if (!rowKey) return [];

        const scopedRows = getFilterRowsForState({ rows, state, ignoreField: field, treatEmptyAsAll });
        const sourceRows = scopedRows;
        const counts = new Map();
        for (const row of sourceRows) {
            const value = toText(row?.[rowKey]);
            if (!value) continue;
            counts.set(value, (counts.get(value) || 0) + 1);
        }

        const selected = state?.[field] instanceof Set ? state[field] : new Set();
        for (const value of selected) {
            const v = toText(value);
            if (!v || counts.has(v)) continue;
            counts.set(v, 0);
        }

        return Array.from(counts.entries())
            .map(([value, count]) => ({ value, count: Number(count) || 0 }))
            .sort((a, b) => {
                const dc = b.count - a.count;
                if (dc) return dc;
                return String(a.value).localeCompare(String(b.value));
            });
    };

    const buildDirFilterColumnHtml = ({ title, field, entries, selected }) => {
        const items = Array.isArray(entries) ? entries : [];
        const rowsHtml = items.length
            ? items.map(({ value, count }) => {
                const checked = selected?.has?.(value) ? ' checked' : '';
                return `
                    <label class="panel-dir-filter-option">
                        <input type="checkbox" data-dir-filter-field="${escapeHtml(field)}" value="${escapeHtml(value)}"${checked} />
                        <span class="panel-dir-filter-option-name">${escapeHtml(value)}</span>
                        <span class="panel-dir-filter-option-count">（${escapeHtml(String(count))}）</span>
                    </label>
                `;
            }).join('')
            : '<div class="panel-dir-filter-empty">无可选项</div>';

        return `
            <div class="panel-dir-filter-col">
                <div class="panel-dir-filter-col-title">${escapeHtml(title)}</div>
                <div class="panel-dir-filter-col-body">${rowsHtml}</div>
            </div>
        `;
    };

    const openDirFilterPopover = ({ lineId, dirKey, anchorEl }) => {
        const lineDirKey = makeLineDirKey(lineId, dirKey);
        const rows = dirFilterRowsByKey.get(lineDirKey) || [];
        if (!dirFilterToggleModeByKey.has(lineDirKey)) dirFilterToggleModeByKey.set(lineDirKey, true);
        const explicitAllMode = dirFilterToggleModeByKey.get(lineDirKey) !== false;
        let state;
        if (!dirFilterStateByKey.has(lineDirKey)) {
            state = explicitAllMode ? createAllSelectedDirFilterState(rows) : createEmptyDirFilterState();
            dirFilterStateByKey.set(lineDirKey, state);
        } else {
            state = syncDirFilterStateWithRows(dirFilterStateByKey.get(lineDirKey), rows);
            dirFilterStateByKey.set(lineDirKey, state);
        }

        const bodyEl = dirFilterPopover.querySelector('[data-dir-filter-popover-body]');
        if (!bodyEl) return;
        const originEntries = buildFilterFacetEntries({ rows, field: 'origins', state, treatEmptyAsAll: !explicitAllMode });
        const terminalEntries = buildFilterFacetEntries({ rows, field: 'terminals', state, treatEmptyAsAll: !explicitAllMode });
        const typeEntries = buildFilterFacetEntries({ rows, field: 'types', state, treatEmptyAsAll: !explicitAllMode });
        bodyEl.innerHTML = [
            buildDirFilterColumnHtml({ title: '始发站', field: 'origins', entries: originEntries, selected: state.origins }),
            buildDirFilterColumnHtml({ title: '终点站', field: 'terminals', entries: terminalEntries, selected: state.terminals }),
            buildDirFilterColumnHtml({ title: '种别', field: 'types', entries: typeEntries, selected: state.types })
        ].join('');

        const toggleAllInput = dirFilterPopover.querySelector('[data-dir-filter-toggle-all="1"]');
        if (toggleAllInput instanceof HTMLInputElement) {
            toggleAllInput.checked = explicitAllMode;
        }

        activeDirFilterKey = lineDirKey;
        dirFilterPopover.classList.remove('is-hidden');
        positionDirFilterPopover(anchorEl);
        applyDirPreviewByKey(lineDirKey, { force: true });
    };

    const toggleDirFilterPopoverFromButton = (btnEl) => {
        if (!btnEl || !(btnEl instanceof Element)) return;
        const lineId = toText(btnEl.getAttribute('data-line-id'));
        const dirKey = toText(btnEl.getAttribute('data-dir-key'));
        if (!lineId || !dirKey) return;
        const lineDirKey = makeLineDirKey(lineId, dirKey);

        if (!dirFilterPopover.classList.contains('is-hidden') && activeDirFilterKey === lineDirKey) {
            closeDirFilterPopover();
            return;
        }

        openDirFilterPopover({ lineId, dirKey, anchorEl: btnEl });
    };

    dirFilterPopover.addEventListener('change', async (evt) => {
        const target = evt?.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.type !== 'checkbox') return;
        if (target.hasAttribute('data-dir-filter-toggle-all')) {
            if (!activeDirFilterKey) return;
            const rows = dirFilterRowsByKey.get(activeDirFilterKey) || [];
            dirFilterToggleModeByKey.set(activeDirFilterKey, target.checked);
            const state = target.checked
                ? createAllSelectedDirFilterState(rows)
                : createEmptyDirFilterState();
            dirFilterStateByKey.set(activeDirFilterKey, state);

            const [lineId, dirKey] = activeDirFilterKey.split('||');
            await rerenderLineById(lineId);

            const anchorEl = body.querySelector(`.panel-dir-filter-btn[data-line-id="${escapeHtml(String(lineId))}"][data-dir-key="${escapeHtml(String(dirKey))}"]`);
            if (anchorEl) openDirFilterPopover({ lineId, dirKey, anchorEl });
            else closeDirFilterPopover();
            return;
        }
        const field = toText(target.getAttribute('data-dir-filter-field'));
        if (field !== 'origins' && field !== 'terminals' && field !== 'types') return;
        if (!activeDirFilterKey) return;

        const explicitAllMode = dirFilterToggleModeByKey.get(activeDirFilterKey) !== false;
        const fallbackState = explicitAllMode
            ? createAllSelectedDirFilterState(dirFilterRowsByKey.get(activeDirFilterKey) || [])
            : createEmptyDirFilterState();
        const state = dirFilterStateByKey.get(activeDirFilterKey) || fallbackState;
        if (!dirFilterStateByKey.has(activeDirFilterKey)) dirFilterStateByKey.set(activeDirFilterKey, state);
        const value = toText(target.value);
        if (!value) return;

        const bucket = state[field];
        if (target.checked) {
            if (explicitAllMode) bucket.add(value);
            else {
                bucket.clear();
                bucket.add(value);
            }
        } else {
            bucket.delete(value);
        }

        const [lineId, dirKey] = activeDirFilterKey.split('||');
        await rerenderLineById(lineId);

        const anchorEl = body.querySelector(`.panel-dir-filter-btn[data-line-id="${escapeHtml(String(lineId))}"][data-dir-key="${escapeHtml(String(dirKey))}"]`);
        if (anchorEl) openDirFilterPopover({ lineId, dirKey, anchorEl });
        else closeDirFilterPopover();
    });

    dirFilterPopover.addEventListener('mouseenter', () => {
        if (!activeDirFilterKey) return;
        applyDirPreviewByKey(activeDirFilterKey, { force: true });
    });

    dirFilterPopover.addEventListener('pointerdown', (evt) => {
        const t = evt?.target;
        if (!(t instanceof Element)) return;
        if (!activeDirFilterKey) return;
        applyDirPreviewByKey(activeDirFilterKey, { force: true });
    }, { passive: true });

    dirFilterPopover.addEventListener('click', async (evt) => {
        const clearBtn = evt?.target?.closest?.('[data-dir-filter-clear]');
        if (clearBtn) {
            stopEvent(evt);
            if (!activeDirFilterKey) return;
            const rows = dirFilterRowsByKey.get(activeDirFilterKey) || [];
            dirFilterToggleModeByKey.set(activeDirFilterKey, true);
            const state = createAllSelectedDirFilterState(rows);
            dirFilterStateByKey.set(activeDirFilterKey, state);

            const [lineId, dirKey] = activeDirFilterKey.split('||');
            await rerenderLineById(lineId);
            const anchorEl = body.querySelector(`.panel-dir-filter-btn[data-line-id="${escapeHtml(String(lineId))}"][data-dir-key="${escapeHtml(String(dirKey))}"]`);
            if (anchorEl) openDirFilterPopover({ lineId, dirKey, anchorEl });
            else closeDirFilterPopover();
            return;
        }

        const closeBtn = evt?.target?.closest?.('[data-dir-filter-close]');
        if (!closeBtn) return;
        stopEvent(evt);
        closeDirFilterPopover();
    }, { passive: false });

    document.addEventListener('pointerdown', (evt) => {
        if (dirFilterPopover.classList.contains('is-hidden')) return;
        const t = evt?.target;
        if (t && dirFilterPopover.contains(t)) return;
        if (t && t instanceof Element && t.closest('.panel-dir-filter-btn')) return;
        closeDirFilterPopover();
    }, true);

    document.addEventListener('keydown', (evt) => {
        if (evt?.key !== 'Escape') return;
        if (dirFilterPopover.classList.contains('is-hidden')) return;
        closeDirFilterPopover();
    });

    window.addEventListener('resize', () => {
        if (dirFilterPopover.classList.contains('is-hidden') || !activeDirFilterKey) return;
        const [lineId, dirKey] = activeDirFilterKey.split('||');
        const anchorEl = body.querySelector(`.panel-dir-filter-btn[data-line-id="${escapeHtml(String(lineId))}"][data-dir-key="${escapeHtml(String(dirKey))}"]`);
        if (anchorEl) positionDirFilterPopover(anchorEl);
    });

    startAutoNowClock();
    applyTimetableViewMode(getTimetableViewMode ? getTimetableViewMode() : 'list', { rerender: false });

    const clearHoverTimer = () => {
        if (hoverTimerId != null) {
            clearTimeout(hoverTimerId);
            hoverTimerId = null;
        }
    };

    const clearRestoreTimer = () => {
        if (restoreTimerId != null) {
            clearTimeout(restoreTimerId);
            restoreTimerId = null;
        }
    };

    const restoreStationLinesIfNeeded = () => {
        if (!lastAppliedHoverKey) return;
        if (!onRestoreStationLines) {
            lastAppliedHoverKey = null;
            return;
        }
        try {
            onRestoreStationLines(
                Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : [],
                { stationId: toText(currentStationId) || null }
            );
        } catch {
            // ignore
        }
        lastAppliedHoverKey = null;
    };

    const scheduleRestoreStationLines = () => {
        if (!lastAppliedHoverKey) return;
        if (!onRestoreStationLines) {
            lastAppliedHoverKey = null;
            return;
        }
        clearRestoreTimer();
        restoreTimerId = setTimeout(() => {
            restoreTimerId = null;
            restoreStationLinesIfNeeded();
        }, restoreDelayMs);
    };

    const getInteractiveTarget = (evt) => {
        const target = evt?.target;
        if (!target || !(target instanceof Element)) return null;

        const filterBtn = target.closest?.('[data-dir-filter-btn]');
        if (filterBtn && body.contains(filterBtn)) return null;

        const dirEl = target.closest?.('[data-dir-toggle]');
        if (dirEl && body.contains(dirEl)) {
            const lineEl = dirEl.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const dirKey = dirEl.getAttribute?.('data-dir-key');
            return lineId && dirKey ? { kind: 'dir-toggle', value: `${String(lineId)}||${String(dirKey)}` } : null;
        }

        // Clicking/scrolling inside timetable list should not trigger line/company selection.
        const insideTimetable = target.closest?.('.panel-timetable');
        if (insideTimetable && body.contains(insideTimetable)) return null;

        const lineEl = target.closest?.('[data-line-id]');
        if (lineEl && body.contains(lineEl)) {
            const lineId = lineEl.getAttribute('data-line-id');
            return lineId ? { kind: 'line', value: String(lineId) } : null;
        }

        const companyEl = target.closest?.('[data-company]');
        if (companyEl && body.contains(companyEl)) {
            const company = companyEl.getAttribute('data-company');
            return company ? { kind: 'company', value: String(company) } : null;
        }

        return null;
    };

    const onBodyPointerDown = (evt) => {
        const pt = readPointerType(evt);
        lastPointerType = pt;
        if (isTouchLikePointer(pt)) {
            suppressMouseEventsUntilMs = nowMs() + 800;
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

        if (!isTouchLikePointer(pt)) return;

        const filterBtn = evt?.target?.closest?.('[data-dir-filter-btn]');
        if (filterBtn && body.contains(filterBtn)) {
            stopEvent(evt);
            toggleDirFilterPopoverFromButton(filterBtn);
            return;
        }

        const rowEl = findTripTarget(evt?.target);
        if (rowEl && body.contains(rowEl)) {
            clearTripHighlightTimer();
            const lineEl = rowEl.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const tripKey = rowEl.getAttribute?.('data-trip-key');
            if (lineId && tripKey) {
                const key = `${String(lineId)}||${String(tripKey)}`;
                if (tripLocked && key !== lockedTripKey) {
                    hideTripDetail();
                    lastTripDetailKey = null;
                    stopPropagationOnly(evt);
                    return;
                }
                stopPropagationOnly(evt);
                if (tripArmedKey !== key) {
                    tripArmedKey = key;
                    renderTripDetail({
                        lineId: String(lineId),
                        tripKey: String(tripKey),
                        clientX: evt?.clientX || 0,
                        clientY: evt?.clientY || 0,
                        pinned: tripLocked && key === lockedTripKey
                    });
                    lastTripDetailKey = key;
                    return;
                }

                tripArmedKey = null;
                lockTripPreview(key);
                renderTripDetail({
                    lineId: String(lineId),
                    tripKey: String(tripKey),
                    clientX: evt?.clientX || 0,
                    clientY: evt?.clientY || 0,
                    pinned: true
                });
                lastTripDetailKey = key;
                return;
            }
        }

        const t = getInteractiveTarget(evt);
        if (!t) {
            // 触屏在非交互区域（例如时间表滚动区）按下：允许默认滚动，但不要把事件传到地图
            stopPropagationOnly(evt);
            return;
        }

        stopEvent(evt);
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;

        const key = `${t.kind}:${t.value}`;

        if (t.kind === 'dir-toggle') {
            const [lineId, dirKey] = String(t.value).split('||');
            applyDirPreviewByKey(makeLineDirKey(lineId, dirKey));
            tapArmedKey = null;
            mouseArmedKey = null;
            setDirExpanded(lineId, dirKey, !isDirExpanded(lineId, dirKey));
            const lineEl = body.querySelector(`[data-line-id="${escapeHtml(String(lineId))}"]`);
            const token = ++timetableRenderToken;
            renderTimetableForLineEl(lineEl, currentStationId, token);
            return;
        }

        if (t.kind === 'line') {
            const lineId = String(t.value);
            if (tapArmedKey !== key) {
                tapArmedKey = key;
                if (onSelectLine) onSelectLine(lineId, { source: 'panel-hover' });
                return;
            }

            tapArmedKey = null;
            if (onSelectLine) onSelectLine(lineId, { source: 'panel-click', isolateStations: true });
            return;
        }

        tapArmedKey = null;
        if (t.kind === 'company' && onSelectCompany) {
            onSelectCompany(String(t.value), {
                source: 'panel-click',
                stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
            });
        }
    };

    const onBodyMove = (evt) => {
        if (tripLocked) return;
        if (isTouchLikePointer(lastPointerType)) return;
        if (!isHoverPreviewEnabled()) {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            clearDirPreview();
            return;
        }

        const t = getInteractiveTarget(evt);
        if (!t) {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            if (!(evt?.relatedTarget && dirFilterPopover.contains(evt.relatedTarget))) {
                clearDirPreview();
            }
            return;
        }

        if (t.kind === 'dir-toggle') {
            const [lineId, dirKey] = String(t.value).split('||');
            applyDirPreviewByKey(makeLineDirKey(lineId, dirKey));
        }

        clearRestoreTimer();

        const key = `${t.kind}:${t.value}`;
        if (key === hoverCandidateKey) return;

        clearHoverTimer();
        hoverCandidateKey = key;
        tapArmedKey = null;

        if (key === lastFiredHoverKey) return;

        hoverTimerId = setTimeout(() => {
            hoverTimerId = null;
            if (hoverCandidateKey !== key) return;
            lastFiredHoverKey = key;

            if (t.kind === 'line' && onSelectLine) {
                onSelectLine(String(t.value), { source: 'panel-hover' });
                lastAppliedHoverKey = `line:${String(t.value)}`;
            } else if (t.kind === 'company' && onSelectCompany) {
                onSelectCompany(String(t.value), {
                    source: 'panel-hover',
                    stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
                });
                lastAppliedHoverKey = `company:${String(t.value)}`;
            }
        }, hoverDelayMs);
    };

    const onBodyClick = (evt) => {
        // 触屏：由 pointerdown 接管两段式逻辑
        if (isTouchLikePointer(lastPointerType) || nowMs() < suppressMouseEventsUntilMs) {
            stopEvent(evt);
            return;
        }

        const rowEl = findTripTarget(evt?.target);
        if (rowEl && body.contains(rowEl)) {
            clearTripHighlightTimer();
            const lineEl = rowEl.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const tripKey = rowEl.getAttribute?.('data-trip-key');
            if (lineId && tripKey) {
                const key = `${String(lineId)}||${String(tripKey)}`;
                stopEvent(evt);
                if (tripLocked && key !== lockedTripKey) {
                    hideTripDetail();
                    lastTripDetailKey = null;
                    return;
                }

                tripArmedKey = null;
                lockTripPreview(key);
                renderTripDetail({
                    lineId: String(lineId),
                    tripKey: String(tripKey),
                    clientX: evt?.clientX || 0,
                    clientY: evt?.clientY || 0,
                    pinned: true
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

        const filterBtn = evt?.target?.closest?.('[data-dir-filter-btn]');
        if (filterBtn && body.contains(filterBtn)) {
            stopEvent(evt);
            toggleDirFilterPopoverFromButton(filterBtn);
            return;
        }

        const t = getInteractiveTarget(evt);
        if (!t) return;

        stopEvent(evt);
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        tapArmedKey = null;

        if (t.kind === 'dir-toggle') {
            const [lineId, dirKey] = String(t.value).split('||');
            mouseArmedKey = null;
            setDirExpanded(lineId, dirKey, !isDirExpanded(lineId, dirKey));
            const lineEl = body.querySelector(`[data-line-id="${escapeHtml(String(lineId))}"]`);
            const token = ++timetableRenderToken;
            renderTimetableForLineEl(lineEl, currentStationId, token);
            return;
        }

        if (t.kind === 'line') {
            const lineId = String(t.value);
            const key = `line:${lineId}`;
            if (mouseArmedKey === key) {
                mouseArmedKey = null;
                if (onSelectLine) onSelectLine(lineId, { source: 'panel-click', isolateStations: true });
                return;
            }

            mouseArmedKey = key;
            if (onSelectLine) onSelectLine(lineId, { source: 'panel-hover' });
            return;
        }

        if (t.kind === 'company' && onSelectCompany) {
            onSelectCompany(String(t.value), {
                source: 'panel-click',
                stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
            });
        }
    };

    const onBodyLeave = (evt) => {
        clearTripHighlightTimer();
        clearHoverTimer();
        clearRestoreTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        tapArmedKey = null;
        mouseArmedKey = null;
        restoreStationLinesIfNeeded();
        if (tripLocked) return;
        const toEl = evt?.relatedTarget;
        if (toEl && tripDetailRoot.contains(toEl)) return;
        if (!(toEl && dirFilterPopover.contains(toEl))) {
            clearDirPreview();
        }
        if (!tripDetailPinned) scheduleTripDetailHide();
    };

    body.addEventListener('pointerdown', onBodyPointerDown, { passive: false });
    body.addEventListener('mousemove', onBodyMove);
    body.addEventListener('mouseleave', onBodyLeave);
    body.addEventListener('click', onBodyClick, { passive: false });

    body.addEventListener('mouseover', (evt) => {
        if (!isHoverPreviewEnabled()) return;
        if (isTouchLikePointer(lastPointerType)) return;
        const rowEl = findTripTarget(evt?.target);
        if (!rowEl || !body.contains(rowEl)) return;
        const lineEl = rowEl.closest?.('[data-line-id]');
        const lineId = lineEl?.getAttribute?.('data-line-id');
        const tripKey = rowEl.getAttribute?.('data-trip-key');
        if (!lineId || !tripKey) return;
        const key = `${lineId}||${tripKey}`;
        if (tripLocked && key !== lockedTripKey) return;
        if (key === lastTripDetailKey && !tripDetailPinned) {
            const pendingSame = tripHighlightCandidateKey === key;
            const appliedSame = tripHighlightAppliedKey === key;
            if (pendingSame || appliedSame) return;
        }

        clearTripDetailHideTimer();
        clearTripHighlightTimer();
        renderTripDetail({
            lineId: String(lineId),
            tripKey: String(tripKey),
            clientX: evt?.clientX || 0,
            clientY: evt?.clientY || 0,
            pinned: false
        });
        lastTripDetailKey = key;
    });

    body.addEventListener('mouseout', (evt) => {
        if (!isHoverPreviewEnabled()) return;
        clearTripHighlightTimer();
        if (tripLocked) return;
        if (tripDetailPinned) return;
        const rowEl = findTripTarget(evt?.target);
        if (!rowEl || !body.contains(rowEl)) return;
        const toEl = evt?.relatedTarget;
        if (toEl && (rowEl.contains(toEl) || tripDetailRoot.contains(toEl))) return;
        scheduleTripDetailHide();
    });

    const getTripDetailStationTarget = (target) => {
        if (!(target instanceof Element)) return null;
        return target.closest?.('.panel-trip-detail-station[data-station-id]') || null;
    };

    tripDetailBody.addEventListener('mouseover', (evt) => {
        if (!isHoverPreviewEnabled()) return;
        if (isTouchLikePointer(lastPointerType)) return;
        const stationEl = getTripDetailStationTarget(evt?.target);
        if (!stationEl) return;
        const sid = toText(stationEl.getAttribute('data-station-id'));
        if (!sid) return;
        showTripDetailStationIndicator(sid);
    });

    tripDetailBody.addEventListener('mouseout', (evt) => {
        if (!isHoverPreviewEnabled()) return;
        if (isTouchLikePointer(lastPointerType)) return;
        const fromEl = getTripDetailStationTarget(evt?.target);
        if (!fromEl) return;
        const toEl = evt?.relatedTarget;
        const toStation = getTripDetailStationTarget(toEl);
        if (toStation) return;
        clearTripDetailStationIndicator();
    });

    tripDetailBody.addEventListener('mouseleave', () => {
        clearTripDetailStationIndicator();
    });

    tripDetailBody.addEventListener('pointerdown', (evt) => {
        const pt = readPointerType(evt);
        lastPointerType = pt;
        if (!isTouchLikePointer(pt)) return;
        const stationEl = getTripDetailStationTarget(evt?.target);
        if (!stationEl) return;
        const sid = toText(stationEl.getAttribute('data-station-id'));
        if (!sid) return;
        showTripDetailStationIndicator(sid);
    }, { passive: true });

    document.addEventListener('click', (evt) => {
        const target = evt?.target;
        if (!tripDetailPinned && !tripLocked) return;
        if (target && tripDetailRoot.contains(target)) return;
        if (
            target instanceof Element && (
                (settingsContentEl && settingsContentEl.contains(target)) ||
                target.closest('.settings-content') ||
                target.closest('.settings-ui')
            )
        ) return;
        if (target && root.contains(target)) {
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
        const h = window.innerHeight;
        const top = Math.round(h * 0.1);
        const height = Math.round(h * 0.8);

        root.style.top = `${top}px`;
        root.style.height = `${height}px`;

        if (!settingsContentEl) {
            // 时间控件浮层：固定在 station-label-toggle 下方
            try {
                const anchor = document.querySelector('.settings-item-station-label, .station-label-toggle');
                const gap = 2;
                if (anchor && anchor.getBoundingClientRect) {
                    const rect = anchor.getBoundingClientRect();
                    const right = Math.max(10, window.innerWidth - rect.right);
                    const y = Math.max(10, rect.bottom + gap);
                    timeOverlay.style.right = `${right}px`;
                    timeOverlay.style.top = `${y}px`;
                } else {
                    timeOverlay.style.right = '10px';
                    timeOverlay.style.top = '53px';
                }
            } catch {
                timeOverlay.style.right = '10px';
                timeOverlay.style.top = '53px';
            }
        }

        // 保持可配置：允许通过 CSS 调整圆角
        try {
            const br = window.getComputedStyle(panel).borderRadius;
            if (br) {
                panel.style.borderRadius = br;
            }
        } catch {
            // ignore
        }
    };

    layout();
    window.addEventListener('resize', layout);

    const show = () => {
        layout();
        root.style.transform = 'translateX(0)';
    };

    const hide = () => {
        closeTimePicker();
        closeDirFilterPopover();
        clearDirPreview();
        hideTripDetail();
        root.style.transform = 'translateX(calc(100% + 24px))';
    };

    const setTitle = (text) => {
        title.textContent = toText(text);
        try {
            adjustPanelTitleFit(title);
        } catch {
            // ignore
        }
    };

    const adjustPanelTitleFit = (el) => {
        if (!el || !(el instanceof Element)) return;
        // Reset to single-line nowrap to test fitting
        el.classList.remove('is-multiline');
        el.style.whiteSpace = 'nowrap';
        // Start from configured 30px down to 20px
        const maxFs = 30;
        const minFs = 25;
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
        setTitle(name);

        currentStationId = toText(props?.id);
        currentStationNameZh = toText(props?.name_zh || props?.['name:zh'] || name);

        // 用 serving_ids 驱动交互恢复/公司过滤
        const servingIdsRaw = normalizeArrayLike(props?.serving_ids);
        currentStationServingIds = servingIdsRaw.map(String).filter(Boolean);
        pendingGridDataDebugLog = true;
        expandedDirKeys = new Set();
        mouseArmedKey = null;
        lastAppliedHoverKey = null;
        tapArmedKey = null;
        clearHoverTimer();
        clearRestoreTimer();
        clearTripHighlightTimer();
        hideTripDetail();
        closeDirFilterPopover();
        clearDirPreview();
        lastTripDetailKey = null;

        const lineStationNameByLineId = await buildTransferLineStationNameMap({
            stationId: currentStationId,
            stationNameZh: currentStationNameZh,
            servingLineIds: currentStationServingIds
        });
        if (renderToken !== stationRenderToken) return;

        // 渲染 popup 同结构的内容（公司分组 + 线路）
        body.innerHTML = buildCompaniesHtml(props || {}, { getLineMeta, companyLogoMap, lineStationNameByLineId });

        // 默认折叠态：填充每条线路的“未来最近 3 条”班次
        renderAllTimetables();

        show();
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
        tapArmedKey = null;
        mouseArmedKey = null;
        restoreStationLinesIfNeeded();
        clearDirPreview();
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
        layout
    };
}
