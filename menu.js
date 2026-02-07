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
 * - logoBasePath: './companyLogos/'
 */

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
        logoBasePath = './companyLogos/'
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

        this.wrapper = null;
        this.wrapperList = null;

        this.wrapperTop = 0;
        this.wrapperHeight = 0;

        this._activeMenuEl = null;

        this._hoverTimerId = null;
        this._hoverTargetEl = null;
        this._committedSinceEnter = false;

        this._enteredAtMs = 0;
    }

    // ---------------------------
    // 1) 生成菜单 DOM
    // ---------------------------
    build() {
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

        const companiesRaw = Object.keys(this.companyObj || {});
        const preferredOrder = [
            'JR东日本',
            '都营地下铁',
            '横滨市营地下铁',
            '东京地下铁',
            '东武铁道',
            '京成电铁',
            '西武铁道',
            '小田急电铁',
            '东急电铁',
            '京王电铁',
            '京急电铁',
            '相模铁道',
            '都营交通',
            '东京单轨电车',
            '首都圈新都市铁道',
            '湘南单轨电车',
            '千叶都市单轨',
            '多摩都市单轨',
            '北总铁道'
        ];

        const rank = new Map(preferredOrder.map((name, idx) => [name, idx]));
        const originalIndex = new Map(companiesRaw.map((name, idx) => [name, idx]));

        // 稳定排序：优先名单按指定顺序，其余公司保持原顺序
        const companies = companiesRaw.slice().sort((a, b) => {
            const ra = rank.has(a) ? rank.get(a) : Number.POSITIVE_INFINITY;
            const rb = rank.has(b) ? rank.get(b) : Number.POSITIVE_INFINITY;
            if (ra !== rb) return ra - rb;
            return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
        });
        const lines = Object.entries(this.linesObj || {});

        companies.forEach((companyName) => {
            const [companyContent, lineListEl] = this.addSubMenu(this.wrapperList, 'company', 'line');
            companyContent.classList.add('RW-company-content');

            const leftBox = document.createElement('div');
            leftBox.className = 'RW-company-left';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'RW-company-name';
            nameSpan.textContent = companyName;
            leftBox.appendChild(nameSpan);

            const type = this.companyLogoMap?.[companyName]?.type || null;
            if (type) {
                const typeSpan = document.createElement('span');
                typeSpan.className = 'RW-company-type';
                typeSpan.textContent = type;
                leftBox.appendChild(typeSpan);
            }
            const abb = this.companyLogoMap?.[companyName]?.abb || companyName;

            const logoFile = this.companyLogoMap?.[companyName]?.img?.[0];
            const logoWidth = this.companyLogoMap?.[companyName]?.img?.[1] || 28;
            let rightEl;

            if (logoFile) {
                const img = document.createElement('img');
                img.className = 'RW-company-logo';
                img.alt = companyName;
                img.src = `${this.logoBasePath}${logoFile}`;
                img.style.width = `${logoWidth}px`;
                rightEl = img;
            } else {
                const placeholder = document.createElement('span');
                placeholder.className = 'RW-company-logo RW-company-logo--placeholder';
                rightEl = placeholder;
            }

            companyContent.appendChild(leftBox);
            companyContent.appendChild(rightEl);

            // 线路层（按公司过滤）
            lines.forEach(([lineId, meta]) => {
                if (!meta) return;
                if (meta.company !== companyName) return;

                // 线路项 + 运行模式子菜单
                const [lineContent, modeListEl] = this.addSubMenu(lineListEl, 'line', 'linedirc');

                let lineName = meta.simplified || String(lineId);
                if (lineName !== abb + '线' && lineName !== abb + '本线' && lineName !== abb + '新线')  {
                    lineName = lineName.replace(abb, '').trim();
                }
                lineContent.textContent = lineName 
                lineContent.dataset.lineId = String(lineId);

                const modes = Array.isArray(meta.modes) && meta.modes.length ? meta.modes : ['all'];

                /*
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
    }

    // ---------------------------
    // 3.5) 悬停 0.5s = 预览选择；离开未点击则恢复“未选中”
    // ---------------------------
    bindHoverSelectPreview() {
        if (!this.wrapper) return;

        const clearHoverTimer = () => {
            if (this._hoverTimerId != null) {
                clearTimeout(this._hoverTimerId);
                this._hoverTimerId = null;
            }
            this._hoverTargetEl = null;
        };

        this.wrapper.addEventListener('mouseenter', () => {
            // 进入菜单一次算一个“会话”：只有真的点击过才算提交
            this._committedSinceEnter = false;
            this._enteredAtMs = performance.now();
            clearHoverTimer();
        });

        this.wrapper.addEventListener('mouseleave', () => {
            clearHoverTimer();

            // 离开菜单且本次没有点击提交：恢复初始状态（什么都没选）
            if (!this._committedSinceEnter) {
                // 防误触：进入菜单后 exitGraceMs 内退出，不重置选择
                if (performance.now() - (this._enteredAtMs || 0) < this.exitGraceMs) {
                    return;
                }
                this.clearActive();
                if (typeof this.onCancelSelection === 'function') {
                    this.onCancelSelection();
                }
            }
        });

        this.wrapper.addEventListener('mouseover', (e) => {
            const content = e.target.closest('.RW-company-content, .RW-line-content, .RW-linedirc-content');
            if (!content || !this.wrapper.contains(content)) return;

            // 同一个目标不重复启动计时器
            if (this._hoverTargetEl === content) return;

            clearHoverTimer();
            this._hoverTargetEl = content;

            this._hoverTimerId = setTimeout(() => {
                this._hoverTimerId = null;

                // 仍然停留在该项上才触发
                if (!this._hoverTargetEl || !this._hoverTargetEl.matches(':hover')) return;

                const companyEl = content.classList.contains('RW-company-content') ? content : null;
                const lineEl = content.classList.contains('RW-line-content') ? content : null;
                const modeEl = content.classList.contains('RW-linedirc-content') ? content : null;

                if (companyEl) {
                    const companyName = companyEl.querySelector('.RW-company-name')?.textContent?.trim();
                    if (!companyName) return;
                    this.markActive(companyEl);
                    if (this.onCompanyClick) this.onCompanyClick(companyName, { source: 'hover' });
                    return;
                }

                if (lineEl) {
                    const lineId = lineEl.dataset.lineId;
                    if (!lineId) return;
                    this.markActive(lineEl);
                    if (this.onLineClick) this.onLineClick(lineId, { source: 'hover' });
                    return;
                }

                if (modeEl) {
                    const lineId = modeEl.dataset.lineId;
                    const mode = modeEl.dataset.mode;
                    if (!lineId || !mode) return;
                    this.markActive(modeEl);
                    if (this.onModeClick) this.onModeClick({ lineId, mode }, { source: 'hover' });
                }
            }, this.hoverDelayMs);
        });
    }

    // ---------------------------
    // 2) 悬停出现（含定位）
    // ---------------------------
    bindHoverShow() {
        if (!this.wrapper) return;

        // 事件委托：对所有 li.RW-item 做 hover 展示子菜单（div.RW-wrapper）
        this.wrapper.addEventListener('mouseover', (e) => {
            const item = e.target.closest('.RW-item');
            if (!item || !this.wrapper.contains(item)) return;

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

            if (companyA && this.wrapper.contains(companyA)) {
                e.preventDefault();
                const companyName = companyA.querySelector('.RW-company-name')?.textContent?.trim();
                if (!companyName) return;

                // 若先通过 hover 预览选中了该项，则本次 click 视为“提交预览”，不应触发反向 toggle
                const commitPreview = !this._committedSinceEnter && this._activeMenuEl === companyA;

                this.markActive(companyA);
                this._committedSinceEnter = true;
                if (this.onCompanyClick) this.onCompanyClick(companyName, { source: 'click', commitPreview });
                this.collapse();
                return;
            }

            if (lineA && this.wrapper.contains(lineA)) {
                e.preventDefault();
                const lineId = lineA.dataset.lineId;
                if (!lineId) return;

                const commitPreview = !this._committedSinceEnter && this._activeMenuEl === lineA;

                this.markActive(lineA);
                this._committedSinceEnter = true;
                if (this.onLineClick) this.onLineClick(lineId, { source: 'click', commitPreview });
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
                    this._committedSinceEnter = true;
                    if (this.onModeClick) this.onModeClick({ lineId, mode }, { source: 'click', commitPreview });
                    this.collapse();
                    return;
                }

                // 兼容：如果外部仍使用“方向/车次层”并挂了 _lineInfo
                const lineInfo = dirA._lineInfo;
                if (!lineInfo) return;
                this.markActive(dirA);
                this._committedSinceEnter = true;
                if (this.onDirClick) this.onDirClick(lineInfo);
                this.collapse();
            }
        });
    }

    collapse() {
        if (!this.wrapper) return;
        this.hideAllSubMenus();
        this.wrapper.style.left = '-190px';
    }

    markActive(el) {
        if (this._activeMenuEl) this._activeMenuEl.classList.remove('RW-active');
        this._activeMenuEl = el;
        el.classList.add('RW-active');
    }

    clearActive() {
        if (this._activeMenuEl) this._activeMenuEl.classList.remove('RW-active');
        this._activeMenuEl = null;
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
            this.wrapper.style.left = '-190px';
        }

        this.wrapper.addEventListener('mouseenter', () => {
            this.wrapper.style.left = '10px';
        });

        this.wrapper.addEventListener('mouseleave', () => {
            this.wrapper.style.left = '-190px';
        });
    }

    // ---------------------------
    // 工具：阻止菜单滚轮/点击冒泡到地图
    // ---------------------------
    preventPropagation() {
        if (!this.wrapper) return;

        // 阻止点击穿透到地图，但不阻断本菜单自身的事件委托
        this.wrapper.addEventListener('click', (e) => e.stopPropagation());

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
