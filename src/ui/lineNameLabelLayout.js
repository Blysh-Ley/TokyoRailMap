// 只读取已有面板与站名的实际布局，不建立另一份面板或站名状态。
export const readLineNameLabelLayout = ({ canvas, mapEngine, stationLabels, overlays, win = window }) => {
    const canvasRect = canvas.getBoundingClientRect();
    const viewport = { minX: 0, minY: 0, maxX: canvas.clientWidth, maxY: canvas.clientHeight };
    const visibleRect = element => {
        if (!element?.isConnected) return null;
        for (let node = element; node; node = node.parentElement) {
            if (node.hidden || node.classList.contains('is-hidden')) return null;
            const style = win.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return null;
        }
        const rect = element.getBoundingClientRect();
        const box = { minX: Math.max(0, rect.left - canvasRect.left), minY: Math.max(0, rect.top - canvasRect.top),
            maxX: Math.min(canvas.clientWidth, rect.right - canvasRect.left), maxY: Math.min(canvas.clientHeight, rect.bottom - canvasRect.top) };
        return box.maxX > box.minX && box.maxY > box.minY ? box : null;
    };
    const occlusions = [];
    for (const { element, edge } of overlays) {
        const box = visibleRect(element);
        if (!box) continue;
        const fullWidth = box.minX <= viewport.minX && box.maxX >= viewport.maxX;
        const fullHeight = box.minY <= viewport.minY && box.maxY >= viewport.maxY;
        if (edge === 'left' && fullHeight) viewport.minX = Math.max(viewport.minX, box.maxX);
        else if (edge === 'right' && fullHeight) viewport.maxX = Math.min(viewport.maxX, box.minX);
        else if (edge === 'bottom' && fullWidth) viewport.maxY = Math.min(viewport.maxY, box.minY);
        else if (edge === 'top' && fullWidth) viewport.minY = Math.max(viewport.minY, box.maxY);
        // 折叠屏抽屉只盖住半屏，保留另一侧全高和抽屉上方的可用地图。
        else occlusions.push(box);
    }
    if (occlusions.length) viewport.occlusions = occlusions;
    const obstacles = mapEngine.getRenderedStationLabelBounds();
    // 全显示、固定和选中站名使用 DOM；原生回退时也读取这些真实框。
    for (const label of stationLabels) {
        if (!label.marker) continue;
        const box = visibleRect(label.el);
        if (box) obstacles.push({ id: label.stationId, ...box });
    }
    // 半像素以下的绘制差异不触发第二轮精排，避免自身重绘形成循环。
    const signature = [viewport.minX, viewport.minY, viewport.maxX, viewport.maxY].map(value => Math.round(value * 2)).join(',')
        + '|' + occlusions.map(box => [box.minX, box.minY, box.maxX, box.maxY].map(value => Math.round(value * 2)).join(',')).sort().join('|')
        + '|' + obstacles.map(box => `${box.id}:${[box.minX, box.minY, box.maxX, box.maxY].map(value => Math.round(value * 2)).join(',')}`).sort().join('|');
    return { viewport, obstacles, signature };
};
