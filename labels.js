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
        const propsSnapshot = { ...props };
        const stationId = props.id || feature.id;
        const name = props.name_zh || props.name;
        // serving_ids：用于判断换乘站优先级（全服务线路集合）
        const servingIds = Array.isArray(props.serving_ids) ? props.serving_ids.map(String) : [];
        // platform_line_id：用于“当前高亮线路是否命中该站台/点”
        const platformIds = Array.isArray(props.platform_line_id)
            ? props.platform_line_id.map(String)
            : (servingIds.length ? servingIds : (Array.isArray(props.serving_lines) ? props.serving_lines.map(String) : []));

        const priority = servingIds.length;
        const servingLineIds = platformIds;

        if (!Array.isArray(coordinates) || coordinates.length < 2) return;
        if (!name) return;

        const el = document.createElement('div');
        el.className = 'station-label';
        el.textContent = name;

        // 站名标签上移：换乘站 6px，非换乘站 3px（只在这里集中设置）
        const labelDyPx = priority > 1 ? 6 : 3;
        el.style.translate = `0 -${labelDyPx}px`;

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat(coordinates)
            .addTo(map);

        stationLabels.push({
            marker,
            el,
            stationId,
            coordinates,
            props: propsSnapshot,
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
