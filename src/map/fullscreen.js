/**
 * fullscreen.js — 全屏浏览模式
 *
 * 点击全屏按钮后进入浏览器全屏，同时隐藏所有 UI 元素（保留线路/站点高亮）。
 * 在全屏模式下，点击地图空白处即退出全屏并恢复所有 UI，但**不会**重置高亮。
 * 按 Escape 退出全屏同样恢复 UI。
 */

import { getIconCandidates, getPreferredCachedImageSrc, setImageElementFromCache } from '../lib/fetch.js';

const resolveMapAdapter = (mapOrEngine) => ({
    hasLayer: (layerId) => (
        typeof mapOrEngine?.hasLayer === 'function'
            ? mapOrEngine.hasLayer(layerId)
            : Boolean(layerId && mapOrEngine?.getLayer?.(layerId))
    ),
    off: (...args) => mapOrEngine?.off?.(...args),
    on: (...args) => mapOrEngine?.on?.(...args),
    queryRenderedFeatures: (...args) => mapOrEngine?.queryRenderedFeatures?.(...args),
    resize: (...args) => mapOrEngine?.resize?.(...args)
});

/** @type {boolean} 当前是否处于全屏浏览模式 */
let isFullscreenMode = false;

/**
 * 外部可读取此标志，用于在 bindClickBlankToRestore 中跳过 clearSelectionsAndRestore。
 * 当全屏退出的那一次 click 被消费后，此标志会被重置为 false。
 */
export function isInFullscreenMode() {
    return isFullscreenMode;
}

/**
 * 初始化全屏功能。
 * @param {maplibregl.Map} map
 * @param {{ allowTap: (evt: Event) => boolean }} touchTapGuard
 */
export function initFullscreen(mapOrEngine, touchTapGuard) {
    const mapAdapter = resolveMapAdapter(mapOrEngine);
    const isPhoneBrowser = () => {
        const isCoarsePointer = typeof window.matchMedia === 'function'
            ? window.matchMedia('(pointer: coarse)').matches
            : false;
        const isNarrowScreen = typeof window.matchMedia === 'function'
            ? window.matchMedia('(max-width: 900px)').matches
            : false;
        return isCoarsePointer && isNarrowScreen;
    };

    // 在 settings-ui 按钮左侧创建全屏 FAB
    const fullscreenFab = document.createElement('button');
    fullscreenFab.type = 'button';
    fullscreenFab.className = 'fullscreen-fab';
    fullscreenFab.setAttribute('aria-label', '全屏浏览');

    const fullscreenIcon = document.createElement('img');
    fullscreenIcon.className = 'fullscreen-fab-icon';
    fullscreenIcon.alt = '';
    setImageElementFromCache(fullscreenIcon, getIconCandidates('fs.svg'), {
        cacheKey: 'icon:fs.svg',
        fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('fs.svg'), { cacheKey: 'icon:fs.svg' })
    }).catch(() => null);
    fullscreenFab.appendChild(fullscreenIcon);
    document.body.appendChild(fullscreenFab);

    // ---- 需要隐藏/恢复的 UI 选择器 ----
    const UI_SELECTORS = [
        '.settings-top-timebar',
        '.mobile-bottom-nav',
        '.settings-ui',
        '.export-ui',
        '.ms-ui',
        '.search-ui',
        '.journey-ui',
        '.journey-results',
        '.journey-plan-results',
        '.journey-trip-popover',
        '.RW-company',
        '.selection-badge',
        '.maplibregl-ctrl-top-left',
        '.maplibregl-ctrl-top-right',
        '.maplibregl-ctrl-bottom-left',
        '.maplibregl-ctrl-bottom-right',
        '.maplibregl-popup',
        '.panel-dir-filter-popover',
        '.panel-trip-detail',
        '.fullscreen-fab',
    ];

    // panel 根节点不在上述选择器中，需要特殊处理
    // panel root 一般是 document.body 最后一个 position:fixed 且 data-panel-root 的 div
    const getPanelRoot = () => document.querySelector('[data-panel-root]')
        || document.querySelector('.panel-container')?.closest('[style*="position"]')
        || null;

    /** 收集所有当前可见的 UI 节点 */
    function collectUIElements() {
        const els = [];
        for (const sel of UI_SELECTORS) {
            document.querySelectorAll(sel).forEach(el => els.push(el));
        }
        const panelRoot = getPanelRoot();
        if (panelRoot) els.push(panelRoot);
        return els;
    }

    /** 保存原始 display 并隐藏 */
    const hiddenMap = new Map();

    function hideAllUI() {
        hiddenMap.clear();
        const els = collectUIElements();
        for (const el of els) {
            hiddenMap.set(el, el.style.display);
            el.style.display = 'none';
        }
    }

    function restoreAllUI() {
        for (const [el, prev] of hiddenMap) {
            el.style.display = prev ?? '';
        }
        hiddenMap.clear();
    }

    // ---- 进入全屏 ----
    function enterFullscreen() {
        if (isFullscreenMode) return;
        isFullscreenMode = true;

        hideAllUI();

        const docEl = document.documentElement;
        const rfs = docEl.requestFullscreen
            || docEl.webkitRequestFullscreen
            || docEl.mozRequestFullScreen
            || docEl.msRequestFullscreen;

        if (rfs) {
            rfs.call(docEl).catch(() => {
                // 若浏览器拒绝全屏（如非用户手势），回退
                exitFullscreenMode();
            });
        }

        // 注册一次性空白点击监听（退出全屏）
        registerBlankClickExit();
    }

    // ---- 退出全屏 ----
    function exitFullscreenMode() {
        if (!isFullscreenMode) return;
        isFullscreenMode = false;

        restoreAllUI();

        
        // 退出浏览器全屏（仅桌面端保持当前逻辑；手机版仅恢复 UI）
        if (!isPhoneBrowser() && (document.fullscreenElement || document.webkitFullscreenElement)) {
            const exitFn = document.exitFullscreen
                || document.webkitExitFullscreen
                || document.mozCancelFullScreen
                || document.msExitFullscreen;
            if (exitFn) exitFn.call(document).catch(() => {});
        }
        
        // 触发地图 resize 以适应窗口变化
        setTimeout(() => mapAdapter.resize(), 100);
    }

    // ---- 空白点击退出 ----
    let blankClickHandler = null;

    function registerBlankClickExit() {
        // 移除旧的（防止重复注册）
        if (blankClickHandler) {
            mapAdapter.off('click', blankClickHandler);
        }

        blankClickHandler = (e) => {
            if (!isFullscreenMode) return;
            if (!touchTapGuard.allowTap(e?.originalEvent)) return;

            const layers = [];
            if (mapAdapter.hasLayer('lines-layer')) layers.push('lines-layer');
            if (mapAdapter.hasLayer('stations-layer')) layers.push('stations-layer');

            const hits = layers.length ? mapAdapter.queryRenderedFeatures(e.point, { layers }) : [];
            //if (hits.length) return; // 点击到了线路或站点，不退出

            // 空白点击 → 退出全屏（不重置高亮）
            exitFullscreenMode();

            // 移除自身
            mapAdapter.off('click', blankClickHandler);
            blankClickHandler = null;
        };

        mapAdapter.on('click', blankClickHandler);
    }

    // ---- 监听浏览器 fullscreenchange（Escape 键退出等） ----
    const onFullscreenChange = () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement && isFullscreenMode) {
            // 浏览器已退出全屏（如按 Escape），同步恢复 UI
            exitFullscreenMode();
        }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    // ---- 绑定 FAB 点击 ----
    fullscreenFab.addEventListener('click', (e) => {
        e.stopPropagation();
        enterFullscreen();
    });
}
