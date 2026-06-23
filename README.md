# TokyoRailMap 东京铁路地图

东京都市圈铁路线网与班次信息可视化。支持浅色/深色/跟随系统模式

![浅色](./assets/readme-images/map.png)

## 在线使用

可直接通过 GitHub Pages 访问：

- [TokyoRailMap](https://blysh-ley.github.io/TokyoRailMap/)

## 功能介绍

本项目用于查看东京都市圈铁路网络与班次信息，支持线路、站点与班次的查询。

### 1) 线路高亮

左侧菜单可按运营公司或单条线路高亮展示。

![menu](./assets/readme-images/menu.png)

### 2) 站点面板与双视图

点击站点后，可查看该站的换乘线路与班次信息；支持“列表”与“一览”两种展示方式。
可在右上角的设置面板中修改。

![list](./assets/readme-images/t-list.png)
![grid](./assets/readme-images/t-grid.png)

### 3) 班次详情与直通显示

点击班次可查看该车次经由线路、停靠站点及时刻表，并支持直通车次展示。

![zhitong](./assets/readme-images/zhitong.png)

### 4) 搜索及路径规划

支持运营公司、线路与站点的搜索。

![搜索](./assets/readme-images/t-search.png)

支持两个站点之间的线路规划。

![规划](./assets/readme-images/travel.png)

### 5) 截图功能

截图功能，支持导出可以编辑的svg线路+png地图或者纯png格式图片。
支持1080P或4K分辨率。

### 6) 导出班次信息

导出班次信息的pdf文件，可以导出单独方向的，也可以导出整个车站所有线路方向的班次信息。（仅支持“一览”视图下导出）
![车次](./assets/readme-images/t-t.png)

## 数据说明

线路、站点、班次数据主要来源于 [mini-tokyo-3d](https://github.com/nagix/mini-tokyo-3d)  
线路和站点编号数据来源于 [TokyoGTFS](https://github.com/MKuranowski/TokyoGTFS) 的静态数据
部分线路班次信息源于线路官网或根据官网数据生成。

- 当前不包含实时数据；
- 班次信息仅供参考，请勿作为实际出行的唯一依据。

## License

本项目使用 MIT License。

## 隐私政策

- [TokyoRailMap 隐私政策](./privacy-policy.html)

## 声明

本项目代码主要由 AI 完成。
