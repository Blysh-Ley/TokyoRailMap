import { createLineServiceDiagramViewStore } from '../store/lineServiceDiagramViewStore.js';

export const installLineServiceDiagramView = ({ root, viewport, layout, resolveColor, onMove, showFullDiagram = () => false }) => {
    const canvas = viewport.querySelector('.route-map-diagram-canvas');
    const store = createLineServiceDiagramViewStore();
    const events = new AbortController();
    const listen = (element, name, handler, options = {}) => element.addEventListener(name, handler, { ...options, signal: events.signal });
    const pointers = new Map();
    let gesture = null, suppressClick = false, exporting = false;
    const readPointers = () => {
        const [first, second] = pointers.values();
        return second ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, distance: Math.hypot(second.x - first.x, second.y - first.y) }
            : { x: first.x, y: first.y, distance: 0 };
    };
    const render = (state) => {
        canvas.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
        onMove();
    };
    const unsubscribe = store.subscribe(render);
    const focus = () => {
        const bounds = showFullDiagram()
            ? { left: 0, right: layout.width, top: 0, bottom: layout.height }
            : layout.mainBounds;
        const width = bounds.right - bounds.left;
        const height = bounds.bottom - bounds.top;
        const scale = Math.min(1, (viewport.clientWidth - 24) / width, (viewport.clientHeight - 48) / height);
        store.dispatch({ type: 'set', payload: { scale,
            x: (viewport.clientWidth - width * scale) / 2 - bounds.left * scale,
            y: (viewport.clientHeight - height * scale) / 2 - bounds.top * scale } });
    };
    const zoom = (factor, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) => store.dispatch({ type: 'zoom', payload: { factor, x, y } });
    listen(viewport, 'wheel', (event) => {
        event.preventDefault();
        const bounds = viewport.getBoundingClientRect();
        zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - bounds.left, event.clientY - bounds.top);
    }, { passive: false });
    listen(viewport, 'pointerdown', (event) => {
        if (event.button !== 0) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 1) {
            gesture = { ...readPointers(), startX: event.clientX, startY: event.clientY, moved: false };
            suppressClick = false;
        } else {
            gesture = { ...readPointers(), moved: true };
            suppressClick = true;
            onMove();
            for (const id of pointers.keys()) viewport.setPointerCapture(id);
            event.preventDefault();
        }
    });
    listen(viewport, 'pointermove', (event) => {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const next = readPointers();
        if (!gesture.moved && Math.hypot(next.x - gesture.startX, next.y - gesture.startY) < 6) return;
        gesture.moved = true;
        viewport.setPointerCapture(event.pointerId);
        if (pointers.size > 1) {
            const bounds = viewport.getBoundingClientRect();
            const factor = gesture.distance > 0 && next.distance > 0 ? next.distance / gesture.distance : 1;
            // 以两指上一帧的中点缩放，再跟随中点移动；同一次更新完成两种变换。
            store.dispatch({ type: 'zoom', payload: { factor, x: gesture.x - bounds.left, y: gesture.y - bounds.top,
                deltaX: next.x - gesture.x, deltaY: next.y - gesture.y } });
        } else store.dispatch({ type: 'move', payload: { x: next.x - gesture.x, y: next.y - gesture.y } });
        gesture = { ...gesture, ...next };
        event.preventDefault();
    });
    const endGesture = (event) => {
        if (!pointers.has(event.pointerId)) return;
        suppressClick = gesture.moved;
        pointers.delete(event.pointerId);
        // 双指结束后用剩余手指的新位置作为基准，继续单指移动时不会跳动。
        gesture = pointers.size ? { ...readPointers(), moved: gesture.moved } : null;
        if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    };
    listen(viewport, 'pointerup', endGesture);
    listen(viewport, 'pointercancel', endGesture);
    listen(viewport, 'lostpointercapture', (event) => { if (event.target === viewport) endGesture(event); });
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
        focus,
        destroy() { events.abort(); unsubscribe(); resize.disconnect(); theme.disconnect(); },
        prepareExport() {
            exporting = true;
            const previous = store.getState(), styles = viewport.style.cssText;
            const body = viewport.parentElement, rootWidth = root.style.width, bodyOverflow = body.style.overflow;
            store.dispatch({ type: 'set', payload: { x: 0, y: 0, scale: 1 } });
            viewport.style.width = `${layout.width}px`;
            viewport.style.height = `${layout.height}px`;
            viewport.style.overflow = 'visible';
            // 导出容器随完整画布展开，避免仍按面板宽度裁掉支线。
            root.style.width = `${layout.width}px`;
            body.style.overflow = 'visible';
            return async () => {
                viewport.style.cssText = styles;
                root.style.width = rootWidth;
                body.style.overflow = bodyOverflow;
                store.dispatch({ type: 'set', payload: previous });
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                exporting = false;
            };
        }
    };
};
