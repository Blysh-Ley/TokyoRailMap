/**
 * screenshot.js — 截图导出功能
 *
 * 点击截图按钮后，根据当前高亮的公司、线路或站点范围自动调整视图和分辨率，
 * 然后导出高质量图片（4K优先，1080p保底）。
 * 
 * 核心功能：
 * 1. 检测当前高亮范围（包括视线外的线路）
 * 2. 自动调整视图到16:9或9:16比例
 * 3. 根据线路长度智能调整缩放级别（避免超分辨率或模糊）
 * 4. 仅保留"全屏模式"下的内容（隐藏UI）
 * 5. 使用原生Canvas API导出高质量图片
 */

/**
 * 初始化截图功能
 * @param {maplibregl.Map} map - MapLibre地图实例
 * @param {Object} options - 配置选项
 * @param {Function} options.getSelectionState - 获取当前选择状态的函数
 * @param {Function} options.getLineBounds - 获取线路边界的函数
 * @param {Map} options.lineNameById - 线路ID到名称的映射
 * @param {Map} options.lineColorById - 线路ID到颜色的映射
 * @param {Function} options.getStationCoord - 获取站点坐标的函数
 */
export function initScreenshot(map, options = {}) {
    const {
        getSelectionState,
        getLineBounds,
        lineNameById = new Map(),
        lineColorById = new Map(),
        getStationCoord
    } = options;

    // 在 fullscreen-fab 左侧创建截图 FAB
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'screenshot-fab';
    fab.setAttribute('aria-label', '截图导出');

    const icon = document.createElement('img');
    icon.className = 'screenshot-fab-icon';
    icon.alt = '';
    {
        const candidates = ['./icons/camera.svg', '/icons/camera.svg'];
        let idx = 0;
        icon.src = candidates[idx];
        icon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) icon.src = candidates[idx];
        });
    }
    fab.appendChild(icon);
    document.body.appendChild(fab);

    // ---- 需要隐藏的 UI 选择器（与 fullscreen.js 相同） ----
    const UI_SELECTORS = [
        '.settings-ui',
        '.search-ui',
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
        '.screenshot-fab',  // 也隐藏自己
    ];

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

    /**
     * 计算选中项的边界框
     * @returns {{ bounds: [[number, number], [number, number]] | null, aspectRatio: number }}
     */
    function calculateSelectionBounds() {
        const state = getSelectionState ? getSelectionState() : {};
        const { selectedCompany, selectedLineId, selectedStationLineIds } = state;

        let minLng = Infinity, minLat = Infinity;
        let maxLng = -Infinity, maxLat = -Infinity;
        let hasData = false;

        // 辅助函数：更新边界
        const updateBounds = (lng, lat) => {
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
            minLng = Math.min(minLng, lng);
            minLat = Math.min(minLat, lat);
            maxLng = Math.max(maxLng, lng);
            maxLat = Math.max(maxLat, lat);
            hasData = true;
        };

        // 情况1：选中站点（通过其 serving_lines）
        if (selectedStationLineIds && selectedStationLineIds.size) {
            for (const lineId of selectedStationLineIds) {
                const bounds = getLineBounds ? getLineBounds(lineId) : null;
                if (bounds) {
                    updateBounds(bounds.minLng, bounds.minLat);
                    updateBounds(bounds.maxLng, bounds.maxLat);
                }
            }
        }
        // 情况2：选中线路
        else if (selectedLineId) {
            const bounds = getLineBounds ? getLineBounds(selectedLineId) : null;
            if (bounds) {
                updateBounds(bounds.minLng, bounds.minLat);
                updateBounds(bounds.maxLng, bounds.maxLat);
            }
        }
        // 情况3：选中公司
        else if (selectedCompany) {
            // 遍历所有线路，找到属于该公司的线路
            const source = map.getSource('lines-source');
            if (source && source._data) {
                const features = source._data.features || [];
                for (const feature of features) {
                    const company = feature?.properties?.company;
                    if (company === selectedCompany) {
                        const geom = feature.geometry;
                        if (geom && geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
                            for (const pt of geom.coordinates) {
                                if (Array.isArray(pt) && pt.length >= 2) {
                                    updateBounds(pt[0], pt[1]);
                                }
                            }
                        } else if (geom && geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
                            for (const line of geom.coordinates) {
                                if (!Array.isArray(line)) continue;
                                for (const pt of line) {
                                    if (Array.isArray(pt) && pt.length >= 2) {
                                        updateBounds(pt[0], pt[1]);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (!hasData) {
            return { bounds: null, aspectRatio: 16 / 9 };
        }

        // 计算宽高比
        const width = maxLng - minLng;
        const height = maxLat - minLat;
        const currentRatio = width / height;

        return {
            bounds: [[minLng, minLat], [maxLng, maxLat]],
            aspectRatio: currentRatio
        };
    }

    /**
     * 调整边界框以匹配目标宽高比（16:9或9:16）
     * @param {[[number, number], [number, number]]} bounds - 原始边界
     * @param {number} currentRatio - 当前宽高比
     * @returns {[[number, number], [number, number]]} - 调整后的边界
     */
    function adjustBoundsToAspectRatio(bounds, currentRatio) {
        if (!bounds) return null;

        const [[minLng, minLat], [maxLng, maxLat]] = bounds;
        const width = maxLng - minLng;
        const height = maxLat - minLat;

        // 选择目标宽高比：如果当前更宽，用16:9；如果更高，用9:16
        const targetRatio = currentRatio >= 1 ? 16 / 9 : 9 / 16;

        let newWidth = width;
        let newHeight = height;

        if (currentRatio > targetRatio) {
            // 当前更宽，需要增加高度
            newHeight = width / targetRatio;
        } else {
            // 当前更窄，需要增加宽度
            newWidth = height * targetRatio;
        }

        // 居中扩展
        const centerLng = (minLng + maxLng) / 2;
        const centerLat = (minLat + maxLat) / 2;

        return [
            [centerLng - newWidth / 2, centerLat - newHeight / 2],
            [centerLng + newWidth / 2, centerLat + newHeight / 2]
        ];
    }

    /**
     * 计算合适的导出分辨率
     * @param {[[number, number], [number, number]]} bounds - 边界框
     * @returns {{ width: number, height: number }}
     */
    function calculateExportResolution(bounds) {
        if (!bounds) {
            // 默认使用当前视图的 4K 分辨率
            return { width: 3840, height: 2160 };
        }

        const [[minLng, minLat], [maxLng, maxLat]] = bounds;
        const width = maxLng - minLng;
        const height = maxLat - minLat;
        const aspectRatio = width / height;

        // 根据线路范围决定分辨率
        // 大范围 → 使用 1080p 避免超标
        // 小范围 → 使用 4K 避免模糊
        const diagonalDegrees = Math.sqrt(width * width + height * height);

        let targetWidth, targetHeight;

        if (aspectRatio >= 1) {
            // 横向 16:9
            if (diagonalDegrees > 0.5) {
                // 大范围：1080p
                targetWidth = 1920;
                targetHeight = 1080;
            } else {
                // 小范围：4K
                targetWidth = 3840;
                targetHeight = 2160;
            }
        } else {
            // 纵向 9:16
            if (diagonalDegrees > 0.5) {
                // 大范围：1080p
                targetWidth = 1080;
                targetHeight = 1920;
            } else {
                // 小范围：4K
                targetWidth = 2160;
                targetHeight = 3840;
            }
        }

        return { width: targetWidth, height: targetHeight };
    }

    /**
     * 下载图片
     * @param {Blob} blob - 图片 Blob 对象
     * @param {string} filename - 文件名
     */
    function downloadImage(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * 执行截图
     */
    async function captureScreenshot() {
        try {
            // 1. 计算选中范围和边界
            const { bounds: rawBounds, aspectRatio } = calculateSelectionBounds();
            
            if (!rawBounds) {
                // 没有选中内容，使用当前视图
                console.log('没有选中内容，使用当前视图进行截图');
            }

            // 2. 调整边界到16:9或9:16
            const adjustedBounds = rawBounds ? adjustBoundsToAspectRatio(rawBounds, aspectRatio) : null;

            // 3. 计算导出分辨率
            const resolution = calculateExportResolution(adjustedBounds);

            // 4. 保存当前地图状态
            const originalSize = map.getCanvas().getBoundingClientRect();
            const originalCenter = map.getCenter();
            const originalZoom = map.getZoom();
            const originalBearing = map.getBearing();
            const originalPitch = map.getPitch();

            // 5. 隐藏 UI
            hideAllUI();

            // 6. 调整地图视图
            if (adjustedBounds) {
                // 使用 fitBounds 调整视图，但不带动画
                map.fitBounds(adjustedBounds, {
                    padding: 20,
                    duration: 0,
                    animate: false
                });
            }

            // 7. 等待地图渲染完成
            await new Promise(resolve => {
                const checkIdle = () => {
                    if (map.loaded() && !map.isMoving()) {
                        resolve();
                    } else {
                        requestAnimationFrame(checkIdle);
                    }
                };
                checkIdle();
            });

            // 再等待一帧确保所有绘制完成
            await new Promise(resolve => requestAnimationFrame(resolve));
            await new Promise(resolve => requestAnimationFrame(resolve));

            // 8. 导出 canvas
            const canvas = map.getCanvas();
            
            // 使用 toBlob 获取高质量图片
            await new Promise((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('截图失败：无法生成图片'));
                        return;
                    }

                    // 生成文件名
                    const state = getSelectionState ? getSelectionState() : {};
                    const { selectedLineId, selectedCompany } = state;
                    let filename = 'TokyoRailMap';
                    
                    if (selectedLineId) {
                        const name = lineNameById.get(selectedLineId) || selectedLineId;
                        filename = `TokyoRailMap_${name}`;
                    } else if (selectedCompany) {
                        filename = `TokyoRailMap_${selectedCompany}`;
                    }
                    
                    filename += `_${resolution.width}x${resolution.height}`;
                    filename += `_${new Date().toISOString().slice(0, 10)}.png`;

                    // 下载图片
                    downloadImage(blob, filename);
                    resolve();
                }, 'image/png', 0.95);
            });

            // 9. 恢复地图状态
            map.jumpTo({
                center: originalCenter,
                zoom: originalZoom,
                bearing: originalBearing,
                pitch: originalPitch
            });

            // 10. 恢复 UI
            setTimeout(() => {
                restoreAllUI();
                map.resize();
            }, 100);

            console.log('截图导出成功！');

        } catch (error) {
            console.error('截图失败:', error);
            
            // 确保恢复 UI
            restoreAllUI();
            map.resize();
            
            alert('截图失败，请重试');
        }
    }

    // ---- 绑定 FAB 点击 ----
    fab.addEventListener('click', (e) => {
        e.stopPropagation();
        captureScreenshot();
    });
}
