// 高亮模式样式配置。
// 这个文件只放可手动调节的高亮视觉参数，渲染逻辑仍保留在各自 map 模块中。

export const HIGHLIGHT_STYLE_CONFIG = Object.freeze({
    line: Object.freeze({
        // 高亮线路在低 zoom 的最小宽度；只影响选中/高亮/preview 状态，不影响默认非高亮线路。
        minWidthAtLowZoom: 0.8,

        // 高亮线路在 zoom 12 附近的宽度；只影响选中/高亮/preview 状态。
        widthAtBaseZoom: 6,

        // 高亮线路在 zoom 16 附近的最大宽度；只影响选中/高亮/preview 状态。
        widthAtMaxZoom: 10,

        // 高亮模式下被弱化线路在低 zoom 的最小宽度；用于高亮某些线路时其他线路的灰色细线。
        lowlightMinWidthAtLowZoom: 0.3,

        // 高亮模式下被弱化线路在 zoom 12 附近的宽度。
        lowlightWidthAtBaseZoom: 1.2,

        // 高亮模式下被弱化线路在 zoom 16 附近的最大宽度。
        lowlightWidthAtMaxZoom: 1.8,

        // 高亮线路的低 zoom 最小宽度保持到哪个 zoom 后开始变粗。
        shrinkStartZoom: 6
    }),

    lineAndStation: Object.freeze({
        // 高亮线路和普通站点在 zoom 0 的最小倍率；越大，缩远时线和站点越不容易变细/变小。
        minScaleAtZoom0: 6,

        // 高亮线路和普通站点的缩放曲线指数；建议在 1.2 到 3 之间小步调整。
        zoomScaleInterpolationBase: 1.2
    }),

    transferCapsule: Object.freeze({
        // 高亮换乘胶囊外壳在 zoom 0 的最小倍率；只影响胶囊外壳和 fallback 圆胶囊，不影响胶囊里的彩色站点点。
        minScaleAtZoom0: 6,

        // 高亮换乘胶囊外壳的缩放曲线指数；数值越大，缩放曲线变化越明显。
        zoomScaleInterpolationBase: 6,

        // 普通有换乘胶囊外框线宽，[zoom 12 宽度, zoom 16 宽度]。
        outlineLineWidth: [12, 24],

        // 普通有换乘胶囊内部白色通道线宽，[zoom 12 宽度, zoom 16 宽度]。
        innerLineWidth: [8, 14],

        // 无换乘 fallback 圆胶囊外圈半径，[zoom 12 半径, zoom 16 半径]。
        fallbackOutlineRadius: [6.8, 11.5],

        // 无换乘 fallback 圆胶囊内圈半径，[zoom 12 半径, zoom 16 半径]。
        fallbackInnerRadius: [5.0, 8.6],

        highlighted: Object.freeze({
            // 高亮有换乘胶囊外框线宽，[zoom 12 宽度, zoom 16 宽度]。
            outlineLineWidth: [14, 24],

            // 高亮有换乘胶囊内部白色通道线宽，[zoom 12 宽度, zoom 16 宽度]。
            innerLineWidth: [10, 17.2]
        })
    })
});
