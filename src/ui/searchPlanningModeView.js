export const createSearchPlanningModeView = ({ searchRoot, onToggle } = {}) => {
    const doc = searchRoot.ownerDocument;
    const win = doc.defaultView;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'search-planning-mode-btn';
    button.hidden = true;

    const icon = doc.createElement('span');
    icon.className = 'search-planning-mode-icon';
    icon.setAttribute('aria-hidden', 'true');
    const label = doc.createElement('span');
    button.append(icon, label);
    searchRoot.appendChild(button);

    const layoutProperties = [
        '--search-planning-mode-left',
        '--search-planning-mode-bottom',
        '--mobile-search-entry-list-max-height'
    ];
    let observedTimebar = null;

    const updateLayout = () => {
        const dataset = doc.documentElement.dataset;
        if (dataset.mobileUi !== '1' || dataset.mobileNavActive !== 'search') {
            layoutProperties.forEach((property) => searchRoot.style.removeProperty(property));
            return;
        }

        const timebar = doc.querySelector('.settings-top-timebar');
        if (timebar && timebar !== observedTimebar) {
            if (observedTimebar) resizeObserver.unobserve(observedTimebar);
            observedTimebar = timebar;
            resizeObserver.observe(timebar);
        }

        const rootRect = searchRoot.getBoundingClientRect();
        const gap = parseFloat(win.getComputedStyle(searchRoot).getPropertyValue('--mobile-search-mode-switch-gap'));
        const modeHeight = button.getBoundingClientRect().height;
        const viewportTop = win.visualViewport?.offsetTop || 0;
        const timebarBottom = timebar?.getBoundingClientRect().bottom || 0;
        const topClearance = Math.max(viewportTop + 12, timebarBottom + gap);
        const historyTopLimit = rootRect.top - gap - modeHeight - (modeHeight ? gap : 0);
        const listHeight = parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--mobile-search-entry-list-max-height'));

        // 使用当前表单的可见边界，兼顾键盘、途径点滚动和折叠屏布局。
        searchRoot.style.setProperty('--search-planning-mode-left', `${rootRect.left}px`);
        searchRoot.style.setProperty('--search-planning-mode-bottom', `${win.innerHeight - rootRect.top + gap}px`);
        searchRoot.style.setProperty('--mobile-search-entry-list-max-height', `${Math.max(0, Math.min(listHeight, historyTopLimit - topClearance))}px`);
    };

    const resizeObserver = new win.ResizeObserver(updateLayout);
    resizeObserver.observe(searchRoot);
    // 键盘显隐会改变表单位置，但不一定改变其高度。
    const visibilityObserver = new win.MutationObserver(updateLayout);
    visibilityObserver.observe(doc.documentElement, {
        attributes: true,
        attributeFilter: ['data-mobile-keyboard-visible', 'data-mobile-ui', 'data-mobile-nav-active', 'data-mobile-journey-plan-results']
    });
    win.addEventListener('resize', updateLayout);
    win.visualViewport?.addEventListener('resize', updateLayout);
    win.visualViewport?.addEventListener('scroll', updateLayout);

    const handlePointerDown = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };
    const handleClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
    };
    button.addEventListener('pointerdown', handlePointerDown);
    button.addEventListener('click', handleClick);

    return {
        render({ plannerExpanded, heatmapVisible }) {
            const text = heatmapVisible ? '出行热图' : '路线规划';
            const target = heatmapVisible ? '路线规划' : '出行热图';
            button.hidden = !plannerExpanded && !heatmapVisible;
            button.dataset.mode = heatmapVisible ? 'heatmap' : 'journey';
            label.textContent = text;
            button.setAttribute('aria-label', `${text}，切换到${target}`);
            button.title = `切换到${target}`;
            updateLayout();
        },
        destroy() {
            resizeObserver.disconnect();
            visibilityObserver.disconnect();
            win.removeEventListener('resize', updateLayout);
            win.visualViewport?.removeEventListener('resize', updateLayout);
            win.visualViewport?.removeEventListener('scroll', updateLayout);
            layoutProperties.forEach((property) => searchRoot.style.removeProperty(property));
            button.remove();
        }
    };
};
