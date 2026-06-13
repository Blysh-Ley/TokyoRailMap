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

    lineBasedSizes: Object.freeze({
        // 高亮站点半径；直径会等于高亮线路宽度。
        stationRadiusScale: 0.6,

        // 高亮单线站白色描边宽度。
        stationStrokeWidthScale: 0.4,

        // 高亮换乘胶囊内的彩色点半径。
        capsuleDotRadiusScale: 0.5,

        // 高亮换乘胶囊外壳线宽。
        capsuleOutlineLineWidthScale: 2.2,

        // 高亮换乘胶囊内部白线宽度。
        capsuleInnerLineWidthScale: 1.6,

        // 高亮无换乘 fallback 圆胶囊外圆半径。
        capsuleFallbackOutlineRadiusScale: 1.2,

        // 高亮无换乘 fallback 圆胶囊内圆半径。
        capsuleFallbackInnerRadiusScale: 1
    })
});
