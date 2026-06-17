import { ensureLineIconForRwLineContent, prependLineIconElements } from '../../lib/line-icons.js';
import { getCompanyLogoCandidates, setImageElementFromCache } from '../../lib/fetch.js';
import {
    DEFAULT_MOBILE_SHEET_PEEK_PX,
    createMobileSheetDragSession,
    getMobileSheetOffsetForState,
    resolveMobileSheetDragTarget,
    updateMobileSheetDragSession
} from '../../ui/mobileSheetSnap.js';
import { createMobileSheetPullDownController } from '../../ui/mobileSheetPullDown.js';
import { scheduleOverflowTextMarquees } from '../../ui/overflowMarquee.js';

const toText = (value) => String(value ?? '').trim();

const createEl = (doc, tagName, className = '', attrs = {}) => {
    const el = doc.createElement(tagName);
    if (className) el.className = className;
    for (const [key, value] of Object.entries(attrs || {})) {
        if (value == null) continue;
        if (key === 'text') el.textContent = String(value);
        else el.setAttribute(key, String(value));
    }
    return el;
};

const findCompany = (model, companyName) => (
    (Array.isArray(model?.companies) ? model.companies : [])
        .find((company) => toText(company?.companyName) === toText(companyName))
    || null
);

const createCompanyLogo = (doc, company) => {
    const logoFile = toText(company?.logoFile);
    if (!logoFile) return null;
    const img = createEl(doc, 'img', 'mobile-menu-company-logo', {
        alt: company?.displayName || company?.companyName || ''
    });
    if (company?.shouldReverseLogo) img.classList.add('reverse-color');
    img.decoding = 'async';
    img.loading = 'eager';
    const logoWidth = Number(company?.logoWidth);
    if (Number.isFinite(logoWidth) && logoWidth > 0) {
        img.style.width = `${Math.max(20, Math.min(72, Math.round(logoWidth)))}px`;
    }
    setImageElementFromCache(img, getCompanyLogoCandidates(logoFile), {
        cacheKey: `mobileMenuCompanyLogo:${logoFile}`
    }).catch(() => null);
    return img;
};

const createCompanyLogoSlot = (doc, company) => {
    const slot = createEl(doc, 'span', 'mobile-menu-company-logo-slot', { 'aria-hidden': 'true' });
    const logo = createCompanyLogo(doc, company);
    if (logo) slot.appendChild(logo);
    return slot;
};

const createLineTerminal = (doc, terminalText) => {
    const text = toText(terminalText);
    if (!text) return null;
    const root = createEl(doc, 'span', 'mobile-menu-line-terminal', {
        'aria-label': text,
        title: text
    });
    root.appendChild(createEl(doc, 'span', 'mobile-menu-line-terminal-inner', { text }));
    return root;
};

export const createMobileMenu = ({
    doc = globalThis.document,
    win = globalThis.window,
    model = null,
    onCompanyClick = null,
    onLineClick = null,
    onClose = null
} = {}) => {
    if (!doc?.createElement) return null;

    let currentModel = model || { companies: [] };
    let screen = 'companies';
    let activeCompanyName = '';
    let drawerState = 'hidden';
    let dragState = null;

    const root = createEl(doc, 'div', 'mobile-menu-sheet is-hidden', {
        'data-mobile-menu': '1',
        'data-mobile-menu-screen': 'companies'
    });
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '线路菜单');

    const backdrop = createEl(doc, 'button', 'mobile-menu-backdrop', {
        type: 'button',
        'aria-label': '关闭菜单'
    });

    const sheet = createEl(doc, 'section', 'mobile-menu-panel');
    sheet.style.setProperty('--mobile-sheet-peek-height', `${DEFAULT_MOBILE_SHEET_PEEK_PX}px`);
    const dragBar = createEl(doc, 'div', 'mobile-menu-drag-bar', { 'aria-hidden': 'true' });
    const header = createEl(doc, 'div', 'mobile-menu-header');
    const backBtn = createEl(doc, 'button', 'mobile-menu-back-btn', {
        type: 'button',
        'aria-label': '返回公司列表'
    });
    backBtn.textContent = '‹';
    const title = createEl(doc, 'div', 'mobile-menu-title', { text: '运营公司' });
    const closeBtn = createEl(doc, 'button', 'mobile-menu-close-btn', {
        type: 'button',
        'aria-label': '关闭菜单'
    });
    closeBtn.textContent = '×';
    const content = createEl(doc, 'div', 'mobile-menu-content');

    header.appendChild(backBtn);
    header.appendChild(title);
    header.appendChild(closeBtn);
    sheet.appendChild(dragBar);
    sheet.appendChild(header);
    sheet.appendChild(content);
    root.appendChild(backdrop);
    root.appendChild(sheet);

    const getPanelHeight = () => Math.max(1, Math.round(sheet.getBoundingClientRect?.().height || win?.innerHeight || 1));
    const getSnapOptions = () => ({ height: getPanelHeight(), peekPx: DEFAULT_MOBILE_SHEET_PEEK_PX });
    const scheduleLineTerminalMarquees = () => {
        if (screen !== 'lines') return false;
        return scheduleOverflowTextMarquees(content, {
            marqueeSelector: '.mobile-menu-line-terminal',
            innerSelector: '.mobile-menu-line-terminal-inner',
            scrollContainer: content,
            maxAnimations: 6,
            respectReducedMotion: false,
            win,
            holdMs: 1800,
            speedPxPerSec: 24,
            minTravelMs: 1200
        });
    };

    const applyDrawerState = (state = drawerState, { transition = true } = {}) => {
        drawerState = state === 'hidden'
            ? 'hidden'
            : (state === 'collapsed' ? 'collapsed' : (state === 'half' ? 'half' : 'expanded'));
        root.setAttribute('data-mobile-menu-state', drawerState);
        sheet.style.transition = transition ? '' : 'none';
        if (drawerState === 'hidden') {
            sheet.style.transform = 'translateY(calc(100% + 24px))';
        } else if (drawerState === 'collapsed') {
            sheet.style.transform = `translateY(${getMobileSheetOffsetForState('collapsed', getSnapOptions())}px)`;
        } else if (drawerState === 'half') {
            sheet.style.transform = `translateY(${getMobileSheetOffsetForState('half', getSnapOptions())}px)`;
        } else {
            sheet.style.transform = 'translateY(0)';
        }
    };

    const setScreen = (nextScreen, companyName = '') => {
        screen = nextScreen === 'lines' ? 'lines' : 'companies';
        activeCompanyName = screen === 'lines' ? toText(companyName) : '';
        root.setAttribute('data-mobile-menu-screen', screen);
        backBtn.hidden = screen !== 'lines';
        backBtn.setAttribute('aria-hidden', screen === 'lines' ? 'false' : 'true');
        title.textContent = screen === 'lines'
            ? (findCompany(currentModel, activeCompanyName)?.displayName || activeCompanyName || '线路')
            : '运营公司';
    };

    const renderCompanies = () => {
        content.textContent = '';
        const list = createEl(doc, 'ul', 'mobile-menu-list mobile-menu-company-list');
        for (const company of (Array.isArray(currentModel?.companies) ? currentModel.companies : [])) {
            const item = createEl(doc, 'li', 'mobile-menu-item');
            const button = createEl(doc, 'button', 'mobile-menu-row mobile-menu-company-row', {
                type: 'button',
                'data-company-id': company.companyName
            });
            const text = createEl(doc, 'span', 'mobile-menu-row-text');
            const main = createEl(doc, 'span', 'mobile-menu-row-main', { text: company.displayName || company.companyName });
            text.appendChild(main);
            button.appendChild(createCompanyLogoSlot(doc, company));
            button.appendChild(text);
            button.appendChild(createEl(doc, 'span', 'mobile-menu-row-chevron', { text: '›', 'aria-hidden': 'true' }));
            item.appendChild(button);
            list.appendChild(item);
        }
        content.appendChild(list);
        setScreen('companies');
    };

    const renderLines = (companyName) => {
        const company = findCompany(currentModel, companyName);
        if (!company) {
            renderCompanies();
            return;
        }
        content.textContent = '';
        const list = createEl(doc, 'ul', 'mobile-menu-list mobile-menu-line-list');
        const allItem = createEl(doc, 'li', 'mobile-menu-item');
        const allButton = createEl(doc, 'button', 'mobile-menu-row mobile-menu-company-select-row', {
            type: 'button',
            'data-company-id': company.companyName
        });
        allButton.appendChild(createEl(doc, 'span', 'mobile-menu-row-main', { text: '显示全部线路' }));
        allItem.appendChild(allButton);
        list.appendChild(allItem);

        for (const line of (Array.isArray(company.lines) ? company.lines : [])) {
            const item = createEl(doc, 'li', 'mobile-menu-item');
            const button = createEl(doc, 'button', 'mobile-menu-row mobile-menu-line-row', {
                type: 'button',
                'data-line-id': line.lineId
            });
            const text = createEl(doc, 'span', 'mobile-menu-row-text');
            text.appendChild(createEl(doc, 'span', 'mobile-menu-row-main', { text: line.lineName || line.lineId }));
            button.appendChild(text);
            const terminal = createLineTerminal(doc, line.terminalText);
            if (terminal) button.appendChild(terminal);
            try {
                if (line.isVirtualThrough) {
                    prependLineIconElements(button, {
                        routeId: String(line.lineId),
                        codes: line.virtualCodes,
                        color: line.virtualColor
                    });
                } else {
                    ensureLineIconForRwLineContent(button, String(line.lineId));
                }
            } catch {
                // Icons are enhancement only; the menu remains usable without them.
            }
            item.appendChild(button);
            list.appendChild(item);
        }
        content.appendChild(list);
        setScreen('lines', company.companyName);
        scheduleLineTerminalMarquees();
    };

    const isOpen = () => !root.classList.contains('is-hidden');

    const close = () => {
        applyDrawerState('hidden');
        root.classList.add('is-hidden');
        onClose?.();
    };

    const open = () => {
        renderCompanies();
        root.classList.remove('is-hidden');
        applyDrawerState('expanded');
    };

    const beginDrag = (event) => {
        if (root.classList.contains('is-hidden')) return false;
        if (event?.button != null && event.button !== 0) return false;
        dragState = {
            pointerId: event?.pointerId,
            session: createMobileSheetDragSession({
                startY: Number(event?.clientY) || 0,
                startState: drawerState,
                startOffset: drawerState === 'hidden'
                    ? getPanelHeight()
                    : getMobileSheetOffsetForState(drawerState, getSnapOptions()),
                height: getPanelHeight(),
                peekPx: DEFAULT_MOBILE_SHEET_PEEK_PX,
                nowMs: Number(event?.timeStamp) || undefined
            })
        };
        root.setAttribute('data-mobile-menu-dragging', '1');
        sheet.style.transition = 'none';
        try {
            dragBar.setPointerCapture?.(event.pointerId);
        } catch {
            // Pointer capture is best-effort across embedded browsers.
        }
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return true;
    };

    const updateDrag = (event) => {
        if (!dragState) return;
        if (dragState.pointerId != null && event?.pointerId !== dragState.pointerId) return;
        updateMobileSheetDragSession(dragState.session, {
            clientY: Number(event?.clientY) || dragState.session.currentY,
            nowMs: Number(event?.timeStamp) || undefined
        });
        sheet.style.transform = `translateY(${dragState.session.currentOffset}px)`;
        event?.preventDefault?.();
        event?.stopPropagation?.();
    };

    const endDrag = (event, { cancelled = false } = {}) => {
        if (!dragState) return;
        if (dragState.pointerId != null && event?.pointerId !== dragState.pointerId) return;
        const targetState = resolveMobileSheetDragTarget(dragState.session, {
            clientY: cancelled ? dragState.session.startY : (Number(event?.clientY) || dragState.session.currentY),
            nowMs: Number(event?.timeStamp) || undefined,
            cancelled
        });
        dragState = null;
        root.removeAttribute('data-mobile-menu-dragging');
        sheet.style.transition = '';
        try {
            dragBar.releasePointerCapture?.(event.pointerId);
        } catch {
            // ignore pointer-capture gaps
        }
        applyDrawerState(targetState);
        event?.preventDefault?.();
        event?.stopPropagation?.();
    };

    root.addEventListener('click', (event) => {
        const companyButton = event.target?.closest?.('.mobile-menu-company-row');
        if (companyButton && root.contains(companyButton)) {
            event.preventDefault?.();
            event.stopPropagation?.();
            renderLines(companyButton.getAttribute('data-company-id'));
            return;
        }

        const companySelectButton = event.target?.closest?.('.mobile-menu-company-select-row');
        if (companySelectButton && root.contains(companySelectButton)) {
            event.preventDefault?.();
            event.stopPropagation?.();
            const companyName = companySelectButton.getAttribute('data-company-id');
            onCompanyClick?.(companyName, { source: 'click' });
            close();
            return;
        }

        const lineButton = event.target?.closest?.('.mobile-menu-line-row');
        if (lineButton && root.contains(lineButton)) {
            event.preventDefault?.();
            event.stopPropagation?.();
            const lineId = lineButton.getAttribute('data-line-id');
            const company = findCompany(currentModel, activeCompanyName);
            const line = (Array.isArray(company?.lines) ? company.lines : [])
                .find((item) => toText(item?.lineId) === toText(lineId));
            onLineClick?.(lineId, {
                source: 'click',
                mainLineId: line?.lineId || lineId,
                mainLineName: line?.lineName || lineId,
                mergedLineIds: Array.isArray(line?.mergedLineIds) ? line.mergedLineIds.slice() : [lineId]
            });
            close();
        }
    });

    backBtn.addEventListener('click', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        renderCompanies();
    });

    closeBtn.addEventListener('click', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        close();
    });

    backdrop.addEventListener('click', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        close();
    });

    dragBar.addEventListener('pointerdown', beginDrag, { passive: false });
    dragBar.addEventListener('pointermove', updateDrag, { passive: false });
    doc.addEventListener?.('pointermove', updateDrag, { capture: true, passive: false });
    dragBar.addEventListener('pointerup', endDrag, { passive: false });
    doc.addEventListener?.('pointerup', endDrag, { capture: true, passive: false });
    dragBar.addEventListener('pointercancel', (event) => endDrag(event, { cancelled: true }), { passive: false });
    doc.addEventListener?.('pointercancel', (event) => endDrag(event, { cancelled: true }), { capture: true, passive: false });
    dragBar.addEventListener('lostpointercapture', (event) => endDrag(event, { cancelled: true }), { passive: false });
    createMobileSheetPullDownController({
        scrollEl: content,
        doc,
        isEnabled: () => !root.classList.contains('is-hidden'),
        beginSheetDrag: beginDrag,
        updateSheetDrag: updateDrag,
        endSheetDrag: endDrag
    });

    let terminalMarqueeScrollPending = false;
    content.addEventListener('scroll', () => {
        if (screen !== 'lines' || terminalMarqueeScrollPending) return;
        terminalMarqueeScrollPending = true;
        const raf = win?.requestAnimationFrame;
        const run = () => {
            terminalMarqueeScrollPending = false;
            scheduleLineTerminalMarquees();
        };
        if (typeof raf === 'function') raf(run);
        else run();
    }, { passive: true });

    doc.addEventListener?.('keydown', (event) => {
        if (!isOpen()) return;
        if (event?.key !== 'Escape') return;
        event.preventDefault?.();
        if (screen === 'lines') renderCompanies();
        else close();
    });

    const handleBackIntent = () => {
        if (!isOpen()) return false;
        if (screen === 'lines') {
            renderCompanies();
            return true;
        }
        close();
        return true;
    };

    const mount = (container = doc.body || doc.documentElement) => {
        if (root.parentNode !== container) container?.appendChild?.(root);
        renderCompanies();
    };

    const setModel = (nextModel) => {
        currentModel = nextModel || { companies: [] };
        if (!root.classList.contains('is-hidden')) {
            if (screen === 'lines' && activeCompanyName) renderLines(activeCompanyName);
            else renderCompanies();
        }
    };

    return {
        close,
        getActiveCompany: () => activeCompanyName,
        getScreen: () => screen,
        handleBackIntent,
        isOpen,
        mount,
        open,
        root,
        setModel
    };
};
