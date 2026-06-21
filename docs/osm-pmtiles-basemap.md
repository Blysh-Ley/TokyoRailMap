# OSM PMTiles 底图生成与托管

本项目的 OSM 底图使用自托管 PMTiles。禁止把 `tile.openstreetmap.org` 作为应用瓦片源，也不要重新接入 Carto raster 底图。

## 生成 Kanto PMTiles

先下载 Planetiler jar，然后运行：

```bash
PLANETILER_JAR=/path/to/planetiler.jar npm run basemap:build -- --download
```

默认输入与输出：

- OSM PBF: `tiles/kanto-latest.osm.pbf`
- PMTiles: `tiles/kanto.pmtiles`
- 默认下载源：`https://download.geofabrik.de/asia/japan/kanto-latest.osm.pbf`

如果已经有 PBF，可以跳过下载：

```bash
PLANETILER_JAR=/path/to/planetiler.jar npm run basemap:build -- --osm-path=/path/to/kanto-latest.osm.pbf
```

只准备 PBF、不生成 PMTiles：

```bash
PLANETILER_JAR=/path/to/planetiler.jar npm run basemap:build -- --download --only-download
```

`tiles/` 已被 `.gitignore` 忽略，不要提交 `.osm.pbf` 或 `.pmtiles` 大文件。

## 默认在线加载

应用默认读取：

```text
./tiles/kanto.pmtiles
```

线上部署时可以在应用初始化前覆盖：

```html
<script>
  window.TOKYO_RAIL_OSM_BASEMAP_URL = 'https://your-domain.example/tiles/kanto.pmtiles';
</script>
```

托管 PMTiles 的服务器必须支持 HTTP Range requests，否则浏览器无法按需读取归档内部瓦片。

## Attribution

地图界面必须继续显示 OpenStreetMap attribution：

```text
© OpenStreetMap contributors
```

不要隐藏 attribution，也不要把它放到会被移动端 UI 遮挡的位置。

## 离线包边界

当前版本完成 PMTiles 在线按需加载、本地生成脚本，以及离线包元信息预留。运行时会读取：

- `window.TOKYO_RAIL_OSM_BASEMAP_URL`：当前底图 PMTiles 地址
- `window.TOKYO_RAIL_OSM_BASEMAP_DOWNLOAD_URL`：后续手动下载入口地址

用户手动下载离线包、校验、切换本地包路径的 UI 属于后续功能，不在本模块内实现。
