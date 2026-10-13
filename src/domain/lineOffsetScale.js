// 沿用线路现有的像素缩放规则，供渲染表达式和分段偏移关联几何共用。
const getExponentialInterpolationT = (progress, base) => {
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    const b = Number(base);
    if (!Number.isFinite(b) || b <= 0 || b === 1) return p;
    return (Math.pow(b, p) - 1) / (b - 1);
};

export const buildLineOffsetPixelStops = () => {
    const lowZoomOffsetPxPerUnit = 4;
    const zBase = 12;
    const zMax = 16;
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
        zBase
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
        zBase
    } = buildLineOffsetPixelStops();

    if (z <= 0) return offsetPxPerUnitAtZoom0;
    if (z <= zBase) {
        const t = getExponentialInterpolationT(z / zBase, interpBase);
        return offsetPxPerUnitAtZoom0 + (lowZoomOffsetPxPerUnit - offsetPxPerUnitAtZoom0) * t;
    }
    if (z <= 14) {
        const t = getExponentialInterpolationT((z - zBase) / (14 - zBase), interpBase);
        return lowZoomOffsetPxPerUnit + (offsetPxPerUnitAtZoom14 - lowZoomOffsetPxPerUnit) * t;
    }
    if (z >= 14.01) return 0;
    if (z <= 14.01) {
        const t = getExponentialInterpolationT((z - 14) / 0.01, interpBase);
        return offsetPxPerUnitAtZoom14 * (1 - t);
    }
    return 0;
};

