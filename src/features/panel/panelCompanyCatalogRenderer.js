import { resolveMainLineIdForIcon } from '../../lib/line-icons.js';
import { getCompanyLogoSrc } from '../../lib/fetch.js';
import {
    THROUGH_SERVICE_CONFIGS,
    TRIGGER_LINE_IDS
} from '../../lib/throughServiceManager.js';

const defaultToText = (value) => String(value ?? '').trim();
const DEFAULT_COMPANY_NAME = '\u672a\u77e5\u516c\u53f8';

const escapeHtml = (input) => String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeArrayLike = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value ? [value] : [];

    const text = value.trim();
    if (text.startsWith('[') && text.endsWith(']')) {
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : [value];
        } catch {
            return [value];
        }
    }
    return text ? [text] : [];
};

const toRailwaysOrderKey = (lineId) => {
    const raw = String(lineId ?? '').trim();
    if (!raw) return '';
    const parts = raw.split('.');
    const company = String(parts[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const name = String(parts.slice(1).join('') ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!company || !name) return '';
    return `${company}-${name}`;
};

const sortCompanyLines = (lines, { railwaysOrderIndex } = {}) => {
    const src = Array.isArray(lines) ? lines : [];
    const orderIndex = railwaysOrderIndex instanceof Map ? railwaysOrderIndex : null;
    if (!orderIndex || !orderIndex.size) return src;

    let maxTriggerRank = Number.NEGATIVE_INFINITY;
    for (const item of src) {
        if (item?.lineId && TRIGGER_LINE_IDS.has(item.lineId)) {
            const key = toRailwaysOrderKey(item.lineId);
            const rank = key ? orderIndex.get(key) : undefined;
            if (typeof rank === 'number' && Number.isFinite(rank) && rank > maxTriggerRank) {
                maxTriggerRank = rank;
            }
        }
    }

    const decorated = src.map((line, idx) => {
        const key = toRailwaysOrderKey(line?.lineId);
        let rank = key ? orderIndex.get(key) : undefined;

        if (!Number.isFinite(rank) && maxTriggerRank > Number.NEGATIVE_INFINITY) {
            const throughIndex = THROUGH_SERVICE_CONFIGS.findIndex((info) => info.tempId === line?.lineId);
            if (throughIndex !== -1) {
                rank = maxTriggerRank + ((THROUGH_SERVICE_CONFIGS.length - throughIndex) * 0.1);
            }
        }

        return {
            idx,
            line,
            rank: (typeof rank === 'number' && Number.isFinite(rank)) ? rank : Number.POSITIVE_INFINITY
        };
    });

    decorated.sort((a, b) => {
        const aFinite = Number.isFinite(a.rank);
        const bFinite = Number.isFinite(b.rank);
        if (aFinite !== bFinite) return aFinite ? -1 : 1;
        if (aFinite && bFinite && a.rank !== b.rank) return b.rank - a.rank;
        return a.idx - b.idx;
    });

    return decorated.map((item) => item.line);
};

export const buildPanelCompaniesHtml = (props = {}, {
    companyLogoMap,
    fallbackCompanyName = DEFAULT_COMPANY_NAME,
    getLineMeta,
    lineStationNameByLineId,
    railwaysOrderIndex,
    toText = defaultToText
} = {}) => {
    const servingIdsRaw = normalizeArrayLike(props.display_serving_ids ?? props.serving_ids);
    const servingIds = servingIdsRaw.map(String).filter(Boolean);
    const servingIdSet = new Set(servingIds);
    const safeGetLineMeta = typeof getLineMeta === 'function' ? getLineMeta : (() => null);
    const logoMap = companyLogoMap || {};
    const groups = new Map();
    const seenLineIds = new Set();

    for (const lineId of servingIds) {
        const id = String(lineId);
        if (!id || seenLineIds.has(id)) continue;
        seenLineIds.add(id);

        const meta = safeGetLineMeta(id);
        const company = (meta?.company ? String(meta.company) : fallbackCompanyName).trim() || fallbackCompanyName;
        const color = meta?.color || null;
        const abb = logoMap?.[company]?.abb || logoMap?.[company]?.zh || company;

        let displayName = String(meta?.name || '').trim();
        if (!displayName) displayName = id;

        const resolvedMainId = toText(resolveMainLineIdForIcon(id));
        if (resolvedMainId && resolvedMainId !== id && !servingIdSet.has(resolvedMainId)) {
            const resolvedMeta = safeGetLineMeta(resolvedMainId);
            const srcCompany = toText(meta?.company);
            const dstCompany = toText(resolvedMeta?.company);
            const sameCompany = !srcCompany || !dstCompany || srcCompany === dstCompany;
            const resolvedName = toText(resolvedMeta?.name);
            const displayLooksLikeRawId = !displayName || displayName === id || displayName.includes('.');
            if (sameCompany && resolvedName && displayLooksLikeRawId) {
                displayName = resolvedName;
            }
        }

        const isSpecial = displayName === `${abb}\u7dda` || displayName === `${abb}\u672c\u7dda` || displayName === `${abb}\u65b0\u7dda`;
        const displayLooksLikeRawId = displayName === id || displayName.includes('.');
        if (!isSpecial && abb && !displayLooksLikeRawId) displayName = displayName.replace(abb, '').trim();

        if (!groups.has(company)) groups.set(company, []);
        groups.get(company).push({ lineId: id, displayName, color });
    }

    if (!groups.size) return '';

    let companiesHtml = '';
    for (const [company, lines] of groups) {
        const sortedLines = sortCompanyLines(lines, { railwaysOrderIndex });
        const companyZh = logoMap?.[company]?.zh || null;
        const companyDisplay = String(companyZh || company);
        const logoSrc = getCompanyLogoSrc(company, logoMap) || null;
        const logoHtml = logoSrc
            ? `<img class="panel-company-logo" src="${escapeHtml(logoSrc)}" alt="" />`
            : '';

        let linesHtml = '';
        for (const line of sortedLines) {
            const isVirtualThrough = line.lineId
                ? THROUGH_SERVICE_CONFIGS.some((info) => info.tempId === line.lineId || info.lineId === line.lineId)
                : false;
            const boldClass = isVirtualThrough ? ' panel-line-name-main-bold' : '';
            const style = typeof line.color === 'string' && line.color.trim()
                ? ` style="color:${escapeHtml(line.color.trim())}"`
                : '';
            const transferMetaRaw = line.lineId
                ? (lineStationNameByLineId?.get?.(line.lineId) || lineStationNameByLineId?.[line.lineId] || null)
                : null;
            const transferStationName = typeof transferMetaRaw === 'string'
                ? toText(transferMetaRaw)
                : toText(transferMetaRaw?.name || '');
            const actualStationName = typeof transferMetaRaw === 'string'
                ? toText(transferMetaRaw)
                : toText(transferMetaRaw?.actualName || '');
            const idAttr = line.lineId
                ? ` data-line-id="${escapeHtml(String(line.lineId))}" data-station-name="${escapeHtml(actualStationName)}"`
                : '';
            const transferStationCode = typeof transferMetaRaw === 'string'
                ? ''
                : toText(transferMetaRaw?.code || '');
            const suffixHtml = transferStationName
                ? `<span class="panel-line-name-suffix">\uff08${escapeHtml(transferStationName)}\u7ad9\uff09</span>`
                : '';
            const transferCodeAttr = transferStationCode
                ? ` data-transfer-station-code="${escapeHtml(transferStationCode)}"`
                : '';

            linesHtml += `
                <div class="panel-line"${idAttr}${style}>
                    <div class="panel-line-header">
                        <span class="panel-line-name" data-line-name="${escapeHtml(line.displayName)}"${transferCodeAttr}><span class="panel-line-name-main${boldClass}">${escapeHtml(line.displayName)}</span></span>
                    </div>
                    ${suffixHtml ? `<div class="panel-line-suffix-row" data-line-suffix-row="1">${suffixHtml}</div>` : ''}
                    <div class="panel-station-info" data-station-info="1">
                        <span class="panel-station-info-left"></span>
                        <span class="panel-station-info-types" data-station-type-summary="1"></span>
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
};

export const collectPanelCatalogEntries = (body, {
    fallbackCompanyName = DEFAULT_COMPANY_NAME,
    toText = defaultToText
} = {}) => {
    const out = [];
    const companyEls = Array.from(body?.querySelectorAll?.('.panel-company') || []);
    for (const companyEl of companyEls) {
        const companyName = toText(companyEl.querySelector?.('.panel-company-name')?.textContent)
            || toText(companyEl.querySelector?.('.panel-company-header')?.getAttribute?.('data-company'))
            || fallbackCompanyName;
        const companyLinesEl = companyEl.querySelector?.('.panel-company-lines');
        const lineEls = companyLinesEl ? Array.from(companyLinesEl.children || []) : [];
        const lines = [];

        for (const lineEl of lineEls) {
            if (!lineEl?.classList?.contains?.('panel-line')) continue;
            const lineId = toText(lineEl.getAttribute?.('data-line-id'));
            const lineName = toText(lineEl.querySelector?.('.panel-line-name-main')?.textContent)
                || toText(lineEl.querySelector?.('.panel-line-name')?.textContent)
                || lineId;
            if (!lineName) continue;
            lines.push({ lineId, lineName });
        }

        if (lines.length) out.push({ companyName, lines });
    }
    return out;
};

export const renderPanelCatalogEntriesHtml = (entries, {
    fallbackCompanyName = DEFAULT_COMPANY_NAME,
    toText = defaultToText
} = {}) => {
    const safeEntries = Array.isArray(entries) ? entries : [];
    if (!safeEntries.length) return '';

    let html = '';
    for (const company of safeEntries) {
        const companyName = escapeHtml(toText(company?.companyName) || fallbackCompanyName);
        const lines = Array.isArray(company?.lines) ? company.lines : [];
        const lineHtml = lines.map((line) => {
            const lineName = escapeHtml(toText(line?.lineName));
            const lineId = toText(line?.lineId);
            if (lineId) {
                return `<button type="button" class="panel-catalog-line" data-panel-catalog-line-id="${escapeHtml(lineId)}">${lineName}</button>`;
            }
            return `<div class="panel-catalog-line is-static">${lineName}</div>`;
        }).join('');

        html += `
            <div class="panel-catalog-company">
                <div class="panel-catalog-company-name">${companyName}</div>
                <div class="panel-catalog-lines">${lineHtml}</div>
            </div>
        `;
    }
    return html;
};
