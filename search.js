/**
 * 搜索框 UI（仅 UI 构建；搜索逻辑稍后接入）
 *
 * 设计目标：风格尽量与左侧菜单一致；顶部左侧圆角半透明；结果面板为圆角矩形列表。
 */

import { loadRailGeoDataFromDataFolder } from './data.js';
import { createLineIconElement, getRoutesIndex, resolveMainLineIdForIcon } from './line-icons.js';
import { resolveLineColorForTheme } from './line-icons.js';
import { getCachedJson } from './fetch.js';

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
        const wrap = el('span', 'search-result-icon');
        const img = el('img', 'search-result-icon--company', { alt: '' });
        if (item.logoUrl) img.src = String(item.logoUrl);
        wrap.appendChild(img);
        return wrap;
    }

    if (item.type === 'line') {
        const icon = createLineIconElement({ routeId: item.id, code: item.code, color: item.color });
        if (icon) {
            icon.classList.add('search-result-icon');
            return icon;
        }
        const wrap = el('span', 'search-result-icon');
        return wrap;
    }

    // station：保持 18px 槽位对齐；内部圆点可按是否换乘调整尺寸
    const wrap = el('span', 'search-result-icon');
    const dot = el('span', 'search-result-icon--station');
    wrap.appendChild(dot);
    return wrap;
}

const normalizeText = (v) => String(v ?? '').trim();

const isElementTextMultiLine = (node) => {
    if (!(node instanceof HTMLElement)) return false;
    const cs = window.getComputedStyle(node);
    const lineHeight = Number.parseFloat(cs.lineHeight || '0');
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        return node.getClientRects().length > 1;
    }
    return node.scrollHeight > (lineHeight * 1.45);
};

const refreshStationLineAlignment = (rootEl) => {
    if (!(rootEl instanceof HTMLElement)) return;
    const lineNodes = rootEl.querySelectorAll('.journey-station-result-lines');
    lineNodes.forEach((lineNode) => {
        if (!(lineNode instanceof HTMLElement)) return;
        const textNode = lineNode.closest('.journey-station-result-text');
        if (!(textNode instanceof HTMLElement)) return;
        const isMultiline = isElementTextMultiLine(lineNode);
        textNode.classList.toggle('is-lines-multiline', isMultiline);
        if (isMultiline) {
            textNode.style.setProperty('--journey-line-offset', '0px');
            return;
        }

        const nameNode = textNode.querySelector('.journey-station-result-name');
        if (!(nameNode instanceof HTMLElement)) {
            textNode.style.setProperty('--journey-line-offset', '0px');
            return;
        }

        const nameRect = nameNode.getBoundingClientRect();
        const lineRect = lineNode.getBoundingClientRect();
        const delta = nameRect.bottom - lineRect.bottom;
        const clamped = Math.max(-8, Math.min(8, delta));
        textNode.style.setProperty('--journey-line-offset', `${clamped.toFixed(2)}px`);
    });
};

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

const getCompanyLogoUrl = (companyId) => {
    const map = window.TokyoRailCompanyLogoMap || {};
    const base = window.TokyoRailCompanyLogoBasePath || './companyLogos/';
    const meta = map?.[companyId];
    const file = meta?.img?.[0];
    if (!file) return null;
    // base 可能是 './companyLogos/' 或 '/companyLogos/'
    return String(base).endsWith('/') ? `${base}${file}` : `${base}/${file}`;
};

// ===== railways.json 多语言 title（用于线路搜索） =====
let railwayTitleById = null; // Map<string, any>
let railwayTitleLoading = null;

const getTitleText = (titleObj, key) => normalizeText(titleObj?.[key] || '');

const getTitleZhHans = (titleObj) =>
    normalizeText(titleObj?.['zh-Hans'] || titleObj?.['zh-hans'] || titleObj?.['zh_CN'] || titleObj?.['zh-CN'] || '');

const getTitleZhHant = (titleObj) =>
    normalizeText(titleObj?.['zh-Hant'] || titleObj?.['zh-hant'] || titleObj?.['zh_TW'] || titleObj?.['zh-TW'] || '');

async function ensureRailwayTitlesLoaded() {
    if (railwayTitleById) return railwayTitleById;
    if (railwayTitleLoading) return railwayTitleLoading;
    railwayTitleLoading = (async () => {
        try {
            const list = await getCachedJson('./data/railways.json');
            const arr = Array.isArray(list) ? list : [];
            const map = new Map();
            for (const r of arr) {
                const id = normalizeText(r?.id);
                if (!id) continue;
                map.set(id, r?.title || null);
            }
            railwayTitleById = map;
            return railwayTitleById;
        } catch (e) {
            console.warn('search.js: 无法加载 railways.json（线路多语言搜索将退化）', e);
            railwayTitleById = new Map();
            return railwayTitleById;
        } finally {
            railwayTitleLoading = null;
        }
    })();
    return railwayTitleLoading;
}

let stationIndex = []; // { type:'station', id, text, names[], isTransfer }
let lineIndex = [];    // { type:'line', id, text, names[], company, color, code }
let companyIndex = []; // { type:'company', id, text, names[] }
let lineMetaById = new Map(); // lineId -> { name, color, code }
let dataReady = false;
let dataLoading = false;

let sameCompanyTransferClusterByStationId = null; // Map<stationId, { clusterKey, lineIds:string[] }>
let sameCompanyTransferClusterLoading = null;

let companyMetaMerged = false;

const parseStationNodeId = (nodeId) => {
    const id = normalizeText(nodeId);
    if (!id) return null;
    const parts = id.split('.').filter(Boolean);
    if (parts.length < 3) return null;
    const company = normalizeText(parts[0]);
    const stationName = normalizeText(parts[parts.length - 1]);
    const lineId = normalizeText(parts.slice(0, -1).join('.'));
    if (!company || !stationName || !lineId) return null;
    return { id, company, stationName, lineId };
};

async function ensureSameCompanyTransferClusterLoaded() {
    if (sameCompanyTransferClusterByStationId instanceof Map) return sameCompanyTransferClusterByStationId;
    if (sameCompanyTransferClusterLoading) return sameCompanyTransferClusterLoading;

    sameCompanyTransferClusterLoading = (async () => {
        try {
            const raw = await getCachedJson('./data/station-groups.json');
            const groups = Array.isArray(raw) ? raw : [];

            const out = new Map();

            for (const group of groups) {
                const subGroups = Array.isArray(group) ? group : [];
                const allNodes = [];
                for (const sub of subGroups) {
                    if (!Array.isArray(sub)) continue;
                    for (const nodeId of sub) {
                        const p = parseStationNodeId(nodeId);
                        if (p) allNodes.push(p);
                    }
                }
                if (!allNodes.length) continue;

                const byCompany = new Map();
                for (const node of allNodes) {
                    if (!byCompany.has(node.company)) byCompany.set(node.company, []);
                    byCompany.get(node.company).push(node);
                }

                for (const [company, nodes] of byCompany.entries()) {
                    if (!Array.isArray(nodes) || nodes.length <= 1) continue;

                    const stationName = normalizeText(nodes[0]?.stationName || '');
                    const sortedIds = nodes.map((x) => x.id).sort();
                    const clusterKey = `same-company-transfer:${company}:${stationName}:${sortedIds.join('|')}`;
                    const lineIds = Array.from(new Set(nodes.map((x) => x.lineId))).filter(Boolean);

                    for (const n of nodes) {
                        out.set(n.id, { clusterKey, lineIds });
                    }
                }
            }

            sameCompanyTransferClusterByStationId = out;
            return sameCompanyTransferClusterByStationId;
        } catch (e) {
            console.warn('search.js: 无法加载 station-groups.json（换乘同公司聚类将退化）', e);
            sameCompanyTransferClusterByStationId = new Map();
            return sameCompanyTransferClusterByStationId;
        } finally {
            sameCompanyTransferClusterLoading = null;
        }
    })();

    return sameCompanyTransferClusterLoading;
}

function mergeCompanyMetaIfAvailable() {
    if (companyMetaMerged) return;
    const logoMap = window.TokyoRailCompanyLogoMap || null;
    if (!logoMap || typeof logoMap !== 'object') return;
    const keys = Object.keys(logoMap);
    if (!keys.length) return;

    // 更新 companyIndex：加入中文 zh，可用中文/英文都能搜索，展示优先 zh
    companyIndex = (Array.isArray(companyIndex) ? companyIndex : [])
        .map((c) => {
            if (!c?.id) return c;
            const companyId = normalizeText(c.id);
            const meta = logoMap?.[companyId] || null;
            const zh = normalizeText(meta?.zh || '');
            const display = zh || companyId;
            const names = [display, companyId, zh].map(normalizeText).filter(Boolean);
            return {
                ...c,
                id: companyId,
                text: display,
                names
            };
        })
        .filter(Boolean);

    // 线路索引也补充 company 的中文（不改变展示名，只增强可搜性）
    lineIndex = (Array.isArray(lineIndex) ? lineIndex : [])
        .map((l) => {
            const companyId = normalizeText(l?.company || '');
            if (!companyId) return l;
            const meta = logoMap?.[companyId] || null;
            const zh = normalizeText(meta?.zh || '');
            if (!zh) return l;
            const names = Array.isArray(l?.names) ? l.names.slice() : [];
            if (!names.includes(zh)) names.push(zh);
            return { ...l, names };
        })
        .filter(Boolean);

    companyMetaMerged = true;
}

async function ensureDataLoaded() {
    if (dataReady || dataLoading) return;
    dataLoading = true;
    try {
        const { stationsGeoJSON: stationsData, linesGeoJSON: linesData } = await loadRailGeoDataFromDataFolder();
        const routesIndex = await getRoutesIndex();
        const sameCompanyCluster = await ensureSameCompanyTransferClusterLoaded();

        // 线路多语言 title：用于搜索 + 展示（显示 zh-Hans）
        const titles = await ensureRailwayTitlesLoaded();

        const stations = Array.isArray(stationsData?.features) ? stationsData.features : [];
        const lines = Array.isArray(linesData?.features) ? linesData.features : [];

        const stationRaw = stations
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
                // 若没有则回退 serving_ids
                const platformIds = Array.isArray(p.platform_line_id)
                    ? p.platform_line_id.map(String).filter(Boolean)
                    : [];

                const lineIds = Array.from(
                    new Set(
                        (platformIds.length ? platformIds : servingIds)
                            .map(String)
                            .filter(Boolean)
                    )
                );

                if (!id || !nameZh) return null;
                const sid = String(id);
                const clusterMeta = sameCompanyCluster?.get?.(sid) || null;
                const mergedLineIds = clusterMeta?.lineIds?.length
                    ? clusterMeta.lineIds.slice()
                    : lineIds;

                return {
                    type: 'station',
                    id: sid,
                    text: nameZh,
                    names: [nameZh, nameAltZh, name, nameJa].map(normalizeText).filter(Boolean),
                    isTransfer: isTransfer || !!clusterMeta,
                    lineIds: mergedLineIds,
                    sameCompanyClusterKey: normalizeText(clusterMeta?.clusterKey || '')
                };
            })
            .filter(Boolean);

        if (sameCompanyCluster?.size) {
            const mergedMap = new Map();
            for (const s of stationRaw) {
                const key = s.sameCompanyClusterKey || `single:${s.id}`;
                const prev = mergedMap.get(key);
                if (!prev) {
                    mergedMap.set(key, {
                        ...s,
                        names: Array.isArray(s.names) ? Array.from(new Set(s.names)) : [],
                        lineIds: Array.isArray(s.lineIds) ? Array.from(new Set(s.lineIds)) : []
                    });
                    continue;
                }

                prev.isTransfer = prev.isTransfer || s.isTransfer;
                prev.names = Array.from(new Set([...(prev.names || []), ...(s.names || [])]));
                prev.lineIds = Array.from(new Set([...(prev.lineIds || []), ...(s.lineIds || [])]));
                if (!prev.text && s.text) prev.text = s.text;
            }
            stationIndex = Array.from(mergedMap.values());
        } else {
            stationIndex = stationRaw;
        }

        const lineById = new Map();
        for (const f of lines) {
            const p = f?.properties || {};
            const id = p.id ?? f?.id;
            if (!id) continue;
            const key = String(id);
            if (lineById.has(key)) continue;

            const titleObj = titles?.get?.(key) || null;
            const titleJa = getTitleText(titleObj, 'ja');
            const titleEn = getTitleText(titleObj, 'en');
            const titleKo = getTitleText(titleObj, 'ko');
            const titleZhHans = getTitleZhHans(titleObj);
            const titleZhHant = getTitleZhHant(titleObj);

            // 展示：按需求固定显示 zh-Hans（缺失则回退 name/id）
            const nameRaw = normalizeText(p.name || '');
            const displayName = titleZhHans || nameRaw || key;

            const company = normalizeText(p.company || '');
            const color = normalizeText(p.color || '');
            const resolvedId = resolveMainLineIdForIcon(key, routesIndex) || key;
            const routeMeta = routesIndex.get(resolvedId) || routesIndex.get(key) || null;
            const code = normalizeText(routeMeta?.code || '');
            if (!displayName) continue;

            lineById.set(key, {
                type: 'line',
                id: key,
                text: displayName,
                // 可搜：title 的 ja/en/ko/zh-Hans/zh-Hant + properties.name + company + id
                names: [
                    titleJa,
                    titleEn,
                    titleKo,
                    titleZhHans,
                    titleZhHant,
                    nameRaw,
                    company,
                    key
                ]
                    .map(normalizeText)
                    .filter(Boolean),
                company,
                color: color || normalizeText(routeMeta?.color || '') || null,
                code: code || null
            });
        }
        lineIndex = Array.from(lineById.values());

        lineMetaById = new Map();
        for (const l of lineIndex) {
            if (!l?.id) continue;
            const displayName = normalizeText(l.text);
            lineMetaById.set(String(l.id), { name: displayName, color: l.color || null, code: l.code || null });
        }

        // 公司：从 companyLogoMap + lines 的 company 汇总
        const companies = new Set();
        const logoMap = window.TokyoRailCompanyLogoMap || {};
        Object.keys(logoMap).forEach((k) => companies.add(String(k)));
        lineIndex.forEach((l) => {
            if (l.company) companies.add(String(l.company));
        });

        companyIndex = Array.from(companies)
            .map((companyIdRaw) => {
                const companyId = normalizeText(companyIdRaw);
                if (!companyId) return null;

                const meta = (window.TokyoRailCompanyLogoMap || {})?.[companyId] || null;
                const zh = normalizeText(meta?.zh || '');
                const display = zh || companyId;

                // names: 同时支持用中文/英文 id 搜索
                const names = [display, companyId, zh].map(normalizeText).filter(Boolean);

                return {
                    type: 'company',
                    id: companyId,
                    text: display,
                    names
                };
            })
            .filter(Boolean);

        // 若 app.js 还没把 companyLogoMap 写到 window，则这里先建基本索引；之后在搜索时会自动补齐中文。
        mergeCompanyMetaIfAvailable();

        dataReady = true;
    } catch (e) {
        console.error('search.js: 数据加载失败', e);
        dataReady = false;
    } finally {
        dataLoading = false;
    }
}

function buildSearchResults(query, { limit = 30, allowedTypes = null } = {}) {
    const tokens = tokenizeQuery(query);
    if (!tokens.length) return [];
    if (!dataReady) return [];

    const allowSet = allowedTypes instanceof Set
        ? new Set(Array.from(allowedTypes).map((t) => normalizeText(t).toLowerCase()).filter(Boolean))
        : null;
    const allowStation = !allowSet || allowSet.has('station');
    const allowLine = !allowSet || allowSet.has('line');
    const allowCompany = !allowSet || allowSet.has('company');

    // app.js 的 companyLogoMap 可能晚于索引初始化；每次搜索前尝试补齐一次
    mergeCompanyMetaIfAvailable();

    const stationHits = [];
    const lineHits = [];
    const companyHits = [];

    if (allowCompany) {
        for (const c of companyIndex) {
            let best = -1;
            for (const n of c.names) best = Math.max(best, matchScore(n, tokens));
            if (best >= 0) {
                companyHits.push({
                    score: best,
                    item: {
                        type: 'company',
                        id: c.id,
                        text: c.text,
                        logoUrl: getCompanyLogoUrl(c.id)
                    }
                });
            }
        }
    }

    if (allowLine) {
        for (const l of lineIndex) {
            let best = -1;
            for (const n of l.names) best = Math.max(best, matchScore(n, tokens));
            if (best >= 0) {
                lineHits.push({
                    score: best,
                    item: {
                        type: 'line',
                        id: l.id,
                        text: l.text,
                        color: l.color || null,
                        code: l.code || null
                    }
                });
            }
        }
    }

    if (allowStation) {
        for (const s of stationIndex) {
            let best = -1;
            for (const n of s.names) best = Math.max(best, matchScore(n, tokens));
            if (best >= 0) {
                stationHits.push({
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
    }

    const byScoreThenName = (a, b) => b.score - a.score || String(a.item.text).localeCompare(String(b.item.text));
    stationHits.sort(byScoreThenName);
    lineHits.sort(byScoreThenName);
    companyHits.sort(byScoreThenName);

    const hasNonStation = lineHits.length > 0 || companyHits.length > 0;
    const nonStationReserve = hasNonStation ? Math.min(4, Math.max(1, Math.floor(limit / 3))) : 0;
    const stationTake = Math.max(0, Math.min(stationHits.length, limit - nonStationReserve));

    const out = [];
    out.push(...stationHits.slice(0, stationTake).map((x) => x.item));

    let remaining = Math.max(0, limit - out.length);
    if (remaining > 0) {
        const mergedNonStation = [...lineHits, ...companyHits].sort(byScoreThenName);
        out.push(...mergedNonStation.slice(0, remaining).map((x) => x.item));
    }

    // 若站点本身不足且还有空位，继续补站点尾部（仍保持“站点优先在前”）
    remaining = Math.max(0, limit - out.length);
    if (remaining > 0 && stationHits.length > stationTake) {
        out.push(...stationHits.slice(stationTake, stationTake + remaining).map((x) => x.item));
    }

    return out.slice(0, limit);
}

export async function searchRailEntities(query, { limit = 30, allowedTypes = null } = {}) {
    const q = normalizeText(query);
    if (!q) return [];

    await ensureDataLoaded();
    if (!dataReady) return [];

    return buildSearchResults(q, { limit, allowedTypes });
}

export async function getLineMetaByIds(lineIds) {
    await ensureDataLoaded();
    if (!dataReady) return [];

    const ids = Array.isArray(lineIds) ? lineIds.map((id) => normalizeText(id)).filter(Boolean) : [];
    const out = [];
    for (const id of ids) {
        const meta = lineMetaById.get(String(id));
        if (!meta || !meta.name) continue;
        out.push({ id: String(id), name: String(meta.name), color: meta.color || null });
    }
    return out;
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
                    text = el('div', 'search-result-text search-result-text--station journey-station-result-text');
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'journey-station-result-name';
                    nameSpan.textContent = String(item?.text ?? '');
                    text.appendChild(nameSpan);

                    const ids = Array.isArray(item?.lineIds) ? item.lineIds : [];
                    const metas = ids.map((id) => ({ id: String(id), meta: lineMetaById.get(String(id)) }));

                    if (metas.length) {
                        const wrap = document.createElement('span');
                        wrap.className = 'journey-station-result-lines';
                        wrap.style.fontSize = '11px';
                        wrap.style.whiteSpace = 'normal';

                        metas.forEach((x, idx) => {
                            if (idx > 0) wrap.appendChild(document.createTextNode('、'));
                            const seg = document.createElement('span');
                            seg.textContent = String(x.meta?.name || x.id);
                            if (x.meta?.color) seg.style.color = String(resolveLineColorForTheme(x.meta.color));
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

            window.requestAnimationFrame(() => {
                refreshStationLineAlignment(this.list);
            });

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

    // 中文/日文等 IME 输入：composition 期间 input 事件行为不一致（不同浏览器/平台差异较大）。
    // 这里做稳妥处理：composition 中不刷新，compositionend 时强制刷新。
    let isComposing = false;
    input.addEventListener('compositionstart', () => {
        isComposing = true;
    });
    input.addEventListener('compositionend', () => {
        isComposing = false;
        refresh();
    });
    input.addEventListener('input', () => {
        if (isComposing) return;
        // 输入时实时刷新
        refresh();
    });

    // 有些浏览器在回车/点清除按钮时触发 search 事件而不是 input
    input.addEventListener('search', () => {
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
