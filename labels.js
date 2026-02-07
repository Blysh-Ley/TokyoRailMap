/**
 * 创建站名 DOM Marker（文字标签）。
 * 同时返回用于“圆点碰撞检测”的站点列表（按站点 id 过滤 circle layer）。
 */
export function createStationMarkers(map, maplibregl, stationsData) {
    const stationLabels = [];
    const stationCircles = [];

    if (!stationsData || !Array.isArray(stationsData.features)) {
        return { stationLabels, stationCircles };
    }

    stationsData.features.forEach((feature) => {
        if (!feature || !feature.geometry || feature.geometry.type !== 'Point') return;

        const coordinates = feature.geometry.coordinates;
        const props = feature.properties || {};
        const stationId = props.id || feature.id;
        const name = props.name;
        const servingLines = props.serving_lines;
        const servingLineIds = Array.isArray(servingLines) ? servingLines : [];
        const priority = servingLineIds.length;

        if (!Array.isArray(coordinates) || coordinates.length < 2) return;
        if (!name) return;

        const el = document.createElement('div');
        el.className = 'station-label';
        el.textContent = name;

        // 站名标签上移：换乘站 6px，非换乘站 3px（只在这里集中设置）
        const labelDyPx = priority > 1 ? 5 : 2;
        el.style.translate = `0 -${labelDyPx}px`;

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat(coordinates)
            .addTo(map);

        stationLabels.push({
            marker,
            el,
            stationId,
            coordinates,
            priority,
            servingLineIds,
            labelDyPx,
            width: null,
            height: null
        });

        if (stationId) {
            stationCircles.push({
                stationId,
                coordinates,
                priority,
                servingLineIds
            });
        }
    });

    return { stationLabels, stationCircles };
}
