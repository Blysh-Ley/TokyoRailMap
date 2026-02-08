/**
 * 搜索框 UI（仅 UI 构建；搜索逻辑稍后接入）
 *
 * 设计目标：风格尽量与左侧菜单一致；顶部左侧圆角半透明；结果面板为圆角矩形列表。
 */

import { loadGeoJSON } from './data.js';

function el(tag, className, attrs = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null) continue;
        if (k === 'text') node.textContent = String(v);
        else node.setAttribute(k, String(v));
    }
    return node;
}

function buildResultIcon(item) {
    if (!item || !item.type) return buildResultIcon({ type: 'station' });

    if (item.type === 'company') {
        const img = el('img', 'search-result-icon search-result-icon--company', { alt: '' });
        if (item.logoUrl) img.src = String(item.logoUrl);
        return img;
    }

    if (item.type === 'line') {
        // line：保持 18px 槽位对齐；内部色条水平居中
        const wrap = el('span', 'search-result-icon');
        const bar = el('span', 'search-result-icon--line');
        if (item.color) bar.style.background = String(item.color);
        wrap.appendChild(bar);
        return wrap;
    }

    // station：保持 18px 槽位对齐；内部圆点可按是否换乘调整尺寸
    const wrap = el('span', 'search-result-icon');
    const dot = el('span', 'search-result-icon--station');
    wrap.appendChild(dot);
    return wrap;
}

const normalizeText = (v) => String(v ?? '').trim();

const tokenizeQuery = (q) =>
    normalizeText(q)
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

const matchScore = (haystack, tokens) => {
    const s = normalizeText(haystack).toLowerCase();
    if (!s) return -1;
    if (!tokens.length) return -1;
    for (const t of tokens) {
        if (!s.includes(t)) return -1;
    }
    // 简单排序：前缀匹配优先，其次短字符串优先
    const first = tokens[0];
    const prefix = first && s.startsWith(first) ? 20 : 0;
    const compact = Math.max(0, 12 - Math.min(12, s.length / 4));
    return 10 + prefix + compact;
};

const getCompanyLogoUrl = (companyName) => {
    const map = window.TokyoRailCompanyLogoMap || {};
    const base = window.TokyoRailCompanyLogoBasePath || './companyLogos/';
    const meta = map?.[companyName];
    const file = meta?.img?.[0];
    if (!file) return null;
    // base 可能是 './companyLogos/' 或 '/companyLogos/'
    return String(base).endsWith('/') ? `${base}${file}` : `${base}/${file}`;
};

let stationIndex = []; // { type:'station', id, text, names[], isTransfer }
let lineIndex = [];    // { type:'line', id, text, names[], company, color }
let companyIndex = []; // { type:'company', id, text, names[] }
let lineMetaById = new Map(); // lineId -> { name, color }
let dataReady = false;
let dataLoading = false;

async function ensureDataLoaded() {
    if (dataReady || dataLoading) return;
    dataLoading = true;
    try {
        const [stationsData, linesData] = await Promise.all([
            loadGeoJSON('./stations.geojson'),
            loadGeoJSON('./lines.geojson')
        ]);

        const stations = Array.isArray(stationsData?.features) ? stationsData.features : [];
        const lines = Array.isArray(linesData?.features) ? linesData.features : [];

        stationIndex = stations
            .map((f) => {
                const p = f?.properties || {};
                const id = p.id ?? f?.id;
                const nameZh = normalizeText(p.name_zh || p['name:zh'] || p.name || p.name_ja || p['name:ja']);
                const name = normalizeText(p.name || '');
                const nameJa = normalizeText(p.name_ja || p['name:ja'] || '');
                const nameAltZh = normalizeText(p.name_zh || p['name:zh'] || '');
                const servingIds = Array.isArray(p.serving_ids)
                    ? p.serving_ids.map(String).filter(Boolean)
                    : (typeof p.serving_ids === 'string' ? [p.serving_ids] : []);
                const isTransfer = servingIds.length > 1;

                // 用于展示“对应线路名”：优先用 platform_line_id（站台所属线路）
                // 若没有则回退 serving_ids / serving_lines
                const platformIds = Array.isArray(p.platform_line_id)
                    ? p.platform_line_id.map(String).filter(Boolean)
                    : [];
                const servingLinesFallback = Array.isArray(p.serving_lines)
                    ? p.serving_lines.map(String).filter(Boolean)
                    : (typeof p.serving_lines === 'string' ? [p.serving_lines] : []);

                const lineIds = Array.from(
                    new Set(
                        (platformIds.length ? platformIds : (servingIds.length ? servingIds : servingLinesFallback))
                            .map(String)
                            .filter(Boolean)
                    )
                );

                if (!id || !nameZh) return null;
                return {
                    type: 'station',
                    id: String(id),
                    text: nameZh,
                    names: [nameZh, nameAltZh, name, nameJa].map(normalizeText).filter(Boolean),
                    isTransfer,
                    lineIds
                };
            })
            .filter(Boolean);

        lineIndex = lines
            .map((f) => {
                const p = f?.properties || {};
                const id = p.id ?? f?.id;
                const name = normalizeText(p.name || id);
                const company = normalizeText(p.company || '');
                const color = normalizeText(p.color || '');
                if (!id || !name) return null;
                // 去掉公司名括号：只保留空格分隔
                const text = name;
                return {
                    type: 'line',
                    id: String(id),
                    text,
                    names: [name, company, text].map(normalizeText).filter(Boolean),
                    company,
                    color: color || null
                };
            })
            .filter(Boolean);

        lineMetaById = new Map();
        for (const l of lineIndex) {
            if (!l?.id) continue;
            const displayName = normalizeText(l.text);
            // l.text 里可能含公司名；展示线路名时优先用原始 name
            const baseName = normalizeText(l.names?.[0] || '') || displayName;
            lineMetaById.set(String(l.id), { name: baseName, color: l.color || null });
        }

        // 公司：从 companyLogoMap + lines 的 company 汇总
        const companies = new Set();
        const logoMap = window.TokyoRailCompanyLogoMap || {};
        Object.keys(logoMap).forEach((k) => companies.add(String(k)));
        lineIndex.forEach((l) => {
            if (l.company) companies.add(String(l.company));
        });

        companyIndex = Array.from(companies)
            .map((name) => {
                const n = normalizeText(name);
                if (!n) return null;
                return {
                    type: 'company',
                    id: n,
                    text: n,
                    names: [n]
                };
            })
            .filter(Boolean);

        dataReady = true;
    } catch (e) {
        console.error('search.js: 数据加载失败', e);
        dataReady = false;
    } finally {
        dataLoading = false;
    }
}

function buildSearchResults(query, { limit = 12 } = {}) {
    const tokens = tokenizeQuery(query);
    if (!tokens.length) return [];
    if (!dataReady) return [];

    const scored = [];

    for (const c of companyIndex) {
        const score = matchScore(c.text, tokens);
        if (score >= 0) {
            scored.push({
                score,
                item: {
                    type: 'company',
                    id: c.id,
                    text: c.text,
                    logoUrl: getCompanyLogoUrl(c.text)
                }
            });
        }
    }

    for (const l of lineIndex) {
        let best = -1;
        for (const n of l.names) best = Math.max(best, matchScore(n, tokens));
        if (best >= 0) {
            scored.push({
                score: best,
                item: {
                    type: 'line',
                    id: l.id,
                    text: l.text,
                    color: l.color || null
                }
            });
        }
    }

    for (const s of stationIndex) {
        let best = -1;
        for (const n of s.names) best = Math.max(best, matchScore(n, tokens));
        if (best >= 0) {
            scored.push({
                score: best + (s.isTransfer ? 3 : 0),
                item: {
                    type: 'station',
                    id: s.id,
                    text: s.text,
                    isTransfer: s.isTransfer,
                    lineIds: Array.isArray(s.lineIds) ? s.lineIds.slice() : []
                }
            });
        }
    }

    scored.sort((a, b) => b.score - a.score || String(a.item.text).localeCompare(String(b.item.text)));
    return scored.slice(0, limit).map((x) => x.item);
}

export function mountSearchUI() {
    // 避免重复挂载
    if (document.querySelector('.search-ui')) {
        return window.TokyoRailSearchUI;
    }

    const root = el('div', 'search-ui is-collapsed');

    const HISTORY_KEY = 'TokyoRailSearchHistory';
    const MAX_HISTORY = 20;

    const normalizeHistoryQuery = (q) =>
        String(q ?? '')
            .trim()
            .replace(/\s+/g, ' ');

    const loadHistory = () => {
        try {
            const raw = window.localStorage?.getItem?.(HISTORY_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.map(normalizeHistoryQuery).filter(Boolean).slice(0, MAX_HISTORY);
        } catch {
            return [];
        }
    };

    const saveHistory = (items) => {
        try {
            const list = Array.isArray(items) ? items.map(normalizeHistoryQuery).filter(Boolean) : [];
            window.localStorage?.setItem?.(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
        } catch {
            // ignore
        }
    };

    const addHistory = (q) => {
        const value = normalizeHistoryQuery(q);
        if (!value) return;

        const list = loadHistory();
        const next = [value, ...list.filter((x) => x !== value)].slice(0, MAX_HISTORY);
        saveHistory(next);
    };

    const fab = el('button', 'search-fab', { type: 'button', 'aria-label': '搜索' });
    const fabIcon = el('img', 'search-fab-icon', { alt: '' });
    // GitHub Pages 往往部署在子路径（例如 /TokyoRailMap/），因此优先使用相对路径
    // 同时保留“域名根目录”部署的兜底
    {
        const candidates = ['./icons/search.svg', '/icons/search.svg'];
        let idx = 0;
        fabIcon.src = candidates[idx];
        fabIcon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) {
                fabIcon.src = candidates[idx];
            }
        });
    }
    fab.appendChild(fabIcon);

    const bar = el('div', 'search-bar');
    const input = el('input', 'search-input', {
        type: 'search',
        placeholder: '搜索线路 / 站点 / 公司',
        autocomplete: 'off',
        spellcheck: 'false'
    });

    bar.appendChild(input);

    const results = el('div', 'search-results is-hidden');
    const list = el('ul', 'search-results-list');
    results.appendChild(list);

    root.appendChild(fab);
    root.appendChild(bar);
    root.appendChild(results);
    document.body.appendChild(root);

    const getMapActions = () => {
        try {
            return window.TokyoRailSearchMapActions || null;
        } catch {
            return null;
        }
    };

    const readPointerType = (evt) => {
        const pt = evt?.pointerType;
        if (pt) return String(pt);
        const t = evt?.type;
        if (t && String(t).startsWith('touch')) return 'touch';
        return 'mouse';
    };

    const isTouchLike = (pt) => pt === 'touch' || pt === 'pen';

    let previewSnapshot = null;
    let previewAppliedKey = null;
    let suppressEndPreviewCount = 0;

    // 用于把 touch click 与 mouse click 区分开
    let lastTouchDownAt = 0;
    let lastTouchDownKey = null;

    // 触屏适配：第一次 tap = 预览；第二次 tap 同一项 = 提交（不限制间隔时长）
    let touchTapArmedKey = null;

    const startPreviewSessionIfNeeded = () => {
        const actions = getMapActions();
        if (!actions) return null;
        if (!previewSnapshot && typeof actions.snapshotSelectionState === 'function') {
            try {
                previewSnapshot = actions.snapshotSelectionState();
            } catch {
                previewSnapshot = null;
            }
        }
        return actions;
    };

    const endPreviewSession = () => {
        const actions = getMapActions();
        if (actions && previewSnapshot && typeof actions.restoreSelectionState === 'function') {
            try {
                actions.restoreSelectionState(previewSnapshot);
            } catch {
                // ignore
            }
        }
        previewSnapshot = null;
        previewAppliedKey = null;
        touchTapArmedKey = null;

        // station 预览会打开固定 popup；离开预览时关闭
        try {
            actions?.closeStationPopup?.({ committed: false });
        } catch {
            // ignore
        }
    };

    const maybeEndPreviewSession = () => {
        if (suppressEndPreviewCount > 0) {
            suppressEndPreviewCount -= 1;
            return;
        }
        endPreviewSession();
    };

    const expand = () => {
        if (!root.classList.contains('is-collapsed')) return;
        root.classList.remove('is-collapsed');
        // 展开后聚焦输入框，便于直接输入
        try { input.focus?.(); } catch {}

        // 输入为空时：展示搜索记录
        try { ui?.render?.(); } catch {}
    };

    let refresh = async () => {};

    const ui = {
        root,
        fab,
        input,
        results,
        list,
        query: '',
        items: [],
        expand,
        setQuery(q) {
            this.query = String(q ?? '');
        },
        setResults(items) {
            this.items = Array.isArray(items) ? items.slice() : [];
            this.render();
        },
        showResults(show) {
            this.results.classList.toggle('is-hidden', !show);
        },
        clear() {
            // 清空本身会导致“预览结束”，交给 render() 统一处理（避免多次 render/endPreviewSession）
            this.query = '';
            this.items = [];
            this.input.value = '';
            this.render();
        },
        render() {
            // 重新渲染前先结束预览，避免 DOM 被替换后 hover/mouseleave 无法触发导致高亮卡住
            maybeEndPreviewSession();
            while (this.list.firstChild) this.list.removeChild(this.list.firstChild);

            const q = String(this.query || '').trim();
            if (!q) {
                // 展开且输入为空：显示搜索记录（不显示“暂无结果”）
                if (root.classList.contains('is-collapsed')) {
                    this.showResults(false);
                    return;
                }

                const history = loadHistory();
                if (!history.length) {
                    this.showResults(false);
                    return;
                }

                // 顶部标题行：搜索记录
                {
                    const li = document.createElement('li');
                    const head = el('div', 'search-empty', { text: '搜索记录' });
                    head.style.fontSize = '12px';
                    head.style.fontWeight = '600';
                    head.style.paddingTop = '8px';
                    head.style.paddingBottom = '8px';
                    li.appendChild(head);
                    this.list.appendChild(li);
                }

                for (const text of history) {
                    const li = document.createElement('li');
                    const row = el('div', 'search-result-item');
                    const icon = el('span', 'search-result-icon');
                    const label = el('div', 'search-result-text', { text });
                    label.style.flex = '1 1 auto';
                    row.appendChild(icon);
                    row.appendChild(label);

                    const del = el('button', '', { type: 'button', 'aria-label': '删除记录' });
                    del.textContent = 'x';
                    del.style.marginLeft = 'auto';
                    del.style.background = 'transparent';
                    del.style.border = 'none';
                    del.style.padding = '0 2px';
                    del.style.cursor = 'pointer';
                    del.style.color = 'inherit';
                    del.style.fontSize = '15px';
                    del.style.lineHeight = '1';
                    del.style.opacity = '0.7';

                    del.addEventListener('click', (evt) => {
                        evt.preventDefault?.();
                        evt.stopPropagation?.();
                        const next = loadHistory().filter((x) => x !== text);
                        saveHistory(next);
                        ui.render();
                    });

                    row.appendChild(del);

                    row.addEventListener('click', (evt) => {
                        evt.preventDefault?.();
                        evt.stopPropagation?.();
                        input.value = text;
                        refresh();
                        try { input.focus?.(); } catch {}
                    });

                    li.appendChild(row);
                    this.list.appendChild(li);
                }

                // 底部：删除所有记录
                {
                    const li = document.createElement('li');
                    const box = el('div', 'search-empty');
                    box.style.textAlign = 'center';
                    box.style.paddingTop = '10px';
                    box.style.paddingBottom = '10px';

                    const btn = el('button', '', { type: 'button' });
                    btn.textContent = '删除所有记录';
                    btn.style.background = 'transparent';
                    btn.style.border = 'none';
                    btn.style.padding = '0';
                    btn.style.cursor = 'pointer';
                    btn.style.color = 'inherit';
                    btn.style.fontSize = '12px';
                    btn.style.lineHeight = '1.2';

                    btn.addEventListener('click', (evt) => {
                        evt.preventDefault?.();
                        evt.stopPropagation?.();
                        saveHistory([]);
                        ui.render();
                    });

                    box.appendChild(btn);
                    li.appendChild(box);
                    this.list.appendChild(li);
                }

                this.showResults(true);
                return;
            }

            if (!this.items.length) {
                const empty = el('div', 'search-empty', { text: '暂无结果' });
                const li = document.createElement('li');
                li.appendChild(empty);
                this.list.appendChild(li);
                this.showResults(true);
                return;
            }

            for (const item of this.items) {
                const li = document.createElement('li');
                const row = el('div', 'search-result-item');

                const itemKey = `${String(item?.type || '')}:${String(item?.id || item?.text || '')}`;

                const previewItem = (meta = {}) => {
                    const actions = startPreviewSessionIfNeeded();
                    if (!actions) return;

                    // 仅当用户对结果发生预览/交互时才记录搜索内容
                    addHistory(input.value);

                    const type = item?.type;
                    if (type === 'company') {
                        actions.previewCompany?.(item.id);
                        previewAppliedKey = itemKey;
                        return;
                    }

                    if (type === 'line') {
                        actions.previewLine?.(item.id);
                        previewAppliedKey = itemKey;
                        return;
                    }

                    if (type === 'station') {
                        // station popup 依赖 isReady（stations/popup 初始化完成）
                        if (actions.isReady !== true) return;
                        actions.previewStation?.(item.id, { pointerType: meta.pointerType, maxZoom: 12 });
                        previewAppliedKey = itemKey;
                    }
                };

                const commitItem = (meta = {}) => {
                    const actions = getMapActions();
                    if (!actions) return;

                    // 提交也视为有效交互：记录搜索内容
                    addHistory(input.value);

                    // 提交：不再回滚预览快照
                    previewSnapshot = null;
                    previewAppliedKey = null;
                    touchTapArmedKey = null;

                    const type = item?.type;
                    if (type === 'company') {
                        actions.commitCompany?.(item.id);
                        ui.clearAndCollapse();
                        return;
                    }

                    if (type === 'line') {
                        actions.commitLine?.(item.id);
                        ui.clearAndCollapse();
                        return;
                    }

                    if (type === 'station') {
                        if (actions.isReady !== true) return;
                        actions.commitStation?.(item.id, { pointerType: meta.pointerType, maxZoom: 12 });

                        // 提交站点：接下来 ui.clear()/render()/collapse 不应关闭固定 popup
                        suppressEndPreviewCount = Math.max(suppressEndPreviewCount, 2);
                        ui.clearAndCollapse();
                    }
                };

                const icon = buildResultIcon(item);
                // station：保持“换乘站圆点”风格（更粗描边）
                if (item?.type === 'station') {
                    const dot =
                        icon?.classList?.contains('search-result-icon--station')
                            ? icon
                            : icon?.querySelector?.('.search-result-icon--station');
                    const isTransfer = item?.isTransfer === true;
                    const border = isTransfer ? 4 : 0.5;
                    const size = isTransfer ? 18 : 12;
                    if (dot && dot.style) {
                        dot.style.width = `${size}px`;
                        dot.style.height = `${size}px`;
                        dot.style.borderWidth = `${border}px`;
                    }
                }
                let text;
                if (item?.type === 'station') {
                    text = el('div', 'search-result-text');
                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = String(item?.text ?? '');
                    text.appendChild(nameSpan);

                    const ids = Array.isArray(item?.lineIds) ? item.lineIds : [];
                    const metas = ids
                        .map((id) => ({ id: String(id), meta: lineMetaById.get(String(id)) }))
                        .filter((x) => x.meta && x.meta.name);

                    if (metas.length) {
                        const wrap = document.createElement('span');
                        wrap.style.fontSize = '11px';
                        wrap.appendChild(document.createTextNode('  '));

                        metas.forEach((x, idx) => {
                            if (idx > 0) wrap.appendChild(document.createTextNode('、'));
                            const seg = document.createElement('span');
                            seg.textContent = String(x.meta.name);
                            if (x.meta.color) seg.style.color = String(x.meta.color);
                            wrap.appendChild(seg);
                        });

                        //wrap.appendChild(document.createTextNode('）'));
                        text.appendChild(wrap);
                    }
                } else {
                    text = el('div', 'search-result-text', { text: item?.text ?? '' });
                }

                row.appendChild(icon);
                row.appendChild(text);

                // ===== 交互：mouse hover 0.5s 预览；mouse click 提交 =====
                let hoverTimer = null;
                row.addEventListener('mouseenter', (evt) => {
                    const pt = readPointerType(evt);
                    if (isTouchLike(pt)) return;
                    if (hoverTimer) clearTimeout(hoverTimer);
                    hoverTimer = setTimeout(() => {
                        hoverTimer = null;
                        previewItem({ pointerType: 'mouse' });
                    }, 500);
                });

                row.addEventListener('mouseleave', (evt) => {
                    const pt = readPointerType(evt);
                    if (isTouchLike(pt)) return;
                    if (hoverTimer) {
                        clearTimeout(hoverTimer);
                        hoverTimer = null;
                    }
                    if (previewAppliedKey === itemKey) {
                        endPreviewSession();
                    }
                });

                row.addEventListener('click', (evt) => {
                    // 触屏：用 click 做“单击预览 / 同一项第二次点击提交（不限间隔）”，避免在 pointerdown 阶段收起导致后续合成 click 落到地图上
                    const now = Date.now();
                    const isTouchClick = lastTouchDownKey === itemKey && now - lastTouchDownAt <= 1200;
                    if (isTouchClick) {
                        evt.preventDefault?.();
                        evt.stopPropagation?.();

                        // 第二次点击同一项：提交；否则：仅预览并 armed
                        if (touchTapArmedKey === itemKey) {
                            touchTapArmedKey = null;
                            commitItem({ pointerType: 'touch' });
                        } else {
                            touchTapArmedKey = itemKey;
                            previewItem({ pointerType: 'touch' });
                        }
                        return;
                    }

                    evt.preventDefault?.();
                    evt.stopPropagation?.();
                    if (hoverTimer) {
                        clearTimeout(hoverTimer);
                        hoverTimer = null;
                    }
                    commitItem({ pointerType: 'mouse' });
                });

                // touch 标记：记录最近一次 touch/pen 的按下，用于 click 阶段识别
                row.addEventListener(
                    'pointerdown',
                    (evt) => {
                        const pt = readPointerType(evt);
                        if (!isTouchLike(pt)) return;
                        lastTouchDownAt = Date.now();
                        lastTouchDownKey = itemKey;
                    },
                    { passive: true }
                );

                li.appendChild(row);
                this.list.appendChild(li);
            }

            this.showResults(true);
        }
    };

    const collapse = ({ clear = false } = {}) => {
        if (clear) ui.clear();
        else maybeEndPreviewSession();
        touchTapArmedKey = null;
        root.classList.add('is-collapsed');
    };

    const collapseIfEmpty = () => {
        const q = String(input.value || '').trim();
        if (q) return;
        ui.showResults(false);
        collapse({ clear: false });
    };

    const clearAndCollapse = () => {
        ui.clear();
        collapse({ clear: false });
    };

    ui.collapse = collapse;
    ui.clearAndCollapse = clearAndCollapse;

    // “实时展示搜索结果”：目前仅做 UI 行为（显示/隐藏 + 空状态），不做真正搜索。
    refresh = async () => {
        ui.setQuery(input.value);
        const q = String(ui.query || '').trim();
        if (!q) {
            ui.setResults([]);
            return;
        }

        // 确保数据加载
        await ensureDataLoaded();

        if (!dataReady) {
            ui.setResults([]);
            // 用空列表触发“暂无结果”占位（不额外增加新 UI 组件）
            return;
        }

        ui.setResults(buildSearchResults(q));
    };

    input.addEventListener('input', () => {
        // 输入时实时刷新
        refresh();
    });

    // 交互：鼠标 hover 或触屏点击后展开
    root.addEventListener('mouseenter', () => {
        expand();
    });
    root.addEventListener('mouseleave', () => {
        // 仅在“输入为空”时自动收回
        if (root.classList.contains('is-collapsed')) return;
        collapseIfEmpty();
    });
    fab.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        expand();
    });
    fab.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        expand();
    });
    // 任何点击到搜索条也应展开（防止某些浏览器先点到外层）
    bar.addEventListener('pointerdown', () => {
        expand();
    });

    // 点击地图空白位置：无论是否有结果，都清除并收回
    // 说明：这里不依赖 MapLibre 实例，仅基于 #map 容器区域判断。
    const mapEl = document.getElementById('map');
    const shouldIgnoreTarget = (target) => {
        if (!target || !(target instanceof Element)) return false;
        if (root.contains(target)) return true;
        if (target.closest('.RW-wrapper')) return true; // 菜单
        if (target.closest('.maplibregl-popup')) return true; // popup
        if (target.closest('.maplibregl-ctrl')) return true; // 控件
        return false;
    };

    const onMapPress = (evt) => {
        if (root.classList.contains('is-collapsed')) return;
        const target = evt?.target;
        if (shouldIgnoreTarget(target)) return;
        if (!mapEl || !target || !(target instanceof Node) || !mapEl.contains(target)) return;
        clearAndCollapse();
    };

    if (typeof window !== 'undefined' && 'PointerEvent' in window) {
        document.addEventListener('pointerdown', onMapPress, true);
    } else {
        document.addEventListener('mousedown', onMapPress, true);
        document.addEventListener('touchstart', onMapPress, { capture: true, passive: true });
    }

    // 首次加载：提前拉取数据，提高首个输入的响应
    ensureDataLoaded();

    // 收起逻辑：mouseleave(空输入) + 点击地图区域

    window.TokyoRailSearchUI = ui;
    return ui;
}

// 自动挂载
mountSearchUI();
