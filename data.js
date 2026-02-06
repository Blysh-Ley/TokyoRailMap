/**
 * 加载本地（或远程）GeoJSON。
 * 注意：需要通过 HTTP 服务器访问（不能直接双击打开 html）。
 */
export async function loadGeoJSON(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`加载失败 ${url}: ${response.status} ${response.statusText}`);
    }

    return response.json();
}
