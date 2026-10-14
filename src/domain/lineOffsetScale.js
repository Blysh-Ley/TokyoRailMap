// 沿用线路现有的像素缩放规则，供渲染表达式和分段偏移关联几何共用。
const getExponentialInterpolationT = (progress, base, zoomSpan = 1) => {
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    const b = Number(base);
    if (!Number.isFinite(b) || b <= 0 || b === 1) return p;
    // MapLibre 的 exponential 按实际 zoom 差值插值，不能只使用归一化进度。
    return (Math.pow(b, p * zoomSpan) - 1) / (Math.pow(b, zoomSpan) - 1);
};

export const buildLineOffsetPixelStops = () => {
    const lowZoomOffsetPxPerUnit = 4;
    const zBase = 12;
    const zMax = 16;
    // feature 属性表达式的顶点缓冲按相邻整数 zoom 采样，沿用实际的 14～15 归零过渡。
    const zoomCutToZero = 15;
    const interpBase = 2;
    const widthScaleAtMaxZoom = 5 / 3.5;
    const offsetPxPerUnitAtMaxZoom = lowZoomOffsetPxPerUnit * widthScaleAtMaxZoom;
    const growthPerZoom = Math.pow(offsetPxPerUnitAtMaxZoom / lowZoomOffsetPxPerUnit, 1 / (zMax - zBase));
    const offsetPxPerUnitAtZoom0 = lowZoomOffsetPxPerUnit * Math.pow(growthPerZoom, -zBase);
    const zoom14T = getExponentialInterpolationT((14 - zBase) / (zMax - zBase), interpBase);
    const offsetPxPerUnitAtZoom14 = lowZoomOffsetPxPerUnit + (offsetPxPerUnitAtMaxZoom - lowZoomOffsetPxPerUnit) * zoom14T;

    return {
        interpBase,
        lowZoomOffsetPxPerUnit,
        offsetPxPerUnitAtZoom0,
        offsetPxPerUnitAtZoom14,
        zBase,
        zoomCutToZero
    };
};

export const getLineOffsetPixelsPerUnitAtZoom = (zoom) => {
    const z = Number(zoom);
    if (!Number.isFinite(z)) return 0;

    const {
        interpBase,
        lowZoomOffsetPxPerUnit,
        offsetPxPerUnitAtZoom0,
        offsetPxPerUnitAtZoom14,
        zBase,
        zoomCutToZero
    } = buildLineOffsetPixelStops();

    if (z <= 0) return offsetPxPerUnitAtZoom0;
    if (z <= zBase) {
        const t = getExponentialInterpolationT(z / zBase, interpBase, zBase);
        return offsetPxPerUnitAtZoom0 + (lowZoomOffsetPxPerUnit - offsetPxPerUnitAtZoom0) * t;
    }
    if (z <= 14) {
        const t = getExponentialInterpolationT((z - zBase) / (14 - zBase), interpBase, 14 - zBase);
        return lowZoomOffsetPxPerUnit + (offsetPxPerUnitAtZoom14 - lowZoomOffsetPxPerUnit) * t;
    }
    if (z >= zoomCutToZero) return 0;
    if (z <= zoomCutToZero) {
        const t = getExponentialInterpolationT((z - 14) / (zoomCutToZero - 14), interpBase, zoomCutToZero - 14);
        return offsetPxPerUnitAtZoom14 * (1 - t);
    }
    return 0;
};

