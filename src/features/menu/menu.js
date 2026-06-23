/**
 * RWMenuCore（简化版）
 * 仅包含：生成菜单 + 悬停出现(定位) + 点击高亮(回调)
 *
 * 本项目适配：公司 -> 线路（不包含方向/车次层）
 *
 * 依赖（由调用方提供）：
 * - companyObj: { [companyName]: any }
 * - linesObj: { [lineId]: { company: string, simplified?: string, modes?: string[] } }
 *
 * Logo：
 * - companyLogoMap: { [companyName]: string }  // 你手动维护
 * - logoBasePath: COMPANY_LOGO_BASE_PATH
 */

import { ensureLineIconForRwLineContent, prependLineIconElements } from '../../lib/line-icons.js';
import { COMPANY_LOGO_BASE_PATH, getCompanyLogoCandidates, getPreferredCachedImageSrc, setImageElementFromCache } from '../../lib/fetch.js';
import { THROUGH_SERVICE_CONFIGS } from '../../lib/throughServiceManager.js';
import { isBranchLineId, preferredOrder, resolveMainLineIdByBranchRule } from '../../lib/special-condition.js';

const shouldHideInMenuByZhFreight = (meta) => {
    const zhName = String(meta?.simplified || '').trim();
    return zhName.includes('货物') || zhName.includes('大崎支线');
};

const shouldUseRwMenuThroughEntries = (companyName) => String(companyName || '').trim() === 'JR-East';

const toRailwaysOrderKey = (lineId) => {
    const raw = String(lineId ?? '').trim();
    if (!raw) return '';
    const parts = raw.split('.');
    const company = String(parts[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const name = String(parts.slice(1).join('') ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!company || !name) return '';
    return `${company}-${name}`;
};

const findMergeTargetId = (branchLineId, existsFn) => {
    const raw = String(branchLineId ?? '').trim();
    if (!raw) return null;
    const resolved = resolveMainLineIdByBranchRule(raw, existsFn);
    if (!resolved || resolved === raw) return null;
    return resolved;
};

const computeLineDisplayName = (lineId, meta) => meta?.simplified || String(lineId);

const pickTitleText = (titleObj, fallback = '') => {
    const t = titleObj || {};
    return (
        String(t['zh-Hans'] || '').trim() ||
        String(t.zh || '').trim() ||
        String(t['zh-CN'] || '').trim() ||
        String(t['zh-cn'] || '').trim() ||
        String(t['zh-Hant'] || '').trim() ||
        String(t.ja || '').trim() ||
        String(t.en || '').trim() ||
        String(fallback || '').trim()
    );
};

const buildRailwayById = (railwaysList = []) => {
    const map = new Map();
    for (const row of Array.isArray(railwaysList) ? railwaysList : []) {
        const id = String(row?.id || '').trim();
        if (id && !map.has(id)) map.set(id, row);
    }
    return map;
};

const buildStationNameById = (stationsList = []) => {
    const map = new Map();
    for (const row of Array.isArray(stationsList) ? stationsList : []) {
        const id = String(row?.id || '').trim();
        if (!id || map.has(id)) continue;
        map.set(id, pickTitleText(row?.title, id.split('.').pop() || id));
    }
    return map;
};

const getLineTerminalText = (lineId, railwayById, stationNameById) => {
    const id = String(lineId || '').trim();
    if (!id) return '';
    const stationIds = railwayById instanceof Map ? railwayById.get(id)?.stations : null;
    if (!Array.isArray(stationIds) || stationIds.length < 2) return '';
    const firstId = String(stationIds[0] || '').trim();
    const lastId = String(stationIds[stationIds.length - 1] || '').trim();
    if (!firstId || !lastId) return '';
    if (firstId === lastId) return '环线';
    const firstName = String(stationNameById?.get?.(firstId) || firstId.split('.').pop() || firstId).trim();
    const lastName = String(stationNameById?.get?.(lastId) || lastId.split('.').pop() || lastId).trim();
    if (!firstName || !lastName) return '';
    return `${firstName} - ${lastName}`;
};

export const buildMenuModel = ({
    companyObj = {},
    linesObj = {},
    companyLogoMap = {},
    railwaysOrderIndex = null,
    railwaysList = [],
    stationsList = [],
    hiddenLineIds = null
} = {}) => {
    const companiesRaw = Object.keys(companyObj || {});
    const rank = new Map(preferredOrder.map((name, idx) => [name, idx]));
    const originalIndex = new Map(companiesRaw.map((name, idx) => [name, idx]));
    const orderIndex = railwaysOrderIndex instanceof Map ? railwaysOrderIndex : null;
    const lines = Object.entries(linesObj || {});
    const railwayById = buildRailwayById(railwaysList);
    const stationNameById = buildStationNameById(stationsList);
    const hiddenIds = hiddenLineIds instanceof Set
        ? hiddenLineIds
        : new Set(Array.isArray(hiddenLineIds) ? hiddenLineIds.map(String).filter(Boolean) : []);
    const isHiddenLineId = (lineId) => hiddenIds.has(String(lineId || '').trim());
    const mainLineIdByAnyLineId = new Map();
    const mergedLineIdsByMenuLineId = new Map();
    const lineDisplayNameById = new Map();

    const companies = companiesRaw.slice().sort((a, b) => {
        const ra = rank.has(a) ? rank.get(a) : Number.POSITIVE_INFINITY;
        const rb = rank.has(b) ? rank.get(b) : Number.POSITIVE_INFINITY;
        if (ra !== rb) return ra - rb;
        return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
    }).map((companyName) => {
        const companyMeta = companyLogoMap?.[companyName] || {};
        const companyLines = lines.filter(([, meta]) => meta && meta.company === companyName);
        const companyLineMetaById = new Map(companyLines.map(([id, meta]) => [String(id), meta]));
        const companyLineIds = new Set(companyLines.map(([id]) => String(id)));

        const existsMainInCompany = (cand) => {
            const id = String(cand);
            if (!companyLineIds.has(id)) return false;
            if (isBranchLineId(id)) return false;
            const meta = companyLineMetaById.get(id);
            if (!(meta && meta.company === companyName)) return false;
            if (isHiddenLineId(id)) return false;
            if (shouldHideInMenuByZhFreight(meta)) return false;
            return true;
        };

        const branchesByMain = new Map();
        const mergedBranchIds = new Set();
        const exceptionSet = new Set();

        for (const [lineIdRaw] of companyLines) {
            const id = String(lineIdRaw);
            if (!mainLineIdByAnyLineId.has(id)) mainLineIdByAnyLineId.set(id, id);
        }

        for (const [lineIdRaw, meta] of companyLines) {
            const lineId = String(lineIdRaw);
            if (!meta || meta.company !== companyName) continue;
            const target = findMergeTargetId(lineId, existsMainInCompany);
            if (!target) continue;
            if (!branchesByMain.has(target)) branchesByMain.set(target, []);
            branchesByMain.get(target).push(lineId);
            mergedBranchIds.add(lineId);
            mainLineIdByAnyLineId.set(lineId, String(target));
            if (!mainLineIdByAnyLineId.has(String(target))) {
                mainLineIdByAnyLineId.set(String(target), String(target));
            }
        }

        const preferredLineOrderRaw = companyMeta?.order;
        const preferredLineOrder = Array.isArray(preferredLineOrderRaw)
            ? preferredLineOrderRaw.map((x) => String(x)).filter(Boolean)
            : null;

        const decorated = companyLines.map(([lineId, meta], idx) => {
            if (isHiddenLineId(lineId)) return null;
            if (mergedBranchIds.has(String(lineId))) return null;
            if (shouldHideInMenuByZhFreight(meta)) return null;
            if (exceptionSet.has(String(lineId))) return null;

            const lineName = computeLineDisplayName(lineId, meta);
            let orderRank = Number.POSITIVE_INFINITY;
            if (orderIndex && orderIndex.size) {
                const k = toRailwaysOrderKey(lineId);
                const r = k ? orderIndex.get(k) : undefined;
                if (typeof r === 'number' && Number.isFinite(r)) orderRank = r;
            } else if (preferredLineOrder && preferredLineOrder.length) {
                for (let i = 0; i < preferredLineOrder.length; i++) {
                    const token = preferredLineOrder[i];
                    if (token && lineName.includes(token)) {
                        orderRank = i;
                        break;
                    }
                }
            }
            return { lineId: String(lineId), meta, idx, lineName, orderRank };
        }).filter(Boolean);

        let visibleLines = decorated;
        if (shouldUseRwMenuThroughEntries(companyName)) {
            visibleLines = visibleLines.filter((item) => String(item?.lineId || '') !== 'JR-East.ShonanShinjuku');
        }

        if ((orderIndex && orderIndex.size) || (preferredLineOrder && preferredLineOrder.length)) {
            visibleLines.sort((a, b) => {
                if (orderIndex && orderIndex.size) {
                    const aFinite = Number.isFinite(a.orderRank);
                    const bFinite = Number.isFinite(b.orderRank);
                    if (aFinite !== bFinite) return aFinite ? -1 : 1;
                    if (aFinite && bFinite && a.orderRank !== b.orderRank) return b.orderRank - a.orderRank;
                    return a.idx - b.idx;
                }
                if (a.orderRank !== b.orderRank) return a.orderRank - b.orderRank;
                return a.idx - b.idx;
            });
        }

        if (shouldUseRwMenuThroughEntries(companyName)) {
            const insertIndex = Math.min(5, visibleLines.length);
            const virtualRows = THROUGH_SERVICE_CONFIGS.map((entry, idx) => ({
                lineId: String(entry.lineId),
                meta: {
                    company: companyName,
                    modes: ['all']
                },
                lineName: entry.lineName,
                idx: Number.MAX_SAFE_INTEGER - (THROUGH_SERVICE_CONFIGS.length - idx),
                orderRank: Number.POSITIVE_INFINITY,
                isVirtualThrough: true,
                virtualCodes: entry.codes,
                virtualColor: entry.color
            }));
            visibleLines = visibleLines.slice();
            visibleLines.splice(insertIndex, 0, ...virtualRows);
        }

        const menuLines = visibleLines.map((line) => {
            const lineId = String(line.lineId);
            const mergedLineIds = [lineId].concat(branchesByMain.get(lineId) || []);
            mergedLineIdsByMenuLineId.set(lineId, mergedLineIds);
            if (!mainLineIdByAnyLineId.has(lineId)) mainLineIdByAnyLineId.set(lineId, lineId);
            lineDisplayNameById.set(lineId, String(line.lineName));
            return {
                lineId,
                lineName: String(line.lineName),
                terminalText: getLineTerminalText(lineId, railwayById, stationNameById),
                isVirtualThrough: line.isVirtualThrough === true,
                virtualCodes: line.virtualCodes || [],
                virtualColor: String(line.virtualColor || ''),
                mergedLineIds
            };
        });

        return {
            companyName: String(companyName),
            displayName: String(companyMeta?.zh || companyName),
            type: companyMeta?.type || '',
            logoFile: companyMeta?.img?.[0] || '',
            logoWidth: companyMeta?.img?.[1] || 28,
            shouldReverseLogo: !!companyMeta?.reverse,
            lines: menuLines
        };
    });

    return {
        companies,
        lineDisplayNameById,
        mainLineIdByAnyLineId,
        mergedLineIdsByMenuLineId
    };
};

export class Menu {
    constructor({
        companyObj,
        linesObj,
        onCompanyClick,
        onLineClick,
        onModeClick,
        onDirClick,
        onCancelSelection,
        hoverDelayMs = 500,
        exitGraceMs = 500,
        companyLogoMap = {},
        logoBasePath = COMPANY_LOGO_BASE_PATH,
        railwaysOrderIndex = null
    }) {
        this.companyObj = companyObj;
        this.linesObj = linesObj;

        this.onCompanyClick = onCompanyClick;
        this.onLineClick = onLineClick;
        this.onModeClick = onModeClick;
        this.onDirClick = onDirClick;
        this.onCancelSelection = onCancelSelection;

        this.hoverDelayMs = hoverDelayMs;
        this.exitGraceMs = exitGraceMs;

        this.companyLogoMap = companyLogoMap;
        this.logoBasePath = logoBasePath;
        this.railwaysOrderIndex = railwaysOrderIndex instanceof Map ? railwaysOrderIndex : null;

        this.wrapper = null;
        this.wrapperList = null;

        this.wrapperTop = 0;
        this.wrapperHeight = 0;

        this._activeMenuEl = null;

        this._hoverTimerId = null;
        this._hoverTargetEl = null;
        this._committedSinceEnter = false;
        this._activeSetByHover = false;

        this._enteredAtMs = 0;

        // 触屏适配：第一次 tap = hover，第二次 tap 同一项 = click
        this._lastPointerType = 'mouse';
        this._suppressMouseEventsUntilMs = 0;
        this._tapArmedEl = null;
        this._tapArmedAtMs = 0;

        // 触屏从侧边“唤起菜单”的那一下：不应触发任何 hover/预览
        this._ignoreTouchClickUntilMs = 0;

        // 统一“进入/离开菜单会话”的语义（鼠标用 enter/leave，触屏用 tap in/out）
        this._sessionActive = false;

        // 菜单显示线路 -> 实际需要高亮的线路集合（主线 + 若干支线）
        this._mergedLineIdsByMenuLineId = new Map();

        // 任意线路（主/支） -> 主线 id（用于统一选择/底部显示）
        this._mainLineIdByAnyLineId = new Map();

        // 主线 id -> 菜单显示名（用于底部显示主线名/外部 UI 需要时）
        this._lineDisplayNameById = new Map();

        // 主线 id -> 菜单中的 a.RW-line-content（用于“点支线时菜单高亮主线”）
        this._lineContentElByLineId = new Map();

        // 菜单侧滑过程中，禁止 hover 触发子菜单展开
        this._allowHoverSubMenuOpen = false;
        this._slideInUnlockTimerId = null;

        // 从最左边缘离开时的收起缓冲（2s）
        this._leftEdgeLeaveCollapseTimerId = null;
        this._leftEdgeLeaveGraceMs = 1000;

        // 鼠标最近位置：用于侧滑解锁后定位当前实际 hover 项
        this._lastMouseClientX = null;
        this._lastMouseClientY = null;
    }

    // ---------------------------
    // 归并解析（对外/对内通用）
    // ---------------------------
    _resolveMainLineId(anyLineId) {
        const id = String(anyLineId ?? '').trim();
        if (!id) return '';
        return this._mainLineIdByAnyLineId?.get(id) || id;
    }

    resolveLineSelection(anyLineId) {
        const rawLineId = String(anyLineId ?? '').trim();
        if (!rawLineId) return null;

        const mainLineId = this._resolveMainLineId(rawLineId);
        const mergedLineIds = this._mergedLineIdsByMenuLineId?.get(String(mainLineId)) || [String(mainLineId)];

        const mainLineName =
            this._lineDisplayNameById?.get(String(mainLineId)) ||
            this.linesObj?.[String(mainLineId)]?.simplified ||
            String(mainLineId);

        return {
            rawLineId,
            mainLineId: String(mainLineId),
            mainLineName: String(mainLineName),
            mergedLineIds: Array.isArray(mergedLineIds) ? mergedLineIds.map(String).filter(Boolean) : [String(mainLineId)]
        };
    }

    _getMenuLineElByMainLineId(mainLineId) {
        return this._lineContentElByLineId?.get(String(mainLineId)) || null;
    }

    // ---------------------------
    // 触屏/指针 工具
    // ---------------------------
    _nowMs() {
        return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
    }

    _isTouchLikePointer(pointerType) {
        return pointerType === 'touch' || pointerType === 'pen';
    }

    _setLastPointerType(pointerType) {
        this._lastPointerType = pointerType || 'mouse';
        if (this._isTouchLikePointer(this._lastPointerType)) {
            // 触屏会触发一串合成 mouseover/click，短时间内屏蔽 mouseover 以免重复逻辑
            this._suppressMouseEventsUntilMs = this._nowMs() + 800;
        }
    }

    _shouldSuppressMouseEvent() {
        return this._nowMs() < (this._suppressMouseEventsUntilMs || 0);
    }

    _clearHoverPreviewTimer() {
        if (this._hoverTimerId != null) {
            clearTimeout(this._hoverTimerId);
            this._hoverTimerId = null;
        }
        this._hoverTargetEl = null;
    }

    _clearSlideInUnlockTimer() {
        if (this._slideInUnlockTimerId != null) {
            clearTimeout(this._slideInUnlockTimerId);
            this._slideInUnlockTimerId = null;
        }
    }

    _clearLeftEdgeLeaveCollapseTimer() {
        if (this._leftEdgeLeaveCollapseTimerId != null) {
            clearTimeout(this._leftEdgeLeaveCollapseTimerId);
            this._leftEdgeLeaveCollapseTimerId = null;
        }
    }

    _rememberMousePosition(e) {
        const x = Number.isFinite(e?.clientX) ? e.clientX : null;
        const y = Number.isFinite(e?.clientY) ? e.clientY : null;
        if (x !== null) this._lastMouseClientX = x;
        if (y !== null) this._lastMouseClientY = y;
    }

    _resolveHoveredMenuTargetsByPointer() {
        if (!this.wrapper) return { content: null, item: null };

        const x = this._lastMouseClientX;
        const y = this._lastMouseClientY;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return { content: null, item: null };

        const topEl = document.elementFromPoint(x, y);
        if (!topEl) return { content: null, item: null };

        const content = topEl.closest?.('.RW-company-content, .RW-line-content, .RW-linedirc-content') || null;
        const item = topEl.closest?.('.RW-item') || null;

        return {
            content: content && this.wrapper.contains(content) ? content : null,
            item: item && this.wrapper.contains(item) ? item : null
        };
    }

    _startSession() {
        this._committedSinceEnter = false;
        this._enteredAtMs = this._nowMs();
        this._sessionActive = true;
        this._tapArmedEl = null;
        this._tapArmedAtMs = 0;
        this._clearHoverPreviewTimer();
    }

    _endSessionLikeLeave() {
        this._clearHoverPreviewTimer();
        this._tapArmedEl = null;
        this._tapArmedAtMs = 0;

        if (!this._committedSinceEnter) {
            if (this._nowMs() - (this._enteredAtMs || 0) >= this.exitGraceMs) {
                this.clearActive();
                if (typeof this.onCancelSelection === 'function') {
                    this.onCancelSelection();
                }
            }
        }
        this._sessionActive = false;
    }

    _fireHoverPreview(content) {
        if (!content || !this.wrapper || !this.wrapper.contains(content)) return;

        const companyEl = content.classList.contains('RW-company-content') ? content : null;
        const lineEl = content.classList.contains('RW-line-content') ? content : null;
        const modeEl = content.classList.contains('RW-linedirc-content') ? content : null;

        if (companyEl) {
            const companyId = companyEl.dataset.companyId || companyEl.getAttribute('data-company-id') || companyEl.querySelector('.RW-company-name')?.textContent?.trim();
            if (!companyId) return;
            this.markActive(companyEl);
            this._activeSetByHover = true;
            if (this.onCompanyClick) this.onCompanyClick(companyId, { source: 'hover' });
            return;
        }

        if (lineEl) {
            const lineId = lineEl.dataset.lineId;
            if (!lineId) return;

            const resolved = this.resolveLineSelection(lineId);
            if (!resolved) return;

            // 若未来菜单显示支线：hover 支线时，菜单高亮应落在主线项上
            const activeEl = this._getMenuLineElByMainLineId(resolved.mainLineId) || lineEl;

            this.markActive(activeEl);
            this._activeSetByHover = true;
            if (this.onLineClick) {
                this.onLineClick(lineId, {
                    source: 'hover',
                    mainLineId: resolved.mainLineId,
                    mainLineName: resolved.mainLineName,
                    mergedLineIds: resolved.mergedLineIds
                });
            }
            return;
        }

        if (modeEl) {
            const lineId = modeEl.dataset.lineId;
            const mode = modeEl.dataset.mode;
            if (!lineId || !mode) return;
            this.markActive(modeEl);
            this._activeSetByHover = true;
            if (this.onModeClick) this.onModeClick({ lineId, mode }, { source: 'hover' });
        }
    }

    _getExpectedActiveElForContent(content) {
        if (!content || !this.wrapper || !this.wrapper.contains(content)) return null;

        if (content.classList.contains('RW-company-content')) return content;

        if (content.classList.contains('RW-line-content')) {
            const lineId = content.dataset.lineId;
            if (!lineId) return content;
            const resolved = this.resolveLineSelection(lineId);
            if (!resolved) return content;
            return this._getMenuLineElByMainLineId(resolved.mainLineId) || content;
        }

        if (content.classList.contains('RW-linedirc-content')) return content;
        return null;
    }

    _queueHoverPreview(content) {
        if (!content || !this.wrapper || !this.wrapper.contains(content)) return;

        const expectedActiveEl = this._getExpectedActiveElForContent(content);
        if (this._activeSetByHover && this._activeMenuEl && expectedActiveEl && this._activeMenuEl !== expectedActiveEl) {
            this.clearActive();
        }

        if (this._hoverTargetEl === content) return;

        this._clearHoverPreviewTimer();
        this._hoverTargetEl = content;

        this._hoverTimerId = setTimeout(() => {
            this._hoverTimerId = null;

            // 鼠标：仍然停留在该项上才触发；触屏：以“仍是当前 armed/目标项”为准
            if (!this._hoverTargetEl || this._hoverTargetEl !== content) return;
            if (!this._isTouchLikePointer(this._lastPointerType)) {
                const x = this._lastMouseClientX;
                const y = this._lastMouseClientY;
                if (!Number.isFinite(x) || !Number.isFinite(y)) return;
                const topEl = document.elementFromPoint(x, y);
                if (!topEl) return;
                if (!(topEl === content || content.contains(topEl))) return;
            }

            this._fireHoverPreview(content);
        }, this.hoverDelayMs);
    }

    _touchHoverShowSubMenuForContent(content) {
        const item = content?.closest?.('.RW-item');
        if (!item || !this.wrapper || !this.wrapper.contains(item)) return;

        this.hideSiblingSubMenus(item);

        const sub = item.querySelector(':scope > .RW-wrapper');
        if (!sub) return;

        sub.style.display = 'block';
        this.anchorSubMenu(item, sub, 10);
    }

    // ---------------------------
    // 1) 生成菜单 DOM
    // ---------------------------
    build() {
        // 每次 build 重新计算（linesObj 可能会变）
        this._mergedLineIdsByMenuLineId = new Map();
        this._mainLineIdByAnyLineId = new Map();
        this._lineDisplayNameById = new Map();
        this._lineContentElByLineId = new Map();

        const frag = document.createDocumentFragment();

        this.wrapper = this.addTag(
            new Map([
                ['position', frag],
                ['tagName', 'div'],
                ['class', 'RW-wrapper RW-company']
            ])
        );

        this.wrapperList = this.addTag(
            new Map([
                ['position', this.wrapper],
                ['tagName', 'ul'],
                ['class', 'RW-list RW-company-list']
            ])
        );

        const model = buildMenuModel({
            companyObj: this.companyObj,
            linesObj: this.linesObj,
            companyLogoMap: this.companyLogoMap,
            railwaysOrderIndex: this.railwaysOrderIndex
        });
        this._mergedLineIdsByMenuLineId = new Map(model.mergedLineIdsByMenuLineId);
        this._mainLineIdByAnyLineId = new Map(model.mainLineIdByAnyLineId);
        this._lineDisplayNameById = new Map(model.lineDisplayNameById);

        model.companies.forEach((company) => {
            const companyName = company.companyName;
            const [companyContent, lineListEl] = this.addSubMenu(this.wrapperList, 'company', 'line');
            companyContent.classList.add('RW-company-content');
            // 内部 id 固定用英文 key；显示可用中文。
            // 注意：hover/click 回调会使用该 id 来匹配 lines-layer 的 properties.company。
            companyContent.dataset.companyId = String(companyName);

            const leftBox = document.createElement('div');
            leftBox.className = 'RW-company-left';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'RW-company-name';
            nameSpan.textContent = company.displayName;
            leftBox.appendChild(nameSpan);

            if (company.type) {
                const typeSpan = document.createElement('span');
                typeSpan.className = 'RW-company-type';
                typeSpan.textContent = company.type;
                leftBox.appendChild(typeSpan);
            }

            const logoFile = company.logoFile;
            const logoWidth = company.logoWidth || 28;
            let rightEl;

            if (logoFile) {
                const img = document.createElement('img');
                img.className = 'RW-company-logo';
                if (company.shouldReverseLogo) img.classList.add('reverse-color');
                img.alt = companyName;
                const candidates = getCompanyLogoCandidates(logoFile);
                setImageElementFromCache(img, candidates, {
                    cacheKey: `companyLogo:${logoFile}`,
                    fallbackSrc: getPreferredCachedImageSrc(candidates, { cacheKey: `companyLogo:${logoFile}` })
                }).catch(() => null);
                img.style.width = `${logoWidth}px`;
                rightEl = img;
            } else {
                const placeholder = document.createElement('span');
                placeholder.className = 'RW-company-logo RW-company-logo--placeholder';
                rightEl = placeholder;
            }

            companyContent.appendChild(leftBox);
            companyContent.appendChild(rightEl);

            company.lines.forEach(({ lineId, lineName, isVirtualThrough, virtualCodes, virtualColor }) => {
                // 线路项 + 运行模式子菜单
                const lineContent = this.addSubMenu(lineListEl, 'line');

                // 左侧：线路 icon + 线路名（保持 RW-content 的 flex 布局）
                lineContent.textContent = '';

                const leftBox = document.createElement('div');
                leftBox.className = 'RW-line-left';
                leftBox.style.display = 'flex';
                leftBox.style.alignItems = 'center';
                leftBox.style.minWidth = '0';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'RW-line-name';
                nameSpan.textContent = lineName;

                if (isVirtualThrough) {
                    nameSpan.style.fontWeight = 'bold'; 
                    nameSpan.style.fontStyle = 'italic';
                }

                leftBox.appendChild(nameSpan);
                lineContent.appendChild(leftBox);

                lineContent.dataset.lineId = String(lineId);

                // 常规线路走数据驱动 icon；RW 菜单虚拟线走固定 code icon。
                if (isVirtualThrough) {
                    prependLineIconElements(leftBox, { routeId: lineId, codes: virtualCodes, color: virtualColor });
                } else {
                    ensureLineIconForRwLineContent(lineContent, String(lineId));
                }

                // 缓存主线显示名与菜单元素
                this._lineContentElByLineId.set(String(lineId), lineContent);

                /*
                const [lineContent,] = this.addSubMenu(lineListEl, 'line','linedirc');
                const modes = Array.isArray(meta.modes) && meta.modes.length ? meta.modes : ['all'];

                modes.forEach((mode) => {
                    const modeContent = this.addSubMenu(modeListEl, 'linedirc');
                    modeContent.textContent = mode === 'all' ? '运行模式：全部（预留）' : `运行模式：${mode}`;
                    modeContent.dataset.lineId = String(lineId);
                    modeContent.dataset.mode = String(mode);
                });
                */
            });
        });

        return frag;
    }

    mount(container = document.body) {
        const frag = this.build();
        container.appendChild(frag);

        this.preventPropagation();
        this.bindHoverShow();
        this.bindClickHighlight();
        this.bindHoverSelectPreview();
        this.bindSlideInOut();

        // 触屏：tap in/out 会话、点外部收起
        this.bindTouchAdaptation();
    }

    // ---------------------------
    // 触屏适配：第一下 tap 当 hover，第二下 tap 同一项才 click
    // ---------------------------
    bindTouchAdaptation() {
        if (!this.wrapper) return;

        this.wrapper.addEventListener(
            'pointerdown',
            (e) => {
                this._setLastPointerType(e.pointerType);
                if (!this._isTouchLikePointer(this._lastPointerType)) return;

                // 触屏没有 mouseenter：第一次触摸视为进入菜单会话
                if (!this._sessionActive) {
                    this._startSession();
                }

                // 若菜单处于收起状态（只露边），先展开，避免误触直接触发项
                const leftPx = parseFloat(getComputedStyle(this.wrapper).left || '0');
                if (Number.isFinite(leftPx) && leftPx < 0) {
                    this.wrapper.style.left = '10px';

                    // 这一击是“唤起菜单”，吞掉随后的 click/hover
                    const now = this._nowMs();
                    this._ignoreTouchClickUntilMs = now + 600;
                    this._tapArmedEl = null;
                    this._tapArmedAtMs = 0;
                    this._clearHoverPreviewTimer();

                    // 阻止合成 click，避免点到第一项导致立即预览/选中
                    e.preventDefault();
                    e.stopPropagation();
                }
            },
            { passive: false }
        );

        // 触屏：点到菜单外部 = mouseleave（关闭子菜单/可能取消选择）
        document.addEventListener(
            'pointerdown',
            (e) => {
                const pointerType = e.pointerType || 'mouse';
                if (!this._isTouchLikePointer(pointerType)) return;
                if (!this.wrapper) return;
                if (!this.wrapper.contains(e.target)) {
                    if (this._sessionActive) {
                        this.hideAllSubMenus();
                        this.wrapper.style.left = '-200px';
                        this._endSessionLikeLeave();
                    }
                }
            },
            { passive: true }
        );
    }

    // ---------------------------
    // 3.5) 悬停 0.5s = 预览选择；离开未点击则恢复“未选中”
    // ---------------------------
    bindHoverSelectPreview() {
        if (!this.wrapper) return;

        this.wrapper.addEventListener('mouseenter', () => {
            // 进入菜单一次算一个“会话”：只有真的点击过才算提交
            this._startSession();
        });

        this.wrapper.addEventListener('mouseleave', () => {
            this._endSessionLikeLeave();
        });

        this.wrapper.addEventListener('mouseover', (e) => {
            if (this._shouldSuppressMouseEvent()) return;
            this._rememberMousePosition(e);
            const content = e.target.closest('.RW-company-content, .RW-line-content, .RW-linedirc-content');
            if (!content || !this.wrapper.contains(content)) return;

            this._queueHoverPreview(content);
        });

        this.wrapper.addEventListener('mousemove', (e) => {
            this._rememberMousePosition(e);

            if (this._shouldSuppressMouseEvent()) return;
            const content = e.target.closest('.RW-company-content, .RW-line-content, .RW-linedirc-content');
            if (content && this.wrapper.contains(content)) {
                this._queueHoverPreview(content);
                return;
            }

            // 不在任何可预览项上时，清理 pending 预览，避免目标“卡住”
            this._clearHoverPreviewTimer();
            if (this._activeSetByHover) this.clearActive();
        });
    }

    // ---------------------------
    // 2) 悬停出现（含定位）
    // ---------------------------
    bindHoverShow() {
        if (!this.wrapper) return;

        // 事件委托：对所有 li.RW-item 做 hover 展示子菜单（div.RW-wrapper）
        this.wrapper.addEventListener('mouseover', (e) => {
            if (this._shouldSuppressMouseEvent()) return;
            this._rememberMousePosition(e);
            const item = e.target.closest('.RW-item');
            if (!item || !this.wrapper.contains(item)) return;

            if (!this._allowHoverSubMenuOpen) return;

            // 关键：从 A 移到 B 时，先把同级的旧子菜单全部关掉
            this.hideSiblingSubMenus(item);

            const sub = item.querySelector(':scope > .RW-wrapper');
            if (!sub) return;

            sub.style.display = 'block';
            // 子菜单定位：不应使用 wrapperTop 做最小 top（否则屏幕越大，顶部项越被“往下顶”）
            this.anchorSubMenu(item, sub, 10);
        });

        this.wrapper.addEventListener('mouseleave', () => {
            this.hideAllSubMenus();
        });
    }

    hideAllSubMenus() {
        if (!this.wrapper) return;
        this.wrapper.querySelectorAll('.RW-item > .RW-wrapper').forEach((sub) => {
            sub.style.display = 'none';
            // 递归关闭更深层（避免下次打开出现“残留打开状态”）
            sub.querySelectorAll('.RW-wrapper').forEach((nested) => {
                nested.style.display = 'none';
            });
        });
    }

    hideSiblingSubMenus(itemEl) {
        const parentList = itemEl.parentElement;
        if (!parentList) return;

        // 只关闭同一个 ul 下的子菜单，不影响更高层的菜单可见性
        parentList.querySelectorAll(':scope > .RW-item > .RW-wrapper').forEach((sub) => {
            sub.style.display = 'none';
            sub.querySelectorAll('.RW-wrapper').forEach((nested) => {
                nested.style.display = 'none';
            });
        });
    }

    anchorSubMenu(itemEl, subEl, minTop = 10) {
        const subRect = subEl.getBoundingClientRect();
        const itemRect = itemEl.getBoundingClientRect();

        const desiredTop = itemRect.top - 20;
        let left = itemRect.right < 200 ? 200 : itemRect.right;

        // 关键：不要在“可能超出底部”时直接把 top 设为 maxTop。
        // 那会让顶部项（尤其是子菜单很高时）在大屏上被推得越来越下。
        // 正确做法：对 desiredTop 做夹取，只在真的出屏时才上移。
        const maxTop = Math.max(minTop, window.innerHeight - subRect.height - 10);
        const top = Math.min(Math.max(desiredTop, minTop), maxTop);

        subEl.style.position = 'fixed';
        subEl.style.top = `${top}px`;
        subEl.style.left = `${left}px`;
    }

    // ---------------------------
    // 3) 点击高亮（菜单视觉 + 回调）
    // ---------------------------
    bindClickHighlight() {
        if (!this.wrapper) return;

        this.wrapper.addEventListener('click', (e) => {
            const companyA = e.target.closest('.RW-company-content');
            const lineA = e.target.closest('.RW-line-content');
            const dirA = e.target.closest('.RW-linedirc-content');

            // 触屏：第一下 tap 当 hover（不触发 click 回调），第二下 tap 同一项才继续走 click 逻辑
            const isTouchLike = this._isTouchLikePointer(this._lastPointerType);
            if (isTouchLike) {
                // 刚从侧边唤起菜单的那一下：完全忽略（不 hover、不 click）
                if (this._nowMs() < (this._ignoreTouchClickUntilMs || 0)) {
                    e.preventDefault();
                    return;
                }

                const content = companyA || lineA || dirA;
                if (content && this.wrapper.contains(content)) {
                    if (this._tapArmedEl !== content) {
                        e.preventDefault();

                        this._tapArmedEl = content;
                        this._tapArmedAtMs = this._nowMs();

                        // 1) 打开子菜单（hover show）
                        this._touchHoverShowSubMenuForContent(content);

                        // 2) 触屏不做 hoverDelay：直接执行 hover 预览选择
                        this._clearHoverPreviewTimer();
                        this._hoverTargetEl = content;
                        this._fireHoverPreview(content);
                        return;
                    }

                    // 第二次点击同一项：解除 armed，继续走原 click 行为
                    this._tapArmedEl = null;
                    this._tapArmedAtMs = 0;
                }
            }

            if (companyA && this.wrapper.contains(companyA)) {
                e.preventDefault();
                const companyId = companyA.dataset.companyId || companyA.getAttribute('data-company-id') || companyA.querySelector('.RW-company-name')?.textContent?.trim();
                if (!companyId) return;

                // 若先通过 hover 预览选中了该项，则本次 click 视为“提交预览”，不应触发反向 toggle
                const commitPreview = !this._committedSinceEnter && this._activeMenuEl === companyA;

                this.markActive(companyA);
                this._activeSetByHover = false;
                this._committedSinceEnter = true;
                if (this.onCompanyClick) this.onCompanyClick(companyId, { source: 'click', commitPreview });
                this.collapse();
                return;
            }

            if (lineA && this.wrapper.contains(lineA)) {
                e.preventDefault();
                const lineId = lineA.dataset.lineId;
                if (!lineId) return;

                const resolved = this.resolveLineSelection(lineId);
                if (!resolved) return;

                const activeEl = this._getMenuLineElByMainLineId(resolved.mainLineId) || lineA;
                const commitPreview = !this._committedSinceEnter && this._activeMenuEl === activeEl;

                this.markActive(activeEl);
                this._activeSetByHover = false;
                this._committedSinceEnter = true;

                if (this.onLineClick) {
                    this.onLineClick(lineId, {
                        source: 'click',
                        commitPreview,
                        mainLineId: resolved.mainLineId,
                        mainLineName: resolved.mainLineName,
                        mergedLineIds: resolved.mergedLineIds
                    });
                }
                this.collapse();
                return;
            }

            if (dirA && this.wrapper.contains(dirA)) {
                e.preventDefault();
                // 运行模式（预留）
                const lineId = dirA.dataset.lineId;
                const mode = dirA.dataset.mode;
                if (lineId && mode) {
                    const commitPreview = !this._committedSinceEnter && this._activeMenuEl === dirA;
                    this.markActive(dirA);
                    this._activeSetByHover = false;
                    this._committedSinceEnter = true;
                    if (this.onModeClick) this.onModeClick({ lineId, mode }, { source: 'click', commitPreview });
                    this.collapse();
                    return;
                }

                // 兼容：如果外部仍使用“方向/车次层”并挂了 _lineInfo
                const lineInfo = dirA._lineInfo;
                if (!lineInfo) return;
                this.markActive(dirA);
                this._activeSetByHover = false;
                this._committedSinceEnter = true;
                if (this.onDirClick) this.onDirClick(lineInfo);
                this.collapse();
            }
        });
    }

    collapse() {
        if (!this.wrapper) return;
        this.hideAllSubMenus();
        this.wrapper.style.left = '-200px';
    }

    markActive(el) {
        if (this._activeMenuEl) this._activeMenuEl.classList.remove('RW-active');
        this._activeMenuEl = el;
        el.classList.add('RW-active');
    }

    clearActive() {
        if (this._activeMenuEl) this._activeMenuEl.classList.remove('RW-active');
        this._activeMenuEl = null;
        this._activeSetByHover = false;
    }

    // ---------------------------
    // 4) 尺寸（按原项目“占屏 80%，上下各 10%”）
    // ---------------------------
    setWrapperStyle() {
        if (!this.wrapper || !this.wrapperList) return;

        const windowHeight = window.innerHeight;
        this.wrapperHeight = windowHeight * 0.8;
        this.wrapperTop = windowHeight * 0.1;

        this.wrapper.style.top = `${this.wrapperTop}px`;
        this.wrapperList.style.height = `${this.wrapperHeight}px`;

        document.querySelectorAll('.RW-line').forEach((ul) => (ul.style.maxHeight = `${this.wrapperHeight}px`));
        document.querySelectorAll('.RW-linedirc').forEach((ul) => (ul.style.maxHeight = `${this.wrapperHeight}px`));
    }

    // ---------------------------
    // 5) 左侧滑出/收起（匹配你 CSS 中的 transition:left）
    // ---------------------------
    bindSlideInOut() {
        if (!this.wrapper) return;

        // 默认收起（只露出一点边缘，方便鼠标移入触发）
        if (!this.wrapper.style.left) {
            this.wrapper.style.left = '-200px';
            this.wrapper.style.paddingLeft = '10px';
        }

        const getSlideDurationMs = () => {
            const computed = getComputedStyle(this.wrapper);
            const durations = String(computed.transitionDuration || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => {
                    if (s.endsWith('ms')) return parseFloat(s);
                    if (s.endsWith('s')) return parseFloat(s) * 1000;
                    return NaN;
                })
                .filter((n) => Number.isFinite(n));
            if (!durations.length) return 320;
            return Math.max(...durations) + 20;
        };

        const isLeftEdgeLeave = (e) => {
            // 鼠标贴到屏幕最左边缘时，部分环境会触发 wrapper.mouseleave。
            // 这里统一视为“边缘离开”，进入缓冲期而不是立刻收起。
            const x = Number.isFinite(e?.clientX) ? e.clientX : null;
            return x !== null && x <= 1;
        };

        this.wrapper.addEventListener('mouseenter', () => {
            this._clearLeftEdgeLeaveCollapseTimer();
            this._allowHoverSubMenuOpen = false;
            this._clearSlideInUnlockTimer();
            this.wrapper.style.left = '0px';

            this._slideInUnlockTimerId = setTimeout(() => {
                this._slideInUnlockTimerId = null;
                this._allowHoverSubMenuOpen = true;

                // 侧滑解锁后，若鼠标已停在某一项上（没有新的 mouseover 事件），
                // 主动补一次“展开子菜单 + hover 预览排队”，避免体感“hover 失效”。
                const { content: hoveredContent, item: hoveredItem } = this._resolveHoveredMenuTargetsByPointer();

                if (hoveredItem && this.wrapper.contains(hoveredItem)) {
                    this.hideSiblingSubMenus(hoveredItem);
                    const sub = hoveredItem.querySelector(':scope > .RW-wrapper');
                    if (sub) {
                        sub.style.display = 'block';
                        this.anchorSubMenu(hoveredItem, sub, 10);
                    }
                }

                if (hoveredContent && this.wrapper.contains(hoveredContent)) {
                    this._queueHoverPreview(hoveredContent);
                }
            }, getSlideDurationMs());
        });

        this.wrapper.addEventListener('mouseleave', (e) => {
            if (isLeftEdgeLeave(e)) {
                this._clearLeftEdgeLeaveCollapseTimer();
                this._leftEdgeLeaveCollapseTimerId = setTimeout(() => {
                    this._leftEdgeLeaveCollapseTimerId = null;

                    // 缓冲期结束时若鼠标已回到菜单上，则不收起
                    if (this.wrapper && this.wrapper.matches(':hover')) return;

                    this._allowHoverSubMenuOpen = false;
                    this._clearSlideInUnlockTimer();
                    this.wrapper.style.left = '-200px';
                }, this._leftEdgeLeaveGraceMs);
                return;
            }

            this._clearLeftEdgeLeaveCollapseTimer();
            this._allowHoverSubMenuOpen = false;
            this._clearSlideInUnlockTimer();
            this.wrapper.style.left = '-200px';
        });
    }

    // ---------------------------
    // 工具：阻止菜单滚轮/点击冒泡到地图
    // ---------------------------
    preventPropagation() {
        if (!this.wrapper) return;

        // 阻止点击穿透到地图，但不阻断本菜单自身的事件委托
        this.wrapper.addEventListener('click', (e) => e.stopPropagation());

        // 触屏/笔：阻止 pointerdown 穿透到地图（否则可能触发地图拖动）
        this.wrapper.addEventListener('pointerdown', (e) => e.stopPropagation(), { passive: true });

        this.wrapper.querySelectorAll('.RW-list').forEach((list) => {
            list.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
            list.addEventListener('mousedown', (e) => e.stopPropagation());
        });
    }

    // ---------------------------
    // 工具：DOM 生成
    // ---------------------------
    addTag(tagInfo) {
        let tag;
        let position;

        tagInfo.forEach((value, attribute) => {
            if (attribute === 'position') position = value;
            else if (attribute === 'tagName') tag = document.createElement(value);
            else tag?.setAttribute(attribute, value);
        });

        position.appendChild(tag);
        return tag;
    }

    addSubMenu(position, className, nextClassName = null) {
        const item = this.addTag(new Map([['position', position], ['tagName', 'li'], ['class', 'RW-item']]));
        const content = this.addTag(
            new Map([['position', item], ['tagName', 'a'], ['class', `RW-content RW-${className}-content`]])
        );

        if (!nextClassName) return content;

        const wrapper = this.addTag(new Map([['position', item], ['tagName', 'div'], ['class', 'RW-wrapper']]));
        const list = this.addTag(
            new Map([['position', wrapper], ['tagName', 'ul'], ['class', `RW-list RW-${nextClassName}`]])
        );

        wrapper.style.display = 'none';
        return [content, list];
    }
}
