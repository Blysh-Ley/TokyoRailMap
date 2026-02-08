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

    const root = el('div', 'search-ui');

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

    root.appendChild(bar);
    root.appendChild(results);
    document.body.appendChild(root);

    const ui = {
        root,
        input,
        results,
        list,
        query: '',
        items: [],
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
            this.setQuery('');
            this.input.value = '';
            this.setResults([]);
            this.showResults(false);
        },
        render() {
            while (this.list.firstChild) this.list.removeChild(this.list.firstChild);

            const q = String(this.query || '').trim();
            if (!q) {
                this.showResults(false);
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
                        wrap.appendChild(document.createTextNode('（'));

                        metas.forEach((x, idx) => {
                            if (idx > 0) wrap.appendChild(document.createTextNode('、'));
                            const seg = document.createElement('span');
                            seg.textContent = String(x.meta.name);
                            if (x.meta.color) seg.style.color = String(x.meta.color);
                            wrap.appendChild(seg);
                        });

                        wrap.appendChild(document.createTextNode('）'));
                        text.appendChild(wrap);
                    }
                } else {
                    text = el('div', 'search-result-text', { text: item?.text ?? '' });
                }

                row.appendChild(icon);
                row.appendChild(text);

                // 交互逻辑稍后实现：这里先阻止默认行为（未来可用于选择/定位）
                row.addEventListener('click', (evt) => {
                    evt.preventDefault?.();
                    evt.stopPropagation?.();
                });

                li.appendChild(row);
                this.list.appendChild(li);
            }

            this.showResults(true);
        }
    };

    // “实时展示搜索结果”：目前仅做 UI 行为（显示/隐藏 + 空状态），不做真正搜索。
    const refresh = async () => {
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

    // 首次加载：提前拉取数据，提高首个输入的响应
    ensureDataLoaded();

    // 点击搜索框以外区域：先不做收起逻辑（避免超出你“仅 UI”范围）

    window.TokyoRailSearchUI = ui;
    return ui;
}

// 自动挂载
mountSearchUI();
