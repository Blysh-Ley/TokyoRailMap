import { createLineServiceDiagramViewStore } from '../store/lineServiceDiagramViewStore.js';

export const installLineServiceDiagramView = ({ root, header, viewport, layout, resolveColor, onMove }) => {
    const canvas = viewport.querySelector('.route-map-diagram-canvas');
    const store = createLineServiceDiagramViewStore();
    const events = new AbortController();
    const listen = (element, name, handler, options = {}) => element.addEventListener(name, handler, { ...options, signal: events.signal });
    let gesture = null, suppressClick = false, exporting = false;
    const render = (state) => {
        canvas.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
        onMove();
    };
    const unsubscribe = store.subscribe(render);
    const focus = () => {
        const width = layout.mainBounds.right - layout.mainBounds.left;
        const scale = Math.min(1, (viewport.clientWidth - 24) / width);
        store.dispatch({ type: 'set', payload: { scale, x: (viewport.clientWidth - width * scale) / 2 - layout.mainBounds.left * scale, y: 24 - layout.mainBounds.top * scale } });
    };
    const fit = () => {
        const scale = Math.min((viewport.clientWidth - 24) / layout.width, (viewport.clientHeight - 24) / layout.height);
        store.dispatch({ type: 'set', payload: { scale, x: (viewport.clientWidth - layout.width * scale) / 2, y: (viewport.clientHeight - layout.height * scale) / 2 } });
    };
    const zoom = (factor, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) => store.dispatch({ type: 'zoom', payload: { factor, x, y } });
    listen(header, 'click', (event) => {
        const action = event.target.closest('[data-diagram-action]')?.dataset.diagramAction;
        if (!action) return;
        if (action === 'focus') focus();
        else if (action === 'fit') fit();
        else zoom(action === 'plus' ? 1.2 : 1 / 1.2);
    });
    listen(viewport, 'wheel', (event) => {
        event.preventDefault();
        const bounds = viewport.getBoundingClientRect();
        zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - bounds.left, event.clientY - bounds.top);
    }, { passive: false });
    listen(viewport, 'pointerdown', (event) => {
        if (event.button !== 0) return;
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
        suppressClick = false;
    });
    listen(viewport, 'pointermove', (event) => {
        if (!gesture || event.pointerId !== gesture.id) return;
        if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 6) return;
        gesture.moved = true;
        viewport.setPointerCapture(event.pointerId);
        store.dispatch({ type: 'move', payload: { x: event.clientX - gesture.x, y: event.clientY - gesture.y } });
        gesture.x = event.clientX;
        gesture.y = event.clientY;
        event.preventDefault();
    });
    const endGesture = (event) => {
        if (!gesture || event.pointerId !== gesture.id) return;
        suppressClick = gesture.moved;
        if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
        gesture = null;
    };
    listen(viewport, 'pointerup', endGesture);
    listen(viewport, 'pointercancel', endGesture);
    listen(viewport, 'click', (event) => {
        if (!suppressClick) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick = false;
    }, { capture: true });
    listen(viewport, 'focusin', (event) => {
        const target = event.target.closest('.route-map-diagram-station, .route-map-transfer-items-shell');
        if (!target) return;
        const bounds = viewport.getBoundingClientRect(), rect = target.getBoundingClientRect();
        const x = rect.left < bounds.left + 8 ? bounds.left + 8 - rect.left : rect.right > bounds.right - 8 ? bounds.right - 8 - rect.right : 0;
        const y = rect.top < bounds.top + 8 ? bounds.top + 8 - rect.top : rect.bottom > bounds.bottom - 8 ? bounds.bottom - 8 - rect.bottom : 0;
        if (x || y) store.dispatch({ type: 'move', payload: { x, y } });
    });
    listen(viewport, 'keydown', (event) => {
        if (event.target !== viewport) return;
        const movement = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[event.key];
        if (movement) store.dispatch({ type: 'move', payload: { x: movement[0], y: movement[1] } });
        else if (event.key === '+' || event.key === '=') zoom(1.2);
        else if (event.key === '-') zoom(1 / 1.2);
        else if (event.key === 'Home') focus();
        else return;
        event.preventDefault();
    });
    const resize = new ResizeObserver(() => { if (!exporting && viewport.clientWidth && viewport.clientHeight) focus(); });
    resize.observe(viewport);
    const refreshTheme = () => root.querySelectorAll('[data-source-color]').forEach((element) => {
        const color = resolveColor(element.dataset.sourceColor);
        if (element instanceof SVGElement) element.setAttribute('stroke', color);
        else element.style.color = color;
    });
    const theme = new MutationObserver(refreshTheme);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    focus();
    return {
        destroy() { events.abort(); unsubscribe(); resize.disconnect(); theme.disconnect(); },
        prepareExport() {
            exporting = true;
            const previous = store.getState(), styles = viewport.style.cssText;
            store.dispatch({ type: 'set', payload: { x: 0, y: 0, scale: 1 } });
            viewport.style.width = `${layout.width}px`;
            viewport.style.height = `${layout.height}px`;
            viewport.style.overflow = 'visible';
            return async () => {
                viewport.style.cssText = styles;
                store.dispatch({ type: 'set', payload: previous });
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                exporting = false;
            };
        }
    };
};
