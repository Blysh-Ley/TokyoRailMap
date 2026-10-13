# MapLibre 原生分段像素偏移实验

在 MapLibre GL JS 3.6.2 的原生线路渲染和查询流程中增加沿线偏移倍率。原始 GeoJSON 坐标保持不变，实际像素偏移由现有 `line-offset` 样式乘以倍率得出。

## 构建与查看

在项目根目录运行：

```sh
npm install --prefix experiments/maplibre-variable-offset
npm --prefix experiments/maplibre-variable-offset run test
python3 -m http.server 5514 --bind 127.0.0.1
```

打开 `http://127.0.0.1:5514/experiments/maplibre-variable-offset/demo.html`。需要已经安装项目依赖中的 MapLibre 3.6.2。

当前机器也可以使用已有 esbuild 包，无需重新下载：

```sh
ESBUILD_PACKAGE=/Users/blysh/.npm/_npx/702923228c2ce1e6/node_modules/esbuild node experiments/maplibre-variable-offset/build.mjs --test
```

构建脚本在系统临时目录复制未修改的 MapLibre 源码，检查和应用 `maplibre-3.6.2.patch`，分别构建主线程与 Worker，生成 `dist/maplibre-gl.js`。它不会修改原始 MapLibre 依赖。正式地图使用同一补丁构建的 vendor；`npm run web:vendor` 会重新构建，Electron、Web、Android 与 iOS 既有构建入口沿用它。`dist` 已由项目现有规则忽略。

## 使用接口

GeoJSON 源设置 `lineMetrics: true`，让瓦片保留全线进度。演示使用 `tolerance: 0`，以排除几何简化对对照测试的影响。

```js
const feature = {
    type: 'Feature',
    properties: {
        line_offset_profile: JSON.stringify([
            [0, 1],
            [0.25, 1],
            [0.75, -1],
            [1, -1]
        ])
    },
    geometry: {type: 'LineString', coordinates}
};
```

每一项是 `[沿线归一化进度, 偏移倍率]`，正负沿用原生 `line-offset` 方向。上述配置在前 25% 保持 +1，中间 50% 平滑过渡，最后 25% 保持 -1；其间使用 `3t²−2t³` 缓动。使用字符串保存可以让 Worker 和原生要素查询通过相同的属性读取曲线。

图层使用普通 `line-offset` 表达式。例如值为 12 时，曲线两端分别偏移 +12 和 -12 像素；也可以继续使用按缩放变化的表达式。曲线倍率不设整数或正负大小限制，演示滑块只是本次查看范围。

未经配置的线路保留原程序和原顶点缓冲。有配置的 bucket 增加一个浮点倍率属性，Worker 在瓦片切割后补齐过渡采样，主线程使用对应的原生线路程序。实线、渐变、虚线和纹理四种程序共用此计算。

实验能力可读取 `maplibregl.variableLineOffset === 'profile-v1'`，原有 `maplibregl.version` 保持 `3.6.2`。

## 修改位置

补丁中的逻辑集中在：

- `src/data/line_offset_profile.ts`：曲线求值、过渡采样和查询路径计算。
- `src/data/line_offset_array.ts`、`src/data/bucket/line_bucket.ts`：顶点倍率缓冲、Worker 传输和可变偏移分支。
- `src/shaders/variable_offset.ts`、`src/shaders/shaders.ts`：复用原着色器生成四种可变偏移程序。
- `src/render/draw_line.ts`、`src/render/program/program_uniforms.ts`：选择相应绘制程序并绑定倍率缓冲。
- `src/style/style_layer/line_style_layer.ts`：查询半径及随曲线变化的命中位置。
- `src/index.ts`：标识实验能力。

## 已验证与当前边界

原生测试覆盖缓动、稀疏直线采样、切割区间进度、查询几何、顶点数量对应、Worker 序列化、混合 bucket 和普通线路不分配倍率缓冲。

Playwright 的实际渲染验证覆盖桌面 1280×850 与移动视口 390×844，直线／弯道／环线与四种样式的 12 种组合，滚轮放大后点击，反向切换、旋转命中、深浅色显示和五个缩放级别。29 个过渡及真实瓦片边界样本的最大显示像素误差为 0.293 px；像素取样按像素中心统计。缩放不会由演示应用反复调用 `setData`。

这些是合成数据的独立原型验证，底层已接入正式地图；矩形配置、站点、标签、换乘连接、路线预览和 SVG 导出使用同一条曲线。尚未进行 Android 实机／Electron 验收。矢量瓦片如果要表达全线曲线，输入端同样需要保留全线切割进度；本次跨瓦片验证使用 GeoJSON 的 `lineMetrics`。尖锐折返、地形和倾斜视角尚未单独验收。

MapLibre 原有许可证随构建产物保留；原生补丁基于该版本源码独立实现。

## line-offset.json 区间配置

继续使用线路 ID 作为 key。旧数字仍表示整线偏移；对象只影响矩形匹配到的区间，范围外目标为 0。没有擅自将下列示例写入正式铁路布局。

```json
{
  "Tokyu.Toyoko": {
    "transitionMeters": 400,
    "segments": [
      { "bounds": [[139.68, 35.63], [139.75, 35.66]], "offset": 1 },
      { "bounds": [[139.62, 35.51], [139.68, 35.56]], "offset": -1 }
    ]
  },
  "JR-East.ChuoRapid": -1
}
```

- `bounds` 是两个对角点，坐标顺序为 `[经度, 纬度]`，对角点先后顺序不限。
- 按已有坐标点粗匹配，连续命中形成区间；多次进出矩形分别处理，不做精确矩形裁线。
- 重叠时后面的区间覆盖前面的区间。`offset: 0` 可局部取消偏移，偏移值可为小数。
- `transitionMeters` 为总过渡长度，默认 400 米，使用正数。过渡围绕匹配边界展开，短区间会自动缩短，使短空白仍能达到 0。
- 曲线进度按 Mercator 沿线距离保存；过渡范围以真实米数确定。原有每单位像素数及缩放规则继续生效。
- 显示子段、隐藏子段、正反方向路线、普通与多来源高亮都派生自原线路曲线。碰撞分道通过既有 `line_offset_units` 叠加到曲线上。

实验页选择“矩形区间”即可编辑单条线路的配置值，查看 `+1 → 0 → -1 → 0`、不同形状及缩放效果。正式地图需修改 `data/line-offset.json` 后重新加载。
