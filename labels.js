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
