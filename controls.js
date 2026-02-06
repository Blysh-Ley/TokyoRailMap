/**
 * 线路三/四级开关（类别→公司→线路→运行模式(预留)）。
 *
 * MapLibre 本身没有“图层目录树”，但可以：
 * - 用 DOM 做多级开关
 * - 用 map.setFilter(layerId, filter) 控制某个 layer 显示哪些要素
 */

function createEl(tagName, attrs = {}, text = '') {
    const el = document.createElement(tagName);
    Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'className') {
            el.className = v;
            return;
        }
        if (k === 'htmlFor') {
            el.htmlFor = v;
            return;
        }
        el.setAttribute(k, String(v));
    });

    if (text) {
        el.textContent = text;
    }

    return el;
}

function uniqBy(arr, keyFn) {
    const seen = new Set();
    const out = [];
    for (const item of arr) {
        const key = keyFn(item);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

function getCompanyCategory(companyName, presets) {
    if (presets.jrCompanies.has(companyName)) return 'jr';
    if (presets.subwayCompanies.has(companyName)) return 'subway';
    if (presets.majorPrivateCompanies.has(companyName)) return 'major_private';
    return 'other';
}

function buildLinesFilter(activeLines, modeField) {
    // activeLines: Array<{ lineId: string, modes: Set<string> }>
    if (!activeLines.length) {
        return ['==', ['get', 'id'], ''];
    }

    const serviceModeExpr = modeField
        ? ['coalesce', ['get', modeField], 'all']
        : 'all';

    const any = ['any'];

    for (const { lineId, modes } of activeLines) {
        if (!modes || modes.size === 0) {
            continue;
        }

        if (modes.has('all')) {
            // 预留：如果未来有多种运行模式，“all”视为该线路所有模式都显示
            any.push(['==', ['get', 'id'], lineId]);
            continue;
        }

        any.push([
            'all',
            ['==', ['get', 'id'], lineId],
            ['in', serviceModeExpr, ['literal', Array.from(modes)]]
        ]);
    }

    if (any.length === 1) {
        return ['==', ['get', 'id'], ''];
    }

    return any;
}

/**
 * 初始化线路控制面板。
 *
 * @param {import('maplibre-gl').Map} map MapLibre 地图实例
 * @param {any} linesData lines.geojson
 */
export function setupLineControls(map, linesData, options = {}) {
    const containerId = options.containerId ?? 'controls';
    const layerIds = options.layerIds ?? ['lines-layer'];
    const companyField = options.companyField ?? 'company';
    const lineIdField = options.lineIdField ?? 'id';
    const lineNameField = options.lineNameField ?? 'name';
    const modeField = options.modeField ?? 'service_mode';

    // 外部订阅：当“可见线路集合”变化时通知（用于联动站点显示/隐藏等）
    const changeListeners = [];
    let enabledLineIds = new Set();

    // 这些公司名来自你的数据（中文）。如果你后续发现漏了，直接往 Set 里加即可。
    const presets = {
        jrCompanies: new Set(['JR东日本']),
        subwayCompanies: new Set([
            '东京地下铁',
            '都营地下铁',
            '横滨市营地下铁'
        ]),
        majorPrivateCompanies: new Set([
            '东急电铁',
            '京急电铁',
            '东武铁道',
            '西武铁道',
            '京成电铁',
            '京王电铁',
            '小田急电铁',
            '京滨急行电铁',
            '相模铁道'
        ])
    };

    const container = document.getElementById(containerId);
    if (!container) {
        throw new Error(`找不到控制面板容器 #${containerId}`);
    }

    container.innerHTML = '';

    const title = createEl('div', { className: 'panel-title' }, '线路图层');
    container.appendChild(title);

    const features = Array.isArray(linesData?.features) ? linesData.features : [];

    // company -> lines[]
    const lines = features
        .filter((f) => f?.properties?.type === 'line')
        .map((f) => ({
            company: f.properties?.[companyField] ?? '未知公司',
            lineId: f.properties?.[lineIdField] ?? f.id,
            lineName: f.properties?.[lineNameField] ?? String(f.id ?? ''),
            // 运行模式预留：未来可从 properties[modeField] 提取多值
            modes: ['all']
        }))
        .filter((x) => !!x.lineId);

    const uniqueCompanies = uniqBy(lines, (x) => x.company).map((x) => x.company);

    const companyCategory = new Map();
    for (const company of uniqueCompanies) {
        companyCategory.set(company, getCompanyCategory(company, presets));
    }

    const categories = [
        { id: 'jr', label: 'JR东日本' },
        { id: 'subway', label: '地铁公司' },
        { id: 'major_private', label: '大手私铁' },
        { id: 'other', label: '其他公司' }
    ];

    // ======== 状态 ========
    const state = {
        categoryEnabled: new Map(categories.map((c) => [c.id, true])),
        companyEnabled: new Map(uniqueCompanies.map((c) => [c, true])),
        lineEnabled: new Map(lines.map((l) => [l.lineId, true])),
        lineModesEnabled: new Map(lines.map((l) => [l.lineId, new Set(['all'])]))
    };

    // company -> lineIds
    const companyToLines = new Map();
    for (const l of lines) {
        if (!companyToLines.has(l.company)) companyToLines.set(l.company, []);
        companyToLines.get(l.company).push(l.lineId);
    }

    // category -> companies
    const categoryToCompanies = new Map(categories.map((c) => [c.id, []]));
    for (const company of uniqueCompanies) {
        const cat = companyCategory.get(company) ?? 'other';
        categoryToCompanies.get(cat).push(company);
    }

    function setsEqual(a, b) {
        if (a === b) return true;
        if (a.size !== b.size) return false;
        for (const v of a) {
            if (!b.has(v)) return false;
        }
        return true;
    }

    function notifyEnabledLinesChanged(nextEnabledLineIds) {
        if (setsEqual(enabledLineIds, nextEnabledLineIds)) return;
        enabledLineIds = nextEnabledLineIds;
        changeListeners.forEach((fn) => {
            try {
                fn(enabledLineIds);
            } catch (e) {
                console.error('线路开关 onChange 回调异常', e);
            }
        });
    }

    function applyFilter() {
        const activeLines = [];

        for (const l of lines) {
            const cat = companyCategory.get(l.company) ?? 'other';
            if (!state.categoryEnabled.get(cat)) continue;
            if (!state.companyEnabled.get(l.company)) continue;
            if (!state.lineEnabled.get(l.lineId)) continue;

            const modes = state.lineModesEnabled.get(l.lineId) ?? new Set();
            if (modes.size === 0) continue;

            activeLines.push({ lineId: l.lineId, modes });
        }

        // “线路是否启用”用于联动站点：只要该线路有任何模式被选中，就认为线路启用
        notifyEnabledLinesChanged(new Set(activeLines.map((x) => x.lineId)));

        const filter = buildLinesFilter(activeLines, modeField);
        for (const layerId of layerIds) {
            if (!map.getLayer(layerId)) continue;
            map.setFilter(layerId, filter);
        }
    }

    /**
     * 返回当前启用的线路 id 集合（只读使用）。
     */
    function getEnabledLineIds() {
        return enabledLineIds;
    }

    /**
     * 监听线路可见集合变化。
     */
    function onChange(listener) {
        changeListeners.push(listener);
        return () => {
            const idx = changeListeners.indexOf(listener);
            if (idx >= 0) changeListeners.splice(idx, 1);
        };
    }

    function setCategory(catId, enabled) {
        state.categoryEnabled.set(catId, enabled);
        const companies = categoryToCompanies.get(catId) ?? [];
        for (const company of companies) {
            state.companyEnabled.set(company, enabled);
            for (const lineId of companyToLines.get(company) ?? []) {
                state.lineEnabled.set(lineId, enabled);
                state.lineModesEnabled.set(lineId, enabled ? new Set(['all']) : new Set());
            }
        }
    }

    function setCompany(company, enabled) {
        state.companyEnabled.set(company, enabled);
        for (const lineId of companyToLines.get(company) ?? []) {
            state.lineEnabled.set(lineId, enabled);
            state.lineModesEnabled.set(lineId, enabled ? new Set(['all']) : new Set());
        }
    }

    function setLine(lineId, enabled) {
        state.lineEnabled.set(lineId, enabled);
        state.lineModesEnabled.set(lineId, enabled ? new Set(['all']) : new Set());
    }

    function setLineMode(lineId, mode, enabled) {
        const modes = new Set(state.lineModesEnabled.get(lineId) ?? []);
        if (enabled) {
            modes.add(mode);
        } else {
            modes.delete(mode);
        }
        state.lineModesEnabled.set(lineId, modes);
    }

    // ======== UI ========
    const listRoot = createEl('div', { className: 'panel-list' });
    container.appendChild(listRoot);

    function render() {
        listRoot.innerHTML = '';

        for (const cat of categories) {
            const catRow = createEl('div', { className: 'row row-cat' });
            const catId = `cat_${cat.id}`;
            const catCb = createEl('input', { type: 'checkbox', id: catId });
            catCb.checked = !!state.categoryEnabled.get(cat.id);
            catCb.addEventListener('change', () => {
                setCategory(cat.id, catCb.checked);
                render();
                applyFilter();
            });

            const catLabel = createEl('label', { htmlFor: catId }, cat.label);
            catRow.appendChild(catCb);
            catRow.appendChild(catLabel);
            listRoot.appendChild(catRow);

            const companies = categoryToCompanies.get(cat.id) ?? [];
            for (const company of companies) {
                const companyRow = createEl('div', { className: 'row row-company' });
                const companyId = `company_${cat.id}_${company}`;
                const companyCb = createEl('input', { type: 'checkbox', id: companyId });
                companyCb.checked = !!state.companyEnabled.get(company);
                companyCb.disabled = !state.categoryEnabled.get(cat.id);
                companyCb.addEventListener('change', () => {
                    setCompany(company, companyCb.checked);
                    render();
                    applyFilter();
                });

                const companyLabel = createEl('label', { htmlFor: companyId }, company);
                companyRow.appendChild(companyCb);
                companyRow.appendChild(companyLabel);
                listRoot.appendChild(companyRow);

                const companyLineIds = companyToLines.get(company) ?? [];
                const companyLines = lines.filter((l) => companyLineIds.includes(l.lineId));

                for (const line of companyLines) {
                    const lineRow = createEl('div', { className: 'row row-line' });
                    const lineUiId = `line_${line.lineId}`;
                    const lineCb = createEl('input', { type: 'checkbox', id: lineUiId });
                    lineCb.checked = !!state.lineEnabled.get(line.lineId);
                    lineCb.disabled = companyCb.disabled || !companyCb.checked;
                    lineCb.addEventListener('change', () => {
                        setLine(line.lineId, lineCb.checked);
                        render();
                        applyFilter();
                    });

                    const lineLabel = createEl('label', { htmlFor: lineUiId }, line.lineName);
                    lineRow.appendChild(lineCb);
                    lineRow.appendChild(lineLabel);
                    listRoot.appendChild(lineRow);

                    // 运行模式（预留）：先提供一个 "all" 模式开关
                    const modeRow = createEl('div', { className: 'row row-mode' });
                    const modeUiId = `mode_${line.lineId}_all`;
                    const modeCb = createEl('input', { type: 'checkbox', id: modeUiId });
                    const modes = state.lineModesEnabled.get(line.lineId) ?? new Set();
                    modeCb.checked = modes.has('all');
                    modeCb.disabled = lineCb.disabled || !lineCb.checked;
                    modeCb.addEventListener('change', () => {
                        setLineMode(line.lineId, 'all', modeCb.checked);
                        applyFilter();
                    });

                    const modeLabel = createEl('label', { htmlFor: modeUiId }, '运行模式：全部（预留）');
                    modeRow.appendChild(modeCb);
                    modeRow.appendChild(modeLabel);
                    listRoot.appendChild(modeRow);
                }
            }
        }
    }

    render();
    applyFilter();

    return {
        applyFilter,
        getEnabledLineIds,
        onChange
    };
}
